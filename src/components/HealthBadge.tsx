import { Loader2 } from "lucide-react";
import { useActiveProfile } from "@/store/profiles";
import { useHealth } from "@/hooks/use-health";
import { cn } from "@/lib/utils";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface HealthBadgeProps {
  collapsed?: boolean;
}

export function HealthBadge({ collapsed = false }: HealthBadgeProps) {
  const profile = useActiveProfile();
  const { data, isPending } = useHealth();

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
          className={cn(
            "flex items-center rounded-md border border-sidebar-border bg-card/60 text-xs text-muted-foreground transition-all",
            collapsed
              ? "size-9 justify-center p-0 mx-auto"
              : "gap-2 px-2 py-1.5",
          )}
        >
          {isPending ? (
            <Loader2 className="size-3 animate-spin" />
          ) : (
            <span className={cn("relative flex size-2 shrink-0")}>
              {up && (
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-500 opacity-60" />
              )}
              <span className={cn("relative inline-flex size-2 rounded-full", dotClass)} />
            </span>
          )}
          {!collapsed && <span className="truncate">{label}</span>}
        </div>
      </TooltipTrigger>
      <TooltipContent side="right" className="max-w-72 text-xs">{tooltip}</TooltipContent>
    </Tooltip>
  );
}
