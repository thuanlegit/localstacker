import { useState } from "react";
import {
  ArrowLeftRight,
  CircleAlert,
  FileKey,
  Loader2,
  Lock,
  LockOpen,
  Plus,
  RotateCw,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
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
import { DeleteConfirmDialog } from "@/components/DeleteConfirmDialog";
import { ServiceDisabledView } from "@/components/ServiceDisabledView";
import { PolicyJsonViewer } from "@/components/iam/PolicyJsonViewer";
import { isServiceDisabledError, useServiceStatus } from "@/hooks/use-health";
import { useActiveProfile } from "@/store/profiles";
import {
  useKeyDetail,
  useKeyRotation,
  useKeyPolicy,
  useKmsAliases,
  useKmsActions,
} from "@/hooks/use-kms";

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

export function KeyView({ keyId }: { keyId: string }) {
  const profile = useActiveProfile();
  const serviceStatus = useServiceStatus("kms");
  const detailQuery = useKeyDetail(profile.id, keyId);
  const rotationQuery = useKeyRotation(profile.id, keyId);
  const policyQuery = useKeyPolicy(profile.id, keyId);
  const aliasesQuery = useKmsAliases(profile.id);
  const { createAlias, deleteAlias, encrypt, decrypt } = useKmsActions();

  const [isAliasOpen, setIsAliasOpen] = useState(false);
  const [aliasName, setAliasName] = useState("");
  const [isCreatingAlias, setIsCreatingAlias] = useState(false);
  const [aliasToDelete, setAliasToDelete] = useState<string | null>(null);
  const [isDeletingAlias, setIsDeletingAlias] = useState(false);

  const [plaintext, setPlaintext] = useState("");
  const [ciphertext, setCiphertext] = useState("");
  const [isEncrypting, setIsEncrypting] = useState(false);
  const [isDecrypting, setIsDecrypting] = useState(false);

  if (serviceStatus === "disabled" || isServiceDisabledError(detailQuery.error)) {
    return <ServiceDisabledView service="kms" />;
  }

  const detail = detailQuery.data;
  const keyAliases = (aliasesQuery.data ?? []).filter(
    (a) => a.targetKeyId === keyId && a.name !== "alias/aws/s3",
  );

  const handleCreateAlias = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isCreatingAlias) return;
    setIsCreatingAlias(true);
    const ok = await createAlias({ name: aliasName, targetKeyId: keyId });
    setIsCreatingAlias(false);
    if (ok) {
      setAliasName("");
      setIsAliasOpen(false);
    }
  };

  const handleDeleteAlias = async () => {
    if (!aliasToDelete) return;
    setIsDeletingAlias(true);
    try {
      const ok = await deleteAlias(aliasToDelete);
      if (ok) setAliasToDelete(null);
    } finally {
      setIsDeletingAlias(false);
    }
  };

  const handleEncrypt = async () => {
    if (!plaintext.trim()) {
      toast.error("Enter plaintext to encrypt");
      return;
    }
    setIsEncrypting(true);
    const result = await encrypt({ keyId, plaintext });
    setIsEncrypting(false);
    if (result !== null) setCiphertext(result);
  };

  const handleDecrypt = async () => {
    if (!ciphertext.trim()) {
      toast.error("Enter base64 ciphertext to decrypt");
      return;
    }
    setIsDecrypting(true);
    const result = await decrypt({ keyId, ciphertextBase64: ciphertext });
    setIsDecrypting(false);
    if (result !== null) setPlaintext(result);
  };

  const error = detailQuery.error;

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="border-b px-6 py-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <FileKey className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <h1 className="truncate font-mono text-lg font-semibold">{keyId}</h1>
              <p className="text-xs text-muted-foreground">
                {detail
                  ? `${detail.usage} · ${detail.spec} · ${detail.manager}`
                  : "Loading…"}
                {rotationQuery.data !== undefined &&
                  (rotationQuery.data ? " · rotation on" : " · rotation off")}
              </p>
            </div>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              void detailQuery.refetch();
              void aliasesQuery.refetch();
            }}
            disabled={detailQuery.isFetching}
            title="Refresh key"
          >
            <RotateCw
              className={`h-4 w-4 ${detailQuery.isFetching ? "animate-spin" : ""}`}
            />
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
            <p className="text-sm font-medium">Failed to load key</p>
            <p className="text-xs text-muted-foreground">
              {error instanceof Error ? error.message : String(error)}
            </p>
          </div>
        ) : detail ? (
          <div className="grid gap-6">
            {/* Summary */}
            <Section title="Key">
              <dl className="grid grid-cols-2 gap-x-8 gap-y-2 text-xs sm:grid-cols-3">
                <div>
                  <dt className="text-muted-foreground">ARN</dt>
                  <dd className="break-all font-mono">{detail.arn}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Description</dt>
                  <dd className="font-mono">{detail.description || "—"}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Created</dt>
                  <dd className="font-mono">
                    {detail.creationDate
                      ? detail.creationDate.toLocaleDateString()
                      : "—"}
                  </dd>
                </div>
              </dl>
            </Section>

            {/* Aliases */}
            <Section
              title={`Aliases (${keyAliases.length})`}
              action={
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setIsAliasOpen(true)}
                >
                  <Plus className="h-4 w-4" />
                  Create alias
                </Button>
              }
            >
              {keyAliases.length === 0 ? (
                <p className="text-xs text-muted-foreground">
                  No aliases point at this key.
                </p>
              ) : (
                <ul className="grid gap-2">
                  {keyAliases.map((a) => (
                    <li
                      key={a.name}
                      className="flex items-center justify-between gap-2 rounded-md border px-3 py-2"
                    >
                      <span className="font-mono text-xs">{a.name}</span>
                      <Button
                        variant="ghost"
                        size="icon-xs"
                        title={`Delete alias ${a.name}`}
                        onClick={() => setAliasToDelete(a.name)}
                      >
                        <Trash2 className="size-3.5 text-destructive" />
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
            </Section>

            {/* Encrypt / Decrypt playground */}
            <Section title="Encrypt / Decrypt playground">
              <div className="grid gap-4 lg:grid-cols-[1fr_auto_1fr]">
                <div className="grid content-start gap-2">
                  <Label htmlFor="play-plaintext">Plaintext</Label>
                  <textarea
                    id="play-plaintext"
                    className="min-h-24 w-full rounded-md border bg-background px-3 py-2 font-mono text-xs"
                    placeholder="secret payload"
                    value={plaintext}
                    onChange={(e) => setPlaintext(e.target.value)}
                  />
                  <Button
                    variant="outline"
                    size="sm"
                    className="justify-self-start"
                    onClick={() => void handleEncrypt()}
                    disabled={isEncrypting}
                  >
                    {isEncrypting ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Lock className="h-4 w-4" />
                    )}
                    Encrypt →
                  </Button>
                </div>
                <div className="flex items-center justify-center">
                  <ArrowLeftRight className="size-4 rotate-90 text-muted-foreground lg:rotate-0" />
                </div>
                <div className="grid content-start gap-2">
                  <Label htmlFor="play-ciphertext">Ciphertext (base64)</Label>
                  <textarea
                    id="play-ciphertext"
                    className="min-h-24 w-full rounded-md border bg-background px-3 py-2 font-mono text-xs"
                    placeholder="base64 ciphertext"
                    value={ciphertext}
                    onChange={(e) => setCiphertext(e.target.value)}
                  />
                  <Button
                    variant="outline"
                    size="sm"
                    className="justify-self-start"
                    onClick={() => void handleDecrypt()}
                    disabled={isDecrypting}
                  >
                    {isDecrypting ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <LockOpen className="h-4 w-4" />
                    )}
                    ← Decrypt
                  </Button>
                </div>
              </div>
            </Section>

            {/* Policy */}
            <Section title="Key policy (default)">
              {policyQuery.isPending ? (
                <div className="flex justify-center py-4">
                  <Loader2 className="size-4 animate-spin text-muted-foreground" />
                </div>
              ) : (
                <PolicyJsonViewer json={policyQuery.data ?? "{}"} />
              )}
            </Section>
          </div>
        ) : null}
      </div>

      {/* Create alias dialog */}
      <Dialog open={isAliasOpen} onOpenChange={setIsAliasOpen}>
        <DialogContent className="max-w-md">
          <form onSubmit={handleCreateAlias} className="min-w-0">
            <DialogHeader>
              <DialogTitle>Create alias</DialogTitle>
              <DialogDescription>
                Alias names must start with “alias/”.
              </DialogDescription>
            </DialogHeader>
            <div className="mt-4 grid gap-4">
              <div className="grid gap-2">
                <Label htmlFor="kms-alias-name">Alias name</Label>
                <Input
                  id="kms-alias-name"
                  placeholder="alias/orders"
                  value={aliasName}
                  onChange={(e) => setAliasName(e.target.value)}
                />
              </div>
            </div>
            <DialogFooter className="mt-6">
              <Button
                type="button"
                variant="outline"
                onClick={() => setIsAliasOpen(false)}
                disabled={isCreatingAlias}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={isCreatingAlias}>
                {isCreatingAlias ? "Creating…" : "Create alias"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <DeleteConfirmDialog
        open={Boolean(aliasToDelete)}
        onOpenChange={(open) => !open && setAliasToDelete(null)}
        title="Delete alias"
        description={`Delete alias “${aliasToDelete ?? ""}”? The key itself is not affected.`}
        confirmLabel="Delete"
        isPending={isDeletingAlias}
        onConfirm={handleDeleteAlias}
      />
    </div>
  );
}
