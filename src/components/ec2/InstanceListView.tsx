import { useState } from "react";
import {
  Server,
  Search,
  Plus,
  Play,
  Square,
  RotateCw,
  Trash2,
  Copy,
  Check,
  MoreHorizontal,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { DeleteConfirmDialog } from "@/components/DeleteConfirmDialog";
import { LaunchInstanceDialog } from "./LaunchInstanceDialog";
import { useInstances, useInstanceActions } from "@/hooks/use-ec2";
import type { InstanceSummary, InstanceStateName } from "@/lib/ec2";

function getStateBadgeClass(state: InstanceStateName): string {
  switch (state) {
    case "running":
      return "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20";
    case "stopped":
      return "bg-zinc-500/10 text-zinc-600 dark:text-zinc-400 border-zinc-500/20";
    case "pending":
    case "stopping":
    case "shutting-down":
      return "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20";
    case "terminated":
      return "bg-destructive/10 text-destructive border-destructive/20";
    default:
      return "";
  }
}

export function InstanceListView() {
  const [search, setSearch] = useState("");
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [isLaunchOpen, setIsLaunchOpen] = useState(false);
  const [instanceToTerminate, setInstanceToTerminate] =
    useState<InstanceSummary | null>(null);
  const [isTerminating, setIsTerminating] = useState(false);

  const { data: instances = [], isLoading } = useInstances();
  const {
    startInstance,
    stopInstance,
    rebootInstance,
    terminateInstance,
  } = useInstanceActions();

  const handleCopy = async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedId(text);
      toast.success(`${label} copied to clipboard`);
      setTimeout(() => setCopiedId(null), 2000);
    } catch {
      toast.error(`Failed to copy ${label}`);
    }
  };

  const handleTerminateConfirm = async () => {
    if (!instanceToTerminate) return;
    setIsTerminating(true);
    try {
      const ok = await terminateInstance(instanceToTerminate.instanceId);
      if (ok) {
        setInstanceToTerminate(null);
      }
    } finally {
      setIsTerminating(false);
    }
  };

  const filteredInstances = instances.filter((inst) => {
    const q = search.toLowerCase();
    return (
      inst.instanceId.toLowerCase().includes(q) ||
      (inst.name && inst.name.toLowerCase().includes(q)) ||
      inst.instanceType.toLowerCase().includes(q) ||
      inst.state.toLowerCase().includes(q) ||
      (inst.publicIpAddress && inst.publicIpAddress.includes(q)) ||
      (inst.privateIpAddress && inst.privateIpAddress.includes(q))
    );
  });

  return (
    <div className="flex flex-col gap-4">
      {/* Controls */}
      <div className="flex items-center justify-between gap-3">
        <div className="relative max-w-sm flex-1">
          <Search className="absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
          <Input
            placeholder="Filter instances by name, ID, type, state..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8"
          />
        </div>
        <Button onClick={() => setIsLaunchOpen(true)} className="gap-1.5">
          <Plus className="size-4" />
          Launch Instance
        </Button>
      </div>

      {/* Content */}
      {isLoading ? (
        <div className="flex h-48 items-center justify-center text-muted-foreground">
          Loading instances...
        </div>
      ) : filteredInstances.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-border p-12 text-center">
          <Server className="size-12 text-muted-foreground/40 mb-3" />
          <h3 className="text-base font-semibold">No EC2 instances found</h3>
          <p className="mt-1 text-sm text-muted-foreground max-w-sm">
            {search
              ? "No instances match your search filter."
              : "Launch a mock instance to simulate EC2 compute lifecycle."}
          </p>
          {!search && (
            <Button
              onClick={() => setIsLaunchOpen(true)}
              className="mt-4 gap-1.5"
              variant="outline"
            >
              <Plus className="size-4" />
              Launch Instance
            </Button>
          )}
        </div>
      ) : (
        <div className="rounded-md border">
          <table className="w-full text-left text-sm">
            <thead className="border-b bg-muted/40 text-xs font-medium text-muted-foreground">
              <tr>
                <th className="px-4 py-3">Name / Instance ID</th>
                <th className="px-4 py-3">State</th>
                <th className="px-4 py-3">Type</th>
                <th className="px-4 py-3">IP Addresses</th>
                <th className="px-4 py-3">Key Name</th>
                <th className="px-4 py-3">Security Groups</th>
                <th className="px-4 py-3">Launch Time</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {filteredInstances.map((inst) => {
                const isRunning = inst.state === "running";
                const isStopped = inst.state === "stopped";
                const isTerminated = inst.state === "terminated";
                const isTransitioning =
                  inst.state === "pending" ||
                  inst.state === "stopping" ||
                  inst.state === "shutting-down";

                return (
                  <tr
                    key={inst.instanceId}
                    className="hover:bg-muted/30 transition-colors"
                  >
                    {/* Name & ID */}
                    <td className="px-4 py-3">
                      <div className="flex flex-col">
                        <span className="font-semibold text-foreground">
                          {inst.name || "—"}
                        </span>
                        <div className="flex items-center gap-1.5 text-xs text-muted-foreground font-mono">
                          <span>{inst.instanceId}</span>
                          <button
                            type="button"
                            onClick={() =>
                              handleCopy(inst.instanceId, "Instance ID")
                            }
                            className="text-muted-foreground hover:text-foreground"
                            title="Copy Instance ID"
                          >
                            {copiedId === inst.instanceId ? (
                              <Check className="size-3 text-emerald-500" />
                            ) : (
                              <Copy className="size-3" />
                            )}
                          </button>
                        </div>
                      </div>
                    </td>

                    {/* State */}
                    <td className="px-4 py-3">
                      <Badge
                        variant="outline"
                        className={`capitalize ${getStateBadgeClass(
                          inst.state,
                        )}`}
                      >
                        {inst.state}
                      </Badge>
                    </td>

                    {/* Type */}
                    <td className="px-4 py-3 font-mono text-xs">
                      <Badge variant="secondary">{inst.instanceType}</Badge>
                    </td>

                    {/* IPs */}
                    <td className="px-4 py-3 font-mono text-xs">
                      <div className="flex flex-col gap-0.5">
                        {inst.publicIpAddress ? (
                          <div className="flex items-center gap-1">
                            <span className="text-muted-foreground">Pub:</span>
                            <span>{inst.publicIpAddress}</span>
                          </div>
                        ) : null}
                        {inst.privateIpAddress ? (
                          <div className="flex items-center gap-1">
                            <span className="text-muted-foreground">Priv:</span>
                            <span>{inst.privateIpAddress}</span>
                          </div>
                        ) : null}
                        {!inst.publicIpAddress && !inst.privateIpAddress && (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </div>
                    </td>

                    {/* Key Name */}
                    <td className="px-4 py-3">
                      {inst.keyName ? (
                        <Badge variant="outline">{inst.keyName}</Badge>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>

                    {/* Security Groups */}
                    <td className="px-4 py-3">
                      {inst.securityGroups.length > 0 ? (
                        <div className="flex flex-wrap gap-1 max-w-[180px]">
                          {inst.securityGroups.map((sg) => (
                            <Badge
                              key={sg.groupId}
                              variant="outline"
                              className="text-xs"
                              title={sg.groupId}
                            >
                              {sg.groupName || sg.groupId}
                            </Badge>
                          ))}
                        </div>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>

                    {/* Launch Time */}
                    <td className="px-4 py-3 text-xs text-muted-foreground">
                      {inst.launchTime
                        ? new Date(inst.launchTime).toLocaleString()
                        : "—"}
                    </td>

                    {/* Actions */}
                    <td className="px-4 py-3 text-right">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="size-8 p-0"
                            aria-label={`Actions for ${inst.instanceId}`}
                          >
                            <MoreHorizontal className="size-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem
                            onClick={() => startInstance(inst.instanceId)}
                            disabled={isRunning || isTerminated || isTransitioning}
                          >
                            <Play className="mr-2 size-4 text-emerald-500" />
                            Start Instance
                          </DropdownMenuItem>

                          <DropdownMenuItem
                            onClick={() => stopInstance(inst.instanceId)}
                            disabled={isStopped || isTerminated || isTransitioning}
                          >
                            <Square className="mr-2 size-4 text-zinc-500" />
                            Stop Instance
                          </DropdownMenuItem>

                          <DropdownMenuItem
                            onClick={() => rebootInstance(inst.instanceId)}
                            disabled={!isRunning}
                          >
                            <RotateCw className="mr-2 size-4 text-blue-500" />
                            Reboot Instance
                          </DropdownMenuItem>

                          <DropdownMenuSeparator />

                          <DropdownMenuItem
                            onClick={() =>
                              handleCopy(inst.instanceId, "Instance ID")
                            }
                          >
                            <Copy className="mr-2 size-4" />
                            Copy Instance ID
                          </DropdownMenuItem>

                          <DropdownMenuSeparator />

                          <DropdownMenuItem
                            onClick={() => setInstanceToTerminate(inst)}
                            disabled={isTerminated}
                            className="text-destructive focus:text-destructive"
                          >
                            <Trash2 className="mr-2 size-4" />
                            Terminate Instance
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

      {/* Launch Instance Modal */}
      <LaunchInstanceDialog
        open={isLaunchOpen}
        onOpenChange={setIsLaunchOpen}
      />

      {/* Terminate Instance Confirmation Modal */}
      <DeleteConfirmDialog
        open={Boolean(instanceToTerminate)}
        onOpenChange={(open) => !open && setInstanceToTerminate(null)}
        title="Terminate Instance"
        description={`Are you sure you want to terminate instance ${
          instanceToTerminate?.name
            ? `${instanceToTerminate.name} (${instanceToTerminate.instanceId})`
            : instanceToTerminate?.instanceId ?? ""
        }? Any ephemeral data will be lost.`}
        confirmLabel="Terminate"
        onConfirm={handleTerminateConfirm}
        isPending={isTerminating}
      />
    </div>
  );
}
