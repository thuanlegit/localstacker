import { useQuery } from "@tanstack/react-query";
import { checkHealth } from "@/lib/health";
import { useActiveProfile } from "@/store/profiles";
import { LOCALSTACK_SERVICE_NAMES } from "@/lib/services";
import type { ServiceKind } from "@/types";

export const healthKeys = {
  health: (profileId: string, endpoint: string, authToken?: string) =>
    ["health", profileId, endpoint, authToken] as const,
};

export function useHealth() {
  const profile = useActiveProfile();
  return useQuery({
    queryKey: healthKeys.health(profile.id, profile.endpoint, profile.authToken),
    queryFn: () =>
      checkHealth({
        endpoint: profile.endpoint,
        authToken: profile.authToken,
      }),
    refetchInterval: 5000,
    retry: false,
    staleTime: 4000,
  });
}

export function isServiceDisabledError(error: unknown): boolean {
  if (!error) return false;
  const message = error instanceof Error ? error.message : String(error);
  return /is not enabled|check your ['"]?SERVICES['"]?|501/i.test(message);
}

export function useServiceStatus(
  serviceKind: ServiceKind,
): "running" | "available" | "disabled" | "unknown" | undefined {
  const { data } = useHealth();
  if (!data || data.status !== "up") return undefined;

  const localstackName = LOCALSTACK_SERVICE_NAMES[serviceKind];
  const found = data.services.find((s) => s.name === localstackName);
  if (!found) return undefined;

  const st = found.status.toLowerCase();
  if (st === "disabled") return "disabled";
  if (st === "running") return "running";
  if (st === "available") return "available";
  return "unknown";
}
