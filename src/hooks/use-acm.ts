import { useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { ACMClient } from "@aws-sdk/client-acm";
import { toast } from "sonner";
import { makeClients } from "@/lib/aws";
import { useActiveProfile } from "@/store/profiles";
import {
  listCertificates,
  describeCertificate,
  importCertificate,
  requestCertificate,
  deleteCertificate,
} from "@/lib/acm";

function toErrorMessage(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

export const acmKeys = {
  certificates: (profileId: string, region?: string) =>
    region
      ? (["acm", "certificates", profileId, region] as const)
      : (["acm", "certificates", profileId] as const),
  detail: (profileId: string, arn: string, region?: string) =>
    region
      ? (["acm", "detail", profileId, arn, region] as const)
      : (["acm", "detail", profileId, arn] as const),
};

export function useAcmClient(): ACMClient {
  const profile = useActiveProfile();
  return useMemo(
    () => makeClients(profile).acm,
    [profile.id, profile.endpoint, profile.region, profile.authToken],
  );
}

export function useCertificates(profileId: string, options?: { enabled?: boolean }) {
  const client = useAcmClient();
  const profile = useActiveProfile();
  return useQuery({
    queryKey: acmKeys.certificates(profileId, profile.region),
    queryFn: () => listCertificates(client),
    staleTime: 5_000,
    refetchInterval: 15_000,
    enabled: options?.enabled,
  });
}

export function useCertificateDetail(
  profileId: string,
  arn: string,
  options?: { enabled?: boolean },
) {
  const client = useAcmClient();
  const profile = useActiveProfile();
  return useQuery({
    queryKey: acmKeys.detail(profileId, arn, profile.region),
    queryFn: () => describeCertificate(client, arn),
    staleTime: 5_000,
    enabled: options?.enabled,
  });
}

export function useAcmActions() {
  const client = useAcmClient();
  const queryClient = useQueryClient();
  const profile = useActiveProfile();

  const invalidate = () => {
    queryClient.invalidateQueries({
      queryKey: ["acm", "certificates", profile.id],
    });
    queryClient.invalidateQueries({
      queryKey: ["acm", "detail", profile.id],
    });
  };

  const importCertificateAction = async (params: {
    certificate: string;
    privateKey: string;
  }): Promise<string | null> => {
    try {
      const arn = await importCertificate(client, params);
      toast.success("Certificate imported");
      invalidate();
      return arn;
    } catch (e) {
      toast.error(`Failed to import certificate: ${toErrorMessage(e)}`);
      return null;
    }
  };

  const requestCertificateAction = async (params: {
    domainName: string;
  }): Promise<string | null> => {
    try {
      const arn = await requestCertificate(client, params);
      toast.success(`Certificate requested for ${params.domainName}`);
      invalidate();
      return arn;
    } catch (e) {
      toast.error(`Failed to request certificate: ${toErrorMessage(e)}`);
      return null;
    }
  };

  const deleteCertificateAction = async (arn: string): Promise<boolean> => {
    try {
      await deleteCertificate(client, arn);
      toast.success("Certificate deleted");
      invalidate();
      return true;
    } catch (e) {
      toast.error(`Failed to delete certificate: ${toErrorMessage(e)}`);
      return false;
    }
  };

  return {
    importCertificate: importCertificateAction,
    requestCertificate: requestCertificateAction,
    deleteCertificate: deleteCertificateAction,
  };
}
