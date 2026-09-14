import { describe, it, expect, vi } from "vitest";
import type { SFNClient } from "@aws-sdk/client-sfn";
import {
  listStateMachines,
  createStateMachine,
  deleteStateMachine,
  startExecution,
  stopExecution,
  listExecutions,
  getExecutionHistory,
  getStateMachine,
  parseAsl,
  aslToGraph,
} from "./sfn";

describe("sfn data plane", () => {
  describe("listStateMachines", () => {
    it("paginates and maps machines sorted by name", async () => {
      const send = vi
        .fn()
        .mockResolvedValueOnce({
          stateMachines: [
            {
              stateMachineArn: "arn:aws:states:us-east-1:000000000000:zebra",
              name: "zebra",
              creationDate: new Date("2024-01-02T00:00:00Z"),
            },
          ],
          nextToken: "token-1",
        })
        .mockResolvedValueOnce({
          stateMachines: [
            {
              stateMachineArn: "arn:aws:states:us-east-1:000000000000:alpha",
              name: "alpha",
              creationDate: new Date("2024-01-01T00:00:00Z"),
            },
          ],
        });

      const client = { send } as unknown as SFNClient;
      const machines = await listStateMachines(client);

      expect(send).toHaveBeenCalledTimes(2);
      expect(machines).toEqual([
        {
          arn: "arn:aws:states:us-east-1:000000000000:alpha",
          name: "alpha",
          creationDate: new Date("2024-01-01T00:00:00Z"),
        },
        {
          arn: "arn:aws:states:us-east-1:000000000000:zebra",
          name: "zebra",
          creationDate: new Date("2024-01-02T00:00:00Z"),
        },
      ]);
    });

    it("handles empty results", async () => {
      const send = vi.fn().mockResolvedValueOnce({});
      const client = { send } as unknown as SFNClient;
      expect(await listStateMachines(client)).toEqual([]);
    });
  });

  describe("createStateMachine", () => {
    it("defaults roleArn and returns the state machine ARN", async () => {
      const send = vi
        .fn()
        .mockResolvedValueOnce({
          stateMachineArn: "arn:aws:states:us-east-1:000000000000:machine",
        });
      const client = { send } as unknown as SFNClient;

      const { arn } = await createStateMachine(client, {
        name: "machine",
        definition: '{"StartAt":"A"}',
      });

      expect(arn).toBe("arn:aws:states:us-east-1:000000000000:machine");
      expect(send).toHaveBeenCalledWith(
        expect.objectContaining({
          input: expect.objectContaining({
            name: "machine",
            definition: '{"StartAt":"A"}',
            roleArn: "arn:aws:iam::000000000000:role/localstacker",
          }),
        }),
      );
    });
    it("uses the provided roleArn", async () => {
      const send = vi.fn().mockResolvedValueOnce({ stateMachineArn: "arn:x" });
      const client = { send } as unknown as SFNClient;
      await createStateMachine(client, {
        name: "m",
        definition: "{}",
        roleArn: "arn:aws:iam::000000000000:role/custom",
      });
      expect(send).toHaveBeenCalledWith(
        expect.objectContaining({
          input: expect.objectContaining({
            roleArn: "arn:aws:iam::000000000000:role/custom",
          }),
        }),
      );
    });

    it("throws when no ARN is returned", async () => {
      const send = vi.fn().mockResolvedValueOnce({});
      const client = { send } as unknown as SFNClient;
      await expect(
        createStateMachine(client, { name: "m", definition: "{}" }),
      ).rejects.toThrow("CreateStateMachine returned no ARN");
    });
  });

  describe("deleteStateMachine", () => {
    it("sends the state machine ARN", async () => {
      const send = vi.fn().mockResolvedValueOnce({});
      const client = { send } as unknown as SFNClient;
      await deleteStateMachine(client, "arn:aws:states:us-east-1:000000000000:m");
      expect(send).toHaveBeenCalledWith(
        expect.objectContaining({
          input: { stateMachineArn: "arn:aws:states:us-east-1:000000000000:m" },
        }),
      );
    });
  });

  describe("startExecution", () => {
    it("returns the execution ARN and forwards JSON input", async () => {
      const send = vi
        .fn()
        .mockResolvedValueOnce({
          executionArn: "arn:aws:states:us-east-1:000000000000:execution:1",
        });
      const client = { send } as unknown as SFNClient;

      const { executionArn } = await startExecution(client, {
        stateMachineArn: "arn:aws:states:us-east-1:000000000000:m",
        input: '{"value":1}',
      });

      expect(executionArn).toBe("arn:aws:states:us-east-1:000000000000:execution:1");
      expect(send).toHaveBeenCalledWith(
        expect.objectContaining({
          input: expect.objectContaining({
            stateMachineArn: "arn:aws:states:us-east-1:000000000000:m",
            input: '{"value":1}',
          }),
        }),
      );
    });

    it("throws when no execution ARN is returned", async () => {
      const send = vi.fn().mockResolvedValueOnce({});
      const client = { send } as unknown as SFNClient;
      await expect(
        startExecution(client, { stateMachineArn: "arn:m" }),
      ).rejects.toThrow("StartExecution returned no execution ARN");
    });
  });

  describe("stopExecution", () => {
    it("sends execution ARN with optional cause", async () => {
      const send = vi.fn().mockResolvedValueOnce({});
      const client = { send } as unknown as SFNClient;
      await stopExecution(client, "arn:execution:1", "e2e stop");
      expect(send).toHaveBeenCalledWith(
        expect.objectContaining({
          input: { executionArn: "arn:execution:1", cause: "e2e stop" },
        }),
      );
    });
  });

  describe("listExecutions", () => {
    it("paginates, filters by status, and maps summaries", async () => {
      const send = vi
        .fn()
        .mockResolvedValueOnce({
          executions: [
            {
              executionArn: "arn:execution:b",
              name: "b",
              status: "SUCCEEDED",
              startDate: new Date("2024-01-01T00:00:00Z"),
            },
          ],
          nextToken: "t1",
        })
        .mockResolvedValueOnce({
          executions: [
            {
              executionArn: "arn:execution:a",
              name: "a",
              status: "RUNNING",
              startDate: new Date("2024-01-02T00:00:00Z"),
              stopDate: new Date("2024-01-03T00:00:00Z"),
            },
          ],
        });

      const client = { send } as unknown as SFNClient;
      const executions = await listExecutions(
        client,
        "arn:aws:states:us-east-1:000000000000:m",
        "RUNNING",
      );

      expect(send).toHaveBeenCalledTimes(2);
      expect(send).toHaveBeenNthCalledWith(
        1,
        expect.objectContaining({
          input: expect.objectContaining({
            stateMachineArn: "arn:aws:states:us-east-1:000000000000:m",
            statusFilter: "RUNNING",
          }),
        }),
      );
      expect(executions).toEqual([
        {
          executionArn: "arn:execution:a",
          name: "a",
          status: "RUNNING",
          startDate: new Date("2024-01-02T00:00:00Z"),
          stopDate: new Date("2024-01-03T00:00:00Z"),
        },
        {
          executionArn: "arn:execution:b",
          name: "b",
          status: "SUCCEEDED",
          startDate: new Date("2024-01-01T00:00:00Z"),
          stopDate: undefined,
        },
      ]);
    });
  });

  describe("getExecutionHistory", () => {
    it("paginates and maps events to minimal fields", async () => {
      const send = vi
        .fn()
        .mockResolvedValueOnce({
          events: [
            { timestamp: new Date("2024-01-01T00:00:00Z"), type: "ExecutionStarted", id: 1 },
          ],
          nextToken: "t1",
        })
        .mockResolvedValueOnce({
          events: [
            {
              timestamp: new Date("2024-01-01T00:00:01Z"),
              type: "ExecutionSucceeded",
              id: 3,
              previousEventId: 2,
            },
          ],
        });

      const client = { send } as unknown as SFNClient;
      const events = await getExecutionHistory(client, "arn:execution:1");

      expect(send).toHaveBeenCalledTimes(2);
      expect(events).toEqual([
        { timestamp: new Date("2024-01-01T00:00:00Z"), type: "ExecutionStarted", previousEventId: undefined },
        { timestamp: new Date("2024-01-01T00:00:01Z"), type: "ExecutionSucceeded", previousEventId: 2 },
      ]);
    });
  });

  describe("getStateMachine", () => {
    it("maps name, definition, and roleArn", async () => {
      const send = vi.fn().mockResolvedValueOnce({
        stateMachineArn: "arn:aws:states:us-east-1:000000000000:m",
        name: "m",
        definition: '{"StartAt":"A","States":{"A":{"Type":"Succeed"}}}',
        roleArn: "arn:aws:iam::000000000000:role/localstacker",
      });
      const client = { send } as unknown as SFNClient;

      const machine = await getStateMachine(client, "arn:aws:states:us-east-1:000000000000:m");
      expect(machine).toEqual({
        arn: "arn:aws:states:us-east-1:000000000000:m",
        name: "m",
        definition: '{"StartAt":"A","States":{"A":{"Type":"Succeed"}}}',
        roleArn: "arn:aws:iam::000000000000:role/localstacker",
      });
    });
  });

  describe("parseAsl", () => {
    const WORKED_ASL =
      '{"StartAt":"A","States":{"A":{"Type":"Task","Next":"B"},"B":{"Type":"Choice","Choices":[{"Next":"C"}],"Default":"D"},"C":{"Type":"Succeed"},"D":{"Type":"Fail"}}}';

    it("parses startAt and minimal state fields", () => {
      expect(parseAsl(WORKED_ASL)).toEqual({
        startAt: "A",
        states: {
          A: { type: "Task", next: "B" },
          B: { type: "Choice", choices: [{ next: "C" }], default: "D" },
          C: { type: "Succeed", end: true },
          D: { type: "Fail", end: true },
        },
      });
    });

    it("throws a friendly error on invalid JSON", () => {
      expect(() => parseAsl("not json")).toThrow(
        "Invalid state machine definition: not valid JSON",
      );
    });
  });

  describe("aslToGraph", () => {
    const WORKED_ASL =
      '{"StartAt":"A","States":{"A":{"Type":"Task","Next":"B"},"B":{"Type":"Choice","Choices":[{"Next":"C"}],"Default":"D"},"C":{"Type":"Succeed"},"D":{"Type":"Fail"}}}';

    it("builds nodes and edges for the worked fixture", () => {
      const { nodes, edges } = aslToGraph(WORKED_ASL);

      expect(nodes.map((n) => n.id)).toEqual(["__start", "A", "B", "C", "D", "__end"]);
      expect(edges).toEqual([
        { from: "__start", to: "A" },
        { from: "A", to: "B" },
        { from: "B", to: "C", label: "choice" },
        { from: "B", to: "D", label: "default" },
        { from: "C", to: "__end" },
        { from: "D", to: "__end" },
      ]);
    });

    it("labels choice edges and start/end nodes", () => {
      const { nodes, edges } = aslToGraph(WORKED_ASL);
      expect(nodes[0]).toEqual({ id: "__start", label: "Start", type: "start" });
      expect(nodes[nodes.length - 1]).toEqual({ id: "__end", label: "End", type: "end" });
      expect(edges.find((e) => e.from === "B" && e.to === "C")).toMatchObject({
        label: "choice",
      });
      expect(edges.find((e) => e.from === "B" && e.to === "D")).toMatchObject({
        label: "default",
      });
    });

    it("ends at End:true without Succeed/Fail types", () => {
      const asl =
        '{"StartAt":"A","States":{"A":{"Type":"Pass","End":true},"B":{"Type":"Succeed"}}}';
      const { nodes, edges } = aslToGraph(asl);
      expect(nodes.map((n) => n.id)).toEqual(["__start", "A", "B", "__end"]);
      expect(edges).toEqual([
        { from: "__start", to: "A" },
        { from: "A", to: "__end" },
        { from: "B", to: "__end" },
      ]);
    });

    it("flattens Parallel branches and Map iterators with prefixed ids", () => {
      const asl = JSON.stringify({
        StartAt: "Fan",
        States: {
          Fan: {
            Type: "Parallel",
            Next: "Done",
            Branches: [
              {
                StartAt: "B1",
                States: { B1: { Type: "Task", Next: "B2" }, B2: { Type: "Succeed" } },
              },
              {
                StartAt: "C1",
                States: { C1: { Type: "Pass", End: true } },
              },
            ],
          },
          Done: { Type: "Succeed" },
        },
      });
      const { nodes, edges } = aslToGraph(asl);

      expect(nodes.map((n) => n.id)).toEqual([
        "__start",
        "Fan",
        "Branch-0:B1",
        "Branch-0:B2",
        "Branch-1:C1",
        "Done",
        "__end",
      ]);
      expect(edges).toEqual([
        { from: "__start", to: "Fan" },
        { from: "Fan", to: "Branch-0:B1", label: "branch 0" },
        { from: "Fan", to: "Branch-1:C1", label: "branch 1" },
        { from: "Branch-0:B1", to: "Branch-0:B2" },
        { from: "Fan", to: "Done" },
        { from: "Done", to: "__end" },
      ]);
    });

    it("flattens Map iterators with Map: prefix", () => {
      const asl = JSON.stringify({
        StartAt: "Map",
        States: {
          Map: {
            Type: "Map",
            End: true,
            Iterator: {
              StartAt: "Item",
              States: { Item: { Type: "Task", End: true } },
            },
          },
        },
      });
      const { nodes, edges } = aslToGraph(asl);

      expect(nodes.map((n) => n.id)).toEqual(["__start", "Map", "Map:Item", "__end"]);
      expect(edges).toEqual([
        { from: "__start", to: "Map" },
        { from: "Map", to: "Map:Item", label: "iterator" },
        { from: "Map", to: "__end" },
      ]);
    });

    it("propagates the invalid JSON error", () => {
      expect(() => aslToGraph("nope")).toThrow(
        "Invalid state machine definition: not valid JSON",
      );
    });
  });
});
