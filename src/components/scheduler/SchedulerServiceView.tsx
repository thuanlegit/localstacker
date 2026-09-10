import { useState } from "react";
import {
  CalendarClock,
  CircleAlert,
  Loader2,
  MoreHorizontal,
  Plus,
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
import {
  useScheduleGroups,
  useScheduleGroupActions,
} from "@/hooks/use-scheduler";
import type { ScheduleGroupSummary } from "@/lib/scheduler";

const GROUP_NAME_REGEX = /^[0-9a-zA-Z\-_.]{1,64}$/;

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
  const { createScheduleGroup } = useScheduleGroupActions();

  const isValid = GROUP_NAME_REGEX.test(name);
  const showError = name.length > 0 && !isValid;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isValid || isSubmitting) return;

    setIsSubmitting(true);
    try {
      const arn = await createScheduleGroup(name);
      if (arn) {
        setName("");
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
            <DialogTitle>Create schedule group</DialogTitle>
            <DialogDescription>
              Create a new schedule group to organize related schedules.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4 min-w-0">
            <div className="space-y-2">
              <Label htmlFor="group-name">Group name</Label>
              <Input
                id="group-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="my-group"
                autoFocus
              />
              {showError ? (
                <p className="text-xs text-destructive">
                  1–64 characters — letters, digits, hyphens, underscores, dots
                </p>
              ) : (
                <p className="text-xs text-muted-foreground">
                  Alphanumeric, hyphens, underscores, and dots. Max 64 chars.
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
              {isSubmitting ? "Creating..." : "Create group"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function SchedulerServiceView() {
  const profile = useActiveProfile();
  const serviceStatus = useServiceStatus("scheduler");
  const {
    data: groups,
    isPending,
    error,
    refetch,
    isFetching,
  } = useScheduleGroups(profile.id);
  const { deleteScheduleGroup } = useScheduleGroupActions();
  const { openTab, closeTab } = useTabs();

  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [groupToDelete, setGroupToDelete] =
    useState<ScheduleGroupSummary | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  if (
    serviceStatus === "disabled" ||
    (error && isServiceDisabledError(error))
  ) {
    return <ServiceDisabledView service="scheduler" />;
  }

  const handleRowClick = (group: ScheduleGroupSummary) => {
    openTab({
      id: `scheduleGroup:${group.name}`,
      kind: "scheduleGroup",
      groupName: group.name,
      title: group.name,
    });
  };

  const handleDelete = async () => {
    if (!groupToDelete) return;
    setIsDeleting(true);
    try {
      const ok = await deleteScheduleGroup(groupToDelete.name);
      if (ok) {
        closeTab(`scheduleGroup:${groupToDelete.name}`);
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
            <CalendarClock className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-lg font-semibold">EventBridge Scheduler</h1>
            <p className="text-xs text-muted-foreground">
              Schedule groups & schedules
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => refetch()}
            disabled={isFetching}
            title="Refresh schedule groups"
          >
            <RotateCw
              className={`h-4 w-4 ${isFetching ? "animate-spin" : ""}`}
            />
            <span className="hidden sm:inline">Refresh</span>
          </Button>
          <Button size="sm" onClick={() => setIsCreateOpen(true)}>
            <Plus className="h-4 w-4" />
            Create group
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
          <p className="text-sm font-medium">Failed to load schedule groups</p>
          <p className="text-xs text-muted-foreground">
            {error instanceof Error ? error.message : String(error)}
          </p>
          <Button variant="outline" size="sm" onClick={() => refetch()}>
            Retry
          </Button>
        </div>
      ) : !groups || groups.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 text-center text-muted-foreground">
          <CalendarClock className="h-10 w-10 stroke-1" />
          <p className="text-sm font-medium">No schedule groups</p>
          <p className="text-xs">
            Create a schedule group to begin organizing schedules.
          </p>
          <Button
            size="sm"
            className="mt-2"
            onClick={() => setIsCreateOpen(true)}
          >
            <Plus className="h-4 w-4" />
            Create group
          </Button>
        </div>
      ) : (
        <div className="flex-1 overflow-auto">
          <table className="w-full text-left text-sm">
            <thead className="sticky top-0 border-b bg-muted/50 text-xs font-medium text-muted-foreground">
              <tr>
                <th className="px-6 py-3">Group name</th>
                <th className="px-6 py-3">State</th>
                <th className="px-6 py-3">ARN</th>
                <th className="w-12 px-6 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {groups.map((group) => (
                <tr
                  key={group.arn || group.name}
                  onClick={() => handleRowClick(group)}
                  className="cursor-pointer transition-colors hover:bg-muted/50"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      handleRowClick(group);
                    }
                  }}
                >
                  <td className="px-6 py-3 font-medium">
                    <span className="flex items-center gap-2">
                      <span className="font-mono text-xs sm:text-sm">
                        {group.name}
                      </span>
                      {group.name === "default" && (
                        <Badge variant="outline" className="text-xs">
                          default
                        </Badge>
                      )}
                    </span>
                  </td>
                  <td className="px-6 py-3">
                    {group.state ? (
                      <Badge variant="secondary" className="text-xs">
                        {group.state}
                      </Badge>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="px-6 py-3">
                    <span
                      className="block max-w-xs truncate font-mono text-xs text-muted-foreground"
                      title={group.arn}
                    >
                      {group.arn || "—"}
                    </span>
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
                          disabled={group.name === "default"}
                          onClick={() => setGroupToDelete(group)}
                        >
                          <Trash2 className="h-4 w-4 mr-2" />
                          Delete group
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
            id: `scheduleGroup:${name}`,
            kind: "scheduleGroup",
            groupName: name,
            title: name,
          })
        }
      />

      <DeleteConfirmDialog
        open={Boolean(groupToDelete)}
        onOpenChange={(open) => !open && setGroupToDelete(null)}
        title="Delete schedule group"
        description={`Are you sure you want to delete schedule group “${groupToDelete?.name ?? ""}”? All schedules in it will be removed.`}
        confirmLabel="Delete"
        isPending={isDeleting}
        onConfirm={handleDelete}
      />
    </div>
  );
}
