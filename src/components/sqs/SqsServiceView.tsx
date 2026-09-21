import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  CircleAlert,
  ListOrdered,
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
import { sqsKeys, useQueues, useSqsClient } from "@/hooks/use-sqs";
import { createQueue, deleteQueue, type QueueSummary } from "@/lib/sqs";
import { formatDate } from "@/lib/format";

function toErrorMessage(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

const QUEUE_NAME_REGEX = /^[a-zA-Z0-9_-]{1,80}(\.fifo)?$/;

interface CreateQueueDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function CreateQueueDialog({ open, onOpenChange }: CreateQueueDialogProps) {
  const [name, setName] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const client = useSqsClient();
  const profile = useActiveProfile();
  const queryClient = useQueryClient();

  const isValid = QUEUE_NAME_REGEX.test(name);
  const showError = name.length > 0 && !isValid;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isValid || isSubmitting) return;

    setIsSubmitting(true);
    try {
      await createQueue(client, { name });
      await queryClient.invalidateQueries({
        queryKey: sqsKeys.queues(profile.id),
      });
      toast.success(`Queue ${name} created`);
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
            <DialogTitle>Create queue</DialogTitle>
            <DialogDescription>
              Create a new SQS queue in your current region.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4 min-w-0">
            <div className="space-y-2">
              <Label htmlFor="new-queue-name">Queue name</Label>
              <Input
                id="new-queue-name"
                placeholder="my-queue"
                value={name}
                onChange={(e) => setName(e.target.value)}
                autoFocus
              />
              {showError && (
                <p className="text-xs text-destructive">
                  1–80 characters — letters, digits, hyphens, underscores
                </p>
              )}
              <p className="text-xs text-muted-foreground">
                End the name with .fifo for a FIFO queue (content-based deduplication on)
              </p>
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
              {isSubmitting ? (
                <>
                  <Loader2 className="mr-2 size-4 animate-spin" />
                  Creating…
                </>
              ) : (
                "Create queue"
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function SqsServiceView() {
  const profile = useActiveProfile();
  const client = useSqsClient();
  const queryClient = useQueryClient();
  const openTab = useTabs((s) => s.openTab);

  const { data, isPending, isFetching, error, refetch } = useQueues(profile.id);
  const sqsStatus = useServiceStatus("sqs");
  const isDisabled = sqsStatus === "disabled" || isServiceDisabledError(error);

  if (isDisabled) {
    return (
      <ServiceDisabledView
        service="sqs"
        onRetry={() => refetch()}
        isChecking={isFetching}
      />
    );
  }
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [queueToDelete, setQueueToDelete] = useState<QueueSummary | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const dlqNames = useMemo(
    () => new Set((data ?? []).map((q) => q.attributes.dlqName).filter(Boolean)),
    [data],
  );

  const handleDelete = async () => {
    if (!queueToDelete || isDeleting) return;

    setIsDeleting(true);
    try {
      await deleteQueue(client, queueToDelete.url);
      await queryClient.invalidateQueries({
        queryKey: sqsKeys.queues(profile.id),
      });
      useTabs.getState().closeTab(`queue:${queueToDelete.name}`);
      toast.success(`Queue ${queueToDelete.name} deleted`);
      setQueueToDelete(null);
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
            <ListOrdered className="h-5 w-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-base font-semibold">Queues</h1>
              <Badge variant="secondary" className="font-mono text-xs">
                {data ? data.length : 0}
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground">
              Message queues and dead-letter queue redrive
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="icon"
            aria-label="Refresh queues"
            disabled={isFetching}
            onClick={() => refetch()}
          >
            <RotateCw className={`size-4 ${isFetching ? "animate-spin" : ""}`} />
          </Button>
          <Button size="sm" onClick={() => setIsCreateOpen(true)}>
            <Plus className="mr-1.5 size-4" />
            Create queue
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
          <ListOrdered className="size-10 opacity-40" />
          <p className="text-sm">No queues yet — create one to get started</p>
        </div>
      ) : (
        <div className="flex-1 overflow-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-border/40 text-xs font-semibold uppercase text-muted-foreground">
                <th className="px-4 py-2.5 font-medium">Name</th>
                <th className="w-24 px-4 py-2.5 text-right font-medium">Messages</th>
                <th className="w-24 px-4 py-2.5 text-right font-medium">In flight</th>
                <th className="w-24 px-4 py-2.5 text-right font-medium">Delayed</th>
                <th className="w-44 px-4 py-2.5 text-right font-medium">Created</th>
                <th className="w-12 px-2 py-2.5" />
              </tr>
            </thead>
            <tbody>
              {data.map((q) => (
                <tr
                  key={q.name}
                  tabIndex={0}
                  onClick={() =>
                    openTab({
                      id: `queue:${q.name}`,
                      kind: "queue",
                      queueName: q.name,
                      title: q.name,
                    })
                  }
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      openTab({
                        id: `queue:${q.name}`,
                        kind: "queue",
                        queueName: q.name,
                        title: q.name,
                      });
                    }
                  }}
                  className="cursor-pointer border-b border-border/20 transition-colors hover:bg-accent/50"
                >
                  <td className="px-4 py-2 font-medium">
                    <div className="flex items-center gap-2">
                      <ListOrdered className="size-4 shrink-0 text-muted-foreground" />
                      <span className="truncate">{q.name}</span>
                      {q.isFifo && (
                        <Badge variant="outline" className="px-1.5 py-0 text-[10px]">
                          FIFO
                        </Badge>
                      )}
                      {dlqNames.has(q.name) && (
                        <Badge variant="outline" className="px-1.5 py-0 text-[10px]">
                          DLQ
                        </Badge>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-2 text-right font-mono text-xs text-muted-foreground">
                    {q.attributes.depth}
                  </td>
                  <td className="px-4 py-2 text-right font-mono text-xs text-muted-foreground">
                    {q.attributes.inFlight}
                  </td>
                  <td className="px-4 py-2 text-right font-mono text-xs text-muted-foreground">
                    {q.attributes.delayed}
                  </td>
                  <td className="px-4 py-2 text-right font-mono text-xs text-muted-foreground">
                    {formatDate(q.attributes.createdTimestamp)}
                  </td>
                  <td className="px-2 py-2 text-right">
                    <div onClick={(e) => e.stopPropagation()}>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="size-8"
                            aria-label={`Actions for ${q.name}`}
                          >
                            <MoreHorizontal className="size-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem
                            variant="destructive"
                            onSelect={() => setQueueToDelete(q)}
                          >
                            Delete queue
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Dialogs */}
      <CreateQueueDialog
        open={isCreateOpen}
        onOpenChange={setIsCreateOpen}
      />

      <DeleteConfirmDialog
        open={Boolean(queueToDelete)}
        onOpenChange={(open) => !open && setQueueToDelete(null)}
        title="Delete queue"
        description={`Delete queue “${queueToDelete?.name ?? ""}”? The queue and all its messages will be permanently deleted.`}
        confirmLabel="Delete"
        isPending={isDeleting}
        onConfirm={handleDelete}
      />
    </div>
  );
}
