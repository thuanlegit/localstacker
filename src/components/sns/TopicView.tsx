import { useState } from "react";
import {
  Check,
  CircleAlert,
  Copy,
  Inbox,
  Loader2,
  Radio,
  RotateCw,
  Send,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { DeleteConfirmDialog } from "@/components/DeleteConfirmDialog";
import { useActiveProfile } from "@/store/profiles";
import { useTabs } from "@/store/tabs";
import {
  useTopicAttributes,
  useTopicSubscriptions,
  useTopicActions,
} from "@/hooks/use-sns";
import { useQueues } from "@/hooks/use-sqs";

interface TopicViewProps {
  topicArn: string;
}

interface PublishDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  topicArn: string;
  isFifo: boolean;
  onPublish: (params: {
    message: string;
    subject?: string;
    messageGroupId?: string;
    messageAttributes?: Record<
      string,
      {
        DataType: "String" | "Number" | "Binary";
        StringValue?: string;
        BinaryValue?: string;
      }
    >;
  }) => Promise<string | null>;
}

function PublishDialog({
  open,
  onOpenChange,
  topicArn,
  isFifo,
  onPublish,
}: PublishDialogProps) {
  const [message, setMessage] = useState("");
  const [subject, setSubject] = useState("");
  const [messageGroupId, setMessageGroupId] = useState("1");
  const [attributesJson, setAttributesJson] = useState("");
  const [attrError, setAttrError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setAttrError(null);

    let parsedAttributes:
      | Record<
          string,
          {
            DataType: "String" | "Number" | "Binary";
            StringValue?: string;
            BinaryValue?: string;
          }
        >
      | undefined = undefined;

    if (attributesJson.trim()) {
      try {
        const parsed = JSON.parse(attributesJson);
        if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
          setAttrError("Message attributes must be a JSON object");
          return;
        }

        for (const [key, val] of Object.entries(parsed)) {
          if (
            typeof val !== "object" ||
            val === null ||
            !("DataType" in val) ||
            typeof (val as Record<string, unknown>).DataType !== "string"
          ) {
            setAttrError(
              `Attribute "${key}" must be an object with at least a DataType property`,
            );
            return;
          }
        }
        parsedAttributes = parsed;
      } catch {
        setAttrError("Message attributes must be valid JSON");
        return;
      }
    }

    setIsSubmitting(true);
    try {
      const messageId = await onPublish({
        message,
        subject: subject.trim() || undefined,
        messageGroupId: isFifo ? messageGroupId.trim() || undefined : undefined,
        messageAttributes: parsedAttributes,
      });

      if (messageId) {
        setMessage("");
        setSubject("");
        setAttributesJson("");
        onOpenChange(false);
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl max-w-xl">
        <form onSubmit={handleSubmit} className="min-w-0">
          <DialogHeader>
            <DialogTitle>Publish message</DialogTitle>
            <DialogDescription>
              Publish a notification message to {topicArn.split(":").pop()}.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4 min-w-0">
            {isFifo && (
              <div className="space-y-1">
                <Label htmlFor="message-group-id">Message group ID</Label>
                <Input
                  id="message-group-id"
                  value={messageGroupId}
                  onChange={(e) => setMessageGroupId(e.target.value)}
                  placeholder="group-1"
                  required
                />
              </div>
            )}

            <div className="space-y-1">
              <Label htmlFor="publish-subject">Subject (optional)</Label>
              <Input
                id="publish-subject"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                placeholder="Notification subject"
              />
            </div>

            <div className="space-y-1">
              <Label htmlFor="publish-message">Message body</Label>
              <textarea
                id="publish-message"
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="Message payload or JSON"
                rows={6}
                className="flex w-full rounded-md border border-input bg-transparent px-3 py-2 font-mono text-xs shadow-xs placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                required
              />
            </div>

            <div className="space-y-1">
              <Label htmlFor="publish-attributes">
                Message attributes (optional JSON)
              </Label>
              <textarea
                id="publish-attributes"
                value={attributesJson}
                onChange={(e) => {
                  setAttributesJson(e.target.value);
                  setAttrError(null);
                }}
                placeholder='{"env": {"DataType": "String", "StringValue": "dev"}}'
                rows={3}
                className="flex w-full rounded-md border border-input bg-transparent px-3 py-2 font-mono text-xs shadow-xs placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              />
              {attrError && (
                <p className="text-xs text-destructive">{attrError}</p>
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
            <Button type="submit" disabled={!message.trim() || isSubmitting}>
              {isSubmitting ? "Publishing..." : "Publish"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

interface SubscribeQueueDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubscribe: (queueArn: string) => Promise<string | null>;
}

function SubscribeQueueDialog({
  open,
  onOpenChange,
  onSubscribe,
}: SubscribeQueueDialogProps) {
  const profile = useActiveProfile();
  const { data: queues, isPending: isQueuesPending } = useQueues(profile.id, {
    enabled: open,
  });
  const [selectedQueueArn, setSelectedQueueArn] = useState<string>("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedQueueArn || isSubmitting) return;

    setIsSubmitting(true);
    try {
      const subArn = await onSubscribe(selectedQueueArn);
      if (subArn) {
        setSelectedQueueArn("");
        onOpenChange(false);
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Subscribe SQS queue</DialogTitle>
            <DialogDescription>
              Forward messages published to this topic to an SQS queue.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-1">
              <Label>Select SQS queue</Label>
              {isQueuesPending ? (
                <div className="flex items-center gap-2 text-xs text-muted-foreground py-2">
                  <Loader2 className="h-4 w-4 animate-spin" /> Loading queues...
                </div>
              ) : !queues || queues.length === 0 ? (
                <p className="text-xs text-muted-foreground py-2">
                  No SQS queues found. Create a queue first in SQS.
                </p>
              ) : (
                <Select
                  value={selectedQueueArn}
                  onValueChange={(val) => setSelectedQueueArn(val)}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Select queue..." />
                  </SelectTrigger>
                  <SelectContent>
                    {queues.map((q) => (
                      <SelectItem key={q.url} value={q.attributes.arn || q.name}>
                        {q.name} ({q.isFifo ? "FIFO" : "Standard"})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
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
            <Button
              type="submit"
              disabled={!selectedQueueArn || isSubmitting}
            >
              {isSubmitting ? "Subscribing..." : "Subscribe"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function TopicView({ topicArn }: TopicViewProps) {
  const profile = useActiveProfile();
  const { closeTab } = useTabs();
  const name = topicArn.split(":").pop() ?? topicArn;
  const isFifo = name.endsWith(".fifo");

  const {
    data: attributes,
    isPending: isAttrPending,
    error: attrError,
    refetch: refetchAttrs,
  } = useTopicAttributes(profile.id, topicArn);

  const {
    data: subscriptions,
    isPending: isSubsPending,
    error: subsError,
    refetch: refetchSubs,
  } = useTopicSubscriptions(profile.id, topicArn);

  const actions = useTopicActions(topicArn);

  const [hasCopiedArn, setHasCopiedArn] = useState(false);
  const [isPublishOpen, setIsPublishOpen] = useState(false);
  const [isSubscribeOpen, setIsSubscribeOpen] = useState(false);
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const handleCopyArn = async () => {
    try {
      await navigator.clipboard.writeText(topicArn);
      setHasCopiedArn(true);
      toast.success("Topic ARN copied");
      setTimeout(() => setHasCopiedArn(false), 2000);
    } catch {
      toast.error("Failed to copy topic ARN");
    }
  };

  const handleDelete = async () => {
    setIsDeleting(true);
    try {
      const ok = await actions.deleteTopic(topicArn);
      if (ok) {
        closeTab(`topic:${topicArn}`);
      }
    } finally {
      setIsDeleting(false);
    }
  };

  const handleRefresh = () => {
    refetchAttrs();
    refetchSubs();
  };

  if (isAttrPending) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (attrError) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
        <CircleAlert className="h-8 w-8 text-destructive" />
        <p className="text-sm font-medium">Failed to load topic details</p>
        <p className="text-xs text-muted-foreground">
          {attrError instanceof Error ? attrError.message : String(attrError)}
        </p>
        <Button variant="outline" size="sm" onClick={() => handleRefresh()}>
          Retry
        </Button>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="border-b px-6 py-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Radio className="h-5 w-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-lg font-semibold">{name}</h1>
                <Badge variant={isFifo ? "secondary" : "outline"} className="text-xs">
                  {isFifo ? "FIFO" : "Standard"}
                </Badge>
              </div>
              <div className="flex items-center gap-1.5 mt-0.5">
                <span className="font-mono text-xs text-muted-foreground truncate max-w-sm sm:max-w-md">
                  {topicArn}
                </span>
                <Button
                  variant="ghost"
                  size="icon-xs"
                  onClick={handleCopyArn}
                  title="Copy ARN"
                >
                  {hasCopiedArn ? (
                    <Check className="h-3.5 w-3.5 text-green-500" />
                  ) : (
                    <Copy className="h-3.5 w-3.5" />
                  )}
                </Button>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleRefresh}
              title="Refresh topic"
            >
              <RotateCw className="h-4 w-4" />
              <span className="hidden sm:inline">Refresh</span>
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setIsSubscribeOpen(true)}
            >
              <Inbox className="h-4 w-4" />
              Subscribe SQS
            </Button>
            <Button size="sm" onClick={() => setIsPublishOpen(true)}>
              <Send className="h-4 w-4" />
              Publish message
            </Button>
            <Button
              variant="destructive"
              size="sm"
              onClick={() => setIsDeleteOpen(true)}
            >
              <Trash2 className="h-4 w-4" />
              Delete
            </Button>
          </div>
        </div>

        {/* Stats row */}
        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4 border-t pt-3">
          <div>
            <p className="text-xs text-muted-foreground">Display name</p>
            <p className="text-sm font-medium">
              {attributes?.displayName ?? "—"}
            </p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Confirmed subscriptions</p>
            <p className="text-sm font-medium">
              {attributes?.subscriptionsConfirmed ?? 0}
            </p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Pending subscriptions</p>
            <p className="text-sm font-medium">
              {attributes?.subscriptionsPending ?? 0}
            </p>
          </div>
        </div>
      </div>

      {/* Subscriptions Section */}
      <div className="flex flex-1 flex-col overflow-hidden">
        <div className="border-b bg-muted/20 px-6 py-2.5 flex items-center justify-between">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Subscriptions ({subscriptions?.length ?? 0})
          </h2>
        </div>

        {isSubsPending ? (
          <div className="flex flex-1 items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : subsError ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-2 text-center text-destructive p-4">
            <CircleAlert className="h-6 w-6" />
            <p className="text-sm font-medium">Failed to load subscriptions</p>
          </div>
        ) : !subscriptions || subscriptions.length === 0 ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-2 text-center text-muted-foreground">
            <Radio className="h-8 w-8 stroke-1" />
            <p className="text-sm font-medium">No subscriptions</p>
            <p className="text-xs">
              Subscribe an SQS queue to start consuming messages.
            </p>
            <Button
              size="sm"
              variant="outline"
              className="mt-2"
              onClick={() => setIsSubscribeOpen(true)}
            >
              <Inbox className="h-4 w-4" />
              Subscribe SQS queue
            </Button>
          </div>
        ) : (
          <div className="flex-1 overflow-auto">
            <table className="w-full text-left text-sm">
              <thead className="sticky top-0 border-b bg-muted/50 text-xs font-medium text-muted-foreground">
                <tr>
                  <th className="px-6 py-3">Protocol</th>
                  <th className="px-6 py-3">Endpoint</th>
                  <th className="px-6 py-3">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {subscriptions.map((sub) => (
                  <tr key={sub.arn || sub.endpoint} className="hover:bg-muted/40">
                    <td className="px-6 py-3 font-mono text-xs uppercase font-medium">
                      {sub.protocol}
                    </td>
                    <td className="px-6 py-3 font-mono text-xs">
                      <span className="truncate max-w-md block" title={sub.endpoint}>
                        {sub.endpoint}
                      </span>
                    </td>
                    <td className="px-6 py-3">
                      {sub.isPending ? (
                        <Badge variant="secondary" className="text-xs">
                          Pending
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="text-xs text-green-600 border-green-600/30">
                          Confirmed
                        </Badge>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Publish Dialog */}
      <PublishDialog
        open={isPublishOpen}
        onOpenChange={setIsPublishOpen}
        topicArn={topicArn}
        isFifo={isFifo}
        onPublish={actions.publish}
      />

      {/* Subscribe SQS Dialog */}
      <SubscribeQueueDialog
        open={isSubscribeOpen}
        onOpenChange={setIsSubscribeOpen}
        onSubscribe={(queueArn) => actions.subscribeQueue(queueArn)}
      />

      {/* Delete Topic Dialog */}
      <DeleteConfirmDialog
        open={isDeleteOpen}
        onOpenChange={setIsDeleteOpen}
        title="Delete topic"
        description={`Are you sure you want to delete topic “${name}”? This action cannot be undone.`}
        confirmLabel="Delete"
        isPending={isDeleting}
        onConfirm={handleDelete}
      />
    </div>
  );
}
