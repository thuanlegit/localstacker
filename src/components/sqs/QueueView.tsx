import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  ArrowRightLeft,
  CircleAlert,
  Copy,
  Eye,
  ListOrdered,
  Loader2,
  MoreHorizontal,
  Plus,
  RotateCw,
  Trash2,
  Zap,
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
import { useEventSourceMappings } from "@/hooks/use-lambda";
import { AttachLambdaDialog } from "./AttachLambdaDialog";
import {
  deleteMessage,
  peekMessages,
  purgeQueue,
  redriveMessages,
  restoreVisibility,
  sendMessage,
  type PeekedMessage,
  type QueueSummary,
} from "@/lib/sqs";
import { formatDate } from "@/lib/format";

function toErrorMessage(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

interface SendMessageDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  queue: QueueSummary;
}

function SendMessageDialog({ open, onOpenChange, queue }: SendMessageDialogProps) {
  const [body, setBody] = useState("");
  const [groupId, setGroupId] = useState("1");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const client = useSqsClient();
  const profile = useActiveProfile();
  const queryClient = useQueryClient();

  let isJsonValid = false;
  if (body.trim().length > 0) {
    try {
      JSON.parse(body);
      isJsonValid = true;
    } catch {
      isJsonValid = false;
    }
  }

  const showError = body.trim().length > 0 && !isJsonValid;
  const isFifoValid = !queue.isFifo || groupId.trim().length > 0;
  const canSubmit = isJsonValid && isFifoValid && !isSubmitting;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;

    setIsSubmitting(true);
    try {
      await sendMessage(client, {
        queueUrl: queue.url,
        body,
        messageGroupId: queue.isFifo ? groupId.trim() : undefined,
      });
      await queryClient.invalidateQueries({
        queryKey: sqsKeys.queues(profile.id),
      });
      toast.success("Message sent");
      setBody("");
      setGroupId("1");
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
            <DialogTitle>Send message</DialogTitle>
            <DialogDescription>
              Send a JSON message to {queue.name}.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4 min-w-0">
            {queue.isFifo && (
              <div className="space-y-2">
                <Label htmlFor="message-group-id">Message group ID</Label>
                <Input
                  id="message-group-id"
                  value={groupId}
                  onChange={(e) => setGroupId(e.target.value)}
                  placeholder="1"
                  required
                />
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="message-body">Message body</Label>
              <textarea
                id="message-body"
                value={body}
                onChange={(e) => setBody(e.target.value)}
                placeholder='{"orderId": 123}'
                className="flex min-h-[160px] w-full rounded-md border border-input bg-transparent px-3 py-2 font-mono text-sm shadow-xs placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              />
              {showError && (
                <p className="text-xs text-destructive">
                  Message body must be valid JSON
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
            <Button type="submit" disabled={!canSubmit}>
              {isSubmitting ? (
                <>
                  <Loader2 className="mr-2 size-4 animate-spin" />
                  Sending…
                </>
              ) : (
                "Send"
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

interface RedriveDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  queue: QueueSummary;
  queues: QueueSummary[];
}

function RedriveDialog({
  open,
  onOpenChange,
  queue,
  queues,
}: RedriveDialogProps) {
  const [targetUrl, setTargetUrl] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const client = useSqsClient();
  const profile = useActiveProfile();
  const queryClient = useQueryClient();

  const otherQueues = queues.filter((q) => q.url !== queue.url);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!targetUrl || isSubmitting) return;

    setIsSubmitting(true);
    try {
      const res = await redriveMessages(client, {
        sourceUrl: queue.url,
        targetUrl,
      });
      await queryClient.invalidateQueries({
        queryKey: sqsKeys.queues(profile.id),
      });
      const targetQueue = queues.find((q) => q.url === targetUrl);
      const targetName = targetQueue ? targetQueue.name : "target";
      if (res.moved === 0) {
        toast.info(`No messages in ${queue.name}`);
      } else {
        toast.success(`Moved ${res.moved} messages to ${targetName}`);
      }
      setTargetUrl("");
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
            <DialogTitle>Redrive messages</DialogTitle>
            <DialogDescription>
              Move messages from “{queue.name}” to another queue. Up to 1000 messages
              are received, re-sent to the target, then deleted from this queue.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="target-queue">Target queue</Label>
              <select
                id="target-queue"
                aria-label="Target queue"
                value={targetUrl}
                onChange={(e) => setTargetUrl(e.target.value)}
                className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm shadow-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              >
                <option value="">Select target queue…</option>
                {otherQueues.map((q) => (
                  <option key={q.url} value={q.url}>
                    {q.name}
                  </option>
                ))}
              </select>
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
            <Button
              type="submit"
              variant="destructive"
              disabled={!targetUrl || isSubmitting}
            >
              {isSubmitting ? "Moving…" : "Redrive"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export interface QueueViewProps {
  queueName: string;
}

export function QueueView({ queueName }: QueueViewProps) {
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

  const queue = data?.find((q) => q.name === queueName);
  const [isSendOpen, setIsSendOpen] = useState(false);
  const [isRedriveOpen, setIsRedriveOpen] = useState(false);
  const [isPurgeOpen, setIsPurgeOpen] = useState(false);
  const [isPurging, setIsPurging] = useState(false);
  const [isAttachLambdaOpen, setIsAttachLambdaOpen] = useState(false);

  const [peeked, setPeeked] = useState<PeekedMessage[] | null>(null);
  const { data: attachedTriggers } = useEventSourceMappings(
    { eventSourceArn: queue?.attributes.arn },
    { enabled: Boolean(queue?.attributes.arn) },
  );
  const [messageToDelete, setMessageToDelete] = useState<PeekedMessage | null>(null);
  const [isDeletingMessage, setIsDeletingMessage] = useState(false);

  const consumedHandlesRef = useRef<Set<string>>(new Set());
  const peekedRef = useRef<PeekedMessage[] | null>(null);
  peekedRef.current = peeked;

  const queueUrl = queue?.url;

  const restoreQuietly = async (handles: string[]) => {
    if (!queueUrl || !handles.length) return;
    try {
      await restoreVisibility(client, { queueUrl, receiptHandles: handles });
    } catch {
      // Best-effort: self-heals at visibility expiry
    }
  };

  useEffect(() => {
    return () => {
      const handles = peekedRef.current
        ?.map((m) => m.receiptHandle)
        .filter((h) => !consumedHandlesRef.current.has(h));
      if (handles && handles.length > 0) {
        void restoreQuietly(handles);
      }
    };
  }, [queueUrl]);

  const handlePeek = async () => {
    if (!queue) return;

    if (peekedRef.current) {
      const toRestore = peekedRef.current
        .map((m) => m.receiptHandle)
        .filter((h) => !consumedHandlesRef.current.has(h));
      if (toRestore.length > 0) {
        await restoreQuietly(toRestore);
      }
    }

    try {
      const msgs = await peekMessages(client, { queueUrl: queue.url });
      setPeeked(msgs);
    } catch (err) {
      toast.error(toErrorMessage(err));
    }
  };

  const handleCopyBody = async (body: string) => {
    try {
      await navigator.clipboard.writeText(body);
      toast.success("Message body copied");
    } catch (err) {
      toast.error(toErrorMessage(err));
    }
  };

  const handleDeleteMessage = async () => {
    if (!queue || !messageToDelete || isDeletingMessage) return;

    setIsDeletingMessage(true);
    try {
      await deleteMessage(client, {
        queueUrl: queue.url,
        receiptHandle: messageToDelete.receiptHandle,
      });
      consumedHandlesRef.current.add(messageToDelete.receiptHandle);
      setPeeked((prev) =>
        prev
          ? prev.filter((m) => m.receiptHandle !== messageToDelete.receiptHandle)
          : null,
      );
      await queryClient.invalidateQueries({
        queryKey: sqsKeys.queues(profile.id),
      });
      toast.success("Message deleted");
      setMessageToDelete(null);
    } catch (err) {
      toast.error(toErrorMessage(err));
    } finally {
      setIsDeletingMessage(false);
    }
  };

  const handlePurge = async () => {
    if (!queue || isPurging) return;

    setIsPurging(true);
    try {
      await purgeQueue(client, queue.url);
      await queryClient.invalidateQueries({
        queryKey: sqsKeys.queues(profile.id),
      });
      toast.success(`Purged ${queue.name}`);
      setIsPurgeOpen(false);
    } catch (err) {
      toast.error(toErrorMessage(err));
    } finally {
      setIsPurging(false);
    }
  };

  if (isPending) {
    return (
      <div className="flex flex-1 items-center justify-center p-8">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!queue) {
    return (
      <div className="flex h-full flex-1 flex-col items-center justify-center gap-3 p-4 text-center">
        <CircleAlert className="size-8 text-destructive" />
        <p className="text-sm text-muted-foreground">
          Queue not found — it may have been deleted.
        </p>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex h-12 items-center gap-2 border-b px-4">
        <ListOrdered className="size-4 shrink-0 text-muted-foreground" />
        <span className="font-medium text-sm">{queue.name}</span>
        {queue.isFifo && (
          <Badge variant="outline" className="px-1.5 py-0 text-[10px]">
            FIFO
          </Badge>
        )}
        <span className="font-mono text-xs text-muted-foreground">
          {queue.attributes.depth} messages · {queue.attributes.inFlight} in flight ·{" "}
          {queue.attributes.delayed} delayed
        </span>
        {queue.attributes.dlqName && (
          <button
            type="button"
            onClick={() => {
              const dlq = queue.attributes.dlqName!;
              openTab({
                id: `queue:${dlq}`,
                kind: "queue",
                queueName: dlq,
                title: dlq,
              });
            }}
            className="flex items-center gap-1 rounded-md bg-muted px-2 py-0.5 text-xs text-muted-foreground hover:text-foreground"
          >
            Dead-letter queue: {queue.attributes.dlqName}
          </button>
        )}

        {attachedTriggers && attachedTriggers.length > 0 && (
          <div className="flex items-center gap-1.5">
            {attachedTriggers.map((t) => (
              <button
                key={t.uuid}
                type="button"
                onClick={() =>
                  openTab({
                    id: `function:${t.functionName}`,
                    kind: "function",
                    functionName: t.functionName,
                    title: t.functionName,
                  })
                }
                className="flex items-center gap-1 rounded-md bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20 px-2 py-0.5 text-xs hover:bg-amber-500/20"
                title={`Attached to Lambda: ${t.functionName} (${t.state}) — click to view function`}
              >
                <Zap className="size-3" />
                <span className="font-mono">{t.functionName}</span>
              </button>
            ))}
          </div>
        )}

        <div className="flex-1" />

        <Button
          variant="ghost"
          size="icon"
          aria-label="Refresh queue"
          disabled={isFetching}
          onClick={() => refetch()}
        >
          <RotateCw className={`size-4 ${isFetching ? "animate-spin" : ""}`} />
        </Button>

        <Button variant="outline" size="sm" onClick={handlePeek}>
          <Eye className="mr-1.5 size-4" />
          Peek messages
        </Button>

        <Button size="sm" onClick={() => setIsSendOpen(true)}>
          <Plus className="mr-1.5 size-4" />
          Send message
        </Button>

        <Button variant="outline" size="sm" onClick={() => setIsRedriveOpen(true)}>
          <ArrowRightLeft className="mr-1.5 size-4" />
          Redrive to…
        </Button>

        <Button
          variant="outline"
          size="sm"
          onClick={() => setIsAttachLambdaOpen(true)}
          title="Attach this SQS queue as a Lambda trigger"
        >
          <Zap className="mr-1.5 size-4 text-amber-500" />
          Attach Lambda
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" aria-label="Queue actions">
              <MoreHorizontal className="size-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem
              variant="destructive"
              onSelect={() => setIsPurgeOpen(true)}
            >
              Purge queue…
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => setIsAttachLambdaOpen(true)}>
              Attach Lambda trigger…
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Body */}
      {peeked === null ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 text-center text-muted-foreground">
          <Eye className="size-10 opacity-40" />
          <p className="font-medium text-sm">
            Peek to inspect messages without consuming them
          </p>
          <p className="font-mono text-xs">
            {queue.attributes.depth} messages · {queue.attributes.inFlight} in flight ·{" "}
            {queue.attributes.delayed} delayed
          </p>
        </div>
      ) : (
        <div className="flex flex-1 flex-col overflow-hidden">
          <div className="flex items-center justify-between border-b bg-muted/20 px-4 py-2">
            <span className="text-xs text-muted-foreground">
              Peeked {peeked.length} — messages stay hidden from consumers while you
              inspect
            </span>
            <Button variant="outline" size="sm" onClick={handlePeek}>
              <RotateCw className="mr-1.5 size-3.5" />
              Peek again
            </Button>
          </div>

          <div className="flex-1 overflow-auto p-4 space-y-3">
            {peeked.length === 0 ? (
              <div className="flex h-32 items-center justify-center text-sm text-muted-foreground">
                No messages available to peek
              </div>
            ) : (
              peeked.map((msg) => {
                let formattedBody = msg.body;
                try {
                  const parsed = JSON.parse(msg.body);
                  formattedBody = JSON.stringify(parsed, null, 2);
                } catch {
                  // raw
                }

                return (
                  <div
                    key={msg.receiptHandle}
                    className="rounded-lg border p-3 space-y-2"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate font-mono text-xs text-muted-foreground">
                        {msg.messageId}
                      </span>
                      <div className="flex items-center gap-2 shrink-0">
                        {msg.messageGroupId && (
                          <Badge variant="outline" className="text-[10px]">
                            group: {msg.messageGroupId}
                          </Badge>
                        )}
                        {msg.receiveCount !== undefined && (
                          <span className="text-xs text-muted-foreground">
                            received {msg.receiveCount}×
                          </span>
                        )}
                        <span className="text-xs text-muted-foreground">
                          {formatDate(msg.sentAt)}
                        </span>
                      </div>
                    </div>

                    <pre className="whitespace-pre-wrap break-all rounded-md bg-muted/50 p-2 font-mono text-xs">
                      {formattedBody}
                    </pre>

                    <div className="flex justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-8"
                        aria-label="Copy body"
                        onClick={() => handleCopyBody(msg.body)}
                      >
                        <Copy className="size-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-8 text-destructive hover:text-destructive"
                        aria-label="Delete message"
                        onClick={() => setMessageToDelete(msg)}
                      >
                        <Trash2 className="size-3.5" />
                      </Button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}

      {/* Dialogs */}
      <SendMessageDialog
        open={isSendOpen}
        onOpenChange={setIsSendOpen}
        queue={queue}
      />

      {data && (
        <RedriveDialog
          open={isRedriveOpen}
          onOpenChange={setIsRedriveOpen}
          queue={queue}
          queues={data}
        />
      )}

      <DeleteConfirmDialog
        open={Boolean(messageToDelete)}
        onOpenChange={(open) => !open && setMessageToDelete(null)}
        title="Delete message"
        description={`Delete this message from ${queue.name}? This cannot be undone.`}
        confirmLabel="Delete"
        isPending={isDeletingMessage}
        onConfirm={handleDeleteMessage}
      />

      <DeleteConfirmDialog
        open={isPurgeOpen}
        onOpenChange={setIsPurgeOpen}
        title="Purge queue"
        description={`Permanently delete all messages in “${queue.name}”? This cannot be undone.`}
        confirmLabel="Purge"
        isPending={isPurging}
        onConfirm={handlePurge}
      />

      {queue && (
        <AttachLambdaDialog
          open={isAttachLambdaOpen}
          onOpenChange={setIsAttachLambdaOpen}
          queue={queue}
        />
      )}
    </div>
  );
}
