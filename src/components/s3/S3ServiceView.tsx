import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  CircleAlert,
  HardDrive,
  Loader2,
  MoreHorizontal,
  Plus,
  RotateCw,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { DeleteConfirmDialog } from "@/components/DeleteConfirmDialog";
import { ServiceDisabledView } from "@/components/ServiceDisabledView";
import { isServiceDisabledError, useServiceStatus } from "@/hooks/use-health";
import { useActiveProfile } from "@/store/profiles";
import { useTabs } from "@/store/tabs";
import { useBuckets, useS3Client, s3Keys } from "@/hooks/use-s3";
import { createBucket, deleteBucket } from "@/lib/s3";
import { formatDate } from "@/lib/format";

function toErrorMessage(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

const BUCKET_NAME_REGEX = /^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/;

interface CreateBucketDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function CreateBucketDialog({ open, onOpenChange }: CreateBucketDialogProps) {
  const [name, setName] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const client = useS3Client();
  const profile = useActiveProfile();
  const queryClient = useQueryClient();

  const isValid = BUCKET_NAME_REGEX.test(name);
  const showError = name.length > 0 && !isValid;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isValid || isSubmitting) return;

    setIsSubmitting(true);
    try {
      await createBucket(client, name, profile.region);
      await queryClient.invalidateQueries({
        queryKey: s3Keys.buckets(profile.id),
      });
      toast.success(`Bucket ${name} created`);
      setName("");
      onOpenChange(false);
    } catch (err) {
      toast.error(toErrorMessage(err));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <form onSubmit={handleSubmit} className="min-w-0">
          <DialogHeader>
            <DialogTitle>Create bucket</DialogTitle>
            <DialogDescription>
              Bucket names must be globally unique across AWS and follow S3 naming conventions.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 py-4 min-w-0">
            <Label htmlFor="new-bucket-name">Bucket name</Label>
            <Input
              id="new-bucket-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="my-bucket"
              autoComplete="off"
              disabled={isSubmitting}
            />
            {showError && (
              <p className="text-xs text-destructive">
                3–63 characters — lowercase letters, digits, dots, hyphens
              </p>
            )}
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={!isValid || isSubmitting}>
              {isSubmitting ? "Creating..." : "Create bucket"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function S3ServiceView() {
  const profile = useActiveProfile();
  const client = useS3Client();
  const queryClient = useQueryClient();
  const openTab = useTabs((s) => s.openTab);

  const { data, isPending, isFetching, error, refetch } = useBuckets(profile.id);
  const s3Status = useServiceStatus("s3");
  const isDisabled = s3Status === "disabled" || isServiceDisabledError(error);

  if (isDisabled) {
    return (
      <ServiceDisabledView
        service="s3"
        onRetry={() => refetch()}
        isChecking={isFetching}
      />
    );
  }
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [bucketToDelete, setBucketToDelete] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const handleDelete = async () => {
    if (!bucketToDelete || isDeleting) return;

    setIsDeleting(true);
    try {
      await deleteBucket(client, bucketToDelete);
      await queryClient.invalidateQueries({
        queryKey: s3Keys.buckets(profile.id),
      });
      toast.success(`Bucket ${bucketToDelete} deleted`);
      setBucketToDelete(null);
    } catch (err) {
      toast.error(toErrorMessage(err));
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex items-center justify-between border-b px-6 py-4">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <HardDrive className="h-5 w-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-base font-semibold">Buckets</h1>
              <Badge variant="secondary" className="font-mono text-xs">
                {data ? data.length : 0}
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground">
              Object storage buckets and files
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="icon"
            aria-label="Refresh buckets"
            disabled={isFetching}
            onClick={() => refetch()}
          >
            <RotateCw className={`size-4 ${isFetching ? "animate-spin" : ""}`} />
          </Button>
          <Button size="sm" onClick={() => setIsCreateOpen(true)}>
            <Plus className="mr-1.5 size-4" />
            Create bucket
          </Button>
        </div>
      </div>
      {/* Body */}
      {isPending ? (
        <div className="flex flex-1 items-center justify-center">
          <Loader2 className="size-6 animate-spin text-muted-foreground" />
        </div>
      ) : error ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 p-4 text-center">
          <CircleAlert className="size-8 text-destructive" />
          <p className="text-sm text-muted-foreground">
            {error instanceof Error ? error.message : String(error)}
          </p>
          <Button variant="outline" size="sm" onClick={() => refetch()}>
            Retry
          </Button>
        </div>
      ) : !data || data.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 text-muted-foreground">
          <HardDrive className="size-10 opacity-40" />
          <p className="text-sm">No buckets yet — create one to get started</p>
        </div>
      ) : (
        <div className="flex-1 overflow-auto">
          {data.map((bucket) => (
            <div
              key={bucket.name}
              role="button"
              tabIndex={0}
              onClick={() =>
                openTab({
                  id: `bucket:${bucket.name}`,
                  kind: "bucket",
                  bucketName: bucket.name,
                  title: bucket.name,
                })
              }
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  openTab({
                    id: `bucket:${bucket.name}`,
                    kind: "bucket",
                    bucketName: bucket.name,
                    title: bucket.name,
                  });
                }
              }}
              className="flex h-11 w-full cursor-pointer items-center gap-3 border-b border-border/40 px-4 text-left transition-colors hover:bg-accent/50"
            >
              <HardDrive className="size-4 shrink-0 text-muted-foreground" />
              <span className="flex-1 truncate font-medium text-sm">
                {bucket.name}
              </span>
              <span className="w-44 shrink-0 text-right font-mono text-xs text-muted-foreground">
                {formatDate(bucket.creationDate)}
              </span>
              <div
                onClick={(e) => e.stopPropagation()}
                className="shrink-0"
              >
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={`Actions for ${bucket.name}`}
                    >
                      <MoreHorizontal className="size-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem
                      variant="destructive"
                      onSelect={() => setBucketToDelete(bucket.name)}
                    >
                      Delete bucket
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Dialogs */}
      <CreateBucketDialog
        open={isCreateOpen}
        onOpenChange={setIsCreateOpen}
      />

      <DeleteConfirmDialog
        open={Boolean(bucketToDelete)}
        onOpenChange={(open) => !open && setBucketToDelete(null)}
        title="Delete bucket"
        description={`Delete bucket “${bucketToDelete ?? ""}”? The bucket must be empty before it can be deleted.`}
        confirmLabel="Delete"
        isPending={isDeleting}
        onConfirm={handleDelete}
      />
    </div>
  );
}
