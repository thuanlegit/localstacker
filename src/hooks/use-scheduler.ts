import { useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { SchedulerClient } from "@aws-sdk/client-scheduler";
import { toast } from "sonner";
import { makeClients } from "@/lib/aws";
import { useActiveProfile } from "@/store/profiles";
import {
  listScheduleGroups,
  createScheduleGroup,
  deleteScheduleGroup,
  listSchedules,
  createSchedule,
  deleteSchedule,
  updateScheduleState,
} from "@/lib/scheduler";

function toErrorMessage(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

export const schedulerKeys = {
  groups: (profileId: string, region?: string) =>
    region
      ? (["scheduler", "groups", profileId, region] as const)
      : (["scheduler", "groups", profileId] as const),
  schedules: (profileId: string, groupName: string, region?: string) =>
    region
      ? (["scheduler", "schedules", profileId, groupName, region] as const)
      : (["scheduler", "schedules", profileId, groupName] as const),
};

export function useSchedulerClient(): SchedulerClient {
  const profile = useActiveProfile();
  return useMemo(
    () => makeClients(profile).scheduler,
    [profile.id, profile.endpoint, profile.region, profile.authToken],
  );
}

export function useScheduleGroups(
  profileId: string,
  options?: { enabled?: boolean },
) {
  const client = useSchedulerClient();
  const profile = useActiveProfile();
  return useQuery({
    queryKey: schedulerKeys.groups(profileId, profile.region),
    queryFn: () => listScheduleGroups(client),
    staleTime: 5_000,
    refetchInterval: 10_000,
    enabled: options?.enabled,
  });
}

export function useSchedules(
  profileId: string,
  groupName: string,
  options?: { enabled?: boolean },
) {
  const client = useSchedulerClient();
  const profile = useActiveProfile();
  return useQuery({
    queryKey: schedulerKeys.schedules(profileId, groupName, profile.region),
    queryFn: () => listSchedules(client, groupName),
    staleTime: 5_000,
    refetchInterval: 10_000,
    enabled: Boolean(groupName) && options?.enabled !== false,
  });
}

export function useScheduleGroupActions() {
  const client = useSchedulerClient();
  const queryClient = useQueryClient();
  const profile = useActiveProfile();

  const invalidateGroups = () => {
    queryClient.invalidateQueries({
      queryKey: ["scheduler", "groups", profile.id],
    });
  };

  const createGroupAction = async (name: string): Promise<string | null> => {
    try {
      const { arn } = await createScheduleGroup(client, name);
      toast.success(`Schedule group ${name} created`);
      invalidateGroups();
      return arn;
    } catch (e) {
      toast.error(`Failed to create schedule group: ${toErrorMessage(e)}`);
      return null;
    }
  };

  const deleteGroupAction = async (name: string): Promise<boolean> => {
    try {
      await deleteScheduleGroup(client, name);
      toast.success("Schedule group deleted");
      invalidateGroups();
      queryClient.invalidateQueries({
        queryKey: ["scheduler", "schedules", profile.id, name],
      });
      return true;
    } catch (e) {
      toast.error(`Failed to delete schedule group: ${toErrorMessage(e)}`);
      return false;
    }
  };

  return {
    createScheduleGroup: createGroupAction,
    deleteScheduleGroup: deleteGroupAction,
  };
}

export function useScheduleActions(groupName: string) {
  const client = useSchedulerClient();
  const queryClient = useQueryClient();
  const profile = useActiveProfile();

  const invalidateSchedules = () => {
    queryClient.invalidateQueries({
      queryKey: ["scheduler", "schedules", profile.id, groupName],
    });
  };

  const createScheduleAction = async (params: {
    name: string;
    expression: string;
    targetArn: string;
    targetInput?: string;
    timezone?: string;
    roleArn?: string;
    state?: "ENABLED" | "DISABLED";
    expressionType?: "rate" | "cron" | "at";
  }): Promise<string | null> => {
    try {
      const { arn } = await createSchedule(client, { ...params, groupName });
      toast.success(`Schedule ${params.name} created`);
      invalidateSchedules();
      return arn;
    } catch (e) {
      toast.error(`Failed to create schedule: ${toErrorMessage(e)}`);
      return null;
    }
  };

  const deleteScheduleAction = async (name: string): Promise<boolean> => {
    try {
      await deleteSchedule(client, { name, groupName });
      toast.success("Schedule deleted");
      invalidateSchedules();
      return true;
    } catch (e) {
      toast.error(`Failed to delete schedule: ${toErrorMessage(e)}`);
      return false;
    }
  };

  const updateStateAction = async (
    name: string,
    enabled: boolean,
  ): Promise<boolean> => {
    try {
      await updateScheduleState(client, { name, groupName, enabled });
      toast.success(enabled ? "Schedule enabled" : "Schedule disabled");
      invalidateSchedules();
      return true;
    } catch (e) {
      toast.error(`Failed to update schedule: ${toErrorMessage(e)}`);
      return false;
    }
  };

  return {
    createSchedule: createScheduleAction,
    deleteSchedule: deleteScheduleAction,
    updateScheduleState: updateStateAction,
  };
}
