import {
  type SFNClient,
  ListStateMachinesCommand,
  DescribeStateMachineCommand,
  CreateStateMachineCommand,
  DeleteStateMachineCommand,
  StartExecutionCommand,
  StopExecutionCommand,
  ListExecutionsCommand,
  GetExecutionHistoryCommand,
  type ExecutionStatus,
  type ListExecutionsCommandOutput,
  type ListStateMachinesCommandOutput,
  type GetExecutionHistoryCommandOutput,
} from "@aws-sdk/client-sfn";

export const DEFAULT_SFN_ROLE_ARN = "arn:aws:iam::000000000000:role/localstacker";

export interface StateMachineSummary {
  arn: string;
  name: string;
  creationDate?: Date;
}

export interface StateMachineDetail {
  arn: string;
  name: string;
  definition: string;
  roleArn?: string;
}

export interface ExecutionSummary {
  executionArn: string;
  name: string;
  status: string;
  startDate: Date;
  stopDate?: Date;
}

export interface HistoryEventLite {
  timestamp: Date;
  type: string;
  previousEventId?: number;
}

export interface AslChoice {
  next: string;
}

export interface AslState {
  type: string;
  next?: string;
  default?: string;
  choices?: AslChoice[];
  branches?: string[][];
  iterator?: string[];
  end?: boolean;
  catch?: AslChoice[];
}

export interface Asl {
  startAt: string;
  states: Record<string, AslState>;
}
const TERMINAL_TYPES: Record<string, true> = { Succeed: true, Fail: true };

export interface GraphNode {
  id: string;
  label: string;
  type: string;
}

export interface GraphEdge {
  from: string;
  to: string;
  label?: string;
}


export async function listStateMachines(
  client: SFNClient,
): Promise<StateMachineSummary[]> {
  const machines: StateMachineSummary[] = [];
  let nextToken: string | undefined = undefined;

  do {
    const res: ListStateMachinesCommandOutput = await client.send(
      new ListStateMachinesCommand({ nextToken: nextToken }),
    );

    if (res.stateMachines) {
      for (const m of res.stateMachines) {
        if (m.stateMachineArn && m.name) {
          machines.push({
            arn: m.stateMachineArn,
            name: m.name,
            creationDate: m.creationDate ?? undefined,
          });
        }
      }
    }

    nextToken = res.nextToken;
  } while (nextToken);

  machines.sort((a, b) => a.name.localeCompare(b.name));
  return machines;
}

export async function getStateMachine(
  client: SFNClient,
  arn: string,
): Promise<StateMachineDetail> {
  const res = await client.send(new DescribeStateMachineCommand({ stateMachineArn: arn }));
  if (!res.stateMachineArn) {
    throw new Error("DescribeStateMachine returned no ARN");
  }
  return {
    arn: res.stateMachineArn,
    name: res.name ?? "",
    definition: res.definition ?? "",
    roleArn: res.roleArn ?? undefined,
  };
}

export async function createStateMachine(
  client: SFNClient,
  params: { name: string; definition: string; roleArn?: string },
): Promise<{ arn: string }> {
  const res = await client.send(
    new CreateStateMachineCommand({
      name: params.name,
      definition: params.definition,
      roleArn: params.roleArn ?? DEFAULT_SFN_ROLE_ARN,
    }),
  );

  if (!res.stateMachineArn) {
    throw new Error("CreateStateMachine returned no ARN");
  }

  return { arn: res.stateMachineArn };
}

export async function deleteStateMachine(client: SFNClient, arn: string): Promise<void> {
  await client.send(new DeleteStateMachineCommand({ stateMachineArn: arn }));
}

export async function startExecution(
  client: SFNClient,
  params: { stateMachineArn: string; input?: string },
): Promise<{ executionArn: string }> {
  const res = await client.send(
    new StartExecutionCommand({
      stateMachineArn: params.stateMachineArn,
      input: params.input,
    }),
  );
  if (!res.executionArn) {
    throw new Error("StartExecution returned no execution ARN");
  }

  return { executionArn: res.executionArn };
}

export async function stopExecution(
  client: SFNClient,
  executionArn: string,
  cause?: string,
): Promise<void> {
  await client.send(new StopExecutionCommand({ executionArn, cause }));
}

export async function listExecutions(
  client: SFNClient,
  stateMachineArn: string,
  status?: ExecutionStatus,
): Promise<ExecutionSummary[]> {
  const executions: ExecutionSummary[] = [];
  let nextToken: string | undefined = undefined;

  do {
    const res: ListExecutionsCommandOutput = await client.send(
      new ListExecutionsCommand({
        stateMachineArn,
        statusFilter: status,
        nextToken: nextToken,
      }),
    );

    if (res.executions) {
      for (const e of res.executions) {
        if (e.executionArn) {
          executions.push({
            executionArn: e.executionArn,
            name: e.name ?? "",
            status: e.status ?? "UNKNOWN",
            startDate: e.startDate ?? new Date(0),
            stopDate: e.stopDate ?? undefined,
          });
        }
      }
    }

    nextToken = res.nextToken;
  } while (nextToken);

  executions.sort((a, b) => a.name.localeCompare(b.name));
  return executions;
}

export async function getExecutionHistory(
  client: SFNClient,
  executionArn: string,
): Promise<HistoryEventLite[]> {
  const events: HistoryEventLite[] = [];
  let nextToken: string | undefined = undefined;

  do {
    const res: GetExecutionHistoryCommandOutput = await client.send(
      new GetExecutionHistoryCommand({
        executionArn,
        nextToken: nextToken,
      }),
    );

    if (res.events) {
      for (const ev of res.events) {
        if (ev.timestamp && ev.type) {
          events.push({
            timestamp: ev.timestamp,
            type: ev.type,
            previousEventId: ev.previousEventId ?? undefined,
          });
        }
      }
    }

    nextToken = res.nextToken;
  } while (nextToken);

  return events;
}

interface RawAsl {
  StartAt?: string;
  States?: Record<string, RawAslState>;
}

interface RawAslState {
  Type?: string;
  Next?: string;
  Default?: string;
  End?: boolean;
  Choices?: Array<{ Next?: string }>;
  Catch?: Array<{ Next?: string }>;
  Branches?: Array<RawAsl>;
  Iterator?: RawAsl;
}

export function parseAsl(definition: string): Asl {
  const raw = parseRawAsl(definition);
  const states: Record<string, AslState> = {};

  for (const [name, state] of Object.entries(raw.States ?? {})) {
    const type = state.Type ?? "Pass";
    const mapped: AslState = { type };

    if (state.Next) mapped.next = state.Next;
    if (state.Default) mapped.default = state.Default;
    if (state.Choices) {
      const choices = state.Choices
        .filter((c): c is { Next: string } => Boolean(c.Next))
        .map((c) => ({ next: c.Next }));
      if (choices.length > 0) mapped.choices = choices;
    }
    if (state.Catch) {
      const catches = state.Catch
        .filter((c): c is { Next: string } => Boolean(c.Next))
        .map((c) => ({ next: c.Next }));
      if (catches.length > 0) mapped.catch = catches;
    }
    if (state.End === true || TERMINAL_TYPES[type]) mapped.end = true;

    if (state.Branches) {
      mapped.branches = state.Branches.map((branch, i) =>
        flattenStateNames(branch, `Branch-${i}:`),
      );
    }
    if (state.Iterator) {
      mapped.iterator = flattenStateNames(state.Iterator, "Map:");
    }

    states[name] = mapped;
  }

  return { startAt: raw.StartAt ?? "", states };
}

function parseRawAsl(definition: string): RawAsl {
  let parsed: unknown;
  try {
    parsed = JSON.parse(definition);
  } catch {
    throw new Error("Invalid state machine definition: not valid JSON");
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new Error("Invalid state machine definition: not valid JSON");
  }
  return parsed as RawAsl;
}

function flattenStateNames(container: RawAsl, prefix: string): string[] {
  return Object.keys(container.States ?? {}).map((name) => `${prefix}${name}`);
}

export function aslToGraph(definition: string): {
  nodes: GraphNode[];
  edges: GraphEdge[];
} {
  const raw = parseRawAsl(definition);
  const states = raw.States ?? {};
  const nodes: GraphNode[] = [{ id: "__start", label: "Start", type: "start" }];
  const edges: GraphEdge[] = [];

  if (raw.StartAt && states[raw.StartAt]) {
    edges.push({ from: "__start", to: raw.StartAt });
  }

  for (const [name, state] of Object.entries(states)) {
    const type = state.Type ?? "Pass";
    nodes.push({ id: name, label: name, type });

    // Parallel branches and Map iterators flatten into prefixed sub-nodes.
    if (state.Branches) {
      const branches = state.Branches.map((branch, i) => ({
        branch,
        prefix: `Branch-${i}:`,
        label: `branch ${i}`,
      }));
      for (const { branch, prefix, label } of branches) {
        if (branch.StartAt && branch.States?.[branch.StartAt]) {
          edges.push({ from: name, to: `${prefix}${branch.StartAt}`, label });
        }
      }
      for (const { branch, prefix } of branches) {
        pushNestedEdges(edges, branch, prefix);
        for (const nestedName of Object.keys(branch.States ?? {})) {
          nodes.push({
            id: `${prefix}${nestedName}`,
            label: `${prefix}${nestedName}`,
            type: branch.States![nestedName].Type ?? "Pass",
          });
        }
      }
    }
    if (state.Iterator) {
      const prefix = "Map:";
      if (state.Iterator.StartAt && state.Iterator.States?.[state.Iterator.StartAt]) {
        edges.push({
          from: name,
          to: `${prefix}${state.Iterator.StartAt}`,
          label: "iterator",
        });
      }
      pushNestedEdges(edges, state.Iterator, prefix);
      for (const nestedName of Object.keys(state.Iterator.States ?? {})) {
        nodes.push({
          id: `${prefix}${nestedName}`,
          label: `${prefix}${nestedName}`,
          type: state.Iterator.States![nestedName].Type ?? "Pass",
        });
      }
    }

    if (state.Next) edges.push({ from: name, to: state.Next });
    for (const choice of state.Choices ?? []) {
      if (choice.Next) edges.push({ from: name, to: choice.Next, label: "choice" });
    }
    if (state.Default) edges.push({ from: name, to: state.Default, label: "default" });
    for (const catchEdge of state.Catch ?? []) {
      if (catchEdge.Next) edges.push({ from: name, to: catchEdge.Next, label: "catch" });
    }

    if (state.End === true || TERMINAL_TYPES[type]) {
      edges.push({ from: name, to: "__end" });
    }
  }

  nodes.push({ id: "__end", label: "End", type: "end" });
  return { nodes, edges };
}

/** Edges between flattened nested states; nested terminals stay branch-local. */
function pushNestedEdges(
  edges: GraphEdge[],
  container: RawAsl,
  prefix: string,
): void {
  const nested = container.States ?? {};
  for (const [nestedName, state] of Object.entries(nested)) {
    const from = `${prefix}${nestedName}`;
    if (state.Next) edges.push({ from, to: `${prefix}${state.Next}` });
    for (const choice of state.Choices ?? []) {
      if (choice.Next) edges.push({ from, to: `${prefix}${choice.Next}` });
    }
    if (state.Default) edges.push({ from, to: `${prefix}${state.Default}` });
    for (const catchEdge of state.Catch ?? []) {
      if (catchEdge.Next) edges.push({ from, to: `${prefix}${catchEdge.Next}` });
    }
  }
}
