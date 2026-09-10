import { useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import type { LambdaClient } from "@aws-sdk/client-lambda";
import { makeClients } from "@/lib/aws";
import { useActiveProfile } from "@/store/profiles";
import {
  type CreateFunctionParams,
  createFunction,
  createDemoFunction,
  deleteFunction,
  getFunctionConfig,
  listFunctions,
  listEventSourceMappings,
  createEventSourceMapping,
  updateEventSourceMapping,
  deleteEventSourceMapping,
} from "@/lib/lambda";
export const lambdaKeys = {
  functions: (profileId: string, region?: string) =>
    region
      ? (["lambda", "functions", profileId, region] as const)
      : (["lambda", "functions", profileId] as const),
  config: (profileId: string, name: string) =>
    ["lambda", "config", profileId, name] as const,
  eventSourceMappings: (
    profileId: string,
    functionName?: string,
    eventSourceArn?: string,
    region?: string,
  ) =>
    region
      ? ([
          "lambda",
          "eventSourceMappings",
          profileId,
          functionName ?? "*",
          eventSourceArn ?? "*",
          region,
        ] as const)
      : ([
          "lambda",
          "eventSourceMappings",
          profileId,
          functionName ?? "*",
          eventSourceArn ?? "*",
        ] as const),
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

export function useEventSourceMappings(
  params?: { functionName?: string; eventSourceArn?: string },
  options?: { enabled?: boolean },
) {
  const client = useLambdaClient();
  const profile = useActiveProfile();

  return useQuery({
    queryKey: lambdaKeys.eventSourceMappings(
      profile.id,
      params?.functionName,
      params?.eventSourceArn,
      profile.region,
    ),
    queryFn: () => listEventSourceMappings(client, params),
    enabled: options?.enabled ?? true,
    staleTime: 5_000,
    refetchInterval: 10_000,
  });
}

function toErrorMessage(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

export function useLambdaActions() {
  const client = useLambdaClient();
  const profile = useActiveProfile();
  const queryClient = useQueryClient();

  const create = async (params: CreateFunctionParams): Promise<string | null> => {
    try {
      const res = await createFunction(client, params);
      toast.success(`Function "${res.name}" created`);
      await queryClient.invalidateQueries({
        queryKey: lambdaKeys.functions(profile.id, profile.region),
      });
      return res.name;
    } catch (e) {
      toast.error(`Failed to create function: ${toErrorMessage(e)}`);
      return null;
    }
  };

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

  return { create, createDemo, removeFunction };
}

export function useEventSourceMappingActions() {
  const client = useLambdaClient();
  const queryClient = useQueryClient();
  const createMapping = async (params: {
    functionName: string;
    eventSourceArn: string;
    batchSize?: number;
    enabled?: boolean;
    maximumBatchingWindowInSeconds?: number;
  }): Promise<{ uuid: string; state?: string } | null> => {
    try {
      const res = await createEventSourceMapping(client, params);
      toast.success("Event source trigger attached");
      await queryClient.invalidateQueries({
        queryKey: ["lambda", "eventSourceMappings"],
      });
      return res;
    } catch (e) {
      toast.error(`Failed to attach trigger: ${toErrorMessage(e)}`);
      return null;
    }
  };

  const updateMapping = async (params: {
    uuid: string;
    functionName?: string;
    enabled?: boolean;
    batchSize?: number;
    maximumBatchingWindowInSeconds?: number;
  }): Promise<boolean> => {
    try {
      await updateEventSourceMapping(client, params);
      toast.success(
        params.enabled !== undefined
          ? `Trigger ${params.enabled ? "enabled" : "disabled"}`
          : "Trigger updated",
      );
      await queryClient.invalidateQueries({
        queryKey: ["lambda", "eventSourceMappings"],
      });
      return true;
    } catch (e) {
      toast.error(`Failed to update trigger: ${toErrorMessage(e)}`);
      return false;
    }
  };

  const deleteMapping = async (uuid: string): Promise<boolean> => {
    try {
      await deleteEventSourceMapping(client, uuid);
      toast.success("Event source trigger removed");
      await queryClient.invalidateQueries({
        queryKey: ["lambda", "eventSourceMappings"],
      });
      return true;
    } catch (e) {
      toast.error(`Failed to remove trigger: ${toErrorMessage(e)}`);
      return false;
    }
  };

  return { createMapping, updateMapping, deleteMapping };
}
