import { useState } from "react";
import {
  CircleAlert,
  Loader2,
  MoreHorizontal,
  Plus,
  Radio,
  RotateCw,
  Trash2,
} from "lucide-react";
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
import { useTopics, useTopicActions } from "@/hooks/use-sns";
import type { TopicSummary } from "@/lib/sns";

const TOPIC_NAME_REGEX = /^[a-zA-Z0-9_-]{1,80}(\.fifo)?$/;

interface CreateTopicDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: (arn: string, name: string) => void;
}

function CreateTopicDialog({
  open,
  onOpenChange,
  onCreated,
}: CreateTopicDialogProps) {
  const [name, setName] = useState("");
  const [isFifo, setIsFifo] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { createTopic } = useTopicActions();

  const isValid = TOPIC_NAME_REGEX.test(name);
  const showError = name.length > 0 && !isValid;

  const handleFifoChange = (checked: boolean) => {
    setIsFifo(checked);
    if (checked) {
      if (name && !name.endsWith(".fifo")) {
        setName(`${name}.fifo`);
      }
    } else {
      if (name.endsWith(".fifo")) {
        setName(name.slice(0, -5));
      }
    }
  };

  const handleNameChange = (val: string) => {
    setName(val);
    if (val.endsWith(".fifo")) {
      setIsFifo(true);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isValid || isSubmitting) return;

    setIsSubmitting(true);
    try {
      const finalFifo = isFifo || name.endsWith(".fifo");
      const arn = await createTopic({ name, fifo: finalFifo });
      if (arn) {
        setName("");
        setIsFifo(false);
        onOpenChange(false);
        onCreated(arn, name);
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
            <DialogTitle>Create topic</DialogTitle>
            <DialogDescription>
              Create a new standard or FIFO SNS topic.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4 min-w-0">
            <div className="space-y-2">
              <Label htmlFor="topic-name">Topic name</Label>
              <Input
                id="topic-name"
                value={name}
                onChange={(e) => handleNameChange(e.target.value)}
                placeholder="my-topic"
                autoFocus
              />
              {showError ? (
                <p className="text-xs text-destructive">
                  1–80 characters — letters, digits, hyphens, underscores (ends with .fifo for FIFO topics)
                </p>
              ) : (
                <p className="text-xs text-muted-foreground">
                  Alphanumeric, hyphens, and underscores. Max 80 chars.
                </p>
              )}
            </div>

            <div className="flex items-center space-x-2 pt-1">
              <input
                type="checkbox"
                id="fifo-checkbox"
                checked={isFifo}
                onChange={(e) => handleFifoChange(e.target.checked)}
                className="h-4 w-4 rounded border-input text-primary focus:ring-ring"
              />
              <Label htmlFor="fifo-checkbox" className="text-sm font-normal cursor-pointer">
                FIFO topic (strictly preserved message ordering)
              </Label>
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
              {isSubmitting ? "Creating..." : "Create topic"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function SnsServiceView() {
  const profile = useActiveProfile();
  const serviceStatus = useServiceStatus("sns");
  const { data: topics, isPending, error, refetch, isFetching } = useTopics(profile.id);
  const { deleteTopic } = useTopicActions();
  const { openTab, closeTab } = useTabs();

  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [topicToDelete, setTopicToDelete] = useState<TopicSummary | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  if (serviceStatus === "disabled" || (error && isServiceDisabledError(error))) {
    return <ServiceDisabledView service="sns" />;
  }

  const handleRowClick = (topic: TopicSummary) => {
    openTab({
      id: `topic:${topic.arn}`,
      kind: "topic",
      topicArn: topic.arn,
      title: topic.name,
    });
  };

  const handleDelete = async () => {
    if (!topicToDelete) return;
    setIsDeleting(true);
    try {
      const ok = await deleteTopic(topicToDelete.arn);
      if (ok) {
        closeTab(`topic:${topicToDelete.arn}`);
        setTopicToDelete(null);
      }
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
            <Radio className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-lg font-semibold">SNS</h1>
            <p className="text-xs text-muted-foreground">
              Topics & subscriptions
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => refetch()}
            disabled={isFetching}
            title="Refresh topics"
          >
            <RotateCw
              className={`h-4 w-4 ${isFetching ? "animate-spin" : ""}`}
            />
            <span className="hidden sm:inline">Refresh</span>
          </Button>
          <Button size="sm" onClick={() => setIsCreateOpen(true)}>
            <Plus className="h-4 w-4" />
            Create topic
          </Button>
        </div>
      </div>

      {/* Body */}
      {isPending ? (
        <div className="flex flex-1 items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : error ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 text-center">
          <CircleAlert className="h-8 w-8 text-destructive" />
          <p className="text-sm font-medium">Failed to load SNS topics</p>
          <p className="text-xs text-muted-foreground">
            {error instanceof Error ? error.message : String(error)}
          </p>
          <Button variant="outline" size="sm" onClick={() => refetch()}>
            Retry
          </Button>
        </div>
      ) : !topics || topics.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 text-center text-muted-foreground">
          <Radio className="h-10 w-10 stroke-1" />
          <p className="text-sm font-medium">No SNS topics</p>
          <p className="text-xs">Create your first topic to get started.</p>
          <Button
            size="sm"
            className="mt-2"
            onClick={() => setIsCreateOpen(true)}
          >
            <Plus className="h-4 w-4" />
            Create your first topic
          </Button>
        </div>
      ) : (
        <div className="flex-1 overflow-auto">
          <table className="w-full text-left text-sm">
            <thead className="sticky top-0 border-b bg-muted/50 text-xs font-medium text-muted-foreground">
              <tr>
                <th className="px-6 py-3">Topic name</th>
                <th className="px-6 py-3">Type</th>
                <th className="w-12 px-6 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {topics.map((topic) => (
                <tr
                  key={topic.arn}
                  onClick={() => handleRowClick(topic)}
                  className="cursor-pointer transition-colors hover:bg-muted/50"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      handleRowClick(topic);
                    }
                  }}
                >
                  <td className="px-6 py-3 font-medium">
                    <span className="font-mono text-xs sm:text-sm">{topic.name}</span>
                  </td>
                  <td className="px-6 py-3">
                    {topic.isFifo ? (
                      <Badge variant="secondary" className="font-mono text-xs">
                        FIFO
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="text-xs">
                        Standard
                      </Badge>
                    )}
                  </td>
                  <td
                    className="px-6 py-3 text-right"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon-xs"
                          aria-label={`Actions for ${topic.name}`}
                        >
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem
                          className="text-destructive focus:text-destructive"
                          onClick={() => setTopicToDelete(topic)}
                        >
                          <Trash2 className="h-4 w-4 mr-2" />
                          Delete topic
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Dialogs */}
      <CreateTopicDialog
        open={isCreateOpen}
        onOpenChange={setIsCreateOpen}
        onCreated={(arn, name) =>
          openTab({
            id: `topic:${arn}`,
            kind: "topic",
            topicArn: arn,
            title: name,
          })
        }
      />

      <DeleteConfirmDialog
        open={Boolean(topicToDelete)}
        onOpenChange={(open) => !open && setTopicToDelete(null)}
        title="Delete topic"
        description={`Are you sure you want to delete topic “${topicToDelete?.name ?? ""}”? All subscriptions will be deleted.`}
        confirmLabel="Delete"
        isPending={isDeleting}
        onConfirm={handleDelete}
      />
    </div>
  );
}
