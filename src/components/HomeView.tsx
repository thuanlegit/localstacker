import { useState } from "react";
import { Check, Container, Copy, Heart, Loader2, Settings, type LucideIcon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { openServiceTab } from "@/components/Sidebar";
import { useHealth } from "@/hooks/use-health";
import { useCallerIdentity } from "@/hooks/use-sts";
import { useActiveProfile } from "@/store/profiles";
import { useRecents } from "@/store/recents";
import { useTabs } from "@/store/tabs";
import { cn } from "@/lib/utils";
import { LAMP_CLASS, SERVICES, lampStatus, serviceMeta, type LampStatus } from "@/lib/services";
import { LOCALSTACK_RUN_COMMAND } from "@/lib/docker";
import { openDonate } from "@/lib/support";
import type { ServiceKind, TabDescriptor, TabKind } from "@/types";


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
  const { data, isPending } = useHealth();
  const profile = useActiveProfile();
  const recent = useRecents((s) => s.recent);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const up = data?.status === "up" ? data : undefined;
  const down = data?.status === "down" ? data : undefined;
  const resolved = !isPending && data !== undefined;
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
    "inline-flex items-center gap-1.5 rounded-md border bg-card px-2 py-1 font-mono text-xs text-foreground transition-colors hover:bg-accent";

  const headline = isPending
    ? "Checking LocalStack"
    : up
      ? "LocalStack is running"
      : "LocalStack is not running";

  return (
    <div data-testid="home-view" className="flex h-full justify-center overflow-y-auto p-6">
      <div className="my-auto w-full max-w-3xl">
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
          {!down && (
            <button
              type="button"
              className={chipClass}
              onClick={() => copy("region", profile.region, "Region copied")}
            >
              {copyIcon("region")}
              {profile.region}
            </button>
          )}
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

        {down && (
          <div className="mt-3 flex flex-col items-start gap-2">
            {down.reason && (
              <p className="text-sm text-muted-foreground">{down.reason}</p>
            )}
            <div className="flex items-center gap-1.5">
              <code className="flex items-center gap-2 rounded-md border bg-card px-2.5 py-1.5 font-mono text-xs">
                {LOCALSTACK_RUN_COMMAND}
              </code>
              <Button
                variant="ghost"
                size="icon-xs"
                aria-label="Copy start command"
                onClick={() => copy("command", LOCALSTACK_RUN_COMMAND, "Command copied")}
              >
                {copyIcon("command")}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Start LocalStack and LocalStacker reconnects automatically.
            </p>
          </div>
        )}

        {up && <p className="mt-2 text-xs text-muted-foreground">{summary}</p>}

        <div className="mt-8 grid grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-1.5">
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
                )}
              >
                <span
                  className={cn(
                    "absolute right-2.5 top-2.5 size-2 rounded-full",
                    LAMP_CLASS[status],
                    resolved && "lamp",
                  )}
                  style={{ animationDelay: `${Math.min(index, 14) * 25}ms` }}
                />
                <meta.icon className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                <span className="text-sm font-medium leading-none">{meta.shortLabel}</span>
                <span className="text-xs leading-tight text-muted-foreground">{meta.blurb}</span>
              </button>
            );
          })}
        </div>

        {recent.length > 0 && (
          <div className="mt-8">
            <p className="text-xs text-muted-foreground">Recently opened</p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {recent.map((tab) => {
                const Icon = recentIcon(tab);
                return (
                  <button
                    type="button"
                    key={tab.id}
                    className="inline-flex items-center gap-1.5 rounded-md border bg-card px-2 py-1 text-xs text-foreground transition-colors hover:bg-accent"
                    onClick={() => useTabs.getState().openTab(tab)}
                  >
                    <Icon className="size-3.5 text-muted-foreground" aria-hidden />
                    {tab.title}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        <div className="mt-10 flex items-center gap-6">
          <div className="flex items-center gap-1.5">
            <kbd className="rounded border bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
              ⌘K
            </kbd>
            <span className="text-xs text-muted-foreground">Search</span>
          </div>
          <div className="flex items-center gap-1.5">
            <kbd className="rounded border bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
              ⌘,
            </kbd>
            <span className="text-xs text-muted-foreground">Settings</span>
          </div>
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
