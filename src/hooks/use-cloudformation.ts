import { useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { CloudFormationClient } from "@aws-sdk/client-cloudformation";
import { toast } from "sonner";
import { makeClients } from "@/lib/aws";
import { useActiveProfile } from "@/store/profiles";
import {
  listStacks,
  describeStack,
  getTemplate,
  listStackEvents,
  listStackResources,
  deleteStack,
} from "@/lib/cloudformation";

function toErrorMessage(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

export const cloudformationKeys = {
  stacks: (profileId: string, region?: string) =>
    region
      ? (["cloudformation", "stacks", profileId, region] as const)
      : (["cloudformation", "stacks", profileId] as const),
  detail: (profileId: string, name: string, region?: string) =>
    region
      ? (["cloudformation", "detail", profileId, name, region] as const)
      : (["cloudformation", "detail", profileId, name] as const),
};

export function useCloudFormationClient(): CloudFormationClient {
  const profile = useActiveProfile();
  return useMemo(
    () => makeClients(profile).cloudformation,
    [profile.id, profile.endpoint, profile.region, profile.authToken],
  );
}

export function useStacks(profileId: string, options?: { enabled?: boolean }) {
  const client = useCloudFormationClient();
  const profile = useActiveProfile();
  return useQuery({
    queryKey: cloudformationKeys.stacks(profileId, profile.region),
    queryFn: () => listStacks(client),
    staleTime: 5_000,
    refetchInterval: 15_000,
    enabled: options?.enabled,
  });
}

export function useStackDetail(
  profileId: string,
  stackName: string,
  options?: { enabled?: boolean },
) {
  const client = useCloudFormationClient();
  const profile = useActiveProfile();
  return useQuery({
    queryKey: cloudformationKeys.detail(profileId, stackName, profile.region),
    queryFn: () => describeStack(client, stackName),
    staleTime: 5_000,
    enabled: options?.enabled,
  });
}

export function useStackTemplate(
  profileId: string,
  stackName: string,
  options?: { enabled?: boolean },
) {
  const client = useCloudFormationClient();
  const profile = useActiveProfile();
  return useQuery({
    queryKey: ["cloudformation", "template", profileId, stackName, profile.region],
    queryFn: () => getTemplate(client, stackName),
    staleTime: 30_000,
    enabled: options?.enabled,
  });
}

export function useStackEvents(
  profileId: string,
  stackName: string,
  options?: { enabled?: boolean },
) {
  const client = useCloudFormationClient();
  const profile = useActiveProfile();
  return useQuery({
    queryKey: ["cloudformation", "events", profileId, stackName, profile.region],
    queryFn: () => listStackEvents(client, stackName),
    staleTime: 5_000,
    enabled: options?.enabled,
  });
}

export function useStackResources(
  profileId: string,
  stackName: string,
  options?: { enabled?: boolean },
) {
  const client = useCloudFormationClient();
  const profile = useActiveProfile();
  return useQuery({
    queryKey: ["cloudformation", "resources", profileId, stackName, profile.region],
    queryFn: () => listStackResources(client, stackName),
    staleTime: 5_000,
    enabled: options?.enabled,
  });
}

export function useCloudFormationActions() {
  const client = useCloudFormationClient();
  const queryClient = useQueryClient();
  const profile = useActiveProfile();

  const deleteStackAction = async (stackName: string): Promise<boolean> => {
    try {
      await deleteStack(client, stackName);
      toast.success(`Stack ${stackName} deletion started`);
      queryClient.invalidateQueries({
        queryKey: ["cloudformation", "stacks", profile.id],
      });
      return true;
    } catch (e) {
      toast.error(`Failed to delete stack: ${toErrorMessage(e)}`);
      return false;
    }
  };

  return { deleteStack: deleteStackAction };
}
