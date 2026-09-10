import { useState } from "react";
import {
  Cable,
  Check,
  CircleAlert,
  Container,
  Copy,
  MoreHorizontal,
  Play,
  Plus,
  RefreshCw,
  RotateCw,
  ScrollText,
  Square,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { DeleteConfirmDialog } from "@/components/DeleteConfirmDialog";
import {
  useDockerActions,
  useDockerAdapter,
  useDockerContainers,
  useDockerStatus,
} from "@/hooks/use-docker";
import { containerEndpoint, type ContainerSummary } from "@/lib/docker";
import { ContainerDetailPanel } from "./ContainerDetailPanel";
import { CreateContainerDialog } from "./CreateContainerDialog";

function getContainerStateBadgeClass(state: string): string {
  switch (state.toLowerCase()) {
    case "running":
      return "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20";
    case "exited":
      return "bg-zinc-500/10 text-zinc-600 dark:text-zinc-400 border-zinc-500/20";
    case "restarting":
    case "paused":
    case "created":
      return "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20";
    case "dead":
    case "removing":
      return "bg-destructive/10 text-destructive border-destructive/20";
    default:
      return "bg-zinc-500/10 text-zinc-600 dark:text-zinc-400 border-zinc-500/20";
  }
}

interface RemoveDialogState {
  container: ContainerSummary;
  removeVolumes: boolean;
  isRemoving: boolean;
}

interface ActionWarningState {
  container: ContainerSummary;
  action: "stop" | "restart";
}

export function DockerView() {
  const adapter = useDockerAdapter();
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const { data: status, isLoading: isStatusLoading, refetch: refetchStatus } = useDockerStatus();
  const {
    data: containers = [],
    isLoading: isContainersLoading,
    isFetching: isContainersFetching,
    refetch: refetchContainers,
  } = useDockerContainers();

  const {
    willLoseState,
    startContainer,
    stopContainer,
    restartContainer,
    removeContainer,
    connectContainer,
    createAndConnect,
  } = useDockerActions();

  const [selectedContainerId, setSelectedContainerId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [stoppingId, setStoppingId] = useState<string | null>(null);
  const [actionWarning, setActionWarning] = useState<ActionWarningState | null>(null);
  const [removeDialog, setRemoveDialog] = useState<RemoveDialogState | null>(null);

  const handleRefresh = async () => {
    await Promise.all([refetchStatus(), refetchContainers()]);
  };

  const handleCopy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedId(text);
      setTimeout(() => setCopiedId(null), 2000);
    } catch {
      // ignore
    }
  };

  const handleStopClick = (container: ContainerSummary) => {
    if (willLoseState(container)) {
      setActionWarning({ container, action: "stop" });
    } else {
      executeStop(container);
    }
  };

  const handleRestartClick = (container: ContainerSummary) => {
    if (willLoseState(container)) {
      setActionWarning({ container, action: "restart" });
    } else {
      executeRestart(container);
    }
  };

  const executeStop = async (container: ContainerSummary) => {
    setStoppingId(container.containerId);
    try {
      await stopContainer(container);
    } finally {
      setStoppingId(null);
    }
  };

  const executeRestart = async (container: ContainerSummary) => {
    setStoppingId(container.containerId);
    try {
      await restartContainer(container);
    } finally {
      setStoppingId(null);
    }
  };

  const selectedContainer = containers.find((c) => c.containerId === selectedContainerId);

  return (
    <div className="flex flex-col gap-6 p-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <div className="flex size-10 items-center justify-center rounded-lg border bg-muted/40">
            <Container className="size-5 text-primary" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold tracking-tight">Docker</h1>
              {adapter.kind === "mock" && (
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Badge
                        variant="outline"
                        className="cursor-help border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400 text-xs"
                      >
                        Demo data
                      </Badge>
                    </TooltipTrigger>
                    <TooltipContent side="right" className="max-w-xs text-xs">
                      Run inside the desktop app for live Docker
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              )}
            </div>
            <p className="text-sm text-muted-foreground">
              LocalStack container lifecycle
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handleRefresh}
            disabled={isContainersFetching || isStatusLoading}
            className="gap-1.5"
            aria-label="Refresh containers"
          >
            <RefreshCw
              className={`size-3.5 ${
                isContainersFetching ? "animate-spin" : ""
              }`}
            />
            <span>Refresh</span>
          </Button>
          <Button size="sm" onClick={() => setIsCreateOpen(true)} className="gap-1.5">
            <Plus className="size-3.5" />
            <span>Launch Container</span>
          </Button>
        </div>
      </div>

      {/* Daemon Status Row */}
      <div className="rounded-md border p-3 text-sm">
        {status?.available ? (
          <div className="flex items-center justify-between text-muted-foreground text-xs">
            <span>
              Docker daemon · {status.version ? `v${status.version}` : "Connected"}
            </span>
          </div>
        ) : (
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-destructive">
            <div className="flex items-start gap-2">
              <CircleAlert className="size-4 shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold text-sm">
                  {status?.errorKind === "permission"
                    ? "Docker Permission Denied"
                    : "Docker Unavailable"}
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {status?.errorKind === "permission"
                    ? "Permission denied on the Docker socket — add your user to the docker group"
                    : "Start Docker Desktop or verify daemon socket connectivity."}
                  {status?.reason && ` (${status.reason})`}
                </p>
              </div>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={handleRefresh}
              className="shrink-0 h-8 text-xs"
            >
              Retry
            </Button>
          </div>
        )}
      </div>

      {/* Container List */}
      <div className="rounded-md border bg-card">
        {isContainersLoading ? (
          <div className="flex h-48 items-center justify-center text-sm text-muted-foreground">
            Loading containers…
          </div>
        ) : containers.length === 0 ? (
          <div className="flex flex-col items-center justify-center p-12 text-center border-dashed rounded-md">
            <Container className="size-10 text-muted-foreground/50 mb-3" />
            <h3 className="font-medium text-base">No LocalStack containers found</h3>
            <p className="text-sm text-muted-foreground max-w-sm mt-1 mb-4">
              Start a container via Docker or launch a new LocalStack container instance.
            </p>
            <Button size="sm" onClick={() => setIsCreateOpen(true)} className="gap-1.5">
              <Plus className="size-3.5" />
              <span>Launch Container</span>
            </Button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b bg-muted/40 text-xs font-medium text-muted-foreground">
                <tr>
                  <th className="px-4 py-3">Name</th>
                  <th className="px-4 py-3">Image</th>
                  <th className="px-4 py-3">State</th>
                  <th className="px-4 py-3">Host Ports</th>
                  <th className="px-4 py-3">Persistence</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {containers.map((c) => {
                  const isRunning = c.state.toLowerCase() === "running";
                  const isExited = c.state.toLowerCase() === "exited";
                  const isCreated = c.state.toLowerCase() === "created";
                  const isStopping = stoppingId === c.containerId;
                  const endpoint = containerEndpoint(c);
                  const isSelected = selectedContainerId === c.containerId;

                  return (
                    <tr
                      key={c.containerId}
                      className={`hover:bg-muted/30 transition-colors cursor-pointer ${
                        isSelected ? "bg-muted/40" : ""
                      }`}
                      onClick={() =>
                        setSelectedContainerId(
                          isSelected ? null : c.containerId,
                        )
                      }
                    >
                      {/* Name & ID */}
                      <td className="px-4 py-3">
                        <div className="flex flex-col">
                          <span className="font-semibold text-foreground">
                            {c.name}
                          </span>
                          <div
                            className="flex items-center gap-1 text-xs text-muted-foreground font-mono"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <span>{c.containerId.slice(0, 12)}</span>
                            <button
                              type="button"
                              onClick={() => handleCopy(c.containerId)}
                              className="hover:text-foreground p-0.5"
                              title="Copy Container ID"
                              aria-label="Copy Container ID"
                            >
                              {copiedId === c.containerId ? (
                                <Check className="size-3 text-emerald-500" />
                              ) : (
                                <Copy className="size-3" />
                              )}
                            </button>
                          </div>
                        </div>
                      </td>

                      {/* Image */}
                      <td className="px-4 py-3 font-mono text-xs text-muted-foreground">
                        {c.image}
                      </td>

                      {/* State */}
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <Badge
                            variant="outline"
                            className={`capitalize ${getContainerStateBadgeClass(
                              c.state,
                            )}`}
                          >
                            {c.state}
                          </Badge>
                          {isStopping && (
                            <span className="text-xs text-amber-500 animate-pulse font-medium">
                              persisting…
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Host Ports */}
                      <td className="px-4 py-3 font-mono text-xs">
                        {c.hostPorts.length > 0
                          ? c.hostPorts.map((p) => `:${p}`).join(", ")
                          : "—"}
                      </td>

                      {/* Persistence */}
                      <td className="px-4 py-3">
                        {c.persists ? (
                          <Badge
                            variant="outline"
                            className="border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400 text-xs"
                          >
                            Persist image
                          </Badge>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </td>

                      {/* Actions */}
                      <td
                        className="px-4 py-3 text-right"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="size-8 p-0"
                              aria-label={`Actions for ${c.name}`}
                            >
                              <MoreHorizontal className="size-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem
                              onClick={() => startContainer(c.containerId)}
                              disabled={!isExited && !isCreated}
                            >
                              <Play className="mr-2 size-4 text-emerald-500" />
                              Start
                            </DropdownMenuItem>

                            <DropdownMenuItem
                              onClick={() => handleStopClick(c)}
                              disabled={!isRunning && !c.state.includes("paused")}
                            >
                              <Square className="mr-2 size-4 text-zinc-500" />
                              Stop
                            </DropdownMenuItem>

                            <DropdownMenuItem
                              onClick={() => handleRestartClick(c)}
                              disabled={!isRunning}
                            >
                              <RotateCw className="mr-2 size-4 text-blue-500" />
                              Restart
                            </DropdownMenuItem>

                            <DropdownMenuItem
                              onClick={() => connectContainer(c)}
                              disabled={!isRunning || !endpoint}
                            >
                              <Cable className="mr-2 size-4 text-purple-500" />
                              Connect
                            </DropdownMenuItem>

                            <DropdownMenuSeparator />

                            <DropdownMenuItem
                              onClick={() => setSelectedContainerId(c.containerId)}
                            >
                              <ScrollText className="mr-2 size-4" />
                              View details
                            </DropdownMenuItem>

                            <DropdownMenuSeparator />

                            <DropdownMenuItem
                              onClick={() =>
                                setRemoveDialog({
                                  container: c,
                                  removeVolumes: false,
                                  isRemoving: false,
                                })
                              }
                              className="text-destructive focus:text-destructive"
                            >
                              <Trash2 className="mr-2 size-4" />
                              Remove
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Selected Container Detail */}
      {selectedContainer && (
        <ContainerDetailPanel container={selectedContainer} />
      )}

      {/* Stop / Restart Warning Dialog */}
      {actionWarning && (
        <DeleteConfirmDialog
          open={Boolean(actionWarning)}
          onOpenChange={(open) => {
            if (!open) setActionWarning(null);
          }}
          title={`${actionWarning.action === "stop" ? "Stop" : "Restart"} ${
            actionWarning.container.name
          }?`}
          description="This container has no persistence volume — stopping destroys all LocalStack state."
          confirmLabel={actionWarning.action === "stop" ? "Stop" : "Restart"}
          onConfirm={async () => {
            const { container, action } = actionWarning;
            setActionWarning(null);
            if (action === "stop") {
              await executeStop(container);
            } else {
              await executeRestart(container);
            }
          }}
        />
      )}

      {/* Remove Container Dialog with Volumes checkbox */}
      {removeDialog && (
        <Dialog
          open={Boolean(removeDialog)}
          onOpenChange={(open) => {
            if (!open && !removeDialog.isRemoving) setRemoveDialog(null);
          }}
        >
          <DialogContent showCloseButton={!removeDialog.isRemoving}>
            <DialogHeader>
              <DialogTitle>Remove {removeDialog.container.name}?</DialogTitle>
              <DialogDescription>
                This will permanently delete the container.
              </DialogDescription>
            </DialogHeader>

            <div className="flex items-center gap-2 py-2">
              <input
                type="checkbox"
                id="remove-volumes-checkbox"
                checked={removeDialog.removeVolumes}
                onChange={(e) =>
                  setRemoveDialog({
                    ...removeDialog,
                    removeVolumes: e.target.checked,
                  })
                }
                className="size-4 rounded border-gray-300 text-primary focus:ring-primary cursor-pointer"
              />
              <label
                htmlFor="remove-volumes-checkbox"
                className="text-sm font-medium leading-none cursor-pointer"
              >
                Also delete named volumes
              </label>
            </div>

            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => setRemoveDialog(null)}
                disabled={removeDialog.isRemoving}
              >
                Cancel
              </Button>
              <Button
                variant="destructive"
                disabled={removeDialog.isRemoving}
                onClick={async () => {
                  setRemoveDialog({ ...removeDialog, isRemoving: true });
                  try {
                    await removeContainer(
                      removeDialog.container.containerId,
                      removeDialog.removeVolumes,
                    );
                    if (selectedContainerId === removeDialog.container.containerId) {
                      setSelectedContainerId(null);
                    }
                    setRemoveDialog(null);
                  } catch {
                    setRemoveDialog({ ...removeDialog, isRemoving: false });
                  }
                }}
              >
                {removeDialog.isRemoving ? "Removing…" : "Remove"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {/* Create Container Wizard */}
      <CreateContainerDialog
        open={isCreateOpen}
        onOpenChange={setIsCreateOpen}
        onCreate={createAndConnect}
        onCancelOperation={(sessionId) => adapter.cancelOperation(sessionId)}
      />
    </div>
  );
}
