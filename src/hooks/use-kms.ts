import { useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { KMSClient } from "@aws-sdk/client-kms";
import { toast } from "sonner";
import { makeClients } from "@/lib/aws";
import { useActiveProfile } from "@/store/profiles";
import {
  listKeys,
  describeKey,
  listAliases,
  getRotationStatus,
  getKeyPolicy,
  createKey,
  createAlias,
  deleteAlias,
  encrypt,
  decrypt,
  deleteKey,
} from "@/lib/kms";

function toErrorMessage(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

export const kmsKeys = {
  keys: (profileId: string, region?: string) =>
    region
      ? (["kms", "keys", profileId, region] as const)
      : (["kms", "keys", profileId] as const),
  detail: (profileId: string, keyId: string, region?: string) =>
    region
      ? (["kms", "detail", profileId, keyId, region] as const)
      : (["kms", "detail", profileId, keyId] as const),
  aliases: (profileId: string, region?: string) =>
    region
      ? (["kms", "aliases", profileId, region] as const)
      : (["kms", "aliases", profileId] as const),
  policy: (profileId: string, keyId: string, region?: string) =>
    region
      ? (["kms", "policy", profileId, keyId, region] as const)
      : (["kms", "policy", profileId, keyId] as const),
};

export function useKmsClient(): KMSClient {
  const profile = useActiveProfile();
  return useMemo(
    () => makeClients(profile).kms,
    [profile.id, profile.endpoint, profile.region, profile.authToken],
  );
}

export function useKmsKeys(profileId: string, options?: { enabled?: boolean }) {
  const client = useKmsClient();
  const profile = useActiveProfile();
  return useQuery({
    queryKey: kmsKeys.keys(profileId, profile.region),
    queryFn: () => listKeys(client),
    staleTime: 5_000,
    refetchInterval: 15_000,
    enabled: options?.enabled,
  });
}

export function useKeyDetail(
  profileId: string,
  keyId: string,
  options?: { enabled?: boolean },
) {
  const client = useKmsClient();
  const profile = useActiveProfile();
  return useQuery({
    queryKey: kmsKeys.detail(profileId, keyId, profile.region),
    queryFn: () => describeKey(client, keyId),
    staleTime: 5_000,
    enabled: options?.enabled,
  });
}

export function useKeyRotation(
  profileId: string,
  keyId: string,
  options?: { enabled?: boolean },
) {
  const client = useKmsClient();
  const profile = useActiveProfile();
  return useQuery({
    queryKey: ["kms", "rotation", profileId, keyId, profile.region],
    queryFn: () => getRotationStatus(client, keyId),
    staleTime: 10_000,
    enabled: options?.enabled,
  });
}

export function useKeyPolicy(
  profileId: string,
  keyId: string,
  options?: { enabled?: boolean },
) {
  const client = useKmsClient();
  const profile = useActiveProfile();
  return useQuery({
    queryKey: kmsKeys.policy(profileId, keyId, profile.region),
    queryFn: () => getKeyPolicy(client, keyId),
    staleTime: 30_000,
    enabled: options?.enabled,
  });
}

export function useKmsAliases(profileId: string, options?: { enabled?: boolean }) {
  const client = useKmsClient();
  const profile = useActiveProfile();
  return useQuery({
    queryKey: kmsKeys.aliases(profileId, profile.region),
    queryFn: () => listAliases(client),
    staleTime: 5_000,
    enabled: options?.enabled,
  });
}

export function useKmsActions() {
  const client = useKmsClient();
  const queryClient = useQueryClient();
  const profile = useActiveProfile();

  const invalidate = () => {
    queryClient.invalidateQueries({
      queryKey: ["kms", "keys", profile.id],
    });
    queryClient.invalidateQueries({
      queryKey: ["kms", "aliases", profile.id],
    });
    queryClient.invalidateQueries({
      queryKey: ["kms", "detail", profile.id],
    });
  };

  const createKeyAction = async (params: {
    description: string;
  }): Promise<string | null> => {
    try {
      const keyId = await createKey(client, params);
      toast.success("Key created");
      invalidate();
      return keyId;
    } catch (e) {
      toast.error(`Failed to create key: ${toErrorMessage(e)}`);
      return null;
    }
  };

  const createAliasAction = async (params: {
    name: string;
    targetKeyId: string;
  }): Promise<boolean> => {
    try {
      await createAlias(client, params);
      toast.success(`Alias ${params.name} created`);
      invalidate();
      return true;
    } catch (e) {
      toast.error(`Failed to create alias: ${toErrorMessage(e)}`);
      return false;
    }
  };

  const deleteAliasAction = async (name: string): Promise<boolean> => {
    try {
      await deleteAlias(client, name);
      toast.success(`Alias ${name} deleted`);
      invalidate();
      return true;
    } catch (e) {
      toast.error(`Failed to delete alias: ${toErrorMessage(e)}`);
      return false;
    }
  };

  const encryptAction = async (params: {
    keyId: string;
    plaintext: string;
  }): Promise<string | null> => {
    try {
      const ciphertext = await encrypt(client, params);
      toast.success("Encrypted");
      return ciphertext;
    } catch (e) {
      toast.error(`Failed to encrypt: ${toErrorMessage(e)}`);
      return null;
    }
  };

  const decryptAction = async (params: {
    keyId: string;
    ciphertextBase64: string;
  }): Promise<string | null> => {
    try {
      const plaintext = await decrypt(client, params);
      toast.success("Decrypted");
      return plaintext;
    } catch (e) {
      toast.error(`Failed to decrypt: ${toErrorMessage(e)}`);
      return null;
    }
  };

  const deleteKeyAction = async (keyId: string): Promise<boolean> => {
    try {
      await deleteKey(client, keyId);
      toast.success("Key deletion scheduled (7 day window)");
      invalidate();
      return true;
    } catch (e) {
      toast.error(`Failed to schedule deletion: ${toErrorMessage(e)}`);
      return false;
    }
  };

  return {
    createKey: createKeyAction,
    createAlias: createAliasAction,
    deleteAlias: deleteAliasAction,
    encrypt: encryptAction,
    decrypt: decryptAction,
    deleteKey: deleteKeyAction,
  };
}
