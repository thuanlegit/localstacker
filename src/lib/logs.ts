import {
  type CloudWatchLogsClient,
  DescribeLogGroupsCommand,
  CreateLogGroupCommand,
  DeleteLogGroupCommand,
  DescribeLogStreamsCommand,
  DeleteLogStreamCommand,
  FilterLogEventsCommand,
  type DescribeLogGroupsCommandOutput,
  type DescribeLogStreamsCommandOutput,
} from "@aws-sdk/client-cloudwatch-logs";

export const TAIL_POLL_INTERVAL_MS = 3000;
export const MAX_LOG_EVENTS = 5000;

export interface LogGroupSummary {
  name: string;
  sizeBytes: number;
  retentionInDays?: number;
  lastEventTime?: number;
}

export interface LogStreamSummary {
  name: string;
  firstEventTime?: number;
  lastEventTime?: number;
  storedBytes: number;
}

export interface LogEventRecord {
  id: string;
  timestamp: number;
  streamName: string;
  message: string;
}

export async function describeLogGroups(
  client: CloudWatchLogsClient,
): Promise<LogGroupSummary[]> {
  const summaries: LogGroupSummary[] = [];
  let nextToken: string | undefined = undefined;

  do {
    const res: DescribeLogGroupsCommandOutput = await client.send(
      new DescribeLogGroupsCommand({
        nextToken,
      }),
    );

    if (res.logGroups) {
      for (const g of res.logGroups) {
        summaries.push({
          name: g.logGroupName ?? "",
          sizeBytes: g.storedBytes ?? 0,
          retentionInDays: g.retentionInDays,
          lastEventTime: undefined,
        });
      }
    }

    nextToken = res.nextToken;
  } while (nextToken);

  return summaries;
}

export async function createLogGroup(
  client: CloudWatchLogsClient,
  name: string,
): Promise<void> {
  await client.send(new CreateLogGroupCommand({ logGroupName: name }));
}

export async function deleteLogGroup(
  client: CloudWatchLogsClient,
  name: string,
): Promise<void> {
  await client.send(new DeleteLogGroupCommand({ logGroupName: name }));
}

export async function describeLogStreams(
  client: CloudWatchLogsClient,
  params: { logGroupName: string },
): Promise<LogStreamSummary[]> {
  const summaries: LogStreamSummary[] = [];
  let nextToken: string | undefined = undefined;

  do {
    const res: DescribeLogStreamsCommandOutput = await client.send(
      new DescribeLogStreamsCommand({
        logGroupName: params.logGroupName,
        orderBy: "LastEventTime",
        descending: true,
        nextToken,
      }),
    );

    if (res.logStreams) {
      for (const s of res.logStreams) {
        summaries.push({
          name: s.logStreamName ?? "",
          firstEventTime: s.firstEventTimestamp,
          lastEventTime: s.lastEventTimestamp,
          storedBytes: s.storedBytes ?? 0,
        });
      }
    }

    nextToken = res.nextToken;
  } while (nextToken);

  return summaries;
}

export async function deleteLogStream(
  client: CloudWatchLogsClient,
  params: { logGroupName: string; streamName: string },
): Promise<void> {
  await client.send(
    new DeleteLogStreamCommand({
      logGroupName: params.logGroupName,
      logStreamName: params.streamName,
    }),
  );
}

export async function fetchLogEvents(
  client: CloudWatchLogsClient,
  params: {
    logGroupName: string;
    streamName?: string;
    filterPattern?: string;
    nextToken?: string;
    startTime?: number;
  },
): Promise<{ events: LogEventRecord[]; nextToken?: string }> {
  const res = await client.send(
    new FilterLogEventsCommand({
      logGroupName: params.logGroupName,
      logStreamNames: params.streamName ? [params.streamName] : undefined,
      filterPattern: params.filterPattern || undefined,
      nextToken: params.nextToken,
      startTime: params.startTime,
    }),
  );

  const events: LogEventRecord[] = [];
  if (res.events) {
    for (const ev of res.events) {
      if (ev.timestamp === undefined || ev.message === undefined) {
        continue;
      }
      const id =
        ev.eventId ??
        `${ev.timestamp}|${ev.logStreamName ?? ""}|${ev.message}`;
      events.push({
        id,
        timestamp: ev.timestamp,
        streamName: ev.logStreamName ?? "",
        message: ev.message,
      });
    }
  }

  return {
    events,
    nextToken: res.nextToken,
  };
}

export function mergeLogEvents(
  existing: LogEventRecord[],
  incoming: LogEventRecord[],
): LogEventRecord[] {
  const map = new Map<string, LogEventRecord>();
  for (const ev of existing) {
    map.set(ev.id, ev);
  }
  for (const ev of incoming) {
    map.set(ev.id, ev);
  }

  const all = Array.from(map.values());
  all.sort((a, b) => a.timestamp - b.timestamp);

  if (all.length > MAX_LOG_EVENTS) {
    return all.slice(all.length - MAX_LOG_EVENTS);
  }
  return all;
}
