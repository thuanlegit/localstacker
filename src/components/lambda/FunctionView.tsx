import { useState, useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  CircleAlert,
  Loader2,
  Play,
  Plus,
  RotateCw,
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
import { ServiceDisabledView } from "@/components/ServiceDisabledView";
import { isServiceDisabledError, useServiceStatus } from "@/hooks/use-health";
import { useActiveProfile } from "@/store/profiles";
import {
  lambdaKeys,
  useFunctions,
  useFunctionConfig,
  useLambdaClient,
} from "@/hooks/use-lambda";
import {
  invokeFunction,
  updateFunctionEnvVars,
  type InvocationResult,
} from "@/lib/lambda";
import { formatBytes, formatDate } from "@/lib/format";

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
      <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto">
        <form onSubmit={handleInvoke}>
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

                <div className="space-y-1">
                  <span className="text-xs font-semibold uppercase text-muted-foreground">
                    Logs (last 4 KB)
                  </span>
                  {invokeResult.logs !== undefined ? (
                    <pre className="max-h-48 overflow-auto whitespace-pre-wrap break-all rounded-md bg-muted/50 p-2 font-mono text-xs">
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
      <DialogContent className="max-h-[85vh] max-w-xl overflow-y-auto">
        <form onSubmit={handleSubmit}>
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
    </div>
  );
}
