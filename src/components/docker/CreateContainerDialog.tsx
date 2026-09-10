import { useMemo, useState } from "react";
import { ChevronDown, ChevronRight, Loader2, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  buildCreateConfig,
  type CreateContainerInput,
  type PullProgressEvent,
} from "@/lib/docker";

const IMAGE_PRESETS = [
  "localstack/localstack:4.14.0",
  "localstack/localstack:latest",
  "gresau/localstack-persist:latest",
];
const CUSTOM_IMAGE = "__custom__";
const IMAGE_TAG_RE = /^[\w./:-]+$/;
const ENV_RE = /^[A-Za-z_][A-Za-z0-9_]*=/;

interface PortRow {
  host: string;
  container: string;
}

interface EnvRow {
  key: string;
  value: string;
}
function maskEnvForPreview(env: string[]): string[] {
  return env.map((line) => {
    const eq = line.indexOf("=");
    if (eq === -1) return line;
    const key = line.slice(0, eq);
    return /TOKEN|SECRET|PASSWORD|KEY|CREDENTIAL/i.test(key) ? `${key}=***` : line;
  });
}

export interface CreateContainerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreate: (
    input: CreateContainerInput,
    onEvent: (e: PullProgressEvent) => void,
    onStatusChange?: (status: string) => void,
  ) => Promise<unknown>;
  onCancelOperation: (sessionId: string) => Promise<void>;
}


export function CreateContainerDialog({
  open,
  onOpenChange,
  onCreate,
  onCancelOperation,
}: CreateContainerDialogProps) {
  const [containerName, setContainerName] = useState("");
  const [imageChoice, setImageChoice] = useState<string>(IMAGE_PRESETS[0]);
  const [customImage, setCustomImage] = useState("");
  const [ports, setPorts] = useState<PortRow[]>([{ host: "4566", container: "4566" }]);
  const [envRows, setEnvRows] = useState<EnvRow[]>([{ key: "", value: "" }]);
  const [persist, setPersist] = useState(false);
  const [network, setNetwork] = useState("");
  const [restartPolicy, setRestartPolicy] = useState<"no" | "unless-stopped" | "always">(
    "unless-stopped",
  );
  const [hostname, setHostname] = useState("");
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [extraJson, setExtraJson] = useState("");

  const [errors, setErrors] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [progressStatus, setProgressStatus] = useState<string | null>(null);
  const [progress, setProgress] = useState<{ current: number; total: number } | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);

  const resolvedImage =
    imageChoice === CUSTOM_IMAGE ? customImage.trim() : imageChoice;

  const parsedExtra = useMemo<Record<string, unknown> | null>(() => {
    if (!extraJson.trim()) return {};
    try {
      const parsed = JSON.parse(extraJson);
      if (typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
      return null;
    } catch {
      return null;
    }
  }, [extraJson]);

  const previewConfig = useMemo(() => {
    if (parsedExtra === null) {
      return "// Invalid JSON — fix the extra config to see the merged preview";
    }
    const input: CreateContainerInput = {
      containerName: containerName.trim() || undefined,
      image: resolvedImage,
      ports: ports.map((p) => ({
        hostPort: Number(p.host),
        containerPort: Number(p.container),
        protocol: "tcp" as const,
      })),
      env: maskEnvForPreview(
        envRows.filter((r) => r.key || r.value).map((r) => `${r.key}=${r.value}`),
      ),
      persistVolume: persist,
      network: network.trim() || undefined,
      restartPolicy,
      hostname: hostname.trim() || undefined,
      extraConfig: parsedExtra,
    };
    try {
      return JSON.stringify(buildCreateConfig(input), null, 2);
    } catch {
      return "";
    }
  }, [containerName, resolvedImage, ports, envRows, persist, network, restartPolicy, hostname, parsedExtra]);

  const validate = (): string[] => {
    const errs: string[] = [];
    if (persist && !containerName.trim()) {
      errs.push("Container name is required when persistence is enabled.");
    }
    if (!resolvedImage || !IMAGE_TAG_RE.test(resolvedImage)) {
      errs.push("Image must match ^[\\w./:-]+$.");
    }
    for (const p of ports) {
      const host = Number(p.host);
      const container = Number(p.container);
      if (
        !Number.isInteger(host) ||
        host < 1 ||
        host > 65535 ||
        !Number.isInteger(container) ||
        container < 1 ||
        container > 65535
      ) {
        errs.push("Port values must be integers between 1 and 65535.");
        break;
      }
    }
    for (const r of envRows) {
      if ((r.key || r.value) && !ENV_RE.test(`${r.key}=${r.value}`)) {
        errs.push("Env entries must look like KEY=value (key: [A-Za-z_][A-Za-z0-9_]*).");
        break;
      }
    }
    if (extraJson.trim() && parsedExtra === null) {
      errs.push("Advanced JSON must be a valid JSON object.");
    }
    return errs;
  };

  const handleSubmit = async () => {
    const errs = validate();
    setErrors(errs);
    if (errs.length > 0) {
      return;
    }

    const input: CreateContainerInput = {
      containerName: containerName.trim() || undefined,
      image: resolvedImage,
      ports: ports.map((p) => ({
        hostPort: Number(p.host),
        containerPort: Number(p.container),
        protocol: "tcp" as const,
      })),
      env: envRows
        .filter((r) => r.key || r.value)
        .map((r) => `${r.key}=${r.value}`),
      persistVolume: persist,
      network: network.trim() || undefined,
      restartPolicy,
      hostname: hostname.trim() || undefined,
      extraConfig: parsedExtra ?? undefined,
    };

    setSubmitting(true);
    setProgressStatus("Preparing…");
    const newSessionId = crypto.randomUUID();
    setSessionId(newSessionId);

    try {
      await onCreate(
        input,
        (e: PullProgressEvent) => {
          setProgressStatus(e.status);
          if (e.current !== undefined && e.total !== undefined) {
            setProgress({ current: e.current, total: e.total });
          } else if (e.done) {
            setProgress(null);
          }
        },
        (status) => setProgressStatus(status),
      );
      onOpenChange(false);
    } catch {
      // Failure toast surfaced by the action hook; keep the dialog open.
    } finally {
      setSubmitting(false);
      setProgressStatus(null);
      setProgress(null);
      setSessionId(null);
    }
  };

  const handleCancel = async () => {
    if (sessionId) {
      await onCancelOperation(sessionId);
    }
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o && submitting) return; onOpenChange(o); }}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Launch LocalStack container</DialogTitle>
          <DialogDescription>
            Configure a new container; it auto-connects a localhost profile when ready.
          </DialogDescription>
        </DialogHeader>

        {errors.length > 0 && (
          <div className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive space-y-1">
            {errors.map((e) => (
              <p key={e}>{e}</p>
            ))}
          </div>
        )}

        {submitting ? (
          <div className="space-y-3 py-4" data-testid="create-progress">
            <p className="text-sm font-medium">{progressStatus ?? "Working…"}</p>
            {progress && progress.total > 0 && (
              <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
                <div
                  className="h-full bg-primary transition-all"
                  style={{ width: `${Math.min(100, (progress.current / progress.total) * 100)}%` }}
                />
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-4">
            {/* Name */}
            <div className="space-y-1.5">
              <Label htmlFor="docker-container-name">Container name</Label>
              <Input
                id="docker-container-name"
                value={containerName}
                onChange={(e) => setContainerName(e.target.value)}
                placeholder="my-localstack"
                autoFocus
              />
            </div>

            {/* Image */}
            <div className="space-y-1.5">
              <Label htmlFor="docker-image">Image</Label>
              <Select value={imageChoice} onValueChange={setImageChoice}>
                <SelectTrigger id="docker-image" className="w-full">
                  <SelectValue placeholder="Select image" />
                </SelectTrigger>
                <SelectContent>
                  {IMAGE_PRESETS.map((img) => (
                    <SelectItem key={img} value={img}>
                      {img}
                    </SelectItem>
                  ))}
                  <SelectItem value={CUSTOM_IMAGE}>Custom…</SelectItem>
                </SelectContent>
              </Select>
              {imageChoice === CUSTOM_IMAGE && (
                <Input
                  value={customImage}
                  onChange={(e) => setCustomImage(e.target.value)}
                  placeholder="localstack/localstack:4.14.0"
                  aria-label="Custom image"
                />
              )}
            </div>

            {/* Ports */}
            <div className="space-y-1.5">
              <Label>Port mappings (host → container)</Label>
              {ports.map((row, idx) => (
                <div key={idx} className="flex items-center gap-2">
                  <Input
                    value={row.host}
                    onChange={(e) =>
                      setPorts(ports.map((p, i) => (i === idx ? { ...p, host: e.target.value } : p)))
                    }
                    placeholder="4566"
                    className="w-28"
                    aria-label={`Host port ${idx + 1}`}
                  />
                  <span className="text-muted-foreground">→</span>
                  <Input
                    value={row.container}
                    onChange={(e) =>
                      setPorts(
                        ports.map((p, i) => (i === idx ? { ...p, container: e.target.value } : p)),
                      )
                    }
                    placeholder="4566"
                    className="w-28"
                    aria-label={`Container port ${idx + 1}`}
                  />
                  <Button
                    variant="ghost"
                    size="sm"
                    className="size-8 p-0"
                    onClick={() => setPorts(ports.filter((_, i) => i !== idx))}
                    disabled={ports.length === 1}
                    aria-label={`Remove port row ${idx + 1}`}
                  >
                    <Trash2 className="size-3.5" />
                  </Button>
                </div>
              ))}
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPorts([...ports, { host: "", container: "" }])}
                className="gap-1.5"
              >
                <Plus className="size-3.5" />
                Add port
              </Button>
            </div>

            {/* Env */}
            <div className="space-y-1.5">
              <Label>Environment variables</Label>
              {envRows.map((row, idx) => (
                <div key={idx} className="flex items-center gap-2">
                  <Input
                    value={row.key}
                    onChange={(e) =>
                      setEnvRows(envRows.map((r, i) => (i === idx ? { ...r, key: e.target.value } : r)))
                    }
                    placeholder="SERVICES"
                    className="w-44"
                    aria-label={`Env key ${idx + 1}`}
                  />
                  <span className="text-muted-foreground">=</span>
                  <Input
                    value={row.value}
                    onChange={(e) =>
                      setEnvRows(
                        envRows.map((r, i) => (i === idx ? { ...r, value: e.target.value } : r)),
                      )
                    }
                    placeholder="s3,sqs"
                    className="flex-1"
                    aria-label={`Env value ${idx + 1}`}
                  />
                  <Button
                    variant="ghost"
                    size="sm"
                    className="size-8 p-0"
                    onClick={() => setEnvRows(envRows.filter((_, i) => i !== idx))}
                    disabled={envRows.length === 1}
                    aria-label={`Remove env row ${idx + 1}`}
                  >
                    <Trash2 className="size-3.5" />
                  </Button>
                </div>
              ))}
              <Button
                variant="outline"
                size="sm"
                onClick={() => setEnvRows([...envRows, { key: "", value: "" }])}
                className="gap-1.5"
              >
                <Plus className="size-3.5" />
                Add variable
              </Button>
            </div>

            {/* Persist */}
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="docker-persist"
                checked={persist}
                onChange={(e) => setPersist(e.target.checked)}
                className="size-4 rounded border-gray-300 cursor-pointer"
              />
              <Label htmlFor="docker-persist" className="cursor-pointer">
                Persist state (named volume <code>localstacker-&lt;name&gt;:/var/lib/localstack</code>)
              </Label>
            </div>

            {/* Network / Restart policy / Hostname */}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div className="space-y-1.5">
                <Label htmlFor="docker-network">Network</Label>
                <Input
                  id="docker-network"
                  value={network}
                  onChange={(e) => setNetwork(e.target.value)}
                  placeholder="bridge"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="docker-restart">Restart policy</Label>
                <Select
                  value={restartPolicy}
                  onValueChange={(v) => setRestartPolicy(v as "no" | "unless-stopped" | "always")}
                >
                  <SelectTrigger id="docker-restart" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="no">no</SelectItem>
                    <SelectItem value="unless-stopped">unless-stopped</SelectItem>
                    <SelectItem value="always">always</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="docker-hostname">Hostname</Label>
                <Input
                  id="docker-hostname"
                  value={hostname}
                  onChange={(e) => setHostname(e.target.value)}
                  placeholder="localhost"
                />
              </div>
            </div>

            {/* Advanced */}
            <button
              type="button"
              onClick={() => setShowAdvanced(!showAdvanced)}
              className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
              aria-expanded={showAdvanced}
            >
              {showAdvanced ? <ChevronDown className="size-3.5" /> : <ChevronRight className="size-3.5" />}
              Advanced (JSON overrides, merged preview)
            </button>

            {showAdvanced && (
              <div className="space-y-2">
                <div className="space-y-1.5">
                  <Label htmlFor="docker-extra-json">Extra config (JSON object, merged on top)</Label>
                  <textarea
                    id="docker-extra-json"
                    value={extraJson}
                    onChange={(e) => setExtraJson(e.target.value)}
                    rows={5}
                    className="w-full rounded-md border bg-background px-3 py-2 font-mono text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    placeholder={'{"HostConfig": {"Memory": 536870912}}'}
                    aria-label="Extra config JSON"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Merged create-config preview</Label>
                  <pre
                    className="max-h-48 overflow-auto rounded-md border bg-muted/40 p-3 font-mono text-xs"
                    data-testid="config-preview"
                  >
                    {previewConfig}
                  </pre>
                </div>
              </div>
            )}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={handleCancel} disabled={false}>
            {submitting ? "Cancel operation" : "Cancel"}
          </Button>
          {!submitting && (
            <Button onClick={handleSubmit} className="gap-1.5">
              <Loader2 className={submitting ? "size-3.5 animate-spin" : "hidden"} />
              <span>Launch</span>
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
