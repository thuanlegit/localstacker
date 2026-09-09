import { useState } from "react";
import { Check, Copy, RotateCw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { LOCALSTACK_SERVICE_NAMES, serviceMeta } from "@/lib/services";
import { useHealth } from "@/hooks/use-health";
import type { ServiceKind } from "@/types";

export interface ServiceDisabledViewProps {
  service: ServiceKind;
  onRetry?: () => void;
  isChecking?: boolean;
}

export function ServiceDisabledView({
  service,
  onRetry,
  isChecking = false,
}: ServiceDisabledViewProps) {
  const meta = serviceMeta(service);
  const Icon = meta.icon;
  const lsKey = LOCALSTACK_SERVICE_NAMES[service];
  const { data: healthData, refetch: refetchHealth } = useHealth();

  const [tab, setTab] = useState<"compose" | "cli">("compose");
  const [hasCopied, setHasCopied] = useState(false);

  const composeSnippet = `environment:\n  - SERVICES=...,${lsKey}`;
  const cliSnippet = `docker run -e SERVICES=...,${lsKey} -p 4566:4566 localstack/localstack`;

  const activeSnippet = tab === "compose" ? composeSnippet : cliSnippet;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(activeSnippet);
      setHasCopied(true);
      toast.success("Snippet copied to clipboard");
      setTimeout(() => setHasCopied(false), 2000);
    } catch {
      toast.error("Failed to copy snippet");
    }
  };

  const handleCheckAgain = () => {
    void refetchHealth();
    onRetry?.();
  };

  const activeServices =
    healthData?.status === "up"
      ? healthData.services
          .filter((s) => s.status === "running" || s.status === "available")
          .map((s) => s.name)
      : [];

  return (
    <div
      data-testid="service-disabled-view"
      className="flex h-full flex-1 flex-col items-center justify-center p-6 text-center"
    >
      <div className="w-full max-w-md space-y-5">
        {/* Icon & Status badge */}
        <div className="flex flex-col items-center gap-3">
          <div className="flex size-14 items-center justify-center rounded-2xl border border-border/80 bg-muted/40 shadow-xs">
            <Icon className="size-7 text-muted-foreground" />
          </div>
          <div className="inline-flex items-center gap-1.5 rounded-full border border-border/80 bg-muted/30 px-2.5 py-0.5 text-xs font-medium text-muted-foreground">
            <span className="size-1.5 rounded-full bg-amber-500/80" />
            Disabled in LocalStack
          </div>
        </div>

        {/* Heading & Context */}
        <div className="space-y-1.5">
          <h2 className="text-lg font-semibold tracking-tight text-foreground">
            {meta.label} is turned off
          </h2>
          <p className="text-sm text-muted-foreground leading-relaxed">
            This service was excluded in your LocalStack{" "}
            <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs text-foreground">
              SERVICES
            </code>{" "}
            configuration. LocalStack only initializes the services you specify to conserve
            memory and startup time.
          </p>
        </div>

        {/* Configuration guidance box */}
        <div className="rounded-lg border border-border/70 bg-card/60 text-left shadow-xs">
          <div className="flex items-center justify-between border-b border-border/50 px-3 py-1.5 bg-muted/30">
            <div className="flex items-center gap-2">
              <span className="text-xs font-medium text-muted-foreground">
                To enable in:
              </span>
              <div className="inline-flex rounded-md bg-muted/60 p-0.5 text-xs">
                <button
                  type="button"
                  onClick={() => setTab("compose")}
                  className={`rounded px-2 py-0.5 font-medium transition-colors ${
                    tab === "compose"
                      ? "bg-background text-foreground shadow-xs"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  docker-compose
                </button>
                <button
                  type="button"
                  onClick={() => setTab("cli")}
                  className={`rounded px-2 py-0.5 font-medium transition-colors ${
                    tab === "cli"
                      ? "bg-background text-foreground shadow-xs"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  docker CLI
                </button>
              </div>
            </div>

            <Button
              variant="ghost"
              size="icon"
              className="size-7 text-muted-foreground hover:text-foreground"
              aria-label="Copy snippet"
              onClick={handleCopy}
            >
              {hasCopied ? (
                <Check className="size-3.5 text-emerald-500" />
              ) : (
                <Copy className="size-3.5" />
              )}
            </Button>
          </div>

          <pre className="p-3 font-mono text-xs text-foreground/90 overflow-x-auto whitespace-pre">
            {activeSnippet}
          </pre>
        </div>

        {/* Active services indicator & action */}
        <div className="flex flex-col items-center gap-3 pt-1">
          <Button
            variant="outline"
            size="sm"
            onClick={handleCheckAgain}
            disabled={isChecking}
          >
            <RotateCw
              className={`mr-1.5 size-3.5 ${isChecking ? "animate-spin" : ""}`}
            />
            Check again
          </Button>

          {activeServices.length > 0 && (
            <p className="text-xs text-muted-foreground">
              Currently running services:{" "}
              <span className="font-mono text-foreground/80">
                {activeServices.join(", ")}
              </span>
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
