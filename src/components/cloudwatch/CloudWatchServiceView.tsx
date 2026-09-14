import { useMemo, useState } from "react";
import {
  Activity,
  ChevronDown,
  ChevronRight,
  CircleAlert,
  Loader2,
  Plus,
  RotateCw,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
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
import {
  useCloudWatchMetrics,
  useCloudWatchAlarms,
  useMetricStatistics,
  useCloudWatchActions,
} from "@/hooks/use-cloudwatch";
import type { MetricSummary, AlarmSummary } from "@/lib/cloudwatch";
import { cn } from "@/lib/utils";

const NAME_REGEX = /^[a-zA-Z0-9:_\-./]{1,255}$/;

function parseDimensions(
  raw: string,
): { name: string; value: string }[] | "invalid" {
  const trimmed = raw.trim();
  if (!trimmed) return [];
  const out: { name: string; value: string }[] = [];
  for (const part of trimmed.split(",")) {
    const [name, ...rest] = part.split("=");
    const value = rest.join("=");
    if (!name?.trim() || !value.trim()) return "invalid";
    out.push({ name: name.trim(), value: value.trim() });
  }
  return out;
}

const formatDimensions = (dims: { name: string; value: string }[]) =>
  dims.length ? dims.map((d) => `${d.name}=${d.value}`).join(", ") : "—";

function PutMetricDialog({
  open,
  onOpenChange,
  onPublish,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onPublish: (params: {
    namespace: string;
    metricName: string;
    value: number;
    dimensions?: { name: string; value: string }[];
  }) => Promise<boolean>;
}) {
  const [namespace, setNamespace] = useState("");
  const [metricName, setMetricName] = useState("");
  const [value, setValue] = useState("");
  const [dimensions, setDimensions] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const parsed = parseDimensions(dimensions);
  const dims = parsed === "invalid" ? undefined : parsed;
  const isValid =
    NAME_REGEX.test(namespace) &&
    NAME_REGEX.test(metricName) &&
    value !== "" &&
    Number.isFinite(Number(value)) &&
    dims !== undefined;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isValid || isSubmitting) return;
    setIsSubmitting(true);
    const ok = await onPublish({
      namespace,
      metricName,
      value: Number(value),
      dimensions: dims,
    });
    setIsSubmitting(false);
    if (ok) {
      setMetricName("");
      setValue("");
      onOpenChange(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <form onSubmit={handleSubmit} className="min-w-0">
          <DialogHeader>
            <DialogTitle>Put metric data</DialogTitle>
            <DialogDescription>
              Publish a single datapoint for a custom metric.
            </DialogDescription>
          </DialogHeader>
          <div className="mt-4 grid gap-4">
            <div className="grid gap-2">
              <Label htmlFor="cw-namespace">Namespace</Label>
              <Input
                id="cw-namespace"
                placeholder="MyApp"
                value={namespace}
                onChange={(e) => setNamespace(e.target.value)}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="cw-metric">Metric name</Label>
              <Input
                id="cw-metric"
                placeholder="OrderCount"
                value={metricName}
                onChange={(e) => setMetricName(e.target.value)}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="cw-value">Value</Label>
              <Input
                id="cw-value"
                type="number"
                step="any"
                placeholder="42"
                value={value}
                onChange={(e) => setValue(e.target.value)}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="cw-dims">Dimensions (optional)</Label>
              <Input
                id="cw-dims"
                placeholder="Service=checkout, Env=test"
                value={dimensions}
                onChange={(e) => setDimensions(e.target.value)}
              />
              {parsed === "invalid" && (
                <p className="text-xs text-destructive">
                  Use Name=Value pairs separated by commas.
                </p>
              )}
            </div>
          </div>
          <DialogFooter className="mt-6">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={!isValid || isSubmitting}>
              {isSubmitting ? "Publishing…" : "Publish"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function CreateAlarmDialog({
  open,
  onOpenChange,
  onCreate,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreate: (params: {
    name: string;
    namespace: string;
    metricName: string;
    comparison: string;
    threshold: number;
    evaluationPeriods: number;
    period: number;
    dimensions?: { name: string; value: string }[];
  }) => Promise<boolean>;
}) {
  const [name, setName] = useState("");
  const [namespace, setNamespace] = useState("");
  const [metricName, setMetricName] = useState("");
  const [comparison, setComparison] = useState("GreaterThanThreshold");
  const [threshold, setThreshold] = useState("");
  const [evaluationPeriods, setEvaluationPeriods] = useState("1");
  const [period, setPeriod] = useState("300");
  const [dimensions, setDimensions] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const parsed = parseDimensions(dimensions);
  const dims = parsed === "invalid" ? undefined : parsed;
  const isValid =
    NAME_REGEX.test(name) &&
    NAME_REGEX.test(namespace) &&
    NAME_REGEX.test(metricName) &&
    threshold !== "" &&
    Number.isFinite(Number(threshold)) &&
    Number(evaluationPeriods) >= 1 &&
    dims !== undefined;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isValid || isSubmitting) return;
    setIsSubmitting(true);
    const ok = await onCreate({
      name,
      namespace,
      metricName,
      comparison,
      threshold: Number(threshold),
      evaluationPeriods: Number(evaluationPeriods),
      period: Number(period),
      dimensions: dims,
    });
    setIsSubmitting(false);
    if (ok) onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <form onSubmit={handleSubmit} className="min-w-0">
          <DialogHeader>
            <DialogTitle>Create alarm</DialogTitle>
            <DialogDescription>
              Threshold alarm on the Average statistic of a metric.
            </DialogDescription>
          </DialogHeader>
          <div className="mt-4 grid gap-4">
            <div className="grid gap-2">
              <Label htmlFor="alarm-name">Alarm name</Label>
              <Input
                id="alarm-name"
                placeholder="high-order-count"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="alarm-namespace">Namespace</Label>
                <Input
                  id="alarm-namespace"
                  placeholder="MyApp"
                  value={namespace}
                  onChange={(e) => setNamespace(e.target.value)}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="alarm-metric">Metric</Label>
                <Input
                  id="alarm-metric"
                  placeholder="OrderCount"
                  value={metricName}
                  onChange={(e) => setMetricName(e.target.value)}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="alarm-comparison">Comparison</Label>
                <Select value={comparison} onValueChange={setComparison}>
                  <SelectTrigger id="alarm-comparison">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="GreaterThanThreshold">&gt; threshold</SelectItem>
                    <SelectItem value="GreaterThanOrEqualToThreshold">
                      ≥ threshold
                    </SelectItem>
                    <SelectItem value="LessThanThreshold">&lt; threshold</SelectItem>
                    <SelectItem value="LessThanOrEqualToThreshold">
                      ≤ threshold
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="alarm-threshold">Threshold</Label>
                <Input
                  id="alarm-threshold"
                  type="number"
                  step="any"
                  placeholder="100"
                  value={threshold}
                  onChange={(e) => setThreshold(e.target.value)}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="alarm-periods">Evaluation periods</Label>
                <Input
                  id="alarm-periods"
                  type="number"
                  min={1}
                  value={evaluationPeriods}
                  onChange={(e) => setEvaluationPeriods(e.target.value)}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="alarm-period">Period</Label>
                <Select value={period} onValueChange={setPeriod}>
                  <SelectTrigger id="alarm-period">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="60">1 minute</SelectItem>
                    <SelectItem value="300">5 minutes</SelectItem>
                    <SelectItem value="900">15 minutes</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="alarm-dims">Dimensions (optional)</Label>
              <Input
                id="alarm-dims"
                placeholder="Service=checkout"
                value={dimensions}
                onChange={(e) => setDimensions(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter className="mt-6">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={!isValid || isSubmitting}>
              {isSubmitting ? "Creating…" : "Create alarm"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function StateBadge({ state }: { state: string }) {
  const tone =
    state === "ALARM"
      ? "bg-destructive/15 text-destructive"
      : state === "OK"
        ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
        : "bg-muted text-muted-foreground";
  return (
    <span
      data-slot="badge"
      className={cn(
        "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium",
        tone,
      )}
      title={state}
    >
      {state === "INSUFFICIENT_DATA" ? "INSUFFICIENT DATA" : state || "—"}
    </span>
  );
}

function MetricRow({
  profileId,
  metric,
  alarmCount,
}: {
  profileId: string;
  metric: MetricSummary;
  alarmCount: number;
}) {
  const [expanded, setExpanded] = useState(false);
  const { data: points, isPending, refetch, isFetching } = useMetricStatistics(
    profileId,
    metric.namespace,
    metric.metricName,
    metric.dimensions,
    { enabled: expanded },
  );

  return (
    <>
      <tr
        className="cursor-pointer transition-colors hover:bg-accent/50"
        onClick={() => setExpanded((v) => !v)}
      >
        <td className="px-6 py-3">
          <span className="flex items-center gap-2">
            {expanded ? (
              <ChevronDown className="size-3.5 text-muted-foreground" aria-hidden />
            ) : (
              <ChevronRight className="size-3.5 text-muted-foreground" aria-hidden />
            )}
            <span className="font-mono text-xs sm:text-sm">{metric.namespace}</span>
          </span>
        </td>
        <td className="px-6 py-3 font-mono text-xs sm:text-sm">{metric.metricName}</td>
        <td className="px-6 py-3 text-xs text-muted-foreground">
          {formatDimensions(metric.dimensions)}
        </td>
        <td className="px-6 py-3 text-xs text-muted-foreground">{alarmCount}</td>
      </tr>
      {expanded && (
        <tr>
          <td colSpan={4} className="bg-muted/30 px-6 py-3">
            <div className="flex items-center gap-2">
              <p className="text-xs font-medium text-muted-foreground">
                Statistics · last 3 hours · 5 min period
              </p>
              <Button
                variant="ghost"
                size="icon-xs"
                title="Refresh statistics"
                onClick={() => refetch()}
                disabled={isFetching}
              >
                <RotateCw className={cn("size-3", isFetching && "animate-spin")} />
              </Button>
            </div>
            {isPending ? (
              <div className="flex justify-center py-4">
                <Loader2 className="size-4 animate-spin text-muted-foreground" />
              </div>
            ) : !points || points.length === 0 ? (
              <p className="py-2 text-xs text-muted-foreground">No datapoints.</p>
            ) : (
              <ul className="mt-2 grid gap-1">
                {points.slice(0, 12).map((p, i) => (
                  <li
                    key={`${p.timestamp.toISOString()}-${i}`}
                    className="flex items-center gap-3 font-mono text-xs"
                  >
                    <span className="text-muted-foreground">
                      {p.timestamp.toLocaleTimeString()}
                    </span>
                    <span>avg {p.average ?? "—"}</span>
                    <span>max {p.maximum ?? "—"}</span>
                    <span>min {p.minimum ?? "—"}</span>
                  </li>
                ))}
              </ul>
            )}
          </td>
        </tr>
      )}
    </>
  );
}

function AlarmRow({
  alarm,
  onDelete,
}: {
  alarm: AlarmSummary;
  onDelete: (name: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  return (
    <>
      <tr
        className="cursor-pointer transition-colors hover:bg-accent/50"
        onClick={() => setExpanded((v) => !v)}
      >
        <td className="px-6 py-3 font-mono text-xs sm:text-sm">{alarm.name}</td>
        <td className="px-6 py-3">
          <StateBadge state={alarm.state} />
        </td>
        <td className="px-6 py-3 text-xs text-muted-foreground">
          <span className="font-mono">
            {alarm.namespace}/{alarm.metricName}
          </span>
        </td>
        <td className="px-6 py-3 text-right" onClick={(e) => e.stopPropagation()}>
          <Button
            variant="ghost"
            size="icon-sm"
            title={`Delete alarm ${alarm.name}`}
            onClick={() => onDelete(alarm.name)}
          >
            <Trash2 className="size-4 text-destructive" />
          </Button>
        </td>
      </tr>
      {expanded && (
        <tr>
          <td colSpan={4} className="bg-muted/30 px-6 py-3">
            <dl className="grid grid-cols-2 gap-x-8 gap-y-1.5 text-xs sm:grid-cols-3">
              <div>
                <dt className="text-muted-foreground">Comparison</dt>
                <dd className="font-mono">
                  {alarm.comparison} {alarm.threshold}
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Evaluation</dt>
                <dd className="font-mono">
                  {alarm.evaluationPeriods} × {alarm.period}s
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Dimensions</dt>
                <dd className="font-mono">{formatDimensions(alarm.dimensions)}</dd>
              </div>
              <div className="col-span-2 sm:col-span-3">
                <dt className="text-muted-foreground">State reason</dt>
                <dd className="font-mono break-all">{alarm.stateReason || "—"}</dd>
              </div>
            </dl>
          </td>
        </tr>
      )}
    </>
  );
}

export function CloudWatchServiceView() {
  const profile = useActiveProfile();
  const serviceStatus = useServiceStatus("cloudwatch");
  const metricsQuery = useCloudWatchMetrics(profile.id);
  const alarmsQuery = useCloudWatchAlarms(profile.id);
  const { putMetricData, createAlarm, deleteAlarm } = useCloudWatchActions();

  const [search, setSearch] = useState("");
  const [isPutOpen, setIsPutOpen] = useState(false);
  const [isAlarmOpen, setIsAlarmOpen] = useState(false);
  const [alarmToDelete, setAlarmToDelete] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  if (serviceStatus === "disabled" || isServiceDisabledError(metricsQuery.error)) {
    return <ServiceDisabledView service="cloudwatch" />;
  }

  const metrics = metricsQuery.data ?? [];
  const alarms = alarmsQuery.data ?? [];

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = q
      ? metrics.filter(
          (m) =>
            m.namespace.toLowerCase().includes(q) ||
            m.metricName.toLowerCase().includes(q) ||
            m.dimensions.some((d) => d.value.toLowerCase().includes(q)),
        )
      : metrics;
    return [...list].sort((a, b) =>
      `${a.namespace}/${a.metricName}`.localeCompare(`${b.namespace}/${b.metricName}`),
    );
  }, [metrics, search]);

  const alarmsForMetric = (m: MetricSummary) =>
    alarms.filter(
      (a) =>
        a.namespace === m.namespace &&
        a.metricName === m.metricName &&
        a.dimensions.length === m.dimensions.length &&
        a.dimensions.every((d) =>
          m.dimensions.some((md) => md.name === d.name && md.value === d.value),
        ),
    ).length;

  const handleDelete = async () => {
    if (!alarmToDelete) return;
    setIsDeleting(true);
    try {
      const ok = await deleteAlarm(alarmToDelete);
      if (ok) setAlarmToDelete(null);
    } finally {
      setIsDeleting(false);
    }
  };

  const error = metricsQuery.error;

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="border-b px-6 py-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Activity className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-lg font-semibold">CloudWatch</h1>
              <p className="text-xs text-muted-foreground">Custom metrics & alarms</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                void metricsQuery.refetch();
                void alarmsQuery.refetch();
              }}
              disabled={metricsQuery.isFetching || alarmsQuery.isFetching}
              title="Refresh metrics and alarms"
            >
              <RotateCw
                className={cn(
                  "h-4 w-4",
                  (metricsQuery.isFetching || alarmsQuery.isFetching) && "animate-spin",
                )}
              />
              <span className="hidden sm:inline">Refresh</span>
            </Button>
            <Button variant="outline" size="sm" onClick={() => setIsAlarmOpen(true)}>
              <Plus className="h-4 w-4" />
              Create alarm
            </Button>
            <Button size="sm" onClick={() => setIsPutOpen(true)}>
              <Plus className="h-4 w-4" />
              Put metric data
            </Button>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-auto">
        {metricsQuery.isPending ? (
          <div className="flex h-full items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : error ? (
          <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
            <CircleAlert className="h-8 w-8 text-destructive" />
            <p className="text-sm font-medium">Failed to load metrics</p>
            <p className="text-xs text-muted-foreground">
              {error instanceof Error ? error.message : String(error)}
            </p>
            <Button variant="outline" size="sm" onClick={() => metricsQuery.refetch()}>
              Retry
            </Button>
          </div>
        ) : (
          <div className="grid gap-6 p-6">
            {/* Metrics */}
            <section>
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-sm font-semibold">Metrics ({filtered.length})</h2>
                <Input
                  className="h-8 w-64"
                  placeholder="Filter by namespace, metric, dimension…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
              {filtered.length === 0 ? (
                <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed p-8 text-center">
                  <Activity className="h-8 w-8 text-muted-foreground/50" />
                  <p className="text-sm font-medium">No metrics</p>
                  <p className="text-xs text-muted-foreground">
                    Publish a datapoint with Put metric data to register a metric.
                  </p>
                </div>
              ) : (
                <table className="w-full text-left text-sm">
                  <thead className="bg-muted/50 text-xs uppercase tracking-wide text-muted-foreground">
                    <tr>
                      <th className="px-6 py-3 font-medium">Namespace</th>
                      <th className="px-6 py-3 font-medium">Metric</th>
                      <th className="px-6 py-3 font-medium">Dimensions</th>
                      <th className="px-6 py-3 font-medium">Alarms</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {filtered.map((m) => (
                      <MetricRow
                        key={`${m.namespace}/${m.metricName}/${m.dimensions.map((d) => `${d.name}=${d.value}`).join(",")}`}
                        profileId={profile.id}
                        metric={m}
                        alarmCount={alarmsForMetric(m)}
                      />
                    ))}
                  </tbody>
                </table>
              )}
            </section>

            {/* Alarms */}
            <section>
              <h2 className="mb-3 text-sm font-semibold">
                Alarms ({alarms.length})
              </h2>
              {alarms.length === 0 ? (
                <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed p-8 text-center">
                  <CircleAlert className="h-8 w-8 text-muted-foreground/50" />
                  <p className="text-sm font-medium">No alarms</p>
                  <p className="text-xs text-muted-foreground">
                    Create a threshold alarm to monitor a metric.
                  </p>
                </div>
              ) : (
                <table className="w-full text-left text-sm">
                  <thead className="bg-muted/50 text-xs uppercase tracking-wide text-muted-foreground">
                    <tr>
                      <th className="px-6 py-3 font-medium">Name</th>
                      <th className="px-6 py-3 font-medium">State</th>
                      <th className="px-6 py-3 font-medium">Metric</th>
                      <th className="px-6 py-3 text-right font-medium">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {alarms.map((a) => (
                      <AlarmRow key={a.name} alarm={a} onDelete={setAlarmToDelete} />
                    ))}
                  </tbody>
                </table>
              )}
            </section>
          </div>
        )}
      </div>

      <PutMetricDialog
        open={isPutOpen}
        onOpenChange={setIsPutOpen}
        onPublish={putMetricData}
      />
      <CreateAlarmDialog
        open={isAlarmOpen}
        onOpenChange={setIsAlarmOpen}
        onCreate={createAlarm}
      />
      <DeleteConfirmDialog
        open={Boolean(alarmToDelete)}
        onOpenChange={(open) => !open && setAlarmToDelete(null)}
        title="Delete alarm"
        description={`Are you sure you want to delete alarm “${alarmToDelete ?? ""}”?`}
        confirmLabel="Delete"
        isPending={isDeleting}
        onConfirm={handleDelete}
      />
    </div>
  );
}
