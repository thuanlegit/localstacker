import {
  CircleAlert,
  Loader2,
  RotateCw,
  Zap,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ServiceDisabledView } from "@/components/ServiceDisabledView";
import { isServiceDisabledError, useServiceStatus } from "@/hooks/use-health";
import { useActiveProfile } from "@/store/profiles";
import { useTabs } from "@/store/tabs";
import { useFunctions } from "@/hooks/use-lambda";
import { formatBytes, formatDate } from "@/lib/format";

export function LambdaServiceView() {
  const profile = useActiveProfile();
  const { openTab } = useTabs();

  const serviceStatus = useServiceStatus("lambda");
  const { data, isPending, error, refetch, isFetching } = useFunctions(
    profile.id,
    { enabled: serviceStatus !== "disabled" },
  );

  if (serviceStatus === "disabled" || isServiceDisabledError(error)) {
    return <ServiceDisabledView service="lambda" />;
  }

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex h-12 items-center gap-2 border-b px-4">
        <span className="text-sm font-semibold">Functions</span>
        <Badge variant="secondary" className="font-mono text-xs">
          {data ? data.length : 0}
        </Badge>
        <div className="flex-1" />
        <Button
          variant="ghost"
          size="icon"
          aria-label="Refresh functions"
          disabled={isFetching}
          onClick={() => refetch()}
        >
          <RotateCw
            className={`size-4 ${isFetching ? "animate-spin" : ""}`}
          />
        </Button>
      </div>

      {/* Body */}
      {isPending ? (
        <div className="flex flex-1 items-center justify-center">
          <Loader2 className="size-6 animate-spin text-muted-foreground" />
        </div>
      ) : error ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 p-4 text-center">
          <CircleAlert className="size-8 text-destructive" />
          <p className="text-sm text-muted-foreground">{error.message}</p>
          <Button variant="outline" size="sm" onClick={() => refetch()}>
            Retry
          </Button>
        </div>
      ) : !data || data.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 text-muted-foreground">
          <Zap className="size-10 opacity-40" />
          <p className="text-sm">
            No functions yet — create one with the AWS CLI, IaC, or your deploy
            pipeline
          </p>
        </div>
      ) : (
        <div className="flex-1 overflow-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-border/40 text-xs font-semibold uppercase text-muted-foreground">
                <th className="px-4 py-2.5 font-medium">Name</th>
                <th className="px-4 py-2.5 font-medium">Runtime</th>
                <th className="px-4 py-2.5 font-medium">Handler</th>
                <th className="w-28 px-4 py-2.5 text-right font-medium">
                  Code size
                </th>
                <th className="w-44 px-4 py-2.5 text-right font-medium">
                  Last modified
                </th>
              </tr>
            </thead>
            <tbody>
              {data.map((f) => (
                <tr
                  key={f.name}
                  tabIndex={0}
                  onClick={() =>
                    openTab({
                      id: `function:${f.name}`,
                      kind: "function",
                      functionName: f.name,
                      title: f.name,
                    })
                  }
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      openTab({
                        id: `function:${f.name}`,
                        kind: "function",
                        functionName: f.name,
                        title: f.name,
                      });
                    }
                  }}
                  className="cursor-pointer border-b border-border/20 transition-colors hover:bg-accent/50"
                >
                  <td className="px-4 py-2 font-medium">
                    <div className="flex items-center gap-2">
                      <Zap className="size-4 shrink-0 text-muted-foreground" />
                      <span className="truncate">{f.name}</span>
                    </div>
                  </td>
                  <td className="px-4 py-2">
                    {f.runtime ? (
                      <Badge variant="outline" className="px-1.5 py-0 text-[10px]">
                        {f.runtime}
                      </Badge>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="max-w-[200px] truncate px-4 py-2 font-mono text-xs text-muted-foreground">
                    {f.handler || "—"}
                  </td>
                  <td className="whitespace-nowrap px-4 py-2 text-right font-mono text-xs text-muted-foreground">
                    {f.codeSize !== undefined ? formatBytes(f.codeSize) : "—"}
                  </td>
                  <td className="whitespace-nowrap px-4 py-2 text-right font-mono text-xs text-muted-foreground">
                    {formatDate(f.lastModified)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
