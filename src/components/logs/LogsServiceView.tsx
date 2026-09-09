import { useState } from "react";
import {
  CircleAlert,
  Loader2,
  MoreHorizontal,
  Plus,
  RotateCw,
  ScrollText,
  Trash2,
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
import { useLogGroups, useLogGroupActions } from "@/hooks/use-logs";
import { formatBytes, formatDate } from "@/lib/format";
import type { LogGroupSummary } from "@/lib/logs";

interface CreateGroupDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: (name: string) => void;
}

function CreateGroupDialog({
  open,
  onOpenChange,
  onCreated,
}: CreateGroupDialogProps) {
  const [name, setName] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { createGroup } = useLogGroupActions();

  const isValid = name.trim().startsWith("/") && name.trim().length > 1;
  const showError = name.length > 0 && !isValid;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isValid || isSubmitting) return;

    setIsSubmitting(true);
    try {
      const trimmed = name.trim();
      const ok = await createGroup(trimmed);
      if (ok) {
        setName("");
        onOpenChange(false);
        onCreated(trimmed);
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
            <DialogTitle>Create log group</DialogTitle>
            <DialogDescription>
              Create a new CloudWatch Logs log group. Name must begin with a
              forward slash (/).
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="log-group-name">Log group name</Label>
              <Input
                id="log-group-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="/aws/lambda/my-function"
                autoFocus
              />
              {showError ? (
                <p className="text-xs text-destructive">
                  Log group name must begin with a forward slash (/)
                </p>
              ) : (
                <p className="text-xs text-muted-foreground">
                  e.g. /aws/lambda/my-function or /app/backend
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
              {isSubmitting ? "Creating..." : "Create log group"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function LogsServiceView() {
  const profile = useActiveProfile();
  const serviceStatus = useServiceStatus("logs");
  const { data: groups, isPending, error, refetch, isFetching } = useLogGroups(profile.id);
  const { deleteGroup } = useLogGroupActions();
  const { openTab, closeTab } = useTabs();

  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [groupToDelete, setGroupToDelete] = useState<LogGroupSummary | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  if (serviceStatus === "disabled" || (error && isServiceDisabledError(error))) {
    return <ServiceDisabledView service="logs" />;
  }

  const handleRowClick = (name: string) => {
    openTab({
      id: `logGroup:${name}`,
      kind: "logGroup",
      logGroupName: name,
      title: name,
    });
  };

  const handleDelete = async () => {
    if (!groupToDelete) return;
    setIsDeleting(true);
    try {
      const ok = await deleteGroup(groupToDelete.name);
      if (ok) {
        closeTab(`logGroup:${groupToDelete.name}`);
        setGroupToDelete(null);
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
            <ScrollText className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-lg font-semibold">CloudWatch Logs</h1>
            <p className="text-xs text-muted-foreground">
              Log groups & streams
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => refetch()}
            disabled={isFetching}
            title="Refresh log groups"
          >
            <RotateCw
              className={`h-4 w-4 ${isFetching ? "animate-spin" : ""}`}
            />
            <span className="hidden sm:inline">Refresh</span>
          </Button>
          <Button size="sm" onClick={() => setIsCreateOpen(true)}>
            <Plus className="h-4 w-4" />
            Create log group
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
          <p className="text-sm font-medium">Failed to load log groups</p>
          <p className="text-xs text-muted-foreground">
            {error instanceof Error ? error.message : String(error)}
          </p>
          <Button variant="outline" size="sm" onClick={() => refetch()}>
            Retry
          </Button>
        </div>
      ) : !groups || groups.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 text-center text-muted-foreground">
          <ScrollText className="h-10 w-10 stroke-1" />
          <p className="text-sm font-medium">No log groups</p>
          <p className="text-xs">Create a log group to collect logs.</p>
          <Button
            size="sm"
            className="mt-2"
            onClick={() => setIsCreateOpen(true)}
          >
            <Plus className="h-4 w-4" />
            Create log group
          </Button>
        </div>
      ) : (
        <div className="flex-1 overflow-auto">
          <table className="w-full text-left text-sm">
            <thead className="sticky top-0 border-b bg-muted/50 text-xs font-medium text-muted-foreground">
              <tr>
                <th className="px-6 py-3">Name</th>
                <th className="px-6 py-3">Stored size</th>
                <th className="px-6 py-3">Retention</th>
                <th className="px-6 py-3">Last event</th>
                <th className="w-12 px-6 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {groups.map((group) => (
                <tr
                  key={group.name}
                  onClick={() => handleRowClick(group.name)}
                  className="cursor-pointer transition-colors hover:bg-muted/50"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      handleRowClick(group.name);
                    }
                  }}
                >
                  <td className="px-6 py-3 font-medium">
                    <span className="font-mono text-xs sm:text-sm">
                      {group.name}
                    </span>
                  </td>
                  <td className="px-6 py-3 text-muted-foreground text-xs">
                    {formatBytes(group.sizeBytes)}
                  </td>
                  <td className="px-6 py-3 text-muted-foreground text-xs">
                    {group.retentionInDays ? `${group.retentionInDays} days` : "—"}
                  </td>
                  <td className="px-6 py-3 text-muted-foreground text-xs">
                    {group.lastEventTime
                      ? formatDate(new Date(group.lastEventTime))
                      : "—"}
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
                          aria-label={`Actions for ${group.name}`}
                        >
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem
                          className="text-destructive focus:text-destructive"
                          onClick={() => setGroupToDelete(group)}
                        >
                          <Trash2 className="h-4 w-4 mr-2" />
                          Delete log group
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
      <CreateGroupDialog
        open={isCreateOpen}
        onOpenChange={setIsCreateOpen}
        onCreated={(name) =>
          openTab({
            id: `logGroup:${name}`,
            kind: "logGroup",
            logGroupName: name,
            title: name,
          })
        }
      />

      <DeleteConfirmDialog
        open={Boolean(groupToDelete)}
        onOpenChange={(open) => !open && setGroupToDelete(null)}
        title="Delete log group"
        description={`Are you sure you want to delete log group “${groupToDelete?.name ?? ""}”? All streams and events will be permanently deleted.`}
        confirmLabel="Delete"
        isPending={isDeleting}
        onConfirm={handleDelete}
      />
    </div>
  );
}
