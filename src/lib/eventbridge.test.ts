import { describe, it, expect, vi } from "vitest";
import type { EventBridgeClient } from "@aws-sdk/client-eventbridge";
import {
  listEventBuses,
  createEventBus,
  deleteEventBus,
  listRules,
  putRule,
  deleteRule,
  setRuleState,
  listRuleTargets,
  putRuleTargets,
  removeRuleTargets,
  putEvents,
} from "./eventbridge";

describe("eventbridge data plane", () => {
  describe("listEventBuses", () => {
    it("paginates and maps buses with name, arn, and dates, sorted by name", async () => {
      const created = new Date("2026-01-02T03:04:05Z");
      const modified = new Date("2026-02-03T04:05:06Z");
      const send = vi
        .fn()
        .mockResolvedValueOnce({
          EventBuses: [
            { Name: "zebra", Arn: "arn:aws:events:us-east-1:000000000000:event-bus/zebra" },
            {
              Name: "default",
              Arn: "arn:aws:events:us-east-1:000000000000:event-bus/default",
              CreationTime: created,
              LastModifiedTime: modified,
            },
          ],
          NextToken: "token-1",
        })
        .mockResolvedValueOnce({
          EventBuses: [{ Name: "alpha", Arn: "arn:aws:events:us-east-1:000000000000:event-bus/alpha" }],
        });

      const client = { send } as unknown as EventBridgeClient;
      const buses = await listEventBuses(client);

      expect(send).toHaveBeenCalledTimes(2);
      expect(send).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({ input: { NextToken: "token-1" } }),
      );
      expect(buses).toEqual([
        { name: "alpha", arn: "arn:aws:events:us-east-1:000000000000:event-bus/alpha" },
        { name: "default", arn: "arn:aws:events:us-east-1:000000000000:event-bus/default", creationTime: created, lastModifiedTime: modified },
        { name: "zebra", arn: "arn:aws:events:us-east-1:000000000000:event-bus/zebra" },
      ]);
    });

    it("handles empty buses", async () => {
      const send = vi.fn().mockResolvedValueOnce({});
      const client = { send } as unknown as EventBridgeClient;
      const buses = await listEventBuses(client);
      expect(buses).toEqual([]);
    });
  });

  describe("createEventBus", () => {
    it("creates a bus and returns its ARN", async () => {
      const send = vi.fn().mockResolvedValueOnce({
        EventBusArn: "arn:aws:events:us-east-1:000000000000:event-bus/demo",
      });
      const client = { send } as unknown as EventBridgeClient;

      const res = await createEventBus(client, { name: "demo" });

      expect(send).toHaveBeenCalledWith(
        expect.objectContaining({ input: { Name: "demo" } }),
      );
      expect(res).toEqual({ arn: "arn:aws:events:us-east-1:000000000000:event-bus/demo" });
    });

    it("throws if CreateEventBus returns no ARN", async () => {
      const send = vi.fn().mockResolvedValueOnce({});
      const client = { send } as unknown as EventBridgeClient;
      await expect(createEventBus(client, { name: "demo" })).rejects.toThrow(
        "CreateEventBus returned no ARN",
      );
    });
  });

  it("deletes a bus by name", async () => {
    const send = vi.fn().mockResolvedValueOnce({});
    const client = { send } as unknown as EventBridgeClient;

    await deleteEventBus(client, "demo");

    expect(send).toHaveBeenCalledWith(
      expect.objectContaining({ input: { Name: "demo" } }),
    );
  });

  describe("listRules", () => {
    it("paginates and maps rules on the bus, sorted by name", async () => {
      const send = vi
        .fn()
        .mockResolvedValueOnce({
          Rules: [
            {
              Name: "z-rule",
              Arn: "arn:aws:events:us-east-1:000000000000:rule/demo/z-rule",
              State: "DISABLED",
              ScheduleExpression: "rate(5 minutes)",
              Description: "zdesc",
            },
            {
              Name: "a-rule",
              Arn: "arn:aws:events:us-east-1:000000000000:rule/demo/a-rule",
              State: "ENABLED",
              EventPattern: '{"source":["demo"]}',
            },
          ],
          NextToken: "token-1",
        })
        .mockResolvedValueOnce({
          Rules: [
            {
              Name: "m-rule",
              Arn: "arn:aws:events:us-east-1:000000000000:rule/demo/m-rule",
            },
          ],
        });

      const client = { send } as unknown as EventBridgeClient;
      const rules = await listRules(client, "demo");

      expect(send).toHaveBeenCalledTimes(2);
      expect(send).toHaveBeenNthCalledWith(
        1,
        expect.objectContaining({ input: { EventBusName: "demo" } }),
      );
      expect(rules).toEqual([
        {
          name: "a-rule",
          arn: "arn:aws:events:us-east-1:000000000000:rule/demo/a-rule",
          state: "ENABLED",
          eventPattern: '{"source":["demo"]}',
        },
        {
          name: "m-rule",
          arn: "arn:aws:events:us-east-1:000000000000:rule/demo/m-rule",
          state: "ENABLED",
        },
        {
          name: "z-rule",
          arn: "arn:aws:events:us-east-1:000000000000:rule/demo/z-rule",
          state: "DISABLED",
          scheduleExpression: "rate(5 minutes)",
          description: "zdesc",
        },
      ]);
    });

    it("handles empty rules", async () => {
      const send = vi.fn().mockResolvedValueOnce({});
      const client = { send } as unknown as EventBridgeClient;
      expect(await listRules(client, "demo")).toEqual([]);
    });
  });

  describe("putRule", () => {
    it("puts a pattern rule with bus, state, and description", async () => {
      const send = vi.fn().mockResolvedValueOnce({
        RuleArn: "arn:aws:events:us-east-1:000000000000:rule/demo/a-rule",
      });
      const client = { send } as unknown as EventBridgeClient;

      const res = await putRule(client, {
        busName: "demo",
        name: "a-rule",
        eventPattern: '{"source":["demo"]}',
        state: "ENABLED",
        description: "desc",
      });

      expect(send).toHaveBeenCalledWith(
        expect.objectContaining({
          input: {
            Name: "a-rule",
            EventBusName: "demo",
            EventPattern: '{"source":["demo"]}',
            ScheduleExpression: undefined,
            State: "ENABLED",
            Description: "desc",
          },
        }),
      );
      expect(res).toEqual({ arn: "arn:aws:events:us-east-1:000000000000:rule/demo/a-rule" });
    });

    it("puts a schedule rule", async () => {
      const send = vi.fn().mockResolvedValueOnce({
        RuleArn: "arn:aws:events:us-east-1:000000000000:rule/demo/s-rule",
      });
      const client = { send } as unknown as EventBridgeClient;

      const res = await putRule(client, {
        busName: "demo",
        name: "s-rule",
        scheduleExpression: "rate(5 minutes)",
        state: "DISABLED",
      });

      expect(send).toHaveBeenCalledWith(
        expect.objectContaining({
          input: {
            Name: "s-rule",
            EventBusName: "demo",
            EventPattern: undefined,
            ScheduleExpression: "rate(5 minutes)",
            State: "DISABLED",
            Description: undefined,
          },
        }),
      );
      expect(res).toEqual({ arn: "arn:aws:events:us-east-1:000000000000:rule/demo/s-rule" });
    });
  });

  it("deletes a rule by name and bus", async () => {
    const send = vi.fn().mockResolvedValueOnce({});
    const client = { send } as unknown as EventBridgeClient;

    await deleteRule(client, { busName: "demo", name: "a-rule" });

    expect(send).toHaveBeenCalledWith(
      expect.objectContaining({ input: { Name: "a-rule", EventBusName: "demo" } }),
    );
  });

  describe("setRuleState", () => {
    it("enables a rule", async () => {
      const send = vi.fn().mockResolvedValueOnce({});
      const client = { send } as unknown as EventBridgeClient;

      await setRuleState(client, { busName: "demo", name: "a-rule", enabled: true });

      expect(send).toHaveBeenCalledWith(
        expect.objectContaining({ input: { Name: "a-rule", EventBusName: "demo" } }),
      );
    });

    it("disables a rule", async () => {
      const send = vi.fn().mockResolvedValueOnce({});
      const client = { send } as unknown as EventBridgeClient;

      await setRuleState(client, { busName: "demo", name: "a-rule", enabled: false });

      expect(send).toHaveBeenCalledWith(
        expect.objectContaining({ input: { Name: "a-rule", EventBusName: "demo" } }),
      );
    });
  });

  describe("listRuleTargets", () => {
    it("paginates and maps targets with id, arn, and input", async () => {
      const send = vi
        .fn()
        .mockResolvedValueOnce({
          Targets: [
            { Id: "t1", Arn: "arn:aws:sqs:us-east-1:000000000000:q1" },
            { Id: "t2", Arn: "arn:aws:lambda:us-east-1:000000000000:fn:1", Input: '{"k":1}' },
          ],
          NextToken: "token-1",
        })
        .mockResolvedValueOnce({
          Targets: [{ Id: "t3", Arn: "arn:aws:sns:us-east-1:000000000000:topic" }],
        });

      const client = { send } as unknown as EventBridgeClient;
      const targets = await listRuleTargets(client, { busName: "demo", rule: "a-rule" });

      expect(send).toHaveBeenCalledTimes(2);
      expect(send).toHaveBeenNthCalledWith(
        1,
        expect.objectContaining({ input: { Rule: "a-rule", EventBusName: "demo" } }),
      );
      expect(send).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({ input: { Rule: "a-rule", EventBusName: "demo", NextToken: "token-1" } }),
      );
      expect(targets).toEqual([
        { id: "t1", arn: "arn:aws:sqs:us-east-1:000000000000:q1" },
        { id: "t2", arn: "arn:aws:lambda:us-east-1:000000000000:fn:1", input: '{"k":1}' },
        { id: "t3", arn: "arn:aws:sns:us-east-1:000000000000:topic" },
      ]);
    });

    it("handles empty targets", async () => {
      const send = vi.fn().mockResolvedValueOnce({});
      const client = { send } as unknown as EventBridgeClient;
      expect(await listRuleTargets(client, { busName: "demo", rule: "a-rule" })).toEqual([]);
    });
  });

  describe("putRuleTargets", () => {
    it("puts targets on a rule", async () => {
      const send = vi.fn().mockResolvedValueOnce({ FailedEntryCount: 0, FailedEntries: [] });
      const client = { send } as unknown as EventBridgeClient;

      await putRuleTargets(client, {
        busName: "demo",
        rule: "a-rule",
        targets: [
          { id: "t1", arn: "arn:aws:sqs:us-east-1:000000000000:q1" },
          { id: "t2", arn: "arn:aws:sns:us-east-1:000000000000:topic", input: '{"k":1}' },
        ],
      });

      expect(send).toHaveBeenCalledWith(
        expect.objectContaining({
          input: {
            Rule: "a-rule",
            EventBusName: "demo",
            Targets: [
              { Id: "t1", Arn: "arn:aws:sqs:us-east-1:000000000000:q1", Input: undefined },
              { Id: "t2", Arn: "arn:aws:sns:us-east-1:000000000000:topic", Input: '{"k":1}' },
            ],
          },
        }),
      );
    });

    it("throws with the first failed entry when entries fail", async () => {
      const send = vi.fn().mockResolvedValueOnce({
        FailedEntryCount: 1,
        FailedEntries: [{ ErrorCode: "E1", ErrorMessage: "boom" }],
      });
      const client = { send } as unknown as EventBridgeClient;

      await expect(
        putRuleTargets(client, {
          busName: "demo",
          rule: "a-rule",
          targets: [{ id: "t1", arn: "arn:aws:sqs:us-east-1:000000000000:q1" }],
        }),
      ).rejects.toThrow("PutTargets failed: E1: boom");
    });
  });

  describe("removeRuleTargets", () => {
    it("removes targets by id", async () => {
      const send = vi.fn().mockResolvedValueOnce({ FailedEntryCount: 0, FailedEntries: [] });
      const client = { send } as unknown as EventBridgeClient;

      await removeRuleTargets(client, { busName: "demo", rule: "a-rule", ids: ["t1", "t2"] });

      expect(send).toHaveBeenCalledWith(
        expect.objectContaining({
          input: { Rule: "a-rule", EventBusName: "demo", Ids: ["t1", "t2"] },
        }),
      );
    });

    it("throws with the first failed entry when entries fail", async () => {
      const send = vi.fn().mockResolvedValueOnce({
        FailedEntryCount: 1,
        FailedEntries: [{ ErrorCode: "E2", ErrorMessage: "nope" }],
      });
      const client = { send } as unknown as EventBridgeClient;

      await expect(
        removeRuleTargets(client, { busName: "demo", rule: "a-rule", ids: ["t1"] }),
      ).rejects.toThrow("RemoveTargets failed: E2: nope");
    });
  });

  describe("putEvents", () => {
    it("publishes one entry with the raw detail string and returns the event id", async () => {
      const send = vi.fn().mockResolvedValueOnce({
        FailedEntryCount: 0,
        Entries: [{ EventId: "evt-1" }],
      });
      const client = { send } as unknown as EventBridgeClient;

      const res = await putEvents(client, {
        busName: "demo",
        source: "com.localstacker.demo",
        detailType: "order.placed",
        detail: '{"match":"yes"}',
      });

      expect(send).toHaveBeenCalledWith(
        expect.objectContaining({
          input: {
            Entries: [
              {
                EventBusName: "demo",
                Source: "com.localstacker.demo",
                DetailType: "order.placed",
                Detail: '{"match":"yes"}',
              },
            ],
          },
        }),
      );
      expect(res).toEqual({ eventId: "evt-1" });
    });

    it("throws when the entry fails", async () => {
      const send = vi.fn().mockResolvedValueOnce({
        FailedEntryCount: 1,
        Entries: [{ ErrorCode: "InternalFailure", ErrorMessage: "bad bus" }],
      });
      const client = { send } as unknown as EventBridgeClient;

      await expect(
        putEvents(client, {
          busName: "demo",
          source: "s",
          detailType: "t",
          detail: "{}",
        }),
      ).rejects.toThrow("PutEvents failed: InternalFailure: bad bus");
    });

    it("throws when no entry is returned", async () => {
      const send = vi.fn().mockResolvedValueOnce({ Entries: [] });
      const client = { send } as unknown as EventBridgeClient;

      await expect(
        putEvents(client, { busName: "demo", source: "s", detailType: "t", detail: "{}" }),
      ).rejects.toThrow("PutEvents returned no entry");
    });
  });
});
