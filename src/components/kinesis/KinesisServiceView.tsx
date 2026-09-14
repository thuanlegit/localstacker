import { useState } from "react";
import {
  CircleAlert,
  Loader2,
  MoreHorizontal,
  Plus,
  RotateCw,
  Trash2,
  Waves,
} from "lucide-react";
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
import { DeleteConfirmDialog } from "@/components/DeleteConfirmDialog";
import { ServiceDisabledView } from "@/components/ServiceDisabledView";
import { isServiceDisabledError, useServiceStatus } from "@/hooks/use-health";
import { useActiveProfile } from "@/store/profiles";
import { useTabs } from "@/store/tabs";
import { useKinesisStreams, useKinesisActions } from "@/hooks/use-kinesis";

const STREAM_NAME_REGEX = /^[a-zA-Z0-9_-]{1,128}$/;

interface CreateStreamDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: (name: string) => void;
}

function CreateStreamDialog({
  open,
  onOpenChange,
  onCreated,
}: CreateStreamDialogProps) {
  const [name, setName] = useState("");
  const [shardCount, setShardCount] = useState("1");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { createStream } = useKinesisActions();

  const isValid =
    STREAM_NAME_REGEX.test(name) && Number(shardCount) >= 1 && Number(shardCount) <= 64;
  const showNameError = name.length > 0 && !STREAM_NAME_REGEX.test(name);
  const showShardError = shardCount.length > 0 && !/^\d+$/.test(shardCount);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isValid || isSubmitting) return;

    setIsSubmitting(true);
    try {
      const ok = await createStream({ name, shardCount: Number(shardCount) });
      if (ok) {
        setName("");
        setShardCount("1");
        onOpenChange(false);
        onCreated(name);
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <form onSubmit={handleSubmit} className="min-w-0">
          <DialogHeader>
            <DialogTitle>Create stream</DialogTitle>
            <DialogDescription>
              Create a Kinesis data stream. The stream activates asynchronously.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4 min-w-0">
            <div className="space-y-2">
              <Label htmlFor="stream-name">Stream name</Label>
              <Input
                id="stream-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="my-stream"
                autoFocus
              />
              {showNameError ? (
                <p className="text-xs text-destructive">
                  1–128 characters — letters, digits, hyphens, underscores
                </p>
              ) : (
                <p className="text-xs text-muted-foreground">
                  Alphanumeric, hyphens, and underscores. Max 128 chars.
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="stream-shards">Shard count</Label>
              <Input
                id="stream-shards"
                type="number"
                min={1}
                max={64}
                value={shardCount}
                onChange={(e) => setShardCount(e.target.value)}
              />
              {showShardError ? (
                <p className="text-xs text-destructive">Shard count must be a number</p>
              ) : (
                <p className="text-xs text-muted-foreground">
                  Between 1 and 64 shards for local testing.
                </p>
              )}
            </div>
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
              {isSubmitting ? "Creating..." : "Create stream"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function KinesisServiceView() {
  const profile = useActiveProfile();
  const serviceStatus = useServiceStatus("kinesis");
  const {
    data: streams,
    isPending,
    error,
    refetch,
    isFetching,
  } = useKinesisStreams(profile.id);
  const { deleteStream } = useKinesisActions();
  const { openTab, closeTab } = useTabs();

  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [streamToDelete, setStreamToDelete] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  if (serviceStatus === "disabled" || (error && isServiceDisabledError(error))) {
    return <ServiceDisabledView service="kinesis" />;
  }

  const handleRowClick = (name: string) => {
    openTab({
      id: `stream:${name}`,
      kind: "stream",
      streamName: name,
      title: name,
    });
  };

  const handleDelete = async () => {
    if (!streamToDelete) return;
    setIsDeleting(true);
    try {
      const ok = await deleteStream(streamToDelete);
      if (ok) {
        closeTab(`stream:${streamToDelete}`);
        setStreamToDelete(null);
      }
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="border-b px-6 py-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Waves className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-lg font-semibold">Kinesis</h1>
              <p className="text-xs text-muted-foreground">Data streams</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => refetch()}
              disabled={isFetching}
              title="Refresh streams"
            >
              <RotateCw className={`h-4 w-4 ${isFetching ? "animate-spin" : ""}`} />
              <span className="hidden sm:inline">Refresh</span>
            </Button>
            <Button size="sm" onClick={() => setIsCreateOpen(true)}>
              <Plus className="h-4 w-4" />
              Create stream
            </Button>
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto">
        {isPending ? (
          <div className="flex h-full items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : error ? (
          <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
            <CircleAlert className="h-8 w-8 text-destructive" />
            <p className="text-sm font-medium">Failed to load streams</p>
            <p className="text-xs text-muted-foreground">
              {error instanceof Error ? error.message : String(error)}
            </p>
            <Button variant="outline" size="sm" onClick={() => refetch()}>
              Retry
            </Button>
          </div>
        ) : !streams || streams.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
            <Waves className="h-10 w-10 text-muted-foreground/50" />
            <div>
              <p className="text-sm font-medium">No streams</p>
              <p className="text-xs text-muted-foreground">
                Create a data stream to get started.
              </p>
            </div>
            <Button size="sm" onClick={() => setIsCreateOpen(true)}>
              <Plus className="h-4 w-4" />
              Create stream
            </Button>
          </div>
        ) : (
          <table className="w-full text-left text-sm">
            <thead className="sticky top-0 bg-muted/50 backdrop-blur text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-6 py-3 font-medium">Name</th>
                <th className="px-6 py-3 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {streams.map((name) => (
                <tr
                  key={name}
                  className="cursor-pointer transition-colors hover:bg-accent/50"
                  onClick={() => handleRowClick(name)}
                >
                  <td className="px-6 py-3 font-medium">
                    <span className="font-mono text-xs sm:text-sm">{name}</span>
                  </td>
                  <td className="px-6 py-3 text-right" onClick={(e) => e.stopPropagation()}>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon-sm" title={`Actions for ${name}`}>
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem
                          className="text-destructive focus:text-destructive"
                          onClick={() => setStreamToDelete(name)}
                        >
                          <Trash2 className="mr-2 h-4 w-4" />
                          Delete stream
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <CreateStreamDialog
        open={isCreateOpen}
        onOpenChange={setIsCreateOpen}
        onCreated={(name) =>
          openTab({
            id: `stream:${name}`,
            kind: "stream",
            streamName: name,
            title: name,
          })
        }
      />

      <DeleteConfirmDialog
        open={Boolean(streamToDelete)}
        onOpenChange={(open) => !open && setStreamToDelete(null)}
        title="Delete stream"
        description={`Are you sure you want to delete stream “${streamToDelete ?? ""}”? All shard data will be lost.`}
        confirmLabel="Delete"
        isPending={isDeleting}
        onConfirm={handleDelete}
      />
    </div>
  );
}
