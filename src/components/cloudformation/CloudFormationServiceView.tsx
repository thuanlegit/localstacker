import { useState } from "react";
import {
  CircleAlert,
  Layers,
  Loader2,
  MoreHorizontal,
  RotateCw,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
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
import { useStacks, useCloudFormationActions } from "@/hooks/use-cloudformation";
import { cn } from "@/lib/utils";

function StatusBadge({ status }: { status: string }) {
  const ok = status.endsWith("_COMPLETE");
  const bad = status.endsWith("_FAILED") || status === "ROLLBACK_COMPLETE";
  const tone = ok
    ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
    : bad
      ? "bg-destructive/15 text-destructive"
      : "bg-amber-500/15 text-amber-600 dark:text-amber-400";
  return (
    <span
      data-slot="badge"
      className={cn(
        "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium",
        tone,
      )}
    >
      {status.replace(/_/g, " ")}
    </span>
  );
}

export function CloudFormationServiceView() {
  const profile = useActiveProfile();
  const serviceStatus = useServiceStatus("cloudformation");
  const stacksQuery = useStacks(profile.id);
  const { deleteStack } = useCloudFormationActions();
  const { openTab } = useTabs();

  const [stackToDelete, setStackToDelete] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  if (serviceStatus === "disabled" || isServiceDisabledError(stacksQuery.error)) {
    return <ServiceDisabledView service="cloudformation" />;
  }

  const stacks = stacksQuery.data ?? [];

  const handleDelete = async () => {
    if (!stackToDelete) return;
    setIsDeleting(true);
    try {
      const ok = await deleteStack(stackToDelete);
      if (ok) setStackToDelete(null);
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
              <Layers className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-lg font-semibold">CloudFormation</h1>
              <p className="text-xs text-muted-foreground">Stacks & resources</p>
            </div>
          </div>

          <Button
            variant="outline"
            size="sm"
            onClick={() => stacksQuery.refetch()}
            disabled={stacksQuery.isFetching}
            title="Refresh stacks"
          >
            <RotateCw className={`h-4 w-4 ${stacksQuery.isFetching ? "animate-spin" : ""}`} />
            <span className="hidden sm:inline">Refresh</span>
          </Button>
        </div>
      </div>

      <div className="flex-1 overflow-auto">
        {stacksQuery.isPending ? (
          <div className="flex h-full items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : stacksQuery.error ? (
          <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
            <CircleAlert className="h-8 w-8 text-destructive" />
            <p className="text-sm font-medium">Failed to load stacks</p>
            <p className="text-xs text-muted-foreground">
              {stacksQuery.error instanceof Error
                ? stacksQuery.error.message
                : String(stacksQuery.error)}
            </p>
            <Button variant="outline" size="sm" onClick={() => stacksQuery.refetch()}>
              Retry
            </Button>
          </div>
        ) : stacks.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
            <Layers className="h-10 w-10 text-muted-foreground/50" />
            <div>
              <p className="text-sm font-medium">No stacks</p>
              <p className="text-xs text-muted-foreground">
                Deploy a stack through the CloudFormation API to inspect it here.
              </p>
            </div>
          </div>
        ) : (
          <table className="w-full text-left text-sm">
            <thead className="sticky top-0 bg-muted/50 backdrop-blur text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-6 py-3 font-medium">Name</th>
                <th className="px-6 py-3 font-medium">Status</th>
                <th className="px-6 py-3 font-medium">Created</th>
                <th className="px-6 py-3 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {stacks.map((s) => (
                <tr
                  key={s.stackId}
                  className="cursor-pointer transition-colors hover:bg-accent/50"
                  onClick={() =>
                    openTab({
                      id: `stack:${s.name}`,
                      kind: "stack",
                      stackName: s.name,
                      title: s.name,
                    })
                  }
                >
                  <td className="px-6 py-3">
                    <span className="font-mono text-xs sm:text-sm">{s.name}</span>
                  </td>
                  <td className="px-6 py-3">
                    <StatusBadge status={s.status} />
                  </td>
                  <td className="px-6 py-3 text-xs text-muted-foreground">
                    {s.creationDate ? s.creationDate.toLocaleDateString() : "—"}
                  </td>
                  <td className="px-6 py-3 text-right" onClick={(e) => e.stopPropagation()}>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon-sm" aria-label={`Actions for ${s.name}`} title={`Actions for ${s.name}`}>
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem
                          className="text-destructive focus:text-destructive"
                          onClick={() => setStackToDelete(s.name)}
                        >
                          <Trash2 className="mr-2 h-4 w-4" />
                          Delete stack
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

      <DeleteConfirmDialog
        open={Boolean(stackToDelete)}
        onOpenChange={(open) => !open && setStackToDelete(null)}
        title="Delete stack"
        description={`Delete stack “${stackToDelete ?? ""}”? All its resources will be removed.`}
        confirmLabel="Delete"
        isPending={isDeleting}
        onConfirm={handleDelete}
      />
    </div>
  );
}
