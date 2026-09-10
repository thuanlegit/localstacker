import { describe, it, expect, vi } from "vitest";
import type { SchedulerClient } from "@aws-sdk/client-scheduler";
import {
  listScheduleGroups,
  createScheduleGroup,
  deleteScheduleGroup,
  listSchedules,
  createSchedule,
  deleteSchedule,
  updateScheduleState,
} from "./scheduler";

describe("scheduler data plane", () => {
  describe("listScheduleGroups", () => {
    it("paginates and maps schedule groups sorted by name", async () => {
      const send = vi
        .fn()
        .mockResolvedValueOnce({
          ScheduleGroups: [
            {
              Name: "zebra",
              Arn: "arn:aws:scheduler:us-east-1:000000000000:schedule-group/zebra",
              State: "ACTIVE",
            },
            {
              Name: "default",
              Arn: "arn:aws:scheduler:us-east-1:000000000000:schedule-group/default",
              State: "ACTIVE",
            },
          ],
          NextToken: "tok-1",
        })
        .mockResolvedValueOnce({
          ScheduleGroups: [
            {
              Name: "alpha",
              Arn: "arn:aws:scheduler:us-east-1:000000000000:schedule-group/alpha",
              State: "ACTIVE",
            },
          ],
        });

      const client = { send } as unknown as SchedulerClient;
      const groups = await listScheduleGroups(client);

      expect(send).toHaveBeenCalledTimes(2);
      expect(send).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({ input: { NextToken: "tok-1" } }),
      );
      expect(groups).toEqual([
        {
          name: "alpha",
          arn: "arn:aws:scheduler:us-east-1:000000000000:schedule-group/alpha",
          state: "ACTIVE",
        },
        {
          name: "default",
          arn: "arn:aws:scheduler:us-east-1:000000000000:schedule-group/default",
          state: "ACTIVE",
        },
        {
          name: "zebra",
          arn: "arn:aws:scheduler:us-east-1:000000000000:schedule-group/zebra",
          state: "ACTIVE",
        },
      ]);
    });

    it("handles empty groups", async () => {
      const send = vi.fn().mockResolvedValueOnce({});
      const client = { send } as unknown as SchedulerClient;
      expect(await listScheduleGroups(client)).toEqual([]);
    });
  });

  describe("createScheduleGroup", () => {
    it("creates a group and returns its ARN", async () => {
      const send = vi.fn().mockResolvedValueOnce({
        ScheduleGroupArn: "arn:aws:scheduler:us-east-1:000000000000:schedule-group/g1",
      });
      const client = { send } as unknown as SchedulerClient;

      const res = await createScheduleGroup(client, "g1");

      expect(send).toHaveBeenCalledWith(
        expect.objectContaining({ input: { Name: "g1" } }),
      );
      expect(res).toEqual({
        arn: "arn:aws:scheduler:us-east-1:000000000000:schedule-group/g1",
      });
    });

    it("throws when CreateScheduleGroup returns no ARN", async () => {
      const send = vi.fn().mockResolvedValueOnce({});
      const client = { send } as unknown as SchedulerClient;

      await expect(createScheduleGroup(client, "g1")).rejects.toThrow(
        "CreateScheduleGroup returned no ARN",
      );
    });
  });

  it("deletes a schedule group by name", async () => {
    const send = vi.fn().mockResolvedValueOnce({});
    const client = { send } as unknown as SchedulerClient;

    await deleteScheduleGroup(client, "g1");

    expect(send).toHaveBeenCalledWith(
      expect.objectContaining({ input: { Name: "g1" } }),
    );
  });

  describe("listSchedules", () => {
    it("fans out GetSchedule per schedule to fill expression and target input, sorted by name", async () => {
      const modDate = new Date("2026-03-01T00:00:00Z");
      const send = vi.fn().mockImplementation((cmd: { input: Record<string, unknown> }) => {
        // ListSchedules
        if ("GroupName" in cmd.input && !("Name" in cmd.input)) {
          return Promise.resolve({
            Schedules: [
              {
                Name: "z-sched",
                Arn: "arn:aws:scheduler:us-east-1:000000000000:schedule/default/z-sched",
                GroupName: "default",
                State: "DISABLED",
              },
              {
                Name: "a-sched",
                Arn: "arn:aws:scheduler:us-east-1:000000000000:schedule/default/a-sched",
                GroupName: "default",
                State: "ENABLED",
              },
            ],
          });
        }
        // GetSchedule
        if (cmd.input.Name === "a-sched") {
          return Promise.resolve({
            Arn: "arn:aws:scheduler:us-east-1:000000000000:schedule/default/a-sched",
            Name: "a-sched",
            GroupName: "default",
            State: "ENABLED",
            ScheduleExpression: "rate(5 minutes)",
            FlexibleTimeWindow: { Mode: "OFF" },
            Target: {
              Arn: "arn:aws:sqs:us-east-1:000000000000:q1",
              Input: '{"source":"sched"}',
              RoleArn: "arn:aws:iam::000000000000:role/r1",
            },
            ScheduleExpressionTimezone: "UTC",
            LastModificationDate: modDate,
          });
        }
        if (cmd.input.Name === "z-sched") {
          return Promise.resolve({
            Arn: "arn:aws:scheduler:us-east-1:000000000000:schedule/default/z-sched",
            Name: "z-sched",
            GroupName: "default",
            State: "DISABLED",
            ScheduleExpression: "cron(0 12 * * ? *)",
            FlexibleTimeWindow: { Mode: "OFF" },
            Target: {
              Arn: "arn:aws:lambda:us-east-1:000000000000:function:fn1",
              RoleArn: "arn:aws:iam::000000000000:role/r2",
            },
          });
        }
        return Promise.reject(new Error("unexpected command"));
      });

      const client = { send } as unknown as SchedulerClient;
      const schedules = await listSchedules(client, "default");

      expect(send).toHaveBeenCalledTimes(3); // 1 list + 2 get
      expect(schedules).toEqual([
        {
          name: "a-sched",
          arn: "arn:aws:scheduler:us-east-1:000000000000:schedule/default/a-sched",
          groupName: "default",
          state: "ENABLED",
          expression: "rate(5 minutes)",
          targetArn: "arn:aws:sqs:us-east-1:000000000000:q1",
          targetInput: '{"source":"sched"}',
          roleArn: "arn:aws:iam::000000000000:role/r1",
          timezone: "UTC",
          flexibleWindowMode: "OFF",
          maximumWindowMinutes: undefined,
          lastModificationDate: modDate,
        },
        {
          name: "z-sched",
          arn: "arn:aws:scheduler:us-east-1:000000000000:schedule/default/z-sched",
          groupName: "default",
          state: "DISABLED",
          expression: "cron(0 12 * * ? *)",
          targetArn: "arn:aws:lambda:us-east-1:000000000000:function:fn1",
          targetInput: undefined,
          roleArn: "arn:aws:iam::000000000000:role/r2",
          timezone: undefined,
          flexibleWindowMode: "OFF",
          maximumWindowMinutes: undefined,
          lastModificationDate: undefined,
        },
      ]);
    });

    it("handles empty schedules", async () => {
      const send = vi.fn().mockResolvedValueOnce({});
      const client = { send } as unknown as SchedulerClient;
      expect(await listSchedules(client, "default")).toEqual([]);
    });
  });

  describe("createSchedule", () => {
    it("creates schedule with expression, target, dummy role, and window mode OFF", async () => {
      const send = vi.fn().mockResolvedValueOnce({
        ScheduleArn: "arn:aws:scheduler:us-east-1:000000000000:schedule/default/s1",
      });
      const client = { send } as unknown as SchedulerClient;

      const res = await createSchedule(client, {
        name: "s1",
        groupName: "default",
        expression: "rate(1 day)",
        targetArn: "arn:aws:sqs:us-east-1:000000000000:q1",
        targetInput: '{"k":"v"}',
      });

      expect(send).toHaveBeenCalledWith(
        expect.objectContaining({
          input: {
            Name: "s1",
            GroupName: "default",
            ScheduleExpression: "rate(1 day)",
            FlexibleTimeWindow: { Mode: "OFF" },
            Target: {
              Arn: "arn:aws:sqs:us-east-1:000000000000:q1",
              Input: '{"k":"v"}',
              RoleArn: "arn:aws:iam::000000000000:role/localstacker-scheduler",
            },
            State: "ENABLED",
            ScheduleExpressionTimezone: undefined,
          },
        }),
      );
      expect(res).toEqual({
        arn: "arn:aws:scheduler:us-east-1:000000000000:schedule/default/s1",
      });
    });

    it("throws when CreateSchedule returns no ARN", async () => {
      const send = vi.fn().mockResolvedValueOnce({});
      const client = { send } as unknown as SchedulerClient;

      await expect(
        createSchedule(client, {
          name: "s1",
          groupName: "default",
          expression: "rate(1 day)",
          targetArn: "arn:aws:sqs:us-east-1:000000000000:q1",
        }),
      ).rejects.toThrow("CreateSchedule returned no ARN");
    });
  });

  it("deletes a schedule by name and group", async () => {
    const send = vi.fn().mockResolvedValueOnce({});
    const client = { send } as unknown as SchedulerClient;

    await deleteSchedule(client, { name: "s1", groupName: "default" });

    expect(send).toHaveBeenCalledWith(
      expect.objectContaining({ input: { Name: "s1", GroupName: "default" } }),
    );
  });

  describe("updateScheduleState", () => {
    it("fetches schedule and updates with inverted State", async () => {
      const send = vi
        .fn()
        .mockResolvedValueOnce({
          Name: "s1",
          GroupName: "default",
          ScheduleExpression: "rate(1 hour)",
          FlexibleTimeWindow: { Mode: "OFF" },
          Target: {
            Arn: "arn:aws:sqs:us-east-1:000000000000:q1",
            RoleArn: "arn:aws:iam::000000000000:role/r1",
          },
          State: "ENABLED",
          ScheduleExpressionTimezone: "UTC",
        })
        .mockResolvedValueOnce({});

      const client = { send } as unknown as SchedulerClient;

      await updateScheduleState(client, {
        name: "s1",
        groupName: "default",
        enabled: false,
      });

      expect(send).toHaveBeenCalledTimes(2);
      // First call is GetSchedule
      expect(send).toHaveBeenNthCalledWith(
        1,
        expect.objectContaining({ input: { Name: "s1", GroupName: "default" } }),
      );
      // Second call is UpdateSchedule with State: "DISABLED" and retained fields
      expect(send).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({
          input: {
            Name: "s1",
            GroupName: "default",
            ScheduleExpression: "rate(1 hour)",
            FlexibleTimeWindow: { Mode: "OFF" },
            Target: {
              Arn: "arn:aws:sqs:us-east-1:000000000000:q1",
              RoleArn: "arn:aws:iam::000000000000:role/r1",
            },
            State: "DISABLED",
            ScheduleExpressionTimezone: "UTC",
          },
        }),
      );
    });
  });
});
