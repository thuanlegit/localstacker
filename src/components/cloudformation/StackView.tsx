import { CircleAlert, Layers, Loader2, RotateCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ServiceDisabledView } from "@/components/ServiceDisabledView";
import { PolicyJsonViewer } from "@/components/iam/PolicyJsonViewer";
import { isServiceDisabledError, useServiceStatus } from "@/hooks/use-health";
import { useActiveProfile } from "@/store/profiles";
import {
  useStackDetail,
  useStackTemplate,
  useStackEvents,
  useStackResources,
} from "@/hooks/use-cloudformation";
import { cn } from "@/lib/utils";

function Section({
  title,
  action,
  children,
}: {
  title: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-lg border bg-card">
      <div className="flex items-center justify-between gap-2 border-b px-4 py-2.5">
        <h2 className="text-sm font-semibold">{title}</h2>
        {action}
      </div>
      <div className="p-4">{children}</div>
    </section>
  );
}

export function StackView({ stackName }: { stackName: string }) {
  const profile = useActiveProfile();
  const serviceStatus = useServiceStatus("cloudformation");
  const detailQuery = useStackDetail(profile.id, stackName);
  const templateQuery = useStackTemplate(profile.id, stackName);
  const eventsQuery = useStackEvents(profile.id, stackName);
  const resourcesQuery = useStackResources(profile.id, stackName);

  const refreshAll = () => {
    void detailQuery.refetch();
    void eventsQuery.refetch();
    void resourcesQuery.refetch();
  };
  const isFetching =
    detailQuery.isFetching || eventsQuery.isFetching || resourcesQuery.isFetching;

  if (serviceStatus === "disabled" || isServiceDisabledError(detailQuery.error)) {
    return <ServiceDisabledView service="cloudformation" />;
  }

  const detail = detailQuery.data;
  const events = eventsQuery.data ?? [];
  const resources = resourcesQuery.data ?? [];
  const error = detailQuery.error;

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="border-b px-6 py-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Layers className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <h1 className="truncate font-mono text-lg font-semibold">{stackName}</h1>
              <p className="text-xs text-muted-foreground">
                {detail ? detail.status.replace(/_/g, " ") : "Loading…"}
                {detail?.description ? ` · ${detail.description}` : ""}
              </p>
            </div>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={refreshAll}
            disabled={isFetching}
            title="Refresh stack"
          >
            <RotateCw className={cn("h-4 w-4", isFetching && "animate-spin")} />
            <span className="hidden sm:inline">Refresh</span>
          </Button>
        </div>
      </div>

      <div className="flex-1 overflow-auto p-6">
        {detailQuery.isPending ? (
          <div className="flex h-full items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : error ? (
          <div className="flex flex-col items-center gap-3 text-center">
            <CircleAlert className="h-8 w-8 text-destructive" />
            <p className="text-sm font-medium">Failed to load stack</p>
            <p className="text-xs text-muted-foreground">
              {error instanceof Error ? error.message : String(error)}
            </p>
          </div>
        ) : detail ? (
          <div className="grid gap-6">
            {/* Outputs */}
            <Section title={`Outputs (${detail.outputs.length})`}>
              {detail.outputs.length === 0 ? (
                <p className="text-xs text-muted-foreground">No outputs declared.</p>
              ) : (
                <dl className="grid gap-2">
                  {detail.outputs.map((o) => (
                    <div
                      key={o.key}
                      className="flex items-center justify-between gap-4 rounded-md border px-3 py-2"
                    >
                      <dt className="font-mono text-xs font-medium">{o.key}</dt>
                      <dd className="break-all font-mono text-xs text-muted-foreground">
                        {o.value}
                      </dd>
                    </div>
                  ))}
                </dl>
              )}
            </Section>

            {/* Resources */}
            <Section title={`Resources (${resources.length})`}>
              {resources.length === 0 ? (
                <p className="text-xs text-muted-foreground">No resources.</p>
              ) : (
                <table className="w-full text-left text-xs">
                  <thead className="text-[11px] uppercase tracking-wide text-muted-foreground">
                    <tr>
                      <th className="py-2 font-medium">Logical ID</th>
                      <th className="py-2 font-medium">Type</th>
                      <th className="py-2 font-medium">Status</th>
                      <th className="py-2 font-medium">Physical ID</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {resources.map((r) => (
                      <tr key={r.logicalId}>
                        <td className="py-2 font-mono">{r.logicalId}</td>
                        <td className="py-2 font-mono text-muted-foreground">
                          {r.resourceType}
                        </td>
                        <td className="py-2">{r.status.replace(/_/g, " ")}</td>
                        <td className="break-all py-2 font-mono text-muted-foreground">
                          {r.physicalId || "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </Section>

            {/* Events timeline */}
            <Section title={`Events (${events.length})`}>
              {events.length === 0 ? (
                <p className="text-xs text-muted-foreground">No events.</p>
              ) : (
                <ol className="relative grid gap-3 border-l pl-4">
                  {events.map((e) => (
                    <li key={e.eventId} className="relative">
                      <span
                        className={cn(
                          "absolute -left-[21px] top-1.5 size-2 rounded-full",
                          e.resourceStatus.endsWith("_COMPLETE")
                            ? "bg-emerald-500"
                            : e.resourceStatus.endsWith("_FAILED")
                              ? "bg-destructive"
                              : "bg-amber-500",
                        )}
                      />
                      <div className="flex flex-wrap items-baseline gap-x-3">
                        <span className="font-mono text-xs font-medium">
                          {e.logicalResourceId}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {e.resourceType}
                        </span>
                        <span className="text-xs">{e.resourceStatus.replace(/_/g, " ")}</span>
                        <span className="text-[11px] text-muted-foreground">
                          {e.timestamp.toLocaleTimeString()}
                        </span>
                      </div>
                      {e.statusReason && (
                        <p className="text-[11px] text-muted-foreground">{e.statusReason}</p>
                      )}
                    </li>
                  ))}
                </ol>
              )}
            </Section>

            {/* Template */}
            <Section title="Template">
              {templateQuery.isPending ? (
                <div className="flex justify-center py-4">
                  <Loader2 className="size-4 animate-spin text-muted-foreground" />
                </div>
              ) : (
                <PolicyJsonViewer json={templateQuery.data ?? "{}"} />
              )}
            </Section>
          </div>
        ) : null}
      </div>
    </div>
  );
}
