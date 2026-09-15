import { useState } from "react";
import {
  CircleAlert,
  FileKey,
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
  useKmsKeys,
  useKmsAliases,
  useKmsActions,
} from "@/hooks/use-kms";

function StateBadge({ state }: { state: string }) {
  const dot =
    state === "Enabled"
      ? "bg-emerald-500"
      : state === "PendingDeletion"
        ? "bg-destructive"
        : "bg-muted-foreground";
  return (
    <span
      data-slot="badge"
      className="inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground"
    >
      <span className={`mr-1.5 inline-block size-1.5 rounded-full ${dot}`} />
      {state}
    </span>
  );
}

export function KmsServiceView() {
  const profile = useActiveProfile();
  const serviceStatus = useServiceStatus("kms");
  const keysQuery = useKmsKeys(profile.id);
  const aliasesQuery = useKmsAliases(profile.id);
  const { createKey, deleteKey } = useKmsActions();
  const { openTab } = useTabs();

  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [keyToDelete, setKeyToDelete] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  if (serviceStatus === "disabled" || isServiceDisabledError(keysQuery.error)) {
    return <ServiceDisabledView service="kms" />;
  }

  const keys = keysQuery.data ?? [];
  const aliasCountFor = (keyId: string) =>
    aliasesQuery.data?.filter((a) => a.targetKeyId === keyId).length ?? 0;

  const handleDelete = async () => {
    if (!keyToDelete) return;
    setIsDeleting(true);
    try {
      const ok = await deleteKey(keyToDelete);
      if (ok) setKeyToDelete(null);
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="border-b px-6 py-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <FileKey className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-lg font-semibold">KMS</h1>
              <p className="text-xs text-muted-foreground">Keys & encryption</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => keysQuery.refetch()}
              disabled={keysQuery.isFetching}
              title="Refresh keys"
            >
              <RotateCw className={`h-4 w-4 ${keysQuery.isFetching ? "animate-spin" : ""}`} />
              <span className="hidden sm:inline">Refresh</span>
            </Button>
            <Button size="sm" onClick={() => setIsCreateOpen(true)}>
              <Plus className="h-4 w-4" />
              Create key
            </Button>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-auto">
        {keysQuery.isPending ? (
          <div className="flex h-full items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : keysQuery.error ? (
          <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
            <CircleAlert className="h-8 w-8 text-destructive" />
            <p className="text-sm font-medium">Failed to load keys</p>
            <p className="text-xs text-muted-foreground">
              {keysQuery.error instanceof Error
                ? keysQuery.error.message
                : String(keysQuery.error)}
            </p>
            <Button variant="outline" size="sm" onClick={() => keysQuery.refetch()}>
              Retry
            </Button>
          </div>
        ) : keys.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
            <FileKey className="h-10 w-10 text-muted-foreground/50" />
            <div>
              <p className="text-sm font-medium">No keys</p>
              <p className="text-xs text-muted-foreground">
                Create a symmetric key to encrypt and decrypt data.
              </p>
            </div>
            <Button size="sm" onClick={() => setIsCreateOpen(true)}>
              <Plus className="h-4 w-4" />
              Create key
            </Button>
          </div>
        ) : (
          <table className="w-full text-left text-sm">
            <thead className="sticky top-0 bg-muted/50 backdrop-blur text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-6 py-3 font-medium">Key ID</th>
                <th className="px-6 py-3 font-medium">State</th>
                <th className="px-6 py-3 font-medium">Aliases</th>
                <th className="px-6 py-3 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {keys.map((k) => (
                <tr
                  key={k.keyId}
                  className="cursor-pointer transition-colors hover:bg-accent/50"
                  onClick={() =>
                    openTab({
                      id: `kmsKey:${k.keyId}`,
                      kind: "kmsKey",
                      keyId: k.keyId,
                      title: k.keyId,
                    })
                  }
                >
                  <td className="px-6 py-3">
                    <span className="font-mono text-xs sm:text-sm">{k.keyId}</span>
                  </td>
                  <td className="px-6 py-3">
                    <StateBadge state="Enabled" />
                  </td>
                  <td className="px-6 py-3 text-xs text-muted-foreground">
                    {aliasCountFor(k.keyId)}
                  </td>
                  <td className="px-6 py-3 text-right" onClick={(e) => e.stopPropagation()}>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon-sm" title={`Actions for ${k.keyId}`}>
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem
                          className="text-destructive focus:text-destructive"
                          onClick={() => setKeyToDelete(k.keyId)}
                        >
                          <Trash2 className="mr-2 h-4 w-4" />
                          Schedule deletion
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <CreateKeyDialog
        open={isCreateOpen}
        onOpenChange={setIsCreateOpen}
        onCreate={createKey}
      />

      <DeleteConfirmDialog
        open={Boolean(keyToDelete)}
        onOpenChange={(open) => !open && setKeyToDelete(null)}
        title="Schedule key deletion"
        description={`Schedule deletion of key “${keyToDelete ?? ""}”? The key becomes unusable after a 7 day waiting period.`}
        confirmLabel="Schedule deletion"
        isPending={isDeleting}
        onConfirm={handleDelete}
      />
    </div>
  );
}

function CreateKeyDialog({
  open,
  onOpenChange,
  onCreate,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreate: (params: { description: string }) => Promise<string | null>;
}) {
  const [description, setDescription] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;
    setIsSubmitting(true);
    const keyId = await onCreate({ description: description.trim() });
    setIsSubmitting(false);
    if (keyId) {
      setDescription("");
      onOpenChange(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <form onSubmit={handleSubmit} className="min-w-0">
          <DialogHeader>
            <DialogTitle>Create key</DialogTitle>
            <DialogDescription>
              Creates a symmetric ENCRYPT_DECRYPT key.
            </DialogDescription>
          </DialogHeader>
          <div className="mt-4 grid gap-4">
            <div className="grid gap-2">
              <Label htmlFor="kms-description">Description (optional)</Label>
              <Input
                id="kms-description"
                placeholder="orders encryption key"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter className="mt-6">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? "Creating…" : "Create key"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
