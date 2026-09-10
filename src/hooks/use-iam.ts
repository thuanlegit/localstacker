import { useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { IAMClient } from "@aws-sdk/client-iam";
import { toast } from "sonner";
import { makeClients } from "@/lib/aws";
import { useActiveProfile } from "@/store/profiles";
import {
  listRoles,
  getRole,
  createRole,
  deleteRole,
  listRolePolicies,
  getRolePolicy,
  putRolePolicy,
  deleteRolePolicy,
  listAttachedRolePolicies,
  listUsers,
  createUser,
  deleteUser,
  listAccessKeys,
  createAccessKey,
  updateAccessKeyStatus,
  deleteAccessKey,
  listPolicies,
  type RoleSummary,
  type UserSummary,
  type CreatedAccessKey,
} from "@/lib/iam";

function toErrorMessage(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

export const iamKeys = {
  all: ["iam"] as const,
  roles: (profileId: string) => ["iam", "roles", profileId] as const,
  role: (profileId: string, roleName: string) =>
    ["iam", "role", profileId, roleName] as const,
  rolePolicies: (profileId: string, roleName: string) =>
    ["iam", "rolePolicies", profileId, roleName] as const,
  rolePolicy: (profileId: string, roleName: string, policyName: string) =>
    ["iam", "rolePolicy", profileId, roleName, policyName] as const,
  attachedRolePolicies: (profileId: string, roleName: string) =>
    ["iam", "attachedRolePolicies", profileId, roleName] as const,
  users: (profileId: string) => ["iam", "users", profileId] as const,
  user: (profileId: string, userName: string) =>
    ["iam", "user", profileId, userName] as const,
  accessKeys: (profileId: string, userName: string) =>
    ["iam", "accessKeys", profileId, userName] as const,
  policies: (profileId: string, scope: "All" | "AWS" | "Local" = "All") =>
    ["iam", "policies", profileId, scope] as const,
};

export function useIamClient(): IAMClient {
  const profile = useActiveProfile();
  return useMemo(
    () => makeClients(profile).iam,
    [profile.id, profile.endpoint, profile.region, profile.authToken],
  );
}

export function useRoles(options?: { enabled?: boolean }) {
  const client = useIamClient();
  const profile = useActiveProfile();
  return useQuery({
    queryKey: iamKeys.roles(profile.id),
    queryFn: () => listRoles(client),
    staleTime: 5_000,
    refetchInterval: 10_000,
    enabled: options?.enabled,
  });
}

export function useRole(roleName: string, options?: { enabled?: boolean }) {
  const client = useIamClient();
  const profile = useActiveProfile();
  return useQuery({
    queryKey: iamKeys.role(profile.id, roleName),
    queryFn: () => getRole(client, roleName),
    staleTime: 5_000,
    enabled: (options?.enabled ?? true) && Boolean(roleName),
  });
}

export function useRolePolicies(
  roleName: string,
  options?: { enabled?: boolean },
) {
  const client = useIamClient();
  const profile = useActiveProfile();
  return useQuery({
    queryKey: iamKeys.rolePolicies(profile.id, roleName),
    queryFn: () => listRolePolicies(client, roleName),
    staleTime: 5_000,
    enabled: (options?.enabled ?? true) && Boolean(roleName),
  });
}

export function useRolePolicy(
  roleName: string,
  policyName: string,
  options?: { enabled?: boolean },
) {
  const client = useIamClient();
  const profile = useActiveProfile();
  return useQuery({
    queryKey: iamKeys.rolePolicy(profile.id, roleName, policyName),
    queryFn: () => getRolePolicy(client, roleName, policyName),
    staleTime: 5_000,
    enabled:
      (options?.enabled ?? true) && Boolean(roleName) && Boolean(policyName),
  });
}

export function useAttachedRolePolicies(
  roleName: string,
  options?: { enabled?: boolean },
) {
  const client = useIamClient();
  const profile = useActiveProfile();
  return useQuery({
    queryKey: iamKeys.attachedRolePolicies(profile.id, roleName),
    queryFn: () => listAttachedRolePolicies(client, roleName),
    staleTime: 5_000,
    enabled: (options?.enabled ?? true) && Boolean(roleName),
  });
}

export function useUsers(options?: { enabled?: boolean }) {
  const client = useIamClient();
  const profile = useActiveProfile();
  return useQuery({
    queryKey: iamKeys.users(profile.id),
    queryFn: () => listUsers(client),
    staleTime: 5_000,
    refetchInterval: 10_000,
    enabled: options?.enabled,
  });
}

export function useAccessKeys(
  userName: string,
  options?: { enabled?: boolean },
) {
  const client = useIamClient();
  const profile = useActiveProfile();
  return useQuery({
    queryKey: iamKeys.accessKeys(profile.id, userName),
    queryFn: () => listAccessKeys(client, userName),
    staleTime: 5_000,
    enabled: (options?.enabled ?? true) && Boolean(userName),
  });
}

export function usePolicies(
  scope: "All" | "AWS" | "Local" = "All",
  options?: { enabled?: boolean },
) {
  const client = useIamClient();
  const profile = useActiveProfile();
  return useQuery({
    queryKey: iamKeys.policies(profile.id, scope),
    queryFn: () => listPolicies(client, scope),
    staleTime: 5_000,
    refetchInterval: 10_000,
    enabled: options?.enabled,
  });
}

export function useRoleActions() {
  const client = useIamClient();
  const queryClient = useQueryClient();
  const profile = useActiveProfile();

  const invalidateRoles = () => {
    queryClient.invalidateQueries({
      queryKey: ["iam", "roles", profile.id],
    });
  };

  const createRoleAction = async (input: {
    roleName: string;
    assumeRolePolicyDocument: string;
    description?: string;
    path?: string;
  }): Promise<RoleSummary | null> => {
    try {
      const created = await createRole(client, input);
      toast.success(`Role created: ${input.roleName}`);
      invalidateRoles();
      return created;
    } catch (e) {
      toast.error(`Failed to create role: ${toErrorMessage(e)}`);
      return null;
    }
  };

  const deleteRoleAction = async (roleName: string): Promise<boolean> => {
    try {
      await deleteRole(client, roleName);
      toast.success(`Role deleted: ${roleName}`);
      invalidateRoles();
      queryClient.removeQueries({
        queryKey: ["iam", "role", profile.id, roleName],
      });
      return true;
    } catch (e) {
      toast.error(`Failed to delete role: ${toErrorMessage(e)}`);
      return false;
    }
  };

  const putRolePolicyAction = async (
    roleName: string,
    policyName: string,
    policyDocument: string,
  ): Promise<boolean> => {
    try {
      await putRolePolicy(client, roleName, policyName, policyDocument);
      toast.success(`Policy saved: ${policyName}`);
      queryClient.invalidateQueries({
        queryKey: ["iam", "rolePolicies", profile.id, roleName],
      });
      queryClient.invalidateQueries({
        queryKey: ["iam", "rolePolicy", profile.id, roleName, policyName],
      });
      return true;
    } catch (e) {
      toast.error(`Failed to save policy: ${toErrorMessage(e)}`);
      return false;
    }
  };

  const deleteRolePolicyAction = async (
    roleName: string,
    policyName: string,
  ): Promise<boolean> => {
    try {
      await deleteRolePolicy(client, roleName, policyName);
      toast.success(`Policy deleted: ${policyName}`);
      queryClient.invalidateQueries({
        queryKey: ["iam", "rolePolicies", profile.id, roleName],
      });
      queryClient.removeQueries({
        queryKey: ["iam", "rolePolicy", profile.id, roleName, policyName],
      });
      return true;
    } catch (e) {
      toast.error(`Failed to delete policy: ${toErrorMessage(e)}`);
      return false;
    }
  };

  return {
    createRole: createRoleAction,
    deleteRole: deleteRoleAction,
    putRolePolicy: putRolePolicyAction,
    deleteRolePolicy: deleteRolePolicyAction,
  };
}

export function useUserActions() {
  const client = useIamClient();
  const queryClient = useQueryClient();
  const profile = useActiveProfile();

  const invalidateUsers = () => {
    queryClient.invalidateQueries({
      queryKey: ["iam", "users", profile.id],
    });
  };

  const createUserAction = async (input: {
    userName: string;
    path?: string;
  }): Promise<UserSummary | null> => {
    try {
      const created = await createUser(client, input);
      toast.success(`User created: ${input.userName}`);
      invalidateUsers();
      return created;
    } catch (e) {
      toast.error(`Failed to create user: ${toErrorMessage(e)}`);
      return null;
    }
  };

  const deleteUserAction = async (userName: string): Promise<boolean> => {
    try {
      await deleteUser(client, userName);
      toast.success(`User deleted: ${userName}`);
      invalidateUsers();
      queryClient.removeQueries({
        queryKey: ["iam", "user", profile.id, userName],
      });
      return true;
    } catch (e) {
      toast.error(`Failed to delete user: ${toErrorMessage(e)}`);
      return false;
    }
  };

  const createAccessKeyAction = async (
    userName: string,
  ): Promise<CreatedAccessKey | null> => {
    try {
      const created = await createAccessKey(client, userName);
      toast.success(`Access key created for ${userName}`);
      queryClient.invalidateQueries({
        queryKey: ["iam", "accessKeys", profile.id, userName],
      });
      return created;
    } catch (e) {
      toast.error(`Failed to create access key: ${toErrorMessage(e)}`);
      return null;
    }
  };

  const updateAccessKeyStatusAction = async (
    userName: string,
    accessKeyId: string,
    status: "Active" | "Inactive",
  ): Promise<boolean> => {
    try {
      await updateAccessKeyStatus(client, userName, accessKeyId, status);
      toast.success(`Access key set to ${status}`);
      queryClient.invalidateQueries({
        queryKey: ["iam", "accessKeys", profile.id, userName],
      });
      return true;
    } catch (e) {
      toast.error(`Failed to update access key: ${toErrorMessage(e)}`);
      return false;
    }
  };

  const deleteAccessKeyAction = async (
    userName: string,
    accessKeyId: string,
  ): Promise<boolean> => {
    try {
      await deleteAccessKey(client, userName, accessKeyId);
      toast.success(`Access key deleted`);
      queryClient.invalidateQueries({
        queryKey: ["iam", "accessKeys", profile.id, userName],
      });
      return true;
    } catch (e) {
      toast.error(`Failed to delete access key: ${toErrorMessage(e)}`);
      return false;
    }
  };

  return {
    createUser: createUserAction,
    deleteUser: deleteUserAction,
    createAccessKey: createAccessKeyAction,
    updateAccessKeyStatus: updateAccessKeyStatusAction,
    deleteAccessKey: deleteAccessKeyAction,
  };
}
