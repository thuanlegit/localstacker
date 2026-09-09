import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { CloudWatchLogsClient } from "@aws-sdk/client-cloudwatch-logs";
import { toast } from "sonner";
import { makeClients } from "@/lib/aws";
import { useActiveProfile } from "@/store/profiles";
import {
  describeLogGroups,
  createLogGroup,
  deleteLogGroup,
  describeLogStreams,
  deleteLogStream,
  fetchLogEvents,
  mergeLogEvents,
  TAIL_POLL_INTERVAL_MS,
  type LogEventRecord,
} from "@/lib/logs";

function toErrorMessage(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

export const logsKeys = {
  groups: (profileId: string, region?: string) =>
    region
      ? (["logs", "groups", profileId, region] as const)
      : (["logs", "groups", profileId] as const),
  streams: (profileId: string, groupName: string, region?: string) =>
    region
      ? (["logs", "streams", profileId, groupName, region] as const)
      : (["logs", "streams", profileId, groupName] as const),
};

export function useLogsClient(): CloudWatchLogsClient {
  const profile = useActiveProfile();
  return useMemo(
    () => makeClients(profile).logs,
    [profile.id, profile.endpoint, profile.region, profile.authToken],
  );
}

export function useLogGroups(
  profileId: string,
  options?: { enabled?: boolean },
) {
  const client = useLogsClient();
  const profile = useActiveProfile();
  return useQuery({
    queryKey: logsKeys.groups(profileId, profile.region),
    queryFn: () => describeLogGroups(client),
    staleTime: 5_000,
    refetchInterval: 10_000,
    enabled: options?.enabled,
  });
}

export function useLogStreams(
  profileId: string,
  groupName: string,
  options?: { enabled?: boolean },
) {
  const client = useLogsClient();
  const profile = useActiveProfile();
  return useQuery({
    queryKey: logsKeys.streams(profileId, groupName, profile.region),
    queryFn: () => describeLogStreams(client, { logGroupName: groupName }),
    staleTime: 5_000,
    refetchInterval: 10_000,
    enabled: Boolean(groupName) && options?.enabled !== false,
  });
}

export function useLogGroupActions() {
  const client = useLogsClient();
  const queryClient = useQueryClient();
  const profile = useActiveProfile();

  const invalidateGroups = () => {
    queryClient.invalidateQueries({
      queryKey: ["logs", "groups", profile.id],
    });
  };

  const invalidateStreams = (groupName: string) => {
    queryClient.invalidateQueries({
      queryKey: ["logs", "streams", profile.id, groupName],
    });
  };

  const createGroup = async (name: string): Promise<boolean> => {
    try {
      await createLogGroup(client, name);
      toast.success(`Log group ${name} created`);
      invalidateGroups();
      return true;
    } catch (e) {
      toast.error(`Failed to create log group: ${toErrorMessage(e)}`);
      return false;
    }
  };

  const deleteGroup = async (name: string): Promise<boolean> => {
    try {
      await deleteLogGroup(client, name);
      toast.success(`Log group ${name} deleted`);
      invalidateGroups();
      return true;
    } catch (e) {
      toast.error(`Failed to delete log group: ${toErrorMessage(e)}`);
      return false;
    }
  };

  const deleteStream = async (
    groupName: string,
    streamName: string,
  ): Promise<boolean> => {
    try {
      await deleteLogStream(client, { logGroupName: groupName, streamName });
      toast.success(`Stream ${streamName} deleted`);
      invalidateStreams(groupName);
      return true;
    } catch (e) {
      toast.error(`Failed to delete stream: ${toErrorMessage(e)}`);
      return false;
    }
  };

  return {
    createGroup,
    deleteGroup,
    deleteStream,
  };
}

export function useLogEvents(groupName: string) {
  const client = useLogsClient();
  const [events, setEvents] = useState<LogEventRecord[]>([]);
  const [filterPattern, setFilterPattern] = useState<string>("");
  const [streamName, setStreamName] = useState<string | undefined>(undefined);
  const [isTailing, setTailing] = useState(false);
  const [isInitialLoading, setIsInitialLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [hasNextPage, setHasNextPage] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const nextTokenRef = useRef<string | undefined>(undefined);
  const lastTimestampRef = useRef<number | undefined>(undefined);

  const updateLastTimestamp = (evs: LogEventRecord[]) => {
    if (evs.length > 0) {
      const maxTs = Math.max(...evs.map((e) => e.timestamp));
      if (
        lastTimestampRef.current === undefined ||
        maxTs > lastTimestampRef.current
      ) {
        lastTimestampRef.current = maxTs;
      }
    }
  };

  const loadInitial = useCallback(async () => {
    if (!groupName) return;
    setIsInitialLoading(true);
    setError(null);
    nextTokenRef.current = undefined;
    lastTimestampRef.current = undefined;
    try {
      const res = await fetchLogEvents(client, {
        logGroupName: groupName,
        streamName,
        filterPattern: filterPattern.trim() || undefined,
      });
      setEvents(res.events);
      updateLastTimestamp(res.events);
      nextTokenRef.current = res.nextToken;
      setHasNextPage(Boolean(res.nextToken));
    } catch (err) {
      setError(err instanceof Error ? err : new Error(String(err)));
    } finally {
      setIsInitialLoading(false);
    }
  }, [client, groupName, streamName, filterPattern]);

  useEffect(() => {
    void loadInitial();
  }, [loadInitial]);

  const loadMore = async () => {
    if (!groupName || !nextTokenRef.current || isLoadingMore) return;
    setIsLoadingMore(true);
    try {
      const res = await fetchLogEvents(client, {
        logGroupName: groupName,
        streamName,
        filterPattern: filterPattern.trim() || undefined,
        nextToken: nextTokenRef.current,
      });
      setEvents((prev) => mergeLogEvents(prev, res.events));
      updateLastTimestamp(res.events);
      nextTokenRef.current = res.nextToken;
      setHasNextPage(Boolean(res.nextToken));
    } catch (err) {
      toast.error(`Failed to load more events: ${toErrorMessage(err)}`);
    } finally {
      setIsLoadingMore(false);
    }
  };

  useEffect(() => {
    if (!isTailing || !groupName) return;

    const intervalId = setInterval(async () => {
      try {
        const startTime =
          lastTimestampRef.current !== undefined
            ? lastTimestampRef.current + 1
            : undefined;
        const res = await fetchLogEvents(client, {
          logGroupName: groupName,
          streamName,
          filterPattern: filterPattern.trim() || undefined,
          startTime,
        });
        if (res.events.length > 0) {
          setEvents((prev) => mergeLogEvents(prev, res.events));
          updateLastTimestamp(res.events);
        }
      } catch (err) {
        console.warn("Live tail error:", err);
      }
    }, TAIL_POLL_INTERVAL_MS);

    return () => clearInterval(intervalId);
  }, [isTailing, client, groupName, streamName, filterPattern]);

  return {
    events,
    filterPattern,
    setFilterPattern,
    streamName,
    setStreamName,
    isTailing,
    setTailing,
    loadMore,
    hasNextPage,
    isInitialLoading,
    isLoadingMore,
    error,
    refresh: loadInitial,
  };
}
