import { describe, it, expect, vi } from "vitest";
import type { DynamoDBStreamsClient } from "@aws-sdk/client-dynamodb-streams";
import { listStreamShards, peekStreamRecords } from "./dynamodb-streams";

const ARN = "arn:aws:dynamodb:us-east-1:000000000000:table/t/stream/2024";

describe("dynamodb-streams data plane", () => {
  describe("listStreamShards", () => {
    it("paginates shards with ExclusiveStartShardId and maps ranges", async () => {
      const send = vi
        .fn()
        .mockResolvedValueOnce({
          StreamDescription: {
            Shards: [
              {
                ShardId: "shardId-1",
                SequenceNumberRange: { StartingSequenceNumber: "100" },
              },
            ],
            LastEvaluatedShardId: "shardId-1",
          },
        })
        .mockResolvedValueOnce({
          StreamDescription: {
            Shards: [
              {
                ShardId: "shardId-2",
                SequenceNumberRange: {
                  StartingSequenceNumber: "200",
                  EndingSequenceNumber: "299",
                },
              },
            ],
          },
        });

      const client = { send } as unknown as DynamoDBStreamsClient;
      const shards = await listStreamShards(client, ARN);

      expect(send).toHaveBeenCalledTimes(2);
      expect(send).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({
          input: expect.objectContaining({
            StreamArn: ARN,
            ExclusiveStartShardId: "shardId-1",
          }),
        }),
      );
      expect(shards).toEqual([
        { shardId: "shardId-1", sequenceNumberRange: { start: "100", end: undefined } },
        { shardId: "shardId-2", sequenceNumberRange: { start: "200", end: "299" } },
      ]);
    });

    it("handles missing stream description", async () => {
      const send = vi.fn().mockResolvedValueOnce({});
      const client = { send } as unknown as DynamoDBStreamsClient;
      expect(await listStreamShards(client, ARN)).toEqual([]);
    });
  });

  describe("peekStreamRecords", () => {
    it("throws when the stream has no shards", async () => {
      const send = vi.fn().mockResolvedValueOnce({
        StreamDescription: { Shards: [] },
      });
      const client = { send } as unknown as DynamoDBStreamsClient;
      await expect(peekStreamRecords(client, ARN)).rejects.toThrow(
        "No shards available on stream",
      );
    });

    it("peeks records from the first shard and unmarshals images", async () => {
      const send = vi
        .fn()
        .mockResolvedValueOnce({
          StreamDescription: {
            Shards: [{ ShardId: "shardId-1" }],
          },
        })
        .mockResolvedValueOnce({ ShardIterator: "iter-1" })
        .mockResolvedValueOnce({
          Records: [
            {
              eventName: "INSERT",
              dynamodb: {
                SequenceNumber: "300",
                ApproximateCreationDateTime: new Date("2024-01-01T00:00:00Z"),
                Keys: { pk: { S: "a" } },
                NewImage: { pk: { S: "a" }, v: { N: "42" } },
                OldImage: { pk: { S: "a" }, v: { N: "41" } },
              },
            },
          ],
        });

      const client = { send } as unknown as DynamoDBStreamsClient;
      const records = await peekStreamRecords(client, ARN);

      expect(send).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({
          input: expect.objectContaining({
            StreamArn: ARN,
            ShardId: "shardId-1",
            ShardIteratorType: "TRIM_HORIZON",
          }),
        }),
      );
      expect(records).toEqual([
        {
          sequenceNumber: "300",
          approxArrival: new Date("2024-01-01T00:00:00Z"),
          eventName: "INSERT",
          keys: { pk: "a" },
          newImage: { pk: "a", v: 42 },
          oldImage: { pk: "a", v: 41 },
        },
      ]);
    });

    it("throws when no iterator is returned", async () => {
      const send = vi
        .fn()
        .mockResolvedValueOnce({
          StreamDescription: { Shards: [{ ShardId: "shardId-1" }] },
        })
        .mockResolvedValueOnce({});

      const client = { send } as unknown as DynamoDBStreamsClient;
      await expect(peekStreamRecords(client, ARN)).rejects.toThrow(
        "GetShardIterator returned no iterator",
      );
    });
  });
});
