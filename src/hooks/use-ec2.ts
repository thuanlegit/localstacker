import { useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { EC2Client } from "@aws-sdk/client-ec2";
import { toast } from "sonner";
import { makeClients } from "@/lib/aws";
import { useActiveProfile } from "@/store/profiles";
import {
  listInstances,
  startInstances,
  stopInstances,
  rebootInstances,
  terminateInstances,
  runInstances,
  listKeyPairs,
  createKeyPair,
  deleteKeyPair,
  listSecurityGroups,
  createSecurityGroup,
  deleteSecurityGroup,
  authorizeSecurityGroupIngress,
  revokeSecurityGroupIngress,
  authorizeSecurityGroupEgress,
  revokeSecurityGroupEgress,
  type InstanceSummary,
  type CreatedKeyPair,
  type IpPermissionRuleInput,
  type RunInstancesInput,
} from "@/lib/ec2";

function toErrorMessage(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

export const ec2Keys = {
  all: ["ec2"] as const,
  instances: (profileId: string) => ["ec2", "instances", profileId] as const,
  keyPairs: (profileId: string) => ["ec2", "keyPairs", profileId] as const,
  securityGroups: (profileId: string) =>
    ["ec2", "securityGroups", profileId] as const,
};

export function useEc2Client(): EC2Client {
  const profile = useActiveProfile();
  return useMemo(
    () => makeClients(profile).ec2,
    [profile.id, profile.endpoint, profile.region, profile.authToken],
  );
}

export function useInstances(options?: { enabled?: boolean }) {
  const client = useEc2Client();
  const profile = useActiveProfile();
  return useQuery({
    queryKey: ec2Keys.instances(profile.id),
    queryFn: () => listInstances(client),
    staleTime: 5_000,
    refetchInterval: 10_000,
    enabled: options?.enabled,
  });
}

export function useKeyPairs(options?: { enabled?: boolean }) {
  const client = useEc2Client();
  const profile = useActiveProfile();
  return useQuery({
    queryKey: ec2Keys.keyPairs(profile.id),
    queryFn: () => listKeyPairs(client),
    staleTime: 5_000,
    refetchInterval: 10_000,
    enabled: options?.enabled,
  });
}

export function useSecurityGroups(options?: { enabled?: boolean }) {
  const client = useEc2Client();
  const profile = useActiveProfile();
  return useQuery({
    queryKey: ec2Keys.securityGroups(profile.id),
    queryFn: () => listSecurityGroups(client),
    staleTime: 5_000,
    refetchInterval: 10_000,
    enabled: options?.enabled,
  });
}

export function useInstanceActions() {
  const client = useEc2Client();
  const queryClient = useQueryClient();
  const profile = useActiveProfile();

  const invalidateInstances = () => {
    queryClient.invalidateQueries({
      queryKey: ec2Keys.instances(profile.id),
    });
  };

  const startInstance = async (instanceId: string): Promise<boolean> => {
    try {
      await startInstances(client, [instanceId]);
      toast.success(`Instance started: ${instanceId}`);
      invalidateInstances();
      return true;
    } catch (e) {
      toast.error(`Failed to start instance: ${toErrorMessage(e)}`);
      return false;
    }
  };

  const stopInstance = async (instanceId: string): Promise<boolean> => {
    try {
      await stopInstances(client, [instanceId]);
      toast.success(`Instance stopped: ${instanceId}`);
      invalidateInstances();
      return true;
    } catch (e) {
      toast.error(`Failed to stop instance: ${toErrorMessage(e)}`);
      return false;
    }
  };

  const rebootInstance = async (instanceId: string): Promise<boolean> => {
    try {
      await rebootInstances(client, [instanceId]);
      toast.success(`Instance rebooted: ${instanceId}`);
      invalidateInstances();
      return true;
    } catch (e) {
      toast.error(`Failed to reboot instance: ${toErrorMessage(e)}`);
      return false;
    }
  };

  const terminateInstance = async (instanceId: string): Promise<boolean> => {
    try {
      await terminateInstances(client, [instanceId]);
      toast.success(`Instance terminated: ${instanceId}`);
      invalidateInstances();
      return true;
    } catch (e) {
      toast.error(`Failed to terminate instance: ${toErrorMessage(e)}`);
      return false;
    }
  };

  const launchInstance = async (
    input: RunInstancesInput,
  ): Promise<InstanceSummary | null> => {
    try {
      const created = await runInstances(client, input);
      toast.success(`Instance launched: ${created.instanceId}`);
      invalidateInstances();
      return created;
    } catch (e) {
      toast.error(`Failed to launch instance: ${toErrorMessage(e)}`);
      return null;
    }
  };

  return {
    startInstance,
    stopInstance,
    rebootInstance,
    terminateInstance,
    launchInstance,
  };
}

export function useKeyPairActions() {
  const client = useEc2Client();
  const queryClient = useQueryClient();
  const profile = useActiveProfile();

  const invalidateKeyPairs = () => {
    queryClient.invalidateQueries({
      queryKey: ec2Keys.keyPairs(profile.id),
    });
  };

  const createKeyPairAction = async (input: {
    keyName: string;
    keyType?: "rsa" | "ed25519";
  }): Promise<CreatedKeyPair | null> => {
    try {
      const created = await createKeyPair(client, input);
      toast.success(`Key pair created: ${created.keyName}`);
      invalidateKeyPairs();
      return created;
    } catch (e) {
      toast.error(`Failed to create key pair: ${toErrorMessage(e)}`);
      return null;
    }
  };

  const deleteKeyPairAction = async (
    keyName: string,
    keyPairId?: string,
  ): Promise<boolean> => {
    try {
      await deleteKeyPair(client, keyName, keyPairId);
      toast.success(`Key pair deleted: ${keyName}`);
      invalidateKeyPairs();
      return true;
    } catch (e) {
      toast.error(`Failed to delete key pair: ${toErrorMessage(e)}`);
      return false;
    }
  };

  return {
    createKeyPair: createKeyPairAction,
    deleteKeyPair: deleteKeyPairAction,
  };
}

export function useSecurityGroupActions() {
  const client = useEc2Client();
  const queryClient = useQueryClient();
  const profile = useActiveProfile();

  const invalidateSecurityGroups = () => {
    queryClient.invalidateQueries({
      queryKey: ec2Keys.securityGroups(profile.id),
    });
  };

  const createSecurityGroupAction = async (input: {
    groupName: string;
    description: string;
    vpcId?: string;
  }): Promise<string | null> => {
    try {
      const groupId = await createSecurityGroup(client, input);
      toast.success(`Security group created: ${input.groupName} (${groupId})`);
      invalidateSecurityGroups();
      return groupId;
    } catch (e) {
      toast.error(`Failed to create security group: ${toErrorMessage(e)}`);
      return null;
    }
  };

  const deleteSecurityGroupAction = async (
    groupId: string,
    groupName?: string,
  ): Promise<boolean> => {
    try {
      await deleteSecurityGroup(client, groupId);
      toast.success(
        `Security group deleted${groupName ? `: ${groupName}` : ""}`,
      );
      invalidateSecurityGroups();
      return true;
    } catch (e) {
      toast.error(`Failed to delete security group: ${toErrorMessage(e)}`);
      return false;
    }
  };

  const addIngressRule = async (
    groupId: string,
    rule: IpPermissionRuleInput,
  ): Promise<boolean> => {
    try {
      await authorizeSecurityGroupIngress(client, groupId, rule);
      toast.success("Inbound rule added");
      invalidateSecurityGroups();
      return true;
    } catch (e) {
      toast.error(`Failed to add inbound rule: ${toErrorMessage(e)}`);
      return false;
    }
  };

  const removeIngressRule = async (
    groupId: string,
    rule: IpPermissionRuleInput,
  ): Promise<boolean> => {
    try {
      await revokeSecurityGroupIngress(client, groupId, rule);
      toast.success("Inbound rule removed");
      invalidateSecurityGroups();
      return true;
    } catch (e) {
      toast.error(`Failed to remove inbound rule: ${toErrorMessage(e)}`);
      return false;
    }
  };

  const addEgressRule = async (
    groupId: string,
    rule: IpPermissionRuleInput,
  ): Promise<boolean> => {
    try {
      await authorizeSecurityGroupEgress(client, groupId, rule);
      toast.success("Outbound rule added");
      invalidateSecurityGroups();
      return true;
    } catch (e) {
      toast.error(`Failed to add outbound rule: ${toErrorMessage(e)}`);
      return false;
    }
  };

  const removeEgressRule = async (
    groupId: string,
    rule: IpPermissionRuleInput,
  ): Promise<boolean> => {
    try {
      await revokeSecurityGroupEgress(client, groupId, rule);
      toast.success("Outbound rule removed");
      invalidateSecurityGroups();
      return true;
    } catch (e) {
      toast.error(`Failed to remove outbound rule: ${toErrorMessage(e)}`);
      return false;
    }
  };

  return {
    createSecurityGroup: createSecurityGroupAction,
    deleteSecurityGroup: deleteSecurityGroupAction,
    addIngressRule,
    removeIngressRule,
    addEgressRule,
    removeEgressRule,
  };
}
