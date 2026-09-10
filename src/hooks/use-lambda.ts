import { useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import type { LambdaClient } from "@aws-sdk/client-lambda";
import { makeClients } from "@/lib/aws";
import { useActiveProfile } from "@/store/profiles";
import {
  createDemoFunction,
  deleteFunction,
  getFunctionConfig,
  listFunctions,
} from "@/lib/lambda";
export const lambdaKeys = {
  functions: (profileId: string, region?: string) =>
    region
      ? (["lambda", "functions", profileId, region] as const)
      : (["lambda", "functions", profileId] as const),
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

function toErrorMessage(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

export function useLambdaActions() {
  const client = useLambdaClient();
  const profile = useActiveProfile();
  const queryClient = useQueryClient();

  const createDemo = async (name = "demo-hello"): Promise<string | null> => {
    try {
      const res = await createDemoFunction(client, name);
      toast.success(`Demo function "${res}" created`);
      await queryClient.invalidateQueries({
        queryKey: lambdaKeys.functions(profile.id, profile.region),
      });
      return res;
    } catch (e) {
      toast.error(`Failed to create demo function: ${toErrorMessage(e)}`);
      return null;
    }
  };

  const removeFunction = async (name: string): Promise<boolean> => {
    try {
      await deleteFunction(client, name);
      toast.success(`Function "${name}" deleted`);
      await queryClient.invalidateQueries({
        queryKey: lambdaKeys.functions(profile.id, profile.region),
      });
      return true;
    } catch (e) {
      toast.error(`Failed to delete function: ${toErrorMessage(e)}`);
      return false;
    }
  };

  return { createDemo, removeFunction };
}
