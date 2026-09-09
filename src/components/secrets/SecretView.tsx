import { useState, useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  CircleAlert,
  Copy,
  Eye,
  EyeOff,
  KeyRound,
  Loader2,
  MoreHorizontal,
  Pencil,
  RotateCw,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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
  secretsKeys,
  useSecrets,
  useSecretsClient,
  useSecretVersions,
} from "@/hooks/use-secrets";
import {
  deleteSecret,
  getSecretValue,
  putSecretValue,
} from "@/lib/secrets";
import { formatDate } from "@/lib/format";

function toErrorMessage(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

function formatSecretDisplay(secretString?: string, secretBinary?: Uint8Array): string {
  if (secretBinary && !secretString) {
    return "(binary value)";
  }
  if (!secretString) {
    return "";
  }
  try {
    const parsed = JSON.parse(secretString);
    return JSON.stringify(parsed, null, 2);
  } catch {
    return secretString;
  }
}

interface UpdateSecretDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  secretName: string;
  initialValue?: string;
  onUpdated: (versionId?: string) => void;
}

function UpdateSecretDialog({
  open,
  onOpenChange,
  secretName,
  initialValue,
  onUpdated,
}: UpdateSecretDialogProps) {
  const [value, setValue] = useState(initialValue ?? "");
  const [isLoadingValue, setIsLoadingValue] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const client = useSecretsClient();
  const profile = useActiveProfile();
  const queryClient = useQueryClient();

  useEffect(() => {
    if (open) {
      if (initialValue !== undefined) {
        setValue(initialValue);
      } else {
        setIsLoadingValue(true);
        getSecretValue(client, { secretId: secretName })
          .then((res) => {
            setValue(res.secretString ?? "");
          })
          .catch(() => {
            // non-fatal, keep empty
          })
          .finally(() => {
            setIsLoadingValue(false);
          });
      }
    }
  }, [open, initialValue, secretName, client]);

  const canSubmit = value.trim().length > 0 && !isSubmitting && !isLoadingValue;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;

    setIsSubmitting(true);
    try {
      const res = await putSecretValue(client, {
        secretId: secretName,
        secretString: value,
      });
      await queryClient.invalidateQueries({
        queryKey: secretsKeys.versions(profile.id, secretName),
      });
      await queryClient.invalidateQueries({
        queryKey: secretsKeys.secrets(profile.id),
      });
      toast.success(
        `Secret ${secretName} updated (new version ${res.versionId ?? "—"})`,
      );
      onUpdated(res.versionId);
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
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Update secret value</DialogTitle>
            <DialogDescription>
              Create a new version of secret “{secretName}”.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="secret-value">Value</Label>
              {isLoadingValue ? (
                <div className="flex h-[120px] items-center justify-center rounded-md border border-input">
                  <Loader2 className="size-5 animate-spin text-muted-foreground" />
                </div>
              ) : (
                <textarea
                  id="secret-value"
                  value={value}
                  onChange={(e) => setValue(e.target.value)}
                  placeholder="Enter new secret value"
                  className="flex min-h-[120px] w-full rounded-md border border-input bg-transparent px-3 py-2 font-mono text-sm shadow-xs placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  required
                  autoFocus
                />
              )}
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
              Update value
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

interface RevealedState {
  raw: string;
  formatted: string;
  versionId?: string;
  createdDate?: Date;
}

export function SecretView({ secretName }: { secretName: string }) {
  const profile = useActiveProfile();
  const client = useSecretsClient();
  const queryClient = useQueryClient();
  const { closeTab } = useTabs();

  const serviceStatus = useServiceStatus("secrets");
  const {
    data: secrets,
    isPending,
    error,
    refetch,
    isFetching,
  } = useSecrets(profile.id, {
    enabled: serviceStatus !== "disabled",
  });

  const {
    data: versions,
    isPending: isVersionsPending,
    refetch: refetchVersions,
  } = useSecretVersions(secretName, {
    enabled: serviceStatus !== "disabled" && !!secretName,
  });

  const [revealed, setRevealed] = useState<RevealedState | null>(null);
  const [isRevealing, setIsRevealing] = useState(false);
  const [isUpdateOpen, setIsUpdateOpen] = useState(false);
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  if (serviceStatus === "disabled" || isServiceDisabledError(error)) {
    return (
      <ServiceDisabledView
        service="secrets"
        onRetry={() => refetch()}
        isChecking={isFetching}
      />
    );
  }

  if (isPending) {
    return (
      <div className="flex flex-1 items-center justify-center p-8">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const secret = secrets?.find((s) => s.name === secretName);

  if (!secret) {
    return (
      <div className="flex h-full flex-1 flex-col items-center justify-center gap-3 p-4 text-center">
        <CircleAlert className="size-8 text-destructive" />
        <p className="text-sm text-muted-foreground">
          Secret not found — it may have been deleted.
        </p>
      </div>
    );
  }

  const handleReveal = async (versionId?: string) => {
    setIsRevealing(true);
    try {
      const res = await getSecretValue(client, {
        secretId: secretName,
        versionId,
      });
      const formatted = formatSecretDisplay(res.secretString, res.secretBinary);
      setRevealed({
        raw: res.secretString ?? "",
        formatted,
        versionId: res.versionId,
        createdDate: res.createdDate,
      });
    } catch (err) {
      toast.error(toErrorMessage(err));
    } finally {
      setIsRevealing(false);
    }
  };

  const handleCopy = async () => {
    if (!revealed) return;
    try {
      await navigator.clipboard.writeText(revealed.formatted);
      toast.success("Secret value copied");
    } catch (err) {
      toast.error(toErrorMessage(err));
    }
  };

  const handleDelete = async () => {
    setIsDeleting(true);
    try {
      await deleteSecret(client, secretName);
      await queryClient.invalidateQueries({
        queryKey: secretsKeys.secrets(profile.id),
      });
      closeTab(`secret:${secretName}`);
      toast.success(`Secret ${secretName} deleted`);
    } catch (err) {
      toast.error(toErrorMessage(err));
    } finally {
      setIsDeleting(false);
      setIsDeleteOpen(false);
    }
  };

  return (
    <div className="flex h-full flex-col overflow-auto">
      {/* Header */}
      <div className="flex items-start justify-between border-b px-4 py-3">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <KeyRound className="size-4 text-muted-foreground" />
            <h2 className="text-sm font-semibold">{secret.name}</h2>
          </div>
          {secret.description && (
            <p className="text-xs text-muted-foreground">
              {secret.description}
            </p>
          )}
          <p className="font-mono text-xs text-muted-foreground">
            {secret.arn}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setIsUpdateOpen(true)}
          >
            <Pencil className="mr-1.5 size-3.5" />
            Update value
          </Button>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="size-8"
                aria-label={`Actions for ${secret.name}`}
              >
                <MoreHorizontal className="size-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem
                className="text-destructive focus:text-destructive"
                onClick={() => setIsDeleteOpen(true)}
              >
                Delete secret
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Main content */}
      <div className="space-y-6 p-4">
        {/* Value section */}
        <div className="space-y-2 rounded-lg border p-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase text-muted-foreground">
              Secret Value
            </span>
            <div className="flex items-center gap-1">
              {revealed ? (
                <>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleCopy}
                    aria-label="Copy secret value"
                  >
                    <Copy className="mr-1.5 size-3.5" />
                    Copy
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setRevealed(null)}
                  >
                    <EyeOff className="mr-1.5 size-3.5" />
                    Hide
                  </Button>
                </>
              ) : (
                <Button
                  variant="outline"
                  size="sm"
                  disabled={isRevealing}
                  onClick={() => handleReveal()}
                >
                  {isRevealing ? (
                    <Loader2 className="mr-1.5 size-3.5 animate-spin" />
                  ) : (
                    <Eye className="mr-1.5 size-3.5" />
                  )}
                  Reveal value
                </Button>
              )}
            </div>
          </div>

          {revealed ? (
            <div className="space-y-2">
              <pre className="whitespace-pre-wrap break-all rounded-md bg-muted/50 p-2 font-mono text-xs">
                {revealed.formatted}
              </pre>
              <div className="flex items-center gap-2 font-mono text-xs text-muted-foreground">
                <span>Version: {revealed.versionId ?? "—"}</span>
                <span>·</span>
                <span>Created: {formatDate(revealed.createdDate)}</span>
              </div>
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">
              Value is hidden. Click Reveal value to inspect.
            </p>
          )}
        </div>

        {/* Versions section */}
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold uppercase text-muted-foreground">
              Versions
            </span>
            <Badge variant="secondary" className="font-mono text-xs">
              {versions ? versions.length : 0}
            </Badge>
            <div className="flex-1" />
            <Button
              variant="ghost"
              size="icon"
              className="size-7"
              aria-label="Refresh versions"
              onClick={() => refetchVersions()}
            >
              <RotateCw className="size-3.5" />
            </Button>
          </div>

          {isVersionsPending ? (
            <div className="flex justify-center p-4">
              <Loader2 className="size-5 animate-spin text-muted-foreground" />
            </div>
          ) : !versions || versions.length === 0 ? (
            <p className="text-xs text-muted-foreground">No versions found.</p>
          ) : (
            <div className="rounded-md border">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-border/40 text-xs font-semibold uppercase text-muted-foreground">
                    <th className="px-3 py-2 font-medium">Version ID</th>
                    <th className="px-3 py-2 font-medium">Stages</th>
                    <th className="px-3 py-2 text-right font-medium">
                      Created
                    </th>
                    <th className="w-20 px-3 py-2 text-right font-medium">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {versions.map((v) => (
                    <tr
                      key={v.versionId}
                      className="border-b border-border/20 last:border-0"
                    >
                      <td className="px-3 py-2 font-mono text-xs">
                        {v.versionId}
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex flex-wrap gap-1">
                          {v.stages.map((st) => (
                            <Badge
                              key={st}
                              variant={
                                st === "AWSCURRENT" ? "default" : "secondary"
                              }
                              className="px-1.5 py-0 text-[10px]"
                            >
                              {st}
                            </Badge>
                          ))}
                        </div>
                      </td>
                      <td className="whitespace-nowrap px-3 py-2 text-right font-mono text-xs text-muted-foreground">
                        {formatDate(v.createdDate)}
                      </td>
                      <td className="px-3 py-2 text-right">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 px-2 text-xs"
                          onClick={() => handleReveal(v.versionId)}
                        >
                          Reveal
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      <UpdateSecretDialog
        open={isUpdateOpen}
        onOpenChange={setIsUpdateOpen}
        secretName={secretName}
        initialValue={revealed?.raw}
        onUpdated={() => {
          handleReveal();
        }}
      />

      <DeleteConfirmDialog
        open={isDeleteOpen}
        onOpenChange={setIsDeleteOpen}
        title="Delete secret"
        description={`Delete secret “${secret.name}”? The secret and all its versions will be permanently deleted.`}
        confirmLabel="Delete"
        isPending={isDeleting}
        onConfirm={handleDelete}
      />
    </div>
  );
}
