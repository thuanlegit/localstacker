import { describe, it, expect, vi } from "vitest";
import type { SNSClient } from "@aws-sdk/client-sns";
import {
  listTopics,
  getTopicAttributes,
  listSubscriptions,
  createTopic,
  deleteTopic,
  publishMessage,
  subscribe,
} from "./sns";

describe("sns data plane", () => {
  describe("listTopics", () => {
    it("paginates and maps topics with name and isFifo parsed from ARN, sorted by name", async () => {
      const send = vi
        .fn()
        .mockResolvedValueOnce({
          Topics: [
            { TopicArn: "arn:aws:sns:us-east-1:000000000000:zebra" },
            { TopicArn: "arn:aws:sns:us-east-1:000000000000:alpha.fifo" },
          ],
          NextToken: "token-1",
        })
        .mockResolvedValueOnce({
          Topics: [{ TopicArn: "arn:aws:sns:us-east-1:000000000000:beta" }],
        });

      const client = { send } as unknown as SNSClient;
      const topics = await listTopics(client);

      expect(send).toHaveBeenCalledTimes(2);
      expect(topics).toEqual([
        {
          arn: "arn:aws:sns:us-east-1:000000000000:alpha.fifo",
          name: "alpha.fifo",
          isFifo: true,
        },
        {
          arn: "arn:aws:sns:us-east-1:000000000000:beta",
          name: "beta",
          isFifo: false,
        },
        {
          arn: "arn:aws:sns:us-east-1:000000000000:zebra",
          name: "zebra",
          isFifo: false,
        },
      ]);
    });

    it("handles empty topics", async () => {
      const send = vi.fn().mockResolvedValueOnce({});
      const client = { send } as unknown as SNSClient;
      const topics = await listTopics(client);
      expect(topics).toEqual([]);
    });
  });

  describe("getTopicAttributes", () => {
    it("maps display name, confirmed count, and pending count", async () => {
      const send = vi.fn().mockResolvedValueOnce({
        Attributes: {
          DisplayName: "My Notification Topic",
          SubscriptionsConfirmed: "5",
          SubscriptionsPending: "2",
        },
      });

      const client = { send } as unknown as SNSClient;
      const attrs = await getTopicAttributes(
        client,
        "arn:aws:sns:us-east-1:000000000000:my-topic",
      );

      expect(attrs).toEqual({
        displayName: "My Notification Topic",
        subscriptionsConfirmed: 5,
        subscriptionsPending: 2,
      });
    });

    it("handles missing attributes gracefully", async () => {
      const send = vi.fn().mockResolvedValueOnce({});
      const client = { send } as unknown as SNSClient;
      const attrs = await getTopicAttributes(
        client,
        "arn:aws:sns:us-east-1:000000000000:my-topic",
      );

      expect(attrs).toEqual({
        displayName: undefined,
        subscriptionsConfirmed: 0,
        subscriptionsPending: 0,
      });
    });
  });

  describe("listSubscriptions", () => {
    it("paginates and flags pending confirmation subscriptions", async () => {
      const send = vi
        .fn()
        .mockResolvedValueOnce({
          Subscriptions: [
            {
              SubscriptionArn:
                "arn:aws:sns:us-east-1:000000000000:my-topic:sub-1",
              Protocol: "sqs",
              Endpoint: "arn:aws:sqs:us-east-1:000000000000:my-queue",
            },
            {
              SubscriptionArn: "PendingConfirmation",
              Protocol: "email",
              Endpoint: "user@example.com",
            },
          ],
          NextToken: "next-sub",
        })
        .mockResolvedValueOnce({
          Subscriptions: [
            {
              SubscriptionArn:
                "arn:aws:sns:us-east-1:000000000000:my-topic:sub-2",
              Protocol: "https",
              Endpoint: "https://example.com/webhook",
            },
          ],
        });

      const client = { send } as unknown as SNSClient;
      const subs = await listSubscriptions(
        client,
        "arn:aws:sns:us-east-1:000000000000:my-topic",
      );

      expect(send).toHaveBeenCalledTimes(2);
      expect(subs).toEqual([
        {
          arn: "arn:aws:sns:us-east-1:000000000000:my-topic:sub-1",
          protocol: "sqs",
          endpoint: "arn:aws:sqs:us-east-1:000000000000:my-queue",
          isPending: false,
        },
        {
          arn: "PendingConfirmation",
          protocol: "email",
          endpoint: "user@example.com",
          isPending: true,
        },
        {
          arn: "arn:aws:sns:us-east-1:000000000000:my-topic:sub-2",
          protocol: "https",
          endpoint: "https://example.com/webhook",
          isPending: false,
        },
      ]);
    });
  });

  describe("createTopic and deleteTopic", () => {
    it("creates standard topic", async () => {
      const send = vi.fn().mockResolvedValueOnce({
        TopicArn: "arn:aws:sns:us-east-1:000000000000:events",
      });
      const client = { send } as unknown as SNSClient;
      const res = await createTopic(client, { name: "events" });
      expect(res.arn).toBe("arn:aws:sns:us-east-1:000000000000:events");
      expect(send).toHaveBeenCalledWith(
        expect.objectContaining({
          input: {
            Name: "events",
            Attributes: undefined,
          },
        }),
      );
    });

    it("creates FIFO topic with FifoTopic attribute", async () => {
      const send = vi.fn().mockResolvedValueOnce({
        TopicArn: "arn:aws:sns:us-east-1:000000000000:events.fifo",
      });
      const client = { send } as unknown as SNSClient;
      const res = await createTopic(client, { name: "events.fifo", fifo: true });
      expect(res.arn).toBe("arn:aws:sns:us-east-1:000000000000:events.fifo");
      expect(send).toHaveBeenCalledWith(
        expect.objectContaining({
          input: {
            Name: "events.fifo",
            Attributes: { FifoTopic: "true" },
          },
        }),
      );
    });

    it("throws if createTopic returns no ARN", async () => {
      const send = vi.fn().mockResolvedValueOnce({});
      const client = { send } as unknown as SNSClient;
      await expect(createTopic(client, { name: "fail" })).rejects.toThrow(
        "CreateTopic returned no ARN",
      );
    });

    it("deletes topic via DeleteTopicCommand", async () => {
      const send = vi.fn().mockResolvedValueOnce({});
      const client = { send } as unknown as SNSClient;
      await deleteTopic(client, "arn:aws:sns:us-east-1:000000000000:events");
      expect(send).toHaveBeenCalledWith(
        expect.objectContaining({
          input: {
            TopicArn: "arn:aws:sns:us-east-1:000000000000:events",
          },
        }),
      );
    });
  });

  describe("publishMessage", () => {
    it("publishes message with subject, messageGroupId, and attributes", async () => {
      const send = vi.fn().mockResolvedValueOnce({
        MessageId: "msg-12345",
      });
      const client = { send } as unknown as SNSClient;

      const res = await publishMessage(client, {
        topicArn: "arn:aws:sns:us-east-1:000000000000:events.fifo",
        message: '{"status":"ok"}',
        subject: "Status Update",
        messageGroupId: "grp-1",
        messageAttributes: {
          env: { DataType: "String", StringValue: "prod" },
        },
      });

      expect(res.messageId).toBe("msg-12345");
      expect(send).toHaveBeenCalledWith(
        expect.objectContaining({
          input: {
            TopicArn: "arn:aws:sns:us-east-1:000000000000:events.fifo",
            Message: '{"status":"ok"}',
            Subject: "Status Update",
            MessageGroupId: "grp-1",
            MessageAttributes: {
              env: { DataType: "String", StringValue: "prod" },
            },
          },
        }),
      );
    });
  });

  describe("subscribe", () => {
    it("subscribes endpoint to topic", async () => {
      const send = vi.fn().mockResolvedValueOnce({
        SubscriptionArn: "arn:aws:sns:us-east-1:000000000000:events:sub-1",
      });
      const client = { send } as unknown as SNSClient;

      const res = await subscribe(client, {
        topicArn: "arn:aws:sns:us-east-1:000000000000:events",
        protocol: "sqs",
        endpoint: "arn:aws:sqs:us-east-1:000000000000:events-queue",
      });

      expect(res.subscriptionArn).toBe(
        "arn:aws:sns:us-east-1:000000000000:events:sub-1",
      );
      expect(send).toHaveBeenCalledWith(
        expect.objectContaining({
          input: {
            TopicArn: "arn:aws:sns:us-east-1:000000000000:events",
            Protocol: "sqs",
            Endpoint: "arn:aws:sqs:us-east-1:000000000000:events-queue",
          },
        }),
      );
    });
  });
});
