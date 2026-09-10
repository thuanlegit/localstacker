import { useState } from "react";
import {
  BookOpen,
  CircleAlert,
  Database,
  Loader2,
  MoreHorizontal,
  Plus,
  RotateCw,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { DeleteConfirmDialog } from "@/components/DeleteConfirmDialog";
import { ServiceDisabledView } from "@/components/ServiceDisabledView";
import { isServiceDisabledError, useServiceStatus } from "@/hooks/use-health";
import { useActiveProfile } from "@/store/profiles";
import { useTabs } from "@/store/tabs";
import { useTables, useTableActions } from "@/hooks/use-dynamodb";
import { CreateTableDialog } from "./CreateTableDialog";
import { DynamoGuideDialog } from "./DynamoGuideDialog";
import { DynamoGuideCard } from "./DynamoGuideCard";

export function DynamoServiceView() {
  const profile = useActiveProfile();
  const serviceStatus = useServiceStatus("dynamodb");
  const {
    data: tables,
    isPending,
    error,
    refetch,
    isFetching,
  } = useTables(profile.id);
  const openTab = useTabs((s) => s.openTab);

  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isGuideOpen, setIsGuideOpen] = useState(false);
  const [tableToDelete, setTableToDelete] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const { deleteTable } = useTableActions();

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

  const handleDeleteConfirm = async () => {
    if (!tableToDelete) return;
    setIsDeleting(true);
    try {
      const ok = await deleteTable(tableToDelete);
      if (ok) {
        setTableToDelete(null);
      }
    } finally {
      setIsDeleting(false);
    }
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
            onClick={() => setIsGuideOpen(true)}
            className="gap-1.5"
            title="DynamoDB Setup & CLI/SDK Guide"
          >
            <BookOpen className="h-4 w-4" />
            <span className="hidden sm:inline">Guide</span>
          </Button>

          <Button
            size="sm"
            onClick={() => setIsCreateOpen(true)}
            className="gap-1.5"
          >
            <Plus className="h-4 w-4" />
            <span className="hidden sm:inline">Create table</span>
          </Button>

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
        <DynamoGuideCard
          onCreateTable={() => setIsCreateOpen(true)}
          onOpenGuide={() => setIsGuideOpen(true)}
          onTableCreated={(name) => handleRowClick(name)}
        />
      ) : (
        <div className="flex-1 overflow-auto">
          <table className="w-full text-left text-sm">
            <thead className="sticky top-0 border-b bg-muted/50 text-xs font-medium text-muted-foreground">
              <tr>
                <th className="px-6 py-3">Name</th>
                <th className="w-12 px-6 py-3 text-right">Actions</th>
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
                  <td className="px-6 py-3 font-medium">
                    <span className="font-mono text-xs sm:text-sm">{name}</span>
                  </td>
                  <td
                    className="px-6 py-3 text-right"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon-xs"
                          aria-label={`Actions for ${name}`}
                        >
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem
                          className="text-destructive focus:text-destructive"
                          onClick={() => setTableToDelete(name)}
                        >
                          <Trash2 className="h-4 w-4 mr-2" />
                          Delete table
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Dialogs */}
      <CreateTableDialog
        open={isCreateOpen}
        onOpenChange={setIsCreateOpen}
        onCreated={(name) => handleRowClick(name)}
      />

      <DynamoGuideDialog
        open={isGuideOpen}
        onOpenChange={setIsGuideOpen}
        onCreateTableClick={() => setIsCreateOpen(true)}
      />

      <DeleteConfirmDialog
        open={tableToDelete !== null}
        onOpenChange={(open) => {
          if (!open) setTableToDelete(null);
        }}
        title="Delete table"
        description={`Are you sure you want to delete table "${tableToDelete}"? All items will be permanently removed. This action cannot be undone.`}
        confirmLabel="Delete table"
        isPending={isDeleting}
        onConfirm={handleDeleteConfirm}
      />
    </div>
  );
}
