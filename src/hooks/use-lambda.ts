import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import type { LambdaClient } from "@aws-sdk/client-lambda";
import { makeClients } from "@/lib/aws";
import { useActiveProfile } from "@/store/profiles";
import { getFunctionConfig, listFunctions } from "@/lib/lambda";
export const lambdaKeys = {
  functions: (profileId: string, region?: string) =>
    ["lambda", "functions", profileId, region ?? ""] as const,
  config: (profileId: string, name: string) =>
    ["lambda", "config", profileId, name] as const,
};

export function useLambdaClient(): LambdaClient {
  const profile = useActiveProfile();
  return useMemo(
    () => makeClients(profile).lambda,
    [profile.id, profile.endpoint, profile.region, profile.authToken],
  );
}

export function useFunctions(
  profileId: string,
  options?: { enabled?: boolean },
) {
  const client = useLambdaClient();
  const profile = useActiveProfile();
  return useQuery({
    queryKey: lambdaKeys.functions(profileId, profile.region),
    queryFn: () => listFunctions(client),
    staleTime: 30_000,
    enabled: options?.enabled,
  });
}

export function useFunctionConfig(
  name: string,
  options?: { enabled?: boolean },
) {
  const client = useLambdaClient();
  const profile = useActiveProfile();
  return useQuery({
    queryKey: lambdaKeys.config(profile.id, name),
    queryFn: () => getFunctionConfig(client, name),
    enabled: options?.enabled !== undefined ? options.enabled && !!name : !!name,
    staleTime: 10_000,
  });
}
