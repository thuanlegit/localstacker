import {
  type EventBridgeClient,
  ListEventBusesCommand,
  CreateEventBusCommand,
  DeleteEventBusCommand,
  ListRulesCommand,
  PutRuleCommand,
  DeleteRuleCommand,
  EnableRuleCommand,
  DisableRuleCommand,
  ListTargetsByRuleCommand,
  PutTargetsCommand,
  RemoveTargetsCommand,
  PutEventsCommand,
  type ListEventBusesCommandOutput,
  type ListRulesCommandOutput,
  type ListTargetsByRuleCommandOutput,
} from "@aws-sdk/client-eventbridge";

export interface EventBusSummary {
  name: string;
  arn: string;
  creationTime?: Date;
  lastModifiedTime?: Date;
}

export interface RuleSummary {
  name: string;
  arn: string;
  state: string;
  eventPattern?: string;
  scheduleExpression?: string;
  description?: string;
}

export interface RuleTarget {
  id: string;
  arn: string;
  input?: string;
}

export async function listEventBuses(
  client: EventBridgeClient,
): Promise<EventBusSummary[]> {
  const summaries: EventBusSummary[] = [];
  let nextToken: string | undefined = undefined;

  do {
    const res: ListEventBusesCommandOutput = await client.send(
      new ListEventBusesCommand({
        NextToken: nextToken,
      }),
    );

    if (res.EventBuses) {
      for (const bus of res.EventBuses) {
        if (bus.Name) {
          summaries.push({
            name: bus.Name,
            arn: bus.Arn ?? "",
            creationTime: bus.CreationTime ?? undefined,
            lastModifiedTime: bus.LastModifiedTime ?? undefined,
          });
        }
      }
    }

    nextToken = res.NextToken;
  } while (nextToken);

  summaries.sort((a, b) => a.name.localeCompare(b.name));
  return summaries;
}

export async function createEventBus(
  client: EventBridgeClient,
  params: { name: string },
): Promise<{ arn: string }> {
  const res = await client.send(
    new CreateEventBusCommand({
      Name: params.name,
    }),
  );

  if (!res.EventBusArn) throw new Error("CreateEventBus returned no ARN");
  return { arn: res.EventBusArn };
}

export async function deleteEventBus(
  client: EventBridgeClient,
  name: string,
): Promise<void> {
  await client.send(
    new DeleteEventBusCommand({
      Name: name,
    }),
  );
}

export async function listRules(
  client: EventBridgeClient,
  busName: string,
): Promise<RuleSummary[]> {
  const summaries: RuleSummary[] = [];
  let nextToken: string | undefined = undefined;

  do {
    const res: ListRulesCommandOutput = await client.send(
      new ListRulesCommand({
        EventBusName: busName,
        NextToken: nextToken,
      }),
    );

    if (res.Rules) {
      for (const rule of res.Rules) {
        if (rule.Name) {
          summaries.push({
            name: rule.Name,
            arn: rule.Arn ?? "",
            state: rule.State ?? "ENABLED",
            eventPattern: rule.EventPattern || undefined,
            scheduleExpression: rule.ScheduleExpression || undefined,
            description: rule.Description || undefined,
          });
        }
      }
    }

    nextToken = res.NextToken;
  } while (nextToken);

  summaries.sort((a, b) => a.name.localeCompare(b.name));
  return summaries;
}

export async function putRule(
  client: EventBridgeClient,
  params: {
    busName: string;
    name: string;
    eventPattern?: string;
    scheduleExpression?: string;
    state?: "ENABLED" | "DISABLED";
    description?: string;
  },
): Promise<{ arn: string }> {
  const res = await client.send(
    new PutRuleCommand({
      Name: params.name,
      EventBusName: params.busName,
      EventPattern: params.eventPattern,
      ScheduleExpression: params.scheduleExpression,
      State: params.state,
      Description: params.description,
    }),
  );

  return { arn: res.RuleArn ?? "" };
}

export async function deleteRule(
  client: EventBridgeClient,
  params: { busName: string; name: string },
): Promise<void> {
  await client.send(
    new DeleteRuleCommand({
      Name: params.name,
      EventBusName: params.busName,
    }),
  );
}

export async function setRuleState(
  client: EventBridgeClient,
  params: { busName: string; name: string; enabled: boolean },
): Promise<void> {
  const input = { Name: params.name, EventBusName: params.busName };
  await client.send(
    params.enabled ? new EnableRuleCommand(input) : new DisableRuleCommand(input),
  );
}

export async function listRuleTargets(
  client: EventBridgeClient,
  params: { busName: string; rule: string },
): Promise<RuleTarget[]> {
  const targets: RuleTarget[] = [];
  let nextToken: string | undefined = undefined;

  do {
    const res: ListTargetsByRuleCommandOutput = await client.send(
      new ListTargetsByRuleCommand({
        Rule: params.rule,
        EventBusName: params.busName,
        NextToken: nextToken,
      }),
    );

    if (res.Targets) {
      for (const target of res.Targets) {
        if (target.Id && target.Arn) {
          targets.push({
            id: target.Id,
            arn: target.Arn,
            input: target.Input || undefined,
          });
        }
      }
    }

    nextToken = res.NextToken;
  } while (nextToken);

  return targets;
}

function assertNoFailedEntries(
  action: string,
  failedCount: number | undefined,
  failedEntries: Array<{ ErrorCode?: string; ErrorMessage?: string }> | undefined,
) {
  if ((failedCount ?? 0) === 0) return;
  const first = failedEntries?.[0];
  throw new Error(`${action} failed: ${first?.ErrorCode}: ${first?.ErrorMessage}`);
}

export async function putRuleTargets(
  client: EventBridgeClient,
  params: {
    busName: string;
    rule: string;
    targets: Array<{ id: string; arn: string; input?: string }>;
  },
): Promise<void> {
  const res = await client.send(
    new PutTargetsCommand({
      Rule: params.rule,
      EventBusName: params.busName,
      Targets: params.targets.map((t) => ({ Id: t.id, Arn: t.arn, Input: t.input })),
    }),
  );
  assertNoFailedEntries("PutTargets", res.FailedEntryCount, res.FailedEntries);
}

export async function removeRuleTargets(
  client: EventBridgeClient,
  params: { busName: string; rule: string; ids: string[] },
): Promise<void> {
  const res = await client.send(
    new RemoveTargetsCommand({
      Rule: params.rule,
      EventBusName: params.busName,
      Ids: params.ids,
    }),
  );
  assertNoFailedEntries("RemoveTargets", res.FailedEntryCount, res.FailedEntries);
}

export async function putEvents(
  client: EventBridgeClient,
  params: {
    busName: string;
    source: string;
    detailType: string;
    detail: string;
  },
): Promise<{ eventId: string }> {
  const res = await client.send(
    new PutEventsCommand({
      Entries: [
        {
          EventBusName: params.busName,
          Source: params.source,
          DetailType: params.detailType,
          Detail: params.detail,
        },
      ],
    }),
  );

  const entry = res.Entries?.[0];
  if ((res.FailedEntryCount ?? 0) > 0 || entry?.ErrorCode) {
    throw new Error(`PutEvents failed: ${entry?.ErrorCode}: ${entry?.ErrorMessage}`);
  }
  if (!entry) throw new Error("PutEvents returned no entry");
  return { eventId: entry.EventId ?? "" };
}
