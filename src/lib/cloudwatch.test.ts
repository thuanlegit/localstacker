import { describe, it, expect, vi } from "vitest";
import type { CloudWatchClient } from "@aws-sdk/client-cloudwatch";
import {
  listMetrics,
  putMetricData,
  getMetricStatistics,
  listAlarms,
  createAlarm,
  deleteAlarm,
} from "./cloudwatch";

describe("cloudwatch data plane", () => {
  describe("listMetrics", () => {
    it("paginates by NextToken and maps namespace, name, dimensions", async () => {
      const send = vi
        .fn()
        .mockResolvedValueOnce({
          Metrics: [
            {
              Namespace: "E2E",
              MetricName: "Orders",
              Dimensions: [{ Name: "Service", Value: "checkout" }],
            },
          ],
          NextToken: "t1",
        })
        .mockResolvedValueOnce({
          Metrics: [{ Namespace: "E2E", MetricName: "Latency", Dimensions: [] }],
        });

      const client = { send } as unknown as CloudWatchClient;
      const metrics = await listMetrics(client);

      expect(send).toHaveBeenCalledTimes(2);
      expect(send).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({ input: { NextToken: "t1" } }),
      );
      expect(metrics).toEqual([
        {
          namespace: "E2E",
          metricName: "Orders",
          dimensions: [{ name: "Service", value: "checkout" }],
        },
        { namespace: "E2E", metricName: "Latency", dimensions: [] },
      ]);
    });

    it("filters by namespace on the wire", async () => {
      const send = vi.fn().mockResolvedValueOnce({ Metrics: [] });
      const client = { send } as unknown as CloudWatchClient;
      await listMetrics(client, { namespace: "E2E" });
      expect(send).toHaveBeenCalledWith(
        expect.objectContaining({ input: { Namespace: "E2E" } }),
      );
    });

    it("handles empty results", async () => {
      const send = vi.fn().mockResolvedValueOnce({});
      const client = { send } as unknown as CloudWatchClient;
      expect(await listMetrics(client)).toEqual([]);
    });
  });

  describe("putMetricData", () => {
    it("sends namespace, metric, value, and dimensions", async () => {
      const send = vi.fn().mockResolvedValueOnce({});
      const client = { send } as unknown as CloudWatchClient;
      await putMetricData(client, {
        namespace: "E2E",
        metricName: "Orders",
        value: 42,
        dimensions: [{ name: "Service", value: "checkout" }],
      });

      expect(send).toHaveBeenCalledWith(
        expect.objectContaining({
          input: {
            Namespace: "E2E",
            MetricData: [
              {
                MetricName: "Orders",
                Value: 42,
                Dimensions: [{ Name: "Service", Value: "checkout" }],
              },
            ],
          },
        }),
      );
    });
  });

  describe("getMetricStatistics", () => {
    it("maps datapoints sorted by timestamp descending", async () => {
      const t1 = new Date("2026-09-14T10:00:00Z");
      const t2 = new Date("2026-09-14T11:00:00Z");
      const send = vi.fn().mockResolvedValueOnce({
        Datapoints: [
          { Timestamp: t1, Average: 1, Maximum: 2 },
          { Timestamp: t2, Average: 3, Maximum: 4 },
        ],
      });
      const client = { send } as unknown as CloudWatchClient;
      const points = await getMetricStatistics(client, {
        namespace: "E2E",
        metricName: "Latency",
        dimensions: [],
        startTime: new Date("2026-09-14T09:00:00Z"),
        endTime: new Date("2026-09-14T12:00:00Z"),
        period: 300,
        statistics: ["Average"],
      });

      const input = (send.mock.calls[0] as unknown[])[0] as { input: Record<string, unknown> };
      expect(input.input.Statistics).toEqual(["Average"]);
      expect(points).toEqual([
        { timestamp: t2, average: 3, maximum: 4 },
        { timestamp: t1, average: 1, maximum: 2 },
      ]);
    });

    it("returns empty array when no datapoints", async () => {
      const send = vi.fn().mockResolvedValueOnce({});
      const client = { send } as unknown as CloudWatchClient;
      const points = await getMetricStatistics(client, {
        namespace: "E2E",
        metricName: "Latency",
        dimensions: [],
        startTime: new Date(),
        endTime: new Date(),
        period: 300,
        statistics: ["Average"],
      });
      expect(points).toEqual([]);
    });
  });

  describe("listAlarms", () => {
    it("paginates by NextToken and maps alarm summaries", async () => {
      const send = vi
        .fn()
        .mockResolvedValueOnce({
          MetricAlarms: [
            {
              AlarmName: "high-latency",
              AlarmArn: "arn:aws:cloudwatch:us-east-1:000000000000:alarm:high-latency",
              StateValue: "OK",
              Namespace: "E2E",
              MetricName: "Latency",
              ComparisonOperator: "GreaterThanThreshold",
              Threshold: 100,
              EvaluationPeriods: 2,
              Period: 300,
              StateReason: "ok",
              Dimensions: [{ Name: "Service", Value: "checkout" }],
              ActionsEnabled: true,
            },
          ],
          NextToken: "t1",
        })
        .mockResolvedValueOnce({ MetricAlarms: [] });

      const client = { send } as unknown as CloudWatchClient;
      const alarms = await listAlarms(client);

      expect(send).toHaveBeenCalledTimes(2);
      expect(alarms).toHaveLength(1);
      expect(alarms[0]).toMatchObject({
        name: "high-latency",
        state: "OK",
        namespace: "E2E",
        metricName: "Latency",
        comparison: "GreaterThanThreshold",
        threshold: 100,
        evaluationPeriods: 2,
        period: 300,
      });
    });
  });

  describe("createAlarm and deleteAlarm", () => {
    it("sends PutMetricAlarm with normalized fields", async () => {
      const send = vi.fn().mockResolvedValueOnce({});
      const client = { send } as unknown as CloudWatchClient;
      await createAlarm(client, {
        name: "high-latency",
        namespace: "E2E",
        metricName: "Latency",
        comparison: "GreaterThanThreshold",
        threshold: 100,
        evaluationPeriods: 2,
        period: 300,
        dimensions: [{ name: "Service", value: "checkout" }],
      });

      expect(send).toHaveBeenCalledWith(
        expect.objectContaining({
          input: {
            AlarmName: "high-latency",
            Namespace: "E2E",
            MetricName: "Latency",
            ComparisonOperator: "GreaterThanThreshold",
            Threshold: 100,
            EvaluationPeriods: 2,
            Period: 300,
            Statistic: "Average",
            Dimensions: [{ Name: "Service", Value: "checkout" }],
          },
        }),
      );
    });

    it("deletes by alarm name", async () => {
      const send = vi.fn().mockResolvedValueOnce({});
      const client = { send } as unknown as CloudWatchClient;
      await deleteAlarm(client, "high-latency");
      expect(send).toHaveBeenCalledWith(
        expect.objectContaining({ input: { AlarmNames: ["high-latency"] } }),
      );
    });
  });
});
