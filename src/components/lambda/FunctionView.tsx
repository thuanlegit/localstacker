import { useState, useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  Check,
  CircleAlert,
  Copy,
  Loader2,
  Maximize2,
  Play,
  Plus,
  Power,
  Radio,
  RotateCw,
  ScrollText,
  Trash2,
  Variable,
  X,
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
import { DeleteConfirmDialog } from "@/components/DeleteConfirmDialog";
import { ServiceDisabledView } from "@/components/ServiceDisabledView";
import { isServiceDisabledError, useServiceStatus } from "@/hooks/use-health";
import { useActiveProfile } from "@/store/profiles";
import { useTabs } from "@/store/tabs";
import {
  lambdaKeys,
  useFunctions,
  useFunctionConfig,
  useLambdaClient,
  useEventSourceMappings,
  useEventSourceMappingActions,
} from "@/hooks/use-lambda";
import {
  invokeFunction,
  updateFunctionEnvVars,
  type InvocationResult,
  type EventSourceMappingSummary,
} from "@/lib/lambda";
import { formatBytes, formatDate } from "@/lib/format";
import { AddTriggerDialog } from "./AddTriggerDialog";

function toErrorMessage(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

interface InvokeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  functionName: string;
}

function InvokeDialog({ open, onOpenChange, functionName }: InvokeDialogProps) {
  const [payload, setPayload] = useState("{}");
  const [isInvoking, setIsInvoking] = useState(false);
  const [invokeResult, setInvokeResult] = useState<InvocationResult | null>(null);
  const [invokeError, setInvokeError] = useState<string | null>(null);
  const [isLogsExpanded, setIsLogsExpanded] = useState(false);
  const [copiedLogs, setCopiedLogs] = useState(false);

  const handleCopyLogs = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedLogs(true);
      toast.success("Logs copied to clipboard");
      setTimeout(() => setCopiedLogs(false), 2000);
    } catch {
      toast.error("Failed to copy logs");
    }
  };

  const handleOpenLogsTab = () => {
    onOpenChange(false);
    useTabs.getState().openTab({
      id: `logGroup:/aws/lambda/${functionName}`,
      kind: "logGroup",
      logGroupName: `/aws/lambda/${functionName}`,
      title: `/aws/lambda/${functionName}`,
    });
  };
  const client = useLambdaClient();

  let isValidJson = false;
  try {
    JSON.parse(payload);
    isValidJson = true;
  } catch {
    isValidJson = false;
  }

  const showError = payload.trim().length > 0 && !isValidJson;

  const handleInvoke = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isValidJson || isInvoking) return;

    setIsInvoking(true);
    setInvokeError(null);
    try {
      const res = await invokeFunction(client, {
        functionName,
        payload,
      });
      setInvokeResult(res);
    } catch (err) {
      setInvokeError(toErrorMessage(err));
      setInvokeResult(null);
    } finally {
      setIsInvoking(false);
    }
  };

  const formatPayloadDisplay = (text: string) => {
    try {
      const parsed = JSON.parse(text);
      return JSON.stringify(parsed, null, 2);
    } catch {
      return text;
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] sm:max-w-2xl max-w-2xl overflow-y-auto">
        <form onSubmit={handleInvoke} className="min-w-0">
          <DialogHeader>
            <DialogTitle>Invoke {functionName}</DialogTitle>
            <DialogDescription>
              Execute the function with a test payload.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="invoke-payload">Payload (JSON)</Label>
              <textarea
                id="invoke-payload"
                value={payload}
                onChange={(e) => setPayload(e.target.value)}
                placeholder="{}"
                className="flex min-h-[160px] w-full rounded-md border border-input bg-transparent px-3 py-2 font-mono text-sm shadow-xs placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              />
              {showError && (
                <p className="text-xs text-destructive">
                  Payload must be valid JSON
                </p>
              )}
            </div>

            {invokeError && (
              <div className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive">
                {invokeError}
              </div>
            )}

            {invokeResult && (
              <div className="space-y-3 rounded-lg border p-4">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b pb-2 text-xs">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold">
                      {invokeResult.statusCode ?? "—"}
                    </span>
                    <span>·</span>
                    <span className="text-muted-foreground">
                      {invokeResult.durationMs} ms
                    </span>
                    <span>·</span>
                    <span className="text-muted-foreground">
                      version {invokeResult.executedVersion ?? "—"}
                    </span>
                  </div>
                  {invokeResult.functionError && (
                    <Badge variant="destructive">
                      {invokeResult.functionError}
                    </Badge>
                  )}
                </div>

                <div className="space-y-1">
                  <span className="text-xs font-semibold uppercase text-muted-foreground">
                    Response
                  </span>
                  <pre className="max-h-48 overflow-auto whitespace-pre-wrap break-all rounded-md bg-muted/50 p-2 font-mono text-xs">
                    {formatPayloadDisplay(invokeResult.payload)}
                  </pre>
                </div>

                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold uppercase text-muted-foreground">
                      Logs (last 4 KB)
                    </span>
                    {invokeResult.logs !== undefined && (
                      <div className="flex items-center gap-1">
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-6 px-2 text-xs text-muted-foreground hover:text-foreground gap-1"
                          onClick={() => handleCopyLogs(invokeResult.logs!)}
                        >
                          {copiedLogs ? (
                            <Check className="size-3 text-emerald-500" />
                          ) : (
                            <Copy className="size-3" />
                          )}
                          Copy
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-6 px-2 text-xs text-muted-foreground hover:text-foreground gap-1"
                          onClick={() => setIsLogsExpanded(!isLogsExpanded)}
                        >
                          <Maximize2 className="size-3" />
                          {isLogsExpanded ? "Collapse" : "Expand"}
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="h-6 px-2 text-xs gap-1 text-primary hover:text-primary"
                          onClick={handleOpenLogsTab}
                        >
                          <ScrollText className="size-3" />
                          CloudWatch Logs
                        </Button>
                      </div>
                    )}
                  </div>
                  {invokeResult.logs !== undefined ? (
                    <pre
                      className={`overflow-auto whitespace-pre-wrap break-all rounded-md bg-muted/50 p-2.5 font-mono text-xs ${
                        isLogsExpanded ? "max-h-[50vh]" : "max-h-48"
                      }`}
                    >
                      {invokeResult.logs}
                    </pre>
                  ) : (
                    <p className="text-xs text-muted-foreground">
                      Logs unavailable for this invocation (LocalStack returns
                      logs via LogType=Tail)
                    </p>
                  )}
                </div>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              Close
            </Button>
            <Button type="submit" disabled={!isValidJson || isInvoking}>
              {isInvoking ? (
                <Loader2 className="mr-1.5 size-4 animate-spin" />
              ) : (
                <Play className="mr-1.5 size-4" />
              )}
              Invoke
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

interface EnvVarsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  functionName: string;
  initialEnvVars: Record<string, string>;
}

interface EnvRow {
  id: string;
  key: string;
  value: string;
}

function EnvVarsDialog({
  open,
  onOpenChange,
  functionName,
  initialEnvVars,
}: EnvVarsDialogProps) {
  const [rows, setRows] = useState<EnvRow[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const client = useLambdaClient();
  const profile = useActiveProfile();
  const queryClient = useQueryClient();

  useEffect(() => {
    if (open) {
      const entries = Object.entries(initialEnvVars);
      if (entries.length === 0) {
        setRows([{ id: "1", key: "", value: "" }]);
      } else {
        setRows(
          entries.map(([k, v], idx) => ({
            id: String(idx + 1),
            key: k,
            value: v,
          })),
        );
      }
    }
  }, [open, initialEnvVars]);

  // Check for duplicates
  const nonEmptyKeys = rows
    .map((r) => r.key.trim())
    .filter((k) => k.length > 0);
  const keySet = new Set<string>();
  let hasDuplicate = false;
  for (const k of nonEmptyKeys) {
    if (keySet.has(k)) {
      hasDuplicate = true;
      break;
    }
    keySet.add(k);
  }

  // Check if any row has value but blank key
  const hasValueWithBlankKey = rows.some(
    (r) => r.key.trim().length === 0 && r.value.trim().length > 0,
  );

  const canSubmit = !hasDuplicate && !hasValueWithBlankKey && !isSubmitting;

  const handleAddRow = () => {
    setRows((prev) => [
      ...prev,
      { id: String(Date.now() + Math.random()), key: "", value: "" },
    ]);
  };

  const handleRemoveRow = (id: string) => {
    setRows((prev) => prev.filter((r) => r.id !== id));
  };

  const handleChangeRow = (id: string, field: "key" | "value", val: string) => {
    setRows((prev) =>
      prev.map((r) => (r.id === id ? { ...r, [field]: val } : r)),
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;

    setIsSubmitting(true);
    try {
      const envVars: Record<string, string> = {};
      for (const r of rows) {
        const k = r.key.trim();
        if (k.length > 0) {
          envVars[k] = r.value;
        }
      }

      await updateFunctionEnvVars(client, {
        functionName,
        envVars,
      });
      await queryClient.invalidateQueries({
        queryKey: lambdaKeys.config(profile.id, functionName),
      });
      toast.success(`Environment variables updated for ${functionName}`);
      onOpenChange(false);
    } catch (err) {
      toast.error(toErrorMessage(err));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] sm:max-w-xl max-w-xl overflow-y-auto">
        <form onSubmit={handleSubmit} className="min-w-0">
          <DialogHeader>
            <DialogTitle>Edit environment variables</DialogTitle>
            <DialogDescription>
              Replaces the full environment — omitted keys are removed.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 py-4">
            {hasDuplicate && (
              <p className="text-xs text-destructive">Duplicate key</p>
            )}
            {hasValueWithBlankKey && (
              <p className="text-xs text-destructive">
                Variables with values must have a key
              </p>
            )}

            <div className="space-y-2">
              {rows.map((row, idx) => (
                <div key={row.id} className="flex items-center gap-2">
                  <Input
                    placeholder="Key"
                    value={row.key}
                    onChange={(e) =>
                      handleChangeRow(row.id, "key", e.target.value)
                    }
                    className="font-mono text-xs"
                    aria-label={`Key ${idx + 1}`}
                  />
                  <Input
                    placeholder="Value"
                    value={row.value}
                    onChange={(e) =>
                      handleChangeRow(row.id, "value", e.target.value)
                    }
                    className="font-mono text-xs"
                    aria-label={`Value ${idx + 1}`}
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="size-8 shrink-0 text-muted-foreground hover:text-destructive"
                    onClick={() => handleRemoveRow(row.id)}
                    aria-label={`Remove variable ${idx + 1}`}
                  >
                    <X className="size-4" />
                  </Button>
                </div>
              ))}
            </div>

            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={handleAddRow}
              className="text-xs"
            >
              <Plus className="mr-1.5 size-3.5" />
              Add variable
            </Button>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={!canSubmit}>
              {isSubmitting && (
                <Loader2 className="mr-1.5 size-4 animate-spin" />
              )}
              Save variables
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function FunctionView({ functionName }: { functionName: string }) {
  const profile = useActiveProfile();
  const serviceStatus = useServiceStatus("lambda");

  const {
    data: functions,
    isPending: isFnsPending,
    error: fnsError,
    refetch: refetchFns,
    isFetching: isFnsFetching,
  } = useFunctions(profile.id, {
    enabled: serviceStatus !== "disabled",
  });

  const {
    data: config,
    isPending: isConfigPending,
    error: configError,
    refetch: refetchConfig,
  } = useFunctionConfig(functionName, {
    enabled: serviceStatus !== "disabled" && !!functionName,
  });

  const [isInvokeOpen, setIsInvokeOpen] = useState(false);
  const [isEnvOpen, setIsEnvOpen] = useState(false);
  const [isAddTriggerOpen, setIsAddTriggerOpen] = useState(false);
  const [triggerToDelete, setTriggerToDelete] =
    useState<EventSourceMappingSummary | null>(null);
  const [isDeletingTrigger, setIsDeletingTrigger] = useState(false);
  const [togglingUuid, setTogglingUuid] = useState<string | null>(null);

  const {
    data: triggers,
    isLoading: isTriggersLoading,
    refetch: refetchTriggers,
  } = useEventSourceMappings(
    { functionName },
    { enabled: serviceStatus !== "disabled" && !!functionName },
  );
  const { deleteMapping, updateMapping } = useEventSourceMappingActions();

  const handleToggleTrigger = async (trigger: EventSourceMappingSummary) => {
    const nextEnabled = trigger.state !== "Enabled";
    setTogglingUuid(trigger.uuid);
    try {
      await updateMapping({
        uuid: trigger.uuid,
        functionName,
        enabled: nextEnabled,
      });
    } finally {
      setTogglingUuid(null);
    }
  };

  const handleDeleteTrigger = async () => {
    if (!triggerToDelete) return;
    setIsDeletingTrigger(true);
    try {
      await deleteMapping(triggerToDelete.uuid);
      setTriggerToDelete(null);
    } finally {
      setIsDeletingTrigger(false);
    }
  };

  if (
    serviceStatus === "disabled" ||
    isServiceDisabledError(fnsError) ||
    isServiceDisabledError(configError)
  ) {
    return (
      <ServiceDisabledView
        service="lambda"
        onRetry={() => {
          refetchFns();
          refetchConfig();
        }}
        isChecking={isFnsFetching}
      />
    );
  }

  if (isFnsPending) {
    return (
      <div className="flex flex-1 items-center justify-center p-8">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const fnSummary = functions?.find((f) => f.name === functionName);

  if (!fnSummary) {
    return (
      <div className="flex h-full flex-1 flex-col items-center justify-center gap-3 p-4 text-center">
        <CircleAlert className="size-8 text-destructive" />
        <p className="text-sm text-muted-foreground">
          Function not found — it may have been deleted.
        </p>
      </div>
    );
  }

  const envVars = config?.envVars ?? {};
  const envVarEntries = Object.entries(envVars);

  return (
    <div className="flex h-full flex-col overflow-auto">
      {/* Header */}
      <div className="flex items-start justify-between border-b px-4 py-3">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <Zap className="size-4 text-muted-foreground" />
            <h2 className="text-sm font-semibold">{fnSummary.name}</h2>
            {fnSummary.runtime && (
              <Badge variant="outline" className="px-1.5 py-0 text-[10px]">
                {fnSummary.runtime}
              </Badge>
            )}
            {config?.state && (
              <Badge variant="secondary" className="px-1.5 py-0 text-[10px]">
                {config.state}
              </Badge>
            )}
          </div>
          {fnSummary.description && (
            <p className="text-xs text-muted-foreground">
              {fnSummary.description}
            </p>
          )}
          {config?.role && (
            <p className="font-mono text-xs text-muted-foreground">
              Role: {config.role}
            </p>
          )}
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() =>
              useTabs.getState().openTab({
                id: `logGroup:/aws/lambda/${functionName}`,
                kind: "logGroup",
                logGroupName: `/aws/lambda/${functionName}`,
                title: `/aws/lambda/${functionName}`,
              })
            }
          >
            <ScrollText className="mr-1.5 size-3.5" />
            View logs
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={() => setIsEnvOpen(true)}
          >
            <Variable className="mr-1.5 size-3.5" />
            Edit env vars
          </Button>

          <Button size="sm" onClick={() => setIsInvokeOpen(true)}>
            <Play className="mr-1.5 size-3.5" />
            Invoke
          </Button>
        </div>
      </div>

      {/* Main content */}
      <div className="space-y-6 p-4">
        {/* Configuration details */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase text-muted-foreground">
              Configuration
            </span>
            <Button
              variant="ghost"
              size="icon"
              className="size-7"
              aria-label="Refresh config"
              onClick={() => refetchConfig()}
            >
              <RotateCw className="size-3.5" />
            </Button>
          </div>

          {isConfigPending ? (
            <div className="flex justify-center p-4">
              <Loader2 className="size-5 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-4 rounded-lg border p-4 sm:grid-cols-4">
              <div>
                <span className="text-xs text-muted-foreground">Handler</span>
                <p className="font-mono text-xs font-medium">
                  {config?.handler || fnSummary.handler || "—"}
                </p>
              </div>
              <div>
                <span className="text-xs text-muted-foreground">Timeout</span>
                <p className="font-mono text-xs font-medium">
                  {config?.timeoutSeconds ?? 3}s
                </p>
              </div>
              <div>
                <span className="text-xs text-muted-foreground">Memory</span>
                <p className="font-mono text-xs font-medium">
                  {config?.memorySize ?? 128} MB
                </p>
              </div>
              <div>
                <span className="text-xs text-muted-foreground">Code size</span>
                <p className="font-mono text-xs font-medium">
                  {fnSummary.codeSize !== undefined
                    ? formatBytes(fnSummary.codeSize)
                    : "—"}
                </p>
              </div>
              <div>
                <span className="text-xs text-muted-foreground">
                  Last modified
                </span>
                <p className="font-mono text-xs font-medium">
                  {formatDate(fnSummary.lastModified ?? config?.lastModified)}
                </p>
              </div>
              <div>
                <span className="text-xs text-muted-foreground">
                  Environment variables
                </span>
                <p className="font-mono text-xs font-medium">
                  {envVarEntries.length} configured
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Environment variables list */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold uppercase text-muted-foreground">
                Environment Variables
              </span>
              <Badge variant="secondary" className="font-mono text-xs">
                {envVarEntries.length}
              </Badge>
            </div>
          </div>

          {envVarEntries.length === 0 ? (
            <div className="rounded-md border p-4 text-xs text-muted-foreground">
              No environment variables defined.
            </div>
          ) : (
            <div className="rounded-md border">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-border/40 text-xs font-semibold uppercase text-muted-foreground">
                    <th className="w-1/3 px-3 py-2 font-medium">Key</th>
                    <th className="px-3 py-2 font-medium">Value</th>
                  </tr>
                </thead>
                <tbody>
                  {envVarEntries.map(([key, val]) => (
                    <tr
                      key={key}
                      className="border-b border-border/20 last:border-0"
                    >
                      <td className="px-3 py-2 font-mono text-xs font-medium">
                        {key}
                      </td>
                      <td className="break-all px-3 py-2 font-mono text-xs text-muted-foreground">
                        {val}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Event Source Mappings / Triggers */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold uppercase text-muted-foreground">
                Triggers & Event Sources
              </span>
              <Badge variant="secondary" className="font-mono text-xs">
                {triggers?.length ?? 0}
              </Badge>
            </div>
            <div className="flex items-center gap-1.5">
              <Button
                variant="ghost"
                size="icon"
                className="size-7"
                aria-label="Refresh triggers"
                onClick={() => refetchTriggers()}
              >
                <RotateCw className="size-3.5" />
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="h-7 text-xs"
                onClick={() => setIsAddTriggerOpen(true)}
              >
                <Plus className="mr-1.5 size-3.5" />
                Add trigger
              </Button>
            </div>
          </div>

          {isTriggersLoading ? (
            <div className="flex justify-center p-4">
              <Loader2 className="size-5 animate-spin text-muted-foreground" />
            </div>
          ) : !triggers || triggers.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-lg border border-dashed p-6 text-center">
              <Radio className="size-6 text-muted-foreground mb-2" />
              <p className="text-xs font-medium text-foreground">
                No event source triggers configured
              </p>
              <p className="mt-1 text-xs text-muted-foreground max-w-sm">
                Attach an SQS queue to invoke this Lambda function automatically whenever messages arrive.
              </p>
              <Button
                variant="outline"
                size="sm"
                className="mt-3 text-xs"
                onClick={() => setIsAddTriggerOpen(true)}
              >
                <Plus className="mr-1.5 size-3.5" />
                Add SQS Trigger
              </Button>
            </div>
          ) : (
            <div className="rounded-md border">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-border/40 text-xs font-semibold uppercase text-muted-foreground">
                    <th className="px-3 py-2 font-medium">Source</th>
                    <th className="px-3 py-2 font-medium">Batch Size</th>
                    <th className="px-3 py-2 font-medium">Batch Window</th>
                    <th className="px-3 py-2 font-medium">Status</th>
                    <th className="px-3 py-2 font-medium text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {triggers.map((trigger) => {
                    const isEnabled = trigger.state === "Enabled";
                    const isToggling = togglingUuid === trigger.uuid;

                    return (
                      <tr
                        key={trigger.uuid}
                        className="border-b border-border/20 last:border-0 hover:bg-muted/30"
                      >
                        <td className="px-3 py-2.5">
                          <div className="flex items-center gap-2">
                            <Badge
                              variant={trigger.service === "sqs" ? "secondary" : "outline"}
                              className="text-[10px] uppercase font-mono px-1.5 py-0"
                            >
                              {trigger.service}
                            </Badge>
                            <span
                              className="font-mono text-xs font-medium text-foreground truncate max-w-[200px]"
                              title={trigger.eventSourceArn}
                            >
                              {trigger.resourceName}
                            </span>
                          </div>
                          <p
                            className="text-[11px] font-mono text-muted-foreground truncate max-w-[320px] mt-0.5"
                            title={trigger.eventSourceArn}
                          >
                            {trigger.eventSourceArn}
                          </p>
                        </td>
                        <td className="px-3 py-2.5 font-mono text-xs text-muted-foreground">
                          {trigger.batchSize ?? 10} msgs
                        </td>
                        <td className="px-3 py-2.5 font-mono text-xs text-muted-foreground">
                          {trigger.maximumBatchingWindowInSeconds ?? 0}s
                        </td>
                        <td className="px-3 py-2.5">
                          <Badge
                            variant={isEnabled ? "default" : "outline"}
                            className="text-[10px] font-mono px-1.5 py-0"
                          >
                            {trigger.state}
                          </Badge>
                        </td>
                        <td className="px-3 py-2.5 text-right">
                          <div className="flex items-center justify-end gap-1">
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 text-xs px-2 gap-1 text-muted-foreground hover:text-foreground"
                              disabled={isToggling}
                              onClick={() => handleToggleTrigger(trigger)}
                              title={isEnabled ? "Disable trigger" : "Enable trigger"}
                            >
                              {isToggling ? (
                                <Loader2 className="size-3.5 animate-spin" />
                              ) : (
                                <Power className={`size-3.5 ${isEnabled ? "text-green-500" : "text-muted-foreground"}`} />
                              )}
                              <span className="hidden sm:inline">
                                {isEnabled ? "Disable" : "Enable"}
                              </span>
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="size-7 text-muted-foreground hover:text-destructive"
                              aria-label={`Delete trigger ${trigger.resourceName}`}
                              onClick={() => setTriggerToDelete(trigger)}
                            >
                              <Trash2 className="size-3.5" />
                            </Button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      <InvokeDialog
        open={isInvokeOpen}
        onOpenChange={setIsInvokeOpen}
        functionName={functionName}
      />

      <EnvVarsDialog
        open={isEnvOpen}
        onOpenChange={setIsEnvOpen}
        functionName={functionName}
        initialEnvVars={envVars}
      />

      <AddTriggerDialog
        open={isAddTriggerOpen}
        onOpenChange={setIsAddTriggerOpen}
        functionName={functionName}
      />

      <DeleteConfirmDialog
        open={Boolean(triggerToDelete)}
        onOpenChange={(open) => !open && setTriggerToDelete(null)}
        title="Delete Event Source Trigger"
        description={`Are you sure you want to delete the trigger for "${triggerToDelete?.resourceName}"? The Lambda function will no longer be invoked by this event source.`}
        confirmLabel="Delete trigger"
        isPending={isDeletingTrigger}
        onConfirm={handleDeleteTrigger}
      />
    </div>
  );
}
