import { useQuery } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { checkHealth } from "@/lib/health";
import { useActiveProfile } from "@/store/profiles";
import { cn } from "@/lib/utils";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

export function HealthBadge() {
  const profile = useActiveProfile();
  const { data, isPending } = useQuery({
    queryKey: ["health", profile.id, profile.endpoint, profile.authToken],
    queryFn: () =>
      checkHealth({
        endpoint: profile.endpoint,
        authToken: profile.authToken,
      }),
    refetchInterval: 5000,
    retry: false,
    staleTime: 4000,
  });

  const up = data?.status === "up";
  const dotClass = isPending
    ? "bg-muted-foreground/40"
    : up
      ? "bg-emerald-500"
      : "bg-red-500";

  const label = isPending
    ? "Checking…"
    : up
      ? `Running${data.version ? ` · ${data.version}` : ""}`
      : "Not running";

  const tooltip = isPending
    ? `Polling ${profile.endpoint}/_localstack/health`
    : up
      ? `${profile.endpoint} — ${data.edition ?? "edition unknown"}, ${data.services.length} services registered`
      : `${profile.endpoint} — ${data?.reason ?? "no response"}. Start LocalStack and LocalStacker reconnects automatically.`;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div
          data-testid="health-badge"
          className="flex items-center gap-2 rounded-md border border-sidebar-border bg-card/60 px-2 py-1.5 text-xs text-muted-foreground"
        >
          {isPending ? (
            <Loader2 className="size-3 animate-spin" />
          ) : (
            <span className={cn("relative flex size-2")}>
              {up && (
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-500 opacity-60" />
              )}
              <span className={cn("relative inline-flex size-2 rounded-full", dotClass)} />
            </span>
          )}
          <span className="truncate">{label}</span>
        </div>
      </TooltipTrigger>
      <TooltipContent side="right" className="max-w-72 text-xs">{tooltip}</TooltipContent>
    </Tooltip>
  );
}
