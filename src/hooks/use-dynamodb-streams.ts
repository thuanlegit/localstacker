import { useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { makeClients } from "@/lib/aws";
import { useActiveProfile } from "@/store/profiles";
import {
  listStreamShards,
  peekStreamRecords,
  type StreamRecordLite,
} from "@/lib/dynamodb-streams";
import { setTableStream, type StreamViewType } from "@/lib/dynamodb";

function toErrorMessage(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

export const dynamodbStreamsKeys = {
  shards: (profileId: string, streamArn: string, region?: string) =>
    region
      ? (["dynamodbStreams", "shards", profileId, streamArn, region] as const)
      : (["dynamodbStreams", "shards", profileId, streamArn] as const),
  records: (profileId: string, streamArn: string, region?: string) =>
    region
      ? (["dynamodbStreams", "records", profileId, streamArn, region] as const)
      : (["dynamodbStreams", "records", profileId, streamArn] as const),
};

export function useDynamoStreamsClient() {
  const profile = useActiveProfile();
  return useMemo(
    () => makeClients(profile).dynamodbStreams,
    [profile.id, profile.endpoint, profile.region, profile.authToken],
  );
}

function useDynamoClient() {
  const profile = useActiveProfile();
  return useMemo(
    () => makeClients(profile).dynamodb,
    [profile.id, profile.endpoint, profile.region, profile.authToken],
  );
}

export function useStreamShards(
  profileId: string,
  streamArn: string,
  options?: { enabled?: boolean },
) {
  const client = useDynamoStreamsClient();
  const profile = useActiveProfile();
  return useQuery({
    queryKey: dynamodbStreamsKeys.shards(profileId, streamArn, profile.region),
    queryFn: () => listStreamShards(client, streamArn),
    staleTime: 5_000,
    enabled: Boolean(streamArn) && options?.enabled !== false,
  });
}

export function useStreamRecords(
  profileId: string,
  streamArn: string,
  options?: { enabled?: boolean },
) {
  const client = useDynamoStreamsClient();
  const profile = useActiveProfile();
  return useQuery({
    queryKey: dynamodbStreamsKeys.records(profileId, streamArn, profile.region),
    queryFn: () => peekStreamRecords(client, streamArn),
    staleTime: 5_000,
    enabled: Boolean(streamArn) && options?.enabled !== false,
  });
}

export function useStreamActions(tableName?: string) {
  const client = useDynamoStreamsClient();
  const dynamo = useDynamoClient();
  const profile = useActiveProfile();
  const queryClient = useQueryClient();

  const setStream = async (
    enabled: boolean,
    viewType: StreamViewType = "NEW_AND_OLD_IMAGES",
    table?: string,
  ): Promise<boolean> => {
    const target = table ?? tableName;
    if (!target) {
      toast.error("No table selected");
      return false;
    }
    try {
      await setTableStream(dynamo, target, enabled, viewType);
      toast.success(enabled ? `Stream enabled (${viewType})` : "Stream disabled");
      queryClient.invalidateQueries({
        queryKey: ["dynamodb", "table", profile.id, target],
      });
      return true;
    } catch (e) {
      toast.error(`Failed to update stream: ${toErrorMessage(e)}`);
      return false;
    }
  };

  const peek = async (streamArn: string): Promise<StreamRecordLite[] | null> => {
    try {
      return await peekStreamRecords(client, streamArn);
    } catch (e) {
      toast.error(`Failed to peek stream: ${toErrorMessage(e)}`);
      return null;
    }
  };

  return { setTableStream: setStream, peek };
}
