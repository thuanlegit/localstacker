import { useState } from "react";
import {
  Key,
  Search,
  Plus,
  Trash2,
  Copy,
  Check,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { DeleteConfirmDialog } from "@/components/DeleteConfirmDialog";
import { CreateKeyPairDialog } from "./CreateKeyPairDialog";
import { useKeyPairs, useKeyPairActions } from "@/hooks/use-ec2";
import type { KeyPairSummary } from "@/lib/ec2";

export function KeyPairListView() {
  const [search, setSearch] = useState("");
  const [copiedText, setCopiedText] = useState<string | null>(null);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [keyToDelete, setKeyToDelete] = useState<KeyPairSummary | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const { data: keyPairs = [], isLoading } = useKeyPairs();
  const { deleteKeyPair } = useKeyPairActions();

  const handleCopy = async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedText(text);
      toast.success(`${label} copied to clipboard`);
      setTimeout(() => setCopiedText(null), 2000);
    } catch {
      toast.error(`Failed to copy ${label}`);
    }
  };

  const handleDeleteConfirm = async () => {
    if (!keyToDelete) return;
    setIsDeleting(true);
    try {
      const ok = await deleteKeyPair(
        keyToDelete.keyName,
        keyToDelete.keyPairId,
      );
      if (ok) {
        setKeyToDelete(null);
      }
    } finally {
      setIsDeleting(false);
    }
  };

  const filteredKeyPairs = keyPairs.filter((kp) => {
    const q = search.toLowerCase();
    return (
      kp.keyName.toLowerCase().includes(q) ||
      (kp.keyPairId && kp.keyPairId.toLowerCase().includes(q)) ||
      (kp.keyFingerprint && kp.keyFingerprint.toLowerCase().includes(q)) ||
      (kp.keyType && kp.keyType.toLowerCase().includes(q))
    );
  });

  return (
    <div className="flex flex-col gap-4">
      {/* Controls */}
      <div className="flex items-center justify-between gap-3">
        <div className="relative max-w-sm flex-1">
          <Search className="absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
          <Input
            placeholder="Filter key pairs by name, fingerprint..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8"
          />
        </div>
        <Button onClick={() => setIsCreateOpen(true)} className="gap-1.5">
          <Plus className="size-4" />
          Create Key Pair
        </Button>
      </div>

      {/* Content */}
      {isLoading ? (
        <div className="flex h-48 items-center justify-center text-muted-foreground">
          Loading key pairs...
        </div>
      ) : filteredKeyPairs.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-border p-12 text-center">
          <Key className="size-12 text-muted-foreground/40 mb-3" />
          <h3 className="text-base font-semibold">No SSH key pairs found</h3>
          <p className="mt-1 text-sm text-muted-foreground max-w-sm">
            {search
              ? "No key pairs match your search query."
              : "Create an SSH key pair to configure compute instance access."}
          </p>
          {!search && (
            <Button
              onClick={() => setIsCreateOpen(true)}
              className="mt-4 gap-1.5"
              variant="outline"
            >
              <Plus className="size-4" />
              Create Key Pair
            </Button>
          )}
        </div>
      ) : (
        <div className="rounded-md border">
          <table className="w-full text-left text-sm">
            <thead className="border-b bg-muted/40 text-xs font-medium text-muted-foreground">
              <tr>
                <th className="px-4 py-3">Key Name</th>
                <th className="px-4 py-3">Key Pair ID</th>
                <th className="px-4 py-3">Type</th>
                <th className="px-4 py-3">Fingerprint</th>
                <th className="px-4 py-3">Created</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {filteredKeyPairs.map((kp) => (
                <tr
                  key={kp.keyName}
                  className="hover:bg-muted/30 transition-colors"
                >
                  {/* Name */}
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2 font-medium">
                      <Key className="size-4 text-muted-foreground" />
                      <span>{kp.keyName}</span>
                    </div>
                  </td>

                  {/* ID */}
                  <td className="px-4 py-3 font-mono text-xs">
                    {kp.keyPairId ? (
                      <div className="flex items-center gap-1.5 text-muted-foreground">
                        <span>{kp.keyPairId}</span>
                        <button
                          type="button"
                          onClick={() =>
                            handleCopy(kp.keyPairId!, "Key Pair ID")
                          }
                          className="hover:text-foreground"
                          title="Copy Key Pair ID"
                        >
                          {copiedText === kp.keyPairId ? (
                            <Check className="size-3 text-emerald-500" />
                          ) : (
                            <Copy className="size-3" />
                          )}
                        </button>
                      </div>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </td>

                  {/* Type */}
                  <td className="px-4 py-3">
                    <Badge variant="outline" className="text-xs">
                      {(kp.keyType || "rsa").toUpperCase()}
                    </Badge>
                  </td>

                  {/* Fingerprint */}
                  <td className="px-4 py-3 font-mono text-xs">
                    {kp.keyFingerprint ? (
                      <div className="flex items-center gap-1.5 text-muted-foreground">
                        <span className="truncate max-w-[200px]" title={kp.keyFingerprint}>
                          {kp.keyFingerprint}
                        </span>
                        <button
                          type="button"
                          onClick={() =>
                            handleCopy(kp.keyFingerprint!, "Fingerprint")
                          }
                          className="hover:text-foreground shrink-0"
                          title="Copy Fingerprint"
                        >
                          {copiedText === kp.keyFingerprint ? (
                            <Check className="size-3 text-emerald-500" />
                          ) : (
                            <Copy className="size-3" />
                          )}
                        </button>
                      </div>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </td>

                  {/* Created */}
                  <td className="px-4 py-3 text-xs text-muted-foreground">
                    {kp.createTime
                      ? new Date(kp.createTime).toLocaleString()
                      : "—"}
                  </td>

                  {/* Actions */}
                  <td className="px-4 py-3 text-right">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setKeyToDelete(kp)}
                      className="size-8 p-0 text-muted-foreground hover:text-destructive"
                      aria-label={`Delete key pair ${kp.keyName}`}
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Create Key Pair Modal */}
      <CreateKeyPairDialog
        open={isCreateOpen}
        onOpenChange={setIsCreateOpen}
      />

      {/* Delete Confirmation Modal */}
      <DeleteConfirmDialog
        open={Boolean(keyToDelete)}
        onOpenChange={(open) => !open && setKeyToDelete(null)}
        title="Delete Key Pair"
        description={`Are you sure you want to delete key pair "${keyToDelete?.keyName}"? Any EC2 instances launched with this key cannot be logged into using it.`}
        confirmLabel="Delete"
        onConfirm={handleDeleteConfirm}
        isPending={isDeleting}
      />
    </div>
  );
}
