import { useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { EventBridgeClient } from "@aws-sdk/client-eventbridge";
import { toast } from "sonner";
import { makeClients } from "@/lib/aws";
import { useActiveProfile } from "@/store/profiles";
import {
  listEventBuses,
  createEventBus,
  deleteEventBus,
  listRules,
  putRule,
  deleteRule,
  setRuleState,
  listRuleTargets,
  putRuleTargets,
  removeRuleTargets,
  putEvents,
} from "@/lib/eventbridge";

function toErrorMessage(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

export const eventbridgeKeys = {
  buses: (profileId: string, region?: string) =>
    region
      ? (["eventbridge", "buses", profileId, region] as const)
      : (["eventbridge", "buses", profileId] as const),
  rules: (profileId: string, busName: string, region?: string) =>
    region
      ? (["eventbridge", "rules", profileId, busName, region] as const)
      : (["eventbridge", "rules", profileId, busName] as const),
  targets: (profileId: string, busName: string, rule: string, region?: string) =>
    region
      ? (["eventbridge", "targets", profileId, busName, rule, region] as const)
      : (["eventbridge", "targets", profileId, busName, rule] as const),
};

export function useEventBridgeClient(): EventBridgeClient {
  const profile = useActiveProfile();
  return useMemo(
    () => makeClients(profile).eventbridge,
    [profile.id, profile.endpoint, profile.region, profile.authToken],
  );
}

export function useEventBuses(
  profileId: string,
  options?: { enabled?: boolean },
) {
  const client = useEventBridgeClient();
  const profile = useActiveProfile();
  return useQuery({
    queryKey: eventbridgeKeys.buses(profileId, profile.region),
    queryFn: () => listEventBuses(client),
    staleTime: 5_000,
    refetchInterval: 10_000,
    enabled: options?.enabled,
  });
}

export function useRules(
  profileId: string,
  busName: string,
  options?: { enabled?: boolean },
) {
  const client = useEventBridgeClient();
  const profile = useActiveProfile();
  return useQuery({
    queryKey: eventbridgeKeys.rules(profileId, busName, profile.region),
    queryFn: () => listRules(client, busName),
    staleTime: 5_000,
    refetchInterval: 10_000,
    enabled: options?.enabled,
  });
}

export function useRuleTargets(
  profileId: string,
  busName: string,
  rule: string | undefined,
  options?: { enabled?: boolean },
) {
  const client = useEventBridgeClient();
  const profile = useActiveProfile();
  return useQuery({
    queryKey:
      rule
        ? eventbridgeKeys.targets(profileId, busName, rule, profile.region)
        : (["eventbridge", "targets", profileId, busName] as const),
    queryFn: () => listRuleTargets(client, { busName, rule: rule! }),
    staleTime: 5_000,
    enabled: Boolean(rule) && options?.enabled !== false,
  });
}

export function useEventBusActions() {
  const client = useEventBridgeClient();
  const queryClient = useQueryClient();
  const profile = useActiveProfile();

  const invalidateBuses = () => {
    queryClient.invalidateQueries({
      queryKey: ["eventbridge", "buses", profile.id],
    });
  };

  const createBusAction = async (params: {
    name: string;
  }): Promise<string | null> => {
    try {
      const { arn } = await createEventBus(client, params);
      toast.success(`Event bus ${params.name} created`);
      invalidateBuses();
      return arn;
    } catch (e) {
      toast.error(`Failed to create event bus: ${toErrorMessage(e)}`);
      return null;
    }
  };

  const deleteBusAction = async (name: string): Promise<boolean> => {
    try {
      await deleteEventBus(client, name);
      toast.success("Event bus deleted");
      invalidateBuses();
      queryClient.invalidateQueries({
        queryKey: ["eventbridge", "rules", profile.id, name],
      });
      queryClient.invalidateQueries({
        queryKey: ["eventbridge", "targets", profile.id, name],
      });
      return true;
    } catch (e) {
      toast.error(`Failed to delete event bus: ${toErrorMessage(e)}`);
      return false;
    }
  };

  return { createBus: createBusAction, deleteBus: deleteBusAction };
}

export function useRuleActions(busName: string) {
  const client = useEventBridgeClient();
  const queryClient = useQueryClient();
  const profile = useActiveProfile();

  const invalidateRules = () => {
    queryClient.invalidateQueries({
      queryKey: ["eventbridge", "rules", profile.id, busName],
    });
  };

  const invalidateTargets = (rule: string) => {
    queryClient.invalidateQueries({
      queryKey: ["eventbridge", "targets", profile.id, busName, rule],
    });
  };

  const putRuleAction = async (params: {
    name: string;
    eventPattern?: string;
    scheduleExpression?: string;
    state?: "ENABLED" | "DISABLED";
    description?: string;
  }): Promise<string | null> => {
    try {
      const { arn } = await putRule(client, { ...params, busName });
      toast.success(`Rule ${params.name} saved`);
      invalidateRules();
      return arn;
    } catch (e) {
      toast.error(`Failed to save rule: ${toErrorMessage(e)}`);
      return null;
    }
  };

  const deleteRuleAction = async (name: string): Promise<boolean> => {
    try {
      await deleteRule(client, { busName, name });
      toast.success("Rule deleted");
      invalidateRules();
      invalidateTargets(name);
      return true;
    } catch (e) {
      toast.error(`Failed to delete rule: ${toErrorMessage(e)}`);
      return false;
    }
  };

  const setRuleStateAction = async (
    name: string,
    enabled: boolean,
  ): Promise<boolean> => {
    try {
      await setRuleState(client, { busName, name, enabled });
      toast.success(enabled ? "Rule enabled" : "Rule disabled");
      invalidateRules();
      return true;
    } catch (e) {
      toast.error(`Failed to update rule state: ${toErrorMessage(e)}`);
      return false;
    }
  };

  const addTargetsAction = async (
    rule: string,
    targets: Array<{ id: string; arn: string; input?: string }>,
  ): Promise<boolean> => {
    try {
      await putRuleTargets(client, { busName, rule, targets });
      toast.success("Target added");
      invalidateTargets(rule);
      return true;
    } catch (e) {
      toast.error(`Failed to add target: ${toErrorMessage(e)}`);
      return false;
    }
  };

  const removeTargetsAction = async (
    rule: string,
    ids: string[],
  ): Promise<boolean> => {
    try {
      await removeRuleTargets(client, { busName, rule, ids });
      toast.success("Target removed");
      invalidateTargets(rule);
      return true;
    } catch (e) {
      toast.error(`Failed to remove target: ${toErrorMessage(e)}`);
      return false;
    }
  };

  return {
    putRule: putRuleAction,
    deleteRule: deleteRuleAction,
    setRuleState: setRuleStateAction,
    addTargets: addTargetsAction,
    removeTargets: removeTargetsAction,
  };
}

export function usePutEvents(busName: string) {
  const client = useEventBridgeClient();

  return async (params: {
    source: string;
    detailType: string;
    detail: string;
  }): Promise<string | null> => {
    try {
      const { eventId } = await putEvents(client, { ...params, busName });
      toast.success("Event published");
      return eventId;
    } catch (e) {
      toast.error(`Failed to publish event: ${toErrorMessage(e)}`);
      return null;
    }
  };
}
