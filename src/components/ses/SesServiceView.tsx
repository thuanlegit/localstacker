import { useState } from "react";
import {
  Mail,
  CircleAlert,
  Loader2,
  MoreHorizontal,
  Plus,
  RotateCw,
  Trash2,
  Inbox,
  Send,
  Globe,
} from "lucide-react";
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
import { SendEmailDialog } from "@/components/ses/SendEmailDialog";
import { isServiceDisabledError, useServiceStatus } from "@/hooks/use-health";
import { useActiveProfile } from "@/store/profiles";
import { useTabs } from "@/store/tabs";
import {
  useIdentities,
  useIdentityActions,
} from "@/hooks/use-ses";
import type { IdentitySummary } from "@/lib/ses";

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const DOMAIN_REGEX = /^[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;

interface VerifyEmailDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onVerified: (email: string) => void;
}

function VerifyEmailDialog({
  open,
  onOpenChange,
  onVerified,
}: VerifyEmailDialogProps) {
  const [email, setEmail] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { verifyEmailIdentity } = useIdentityActions();

  const trimmed = email.trim();
  const isValid = EMAIL_REGEX.test(trimmed);
  const showError = trimmed.length > 0 && !isValid;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isValid || isSubmitting) return;

    setIsSubmitting(true);
    try {
      const ok = await verifyEmailIdentity(trimmed);
      if (ok) {
        setEmail("");
        onOpenChange(false);
        onVerified(trimmed);
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
            <DialogTitle>Verify Email Identity</DialogTitle>
            <DialogDescription>
              Verify an email address to send or receive emails in LocalStack SES.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4 min-w-0">
            <div className="space-y-2">
              <Label htmlFor="email-address">Email address</Label>
              <Input
                id="email-address"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="user@example.com"
                autoFocus
              />
              {showError ? (
                <p className="text-xs text-destructive">
                  Please enter a valid email address (e.g. user@example.com)
                </p>
              ) : (
                <p className="text-xs text-muted-foreground">
                  In LocalStack, verification succeeds immediately.
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
              {isSubmitting ? "Verifying..." : "Verify email"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

interface VerifyDomainDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onVerified: (domain: string) => void;
}

function VerifyDomainDialog({
  open,
  onOpenChange,
  onVerified,
}: VerifyDomainDialogProps) {
  const [domain, setDomain] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { verifyDomainIdentity } = useIdentityActions();

  const trimmed = domain.trim();
  const isValid = DOMAIN_REGEX.test(trimmed);
  const showError = trimmed.length > 0 && !isValid;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isValid || isSubmitting) return;

    setIsSubmitting(true);
    try {
      const token = await verifyDomainIdentity(trimmed);
      if (token) {
        setDomain("");
        onOpenChange(false);
        onVerified(trimmed);
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
            <DialogTitle>Verify Domain Identity</DialogTitle>
            <DialogDescription>
              Verify an entire domain to allow sending from any address under it.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4 min-w-0">
            <div className="space-y-2">
              <Label htmlFor="domain-name">Domain name</Label>
              <Input
                id="domain-name"
                value={domain}
                onChange={(e) => setDomain(e.target.value)}
                placeholder="example.com"
                autoFocus
              />
              {showError ? (
                <p className="text-xs text-destructive">
                  Please enter a valid domain name (e.g. example.com)
                </p>
              ) : (
                <p className="text-xs text-muted-foreground">
                  Returns a TXT verification token for DNS configuration.
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
              {isSubmitting ? "Verifying..." : "Verify domain"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
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

function statusLabel(status?: string): string {
  switch ((status ?? "").toLowerCase()) {
    case "success":
    case "verified":
      return "Verified";
    case "pending":
      return "Pending";
    case "failed":
      return "Failed";
    case "temporaryfailure":
      return "Temp Failure";
    default:
      return status ?? "Not Found";
  }
}

export function SesServiceView() {
  const profile = useActiveProfile();
  const serviceStatus = useServiceStatus("ses");
  const {
    data: identities,
    isPending,
    error,
    refetch,
    isFetching,
  } = useIdentities(profile.id);
  const { deleteIdentity } = useIdentityActions();
  const { openTab, closeTab } = useTabs();

  const [isVerifyEmailOpen, setIsVerifyEmailOpen] = useState(false);
  const [isVerifyDomainOpen, setIsVerifyDomainOpen] = useState(false);
  const [isSendEmailOpen, setIsSendEmailOpen] = useState(false);
  const [identityToDelete, setIdentityToDelete] =
    useState<IdentitySummary | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  if (
    serviceStatus === "disabled" ||
    (error && isServiceDisabledError(error))
  ) {
    return <ServiceDisabledView service="ses" />;
  }

  const handleRowClick = (id: IdentitySummary) => {
    openTab({
      id: `sesIdentity:${id.identity}`,
      kind: "sesIdentity",
      identityName: id.identity,
      title: id.identity,
    });
  };

  const handleOpenMailbox = () => {
    openTab({
      id: "sesMailbox:captured",
      kind: "sesMailbox",
      title: "SES Mailbox",
    });
  };

  const handleDelete = async () => {
    if (!identityToDelete) return;
    setIsDeleting(true);
    try {
      const ok = await deleteIdentity(identityToDelete.identity);
      if (ok) {
        closeTab(`sesIdentity:${identityToDelete.identity}`);
        setIdentityToDelete(null);
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
            <Mail className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-lg font-semibold">SES</h1>
            <p className="text-xs text-muted-foreground">
              Email identities & mailbox
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => refetch()}
            disabled={isFetching}
            title="Refresh identities"
          >
            <RotateCw
              className={`h-4 w-4 ${isFetching ? "animate-spin" : ""}`}
            />
            <span className="hidden sm:inline">Refresh</span>
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={handleOpenMailbox}
            title="Open LocalStack captured mailbox"
          >
            <Inbox className="h-4 w-4" />
            <span className="hidden sm:inline">Captured mailbox</span>
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setIsSendEmailOpen(true)}
          >
            <Send className="h-4 w-4" />
            Send email
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setIsVerifyDomainOpen(true)}
          >
            <Globe className="h-4 w-4" />
            Verify domain
          </Button>
          <Button size="sm" onClick={() => setIsVerifyEmailOpen(true)}>
            <Plus className="h-4 w-4" />
            Verify email
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
          <p className="text-sm font-medium">Failed to load SES identities</p>
          <p className="text-xs text-muted-foreground">
            {error instanceof Error ? error.message : String(error)}
          </p>
          <Button variant="outline" size="sm" onClick={() => refetch()}>
            Retry
          </Button>
        </div>
      ) : !identities || identities.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 text-center text-muted-foreground">
          <Mail className="h-10 w-10 stroke-1" />
          <p className="text-sm font-medium">No verified identities</p>
          <p className="text-xs">
            Verify an email address or domain to start sending messages.
          </p>
          <div className="mt-2 flex items-center gap-2">
            <Button size="sm" onClick={() => setIsVerifyEmailOpen(true)}>
              <Plus className="h-4 w-4" />
              Verify your first email
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setIsVerifyDomainOpen(true)}
            >
              <Globe className="h-4 w-4" />
              Verify domain
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex-1 overflow-auto">
          <table className="w-full text-left text-sm">
            <thead className="sticky top-0 border-b bg-muted/50 text-xs font-medium text-muted-foreground">
              <tr>
                <th className="px-6 py-3">Identity</th>
                <th className="px-6 py-3">Type</th>
                <th className="px-6 py-3">Status</th>
                <th className="w-12 px-6 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {identities.map((id) => (
                <tr
                  key={id.identity}
                  onClick={() => handleRowClick(id)}
                  className="cursor-pointer transition-colors hover:bg-muted/50"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      handleRowClick(id);
                    }
                  }}
                >
                  <td className="px-6 py-3.5 font-mono font-medium text-xs">
                    {id.identity}
                  </td>
                  <td className="px-6 py-3.5 text-xs">
                    <Badge variant="outline" className="text-[10px]">
                      {id.type === "EmailAddress" ? "Email" : "Domain"}
                    </Badge>
                  </td>
                  <td className="px-6 py-3.5 text-xs">
                    <Badge
                      variant={statusBadgeVariant(id.status)}
                      className="text-[10px]"
                    >
                      {statusLabel(id.status)}
                    </Badge>
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
                          aria-label={`Actions for ${id.identity}`}
                        >
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem
                          className="text-destructive focus:text-destructive"
                          onClick={() => setIdentityToDelete(id)}
                        >
                          <Trash2 className="mr-2 h-4 w-4" />
                          Delete identity
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

      <VerifyEmailDialog
        open={isVerifyEmailOpen}
        onOpenChange={setIsVerifyEmailOpen}
        onVerified={(email) => {
          openTab({
            id: `sesIdentity:${email}`,
            kind: "sesIdentity",
            identityName: email,
            title: email,
          });
        }}
      />

      <VerifyDomainDialog
        open={isVerifyDomainOpen}
        onOpenChange={setIsVerifyDomainOpen}
        onVerified={(domain) => {
          openTab({
            id: `sesIdentity:${domain}`,
            kind: "sesIdentity",
            identityName: domain,
            title: domain,
          });
        }}
      />

      <SendEmailDialog
        open={isSendEmailOpen}
        onOpenChange={setIsSendEmailOpen}
      />

      <DeleteConfirmDialog
        open={Boolean(identityToDelete)}
        onOpenChange={(open) => {
          if (!open) setIdentityToDelete(null);
        }}
        title="Delete Identity"
        description={`Are you sure you want to delete identity "${identityToDelete?.identity}"? It will no longer be authorized to send emails.`}
        confirmLabel="Delete identity"
        isPending={isDeleting}
        onConfirm={handleDelete}
      />
    </div>
  );
}
