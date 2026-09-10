import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  CircleAlert,
  KeyRound,
  Loader2,
  MoreHorizontal,
  Plus,
  RotateCw,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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
import { secretsKeys, useSecrets, useSecretsClient } from "@/hooks/use-secrets";
import {
  SECRET_NAME_REGEX,
  createSecret,
  deleteSecret,
  type SecretSummary,
} from "@/lib/secrets";
import { formatDate } from "@/lib/format";

function toErrorMessage(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

interface CreateSecretDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function CreateSecretDialog({ open, onOpenChange }: CreateSecretDialogProps) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [value, setValue] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const client = useSecretsClient();
  const profile = useActiveProfile();
  const queryClient = useQueryClient();

  const isValidName = SECRET_NAME_REGEX.test(name);
  const showNameError = name.length > 0 && !isValidName;
  const canSubmit = isValidName && value.trim().length > 0 && !isSubmitting;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;

    setIsSubmitting(true);
    try {
      await createSecret(client, {
        name,
        secretString: value,
        description: description.trim() || undefined,
      });
      await queryClient.invalidateQueries({
        queryKey: secretsKeys.secrets(profile.id),
      });
      toast.success(`Secret ${name} created`);
      setName("");
      setDescription("");
      setValue("");
      onOpenChange(false);
    } catch (err) {
      toast.error(toErrorMessage(err));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <form onSubmit={handleSubmit} className="min-w-0">
          <DialogHeader>
            <DialogTitle>Create secret</DialogTitle>
            <DialogDescription>
              Store a new secret in Secrets Manager.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4 min-w-0">
            <div className="space-y-2">
              <Label htmlFor="new-secret-name">Name</Label>
              <Input
                id="new-secret-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="my-secret-name"
                autoFocus
              />
              {showNameError && (
                <p className="text-xs text-destructive">
                  Letters, digits, and / _ + = . @ -
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="new-secret-description">
                Description (optional)
              </Label>
              <Input
                id="new-secret-description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Database credentials for production"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="new-secret-value">Value</Label>
              <textarea
                id="new-secret-value"
                value={value}
                onChange={(e) => setValue(e.target.value)}
                placeholder='{"username": "admin", "password": "..."}'
                className="flex min-h-[120px] w-full rounded-md border border-input bg-transparent px-3 py-2 font-mono text-sm shadow-xs placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                required
              />
            </div>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={!canSubmit}>
              {isSubmitting && (
                <Loader2 className="mr-1.5 size-4 animate-spin" />
              )}
              Create secret
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function SecretsServiceView() {
  const profile = useActiveProfile();
  const client = useSecretsClient();
  const queryClient = useQueryClient();
  const { openTab, closeTab } = useTabs();

  const serviceStatus = useServiceStatus("secrets");
  const { data, isPending, error, refetch, isFetching } = useSecrets(
    profile.id,
    { enabled: serviceStatus !== "disabled" },
  );

  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<SecretSummary | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  if (serviceStatus === "disabled" || isServiceDisabledError(error)) {
    return <ServiceDisabledView service="secrets" />;
  }

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setIsDeleting(true);
    try {
      await deleteSecret(client, deleteTarget.name);
      await queryClient.invalidateQueries({
        queryKey: secretsKeys.secrets(profile.id),
      });
      closeTab(`secret:${deleteTarget.name}`);
      toast.success(`Secret ${deleteTarget.name} deleted`);
      setDeleteTarget(null);
    } catch (err) {
      toast.error(toErrorMessage(err));
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
            <KeyRound className="h-5 w-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-base font-semibold">Secrets</h1>
              <Badge variant="secondary" className="font-mono text-xs">
                {data ? data.length : 0}
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground">
              Encrypted secrets, API keys, and credentials
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="icon"
            aria-label="Refresh secrets"
            disabled={isFetching}
            onClick={() => refetch()}
          >
            <RotateCw
              className={`size-4 ${isFetching ? "animate-spin" : ""}`}
            />
          </Button>
          <Button size="sm" onClick={() => setIsCreateOpen(true)}>
            <Plus className="mr-1.5 size-4" />
            Create secret
          </Button>
        </div>
      </div>
      {!profile.authToken && (
        <div className="border-b bg-muted/20 px-6 py-2 text-xs text-muted-foreground">
          Secrets Manager may require a LocalStack auth token (Hobby+).
          Configure one under Connections → Edit connection.
        </div>
      )}

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
          <KeyRound className="size-10 opacity-40" />
          <p className="text-sm">No secrets yet — create one to get started</p>
        </div>
      ) : (
        <div className="flex-1 overflow-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-border/40 text-xs font-semibold uppercase text-muted-foreground">
                <th className="px-4 py-2.5 font-medium">Name</th>
                <th className="px-4 py-2.5 font-medium">Description</th>
                <th className="w-44 px-4 py-2.5 text-right font-medium">
                  Created
                </th>
                <th className="w-12 px-2 py-2.5" />
              </tr>
            </thead>
            <tbody>
              {data.map((s) => (
                <tr
                  key={s.name}
                  tabIndex={0}
                  onClick={() =>
                    openTab({
                      id: `secret:${s.name}`,
                      kind: "secret",
                      secretName: s.name,
                      title: s.name,
                    })
                  }
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      openTab({
                        id: `secret:${s.name}`,
                        kind: "secret",
                        secretName: s.name,
                        title: s.name,
                      });
                    }
                  }}
                  className="cursor-pointer border-b border-border/20 transition-colors hover:bg-accent/50"
                >
                  <td className="px-4 py-2 font-medium">
                    <div className="flex items-center gap-2">
                      <KeyRound className="size-4 shrink-0 text-muted-foreground" />
                      <span className="truncate">{s.name}</span>
                    </div>
                  </td>
                  <td className="max-w-[240px] truncate px-4 py-2 text-xs text-muted-foreground">
                    {s.description || "—"}
                  </td>
                  <td className="whitespace-nowrap px-4 py-2 text-right font-mono text-xs text-muted-foreground">
                    {formatDate(s.createdDate)}
                  </td>
                  <td
                    className="px-2 py-2 text-right"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="size-7"
                          aria-label={`Actions for ${s.name}`}
                        >
                          <MoreHorizontal className="size-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem
                          className="text-destructive focus:text-destructive"
                          onClick={() => setDeleteTarget(s)}
                        >
                          Delete secret
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
      <CreateSecretDialog
        open={isCreateOpen}
        onOpenChange={setIsCreateOpen}
      />

      <DeleteConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null);
        }}
        title="Delete secret"
        description={`Delete secret “${deleteTarget?.name}”? The secret and all its versions will be permanently deleted.`}
        confirmLabel="Delete"
        isPending={isDeleting}
        onConfirm={handleDelete}
      />
    </div>
  );
}
