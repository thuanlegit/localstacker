import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import type { STSClient } from "@aws-sdk/client-sts";
import { makeClients } from "@/lib/aws";
import { useActiveProfile } from "@/store/profiles";
import { getCallerIdentity } from "@/lib/sts";

export function useStsClient(): STSClient {
  const profile = useActiveProfile();
  return useMemo(
    () => makeClients(profile).sts,
    [profile.id, profile.endpoint, profile.region, profile.authToken],
  );
}

/** Caller identity for the Home identity chip; cached for 5 minutes. */
export function useCallerIdentity(profileId: string, options?: { enabled?: boolean }) {
  const client = useStsClient();
  return useQuery({
    queryKey: ["sts", "caller", profileId],
    queryFn: () => getCallerIdentity(client),
    staleTime: 5 * 60 * 1000,
    retry: false,
    enabled: options?.enabled,
  });
}
