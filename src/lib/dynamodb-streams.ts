import {
  type DynamoDBStreamsClient,
  DescribeStreamCommand,
  GetShardIteratorCommand,
  GetRecordsCommand,
  type DescribeStreamCommandOutput,
} from "@aws-sdk/client-dynamodb-streams";
import { unmarshall } from "@aws-sdk/util-dynamodb";

export interface StreamShard {
  shardId: string;
  sequenceNumberRange?: { start?: string; end?: string };
}

export interface StreamRecordLite {
  sequenceNumber: string;
  approxArrival?: Date;
  eventName?: string;
  keys?: Record<string, unknown>;
  oldImage?: Record<string, unknown>;
  newImage?: Record<string, unknown>;
}

export async function listStreamShards(
  client: DynamoDBStreamsClient,
  streamArn: string,
): Promise<StreamShard[]> {
  const shards: StreamShard[] = [];
  let exclusiveStartShardId: string | undefined = undefined;

  do {
    const res: DescribeStreamCommandOutput = await client.send(
      new DescribeStreamCommand({
        StreamArn: streamArn,
        ExclusiveStartShardId: exclusiveStartShardId,
      }),
    );

    for (const shard of res.StreamDescription?.Shards ?? []) {
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

    exclusiveStartShardId = res.StreamDescription?.LastEvaluatedShardId;
  } while (exclusiveStartShardId);

  return shards;
}

export async function peekStreamRecords(
  client: DynamoDBStreamsClient,
  streamArn: string,
  params?: { limit?: number },
): Promise<StreamRecordLite[]> {
  const limit = params?.limit ?? 20;

  const shards = await listStreamShards(client, streamArn);
  if (shards.length === 0) {
    throw new Error("No shards available on stream");
  }

  const iterator = await client.send(
    new GetShardIteratorCommand({
      StreamArn: streamArn,
      ShardId: shards[0].shardId,
      ShardIteratorType: "TRIM_HORIZON",
    }),
  );
  if (!iterator.ShardIterator) {
    throw new Error("GetShardIterator returned no iterator");
  }

  const res = await client.send(
    new GetRecordsCommand({ ShardIterator: iterator.ShardIterator }),
  );

  const records: StreamRecordLite[] = [];
  for (const record of res.Records ?? []) {
    const dynamodb = record.dynamodb;
    records.push({
      sequenceNumber: dynamodb?.SequenceNumber ?? "",
      approxArrival: dynamodb?.ApproximateCreationDateTime ?? undefined,
      eventName: record.eventName ?? undefined,
      keys: dynamodb?.Keys ? unmarshall(dynamodb.Keys) : undefined,
      oldImage: dynamodb?.OldImage ? unmarshall(dynamodb.OldImage) : undefined,
      newImage: dynamodb?.NewImage ? unmarshall(dynamodb.NewImage) : undefined,
    });
    if (records.length >= limit) break;
  }

  return records;
}
