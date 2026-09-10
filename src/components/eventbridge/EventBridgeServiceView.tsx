import { useState } from "react";
import {
  CircleAlert,
  Loader2,
  MoreHorizontal,
  Plus,
  RotateCw,
  Trash2,
  Webhook,
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
import { useEventBuses, useEventBusActions } from "@/hooks/use-eventbridge";
import type { EventBusSummary } from "@/lib/eventbridge";

const BUS_NAME_REGEX = /^[\.\-_A-Za-z0-9]{1,256}$/;

interface CreateBusDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: (name: string) => void;
}

function CreateBusDialog({ open, onOpenChange, onCreated }: CreateBusDialogProps) {
  const [name, setName] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { createBus } = useEventBusActions();

  const isValid = BUS_NAME_REGEX.test(name);
  const showError = name.length > 0 && !isValid;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isValid || isSubmitting) return;

    setIsSubmitting(true);
    try {
      const arn = await createBus({ name });
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
            <DialogTitle>Create event bus</DialogTitle>
            <DialogDescription>
              Create a new custom event bus.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4 min-w-0">
            <div className="space-y-2">
              <Label htmlFor="bus-name">Bus name</Label>
              <Input
                id="bus-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="my-bus"
                autoFocus
              />
              {showError ? (
                <p className="text-xs text-destructive">
                  1–256 characters — letters, digits, hyphens, underscores, dots
                </p>
              ) : (
                <p className="text-xs text-muted-foreground">
                  Alphanumeric, hyphens, underscores, and dots. Max 256 chars.
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
              {isSubmitting ? "Creating..." : "Create bus"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function EventBridgeServiceView() {
  const profile = useActiveProfile();
  const serviceStatus = useServiceStatus("eventbridge");
  const { data: buses, isPending, error, refetch, isFetching } = useEventBuses(profile.id);
  const { deleteBus } = useEventBusActions();
  const { openTab, closeTab } = useTabs();

  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [busToDelete, setBusToDelete] = useState<EventBusSummary | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  if (serviceStatus === "disabled" || (error && isServiceDisabledError(error))) {
    return <ServiceDisabledView service="eventbridge" />;
  }

  const handleRowClick = (bus: EventBusSummary) => {
    openTab({
      id: `eventBus:${bus.name}`,
      kind: "eventBus",
      busName: bus.name,
      title: bus.name,
    });
  };

  const handleDelete = async () => {
    if (!busToDelete) return;
    setIsDeleting(true);
    try {
      const ok = await deleteBus(busToDelete.name);
      if (ok) {
        closeTab(`eventBus:${busToDelete.name}`);
        setBusToDelete(null);
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
            <Webhook className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-lg font-semibold">EventBridge</h1>
            <p className="text-xs text-muted-foreground">
              Event buses & rules
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => refetch()}
            disabled={isFetching}
            title="Refresh event buses"
          >
            <RotateCw
              className={`h-4 w-4 ${isFetching ? "animate-spin" : ""}`}
            />
            <span className="hidden sm:inline">Refresh</span>
          </Button>
          <Button size="sm" onClick={() => setIsCreateOpen(true)}>
            <Plus className="h-4 w-4" />
            Create bus
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
          <p className="text-sm font-medium">Failed to load event buses</p>
          <p className="text-xs text-muted-foreground">
            {error instanceof Error ? error.message : String(error)}
          </p>
          <Button variant="outline" size="sm" onClick={() => refetch()}>
            Retry
          </Button>
        </div>
      ) : !buses || buses.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 text-center text-muted-foreground">
          <Webhook className="h-10 w-10 stroke-1" />
          <p className="text-sm font-medium">No event buses</p>
          <p className="text-xs">Create your first bus to get started.</p>
          <Button
            size="sm"
            className="mt-2"
            onClick={() => setIsCreateOpen(true)}
          >
            <Plus className="h-4 w-4" />
            Create bus
          </Button>
        </div>
      ) : (
        <div className="flex-1 overflow-auto">
          <table className="w-full text-left text-sm">
            <thead className="sticky top-0 border-b bg-muted/50 text-xs font-medium text-muted-foreground">
              <tr>
                <th className="px-6 py-3">Bus name</th>
                <th className="px-6 py-3">ARN</th>
                <th className="px-6 py-3">Created</th>
                <th className="w-12 px-6 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {buses.map((bus) => (
                <tr
                  key={bus.arn || bus.name}
                  onClick={() => handleRowClick(bus)}
                  className="cursor-pointer transition-colors hover:bg-muted/50"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      handleRowClick(bus);
                    }
                  }}
                >
                  <td className="px-6 py-3 font-medium">
                    <span className="flex items-center gap-2">
                      <span className="font-mono text-xs sm:text-sm">{bus.name}</span>
                      {bus.name === "default" && (
                        <Badge variant="outline" className="text-xs">
                          default
                        </Badge>
                      )}
                    </span>
                  </td>
                  <td className="px-6 py-3">
                    <span
                      className="block max-w-xs truncate font-mono text-xs text-muted-foreground"
                      title={bus.arn}
                    >
                      {bus.arn || "—"}
                    </span>
                  </td>
                  <td className="px-6 py-3 text-xs text-muted-foreground">
                    {bus.creationTime ? bus.creationTime.toLocaleString() : "—"}
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
                          aria-label={`Actions for ${bus.name}`}
                        >
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem
                          className="text-destructive focus:text-destructive"
                          disabled={bus.name === "default"}
                          onClick={() => setBusToDelete(bus)}
                        >
                          <Trash2 className="h-4 w-4 mr-2" />
                          Delete bus
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
      <CreateBusDialog
        open={isCreateOpen}
        onOpenChange={setIsCreateOpen}
        onCreated={(name) =>
          openTab({
            id: `eventBus:${name}`,
            kind: "eventBus",
            busName: name,
            title: name,
          })
        }
      />

      <DeleteConfirmDialog
        open={Boolean(busToDelete)}
        onOpenChange={(open) => !open && setBusToDelete(null)}
        title="Delete event bus"
        description={`Are you sure you want to delete event bus “${busToDelete?.name ?? ""}”? All rules on it will be deleted.`}
        confirmLabel="Delete"
        isPending={isDeleting}
        onConfirm={handleDelete}
      />
    </div>
  );
}
