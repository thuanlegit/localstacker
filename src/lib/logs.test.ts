import { describe, it, expect, vi } from "vitest";
import type { CloudWatchLogsClient } from "@aws-sdk/client-cloudwatch-logs";
import {
  describeLogGroups,
  createLogGroup,
  deleteLogGroup,
  describeLogStreams,
  deleteLogStream,
  fetchLogEvents,
  mergeLogEvents,
  TAIL_POLL_INTERVAL_MS,
  MAX_LOG_EVENTS,
  type LogEventRecord,
} from "./logs";

describe("logs constants", () => {
  it("exports expected constants", () => {
    expect(TAIL_POLL_INTERVAL_MS).toBe(3000);
    expect(MAX_LOG_EVENTS).toBe(5000);
  });
});

describe("describeLogGroups", () => {
  it("paginates and maps log group summaries", async () => {
    const send = vi
      .fn()
      .mockResolvedValueOnce({
        logGroups: [
          {
            logGroupName: "/aws/lambda/fn-1",
            storedBytes: 2048,
            retentionInDays: 14,
          },
        ],
        nextToken: "next-group-token",
      })
      .mockResolvedValueOnce({
        logGroups: [
          {
            logGroupName: "/app/backend",
            storedBytes: 4096,
          },
        ],
      });

    const client = { send } as unknown as CloudWatchLogsClient;
    const groups = await describeLogGroups(client);

    expect(send).toHaveBeenCalledTimes(2);
    expect(groups).toEqual([
      {
        name: "/aws/lambda/fn-1",
        sizeBytes: 2048,
        retentionInDays: 14,
        lastEventTime: undefined,
      },
      {
        name: "/app/backend",
        sizeBytes: 4096,
        retentionInDays: undefined,
        lastEventTime: undefined,
      },
    ]);
  });

  it("handles empty response", async () => {
    const send = vi.fn().mockResolvedValueOnce({});
    const client = { send } as unknown as CloudWatchLogsClient;
    const groups = await describeLogGroups(client);
    expect(groups).toEqual([]);
  });
});

describe("createLogGroup and deleteLogGroup", () => {
  it("creates log group", async () => {
    const send = vi.fn().mockResolvedValueOnce({});
    const client = { send } as unknown as CloudWatchLogsClient;
    await createLogGroup(client, "/aws/lambda/my-fn");
    expect(send).toHaveBeenCalledWith(
      expect.objectContaining({
        input: { logGroupName: "/aws/lambda/my-fn" },
      }),
    );
  });

  it("deletes log group", async () => {
    const send = vi.fn().mockResolvedValueOnce({});
    const client = { send } as unknown as CloudWatchLogsClient;
    await deleteLogGroup(client, "/aws/lambda/my-fn");
    expect(send).toHaveBeenCalledWith(
      expect.objectContaining({
        input: { logGroupName: "/aws/lambda/my-fn" },
      }),
    );
  });
});

describe("describeLogStreams and deleteLogStream", () => {
  it("describes log streams ordered by LastEventTime descending", async () => {
    const send = vi.fn().mockResolvedValueOnce({
      logStreams: [
        {
          logStreamName: "stream-2",
          firstEventTimestamp: 1000,
          lastEventTimestamp: 5000,
          storedBytes: 100,
        },
        {
          logStreamName: "stream-1",
          firstEventTimestamp: 500,
          lastEventTimestamp: 2000,
          storedBytes: 50,
        },
      ],
    });

    const client = { send } as unknown as CloudWatchLogsClient;
    const streams = await describeLogStreams(client, {
      logGroupName: "/my-group",
    });

    expect(streams).toEqual([
      {
        name: "stream-2",
        firstEventTime: 1000,
        lastEventTime: 5000,
        storedBytes: 100,
      },
      {
        name: "stream-1",
        firstEventTime: 500,
        lastEventTime: 2000,
        storedBytes: 50,
      },
    ]);
    expect(send).toHaveBeenCalledWith(
      expect.objectContaining({
        input: expect.objectContaining({
          logGroupName: "/my-group",
          orderBy: "LastEventTime",
          descending: true,
        }),
      }),
    );
  });

  it("deletes log stream", async () => {
    const send = vi.fn().mockResolvedValueOnce({});
    const client = { send } as unknown as CloudWatchLogsClient;
    await deleteLogStream(client, {
      logGroupName: "/my-group",
      streamName: "stream-1",
    });

    expect(send).toHaveBeenCalledWith(
      expect.objectContaining({
        input: {
          logGroupName: "/my-group",
          logStreamName: "stream-1",
        },
      }),
    );
  });
});

describe("fetchLogEvents", () => {
  it("fetches log events using FilterLogEventsCommand and defensively maps records", async () => {
    const send = vi.fn().mockResolvedValueOnce({
      events: [
        {
          eventId: "ev-1",
          timestamp: 1700000000,
          logStreamName: "2026/01/01/[$LATEST]1",
          message: "START RequestId: 12345",
        },
        {
          // Missing eventId -> falls back to generated key
          timestamp: 1700000005,
          logStreamName: "2026/01/01/[$LATEST]1",
          message: "END RequestId: 12345",
        },
        {
          // Malformed record missing timestamp or message -> skipped defensively
          eventId: "malformed",
        },
      ],
      nextToken: "next-event-token",
    });

    const client = { send } as unknown as CloudWatchLogsClient;
    const res = await fetchLogEvents(client, {
      logGroupName: "/aws/lambda/fn",
      streamName: "2026/01/01/[$LATEST]1",
      filterPattern: "RequestId",
      startTime: 1699999000,
    });

    expect(res.nextToken).toBe("next-event-token");
    expect(res.events).toHaveLength(2);
    expect(res.events[0]).toEqual({
      id: "ev-1",
      timestamp: 1700000000,
      streamName: "2026/01/01/[$LATEST]1",
      message: "START RequestId: 12345",
    });
    expect(res.events[1].id).toBe(
      "1700000005|2026/01/01/[$LATEST]1|END RequestId: 12345",
    );
    expect(send).toHaveBeenCalledWith(
      expect.objectContaining({
        input: {
          logGroupName: "/aws/lambda/fn",
          logStreamNames: ["2026/01/01/[$LATEST]1"],
          filterPattern: "RequestId",
          nextToken: undefined,
          startTime: 1699999000,
        },
      }),
    );
  });
});

describe("mergeLogEvents", () => {
  it("deduplicates by id, sorts timestamp ascending", () => {
    const existing: LogEventRecord[] = [
      { id: "1", timestamp: 100, streamName: "s1", message: "first" },
      { id: "2", timestamp: 200, streamName: "s1", message: "second" },
    ];
    const incoming: LogEventRecord[] = [
      { id: "2", timestamp: 200, streamName: "s1", message: "second updated" },
      { id: "3", timestamp: 150, streamName: "s1", message: "middle" },
      { id: "4", timestamp: 300, streamName: "s1", message: "fourth" },
    ];

    const merged = mergeLogEvents(existing, incoming);

    expect(merged.map((m) => m.id)).toEqual(["1", "3", "2", "4"]);
    expect(merged.find((m) => m.id === "2")?.message).toBe("second updated");
  });

  it("caps events at MAX_LOG_EVENTS keeping newest", () => {
    const existing: LogEventRecord[] = Array.from(
      { length: MAX_LOG_EVENTS },
      (_, i) => ({
        id: `ev-${i}`,
        timestamp: i,
        streamName: "s",
        message: `msg-${i}`,
      }),
    );
    const incoming: LogEventRecord[] = [
      { id: "new-1", timestamp: 10000, streamName: "s", message: "new 1" },
      { id: "new-2", timestamp: 10001, streamName: "s", message: "new 2" },
    ];

    const merged = mergeLogEvents(existing, incoming);

    expect(merged).toHaveLength(MAX_LOG_EVENTS);
    expect(merged[merged.length - 1].id).toBe("new-2");
    expect(merged[merged.length - 2].id).toBe("new-1");
    // The oldest 2 items (ev-0, ev-1) should have been dropped
    expect(merged[0].id).toBe("ev-2");
  });
});
