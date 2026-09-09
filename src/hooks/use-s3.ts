import { useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { S3Client } from "@aws-sdk/client-s3";
import { toast } from "sonner";
import { makeClients } from "@/lib/aws";
import { useActiveProfile } from "@/store/profiles";
import {
  deleteObject as deleteS3Object,
  getObject,
  listBuckets,
  presignGetObject,
  type S3ObjectEntry,
} from "@/lib/s3";
import { saveObjectFile } from "@/lib/download";

export const s3Keys = {
  buckets: (profileId: string) => ["s3", "buckets", profileId] as const,
  objects: (profileId: string, bucket: string, prefix?: string) =>
    ["s3", "objects", profileId, bucket, prefix ?? ""] as const,
};

export function useS3Client(): S3Client {
  const profile = useActiveProfile();
  return useMemo(
    () => makeClients(profile).s3,
    [profile.id, profile.endpoint, profile.region],
  );
}

export function useBuckets(profileId: string, options?: { enabled?: boolean }) {
  const client = useS3Client();
  return useQuery({
    queryKey: s3Keys.buckets(profileId),
    queryFn: () => listBuckets(client),
    staleTime: 30_000,
    enabled: options?.enabled,
  });
}

function toErrorMessage(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

export function useS3ObjectActions(bucket: string) {
  const client = useS3Client();
  const queryClient = useQueryClient();
  const profile = useActiveProfile();

  const downloadObject = async (entry: S3ObjectEntry): Promise<void> => {
    try {
      const fetched = await getObject(client, { bucket, key: entry.key });
      const result = await saveObjectFile(fetched.bytes, entry.name);
      if (result === "saved") {
        toast.success(`Downloaded ${entry.name}`);
      }
    } catch (e) {
      toast.error(`Download failed: ${toErrorMessage(e)}`);
    }
  };

  const copyPresignedUrl = async (key: string): Promise<void> => {
    try {
      const url = await presignGetObject(client, { bucket, key });
      await navigator.clipboard.writeText(url);
      toast.success("Presigned URL copied to clipboard");
    } catch (e) {
      toast.error(`Failed to copy presigned URL: ${toErrorMessage(e)}`);
    }
  };

  const deleteObject = async (entry: S3ObjectEntry): Promise<void> => {
    try {
      await deleteS3Object(client, { bucket, key: entry.key });
      await queryClient.invalidateQueries({
        queryKey: ["s3", "objects", profile.id, bucket],
      });
      toast.success(`Deleted ${entry.name}`);
    } catch (e) {
      toast.error(`Delete failed: ${toErrorMessage(e)}`);
    }
  };

  return {
    downloadObject,
    copyPresignedUrl,
    deleteObject,
  };
}
