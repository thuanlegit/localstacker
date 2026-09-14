import {
  type KinesisClient,
  ListStreamsCommand,
  DescribeStreamSummaryCommand,
  CreateStreamCommand,
  DeleteStreamCommand,
  PutRecordCommand,
  ListShardsCommand,
  GetShardIteratorCommand,
  GetRecordsCommand,
  ListStreamConsumersCommand,
  type ListStreamsCommandOutput,
  type ListShardsCommandOutput,
  type ListStreamConsumersCommandOutput,
} from "@aws-sdk/client-kinesis";

const textDecoder = new TextDecoder("utf-8", { fatal: true });
const textEncoder = new TextEncoder();

export interface StreamSummary {
  name: string;
  arn?: string;
  status: string;
  shardCount?: number;
  retentionPeriodHours?: number;
}

export interface ShardLite {
  shardId: string;
  sequenceNumberRange?: { start?: string; end?: string };
}

export interface KinesisRecordLite {
  sequenceNumber: string;
  partitionKey: string;
  data: string;
  approxArrival?: Date;
}

function decodeData(data: Uint8Array | undefined): string {
  if (!data) return "";
  try {
    return textDecoder.decode(data);
  } catch {
    // Not valid UTF-8 — surface the raw bytes as base64.
    let binary = "";
    for (const byte of data) binary += String.fromCharCode(byte);
    return btoa(binary);
  }
}

export async function listStreams(client: KinesisClient): Promise<string[]> {
  const names: string[] = [];
  let nextToken: string | undefined = undefined;

  do {
    const res: ListStreamsCommandOutput = await client.send(new ListStreamsCommand({ NextToken: nextToken }));
    if (res.StreamNames) {
      names.push(...res.StreamNames);
    }
    nextToken = res.NextToken;
  } while (nextToken);

  names.sort((a, b) => a.localeCompare(b));
  return names;
}

export async function createStream(
  client: KinesisClient,
  params: { name: string; shardCount?: number },
): Promise<void> {
  await client.send(
    new CreateStreamCommand({
      StreamName: params.name,
      ShardCount: params.shardCount ?? 1,
    }),
  );
}

export async function deleteStream(client: KinesisClient, name: string): Promise<void> {
  await client.send(new DeleteStreamCommand({ StreamName: name }));
}

export async function describeStreamSummary(
  client: KinesisClient,
  name: string,
): Promise<StreamSummary> {
  const res = await client.send(
    new DescribeStreamSummaryCommand({ StreamName: name }),
  );
  const s = res.StreamDescriptionSummary;
  if (!s?.StreamName) {
    throw new Error("DescribeStreamSummary returned no summary");
  }
  return {
    name: s.StreamName,
    arn: s.StreamARN,
    status: s.StreamStatus ?? "UNKNOWN",
    shardCount: s.OpenShardCount,
    retentionPeriodHours: s.RetentionPeriodHours,
  };
}

export async function putRecord(
  client: KinesisClient,
  params: { streamName: string; data: string; partitionKey: string },
): Promise<{ sequenceNumber: string; shardId?: string }> {
  const res = await client.send(
    new PutRecordCommand({
      StreamName: params.streamName,
      Data: textEncoder.encode(params.data),
      PartitionKey: params.partitionKey,
    }),
  );

  if (!res.SequenceNumber) {
    throw new Error("PutRecord returned no sequence number");
  }

  return { sequenceNumber: res.SequenceNumber, shardId: res.ShardId };
}

export async function listShards(
  client: KinesisClient,
  streamName: string,
): Promise<ShardLite[]> {
  const shards: ShardLite[] = [];
  let nextToken: string | undefined = undefined;

  do {
    const res: ListShardsCommandOutput = await client.send(
      new ListShardsCommand({ StreamName: streamName, NextToken: nextToken }),
    );

    for (const shard of res.Shards ?? []) {
      if (shard.ShardId) {
        shards.push({
          shardId: shard.ShardId,
          sequenceNumberRange: shard.SequenceNumberRange
            ? {
                start: shard.SequenceNumberRange.StartingSequenceNumber,
                end: shard.SequenceNumberRange.EndingSequenceNumber,
              }
            : undefined,
        });
      }
    }

    nextToken = res.NextToken;
  } while (nextToken);

  return shards;
}

export async function peekRecords(
  client: KinesisClient,
  params: { streamName: string; shardId: string },
): Promise<KinesisRecordLite[]> {
  const iterator = await client.send(
    new GetShardIteratorCommand({
      StreamName: params.streamName,
      ShardId: params.shardId,
      ShardIteratorType: "TRIM_HORIZON",
    }),
  );
  if (!iterator.ShardIterator) {
    throw new Error("GetShardIterator returned no iterator");
  }

  const res = await client.send(
    new GetRecordsCommand({ ShardIterator: iterator.ShardIterator }),
  );

  const records: KinesisRecordLite[] = [];
  for (const record of res.Records ?? []) {
    records.push({
      sequenceNumber: record.SequenceNumber ?? "",
      partitionKey: record.PartitionKey ?? "",
      data: decodeData(record.Data),
      approxArrival: record.ApproximateArrivalTimestamp ?? undefined,
    });
  }

  return records;
}

export interface ConsumerEntry {
  arn: string;
  name: string;
}

export async function listConsumers(
  client: KinesisClient,
  streamName: string,
): Promise<ConsumerEntry[]> {
  const summary = await describeStreamSummary(client, streamName);
  if (!summary.arn) {
    throw new Error("DescribeStreamSummary returned no ARN");
  }

  const consumers: ConsumerEntry[] = [];
  let nextToken: string | undefined = undefined;

  do {
    const res: ListStreamConsumersCommandOutput = await client.send(
      new ListStreamConsumersCommand({ StreamARN: summary.arn, NextToken: nextToken }),
    );

    for (const consumer of res.Consumers ?? []) {
      if (consumer.ConsumerARN && consumer.ConsumerName) {
        consumers.push({ arn: consumer.ConsumerARN, name: consumer.ConsumerName });
      }
    }

    nextToken = res.NextToken;
  } while (nextToken);

  return consumers;
}
