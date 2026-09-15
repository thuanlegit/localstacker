import { useState } from "react";
import {
  Network,
  CircleAlert,
  Loader2,
  MoreHorizontal,
  Plus,
  RotateCw,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import {
  useRestApis,
  useRestApiActions,
} from "@/hooks/use-apigateway";
import type { RestApiSummary } from "@/lib/apigateway";

interface CreateApiDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: (api: RestApiSummary) => void;
}

function CreateApiDialog({
  open,
  onOpenChange,
  onCreated,
}: CreateApiDialogProps) {
  const [name, setName] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { createRestApi } = useRestApiActions();

  const trimmed = name.trim();
  const isValid = trimmed.length > 0 && trimmed.length <= 256;
  const showError = name.length > 0 && !isValid;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isValid || isSubmitting) return;

    setIsSubmitting(true);
    try {
      const summary = await createRestApi(trimmed);
      if (summary) {
        setName("");
        onOpenChange(false);
        onCreated(summary);
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <form onSubmit={handleSubmit} className="min-w-0">
          <DialogHeader>
            <DialogTitle>Create REST API</DialogTitle>
            <DialogDescription>
              Create a new API Gateway REST API.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4 min-w-0">
            <div className="space-y-2">
              <Label htmlFor="api-name">API name</Label>
              <Input
                id="api-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="my-rest-api"
                autoFocus
              />
              {showError ? (
                <p className="text-xs text-destructive">
                  Name must be between 1 and 256 characters
                </p>
              ) : (
                <p className="text-xs text-muted-foreground">
                  Up to 256 characters.
                </p>
              )}
            </div>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={!isValid || isSubmitting}>
              {isSubmitting ? "Creating..." : "Create API"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function ApigatewayServiceView() {
  const profile = useActiveProfile();
  const serviceStatus = useServiceStatus("apigateway");
  const {
    data: apis,
    isPending,
    error,
    refetch,
    isFetching,
  } = useRestApis(profile.id);
  const { deleteRestApi } = useRestApiActions();
  const { openTab, closeTab } = useTabs();

  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [apiToDelete, setApiToDelete] = useState<RestApiSummary | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  if (
    serviceStatus === "disabled" ||
    (error && isServiceDisabledError(error))
  ) {
    return <ServiceDisabledView service="apigateway" />;
  }

  const handleRowClick = (api: RestApiSummary) => {
    openTab({
      id: `restApi:${api.id}`,
      kind: "restApi",
      restApiId: api.id,
      title: api.name,
    });
  };

  const handleDelete = async () => {
    if (!apiToDelete) return;
    setIsDeleting(true);
    try {
      const ok = await deleteRestApi(apiToDelete.id);
      if (ok) {
        closeTab(`restApi:${apiToDelete.id}`);
        setApiToDelete(null);
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
            <Network className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-lg font-semibold">API Gateway</h1>
            <p className="text-xs text-muted-foreground">
              REST APIs & stages
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => refetch()}
            disabled={isFetching}
            title="Refresh REST APIs"
          >
            <RotateCw
              className={`h-4 w-4 ${isFetching ? "animate-spin" : ""}`}
            />
            <span className="hidden sm:inline">Refresh</span>
          </Button>
          <Button size="sm" onClick={() => setIsCreateOpen(true)}>
            <Plus className="h-4 w-4" />
            Create API
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
          <p className="text-sm font-medium">Failed to load REST APIs</p>
          <p className="text-xs text-muted-foreground">
            {error instanceof Error ? error.message : String(error)}
          </p>
          <Button variant="outline" size="sm" onClick={() => refetch()}>
            Retry
          </Button>
        </div>
      ) : !apis || apis.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 text-center text-muted-foreground">
          <Network className="h-10 w-10 stroke-1" />
          <p className="text-sm font-medium">No REST APIs</p>
          <p className="text-xs">
            Create a REST API to get started.
          </p>
          <Button
            size="sm"
            className="mt-2"
            onClick={() => setIsCreateOpen(true)}
          >
            <Plus className="h-4 w-4" />
            Create your first API
          </Button>
        </div>
      ) : (
        <div className="flex-1 overflow-auto">
          <table className="w-full text-left text-sm">
            <thead className="sticky top-0 border-b bg-muted/50 text-xs font-medium text-muted-foreground">
              <tr>
                <th className="px-6 py-3">Name</th>
                <th className="px-6 py-3">API ID</th>
                <th className="px-6 py-3">Created</th>
                <th className="w-12 px-6 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {apis.map((api) => (
                <tr
                  key={api.id}
                  onClick={() => handleRowClick(api)}
                  className="cursor-pointer transition-colors hover:bg-muted/50"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      handleRowClick(api);
                    }
                  }}
                >
                  <td className="px-6 py-3.5 font-medium">{api.name}</td>
                  <td className="px-6 py-3.5 font-mono text-xs text-muted-foreground">
                    {api.id}
                  </td>
                  <td className="px-6 py-3.5 text-xs text-muted-foreground">
                    {api.createdDate
                      ? new Date(api.createdDate).toLocaleDateString()
                      : "—"}
                  </td>
                  <td
                    className="px-6 py-3.5 text-right"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          aria-label={`Actions for ${api.name}`}
                        >
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem
                          className="text-destructive focus:text-destructive"
                          onClick={() => setApiToDelete(api)}
                        >
                          <Trash2 className="mr-2 h-4 w-4" />
                          Delete API
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

      <CreateApiDialog
        open={isCreateOpen}
        onOpenChange={setIsCreateOpen}
        onCreated={(api) => {
          openTab({
            id: `restApi:${api.id}`,
            kind: "restApi",
            restApiId: api.id,
            title: api.name,
          });
        }}
      />

      <DeleteConfirmDialog
        open={Boolean(apiToDelete)}
        onOpenChange={(open) => {
          if (!open) setApiToDelete(null);
        }}
        title="Delete REST API"
        description={`Are you sure you want to delete "${apiToDelete?.name}" (${apiToDelete?.id})? This will delete all resources, methods, and stages.`}
        confirmLabel="Delete API"
        isPending={isDeleting}
        onConfirm={handleDelete}
      />
    </div>
  );
}
