import { useMemo, useRef, useState } from "react";
import { useInfiniteQuery, useQueryClient } from "@tanstack/react-query";
import {
  ChevronRight,
  CircleAlert,
  FileText,
  Folder,
  FolderOpen,
  FolderPlus,
  Loader2,
  MoreHorizontal,
  RotateCw,
  Upload,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
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
import { ObjectPreview } from "@/components/s3/ObjectPreview";
import { DeleteConfirmDialog } from "@/components/s3/DeleteConfirmDialog";
import { useActiveProfile } from "@/store/profiles";
import { useBucketPrefix, useS3Browsing } from "@/store/s3-browsing";
import { useS3Client, useS3ObjectActions, s3Keys } from "@/hooks/use-s3";
import {
  listObjectsPage,
  putObject,
  createDirectory,
  deleteObject as deleteS3Object,
  type S3ObjectEntry,
} from "@/lib/s3";
import { formatBytes, formatDate } from "@/lib/format";

function toErrorMessage(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

interface BucketViewProps {
  bucketName: string;
}

export function BucketView({ bucketName }: BucketViewProps) {
  const profile = useActiveProfile();
  const client = useS3Client();
  const queryClient = useQueryClient();
  const prefix = useBucketPrefix(bucketName);
  const setPrefix = useS3Browsing((s) => s.setPrefix);
  const { downloadObject, copyPresignedUrl } = useS3ObjectActions(bucketName);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDragActive, setIsDragActive] = useState(false);
  const [uploadingNames, setUploadingNames] = useState<string[]>([]);
  const [previewEntry, setPreviewEntry] = useState<S3ObjectEntry | null>(null);
  const [objectToDelete, setObjectToDelete] = useState<S3ObjectEntry | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isCreateDirectoryOpen, setIsCreateDirectoryOpen] = useState(false);
  const [folderToDelete, setFolderToDelete] = useState<string | null>(null);
  const [isDeletingFolder, setIsDeletingFolder] = useState(false);
  const {
    data,
    isPending,
    isFetching,
    isFetchingNextPage,
    hasNextPage,
    fetchNextPage,
    error,
    refetch,
  } = useInfiniteQuery({
    queryKey: s3Keys.objects(profile.id, bucketName, prefix),
    queryFn: ({ pageParam }) =>
      listObjectsPage(client, {
        bucket: bucketName,
        prefix,
        token: pageParam,
      }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage.nextToken,
  });

  const folders = useMemo(() => {
    const raw = data?.pages.flatMap((p) => p.folders) ?? [];
    return Array.from(new Set(raw));
  }, [data?.pages]);

  const objects = useMemo(() => {
    return data?.pages.flatMap((p) => p.objects) ?? [];
  }, [data?.pages]);

  const uploadFiles = async (files: FileList | File[]) => {
    const fileArray = Array.from(files);
    if (fileArray.length === 0) return;

    const names = fileArray.map((f) => f.name);
    setUploadingNames((prev) => [...prev, ...names]);

    for (const file of fileArray) {
      try {
        await putObject(client, {
          bucket: bucketName,
          key: prefix + file.name,
          body: file,
          contentType: file.type || undefined,
        });
        toast.success(`Uploaded ${file.name}`);
      } catch (err) {
        toast.error(`Failed to upload ${file.name}: ${toErrorMessage(err)}`);
      } finally {
        setUploadingNames((prev) => prev.filter((n) => n !== file.name));
      }
    }

    await queryClient.invalidateQueries({
      queryKey: ["s3", "objects", profile.id, bucketName],
    });
  };

  const handleDeleteObject = async () => {
    if (!objectToDelete || isDeleting) return;

    setIsDeleting(true);
    try {
      await deleteS3Object(client, {
        bucket: bucketName,
        key: objectToDelete.key,
      });
      await queryClient.invalidateQueries({
        queryKey: ["s3", "objects", profile.id, bucketName],
      });
      toast.success(`Deleted ${objectToDelete.name}`);
      setObjectToDelete(null);
    } catch (err) {
      toast.error(`Delete failed: ${toErrorMessage(err)}`);
    } finally {
      setIsDeleting(false);
    }
  };
  const handleDeleteFolder = async () => {
    if (!folderToDelete || isDeletingFolder) return;

    setIsDeletingFolder(true);
    try {
      await deleteS3Object(client, {
        bucket: bucketName,
        key: folderToDelete,
      });
      await queryClient.invalidateQueries({
        queryKey: ["s3", "objects", profile.id, bucketName],
      });
      const folderName = folderToDelete
        .slice(prefix.length)
        .replace(/\/$/, "");
      toast.success(`Deleted directory ${folderName}`);
      setFolderToDelete(null);
    } catch (err) {
      toast.error(`Delete failed: ${toErrorMessage(err)}`);
    } finally {
      setIsDeletingFolder(false);
    }
  };

  // Breadcrumbs: root = bucketName, then folder segments
  const breadcrumbSegments = useMemo(() => {
    const segments: Array<{ label: string; cumulativePrefix: string }> = [
      { label: bucketName, cumulativePrefix: "" },
    ];
    if (prefix) {
      const parts = prefix.split("/").filter(Boolean);
      let cumulative = "";
      for (const part of parts) {
        cumulative += `${part}/`;
        segments.push({ label: part, cumulativePrefix: cumulative });
      }
    }
    return segments;
  }, [bucketName, prefix]);

  const isEmpty = folders.length === 0 && objects.length === 0;

  return (
    <div
      className="relative flex h-full flex-col"
      onDragOver={(e) => {
        e.preventDefault();
        setIsDragActive(true);
      }}
      onDragLeave={() => setIsDragActive(false)}
      onDrop={(e) => {
        e.preventDefault();
        setIsDragActive(false);
        if (e.dataTransfer.files) {
          void uploadFiles(e.dataTransfer.files);
        }
      }}
    >
      {/* Header / Breadcrumb toolbar */}
      <div className="flex h-12 items-center gap-1.5 border-b px-4">
        <FolderOpen className="mr-1 size-4 text-muted-foreground" />
        <nav className="flex items-center gap-1 text-sm overflow-hidden" aria-label="Breadcrumb">
          {breadcrumbSegments.map((seg, idx) => {
            const isLast = idx === breadcrumbSegments.length - 1;
            return (
              <div key={seg.cumulativePrefix} className="flex items-center gap-1">
                {idx > 0 && (
                  <ChevronRight className="size-3.5 text-muted-foreground" />
                )}
                {isLast ? (
                  <span className="max-w-40 truncate font-medium text-foreground">
                    {seg.label}
                  </span>
                ) : (
                  <button
                    type="button"
                    onClick={() => setPrefix(bucketName, seg.cumulativePrefix)}
                    className="max-w-40 truncate text-muted-foreground hover:text-foreground"
                  >
                    {seg.label}
                  </button>
                )}
              </div>
            );
          })}
        </nav>

        <div className="flex-1" />

        {uploadingNames.length > 0 && (
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Loader2 className="size-3.5 animate-spin" />
            <span>Uploading {uploadingNames.length}...</span>
          </div>
        )}

        <Button
          variant="ghost"
          size="icon"
          aria-label="Refresh objects"
          disabled={isFetching}
          onClick={() => refetch()}
        >
          <RotateCw className={`size-4 ${isFetching ? "animate-spin" : ""}`} />
        </Button>

        <input
          type="file"
          ref={fileInputRef}
          multiple
          className="hidden"
          onChange={(e) => {
            if (e.target.files) {
              void uploadFiles(e.target.files);
            }
            e.target.value = "";
          }}
        />
        <Button
          variant="outline"
          size="sm"
          onClick={() => setIsCreateDirectoryOpen(true)}
        >
          <FolderPlus className="mr-1.5 size-4" />
          Create directory
        </Button>

        <Button size="sm" onClick={() => fileInputRef.current?.click()}>
          <Upload className="mr-1.5 size-4" />
          Upload
        </Button>
      </div>

      {/* Body */}
      {isPending ? (
        <div className="flex flex-1 items-center justify-center">
          <Loader2 className="size-6 animate-spin text-muted-foreground" />
        </div>
      ) : error ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 p-4 text-center">
          <CircleAlert className="size-8 text-destructive" />
          <p className="text-sm text-muted-foreground">{error.message}</p>
          <Button variant="outline" size="sm" onClick={() => refetch()}>
            Retry
          </Button>
        </div>
      ) : isEmpty ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 text-muted-foreground">
          <FolderOpen className="size-10 opacity-40" />
          <p className="text-sm">
            This bucket is empty — drop files here or use Upload
          </p>
        </div>
      ) : (
        <div className="flex-1 overflow-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-border/40 text-xs font-semibold uppercase text-muted-foreground">
                <th className="px-4 py-2.5 font-medium">Name</th>
                <th className="w-28 px-4 py-2.5 text-right font-medium">Size</th>
                <th className="w-44 px-4 py-2.5 text-right font-medium">Last Modified</th>
                <th className="w-12 px-2 py-2.5" />
              </tr>
            </thead>
            <tbody>
              {/* Folders */}
              {folders.map((folder) => {
                const folderName = folder
                  .slice(prefix.length)
                  .replace(/\/$/, "");
                return (
                  <tr
                    key={folder}
                    onClick={() => setPrefix(bucketName, folder)}
                    className="cursor-pointer border-b border-border/20 transition-colors hover:bg-accent/50"
                  >
                    <td className="flex items-center gap-2 px-4 py-2 font-medium">
                      <Folder className="size-4 shrink-0 text-muted-foreground fill-muted-foreground/20" />
                      <span className="truncate">{folderName}</span>
                    </td>
                    <td className="px-4 py-2 text-right font-mono text-xs text-muted-foreground">
                      —
                    </td>
                    <td className="px-4 py-2 text-right font-mono text-xs text-muted-foreground">
                      —
                    </td>
                    <td className="px-2 py-2 text-right">
                      <div onClick={(e) => e.stopPropagation()}>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="size-8"
                              aria-label={`Actions for ${folderName}`}
                            >
                              <MoreHorizontal className="size-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem
                              className="text-destructive focus:text-destructive"
                              onClick={() => setFolderToDelete(folder)}
                            >
                              Delete directory
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </td>
                  </tr>
                );
              })}

              {/* Objects */}
              {objects.map((entry) => (
                <tr
                  key={entry.key}
                  className="border-b border-border/20 transition-colors hover:bg-accent/50"
                >
                  <td className="px-4 py-2">
                    <button
                      type="button"
                      onClick={() => setPreviewEntry(entry)}
                      className="flex max-w-full items-center gap-2 text-left hover:underline"
                    >
                      <FileText className="size-4 shrink-0 text-muted-foreground" />
                      <span className="truncate">{entry.name}</span>
                    </button>
                  </td>
                  <td className="px-4 py-2 text-right font-mono text-xs text-muted-foreground">
                    {formatBytes(entry.size)}
                  </td>
                  <td className="px-4 py-2 text-right font-mono text-xs text-muted-foreground">
                    {formatDate(entry.lastModified)}
                  </td>
                  <td className="px-2 py-2 text-right">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="size-8"
                          aria-label={`Actions for ${entry.name}`}
                        >
                          <MoreHorizontal className="size-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem
                          onSelect={() => downloadObject(entry)}
                        >
                          Download
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onSelect={() => copyPresignedUrl(entry.key)}
                        >
                          Copy presigned URL
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          variant="destructive"
                          onSelect={() => setObjectToDelete(entry)}
                        >
                          Delete object
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {hasNextPage && (
            <div className="flex justify-center p-4">
              <Button
                variant="outline"
                size="sm"
                onClick={() => fetchNextPage()}
                disabled={isFetchingNextPage}
              >
                {isFetchingNextPage ? (
                  <>
                    <Loader2 className="mr-1.5 size-4 animate-spin" />
                    Loading...
                  </>
                ) : (
                  "Load more"
                )}
              </Button>
            </div>
          )}
        </div>
      )}

      {/* Drag overlay */}
      {isDragActive && (
        <div className="pointer-events-none absolute inset-2 z-50 flex items-center justify-center rounded-lg border-2 border-dashed border-primary bg-primary/5">
          <div className="text-center">
            <FolderOpen className="mx-auto size-10 text-primary opacity-80" />
            <p className="mt-2 text-sm font-medium text-primary">
              Drop to upload to {bucketName}/{prefix}
            </p>
          </div>
        </div>
      )}

      {/* Preview Dialog */}
      {previewEntry && (
        <ObjectPreview
          bucket={bucketName}
          entry={previewEntry}
          onClose={() => setPreviewEntry(null)}
        />
      )}

      {/* Delete Object Dialog */}
      <DeleteConfirmDialog
        open={Boolean(objectToDelete)}
        onOpenChange={(open) => !open && setObjectToDelete(null)}
        title="Delete object"
        description={`Delete “${objectToDelete?.name ?? ""}” from ${bucketName}? This cannot be undone.`}
        confirmLabel="Delete"
        isPending={isDeleting}
        onConfirm={handleDeleteObject}
      />

      {/* Delete Folder Dialog */}
      <DeleteConfirmDialog
        open={Boolean(folderToDelete)}
        onOpenChange={(open) => !open && setFolderToDelete(null)}
        title="Delete directory"
        description={`Delete directory “${
          folderToDelete
            ? folderToDelete.slice(prefix.length).replace(/\/$/, "")
            : ""
        }” from ${bucketName}? Objects within this directory will not be deleted.`}
        confirmLabel="Delete"
        isPending={isDeletingFolder}
        onConfirm={handleDeleteFolder}
      />

      {/* Create Directory Dialog */}
      <CreateDirectoryDialog
        open={isCreateDirectoryOpen}
        onOpenChange={setIsCreateDirectoryOpen}
        bucketName={bucketName}
        prefix={prefix}
      />
    </div>
  );
}

interface CreateDirectoryDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  bucketName: string;
  prefix: string;
}

function CreateDirectoryDialog({
  open,
  onOpenChange,
  bucketName,
  prefix,
}: CreateDirectoryDialogProps) {
  const [name, setName] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const client = useS3Client();
  const profile = useActiveProfile();
  const queryClient = useQueryClient();

  const trimmed = name.trim();
  const isValid = trimmed.length > 0 && !/[/\\#?%]/.test(trimmed);
  const showError = trimmed.length > 0 && !isValid;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isValid || isSubmitting) return;

    setIsSubmitting(true);
    try {
      const fullKey = prefix ? `${prefix}${trimmed}/` : `${trimmed}/`;
      await createDirectory(client, {
        bucket: bucketName,
        key: fullKey,
      });
      await queryClient.invalidateQueries({
        queryKey: ["s3", "objects", profile.id, bucketName],
      });
      toast.success(`Directory ${trimmed} created`);
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
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Create directory</DialogTitle>
            <DialogDescription>
              Directories in S3 are virtual prefixes ending with a trailing slash.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 py-4">
            <Label htmlFor="new-directory-name">Directory name</Label>
            <Input
              id="new-directory-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. photos"
              autoComplete="off"
              disabled={isSubmitting}
            />
            {showError && (
              <p className="text-xs text-destructive">
                Directory name cannot contain slashes (/ or \) or special characters.
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
              {isSubmitting ? "Creating..." : "Create directory"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
