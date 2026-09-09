import { useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { SSMClient } from "@aws-sdk/client-ssm";
import { toast } from "sonner";
import { makeClients } from "@/lib/aws";
import { useActiveProfile } from "@/store/profiles";
import {
  describeParameters,
  getParameter,
  putParameter,
  deleteParameter,
  type ParameterType,
} from "@/lib/ssm";

function toErrorMessage(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

export const ssmKeys = {
  parameters: (profileId: string, region?: string) =>
    region
      ? (["ssm", "parameters", profileId, region] as const)
      : (["ssm", "parameters", profileId] as const),
  parameter: (
    profileId: string,
    name: string,
    withDecryption = false,
    region?: string,
  ) =>
    region
      ? (["ssm", "parameter", profileId, name, withDecryption, region] as const)
      : (["ssm", "parameter", profileId, name, withDecryption] as const),
};

export function useSsmClient(): SSMClient {
  const profile = useActiveProfile();
  return useMemo(
    () => makeClients(profile).ssm,
    [profile.id, profile.endpoint, profile.region, profile.authToken],
  );
}

export function useParameters(
  profileId: string,
  options?: { enabled?: boolean },
) {
  const client = useSsmClient();
  const profile = useActiveProfile();
  return useQuery({
    queryKey: ssmKeys.parameters(profileId, profile.region),
    queryFn: () => describeParameters(client),
    staleTime: 5_000,
    refetchInterval: 10_000,
    enabled: options?.enabled,
  });
}

export function useParameter(
  profileId: string,
  name: string,
  options?: { withDecryption?: boolean; enabled?: boolean },
) {
  const client = useSsmClient();
  const profile = useActiveProfile();
  return useQuery({
    queryKey: ssmKeys.parameter(
      profileId,
      name,
      options?.withDecryption ?? false,
      profile.region,
    ),
    queryFn: () =>
      getParameter(client, {
        name,
        withDecryption: options?.withDecryption,
      }),
    staleTime: 5_000,
    enabled: Boolean(name) && options?.enabled !== false,
  });
}

export function useParameterActions() {
  const client = useSsmClient();
  const queryClient = useQueryClient();
  const profile = useActiveProfile();

  const invalidate = (name?: string) => {
    queryClient.invalidateQueries({
      queryKey: ["ssm", "parameters", profile.id],
    });
    if (name) {
      queryClient.invalidateQueries({
        queryKey: ["ssm", "parameter", profile.id, name],
      });
    }
  };

  const putParam = async (params: {
    name: string;
    value: string;
    type: ParameterType;
    overwrite?: boolean;
  }): Promise<number | null> => {
    try {
      const { version } = await putParameter(client, params);
      toast.success(`Parameter ${params.name} saved (v${version})`);
      invalidate(params.name);
      return version;
    } catch (e) {
      toast.error(`Failed to save parameter: ${toErrorMessage(e)}`);
      return null;
    }
  };

  const deleteParam = async (name: string): Promise<boolean> => {
    try {
      await deleteParameter(client, name);
      toast.success(`Parameter ${name} deleted`);
      invalidate(name);
      return true;
    } catch (e) {
      toast.error(`Failed to delete parameter: ${toErrorMessage(e)}`);
      return false;
    }
  };

  const getParam = async (params: {
    name: string;
    withDecryption?: boolean;
  }) => {
    try {
      return await getParameter(client, params);
    } catch (e) {
      toast.error(`Failed to fetch parameter value: ${toErrorMessage(e)}`);
      throw e;
    }
  };

  return {
    putParameter: putParam,
    deleteParameter: deleteParam,
    getParameter: getParam,
  };
}
