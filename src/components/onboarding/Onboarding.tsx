import { useState } from "react";
import { Check, Copy, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
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

  const healthStatus = isFetching ? "checking" : data?.status === "up" ? "up" : "down";
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
    <div data-testid="onboarding" className="flex h-full justify-center overflow-y-auto p-6">
      <div className="my-auto w-full max-w-xl">
        <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          LocalStacker
        </span>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">
          The control panel for your local AWS cloud.
        </h1>
        <p className="mt-3 max-w-md text-sm text-muted-foreground">
          LocalStacker connects to a LocalStack instance on this machine and gives every service a
          console. No cloud account, nothing leaves your machine.
        </p>

        <div className="mt-8 space-y-4 rounded-lg border bg-card p-5">
          <div className="flex items-center justify-between gap-3">
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
              className="h-8 font-mono text-xs"
            />
            <span className="inline-flex shrink-0 items-center gap-1.5 text-xs text-muted-foreground">
              {state === "checking" ? (
                <Loader2 className="size-3 animate-spin" aria-hidden />
              ) : (
                <span
                  className={cn(
                    "size-2 rounded-full",
                    state === "up" ? "bg-emerald-500" : "bg-red-500",
                  )}
                />
              )}
              {state === "checking" && "Checking…"}
              {state === "down" && "Not running"}
              {state === "up" && <>Connected{up?.version ? ` · ${up.version}` : ""}</>}
            </span>
          </div>

          <div className="grid grid-cols-[repeat(auto-fill,minmax(140px,1fr))] gap-1.5">
            {SERVICES.map((meta, index) => {
              const s = statuses[index];
              return (
                <div
                  key={meta.kind}
                  className="flex items-center gap-2"
                  data-testid={`onboarding-lamp-${meta.kind}`}
                >
                  <span
                    className={cn(
                      "size-2.5 rounded-full",
                      LAMP_CLASS[s],
                      state === "checking" ? "motion-safe:animate-pulse" : "lamp",
                    )}
                    style={{ animationDelay: `${index * 25}ms` }}
                  />
                  <span className="text-xs text-muted-foreground">{meta.shortLabel}</span>
                </div>
              );
            })}
          </div>

          {state === "down" && reason && (
            <p className="break-all font-mono text-xs text-muted-foreground">{reason}</p>
          )}
        </div>

        {state === "up" ? (
          <div className="mt-5">
            <Button onClick={complete}>Open LocalStacker</Button>
          </div>
        ) : (
          <div className="mt-5 flex items-center gap-2">
            {canStart && (
              <Button disabled={state === "creating"} onClick={start}>
                Start LocalStack
              </Button>
            )}
            {dockerUnavailable && (
              <p className="text-xs text-muted-foreground">
                Docker isn't available{docker.data?.reason ? ` — ${docker.data.reason}` : ""}
              </p>
            )}
            <Button variant="outline" onClick={copyCommand}>
              {copied ? (
                <Check className="size-3" aria-hidden />
              ) : (
                <Copy className="size-3" aria-hidden />
              )}
              Copy docker command
            </Button>
          </div>
        )}

        {state === "creating" && (
          <p className="mt-3 text-xs text-muted-foreground">{progressLine}</p>
        )}
        {state === "down" && (
          <p className="mt-3 text-xs text-muted-foreground">
            LocalStacker rechecks every few seconds.
          </p>
        )}

        <div className="mt-10">
          <Button
            variant="ghost"
            size="sm"
            className="text-muted-foreground"
            onClick={complete}
          >
            Skip for now
          </Button>
        </div>
      </div>
    </div>
  );
}
