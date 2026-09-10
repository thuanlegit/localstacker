import { useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { Route53Client } from "@aws-sdk/client-route-53";
import { toast } from "sonner";
import { makeClients } from "@/lib/aws";
import { useActiveProfile } from "@/store/profiles";
import {
  listHostedZones,
  createHostedZone,
  deleteHostedZone,
  listResourceRecordSets,
  changeResourceRecordSets,
  type HostedZoneSummary,
} from "@/lib/route53";

function toErrorMessage(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

export const route53Keys = {
  all: ["route53"] as const,
  hostedZones: (profileId: string) =>
    ["route53", "hostedZones", profileId] as const,
  hostedZone: (profileId: string, zoneId: string) =>
    ["route53", "hostedZone", profileId, zoneId] as const,
  recordSets: (profileId: string, zoneId: string) =>
    ["route53", "recordSets", profileId, zoneId] as const,
};

export function useRoute53Client(): Route53Client {
  const profile = useActiveProfile();
  return useMemo(
    () => makeClients(profile).route53,
    [profile.id, profile.endpoint, profile.region, profile.authToken],
  );
}

export function useHostedZones(options?: { enabled?: boolean }) {
  const client = useRoute53Client();
  const profile = useActiveProfile();
  return useQuery({
    queryKey: route53Keys.hostedZones(profile.id),
    queryFn: () => listHostedZones(client),
    staleTime: 5_000,
    refetchInterval: 10_000,
    enabled: options?.enabled,
  });
}

export function useResourceRecordSets(
  zoneId: string,
  options?: { enabled?: boolean },
) {
  const client = useRoute53Client();
  const profile = useActiveProfile();
  return useQuery({
    queryKey: route53Keys.recordSets(profile.id, zoneId),
    queryFn: () => listResourceRecordSets(client, zoneId),
    staleTime: 5_000,
    refetchInterval: 10_000,
    enabled: (options?.enabled ?? true) && Boolean(zoneId),
  });
}

export function useHostedZoneActions() {
  const client = useRoute53Client();
  const queryClient = useQueryClient();
  const profile = useActiveProfile();

  const invalidateZones = () => {
    queryClient.invalidateQueries({
      queryKey: ["route53", "hostedZones", profile.id],
    });
  };

  const createHostedZoneAction = async (input: {
    name: string;
    comment?: string;
    privateZone?: boolean;
  }): Promise<HostedZoneSummary | null> => {
    try {
      const created = await createHostedZone(client, input);
      toast.success(`Hosted zone created: ${created.name}`);
      invalidateZones();
      return created;
    } catch (e) {
      toast.error(`Failed to create hosted zone: ${toErrorMessage(e)}`);
      return null;
    }
  };

  const deleteHostedZoneAction = async (
    zoneId: string,
    zoneName?: string,
  ): Promise<boolean> => {
    try {
      await deleteHostedZone(client, zoneId);
      toast.success(
        `Hosted zone deleted${zoneName ? `: ${zoneName}` : ""}`,
      );
      invalidateZones();
      queryClient.removeQueries({
        queryKey: ["route53", "recordSets", profile.id, zoneId],
      });
      return true;
    } catch (e) {
      toast.error(`Failed to delete hosted zone: ${toErrorMessage(e)}`);
      return false;
    }
  };

  return {
    createHostedZone: createHostedZoneAction,
    deleteHostedZone: deleteHostedZoneAction,
  };
}

export function useRecordSetActions(zoneId: string) {
  const client = useRoute53Client();
  const queryClient = useQueryClient();
  const profile = useActiveProfile();

  const invalidateRecordSets = () => {
    queryClient.invalidateQueries({
      queryKey: ["route53", "recordSets", profile.id, zoneId],
    });
    queryClient.invalidateQueries({
      queryKey: ["route53", "hostedZones", profile.id],
    });
  };

  const createRecordSetAction = async (recordSet: {
    name: string;
    type: string;
    ttl?: number;
    values: string[];
  }): Promise<boolean> => {
    try {
      await changeResourceRecordSets(client, zoneId, "CREATE", recordSet);
      toast.success(`Record created: ${recordSet.name} (${recordSet.type})`);
      invalidateRecordSets();
      return true;
    } catch (e) {
      toast.error(`Failed to create record: ${toErrorMessage(e)}`);
      return false;
    }
  };

  const updateRecordSetAction = async (recordSet: {
    name: string;
    type: string;
    ttl?: number;
    values: string[];
  }): Promise<boolean> => {
    try {
      await changeResourceRecordSets(client, zoneId, "UPSERT", recordSet);
      toast.success(`Record updated: ${recordSet.name} (${recordSet.type})`);
      invalidateRecordSets();
      return true;
    } catch (e) {
      toast.error(`Failed to update record: ${toErrorMessage(e)}`);
      return false;
    }
  };

  const deleteRecordSetAction = async (recordSet: {
    name: string;
    type: string;
    ttl?: number;
    values: string[];
  }): Promise<boolean> => {
    try {
      await changeResourceRecordSets(client, zoneId, "DELETE", recordSet);
      toast.success(`Record deleted: ${recordSet.name} (${recordSet.type})`);
      invalidateRecordSets();
      return true;
    } catch (e) {
      toast.error(`Failed to delete record: ${toErrorMessage(e)}`);
      return false;
    }
  };

  return {
    createRecordSet: createRecordSetAction,
    updateRecordSet: updateRecordSetAction,
    deleteRecordSet: deleteRecordSetAction,
  };
}
