import { describe, it, expect, vi } from "vitest";
import type { CloudFormationClient } from "@aws-sdk/client-cloudformation";
import {
  listStacks,
  describeStack,
  getTemplate,
  listStackEvents,
  listStackResources,
  deleteStack,
} from "./cloudformation";

describe("cloudformation data plane", () => {
  describe("listStacks", () => {
    it("filters deleted stacks and maps summaries", async () => {
      const send = vi.fn().mockResolvedValueOnce({
        StackSummaries: [
          {
            StackId: "arn:1",
            StackName: "orders",
            StackStatus: "CREATE_COMPLETE",
            CreationTime: new Date("2026-01-01T00:00:00Z"),
          },
          {
            StackId: "arn:2",
            StackName: "old",
            StackStatus: "DELETE_COMPLETE",
            CreationTime: new Date("2026-01-01T00:00:00Z"),
          },
        ],
      });
      const client = { send } as unknown as CloudFormationClient;
      const stacks = await listStacks(client);

      expect(stacks).toHaveLength(1);
      expect(stacks[0]).toMatchObject({
        stackId: "arn:1",
        name: "orders",
        status: "CREATE_COMPLETE",
      });
    });

    it("paginates by NextToken", async () => {
      const send = vi
        .fn()
        .mockResolvedValueOnce({
          StackSummaries: [
            { StackId: "arn:1", StackName: "a", StackStatus: "CREATE_COMPLETE" },
          ],
          NextToken: "t1",
        })
        .mockResolvedValueOnce({
          StackSummaries: [
            { StackId: "arn:2", StackName: "b", StackStatus: "REVIEW_IN_PROGRESS" },
          ],
        });
      const client = { send } as unknown as CloudFormationClient;
      const stacks = await listStacks(client);

      expect(send).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({ input: { NextToken: "t1" } }),
      );
      expect(stacks).toHaveLength(2);
    });
  });

  describe("describeStack", () => {
    it("maps stack detail with outputs", async () => {
      const send = vi.fn().mockResolvedValueOnce({
        Stacks: [
          {
            StackId: "arn:1",
            StackName: "orders",
            StackStatus: "CREATE_COMPLETE",
            Outputs: [{ OutputKey: "Arn", OutputValue: "arn:topic" }],
            Description: "test stack",
          },
        ],
      });
      const client = { send } as unknown as CloudFormationClient;
      const detail = await describeStack(client, "orders");

      expect(detail).toMatchObject({
        stackId: "arn:1",
        name: "orders",
        status: "CREATE_COMPLETE",
        description: "test stack",
      });
      expect(detail.outputs).toEqual([
        { key: "Arn", value: "arn:topic" },
      ]);
    });

    it("throws when the stack is missing", async () => {
      const send = vi.fn().mockResolvedValueOnce({ Stacks: [] });
      const client = { send } as unknown as CloudFormationClient;
      await expect(describeStack(client, "nope")).rejects.toThrow(/stack/i);
    });
  });

  describe("template, events, resources", () => {
    it("returns the template body as a string", async () => {
      const send = vi.fn().mockResolvedValueOnce({
        TemplateBody: '{"Resources":{}}',
      });
      const client = { send } as unknown as CloudFormationClient;
      const body = await getTemplate(client, "orders");
      expect(send).toHaveBeenCalledWith(
        expect.objectContaining({ input: { StackName: "orders" } }),
      );
      expect(body).toBe('{"Resources":{}}');
    });

    it("lists events newest-first", async () => {
      const t1 = new Date("2026-01-01T00:00:00Z");
      const t2 = new Date("2026-01-01T00:01:00Z");
      const send = vi.fn().mockResolvedValueOnce({
        StackEvents: [
          { EventId: "e1", ResourceType: "AWS::SNS::Topic", ResourceStatus: "CREATE_COMPLETE", Timestamp: t2 },
          { EventId: "e2", ResourceType: "AWS::CloudFormation::Stack", ResourceStatus: "CREATE_IN_PROGRESS", Timestamp: t1 },
        ],
      });
      const client = { send } as unknown as CloudFormationClient;
      const events = await listStackEvents(client, "orders");
      expect(events[0].eventId).toBe("e1");
      expect(events[0].timestamp).toEqual(t2);
    });

    it("lists stack resources", async () => {
      const send = vi.fn().mockResolvedValueOnce({
        StackResourceSummaries: [
          {
            LogicalResourceId: "Topic",
            PhysicalResourceId: "arn:topic",
            ResourceType: "AWS::SNS::Topic",
            ResourceStatus: "CREATE_COMPLETE",
          },
        ],
      });
      const client = { send } as unknown as CloudFormationClient;
      const resources = await listStackResources(client, "orders");
      expect(resources).toEqual([
        {
          logicalId: "Topic",
          physicalId: "arn:topic",
          resourceType: "AWS::SNS::Topic",
          status: "CREATE_COMPLETE",
        },
      ]);
    });
  });

  describe("deleteStack", () => {
    it("deletes by stack name", async () => {
      const send = vi.fn().mockResolvedValueOnce({});
      const client = { send } as unknown as CloudFormationClient;
      await deleteStack(client, "orders");
      expect(send).toHaveBeenCalledWith(
        expect.objectContaining({ input: { StackName: "orders" } }),
      );
    });
  });
});
