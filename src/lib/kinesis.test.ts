import { describe, it, expect, vi } from "vitest";
import type { KinesisClient } from "@aws-sdk/client-kinesis";
import {
  listStreams,
  createStream,
  deleteStream,
  describeStreamSummary,
  putRecord,
  listShards,
  peekRecords,
  listConsumers,
} from "./kinesis";

describe("kinesis data plane", () => {
  describe("listStreams", () => {
    it("paginates by NextToken and sorts by name", async () => {
      const send = vi
        .fn()
        .mockResolvedValueOnce({
          StreamNames: ["zebra", "alpha"],
          HasMoreStreams: true,
          NextToken: "t1",
        })
        .mockResolvedValueOnce({
          StreamNames: ["beta"],
          HasMoreStreams: false,
        });

      const client = { send } as unknown as KinesisClient;
      const names = await listStreams(client);

      expect(send).toHaveBeenCalledTimes(2);
      expect(send).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({
          input: { NextToken: "t1" },
        }),
      );
      expect(names).toEqual(["alpha", "beta", "zebra"]);
    });

    it("handles empty results", async () => {
      const send = vi.fn().mockResolvedValueOnce({});
      const client = { send } as unknown as KinesisClient;
      expect(await listStreams(client)).toEqual([]);
    });
  });

  describe("createStream and deleteStream", () => {
    it("creates with a default shard count of 1", async () => {
      const send = vi.fn().mockResolvedValueOnce({});
      const client = { send } as unknown as KinesisClient;
      await createStream(client, { name: "s" });
      expect(send).toHaveBeenCalledWith(
        expect.objectContaining({
          input: { StreamName: "s", ShardCount: 1 },
        }),
      );
    });

    it("deletes by stream name", async () => {
      const send = vi.fn().mockResolvedValueOnce({});
      const client = { send } as unknown as KinesisClient;
      await deleteStream(client, "s");
      expect(send).toHaveBeenCalledWith(
        expect.objectContaining({
          input: { StreamName: "s" },
        }),
      );
    });
  });

  describe("describeStreamSummary", () => {
    it("maps status, shard count, and retention", async () => {
      const send = vi.fn().mockResolvedValueOnce({
        StreamDescriptionSummary: {
          StreamName: "s",
          StreamARN: "arn:aws:kinesis:us-east-1:000000000000:stream/s",
          StreamStatus: "ACTIVE",
          OpenShardCount: 3,
          RetentionPeriodHours: 24,
        },
      });
      const client = { send } as unknown as KinesisClient;

      const summary = await describeStreamSummary(client, "s");
      expect(summary).toEqual({
        name: "s",
        arn: "arn:aws:kinesis:us-east-1:000000000000:stream/s",
        status: "ACTIVE",
        shardCount: 3,
        retentionPeriodHours: 24,
      });
    });

    it("throws when the summary is missing", async () => {
      const send = vi.fn().mockResolvedValueOnce({});
      const client = { send } as unknown as KinesisClient;
      await expect(describeStreamSummary(client, "s")).rejects.toThrow(
        "DescribeStreamSummary returned no summary",
      );
    });
  });

  describe("putRecord", () => {
    it("encodes data and returns sequence number and shard", async () => {
      const send = vi.fn().mockResolvedValueOnce({
        SequenceNumber: "1",
        ShardId: "shard-1",
      });
      const client = { send } as unknown as KinesisClient;

      const res = await putRecord(client, {
        streamName: "s",
        data: "hello",
        partitionKey: "k1",
      });

      expect(res).toEqual({ sequenceNumber: "1", shardId: "shard-1" });
      expect(send).toHaveBeenCalledWith(
        expect.objectContaining({
          input: expect.objectContaining({
            StreamName: "s",
            PartitionKey: "k1",
          }),
        }),
      );
    });

    it("throws when no sequence number is returned", async () => {
      const send = vi.fn().mockResolvedValueOnce({});
      const client = { send } as unknown as KinesisClient;
      await expect(
        putRecord(client, { streamName: "s", data: "x", partitionKey: "k" }),
      ).rejects.toThrow("PutRecord returned no sequence number");
    });
  });

  describe("listShards", () => {
    it("paginates shards by NextToken", async () => {
      const send = vi
        .fn()
        .mockResolvedValueOnce({
          Shards: [{ ShardId: "a", SequenceNumberRange: { StartingSequenceNumber: "1" } }],
          NextToken: "t",
        })
        .mockResolvedValueOnce({
          Shards: [{ ShardId: "b" }],
        });

      const client = { send } as unknown as KinesisClient;
      const shards = await listShards(client, "s");

      expect(send).toHaveBeenCalledTimes(2);
      expect(shards).toEqual([
        { shardId: "a", sequenceNumberRange: { start: "1", end: undefined } },
        { shardId: "b", sequenceNumberRange: undefined },
      ]);
    });
  });

  describe("peekRecords", () => {
    it("iterates TRIM_HORIZON and decodes UTF-8 payloads", async () => {
      const send = vi
        .fn()
        .mockResolvedValueOnce({ ShardIterator: "iter" })
        .mockResolvedValueOnce({
          Records: [
            {
              SequenceNumber: "10",
              PartitionKey: "k1",
              Data: new Uint8Array([104, 105]), // "hi"
              ApproximateArrivalTimestamp: new Date("2024-01-01T00:00:00Z"),
            },
            {
              SequenceNumber: "11",
              PartitionKey: "k2",
              Data: new Uint8Array([0xff, 0xfe]), // invalid UTF-8 → base64
            },
          ],
        });

      const client = { send } as unknown as KinesisClient;
      const records = await peekRecords(client, { streamName: "s", shardId: "shard-1" });

      expect(send).toHaveBeenNthCalledWith(
        1,
        expect.objectContaining({
          input: expect.objectContaining({
            StreamName: "s",
            ShardId: "shard-1",
            ShardIteratorType: "TRIM_HORIZON",
          }),
        }),
      );
      expect(records).toEqual([
        {
          sequenceNumber: "10",
          partitionKey: "k1",
          data: "hi",
          approxArrival: new Date("2024-01-01T00:00:00Z"),
        },
        {
          sequenceNumber: "11",
          partitionKey: "k2",
          data: "//4=",
          approxArrival: undefined,
        },
      ]);
    });

    it("throws when no iterator is returned", async () => {
      const send = vi.fn().mockResolvedValueOnce({});
      const client = { send } as unknown as KinesisClient;
      await expect(
        peekRecords(client, { streamName: "s", shardId: "shard-1" }),
      ).rejects.toThrow("GetShardIterator returned no iterator");
    });
  });

  describe("listConsumers", () => {
    it("resolves the stream ARN and paginates consumers", async () => {
      const send = vi
        .fn()
        .mockResolvedValueOnce({
          StreamDescriptionSummary: {
            StreamName: "s",
            StreamARN: "arn:aws:kinesis:us-east-1:000000000000:stream/s",
            StreamStatus: "ACTIVE",
          },
        })
        .mockResolvedValueOnce({
          Consumers: [{ ConsumerARN: "arn:consumer/a", ConsumerName: "alpha" }],
          NextToken: "t",
        })
        .mockResolvedValueOnce({
          Consumers: [{ ConsumerARN: "arn:consumer/b", ConsumerName: "beta" }],
        });

      const client = { send } as unknown as KinesisClient;
      const consumers = await listConsumers(client, "s");

      expect(send).toHaveBeenCalledTimes(3);
      expect(consumers).toEqual([
        { arn: "arn:consumer/a", name: "alpha" },
        { arn: "arn:consumer/b", name: "beta" },
      ]);
    });
  });
});
