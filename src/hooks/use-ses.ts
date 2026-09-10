import { useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { SESClient } from "@aws-sdk/client-ses";
import { toast } from "sonner";
import { makeClients } from "@/lib/aws";
import { useActiveProfile } from "@/store/profiles";
import {
  listIdentities,
  verifyEmailIdentity,
  verifyDomainIdentity,
  deleteIdentity,
  sendEmail,
  listCapturedMessages,
  clearCapturedMessages,
} from "@/lib/ses";

function toErrorMessage(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

export const sesKeys = {
  identities: (profileId: string, region?: string) =>
    region
      ? (["ses", "identities", profileId, region] as const)
      : (["ses", "identities", profileId] as const),
  mailbox: (profileId: string, endpoint?: string) =>
    endpoint
      ? (["ses", "mailbox", profileId, endpoint] as const)
      : (["ses", "mailbox", profileId] as const),
};

export function useSesClient(): SESClient {
  const profile = useActiveProfile();
  return useMemo(
    () => makeClients(profile).ses,
    [profile.id, profile.endpoint, profile.region, profile.authToken],
  );
}

export function useIdentities(
  profileId: string,
  options?: { enabled?: boolean },
) {
  const client = useSesClient();
  const profile = useActiveProfile();
  return useQuery({
    queryKey: sesKeys.identities(profileId, profile.region),
    queryFn: () => listIdentities(client),
    staleTime: 5_000,
    refetchInterval: 10_000,
    enabled: options?.enabled,
  });
}

export function useIdentityActions() {
  const client = useSesClient();
  const queryClient = useQueryClient();
  const profile = useActiveProfile();

  const invalidateIdentities = () => {
    queryClient.invalidateQueries({
      queryKey: ["ses", "identities", profile.id],
    });
  };

  const verifyEmailAction = async (
    emailAddress: string,
  ): Promise<boolean> => {
    try {
      await verifyEmailIdentity(client, emailAddress);
      toast.success("Identity verified");
      invalidateIdentities();
      return true;
    } catch (e) {
      toast.error(`Failed to verify identity: ${toErrorMessage(e)}`);
      return false;
    }
  };

  const verifyDomainAction = async (
    domain: string,
  ): Promise<string | null> => {
    try {
      const token = await verifyDomainIdentity(client, domain);
      toast.success("Identity verified");
      invalidateIdentities();
      return token;
    } catch (e) {
      toast.error(`Failed to verify domain: ${toErrorMessage(e)}`);
      return null;
    }
  };

  const deleteAction = async (identity: string): Promise<boolean> => {
    try {
      await deleteIdentity(client, identity);
      toast.success("Identity deleted");
      invalidateIdentities();
      return true;
    } catch (e) {
      toast.error(`Failed to delete identity: ${toErrorMessage(e)}`);
      return false;
    }
  };

  return {
    verifyEmailIdentity: verifyEmailAction,
    verifyDomainIdentity: verifyDomainAction,
    deleteIdentity: deleteAction,
  };
}

export function useSendEmail() {
  const client = useSesClient();
  const queryClient = useQueryClient();
  const profile = useActiveProfile();

  const send = async (params: {
    source: string;
    to: string[];
    cc?: string[];
    bcc?: string[];
    subject: string;
    text?: string;
    html?: string;
  }): Promise<string | null> => {
    try {
      const messageId = await sendEmail(client, params);
      toast.success("Email sent");
      queryClient.invalidateQueries({
        queryKey: ["ses", "mailbox", profile.id],
      });
      return messageId;
    } catch (e) {
      toast.error(`Failed to send email: ${toErrorMessage(e)}`);
      return null;
    }
  };

  return { sendEmail: send };
}

export function useCapturedMessages(
  profileId: string,
  options?: { enabled?: boolean },
) {
  const profile = useActiveProfile();
  return useQuery({
    queryKey: sesKeys.mailbox(profileId, profile.endpoint),
    queryFn: ({ signal }) =>
      listCapturedMessages(profile.endpoint, {
        authToken: profile.authToken,
        signal,
      }),
    staleTime: 2_000,
    refetchInterval: 5_000,
    retry: false,
    enabled: options?.enabled,
  });
}

export function useMailboxActions() {
  const queryClient = useQueryClient();
  const profile = useActiveProfile();

  const clear = async (): Promise<boolean> => {
    try {
      await clearCapturedMessages(profile.endpoint, {
        authToken: profile.authToken,
      });
      toast.success("Mailbox cleared");
      queryClient.invalidateQueries({
        queryKey: ["ses", "mailbox", profile.id],
      });
      return true;
    } catch (e) {
      toast.error(`Failed to clear mailbox: ${toErrorMessage(e)}`);
      return false;
    }
  };

  return { clearMailbox: clear };
}
