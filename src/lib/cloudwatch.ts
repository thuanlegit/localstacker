import {
  type CloudWatchClient,
  ListMetricsCommand,
  PutMetricDataCommand,
  GetMetricStatisticsCommand,
  DescribeAlarmsCommand,
  PutMetricAlarmCommand,
  DeleteAlarmsCommand,
  type Statistic,
  type ComparisonOperator,
  type Dimension as SdkDimension,
} from "@aws-sdk/client-cloudwatch";

export interface MetricSummary {
  namespace: string;
  metricName: string;
  dimensions: { name: string; value: string }[];
}

export interface AlarmSummary {
  name: string;
  arn: string;
  state: string;
  stateReason: string;
  namespace: string;
  metricName: string;
  comparison: string;
  threshold: number;
  evaluationPeriods: number;
  period: number;
  dimensions: { name: string; value: string }[];
  actionsEnabled: boolean;
}

export interface MetricDatapoint {
  timestamp: Date;
  average?: number;
  maximum?: number;
  minimum?: number;
  sum?: number;
  sampleCount?: number;
}

function mapDimensions(
  dims: SdkDimension[] | undefined,
): { name: string; value: string }[] {
  return (dims ?? []).map((d) => ({ name: d.Name ?? "", value: d.Value ?? "" }));
}

export async function listMetrics(
  client: CloudWatchClient,
  options?: { namespace?: string },
): Promise<MetricSummary[]> {
  const out: MetricSummary[] = [];
  let nextToken: string | undefined;
  do {
    const res = await client.send(
      new ListMetricsCommand({
        Namespace: options?.namespace || undefined,
        NextToken: nextToken,
      }),
    );
    for (const m of res.Metrics ?? []) {
      if (!m.MetricName) continue;
      out.push({
        namespace: m.Namespace ?? "",
        metricName: m.MetricName,
        dimensions: mapDimensions(m.Dimensions),
      });
    }
    nextToken = res.NextToken;
  } while (nextToken);
  return out;
}

export async function putMetricData(
  client: CloudWatchClient,
  input: {
    namespace: string;
    metricName: string;
    value: number;
    dimensions?: { name: string; value: string }[];
  },
): Promise<void> {
  await client.send(
    new PutMetricDataCommand({
      Namespace: input.namespace,
      MetricData: [
        {
          MetricName: input.metricName,
          Value: input.value,
          Dimensions: input.dimensions?.map((d) => ({ Name: d.name, Value: d.value })),
        },
      ],
    }),
  );
}

export async function getMetricStatistics(
  client: CloudWatchClient,
  input: {
    namespace: string;
    metricName: string;
    dimensions: { name: string; value: string }[];
    startTime: Date;
    endTime: Date;
    period: number;
    statistics: string[];
  },
): Promise<MetricDatapoint[]> {
  const res = await client.send(
    new GetMetricStatisticsCommand({
      Namespace: input.namespace,
      MetricName: input.metricName,
      Dimensions: input.dimensions.map((d) => ({ Name: d.name, Value: d.value })),
      StartTime: input.startTime,
      EndTime: input.endTime,
      Period: input.period,
      Statistics: input.statistics as Statistic[],
    }),
  );
  const points: MetricDatapoint[] = (res.Datapoints ?? []).map((p) => ({
    timestamp: p.Timestamp ?? new Date(0),
    average: p.Average,
    maximum: p.Maximum,
    minimum: p.Minimum,
    sum: p.Sum,
    sampleCount: p.SampleCount,
  }));
  return points.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
}

export async function listAlarms(client: CloudWatchClient): Promise<AlarmSummary[]> {
  const out: AlarmSummary[] = [];
  let nextToken: string | undefined;
  do {
    const res = await client.send(new DescribeAlarmsCommand({ NextToken: nextToken }));
    for (const a of res.MetricAlarms ?? []) {
      if (!a.AlarmName) continue;
      out.push({
        name: a.AlarmName,
        arn: a.AlarmArn ?? "",
        state: a.StateValue ?? "",
        stateReason: a.StateReason ?? "",
        namespace: a.Namespace ?? "",
        metricName: a.MetricName ?? "",
        comparison: a.ComparisonOperator ?? "",
        threshold: a.Threshold ?? 0,
        evaluationPeriods: a.EvaluationPeriods ?? 0,
        period: a.Period ?? 0,
        dimensions: mapDimensions(a.Dimensions),
        actionsEnabled: a.ActionsEnabled ?? true,
      });
    }
    nextToken = res.NextToken;
  } while (nextToken);
  return out;
}

export async function createAlarm(
  client: CloudWatchClient,
  input: {
    name: string;
    namespace: string;
    metricName: string;
    comparison: string;
    threshold: number;
    evaluationPeriods: number;
    period: number;
    dimensions?: { name: string; value: string }[];
  },
): Promise<void> {
  await client.send(
    new PutMetricAlarmCommand({
      AlarmName: input.name,
      Namespace: input.namespace,
      MetricName: input.metricName,
      ComparisonOperator: input.comparison as ComparisonOperator,
      Threshold: input.threshold,
      EvaluationPeriods: input.evaluationPeriods,
      Period: input.period,
      Statistic: "Average",
      Dimensions: input.dimensions?.map((d) => ({ Name: d.name, Value: d.value })),
    }),
  );
}

export async function deleteAlarm(client: CloudWatchClient, name: string): Promise<void> {
  await client.send(new DeleteAlarmsCommand({ AlarmNames: [name] }));
}
