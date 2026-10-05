import { useState } from "react";
import { Activity, ArrowRight, Check, Container, Copy, Loader2, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { LocalStackerLogo } from "@/components/LocalStackerLogo";
import { Input } from "@/components/ui/input";
import { useDockerActions, useDockerStatus } from "@/hooks/use-docker";
import { useHealth } from "@/hooks/use-health";
import { LOCALSTACK_RUN_COMMAND, type PullProgressEvent } from "@/lib/docker";
import { LAMP_CLASS, SERVICES, lampStatus } from "@/lib/services";
import { isTauri } from "@/lib/updater";
import { cn } from "@/lib/utils";
import { useOnboarding } from "@/store/onboarding";
import { LOCAL_PROFILE_ID, useActiveProfile, useProfiles } from "@/store/profiles";

const STARTER_IMAGE = "localstack/localstack:4.14.0";

export function Onboarding() {
  const { data, isFetching } = useHealth();
  const profile = useActiveProfile();
  const docker = useDockerStatus({ enabled: isTauri() });
  const { createAndConnect } = useDockerActions();
  const complete = useOnboarding((s) => s.complete);

  const [endpoint, setEndpoint] = useState(profile.endpoint);
  const [creating, setCreating] = useState(false);
  const [pullPercent, setPullPercent] = useState<number | null>(null);
  const [statusText, setStatusText] = useState<string | null>(null);
  const [failureMessage, setFailureMessage] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const isInitialCheck = !data && isFetching;
  const healthStatus = isInitialCheck ? "checking" : data?.status === "up" ? "up" : "down";
  const state = healthStatus === "up" ? "up" : creating ? "creating" : healthStatus;

  const up = data?.status === "up" ? data : undefined;
  const down = data?.status === "down" ? data : undefined;

  const lampHealth = healthStatus === "checking" ? undefined : data;
  const statuses = SERVICES.map((meta) => lampStatus(lampHealth, meta.kind));

  const commitEndpoint = () => {
    const trimmed = endpoint.trim();
    if (!trimmed || trimmed === profile.endpoint) return;
    useProfiles.getState().updateProfile(LOCAL_PROFILE_ID, { endpoint: trimmed });
  };

  const copyCommand = async () => {
    try {
      await navigator.clipboard.writeText(LOCALSTACK_RUN_COMMAND);
      setCopied(true);
      toast("Command copied");
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error("Failed to copy");
    }
  };

  const start = () => {
    setCreating(true);
    setFailureMessage(null);
    setPullPercent(null);
    setStatusText(null);
    createAndConnect(
      {
        containerName: "localstack",
        image: STARTER_IMAGE,
        ports: [{ hostPort: 4566, containerPort: 4566, protocol: "tcp" }],
        env: [],
        persistVolume: true,
      },
      (e: PullProgressEvent) => {
        if (e.total && e.total > 0 && e.current !== undefined) {
          setPullPercent(Math.round((e.current / e.total) * 100));
        }
      },
      (status) => setStatusText(status),
    ).catch((e) => {
      setCreating(false);
      setFailureMessage(String(e.message ?? e));
    });
  };

  const reason = failureMessage ?? down?.reason;
  const dockerResolved = !docker.isPending;
  const canStart = isTauri() && dockerResolved && docker.data?.available === true;
  const dockerUnavailable = isTauri() && dockerResolved && docker.data?.available === false;
  const progressLine =
    statusText ?? (pullPercent !== null ? `${pullPercent}%` : `Pulling ${STARTER_IMAGE}…`);

  return (
    <div
      data-testid="onboarding"
      className="relative isolate flex-1 h-full w-full overflow-y-auto"
    >
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
        <div className="onb-drift absolute -top-48 -left-40 size-[36rem] rounded-full bg-primary/20 blur-[120px]" />
        <div className="onb-drift-slow absolute -right-40 -bottom-56 size-[32rem] rounded-full bg-[#8b93ff]/15 blur-[120px]" />
        <div className="absolute inset-0 opacity-[0.35] [background-image:linear-gradient(to_right,var(--border)_1px,transparent_1px),linear-gradient(to_bottom,var(--border)_1px,transparent_1px)] [background-size:44px_44px] [mask-image:radial-gradient(ellipse_60%_60%_at_50%_40%,black,transparent)]" />
      </div>

      <div className="mx-auto grid min-h-full w-full max-w-6xl items-center gap-14 px-8 py-12 lg:grid-cols-[1fr_30rem]">
        <div>
          <div className="onb-rise flex items-center gap-3">
            <LocalStackerLogo className="size-11 shrink-0 drop-shadow-md" aria-hidden />
            <div>
              <p className="text-sm font-semibold">LocalStacker</p>
              <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
                Local control plane
              </p>
            </div>
          </div>

          <h1 className="onb-rise mt-8 text-4xl font-semibold leading-[1.1] tracking-tight" style={{ animationDelay: "60ms" }}>
            The control panel for your{" "}
            <span className="bg-gradient-to-r from-primary to-[#8b93ff] bg-clip-text text-transparent">
              local AWS cloud
            </span>
            .
          </h1>
          <p className="onb-rise mt-4 max-w-md text-sm leading-relaxed text-muted-foreground" style={{ animationDelay: "120ms" }}>
            LocalStacker connects to a LocalStack instance on this machine and gives every service a
            console. No cloud account, nothing leaves your machine.
          </p>

          <ul className="onb-rise mt-7 space-y-2.5" style={{ animationDelay: "180ms" }}>
            <li className="flex items-center gap-2.5 text-sm text-muted-foreground">
              <ShieldCheck className="size-4 shrink-0 text-primary" aria-hidden />
              No cloud account, no AWS credentials
            </li>
            <li className="flex items-center gap-2.5 text-sm text-muted-foreground">
              <Activity className="size-4 shrink-0 text-primary" aria-hidden />
              Live status across every service
            </li>
          </ul>
        </div>

        <div className="onb-rise" style={{ animationDelay: "120ms" }}>
          <div
            className={cn(
              "overflow-hidden rounded-2xl border bg-card/90 shadow-2xl shadow-black/5 backdrop-blur",
              state === "up" && "ring-1 ring-emerald-500/30",
            )}
          >
            <div className="flex items-center gap-2 border-b bg-muted/40 px-4 py-2.5">
              <span className="size-2.5 rounded-full bg-foreground/10" />
              <span className="size-2.5 rounded-full bg-foreground/10" />
              <span className="size-2.5 rounded-full bg-foreground/10" />
              <span className="ml-2 font-mono text-[11px] text-muted-foreground">
                localstacker — console
              </span>
            </div>

            <div className="p-5">
              <p className="font-mono text-[10px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
                Endpoint
              </p>
              <div className="mt-1.5 flex items-center gap-2">
                <Input
                  aria-label="LocalStack endpoint"
                  value={endpoint}
                  onChange={(e) => setEndpoint(e.target.value)}
                  onBlur={commitEndpoint}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      commitEndpoint();
                      e.currentTarget.blur();
                    }
                  }}
                  className="h-9 flex-1 bg-background/60 font-mono text-xs"
                />
                <span
                  className={cn(
                    "inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium",
                    state === "up" &&
                      "border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
                  )}
                >
                  {state === "checking" ? (
                    <Loader2 className="size-3 animate-spin" aria-hidden />
                  ) : (
                    <span
                      className={cn(
                        "size-2 rounded-full",
                        state === "up"
                          ? "bg-emerald-500 shadow-[0_0_6px] shadow-emerald-500/60"
                          : "bg-red-500",
                      )}
                    />
                  )}
                  {state === "checking" && "Checking…"}
                  {state === "down" && "Not running"}
                  {state === "up" && <>Connected{up?.version ? ` · ${up.version}` : ""}</>}
                </span>
              </div>

              <div className="mt-5 flex items-baseline justify-between">
                <p className="font-mono text-[10px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
                  Services
                </p>
                <p className="font-mono text-[10px] text-muted-foreground">
                  {SERVICES.length} supported
                </p>
              </div>
              <div className="mt-2 grid grid-cols-3 gap-1.5">
                {SERVICES.map((meta, index) => {
                  const s = statuses[index];
                  return (
                    <div
                      key={meta.kind}
                      data-testid={`onboarding-lamp-${meta.kind}`}
                      className={cn(
                        "flex items-center gap-2 rounded-lg border bg-background/50 px-2.5 py-2",
                        s === "running" && "border-emerald-500/40 bg-emerald-500/5",
                      )}
                    >
                      <meta.icon className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
                      <span className="truncate text-xs text-muted-foreground">{meta.shortLabel}</span>
                      <span
                        className={cn(
                          "ml-auto size-2 shrink-0 rounded-full",
                          LAMP_CLASS[s],
                          state === "checking" ? "motion-safe:animate-pulse" : "lamp",
                        )}
                        style={{ animationDelay: `${index * 25}ms` }}
                      />
                    </div>
                  );
                })}
              </div>

              {state === "down" && reason && (
                <p className="mt-4 break-all rounded-lg bg-muted/50 px-3 py-2 font-mono text-[11px] text-muted-foreground">
                  {reason}
                </p>
              )}

              {state === "creating" && (
                <div className="mt-4">
                  <div className="h-1 overflow-hidden rounded-full bg-muted">
                    {pullPercent !== null ? (
                      <div
                        className="h-full rounded-full bg-primary transition-[width]"
                        style={{ width: `${pullPercent}%` }}
                      />
                    ) : (
                      <div className="onb-indeterminate h-full w-1/3 rounded-full bg-primary" />
                    )}
                  </div>
                  <p className="mt-2 font-mono text-[11px] text-muted-foreground">{progressLine}</p>
                </div>
              )}

              {state !== "up" && state !== "creating" && (
                <div className="mt-4 flex items-center gap-2 rounded-lg border bg-muted/40 py-1.5 pl-3 pr-1.5">
                  <code className="min-w-0 flex-1 truncate font-mono text-[11px] text-muted-foreground">
                    <span className="select-none text-primary">$ </span>
                    {LOCALSTACK_RUN_COMMAND}
                  </code>
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    aria-label="Copy docker command"
                    onClick={copyCommand}
                  >
                    {copied ? (
                      <Check className="size-3" aria-hidden />
                    ) : (
                      <Copy className="size-3" aria-hidden />
                    )}
                  </Button>
                </div>
              )}
            </div>
          </div>

          {state === "up" ? (
            <Button size="lg" className="mt-5 w-full" onClick={complete}>
              Open LocalStacker
              <ArrowRight className="size-4" aria-hidden />
            </Button>
          ) : (
            <div className="mt-5 space-y-3">
              {canStart && (
                <Button size="lg" className="w-full" disabled={state === "creating"} onClick={start}>
                  {state === "creating" ? (
                    <Loader2 className="size-4 animate-spin" aria-hidden />
                  ) : (
                    <Container className="size-4" aria-hidden />
                  )}
                  Start LocalStack
                </Button>
              )}
              {dockerUnavailable && (
                <p className="text-xs text-muted-foreground">
                  Docker isn't available{docker.data?.reason ? ` — ${docker.data.reason}` : ""}
                </p>
              )}
              {state === "down" && (
                <p className="text-xs text-muted-foreground">
                  LocalStacker rechecks every few seconds.
                </p>
              )}
            </div>
          )}

          <div className="mt-4 flex justify-center">
            <Button variant="ghost" size="sm" className="text-muted-foreground" onClick={complete}>
              Skip for now
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
