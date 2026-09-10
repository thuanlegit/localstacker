import { useState, useMemo } from "react";
import {
  Mail,
  Copy,
  Trash2,
  Send,
  Globe,
  CheckCircle2,
  Info,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { DeleteConfirmDialog } from "@/components/DeleteConfirmDialog";
import { SendEmailDialog } from "@/components/ses/SendEmailDialog";
import { useActiveProfile } from "@/store/profiles";
import { useTabs } from "@/store/tabs";
import { toast } from "sonner";
import {
  useIdentities,
  useIdentityActions,
} from "@/hooks/use-ses";

interface IdentityViewProps {
  identityName: string;
}

function statusBadgeVariant(
  status?: string,
): "default" | "secondary" | "destructive" | "outline" {
  switch ((status ?? "").toLowerCase()) {
    case "success":
    case "verified":
      return "default";
    case "pending":
      return "secondary";
    case "failed":
    case "temporaryfailure":
      return "destructive";
    default:
      return "outline";
  }
}

export function IdentityView({ identityName }: IdentityViewProps) {
  const profile = useActiveProfile();
  const { closeTab } = useTabs();
  const { data: identities } = useIdentities(profile.id);
  const { deleteIdentity } = useIdentityActions();

  const identity = useMemo(
    () => identities?.find((i) => i.identity === identityName),
    [identities, identityName],
  );

  const isEmail = identity ? identity.type === "EmailAddress" : identityName.includes("@");
  const isVerified =
    (identity?.status ?? "").toLowerCase() === "success" ||
    (identity?.status ?? "").toLowerCase() === "verified";

  const [isSendOpen, setIsSendOpen] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const handleDelete = async () => {
    setIsDeleting(true);
    try {
      const ok = await deleteIdentity(identityName);
      if (ok) {
        closeTab(`sesIdentity:${identityName}`);
      }
    } finally {
      setIsDeleting(false);
      setShowDeleteConfirm(false);
    }
  };

  const copyToClipboard = async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success(`${label} copied to clipboard`);
    } catch {
      toast.error(`Failed to copy ${label}`);
    }
  };

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between border-b px-6 py-4">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
            {isEmail ? <Mail className="h-5 w-5" /> : <Globe className="h-5 w-5" />}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-lg font-semibold font-mono">{identityName}</h1>
              <Badge
                variant={statusBadgeVariant(identity?.status)}
                className="text-xs"
              >
                {isVerified ? "Verified" : identity?.status ?? "Unknown"}
              </Badge>
              <Badge variant="outline" className="text-xs">
                {isEmail ? "Email Address" : "Domain"}
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground">
              SES Identity Configuration & Verification Details
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {isEmail && isVerified && (
            <Button size="sm" onClick={() => setIsSendOpen(true)}>
              <Send className="h-4 w-4" />
              Send test email
            </Button>
          )}
          <Button
            variant="destructive"
            size="sm"
            onClick={() => setShowDeleteConfirm(true)}
          >
            <Trash2 className="h-4 w-4" />
            Delete identity
          </Button>
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto p-6 max-w-4xl space-y-6">
        <div className="rounded-lg border bg-card p-4 space-y-4">
          <h2 className="text-sm font-semibold">Identity Overview</h2>
          <div className="grid grid-cols-2 gap-4 text-xs">
            <div>
              <span className="text-muted-foreground">Identity:</span>
              <p className="font-mono font-medium text-sm mt-0.5">{identityName}</p>
            </div>
            <div>
              <span className="text-muted-foreground">Type:</span>
              <p className="font-medium text-sm mt-0.5">
                {isEmail ? "Email Address" : "Domain"}
              </p>
            </div>
            <div>
              <span className="text-muted-foreground">Verification Status:</span>
              <div className="flex items-center gap-1.5 mt-0.5">
                {isVerified && (
                  <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                )}
                <span className="font-medium text-sm">
                  {isVerified ? "Verified" : identity?.status ?? "Unknown"}
                </span>
              </div>
            </div>
            <div>
              <span className="text-muted-foreground">Region:</span>
              <p className="font-medium text-sm mt-0.5">{profile.region}</p>
            </div>
          </div>
        </div>

        {!isEmail && (
          <div className="rounded-lg border bg-card p-4 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold">DNS Verification Record</h2>
              <Badge variant="outline" className="text-[10px]">
                TXT Record
              </Badge>
            </div>

            <p className="text-xs text-muted-foreground">
              To verify a domain identity with AWS SES in production, add this TXT
              record to your DNS provider. LocalStack verifies domain identities
              automatically.
            </p>

            <div className="space-y-3 text-xs">
              <div className="space-y-1">
                <span className="text-muted-foreground font-medium">Record Name:</span>
                <div className="flex items-center gap-2">
                  <code className="flex-1 rounded bg-muted p-2 font-mono text-xs">
                    _amazonses.{identityName}
                  </code>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 shrink-0"
                    onClick={() =>
                      copyToClipboard(
                        `_amazonses.${identityName}`,
                        "Record Name",
                      )
                    }
                    title="Copy record name"
                  >
                    <Copy className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>

              {identity?.verificationToken && (
                <div className="space-y-1">
                  <span className="text-muted-foreground font-medium">
                    Record Value (Verification Token):
                  </span>
                  <div className="flex items-center gap-2">
                    <code className="flex-1 rounded bg-muted p-2 font-mono text-xs break-all">
                      {identity.verificationToken}
                    </code>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 shrink-0"
                      onClick={() =>
                        copyToClipboard(
                          identity.verificationToken!,
                          "Verification Token",
                        )
                      }
                      title="Copy token"
                    >
                      <Copy className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              )}

              <div className="flex items-start gap-2 rounded bg-muted/40 p-2.5 text-muted-foreground text-[11px]">
                <Info className="h-4 w-4 shrink-0 mt-0.5" />
                <span>
                  LocalStack verifies identities immediately in memory. DNS configuration
                  is shown for informational reference only.
                </span>
              </div>
            </div>
          </div>
        )}
      </div>

      <SendEmailDialog
        open={isSendOpen}
        onOpenChange={setIsSendOpen}
        defaultSource={identityName}
      />

      <DeleteConfirmDialog
        open={showDeleteConfirm}
        onOpenChange={setShowDeleteConfirm}
        title="Delete Identity"
        description={`Are you sure you want to delete "${identityName}"? It will no longer be authorized to send or receive emails.`}
        confirmLabel="Delete identity"
        isPending={isDeleting}
        onConfirm={handleDelete}
      />
    </div>
  );
}
