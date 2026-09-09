import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import type { SecretsManagerClient } from "@aws-sdk/client-secrets-manager";
import { makeClients } from "@/lib/aws";
import { useActiveProfile } from "@/store/profiles";
import { listSecrets, listSecretVersions } from "@/lib/secrets";
export const secretsKeys = {
  secrets: (profileId: string, region?: string) =>
    region
      ? (["secrets", "secrets", profileId, region] as const)
      : (["secrets", "secrets", profileId] as const),
  versions: (profileId: string, name: string) =>
    ["secrets", "versions", profileId, name] as const,
};

export function useSecretsClient(): SecretsManagerClient {
  const profile = useActiveProfile();
  return useMemo(
    () => makeClients(profile).secrets,
    [profile.id, profile.endpoint, profile.region, profile.authToken],
  );
}

export function useSecrets(
  profileId: string,
  options?: { enabled?: boolean },
) {
  const client = useSecretsClient();
  const profile = useActiveProfile();
  return useQuery({
    queryKey: secretsKeys.secrets(profileId, profile.region),
    queryFn: () => listSecrets(client),
    staleTime: 30_000,
    enabled: options?.enabled,
  });
}

export function useSecretVersions(
  name: string,
  options?: { enabled?: boolean },
) {
  const client = useSecretsClient();
  const profile = useActiveProfile();
  return useQuery({
    queryKey: secretsKeys.versions(profile.id, name),
    queryFn: () => listSecretVersions(client, { secretId: name }),
    enabled: options?.enabled !== undefined ? options.enabled && !!name : !!name,
    staleTime: 30_000,
  });
}
