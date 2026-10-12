import { useState } from "react";
import {
  AlertTriangle,
  Check,
  ChevronDown,
  ChevronUp,
  Container,
  Copy,
  Heart,
  HelpCircle,
  Layers,
  Loader2,
  Play,
  Radio,
  RefreshCw,
  RotateCw,
  Settings,
  Terminal,
  type LucideIcon,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ConnectionDialog } from "@/components/ConnectionDialog";
import { openDockerTab, openServiceTab } from "@/components/Sidebar";
import { useHealth } from "@/hooks/use-health";
import { useCallerIdentity } from "@/hooks/use-sts";
import {
  useDockerActions,
  useDockerContainers,
  useDockerStatus,
} from "@/hooks/use-docker";
import { useActiveProfile } from "@/store/profiles";
import { useRecents } from "@/store/recents";
import { useTabs } from "@/store/tabs";
import { cn } from "@/lib/utils";
import { LAMP_CLASS, SERVICES, lampStatus, serviceMeta, type LampStatus } from "@/lib/services";
import { LOCALSTACK_RUN_COMMAND, type ContainerSummary } from "@/lib/docker";
import { openDonate } from "@/lib/support";
import type { ServiceKind, TabDescriptor, TabKind } from "@/types";

function getContainerStateBadgeClass(state: string): string {
  switch ((state || "").toLowerCase()) {
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
      return "bg-muted text-muted-foreground border-border";
  }
}

function statusWord(status: LampStatus): string {
  return status === "off" ? "" : status;
}

function tooltipFor(status: LampStatus, label: string): string {
  if (status === "running") return `${label} is running`;
  if (status === "available") return `${label} is available and starts on first use`;
  if (status === "disabled") return `${label} is disabled in this LocalStack`;
  return label;
}

const KIND_TO_SERVICE: Partial<Record<TabKind, ServiceKind>> = {
  bucket: "s3",
  queue: "sqs",
  secret: "secrets",
  function: "lambda",
  table: "dynamodb",
  topic: "sns",
  logGroup: "logs",
  parameter: "ssm",
  eventBus: "eventbridge",
  scheduleGroup: "scheduler",
  restApi: "apigateway",
  sesIdentity: "ses",
  sesMailbox: "ses",
  iamRole: "iam",
  iamUser: "iam",
  hostedZone: "route53",
  securityGroup: "ec2",
  stateMachine: "sfn",
  stream: "kinesis",
  kmsKey: "kms",
  stack: "cloudformation",
};

function recentIcon(tab: TabDescriptor): LucideIcon {
  if (tab.kind === "settings") return Settings;
  if (tab.kind === "docker") return Container;
  const service = tab.kind === "service" ? tab.service : KIND_TO_SERVICE[tab.kind];
  return service ? serviceMeta(service).icon : Container;
}

export function HomeView() {
  const { data, isPending, refetch } = useHealth();
  const profile = useActiveProfile();
  const recent = useRecents((s) => s.recent);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [isConnectionDialogOpen, setIsConnectionDialogOpen] = useState(false);
  const [isCheckingConnection, setIsCheckingConnection] = useState(false);
  const [startingContainerId, setStartingContainerId] = useState<string | null>(null);
  const [troubleshootingOpen, setTroubleshootingOpen] = useState(false);

  const { data: containers = [] } = useDockerContainers();
  const { data: dockerStatus } = useDockerStatus();
  const { startContainer, restartContainer } = useDockerActions();

  const up = data?.status === "up" ? data : undefined;
  const down = data?.status === "down" ? data : undefined;
  const identityQuery = useCallerIdentity(profile.id, { enabled: Boolean(up) });

  const statuses = SERVICES.map((meta) => lampStatus(data, meta.kind));
  const runningCount = statuses.filter((s) => s === "running").length;
  const availableCount = statuses.filter((s) => s === "available").length;
  const disabledCount = statuses.filter((s) => s === "disabled").length;

  const summary = [
    `${runningCount} running`,
    availableCount > 0 ? `${availableCount} available` : null,
    disabledCount > 0 ? `${disabledCount} disabled` : null,
  ]
    .filter(Boolean)
    .join(", ");

  const copy = async (key: string, value: string, toastMessage: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopiedKey(key);
      toast(toastMessage);
      setTimeout(() => setCopiedKey((k) => (k === key ? null : k)), 1500);
    } catch {
      toast.error("Failed to copy");
    }
  };

  const copyIcon = (key: string) =>
    copiedKey === key ? (
      <Check className="size-3 text-muted-foreground" aria-hidden />
    ) : (
      <Copy className="size-3 text-muted-foreground" aria-hidden />
    );

  const chipClass =
    "inline-flex items-center gap-1.5 rounded-md border bg-card px-2 py-1 font-mono text-xs text-foreground transition-colors hover:bg-accent cursor-pointer";

  const headline = isPending
    ? "Checking LocalStack"
    : up
      ? "LocalStack is running"
      : "LocalStack is not running";

  const handleCheckConnection = async () => {
    setIsCheckingConnection(true);
    try {
      await refetch?.();
      toast.info("Connection check complete");
    } catch {
      toast.error("LocalStack endpoint still unreachable");
    } finally {
      setTimeout(() => setIsCheckingConnection(false), 500);
    }
  };

  const handleStartContainer = async (containerId: string) => {
    setStartingContainerId(containerId);
    try {
      const success = await startContainer(containerId);
      if (success) {
        toast.success("Container started — probing connection...");
        setTimeout(() => {
          void refetch?.();
        }, 1200);
      }
    } catch (e) {
      toast.error(`Failed to start container: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setStartingContainerId(null);
    }
  };

  const handleRestartContainer = async (container: ContainerSummary) => {
    setStartingContainerId(container.containerId);
    try {
      const success = await restartContainer(container);
      if (success) {
        toast.success("Container restarted — probing connection...");
        setTimeout(() => {
          void refetch?.();
        }, 1200);
      }
    } catch (e) {
      toast.error(`Failed to restart container: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setStartingContainerId(null);
    }
  };

  const localstackContainers = (containers || []).filter(
    (c) =>
      c.image?.toLowerCase().includes("localstack") ||
      c.name?.toLowerCase().includes("localstack") ||
      c.hostPorts?.includes(4566),
  );
  const primaryContainer =
    localstackContainers.find((c) => (c.state || "").toLowerCase() !== "running") ??
    localstackContainers[0];

  return (
    <div data-testid="home-view" className="flex h-full justify-center overflow-y-auto p-6">
      <div className="my-auto w-full max-w-3xl flex flex-col gap-6">
        {/* Online / Connecting Header */}
        {!down && (
          <div>
            <h2 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
              {headline}
              {isPending && <Loader2 className="size-4 animate-spin" aria-hidden />}
            </h2>

            <div className="mt-3 flex flex-wrap items-center gap-2">
              <button
                type="button"
                className={chipClass}
                onClick={() => copy("endpoint", profile.endpoint, "Endpoint copied")}
              >
                {copyIcon("endpoint")}
                {profile.endpoint}
              </button>
              <button
                type="button"
                className={chipClass}
                onClick={() => copy("region", profile.region, "Region copied")}
              >
                {copyIcon("region")}
                {profile.region}
              </button>
              {up && identityQuery.data && (
                <button
                  type="button"
                  className={chipClass}
                  title={identityQuery.data.arn}
                  onClick={() =>
                    copy("identity", identityQuery.data!.account, "Account id copied")
                  }
                >
                  {copyIcon("identity")}
                  acct {identityQuery.data.account}
                </button>
              )}
              {(up?.version || up?.edition) && (
                <span className="text-xs text-muted-foreground">
                  {[up?.version, up?.edition].filter(Boolean).join(" ")}
                </span>
              )}
            </div>
            {up && <p className="mt-2 text-xs text-muted-foreground">{summary}</p>}
          </div>
        )}

        {/* Disconnected Recovery Stage */}
        {down && (
          <div className="flex flex-col gap-6">
            {/* Hero Disconnected Banner */}
            <div className="relative overflow-hidden rounded-2xl border border-amber-500/25 bg-gradient-to-b from-amber-500/10 via-card to-card p-6 shadow-xs">
              <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
                <div className="flex items-start gap-4">
                  {/* Pulsing Beacon Icon */}
                  <div className="relative flex size-12 shrink-0 items-center justify-center rounded-xl border border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400 shadow-xs">
                    <span className="absolute -top-1 -right-1 flex size-3">
                      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-amber-400 opacity-75" />
                      <span className="relative inline-flex size-3 rounded-full bg-amber-500" />
                    </span>
                    <Container className="size-6" />
                  </div>

                  <div className="flex flex-col gap-1.5 min-w-0">
                    <div className="flex items-center gap-2.5 flex-wrap">
                      <h2 className="text-2xl font-bold tracking-tight text-foreground">
                        {headline}
                      </h2>
                      <Badge
                        variant="outline"
                        className="border-amber-500/30 bg-amber-500/15 text-amber-700 dark:text-amber-300 gap-1.5 py-0.5 text-xs font-medium"
                      >
                        <Radio className="size-3 animate-pulse text-amber-500" />
                        <span>Connection Lost</span>
                      </Badge>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      LocalStacker lost connection to the LocalStack instance at{" "}
                      <span className="font-mono text-foreground font-semibold">
                        {profile.endpoint}
                      </span>
                      .
                    </p>
                  </div>
                </div>

                {/* Manual Ping / Probe Action */}
                <div className="flex items-center gap-2 shrink-0 self-start">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleCheckConnection}
                    disabled={isCheckingConnection}
                    className="gap-1.5 h-8 text-xs font-medium border-border/80 hover:border-amber-500/40"
                  >
                    <RefreshCw
                      className={cn(
                        "size-3.5",
                        isCheckingConnection && "animate-spin text-amber-500",
                      )}
                    />
                    <span>Check Connection</span>
                  </Button>
                </div>
              </div>

              {/* Connection Meta & Profile Selector Chips */}
              <div className="mt-4 flex flex-wrap items-center gap-2 pt-3 border-t border-border/60">
                <button
                  type="button"
                  className={chipClass}
                  onClick={() => copy("endpoint", profile.endpoint, "Endpoint copied")}
                  title="Click to copy endpoint URL"
                >
                  {copyIcon("endpoint")}
                  {profile.endpoint}
                </button>
                <button
                  type="button"
                  className={cn(chipClass, "text-muted-foreground hover:text-foreground")}
                  onClick={() => setIsConnectionDialogOpen(true)}
                  title="Edit or switch active profile"
                >
                  <Settings className="size-3" />
                  <span>Profile: {profile.name}</span>
                </button>
                <div className="flex items-center gap-1.5 px-2 py-1 text-xs text-muted-foreground font-mono">
                  <span className="size-1.5 rounded-full bg-amber-500 animate-ping" />
                  <span>Polling every 5s</span>
                </div>
              </div>

              {/* Diagnostic Socket Detail (if down.reason present) */}
              {down.reason && (
                <div className="mt-4 rounded-xl border border-destructive/25 bg-destructive/10 p-3.5 text-xs text-destructive dark:text-red-300">
                  <div className="flex items-start gap-2.5">
                    <AlertTriangle className="size-4 shrink-0 mt-0.5 text-destructive" />
                    <div className="flex flex-col gap-1 min-w-0 flex-1">
                      <span className="font-semibold uppercase tracking-wider text-[10px] opacity-80">
                        Diagnostic Error Detail
                      </span>
                      <p className="font-mono text-xs break-all bg-background/60 rounded px-2.5 py-1 border border-destructive/20 text-foreground">
                        {down.reason}
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* 3-Point Diagnostic Matrix */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="rounded-xl border bg-card p-3.5 flex flex-col justify-between shadow-2xs">
                <div className="flex items-center justify-between text-muted-foreground">
                  <span className="text-xs font-medium">Docker Daemon</span>
                  <Container className="size-4 text-muted-foreground" />
                </div>
                <div className="mt-2.5">
                  <div className="flex items-center gap-1.5 font-semibold text-sm text-foreground">
                    <span
                      className={cn(
                        "size-2 rounded-full",
                        dockerStatus?.available ? "bg-emerald-500" : "bg-destructive",
                      )}
                    />
                    <span>
                      {dockerStatus?.available
                        ? dockerStatus.version
                          ? `v${dockerStatus.version} Active`
                          : "Daemon Active"
                        : "Daemon Offline"}
                    </span>
                  </div>
                  <p className="text-[11px] text-muted-foreground mt-0.5">
                    {dockerStatus?.available
                      ? "Socket ready for container actions"
                      : "Check if Docker Desktop is running"}
                  </p>
                </div>
              </div>

              <div className="rounded-xl border bg-card p-3.5 flex flex-col justify-between shadow-2xs">
                <div className="flex items-center justify-between text-muted-foreground">
                  <span className="text-xs font-medium">Target Port</span>
                  <Radio className="size-4 text-muted-foreground" />
                </div>
                <div className="mt-2.5">
                  <div className="flex items-center gap-1.5 font-semibold text-sm text-destructive dark:text-red-400">
                    <span className="size-2 rounded-full bg-destructive animate-pulse" />
                    <span className="font-mono">
                      {profile.endpoint.replace(/^https?:\/\//, "")}
                    </span>
                  </div>
                  <p className="text-[11px] text-muted-foreground mt-0.5">
                    Port closed · No listener responded
                  </p>
                </div>
              </div>

              <div className="rounded-xl border bg-card p-3.5 flex flex-col justify-between shadow-2xs">
                <div className="flex items-center justify-between text-muted-foreground">
                  <span className="text-xs font-medium">Cloud Services</span>
                  <Layers className="size-4 text-muted-foreground" />
                </div>
                <div className="mt-2.5">
                  <div className="flex items-center gap-1.5 font-semibold text-sm text-amber-600 dark:text-amber-400">
                    <span className="size-2 rounded-full bg-amber-500" />
                    <span>21 Standby</span>
                  </div>
                  <p className="text-[11px] text-muted-foreground mt-0.5">
                    Auto-activates once connection restores
                  </p>
                </div>
              </div>
            </div>

            {/* Smart LocalStack Docker Container Detection Card */}
            {primaryContainer ? (
              <div className="rounded-xl border bg-card p-4 shadow-2xs flex flex-col gap-3.5">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b pb-3">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="flex size-8 items-center justify-center rounded-lg border bg-muted/60 shrink-0">
                      <Container className="size-4 text-primary" />
                    </div>
                    <div className="flex flex-col min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold text-foreground text-sm font-mono truncate">
                          {primaryContainer.name}
                        </span>
                        <Badge
                          variant="outline"
                          className={cn(
                            "text-[10px] px-1.5 py-0 capitalize",
                            getContainerStateBadgeClass(primaryContainer.state),
                          )}
                        >
                          {primaryContainer.state || "Stopped"}
                        </Badge>
                        {primaryContainer.persists && (
                          <Badge
                            variant="outline"
                            className="text-[10px] px-1.5 py-0 border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400"
                          >
                            Persisted
                          </Badge>
                        )}
                      </div>
                      <span className="text-xs text-muted-foreground font-mono">
                        {primaryContainer.image} · id: {primaryContainer.containerId.slice(0, 12)}
                      </span>
                    </div>
                  </div>

                  {/* 1-Click Actions */}
                  <div className="flex items-center gap-2 shrink-0">
                    {(primaryContainer.state || "").toLowerCase() === "running" ? (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleRestartContainer(primaryContainer)}
                        disabled={Boolean(startingContainerId)}
                        className="gap-1.5"
                      >
                        {startingContainerId === primaryContainer.containerId ? (
                          <Loader2 className="size-3.5 animate-spin" />
                        ) : (
                          <RotateCw className="size-3.5" />
                        )}
                        <span>Restart</span>
                      </Button>
                    ) : (
                      <Button
                        size="sm"
                        onClick={() => handleStartContainer(primaryContainer.containerId)}
                        disabled={Boolean(startingContainerId)}
                        className="gap-1.5 bg-emerald-600 hover:bg-emerald-500 text-white font-medium shadow-xs"
                      >
                        {startingContainerId === primaryContainer.containerId ? (
                          <Loader2 className="size-3.5 animate-spin" />
                        ) : (
                          <Play className="size-3.5 fill-current" />
                        )}
                        <span>Start Container</span>
                      </Button>
                    )}
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={openDockerTab}
                      className="gap-1.5"
                      title="View container details and logs"
                    >
                      <Terminal className="size-3.5" />
                      <span>Logs</span>
                    </Button>
                  </div>
                </div>

                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span className="truncate">
                    Ports:{" "}
                    <span className="font-mono text-foreground">
                      {primaryContainer.hostPorts.length > 0
                        ? primaryContainer.hostPorts.map((p) => `:${p}`).join(", ")
                        : ":4566"}
                    </span>
                    {primaryContainer.status ? ` · ${primaryContainer.status}` : ""}
                  </span>
                  <button
                    type="button"
                    onClick={openDockerTab}
                    className="text-xs text-primary hover:underline shrink-0"
                  >
                    Open in Docker Manager &rarr;
                  </button>
                </div>
              </div>
            ) : dockerStatus?.available ? (
              <div className="rounded-xl border bg-card p-4 shadow-2xs flex items-center justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="flex size-9 items-center justify-center rounded-lg border bg-muted/60 shrink-0">
                    <Container className="size-4 text-muted-foreground" />
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-foreground">
                      No LocalStack containers found on Docker socket
                    </p>
                    <p className="text-[11px] text-muted-foreground">
                      Launch a new LocalStack instance with one click, or use the terminal command below.
                    </p>
                  </div>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={openDockerTab}
                  className="gap-1.5 shrink-0"
                >
                  <Container className="size-3.5" />
                  <span>Docker Manager</span>
                </Button>
              </div>
            ) : null}

            {/* Terminal Command Console */}
            <div className="rounded-xl border bg-card/90 shadow-2xs overflow-hidden">
              <div className="flex items-center justify-between border-b bg-muted/40 px-4 py-2.5">
                <div className="flex items-center gap-2">
                  <div className="flex items-center gap-1.5" aria-hidden="true">
                    <span className="size-2.5 rounded-full bg-red-500/70" />
                    <span className="size-2.5 rounded-full bg-amber-500/70" />
                    <span className="size-2.5 rounded-full bg-emerald-500/70" />
                  </div>
                  <span className="font-mono text-xs text-muted-foreground ml-2 font-medium">
                    Terminal Quick-Start
                  </span>
                </div>
                <span className="font-mono text-[10px] text-muted-foreground rounded bg-background px-1.5 py-0.5 border">
                  bash
                </span>
              </div>

              <div className="p-4 flex flex-col gap-2.5">
                <div className="flex items-center justify-between gap-2 rounded-lg bg-background border px-3 py-2">
                  <div className="flex items-center gap-2 overflow-x-auto min-w-0">
                    <span className="text-amber-500 font-mono font-bold select-none text-xs">
                      $
                    </span>
                    <code className="font-mono text-xs text-foreground whitespace-nowrap">
                      {LOCALSTACK_RUN_COMMAND}
                    </code>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    aria-label="Copy start command"
                    onClick={() => copy("command", LOCALSTACK_RUN_COMMAND, "Command copied")}
                    className="shrink-0 text-muted-foreground hover:text-foreground"
                  >
                    {copyIcon("command")}
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  Start LocalStack and LocalStacker reconnects automatically.
                </p>
              </div>
            </div>

            {/* Troubleshooting Guide Drawer */}
            <div className="rounded-xl border bg-card/50 shadow-2xs overflow-hidden">
              <button
                type="button"
                onClick={() => setTroubleshootingOpen((o) => !o)}
                className="flex w-full items-center justify-between px-4 py-3 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
              >
                <div className="flex items-center gap-2">
                  <HelpCircle className="size-3.5 text-amber-500" />
                  <span>Troubleshooting & Quick Diagnoses</span>
                </div>
                {troubleshootingOpen ? (
                  <ChevronUp className="size-3.5" />
                ) : (
                  <ChevronDown className="size-3.5" />
                )}
              </button>

              {troubleshootingOpen && (
                <div className="border-t px-4 py-3 grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs bg-muted/20">
                  <div className="flex flex-col gap-1 rounded-lg border bg-background/60 p-2.5">
                    <span className="font-semibold text-foreground">
                      1. Container Exited Unexpectedly
                    </span>
                    <p className="text-muted-foreground text-[11px] leading-relaxed">
                      Check container logs in Docker Manager for Python errors, licensing issues, or memory limits.
                    </p>
                  </div>
                  <div className="flex flex-col gap-1 rounded-lg border bg-background/60 p-2.5">
                    <span className="font-semibold text-foreground">
                      2. Port 4566 Binding Collision
                    </span>
                    <p className="text-muted-foreground text-[11px] leading-relaxed">
                      Ensure another process is not holding port 4566 with{" "}
                      <code className="font-mono bg-muted px-1 rounded">lsof -i :4566</code>.
                    </p>
                  </div>
                  <div className="flex flex-col gap-1 rounded-lg border bg-background/60 p-2.5">
                    <span className="font-semibold text-foreground">
                      3. Docker Desktop Sleeping
                    </span>
                    <p className="text-muted-foreground text-[11px] leading-relaxed">
                      Host sleep can suspend the Docker socket. Restart Docker Desktop from your menu bar.
                    </p>
                  </div>
                  <div className="flex flex-col gap-1 rounded-lg border bg-background/60 p-2.5">
                    <span className="font-semibold text-foreground">
                      4. Remote Host or Custom Port
                    </span>
                    <p className="text-muted-foreground text-[11px] leading-relaxed">
                      If LocalStack is running on a non-default host, edit or switch your connection profile.
                    </p>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Services Grid (Standby when down, Active when up) */}
        <div className="flex flex-col gap-2.5">
          {down && (
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-semibold text-foreground">
                  Standby Services
                </h3>
                <span className="rounded-full border bg-muted/60 px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                  21 registered
                </span>
              </div>
              <span className="text-xs text-muted-foreground">
                Auto-activates on connection
              </span>
            </div>
          )}

          <div className="grid grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-1.5">
            {SERVICES.map((meta, index) => {
              const status = statuses[index];
              return (
                <button
                  type="button"
                  key={meta.kind}
                  title={tooltipFor(status, meta.label)}
                  aria-label={`Open ${meta.label}${status === "off" ? "" : ` (${statusWord(status)})`}`}
                  onClick={() => openServiceTab(meta.kind, meta.shortLabel)}
                  className={cn(
                    "relative flex flex-col gap-1 rounded-lg border border-border bg-card p-3 text-left transition-colors",
                    "hover:border-ring/40 hover:bg-accent/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    status === "disabled" && "opacity-60",
                    down && "bg-card/60 opacity-80 hover:opacity-100 hover:border-amber-500/40",
                  )}
                >
                  <span
                    className={cn(
                      "inline-block size-1.5 rounded-full",
                      LAMP_CLASS[status],
                    )}
                    aria-hidden
                  />
                  <span className="text-sm font-medium">{meta.label}</span>
                  <span className="text-xs text-muted-foreground">
                    {meta.blurb}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Connection Dialog */}
        <ConnectionDialog
          open={isConnectionDialogOpen}
          onOpenChange={setIsConnectionDialogOpen}
          profile={profile}
        />

        {/* Recents */}
        {recent.length > 0 && (
          <div className="mt-2">
            <p className="text-xs text-muted-foreground">Recently opened</p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {recent.map((tab) => {
                const Icon = recentIcon(tab);
                return (
                  <button
                    type="button"
                    key={tab.id}
                    onClick={() => useTabs.getState().openTab(tab)}
                    className="inline-flex items-center gap-1.5 rounded-md border bg-card px-2.5 py-1 text-xs text-foreground transition-colors hover:bg-accent"
                  >
                    <Icon className="size-3.5 text-muted-foreground" aria-hidden />
                    {tab.title}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Support */}
        <div className="flex justify-center pb-2">
          <button
            type="button"
            className="inline-flex items-center gap-1.5 rounded-md border bg-card px-2 py-1 text-xs text-foreground transition-colors hover:bg-accent"
            onClick={() => void openDonate()}
          >
            <Heart className="size-3.5 text-muted-foreground" aria-hidden />
            Buy me a coffee
          </button>
        </div>
      </div>
    </div>
  );
}
