import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import type { SQSClient } from "@aws-sdk/client-sqs";
import { makeClients } from "@/lib/aws";
import { useActiveProfile } from "@/store/profiles";
import { listQueues } from "@/lib/sqs";

export const sqsKeys = {
  queues: (profileId: string, region?: string) =>
    region
      ? (["sqs", "queues", profileId, region] as const)
      : (["sqs", "queues", profileId] as const),
};

export function useSqsClient(): SQSClient {
  const profile = useActiveProfile();
  return useMemo(
    () => makeClients(profile).sqs,
    [profile.id, profile.endpoint, profile.region, profile.authToken],
  );
}

export function useQueues(profileId: string, options?: { enabled?: boolean }) {
  const client = useSqsClient();
  const profile = useActiveProfile();
  return useQuery({
    queryKey: sqsKeys.queues(profileId, profile.region),
    queryFn: () => listQueues(client),
    staleTime: 5_000,
    refetchInterval: 10_000,
    enabled: options?.enabled,
  });
}
