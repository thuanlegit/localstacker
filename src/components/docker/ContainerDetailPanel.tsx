import { useState } from "react";
import { Copy, Check, Eye, EyeOff, HardDrive, Network, Terminal } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { maskEnv, type ContainerSummary } from "@/lib/docker";
import { useDockerInspect } from "@/hooks/use-docker";
import { ContainerLogsConsole } from "./ContainerLogsConsole";

interface ContainerDetailPanelProps {
  container: ContainerSummary;
}

export function ContainerDetailPanel({ container }: ContainerDetailPanelProps) {
  const [revealEnv, setRevealEnv] = useState(false);
  const [copiedField, setCopiedField] = useState<string | null>(null);

  const { data: detail, isLoading } = useDockerInspect(container.containerId);

  const handleCopy = async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedField(label);
      toast.success(`${label} copied`);
      setTimeout(() => setCopiedField(null), 2000);
    } catch {
      toast.error(`Failed to copy ${label}`);
    }
  };

  const envLines = detail?.env ?? [];
  const displayedEnv = revealEnv ? envLines : maskEnv(envLines);

  const createdDate = container.createdAt
    ? new Date(
        container.createdAt > 1e11
          ? container.createdAt
          : container.createdAt * 1000,
      ).toLocaleString()
    : "—";

  return (
    <div className="rounded-lg border bg-card text-card-foreground p-4 flex flex-col gap-4 shadow-xs">
      <div className="flex items-center justify-between border-b pb-3">
        <div className="flex items-center gap-2">
          <span className="font-semibold text-base">{container.name}</span>
          <span className="text-xs font-mono text-muted-foreground">
            {container.containerId.slice(0, 12)}
          </span>
          <button
            type="button"
            onClick={() => handleCopy(container.containerId, "Container ID")}
            className="text-muted-foreground hover:text-foreground transition-colors p-1"
            title="Copy Container ID"
            aria-label="Copy Container ID"
          >
            {copiedField === "Container ID" ? (
              <Check className="size-3.5 text-emerald-500" />
            ) : (
              <Copy className="size-3.5" />
            )}
          </button>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="font-mono text-xs">
            {container.image}
          </Badge>
          {container.persists && (
            <Badge
              variant="outline"
              className="border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400 text-xs"
            >
              Persistence enabled
            </Badge>
          )}
        </div>
      </div>

      <Tabs defaultValue="summary" className="w-full">
        <TabsList className="mb-4">
          <TabsTrigger value="summary">Summary</TabsTrigger>
          <TabsTrigger value="logs">Logs</TabsTrigger>
        </TabsList>

        <TabsContent value="summary" className="space-y-6 m-0">
          {isLoading ? (
            <div className="py-8 text-center text-sm text-muted-foreground">
              Loading container details…
            </div>
          ) : (
            <>
              {/* Properties Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="flex flex-col gap-1 p-3 rounded-md bg-muted/40 border">
                  <span className="text-xs text-muted-foreground">Status</span>
                  <span className="text-sm font-medium">{detail?.status || container.status}</span>
                </div>
                <div className="flex flex-col gap-1 p-3 rounded-md bg-muted/40 border">
                  <span className="text-xs text-muted-foreground">Created</span>
                  <span className="text-sm font-medium">{createdDate}</span>
                </div>
                <div className="flex flex-col gap-1 p-3 rounded-md bg-muted/40 border">
                  <span className="text-xs text-muted-foreground">Restart Policy</span>
                  <span className="text-sm font-medium font-mono">
                    {detail?.restartPolicy || "—"}
                  </span>
                </div>
                <div className="flex flex-col gap-1 p-3 rounded-md bg-muted/40 border">
                  <span className="text-xs text-muted-foreground">Host Ports</span>
                  <span className="text-sm font-medium font-mono">
                    {container.hostPorts.length > 0
                      ? container.hostPorts.map((p) => `:${p}`).join(", ")
                      : "None"}
                  </span>
                </div>
              </div>

              {/* Networks */}
              <div className="space-y-2">
                <div className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  <Network className="size-3.5" />
                  <span>Networks</span>
                </div>
                <div className="flex flex-wrap gap-2">
                  {detail?.networks && detail.networks.length > 0 ? (
                    detail.networks.map((net) => (
                      <Badge key={net} variant="secondary" className="font-mono text-xs">
                        {net}
                      </Badge>
                    ))
                  ) : (
                    <span className="text-xs text-muted-foreground">No networks attached</span>
                  )}
                </div>
              </div>

              {/* Mounts */}
              <div className="space-y-2">
                <div className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  <HardDrive className="size-3.5" />
                  <span>Mounts</span>
                </div>
                {detail?.mounts && detail.mounts.length > 0 ? (
                  <div className="rounded-md border divide-y text-xs font-mono">
                    {detail.mounts.map((m, idx) => (
                      <div
                        key={`${m.destination}-${idx}`}
                        className="p-2.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2 hover:bg-muted/20"
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <Badge variant="outline" className="text-[10px] uppercase">
                            {m.type}
                          </Badge>
                          <span className="truncate text-foreground font-semibold">
                            {m.name || m.source}
                          </span>
                        </div>
                        <div className="flex items-center gap-1 text-muted-foreground shrink-0">
                          <span>→</span>
                          <span className="text-foreground">{m.destination}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-xs text-muted-foreground italic">No volumes or bind mounts</div>
                )}
              </div>

              {/* Environment Variables */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                    <Terminal className="size-3.5" />
                    <span>Environment Variables ({envLines.length})</span>
                  </div>
                  {envLines.length > 0 && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setRevealEnv(!revealEnv)}
                      className="h-7 text-xs gap-1.5 text-muted-foreground hover:text-foreground"
                      aria-label={revealEnv ? "Mask values" : "Reveal values"}
                    >
                      {revealEnv ? (
                        <>
                          <EyeOff className="size-3.5" />
                          <span>Mask values</span>
                        </>
                      ) : (
                        <>
                          <Eye className="size-3.5" />
                          <span>Reveal values</span>
                        </>
                      )}
                    </Button>
                  )}
                </div>

                {envLines.length > 0 ? (
                  <div className="max-h-56 overflow-y-auto rounded-md border bg-muted/40 p-3 font-mono text-xs space-y-1 select-text">
                    {displayedEnv.map((line, idx) => (
                      <div key={idx} className="break-all">
                        {line}
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-xs text-muted-foreground italic">No environment variables set</div>
                )}
              </div>
            </>
          )}
        </TabsContent>

        <TabsContent value="logs" className="m-0 h-96">
          <ContainerLogsConsole containerId={container.containerId} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
