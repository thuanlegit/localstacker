import { useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { SFNClient } from "@aws-sdk/client-sfn";
import { toast } from "sonner";
import { makeClients } from "@/lib/aws";
import { useActiveProfile } from "@/store/profiles";
import {
  listStateMachines,
  getStateMachine,
  listExecutions,
  getExecutionHistory,
  createStateMachine,
  deleteStateMachine,
  startExecution,
  stopExecution,
} from "@/lib/sfn";

function toErrorMessage(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

export const sfnKeys = {
  machines: (profileId: string, region?: string) =>
    region
      ? (["sfn", "machines", profileId, region] as const)
      : (["sfn", "machines", profileId] as const),
  machine: (profileId: string, arn: string, region?: string) =>
    region
      ? (["sfn", "machine", profileId, arn, region] as const)
      : (["sfn", "machine", profileId, arn] as const),
  executions: (profileId: string, arn: string, region?: string) =>
    region
      ? (["sfn", "executions", profileId, arn, region] as const)
      : (["sfn", "executions", profileId, arn] as const),
  history: (profileId: string, executionArn: string, region?: string) =>
    region
      ? (["sfn", "history", profileId, executionArn, region] as const)
      : (["sfn", "history", profileId, executionArn] as const),
};

export function useSfnClient(): SFNClient {
  const profile = useActiveProfile();
  return useMemo(
    () => makeClients(profile).sfn,
    [profile.id, profile.endpoint, profile.region, profile.authToken],
  );
}

export function useStateMachines(profileId: string, options?: { enabled?: boolean }) {
  const client = useSfnClient();
  const profile = useActiveProfile();
  return useQuery({
    queryKey: sfnKeys.machines(profileId, profile.region),
    queryFn: () => listStateMachines(client),
    staleTime: 5_000,
    refetchInterval: 10_000,
    enabled: options?.enabled,
  });
}

export function useStateMachine(
  profileId: string,
  arn: string,
  options?: { enabled?: boolean },
) {
  const client = useSfnClient();
  const profile = useActiveProfile();
  return useQuery({
    queryKey: sfnKeys.machine(profileId, arn, profile.region),
    queryFn: () => getStateMachine(client, arn),
    staleTime: 5_000,
    enabled: Boolean(arn) && options?.enabled !== false,
  });
}

export function useExecutions(
  profileId: string,
  arn: string,
  options?: { enabled?: boolean },
) {
  const client = useSfnClient();
  const profile = useActiveProfile();
  return useQuery({
    queryKey: sfnKeys.executions(profileId, arn, profile.region),
    queryFn: () => listExecutions(client, arn),
    staleTime: 5_000,
    refetchInterval: 10_000,
    enabled: Boolean(arn) && options?.enabled !== false,
  });
}

export function useExecutionHistory(
  profileId: string,
  executionArn: string,
  options?: { enabled?: boolean },
) {
  const client = useSfnClient();
  const profile = useActiveProfile();
  return useQuery({
    queryKey: sfnKeys.history(profileId, executionArn, profile.region),
    queryFn: () => getExecutionHistory(client, executionArn),
    staleTime: 5_000,
    enabled: Boolean(executionArn) && options?.enabled !== false,
  });
}

export function useSfnActions() {
  const client = useSfnClient();
  const queryClient = useQueryClient();
  const profile = useActiveProfile();

  const invalidateMachines = () => {
    queryClient.invalidateQueries({ queryKey: ["sfn", "machines", profile.id] });
  };

  const invalidateMachine = (arn: string) => {
    queryClient.invalidateQueries({ queryKey: ["sfn", "machine", profile.id, arn] });
    queryClient.invalidateQueries({ queryKey: ["sfn", "executions", profile.id, arn] });
  };

  const invalidateExecution = (executionArn: string) => {
    queryClient.invalidateQueries({
      queryKey: ["sfn", "history", profile.id, executionArn],
    });
  };

  const createStateMachineAction = async (params: {
    name: string;
    definition: string;
  }): Promise<string | null> => {
    try {
      const { arn } = await createStateMachine(client, params);
      toast.success(`State machine ${params.name} created`);
      invalidateMachines();
      return arn;
    } catch (e) {
      toast.error(`Failed to create state machine: ${toErrorMessage(e)}`);
      return null;
    }
  };

  const deleteStateMachineAction = async (
    arn: string,
    name?: string,
  ): Promise<boolean> => {
    try {
      await deleteStateMachine(client, arn);
      toast.success(`State machine ${name ?? ""} deleted`);
      invalidateMachines();
      queryClient.invalidateQueries({ queryKey: ["sfn", "machine", profile.id, arn] });
      queryClient.invalidateQueries({
        queryKey: ["sfn", "executions", profile.id, arn],
      });
      return true;
    } catch (e) {
      toast.error(`Failed to delete state machine: ${toErrorMessage(e)}`);
      return false;
    }
  };

  const startExecutionAction = async (params: {
    stateMachineArn: string;
    input?: string;
  }): Promise<string | null> => {
    try {
      const { executionArn } = await startExecution(client, params);
      toast.success("Execution started");
      invalidateMachine(params.stateMachineArn);
      return executionArn;
    } catch (e) {
      toast.error(`Failed to start execution: ${toErrorMessage(e)}`);
      return null;
    }
  };

  const stopExecutionAction = async (
    executionArn: string,
    cause?: string,
  ): Promise<boolean> => {
    try {
      await stopExecution(client, executionArn, cause);
      toast.success("Execution stopped");
      invalidateExecution(executionArn);
      return true;
    } catch (e) {
      toast.error(`Failed to stop execution: ${toErrorMessage(e)}`);
      return false;
    }
  };

  return {
    createStateMachine: createStateMachineAction,
    deleteStateMachine: deleteStateMachineAction,
    startExecution: startExecutionAction,
    stopExecution: stopExecutionAction,
  };
}
