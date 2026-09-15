import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import type { Route53ResolverClient } from "@aws-sdk/client-route53resolver";
import { makeClients } from "@/lib/aws";
import { useActiveProfile } from "@/store/profiles";
import { listResolverEndpoints, listResolverRules } from "@/lib/route53resolver";

export function useRoute53ResolverClient(): Route53ResolverClient {
  const profile = useActiveProfile();
  return useMemo(
    () => makeClients(profile).route53resolver,
    [profile.id, profile.endpoint, profile.region, profile.authToken],
  );
}

export function useResolverEndpoints(
  profileId: string,
  options?: { enabled?: boolean },
) {
  const client = useRoute53ResolverClient();
  return useQuery({
    queryKey: ["route53resolver", "endpoints", profileId],
    queryFn: () => listResolverEndpoints(client),
    staleTime: 10_000,
    enabled: options?.enabled,
  });
}

export function useResolverRules(profileId: string, options?: { enabled?: boolean }) {
  const client = useRoute53ResolverClient();
  return useQuery({
    queryKey: ["route53resolver", "rules", profileId],
    queryFn: () => listResolverRules(client),
    staleTime: 10_000,
    enabled: options?.enabled,
  });
}
