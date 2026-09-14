import { useState } from "react";
import {
  CircleAlert,
  Check,
  Copy,
  Loader2,
  Play,
  RotateCw,
  Square,
  Trash2,
  Workflow,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { DeleteConfirmDialog } from "@/components/DeleteConfirmDialog";
import { ServiceDisabledView } from "@/components/ServiceDisabledView";
import { isServiceDisabledError, useServiceStatus } from "@/hooks/use-health";
import { useActiveProfile } from "@/store/profiles";
import { useTabs } from "@/store/tabs";
import {
  useStateMachine,
  useExecutions,
  useExecutionHistory,
  useSfnActions,
} from "@/hooks/use-sfn";
import { AslGraph } from "./AslGraph";
import type { ExecutionSummary } from "@/lib/sfn";

interface StateMachineViewProps {
  stateMachineArn: string;
}

function statusBadgeVariant(
  status: string,
): "default" | "secondary" | "destructive" | "outline" {
  if (status === "SUCCEEDED") return "default";
  if (status === "FAILED" || status === "TIMED_OUT" || status === "ABORTED") {
    return "destructive";
  }
  if (status === "RUNNING") return "secondary";
  return "outline";
}

interface StartExecutionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  stateMachineArn: string;
}

function StartExecutionDialog({
  open,
  onOpenChange,
  stateMachineArn,
}: StartExecutionDialogProps) {
  const [inputJson, setInputJson] = useState("");
  const [inputError, setInputError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { startExecution } = useSfnActions();

  const handleInputChange = (val: string) => {
    setInputJson(val);
    if (inputError) setInputError(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;

    let input: string | undefined = undefined;
    if (inputJson.trim()) {
      try {
        JSON.parse(inputJson);
        input = inputJson;
      } catch {
        setInputError("Input must be valid JSON");
        return;
      }
    }

    setIsSubmitting(true);
    try {
      const executionArn = await startExecution({ stateMachineArn, input });
      if (executionArn) {
        setInputJson("");
        setInputError(null);
        onOpenChange(false);
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl">
        <form onSubmit={handleSubmit} className="min-w-0">
          <DialogHeader>
            <DialogTitle>Start execution</DialogTitle>
            <DialogDescription>
              Run this state machine with a JSON input payload.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4 min-w-0">
            <div className="space-y-2">
              <Label htmlFor="execution-input">Input (JSON, optional)</Label>
              <textarea
                id="execution-input"
                className="flex min-h-[140px] w-full rounded-md border border-input bg-background px-3 py-2 text-xs font-mono ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                value={inputJson}
                onChange={(e) => handleInputChange(e.target.value)}
                placeholder='{ "value": 1 }'
              />
              {inputError ? (
                <p className="text-xs text-destructive">{inputError}</p>
              ) : (
                <p className="text-xs text-muted-foreground">
                  Passed to the state machine as <code>States.Input</code>.
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
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? "Starting..." : "Start execution"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function StateMachineView({ stateMachineArn }: StateMachineViewProps) {
  const profile = useActiveProfile();
  const serviceStatus = useServiceStatus("sfn");
  const { closeTab } = useTabs();

  const {
    data: machine,
    isPending,
    error,
    refetch: refetchMachine,
  } = useStateMachine(profile.id, stateMachineArn);
  const {
    data: executions,
    isPending: isExecutionsPending,
    error: executionsError,
    refetch: refetchExecutions,
    isFetching: isExecutionsFetching,
  } = useExecutions(profile.id, stateMachineArn);
  const { deleteStateMachine, stopExecution } = useSfnActions();

  const [hasCopiedArn, setHasCopiedArn] = useState(false);
  const [isStartOpen, setIsStartOpen] = useState(false);
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [selectedExecution, setSelectedExecution] = useState<ExecutionSummary | null>(
    null,
  );

  const {
    data: history,
    isPending: isHistoryPending,
  } = useExecutionHistory(
    profile.id,
    selectedExecution?.executionArn ?? "",
    { enabled: Boolean(selectedExecution) },
  );

  if (serviceStatus === "disabled" || (error && isServiceDisabledError(error))) {
    return <ServiceDisabledView service="sfn" />;
  }

  const handleCopyArn = async () => {
    try {
      await navigator.clipboard.writeText(stateMachineArn);
      setHasCopiedArn(true);
      toast.success("ARN copied");
      setTimeout(() => setHasCopiedArn(false), 2000);
    } catch {
      toast.error("Failed to copy ARN");
    }
  };

  const handleRefresh = () => {
    refetchMachine();
    refetchExecutions();
  };

  const handleDelete = async () => {
    setIsDeleting(true);
    try {
      const ok = await deleteStateMachine(stateMachineArn, machine?.name);
      if (ok) {
        closeTab(`stateMachine:${stateMachineArn}`);
      }
    } finally {
      setIsDeleting(false);
    }
  };

  const handleStop = async (execution: ExecutionSummary) => {
    await stopExecution(execution.executionArn, "Stopped from LocalStacker");
  };

  const selectState = (name: string) => {
    document
      .getElementById(`asl-state-${name}`)
      ?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  if (isPending) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
        <CircleAlert className="h-8 w-8 text-destructive" />
        <p className="text-sm font-medium">Failed to load state machine</p>
        <p className="text-xs text-muted-foreground">
          {error instanceof Error ? error.message : String(error)}
        </p>
        <Button variant="outline" size="sm" onClick={() => refetchMachine()}>
          Retry
        </Button>
      </div>
    );
  }

  // Per-state definition sections; falls back to the raw blob when the
  // returned definition is not parseable JSON.
  let definitionStates: Array<{ name: string; json: string }> | null = null;
  let startAt: string | null = null;
  if (machine?.definition) {
    try {
      const parsed = JSON.parse(machine.definition) as {
        StartAt?: string;
        States?: Record<string, unknown>;
      };
      startAt = parsed.StartAt ?? null;
      definitionStates = Object.entries(parsed.States ?? {}).map(([name, state]) => ({
        name,
        json: JSON.stringify(state, null, 2),
      }));
    } catch {
      definitionStates = null;
    }
  }

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="border-b px-6 py-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Workflow className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-lg font-semibold">{machine?.name ?? "State machine"}</h1>
              <div className="flex items-center gap-1.5 mt-0.5">
                <span className="font-mono text-xs text-muted-foreground truncate max-w-sm sm:max-w-md">
                  {stateMachineArn}
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
              title="Refresh state machine"
            >
              <RotateCw className="h-4 w-4" />
              <span className="hidden sm:inline">Refresh</span>
            </Button>
            <Button size="sm" onClick={() => setIsStartOpen(true)}>
              <Play className="h-4 w-4" />
              Start execution
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
      </div>

      {/* Panes */}
      <div className="flex-1 space-y-4 overflow-auto p-6">
        <div className="grid gap-4 lg:grid-cols-2">
          {/* Graph */}
          <section className="rounded-lg border bg-card">
            <div className="border-b px-4 py-2.5">
              <h2 className="text-sm font-medium">State graph</h2>
            </div>
            <div className="h-64 p-2">
              {machine?.definition ? (
                <AslGraph definition={machine.definition} onSelectState={selectState} />
              ) : (
                <p className="flex h-full items-center justify-center text-xs text-muted-foreground">
                  No definition available
                </p>
              )}
            </div>
          </section>

          {/* Executions */}
          <section className="rounded-lg border bg-card">
            <div className="flex items-center justify-between border-b px-4 py-2.5">
              <h2 className="text-sm font-medium">Executions</h2>
              {isExecutionsFetching && (
                <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
              )}
            </div>
            <div className="max-h-64 overflow-auto">
              {isExecutionsPending ? (
                <div className="flex items-center justify-center py-10">
                  <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                </div>
              ) : executionsError ? (
                <p className="px-4 py-6 text-center text-xs text-destructive">
                  {executionsError instanceof Error
                    ? executionsError.message
                    : String(executionsError)}
                </p>
              ) : !executions || executions.length === 0 ? (
                <p className="px-4 py-6 text-center text-xs text-muted-foreground">
                  No executions yet. Start one to test the state machine.
                </p>
              ) : (
                <table className="w-full text-left text-sm">
                  <thead className="sticky top-0 bg-muted/50 text-xs uppercase tracking-wide text-muted-foreground">
                    <tr>
                      <th className="px-4 py-2 font-medium">Name</th>
                      <th className="px-4 py-2 font-medium">Status</th>
                      <th className="px-4 py-2 font-medium">Started</th>
                      <th className="px-4 py-2 font-medium text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {executions.map((execution) => (
                      <tr
                        key={execution.executionArn}
                        className={`cursor-pointer transition-colors hover:bg-accent/50 ${
                          selectedExecution?.executionArn === execution.executionArn
                            ? "bg-accent/30"
                            : ""
                        }`}
                        onClick={() => setSelectedExecution(execution)}
                      >
                        <td className="px-4 py-2 font-mono text-xs">{execution.name}</td>
                        <td className="px-4 py-2">
                          <Badge
                            variant={statusBadgeVariant(execution.status)}
                            className="text-xs"
                          >
                            {execution.status}
                          </Badge>
                        </td>
                        <td className="px-4 py-2 text-xs text-muted-foreground">
                          {new Date(execution.startDate).toLocaleString()}
                        </td>
                        <td className="px-4 py-2 text-right" onClick={(e) => e.stopPropagation()}>
                          {execution.status === "RUNNING" && (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 px-2 text-xs"
                              onClick={() => handleStop(execution)}
                            >
                              <Square className="mr-1 h-3 w-3" />
                              Stop
                            </Button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </section>
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          {/* Definition */}
          <section className="rounded-lg border bg-card">
            <div className="flex items-center justify-between border-b px-4 py-2.5">
              <h2 className="text-sm font-medium">Definition (ASL)</h2>
              {startAt && (
                <Badge variant="outline" className="font-mono text-xs">
                  StartAt: {startAt}
                </Badge>
              )}
            </div>
            <div className="max-h-[420px] space-y-3 overflow-auto p-4">
              {definitionStates ? (
                definitionStates.map((state) => (
                  <div
                    key={state.name}
                    id={`asl-state-${state.name}`}
                    className="scroll-mt-4 rounded-md border p-3"
                  >
                    <div className="mb-2 flex items-center gap-2">
                      <span className="font-mono text-xs font-semibold">{state.name}</span>
                    </div>
                    <pre className="overflow-auto rounded bg-muted/50 p-2 font-mono text-xs">
                      {state.json}
                    </pre>
                  </div>
                ))
              ) : (
                <pre className="overflow-auto rounded bg-muted/50 p-2 font-mono text-xs">
                  {machine?.definition ?? "No definition"}
                </pre>
              )}
            </div>
          </section>

          {/* Event history */}
          <section className="rounded-lg border bg-card">
            <div className="border-b px-4 py-2.5">
              <h2 className="text-sm font-medium">
                Event history
                {selectedExecution ? (
                  <span className="ml-2 font-mono text-xs text-muted-foreground">
                    {selectedExecution.name}
                  </span>
                ) : null}
              </h2>
            </div>
            <div className="max-h-[420px] overflow-auto p-4">
              {!selectedExecution ? (
                <p className="py-6 text-center text-xs text-muted-foreground">
                  Select an execution to inspect its event history.
                </p>
              ) : isHistoryPending ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                </div>
              ) : !history || history.length === 0 ? (
                <p className="py-6 text-center text-xs text-muted-foreground">
                  No events recorded.
                </p>
              ) : (
                <ol className="space-y-3">
                  {history.map((event, i) => (
                    <li key={i} className="flex gap-3 text-xs">
                      <span
                        className="mt-1 h-2 w-2 shrink-0 rounded-full bg-primary/60"
                        aria-hidden
                      />
                      <div className="min-w-0">
                        <p className="font-medium">{event.type}</p>
                        <p className="text-muted-foreground">
                          {new Date(event.timestamp).toLocaleString()}
                          {event.previousEventId !== undefined &&
                            ` · after event #${event.previousEventId}`}
                        </p>
                      </div>
                    </li>
                  ))}
                </ol>
              )}
            </div>
          </section>
        </div>
      </div>

      <StartExecutionDialog
        open={isStartOpen}
        onOpenChange={setIsStartOpen}
        stateMachineArn={stateMachineArn}
      />

      <DeleteConfirmDialog
        open={Boolean(isDeleteOpen)}
        onOpenChange={(open) => !open && setIsDeleteOpen(false)}
        title="Delete state machine"
        description={`Are you sure you want to delete state machine “${machine?.name ?? ""}”? Running executions will be aborted.`}
        confirmLabel="Delete"
        isPending={isDeleting}
        onConfirm={handleDelete}
      />
    </div>
  );
}
