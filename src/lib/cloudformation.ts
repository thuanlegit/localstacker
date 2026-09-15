import {
  type CloudFormationClient,
  ListStacksCommand,
  DescribeStacksCommand,
  GetTemplateCommand,
  DescribeStackEventsCommand,
  ListStackResourcesCommand,
  DeleteStackCommand,
} from "@aws-sdk/client-cloudformation";

export interface StackSummary {
  stackId: string;
  name: string;
  status: string;
  creationDate?: Date;
}

export interface StackDetail {
  stackId: string;
  name: string;
  status: string;
  description: string;
  creationDate?: Date;
  outputs: { key: string; value: string }[];
}

export interface StackEvent {
  eventId: string;
  resourceType: string;
  resourceStatus: string;
  logicalResourceId: string;
  timestamp: Date;
  statusReason: string;
}

export interface StackResource {
  logicalId: string;
  physicalId: string;
  resourceType: string;
  status: string;
}

const DELETED_STATUSES = new Set(["DELETE_COMPLETE"]);

export async function listStacks(
  client: CloudFormationClient,
): Promise<StackSummary[]> {
  const out: StackSummary[] = [];
  let nextToken: string | undefined;
  do {
    const res = await client.send(new ListStacksCommand({ NextToken: nextToken }));
    for (const s of res.StackSummaries ?? []) {
      if (!s.StackId || (s.StackStatus && DELETED_STATUSES.has(s.StackStatus))) continue;
      out.push({
        stackId: s.StackId,
        name: s.StackName ?? "",
        status: s.StackStatus ?? "",
        creationDate: s.CreationTime,
      });
    }
    nextToken = res.NextToken;
  } while (nextToken);
  return out.sort((a, b) => (b.creationDate?.getTime() ?? 0) - (a.creationDate?.getTime() ?? 0));
}

export async function describeStack(
  client: CloudFormationClient,
  stackName: string,
): Promise<StackDetail> {
  const res = await client.send(new DescribeStacksCommand({ StackName: stackName }));
  const s = res.Stacks?.[0];
  if (!s?.StackId) throw new Error("Stack not found");
  return {
    stackId: s.StackId,
    name: s.StackName ?? "",
    status: s.StackStatus ?? "",
    description: s.Description ?? "",
    creationDate: s.CreationTime,
    outputs: (s.Outputs ?? []).map((o) => ({
      key: o.OutputKey ?? "",
      value: o.OutputValue ?? "",
    })),
  };
}

export async function getTemplate(
  client: CloudFormationClient,
  stackName: string,
): Promise<string> {
  const res = await client.send(new GetTemplateCommand({ StackName: stackName }));
  return String(res.TemplateBody ?? "");
}

export async function listStackEvents(
  client: CloudFormationClient,
  stackName: string,
): Promise<StackEvent[]> {
  const res = await client.send(new DescribeStackEventsCommand({ StackName: stackName }));
  const events: StackEvent[] = (res.StackEvents ?? []).map((e) => ({
    eventId: e.EventId ?? "",
    resourceType: e.ResourceType ?? "",
    resourceStatus: e.ResourceStatus ?? "",
    logicalResourceId: e.LogicalResourceId ?? "",
    timestamp: e.Timestamp ?? new Date(0),
    statusReason: e.ResourceStatusReason ?? "",
  }));
  return events.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
}

export async function listStackResources(
  client: CloudFormationClient,
  stackName: string,
): Promise<StackResource[]> {
  const res = await client.send(new ListStackResourcesCommand({ StackName: stackName }));
  return (res.StackResourceSummaries ?? []).map((r) => ({
    logicalId: r.LogicalResourceId ?? "",
    physicalId: r.PhysicalResourceId ?? "",
    resourceType: r.ResourceType ?? "",
    status: r.ResourceStatus ?? "",
  }));
}

export async function deleteStack(
  client: CloudFormationClient,
  stackName: string,
): Promise<void> {
  await client.send(new DeleteStackCommand({ StackName: stackName }));
}
