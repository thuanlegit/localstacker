import {
  type SchedulerClient,
  ListScheduleGroupsCommand,
  CreateScheduleGroupCommand,
  DeleteScheduleGroupCommand,
  ListSchedulesCommand,
  GetScheduleCommand,
  CreateScheduleCommand,
  DeleteScheduleCommand,
  UpdateScheduleCommand,
  type ListScheduleGroupsCommandOutput,
  type ListSchedulesCommandOutput,
  type GetScheduleCommandOutput,
} from "@aws-sdk/client-scheduler";

export interface ScheduleGroupSummary {
  name: string;
  arn: string;
  state?: string;
  creationDate?: Date;
  lastModificationDate?: Date;
}

export interface ScheduleSummary {
  name: string;
  arn: string;
  groupName: string;
  state: string;
  expression: string;
  targetArn: string;
  targetInput?: string;
  roleArn?: string;
  timezone?: string;
  startDate?: Date;
  endDate?: Date;
  flexibleWindowMode?: string;
  maximumWindowMinutes?: number;
  lastModificationDate?: Date;
}

export async function listScheduleGroups(
  client: SchedulerClient,
): Promise<ScheduleGroupSummary[]> {
  const summaries: ScheduleGroupSummary[] = [];
  let nextToken: string | undefined = undefined;

  do {
    const res: ListScheduleGroupsCommandOutput = await client.send(
      new ListScheduleGroupsCommand({
        NextToken: nextToken,
      }),
    );

    if (res.ScheduleGroups) {
      for (const group of res.ScheduleGroups) {
        if (group.Name) {
          summaries.push({
            name: group.Name,
            arn: group.Arn ?? "",
            state: group.State,
            creationDate: group.CreationDate,
            lastModificationDate: group.LastModificationDate,
          });
        }
      }
    }

    nextToken = res.NextToken;
  } while (nextToken);

  summaries.sort((a, b) => a.name.localeCompare(b.name));
  return summaries;
}

export async function createScheduleGroup(
  client: SchedulerClient,
  name: string,
): Promise<{ arn: string }> {
  const res = await client.send(
    new CreateScheduleGroupCommand({
      Name: name,
    }),
  );

  if (!res.ScheduleGroupArn) {
    throw new Error("CreateScheduleGroup returned no ARN");
  }
  return { arn: res.ScheduleGroupArn };
}

export async function deleteScheduleGroup(
  client: SchedulerClient,
  name: string,
): Promise<void> {
  await client.send(
    new DeleteScheduleGroupCommand({
      Name: name,
    }),
  );
}

export async function listSchedules(
  client: SchedulerClient,
  groupName: string,
): Promise<ScheduleSummary[]> {
  const rawSummaries: Array<{ name: string; arn: string; state?: string }> = [];
  let nextToken: string | undefined = undefined;

  do {
    const res: ListSchedulesCommandOutput = await client.send(
      new ListSchedulesCommand({
        GroupName: groupName,
        NextToken: nextToken,
      }),
    );

    if (res.Schedules) {
      for (const s of res.Schedules) {
        if (s.Name) {
          rawSummaries.push({
            name: s.Name,
            arn: s.Arn ?? "",
            state: s.State,
          });
        }
      }
    }

    nextToken = res.NextToken;
  } while (nextToken);

  // Fan out GetSchedule per row because ListSchedules omits expression, target input, etc.
  const full = await Promise.all(
    rawSummaries.map(async (raw): Promise<ScheduleSummary> => {
      try {
        const got: GetScheduleCommandOutput = await client.send(
          new GetScheduleCommand({
            Name: raw.name,
            GroupName: groupName,
          }),
        );
        return {
          name: raw.name,
          arn: got.Arn ?? raw.arn,
          groupName,
          state: got.State ?? raw.state ?? "ENABLED",
          expression: got.ScheduleExpression ?? "",
          targetArn: got.Target?.Arn ?? "",
          targetInput: got.Target?.Input || undefined,
          roleArn: got.Target?.RoleArn || undefined,
          timezone: got.ScheduleExpressionTimezone || undefined,
          startDate: got.StartDate,
          endDate: got.EndDate,
          flexibleWindowMode: got.FlexibleTimeWindow?.Mode,
          maximumWindowMinutes: got.FlexibleTimeWindow?.MaximumWindowInMinutes,
          lastModificationDate: got.LastModificationDate,
        };
      } catch {
        // Fall back to the summary row if GetSchedule fails
        return {
          name: raw.name,
          arn: raw.arn,
          groupName,
          state: raw.state ?? "ENABLED",
          expression: "",
          targetArn: "",
        };
      }
    }),
  );

  full.sort((a, b) => a.name.localeCompare(b.name));
  return full;
}

export async function createSchedule(
  client: SchedulerClient,
  params: {
    name: string;
    groupName: string;
    expression: string;
    timezone?: string;
    targetArn: string;
    targetInput?: string;
    roleArn?: string;
    state?: "ENABLED" | "DISABLED";
    expressionType?: "rate" | "cron" | "at";
  },
): Promise<{ arn: string }> {
  const roleArn =
    params.roleArn || "arn:aws:iam::000000000000:role/localstacker-scheduler";

  const res = await client.send(
    new CreateScheduleCommand({
      Name: params.name,
      GroupName: params.groupName,
      ScheduleExpression: params.expression,
      ScheduleExpressionTimezone: params.timezone || undefined,
      State: params.state ?? "ENABLED",
      FlexibleTimeWindow: {
        Mode: "OFF",
      },
      Target: {
        Arn: params.targetArn,
        Input: params.targetInput || undefined,
        RoleArn: roleArn,
      },
    }),
  );

  if (!res.ScheduleArn) {
    throw new Error("CreateSchedule returned no ARN");
  }
  return { arn: res.ScheduleArn };
}

export async function deleteSchedule(
  client: SchedulerClient,
  params: { name: string; groupName: string },
): Promise<void> {
  await client.send(
    new DeleteScheduleCommand({
      Name: params.name,
      GroupName: params.groupName,
    }),
  );
}

export async function updateScheduleState(
  client: SchedulerClient,
  params: { name: string; groupName: string; enabled: boolean },
): Promise<void> {
  // Retain all current schedule fields and invert State
  const current = await client.send(
    new GetScheduleCommand({
      Name: params.name,
      GroupName: params.groupName,
    }),
  );

  await client.send(
    new UpdateScheduleCommand({
      Name: params.name,
      GroupName: params.groupName,
      ScheduleExpression: current.ScheduleExpression,
      FlexibleTimeWindow: current.FlexibleTimeWindow ?? { Mode: "OFF" },
      Target: current.Target,
      State: params.enabled ? "ENABLED" : "DISABLED",
      ScheduleExpressionTimezone: current.ScheduleExpressionTimezone,
      StartDate: current.StartDate,
      EndDate: current.EndDate,
      Description: current.Description,
    }),
  );
}
