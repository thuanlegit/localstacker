import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { CircleAlert, Download, File, Link, Loader2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useActiveProfile } from "@/store/profiles";
import { useS3Client, useS3ObjectActions } from "@/hooks/use-s3";
import {
  getObject,
  previewModeFor,
  MAX_PREVIEW_BYTES,
  type S3ObjectEntry,
} from "@/lib/s3";
import { formatBytes, formatDate } from "@/lib/format";

interface ObjectPreviewProps {
  bucket: string;
  entry: S3ObjectEntry;
  onClose: () => void;
}

export function ObjectPreview({ bucket, entry, onClose }: ObjectPreviewProps) {
  const profile = useActiveProfile();
  const client = useS3Client();
  const { downloadObject, copyPresignedUrl } = useS3ObjectActions(bucket);

  const { data, isPending, error } = useQuery({
    queryKey: ["s3", "object", profile.id, bucket, entry.key],
    queryFn: () => getObject(client, { bucket, key: entry.key }),
    gcTime: 30_000,
  });

  const mode = useMemo(() => {
    if (!data) return "binary";
    return previewModeFor(entry.key, data.contentType);
  }, [data, entry.key]);

  const [imageUrl, setImageUrl] = useState<string | null>(null);
  useEffect(() => {
    if (data?.bytes && mode === "image") {
      const blob = new Blob([data.bytes as unknown as BlobPart], {
        type: data.contentType || "image/png",
      });
      const url = URL.createObjectURL(blob);
      setImageUrl(url);
      return () => URL.revokeObjectURL(url);
    }
  }, [data?.bytes, data?.contentType, mode]);

  const formattedText = useMemo(() => {
    if (!data?.bytes) return "";
    const decoded = new TextDecoder().decode(data.bytes);
    if (mode === "json") {
      try {
        const parsed = JSON.parse(decoded);
        return JSON.stringify(parsed, null, 2);
      } catch {
        return decoded;
      }
    }
    return decoded;
  }, [data?.bytes, mode]);

  const description = `${formatBytes(entry.size)} · ${formatDate(entry.lastModified)}${
    entry.etag ? ` · ETag ${entry.etag}` : ""
  }`;

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-2xl sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle className="break-all font-mono text-sm">
            {entry.name}
          </DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        <div className="py-2 min-w-0">
          {isPending ? (
            <div className="flex h-64 items-center justify-center">
              <Loader2 className="size-6 animate-spin text-muted-foreground" />
            </div>
          ) : error ? (
            <div className="flex h-64 flex-col items-center justify-center gap-2 text-center">
              <CircleAlert className="size-8 text-destructive" />
              <p className="text-sm text-muted-foreground">
                {error instanceof Error ? error.message : String(error)}
              </p>
            </div>
          ) : entry.size > MAX_PREVIEW_BYTES || mode === "binary" ? (
            <div className="flex h-64 flex-col items-center justify-center gap-3 text-muted-foreground">
              <File className="size-10 opacity-50" />
              <p className="text-sm">
                No preview for this file type or size — download to view it
              </p>
            </div>
          ) : mode === "image" ? (
            <div className="flex max-h-[70vh] items-center justify-center overflow-auto p-2">
              <img
                src={imageUrl ?? ""}
                alt={entry.name}
                className="max-h-[70vh] w-auto rounded-md object-contain"
              />
            </div>
          ) : (
            <pre className="max-h-[70vh] overflow-auto whitespace-pre-wrap break-all rounded-md bg-muted/50 p-3 font-mono text-xs">
              {formattedText}
            </pre>
          )}
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button
            type="button"
            variant="outline"
            onClick={async () => {
              await downloadObject(entry);
              onClose();
            }}
          >
            <Download className="mr-1.5 size-4" />
            Download
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={async () => {
              await copyPresignedUrl(entry.key);
              onClose();
            }}
          >
            <Link className="mr-1.5 size-4" />
            Copy presigned URL
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
