import { describe, expect, it, vi } from "vitest";
import type { SQSClient } from "@aws-sdk/client-sqs";
import {
  createQueue,
  deleteMessage,
  deleteQueue,
  getQueueAttributes,
  listQueues,
  peekMessages,
  purgeQueue,
  redriveMessages,
  restoreVisibility,
  sendMessage,
} from "./sqs";

describe("sqs data plane", () => {
  describe("getQueueAttributes", () => {
    it("maps counts, dates, and parses dlqName from RedrivePolicy", async () => {
      const send = vi.fn().mockResolvedValue({
        Attributes: {
          ApproximateNumberOfMessages: "5",
          ApproximateNumberOfMessagesNotVisible: "2",
          ApproximateNumberOfMessagesDelayed: "1",
          CreatedTimestamp: "1700000000",
          RedrivePolicy: JSON.stringify({
            deadLetterTargetArn: "arn:aws:sqs:us-east-1:000000000000:my-dlq",
            maxReceiveCount: 3,
          }),
        },
      });
      const client = { send } as unknown as SQSClient;

      const attrs = await getQueueAttributes(
        client,
        "http://localhost:4566/000000000000/orders",
      );

      expect(send).toHaveBeenCalledOnce();
      expect(send.mock.calls[0][0].input).toEqual({
        QueueUrl: "http://localhost:4566/000000000000/orders",
        AttributeNames: ["All"],
      });
      expect(attrs).toEqual({
        depth: 5,
        inFlight: 2,
        delayed: 1,
        createdTimestamp: new Date(1700000000 * 1000),
        dlqName: "my-dlq",
      });
    });

    it("handles missing or malformed RedrivePolicy gracefully without throwing", async () => {
      const send = vi.fn().mockResolvedValue({
        Attributes: {
          ApproximateNumberOfMessages: "0",
          ApproximateNumberOfMessagesNotVisible: "0",
          ApproximateNumberOfMessagesDelayed: "0",
          RedrivePolicy: "not-json",
        },
      });
      const client = { send } as unknown as SQSClient;

      const attrs = await getQueueAttributes(
        client,
        "http://localhost:4566/000000000000/orders",
      );

      expect(attrs.dlqName).toBeUndefined();
      expect(attrs.createdTimestamp).toBeUndefined();
      expect(attrs.depth).toBe(0);
      expect(attrs.inFlight).toBe(0);
      expect(attrs.delayed).toBe(0);
    });
  });

  describe("listQueues", () => {
    it("paginates via NextToken, maps URLs to summaries, fetches attributes, and sorts by name", async () => {
      const send = vi.fn().mockImplementation(async (cmd: { input: Record<string, unknown> }) => {
        if ("QueueUrl" in cmd.input) {
          const url = cmd.input.QueueUrl as string;
          if (url.includes("zeta")) {
            return {
              Attributes: {
                ApproximateNumberOfMessages: "10",
                ApproximateNumberOfMessagesNotVisible: "0",
                ApproximateNumberOfMessagesDelayed: "0",
              },
            };
          }
          if (url.includes("alpha.fifo")) {
            return {
              Attributes: {
                ApproximateNumberOfMessages: "2",
                ApproximateNumberOfMessagesNotVisible: "1",
                ApproximateNumberOfMessagesDelayed: "0",
              },
            };
          }
          return { Attributes: {} };
        }

        // ListQueuesCommand
        if (!cmd.input.NextToken) {
          return {
            QueueUrls: ["http://localhost:4566/000000000000/zeta"],
            NextToken: "token-1",
          };
        }
        if (cmd.input.NextToken === "token-1") {
          return {
            QueueUrls: ["http://localhost:4566/000000000000/alpha.fifo"],
            // no NextToken -> terminates pagination
          };
        }
        return {};
      });

      const client = { send } as unknown as SQSClient;

      const queues = await listQueues(client);

      // Should be sorted alphabetically by name: alpha.fifo, then zeta
      expect(queues).toHaveLength(2);
      expect(queues[0]).toEqual({
        url: "http://localhost:4566/000000000000/alpha.fifo",
        name: "alpha.fifo",
        isFifo: true,
        attributes: {
          depth: 2,
          inFlight: 1,
          delayed: 0,
          createdTimestamp: undefined,
          dlqName: undefined,
        },
      });
      expect(queues[1]).toEqual({
        url: "http://localhost:4566/000000000000/zeta",
        name: "zeta",
        isFifo: false,
        attributes: {
          depth: 10,
          inFlight: 0,
          delayed: 0,
          createdTimestamp: undefined,
          dlqName: undefined,
        },
      });
    });
  });

  describe("createQueue", () => {
    it("creates a standard queue without FIFO attributes", async () => {
      const send = vi.fn().mockResolvedValue({
        QueueUrl: "http://localhost:4566/000000000000/orders",
      });
      const client = { send } as unknown as SQSClient;

      const res = await createQueue(client, { name: "orders" });

      expect(send).toHaveBeenCalledOnce();
      expect(send.mock.calls[0][0].input).toEqual({
        QueueName: "orders",
      });
      expect(res).toEqual({ url: "http://localhost:4566/000000000000/orders" });
    });

    it("creates a FIFO queue with FifoQueue and ContentBasedDeduplication attributes", async () => {
      const send = vi.fn().mockResolvedValue({
        QueueUrl: "http://localhost:4566/000000000000/orders.fifo",
      });
      const client = { send } as unknown as SQSClient;

      const res = await createQueue(client, { name: "orders.fifo" });

      expect(send).toHaveBeenCalledOnce();
      expect(send.mock.calls[0][0].input).toEqual({
        QueueName: "orders.fifo",
        Attributes: {
          FifoQueue: "true",
          ContentBasedDeduplication: "true",
        },
      });
      expect(res).toEqual({ url: "http://localhost:4566/000000000000/orders.fifo" });
    });

    it("throws an error if response does not contain QueueUrl", async () => {
      const send = vi.fn().mockResolvedValue({});
      const client = { send } as unknown as SQSClient;

      await expect(createQueue(client, { name: "orders" })).rejects.toThrow(
        "CreateQueue returned no URL",
      );
    });
  });

  describe("deleteQueue, purgeQueue, deleteMessage, and sendMessage", () => {
    it("deleteQueue calls DeleteQueueCommand with QueueUrl", async () => {
      const send = vi.fn().mockResolvedValue({});
      const client = { send } as unknown as SQSClient;
      const queueUrl = "http://localhost:4566/000000000000/my-queue";

      await deleteQueue(client, queueUrl);

      expect(send).toHaveBeenCalledOnce();
      expect(send.mock.calls[0][0].input).toEqual({ QueueUrl: queueUrl });
    });

    it("purgeQueue calls PurgeQueueCommand with QueueUrl", async () => {
      const send = vi.fn().mockResolvedValue({});
      const client = { send } as unknown as SQSClient;
      const queueUrl = "http://localhost:4566/000000000000/my-queue";

      await purgeQueue(client, queueUrl);

      expect(send).toHaveBeenCalledOnce();
      expect(send.mock.calls[0][0].input).toEqual({ QueueUrl: queueUrl });
    });

    it("deleteMessage calls DeleteMessageCommand with QueueUrl and ReceiptHandle", async () => {
      const send = vi.fn().mockResolvedValue({});
      const client = { send } as unknown as SQSClient;
      const queueUrl = "http://localhost:4566/000000000000/my-queue";

      await deleteMessage(client, { queueUrl, receiptHandle: "handle-123" });

      expect(send).toHaveBeenCalledOnce();
      expect(send.mock.calls[0][0].input).toEqual({
        QueueUrl: queueUrl,
        ReceiptHandle: "handle-123",
      });
    });

    it("sendMessage sends message body and returns messageId", async () => {
      const send = vi.fn().mockResolvedValue({ MessageId: "msg-999" });
      const client = { send } as unknown as SQSClient;
      const queueUrl = "http://localhost:4566/000000000000/my-queue";

      const res = await sendMessage(client, {
        queueUrl,
        body: JSON.stringify({ hello: "world" }),
      });

      expect(send).toHaveBeenCalledOnce();
      expect(send.mock.calls[0][0].input).toEqual({
        QueueUrl: queueUrl,
        MessageBody: JSON.stringify({ hello: "world" }),
        MessageGroupId: undefined,
      });
      expect(res).toEqual({ messageId: "msg-999" });
    });

    it("sendMessage passes MessageGroupId when provided", async () => {
      const send = vi.fn().mockResolvedValue({ MessageId: "msg-1000" });
      const client = { send } as unknown as SQSClient;
      const queueUrl = "http://localhost:4566/000000000000/my-queue.fifo";

      const res = await sendMessage(client, {
        queueUrl,
        body: "fifo message",
        messageGroupId: "group-1",
      });

      expect(send).toHaveBeenCalledOnce();
      expect(send.mock.calls[0][0].input).toEqual({
        QueueUrl: queueUrl,
        MessageBody: "fifo message",
        MessageGroupId: "group-1",
      });
      expect(res).toEqual({ messageId: "msg-1000" });
    });
  });

  describe("peekMessages", () => {
    it("forwards default parameters and maps message attributes", async () => {
      const send = vi.fn().mockResolvedValue({
        Messages: [
          {
            MessageId: "msg-1",
            Body: "{\"test\": true}",
            ReceiptHandle: "handle-1",
            Attributes: {
              SentTimestamp: "1700000000000",
              ApproximateReceiveCount: "3",
              MessageGroupId: "group-a",
            },
          },
        ],
      });
      const client = { send } as unknown as SQSClient;
      const queueUrl = "http://localhost:4566/000000000000/my-queue";

      const messages = await peekMessages(client, { queueUrl });

      expect(send).toHaveBeenCalledOnce();
      expect(send.mock.calls[0][0].input).toEqual({
        QueueUrl: queueUrl,
        MaxNumberOfMessages: 10,
        VisibilityTimeout: 30,
        WaitTimeSeconds: 0,
        AttributeNames: ["All"],
      });
      expect(messages).toEqual([
        {
          messageId: "msg-1",
          body: "{\"test\": true}",
          receiptHandle: "handle-1",
          sentAt: new Date(1700000000000),
          receiveCount: 3,
          messageGroupId: "group-a",
        },
      ]);
    });

    it("forwards custom max and visibility timeout and drops incomplete messages", async () => {
      const send = vi.fn().mockResolvedValue({
        Messages: [
          { MessageId: "msg-valid", Body: "valid", ReceiptHandle: "h1" },
          { MessageId: "missing-body", ReceiptHandle: "h2" },
          { Body: "missing-id", ReceiptHandle: "h3" },
          { MessageId: "missing-handle", Body: "valid" },
        ],
      });
      const client = { send } as unknown as SQSClient;
      const queueUrl = "http://localhost:4566/000000000000/my-queue";

      const messages = await peekMessages(client, {
        queueUrl,
        max: 5,
        visibilityTimeoutSeconds: 15,
      });

      expect(send.mock.calls[0][0].input).toEqual({
        QueueUrl: queueUrl,
        MaxNumberOfMessages: 5,
        VisibilityTimeout: 15,
        WaitTimeSeconds: 0,
        AttributeNames: ["All"],
      });
      expect(messages).toHaveLength(1);
      expect(messages[0]).toEqual({
        messageId: "msg-valid",
        body: "valid",
        receiptHandle: "h1",
        sentAt: undefined,
        receiveCount: undefined,
        messageGroupId: undefined,
      });
    });
  });

  describe("restoreVisibility", () => {
    it("chunks handles into batches of 10 and sets VisibilityTimeout to 0", async () => {
      const send = vi.fn().mockResolvedValue({});
      const client = { send } as unknown as SQSClient;
      const queueUrl = "http://localhost:4566/000000000000/my-queue";
      const handles = Array.from({ length: 25 }, (_, i) => `handle-${i}`);

      await restoreVisibility(client, { queueUrl, receiptHandles: handles });

      expect(send).toHaveBeenCalledTimes(3);
      // First batch: 10
      expect(send.mock.calls[0][0].input.QueueUrl).toBe(queueUrl);
      expect(send.mock.calls[0][0].input.Entries).toHaveLength(10);
      expect(send.mock.calls[0][0].input.Entries[0]).toEqual({
        Id: "m0",
        ReceiptHandle: "handle-0",
        VisibilityTimeout: 0,
      });
      // Second batch: 10
      expect(send.mock.calls[1][0].input.Entries).toHaveLength(10);
      // Third batch: 5
      expect(send.mock.calls[2][0].input.Entries).toHaveLength(5);
      expect(send.mock.calls[2][0].input.Entries[4]).toEqual({
        Id: "m4",
        ReceiptHandle: "handle-24",
        VisibilityTimeout: 0,
      });
    });

    it("does nothing when receiptHandles is empty", async () => {
      const send = vi.fn().mockResolvedValue({});
      const client = { send } as unknown as SQSClient;
      const queueUrl = "http://localhost:4566/000000000000/my-queue";

      await restoreVisibility(client, { queueUrl, receiptHandles: [] });

      expect(send).not.toHaveBeenCalled();
    });
  });

  describe("redriveMessages", () => {
    it("receives messages, resends to target with FIFO group ID, deletes from source, and returns moved count", async () => {
      let receivedOnce = false;
      const calls: Array<{ command: string; input: Record<string, unknown> }> = [];
      const send = vi.fn().mockImplementation(async (cmd: { constructor: { name: string }; input: Record<string, unknown> }) => {
        const cmdName = cmd.constructor.name;
        calls.push({ command: cmdName, input: cmd.input });

        if (cmdName === "ReceiveMessageCommand") {
          if (!receivedOnce) {
            receivedOnce = true;
            return {
              Messages: [
                {
                  MessageId: "msg-1",
                  Body: "{\"order\": 1}",
                  ReceiptHandle: "rcpt-1",
                  Attributes: { MessageGroupId: "grp-custom" },
                },
                {
                  MessageId: "msg-2",
                  Body: "{\"order\": 2}",
                  ReceiptHandle: "rcpt-2",
                },
              ],
            };
          }
          return { Messages: [] };
        }
        if (cmdName === "SendMessageCommand") {
          return { MessageId: "new-" + Math.random() };
        }
        if (cmdName === "DeleteMessageBatchCommand") {
          return {};
        }
        return {};
      });

      const client = { send } as unknown as SQSClient;
      const sourceUrl = "http://localhost:4566/000000000000/orders-dlq";
      const targetUrl = "http://localhost:4566/000000000000/orders.fifo";

      const result = await redriveMessages(client, { sourceUrl, targetUrl });

      expect(result).toEqual({ moved: 2 });

      // Receive 1
      expect(calls[0].command).toBe("ReceiveMessageCommand");
      expect(calls[0].input).toEqual({
        QueueUrl: sourceUrl,
        MaxNumberOfMessages: 10,
        VisibilityTimeout: 30,
        WaitTimeSeconds: 0,
        AttributeNames: ["All"],
      });

      // Send msg 1 (preserved group id)
      expect(calls[1].command).toBe("SendMessageCommand");
      expect(calls[1].input).toEqual({
        QueueUrl: targetUrl,
        MessageBody: "{\"order\": 1}",
        MessageGroupId: "grp-custom",
      });

      // Send msg 2 (fallback "redrive" group id for fifo target)
      expect(calls[2].command).toBe("SendMessageCommand");
      expect(calls[2].input).toEqual({
        QueueUrl: targetUrl,
        MessageBody: "{\"order\": 2}",
        MessageGroupId: "redrive",
      });

      // Batch delete on source
      expect(calls[3].command).toBe("DeleteMessageBatchCommand");
      expect(calls[3].input).toEqual({
        QueueUrl: sourceUrl,
        Entries: [
          { Id: "m0", ReceiptHandle: "rcpt-1" },
          { Id: "m1", ReceiptHandle: "rcpt-2" },
        ],
      });

      // Receive 2 (returns empty, breaking loop)
      expect(calls[4].command).toBe("ReceiveMessageCommand");
    });

    it("respects max parameter and avoids FIFO group id for standard target", async () => {
      const calls: Array<{ command: string; input: Record<string, unknown> }> = [];
      const send = vi.fn().mockImplementation(async (cmd: { constructor: { name: string }; input: Record<string, unknown> }) => {
        const cmdName = cmd.constructor.name;
        calls.push({ command: cmdName, input: cmd.input });

        if (cmdName === "ReceiveMessageCommand") {
          return {
            Messages: [
              {
                MessageId: "msg-1",
                Body: "plain",
                ReceiptHandle: "rcpt-1",
              },
            ],
          };
        }
        return {};
      });

      const client = { send } as unknown as SQSClient;
      const sourceUrl = "http://localhost:4566/000000000000/orders-dlq";
      const targetUrl = "http://localhost:4566/000000000000/orders";

      const result = await redriveMessages(client, {
        sourceUrl,
        targetUrl,
        max: 1,
      });

      expect(result).toEqual({ moved: 1 });
      expect(calls[0].input.MaxNumberOfMessages).toBe(1);
      expect(calls[1].command).toBe("SendMessageCommand");
      expect(calls[1].input.MessageGroupId).toBeUndefined();
      expect(calls[2].command).toBe("DeleteMessageBatchCommand");
      // Did not call ReceiveMessage a second time because moved reached max
      expect(calls).toHaveLength(3);
    });
  });
});
