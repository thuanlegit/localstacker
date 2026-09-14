import { useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { KinesisClient } from "@aws-sdk/client-kinesis";
import { toast } from "sonner";
import { makeClients } from "@/lib/aws";
import { useActiveProfile } from "@/store/profiles";
import {
  listStreams,
  describeStreamSummary,
  listShards,
  listConsumers,
  createStream,
  deleteStream,
  putRecord,
} from "@/lib/kinesis";

function toErrorMessage(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

export const kinesisKeys = {
  streams: (profileId: string, region?: string) =>
    region
      ? (["kinesis", "streams", profileId, region] as const)
      : (["kinesis", "streams", profileId] as const),
  summary: (profileId: string, name: string, region?: string) =>
    region
      ? (["kinesis", "summary", profileId, name, region] as const)
      : (["kinesis", "summary", profileId, name] as const),
  shards: (profileId: string, name: string, region?: string) =>
    region
      ? (["kinesis", "shards", profileId, name, region] as const)
      : (["kinesis", "shards", profileId, name] as const),
  consumers: (profileId: string, name: string, region?: string) =>
    region
      ? (["kinesis", "consumers", profileId, name, region] as const)
      : (["kinesis", "consumers", profileId, name] as const),
};

export function useKinesisClient(): KinesisClient {
  const profile = useActiveProfile();
  return useMemo(
    () => makeClients(profile).kinesis,
    [profile.id, profile.endpoint, profile.region, profile.authToken],
  );
}

export function useKinesisStreams(profileId: string, options?: { enabled?: boolean }) {
  const client = useKinesisClient();
  const profile = useActiveProfile();
  return useQuery({
    queryKey: kinesisKeys.streams(profileId, profile.region),
    queryFn: () => listStreams(client),
    staleTime: 5_000,
    refetchInterval: 10_000,
    enabled: options?.enabled,
  });
}

export function useStreamSummary(
  profileId: string,
  name: string,
  options?: { enabled?: boolean },
) {
  const client = useKinesisClient();
  const profile = useActiveProfile();
  return useQuery({
    queryKey: kinesisKeys.summary(profileId, name, profile.region),
    queryFn: () => describeStreamSummary(client, name),
    staleTime: 5_000,
    refetchInterval: 10_000,
    enabled: Boolean(name) && options?.enabled !== false,
  });
}

export function useKinesisShards(
  profileId: string,
  name: string,
  options?: { enabled?: boolean },
) {
  const client = useKinesisClient();
  const profile = useActiveProfile();
  return useQuery({
    queryKey: kinesisKeys.shards(profileId, name, profile.region),
    queryFn: () => listShards(client, name),
    staleTime: 5_000,
    enabled: Boolean(name) && options?.enabled !== false,
  });
}

export function useKinesisConsumers(
  profileId: string,
  name: string,
  options?: { enabled?: boolean },
) {
  const client = useKinesisClient();
  const profile = useActiveProfile();
  return useQuery({
    queryKey: kinesisKeys.consumers(profileId, name, profile.region),
    queryFn: () => listConsumers(client, name),
    staleTime: 5_000,
    enabled: Boolean(name) && options?.enabled !== false,
  });
}

export function useKinesisActions() {
  const client = useKinesisClient();
  const queryClient = useQueryClient();
  const profile = useActiveProfile();

  const invalidateStreams = () => {
    queryClient.invalidateQueries({
      queryKey: ["kinesis", "streams", profile.id],
    });
  };

  const invalidateStream = (name: string) => {
    queryClient.invalidateQueries({
      queryKey: ["kinesis", "summary", profile.id, name],
    });
    queryClient.invalidateQueries({
      queryKey: ["kinesis", "shards", profile.id, name],
    });
  };

  const createStreamAction = async (params: {
    name: string;
    shardCount?: number;
  }): Promise<boolean> => {
    try {
      await createStream(client, params);
      toast.success(`Stream ${params.name} created`);
      invalidateStreams();
      return true;
    } catch (e) {
      toast.error(`Failed to create stream: ${toErrorMessage(e)}`);
      return false;
    }
  };

  const deleteStreamAction = async (name: string): Promise<boolean> => {
    try {
      await deleteStream(client, name);
      toast.success(`Stream ${name} deleted`);
      invalidateStreams();
      invalidateStream(name);
      return true;
    } catch (e) {
      toast.error(`Failed to delete stream: ${toErrorMessage(e)}`);
      return false;
    }
  };

  const putRecordAction = async (params: {
    streamName: string;
    data: string;
    partitionKey: string;
  }): Promise<string | null> => {
    try {
      const { sequenceNumber } = await putRecord(client, params);
      toast.success(`Record published (${sequenceNumber.slice(0, 16)}…)`);
      return sequenceNumber;
    } catch (e) {
      toast.error(`Failed to publish record: ${toErrorMessage(e)}`);
      return null;
    }
  };

  return {
    createStream: createStreamAction,
    deleteStream: deleteStreamAction,
    putRecord: putRecordAction,
  };
}
