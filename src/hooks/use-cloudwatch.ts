import { useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { CloudWatchClient } from "@aws-sdk/client-cloudwatch";
import { toast } from "sonner";
import { makeClients } from "@/lib/aws";
import { useActiveProfile } from "@/store/profiles";
import {
  listMetrics,
  listAlarms,
  getMetricStatistics,
  putMetricData,
  createAlarm,
  deleteAlarm,
} from "@/lib/cloudwatch";

function toErrorMessage(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

export const cloudwatchKeys = {
  metrics: (profileId: string, region?: string) =>
    region
      ? (["cloudwatch", "metrics", profileId, region] as const)
      : (["cloudwatch", "metrics", profileId] as const),
  alarms: (profileId: string, region?: string) =>
    region
      ? (["cloudwatch", "alarms", profileId, region] as const)
      : (["cloudwatch", "alarms", profileId] as const),
  statistics: (
    profileId: string,
    namespace: string,
    metricName: string,
    region?: string,
  ) =>
    region
      ? (["cloudwatch", "statistics", profileId, namespace, metricName, region] as const)
      : (["cloudwatch", "statistics", profileId, namespace, metricName] as const),
};

export function useCloudWatchClient(): CloudWatchClient {
  const profile = useActiveProfile();
  return useMemo(
    () => makeClients(profile).cloudwatch,
    [profile.id, profile.endpoint, profile.region, profile.authToken],
  );
}

export function useCloudWatchMetrics(profileId: string, options?: { enabled?: boolean }) {
  const client = useCloudWatchClient();
  const profile = useActiveProfile();
  return useQuery({
    queryKey: cloudwatchKeys.metrics(profileId, profile.region),
    queryFn: () => listMetrics(client),
    staleTime: 5_000,
    refetchInterval: 15_000,
    enabled: options?.enabled,
  });
}

export function useCloudWatchAlarms(profileId: string, options?: { enabled?: boolean }) {
  const client = useCloudWatchClient();
  const profile = useActiveProfile();
  return useQuery({
    queryKey: cloudwatchKeys.alarms(profileId, profile.region),
    queryFn: () => listAlarms(client),
    staleTime: 5_000,
    refetchInterval: 15_000,
    enabled: options?.enabled,
  });
}

export function useMetricStatistics(
  profileId: string,
  namespace: string,
  metricName: string,
  dimensions: { name: string; value: string }[],
  options?: { enabled?: boolean },
) {
  const client = useCloudWatchClient();
  const profile = useActiveProfile();
  return useQuery({
    queryKey: [
      ...cloudwatchKeys.statistics(profileId, namespace, metricName, profile.region),
      dimensions,
    ],
    queryFn: () =>
      getMetricStatistics(client, {
        namespace,
        metricName,
        dimensions,
        startTime: new Date(Date.now() - 3 * 3600 * 1000),
        endTime: new Date(),
        period: 300,
        statistics: ["Average", "Maximum", "Minimum"],
      }),
    staleTime: 10_000,
    enabled: options?.enabled,
  });
}

export function useCloudWatchActions() {
  const client = useCloudWatchClient();
  const queryClient = useQueryClient();
  const profile = useActiveProfile();

  const invalidate = () => {
    queryClient.invalidateQueries({
      queryKey: ["cloudwatch", "metrics", profile.id],
    });
    queryClient.invalidateQueries({
      queryKey: ["cloudwatch", "alarms", profile.id],
    });
  };

  const putMetricDataAction = async (params: {
    namespace: string;
    metricName: string;
    value: number;
    dimensions?: { name: string; value: string }[];
  }): Promise<boolean> => {
    try {
      await putMetricData(client, params);
      toast.success(`Published ${params.metricName} = ${params.value}`);
      invalidate();
      return true;
    } catch (e) {
      toast.error(`Failed to publish metric data: ${toErrorMessage(e)}`);
      return false;
    }
  };

  const createAlarmAction = async (params: {
    name: string;
    namespace: string;
    metricName: string;
    comparison: string;
    threshold: number;
    evaluationPeriods: number;
    period: number;
    dimensions?: { name: string; value: string }[];
  }): Promise<boolean> => {
    try {
      await createAlarm(client, params);
      toast.success(`Alarm ${params.name} created`);
      invalidate();
      return true;
    } catch (e) {
      toast.error(`Failed to create alarm: ${toErrorMessage(e)}`);
      return false;
    }
  };

  const deleteAlarmAction = async (name: string): Promise<boolean> => {
    try {
      await deleteAlarm(client, name);
      toast.success(`Alarm ${name} deleted`);
      invalidate();
      return true;
    } catch (e) {
      toast.error(`Failed to delete alarm: ${toErrorMessage(e)}`);
      return false;
    }
  };

  return {
    putMetricData: putMetricDataAction,
    createAlarm: createAlarmAction,
    deleteAlarm: deleteAlarmAction,
  };
}
