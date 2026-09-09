import { CircleAlert, Database, Loader2, RotateCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ServiceDisabledView } from "@/components/ServiceDisabledView";
import { isServiceDisabledError, useServiceStatus } from "@/hooks/use-health";
import { useActiveProfile } from "@/store/profiles";
import { useTabs } from "@/store/tabs";
import { useTables } from "@/hooks/use-dynamodb";

export function DynamoServiceView() {
  const profile = useActiveProfile();
  const serviceStatus = useServiceStatus("dynamodb");
  const { data: tables, isPending, error, refetch, isFetching } = useTables(profile.id);
  const openTab = useTabs((s) => s.openTab);

  if (serviceStatus === "disabled" || (error && isServiceDisabledError(error))) {
    return <ServiceDisabledView service="dynamodb" />;
  }

  const handleRowClick = (name: string) => {
    openTab({
      id: `table:${name}`,
      kind: "table",
      tableName: name,
      title: name,
    });
  };

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex items-center justify-between border-b px-6 py-4">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Database className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-lg font-semibold">DynamoDB</h1>
            <p className="text-xs text-muted-foreground">Tables & items</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => refetch()}
            disabled={isFetching}
            title="Refresh tables"
          >
            <RotateCw
              className={`h-4 w-4 ${isFetching ? "animate-spin" : ""}`}
            />
            <span className="hidden sm:inline">Refresh</span>
          </Button>
        </div>
      </div>

      {/* Body */}
      {isPending ? (
        <div className="flex flex-1 items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : error ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 text-center">
          <CircleAlert className="h-8 w-8 text-destructive" />
          <p className="text-sm font-medium">Failed to load DynamoDB tables</p>
          <p className="text-xs text-muted-foreground">
            {error instanceof Error ? error.message : String(error)}
          </p>
          <Button variant="outline" size="sm" onClick={() => refetch()}>
            Retry
          </Button>
        </div>
      ) : !tables || tables.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 text-center text-muted-foreground">
          <Database className="h-10 w-10 stroke-1" />
          <p className="text-sm font-medium">No DynamoDB tables</p>
          <p className="text-xs">
            Create tables in LocalStack via AWS CLI or SDK.
          </p>
        </div>
      ) : (
        <div className="flex-1 overflow-auto">
          <table className="w-full text-left text-sm">
            <thead className="sticky top-0 border-b bg-muted/50 text-xs font-medium text-muted-foreground">
              <tr>
                <th className="px-6 py-3">Name</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {tables.map((name) => (
                <tr
                  key={name}
                  onClick={() => handleRowClick(name)}
                  className="cursor-pointer transition-colors hover:bg-muted/50"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      handleRowClick(name);
                    }
                  }}
                >
                  <td className="px-6 py-3 font-medium">{name}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
