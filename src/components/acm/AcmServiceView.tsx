import { useState } from "react";
import {
  Award,
  BadgeCheck,
  ChevronDown,
  ChevronRight,
  CircleAlert,
  Globe,
  Loader2,
  Plus,
  RotateCw,
  Trash2,
  Upload,
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
import { DeleteConfirmDialog } from "@/components/DeleteConfirmDialog";
import { ServiceDisabledView } from "@/components/ServiceDisabledView";
import { isServiceDisabledError, useServiceStatus } from "@/hooks/use-health";
import { useActiveProfile } from "@/store/profiles";
import {
  useCertificates,
  useCertificateDetail,
  useAcmActions,
} from "@/hooks/use-acm";
import { cn } from "@/lib/utils";

const DOMAIN_REGEX = /^\*\.[a-zA-Z0-9.-]+$|^[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?)+$/;

function StatusBadge({ status }: { status: string }) {
  const tone =
    status === "ISSUED"
      ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
      : status === "PENDING_VALIDATION"
        ? "bg-amber-500/15 text-amber-600 dark:text-amber-400"
        : "bg-muted text-muted-foreground";
  return (
    <span
      data-slot="badge"
      className={cn(
        "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium",
        tone,
      )}
    >
      {status === "PENDING_VALIDATION" ? "PENDING" : status || "—"}
    </span>
  );
}

function CertRow({
  profileId,
  arn,
  domainName,
  status,
  type,
  onDelete,
}: {
  profileId: string;
  arn: string;
  domainName: string;
  status: string;
  type: string;
  onDelete: (arn: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const detailQuery = useCertificateDetail(profileId, arn, { enabled: expanded });
  const detail = detailQuery.data;

  return (
    <>
      <tr
        className="cursor-pointer transition-colors hover:bg-accent/50"
        onClick={() => setExpanded((v) => !v)}
      >
        <td className="px-6 py-3">
          <span className="flex items-center gap-2">
            {expanded ? (
              <ChevronDown className="size-3.5 text-muted-foreground" aria-hidden />
            ) : (
              <ChevronRight className="size-3.5 text-muted-foreground" aria-hidden />
            )}
            <span className="font-mono text-xs sm:text-sm">{domainName}</span>
          </span>
        </td>
        <td className="px-6 py-3">
          <StatusBadge status={status} />
        </td>
        <td className="px-6 py-3 text-xs text-muted-foreground">{type}</td>
        <td className="px-6 py-3 text-right" onClick={(e) => e.stopPropagation()}>
          <Button
            variant="ghost"
            size="icon-sm"
            title={`Delete certificate ${domainName}`}
            onClick={() => onDelete(arn)}
          >
            <Trash2 className="size-4 text-destructive" />
          </Button>
        </td>
      </tr>
      {expanded && (
        <tr>
          <td colSpan={4} className="bg-muted/30 px-6 py-4">
            {detailQuery.isPending ? (
              <div className="flex justify-center py-2">
                <Loader2 className="size-4 animate-spin text-muted-foreground" />
              </div>
            ) : detail ? (
              <div className="grid gap-4 text-xs">
                <dl className="grid grid-cols-2 gap-x-8 gap-y-1.5 sm:grid-cols-4">
                  <div>
                    <dt className="text-muted-foreground">Status</dt>
                    <dd className="font-mono">{detail.status}</dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Type</dt>
                    <dd className="font-mono">{detail.type}</dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Subject</dt>
                    <dd className="font-mono">{detail.subject || "—"}</dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Issuer</dt>
                    <dd className="font-mono">{detail.issuer || "—"}</dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Key algorithm</dt>
                    <dd className="font-mono">{detail.keyAlgorithm || "—"}</dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Not after</dt>
                    <dd className="font-mono">
                      {detail.notAfter
                        ? detail.notAfter.toLocaleDateString()
                        : "—"}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">ARN</dt>
                    <dd className="break-all font-mono">{detail.arn}</dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">SANs</dt>
                    <dd className="font-mono">
                      {detail.sans.length ? detail.sans.join(", ") : "—"}
                    </dd>
                  </div>
                </dl>
                {detail.status === "PENDING_VALIDATION" &&
                  detail.cnameRecord && (
                    <div className="rounded-md border bg-background p-3">
                      <p className="mb-1.5 flex items-center gap-1.5 text-xs font-medium">
                        <Globe className="size-3.5" aria-hidden />
                        DNS validation record ({detail.validationMethod})
                      </p>
                      <dl className="grid gap-1 font-mono text-[11px]">
                        <div>
                          <dt className="inline text-muted-foreground">Name: </dt>
                          <dd className="inline break-all">{detail.cnameRecord.name}</dd>
                        </div>
                        <div>
                          <dt className="inline text-muted-foreground">Type: </dt>
                          <dd className="inline">{detail.cnameRecord.type}</dd>
                        </div>
                        <div>
                          <dt className="inline text-muted-foreground">Value: </dt>
                          <dd className="inline break-all">{detail.cnameRecord.value}</dd>
                        </div>
                      </dl>
                    </div>
                  )}
              </div>
            ) : (
              <p className="text-xs text-destructive">
                Failed to load detail:{" "}
                {detailQuery.error instanceof Error
                  ? detailQuery.error.message
                  : String(detailQuery.error)}
              </p>
            )}
          </td>
        </tr>
      )}
    </>
  );
}

export function AcmServiceView() {
  const profile = useActiveProfile();
  const serviceStatus = useServiceStatus("acm");
  const certsQuery = useCertificates(profile.id);
  const { importCertificate, requestCertificate, deleteCertificate } = useAcmActions();

  const [isRequestOpen, setIsRequestOpen] = useState(false);
  const [isImportOpen, setIsImportOpen] = useState(false);
  const [certToDelete, setCertToDelete] = useState<{ arn: string; domain: string } | null>(
    null,
  );
  const [isDeleting, setIsDeleting] = useState(false);

  if (serviceStatus === "disabled" || isServiceDisabledError(certsQuery.error)) {
    return <ServiceDisabledView service="acm" />;
  }

  const certs = certsQuery.data ?? [];

  const handleDelete = async () => {
    if (!certToDelete) return;
    setIsDeleting(true);
    try {
      const ok = await deleteCertificate(certToDelete.arn);
      if (ok) setCertToDelete(null);
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
              <BadgeCheck className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-lg font-semibold">ACM</h1>
              <p className="text-xs text-muted-foreground">Certificates</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => certsQuery.refetch()}
              disabled={certsQuery.isFetching}
              title="Refresh certificates"
            >
              <RotateCw className={`h-4 w-4 ${certsQuery.isFetching ? "animate-spin" : ""}`} />
              <span className="hidden sm:inline">Refresh</span>
            </Button>
            <Button variant="outline" size="sm" onClick={() => setIsImportOpen(true)}>
              <Upload className="h-4 w-4" />
              Import
            </Button>
            <Button size="sm" onClick={() => setIsRequestOpen(true)}>
              <Plus className="h-4 w-4" />
              Request certificate
            </Button>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-auto">
        {certsQuery.isPending ? (
          <div className="flex h-full items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : certsQuery.error ? (
          <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
            <CircleAlert className="h-8 w-8 text-destructive" />
            <p className="text-sm font-medium">Failed to load certificates</p>
            <p className="text-xs text-muted-foreground">
              {certsQuery.error instanceof Error
                ? certsQuery.error.message
                : String(certsQuery.error)}
            </p>
            <Button variant="outline" size="sm" onClick={() => certsQuery.refetch()}>
              Retry
            </Button>
          </div>
        ) : certs.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
            <Award className="h-10 w-10 text-muted-foreground/50" />
            <div>
              <p className="text-sm font-medium">No certificates</p>
              <p className="text-xs text-muted-foreground">
                Request a DNS-validated certificate or import a PEM pair.
              </p>
            </div>
            <Button size="sm" onClick={() => setIsRequestOpen(true)}>
              <Plus className="h-4 w-4" />
              Request certificate
            </Button>
          </div>
        ) : (
          <table className="w-full text-left text-sm">
            <thead className="sticky top-0 bg-muted/50 backdrop-blur text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-6 py-3 font-medium">Domain</th>
                <th className="px-6 py-3 font-medium">Status</th>
                <th className="px-6 py-3 font-medium">Type</th>
                <th className="px-6 py-3 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {certs.map((c) => (
                <CertRow
                  key={c.arn}
                  profileId={profile.id}
                  arn={c.arn}
                  domainName={c.domainName}
                  status={c.status}
                  type={c.type}
                  onDelete={(arn) =>
                    setCertToDelete({ arn, domain: c.domainName })
                  }
                />
              ))}
            </tbody>
          </table>
        )}
      </div>

      <RequestCertDialog
        open={isRequestOpen}
        onOpenChange={setIsRequestOpen}
        onRequest={requestCertificate}
      />
      <ImportCertDialog
        open={isImportOpen}
        onOpenChange={setIsImportOpen}
        onImport={importCertificate}
      />

      <DeleteConfirmDialog
        open={Boolean(certToDelete)}
        onOpenChange={(open) => !open && setCertToDelete(null)}
        title="Delete certificate"
        description={`Delete certificate for “${certToDelete?.domain ?? ""}”?`}
        confirmLabel="Delete"
        isPending={isDeleting}
        onConfirm={handleDelete}
      />
    </div>
  );
}

function RequestCertDialog({
  open,
  onOpenChange,
  onRequest,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onRequest: (params: { domainName: string }) => Promise<string | null>;
}) {
  const [domainName, setDomainName] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const isValid = DOMAIN_REGEX.test(domainName);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isValid || isSubmitting) return;
    setIsSubmitting(true);
    const arn = await onRequest({ domainName });
    setIsSubmitting(false);
    if (arn) onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <form onSubmit={handleSubmit} className="min-w-0">
          <DialogHeader>
            <DialogTitle>Request certificate</DialogTitle>
            <DialogDescription>
              Requests a certificate with DNS validation.
            </DialogDescription>
          </DialogHeader>
          <div className="mt-4 grid gap-4">
            <div className="grid gap-2">
              <Label htmlFor="acm-domain">Domain name</Label>
              <Input
                id="acm-domain"
                placeholder="api.example.com"
                value={domainName}
                onChange={(e) => setDomainName(e.target.value)}
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
            <Button type="submit" disabled={!isValid || isSubmitting}>
              {isSubmitting ? "Requesting…" : "Request"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function ImportCertDialog({
  open,
  onOpenChange,
  onImport,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onImport: (params: {
    certificate: string;
    privateKey: string;
  }) => Promise<string | null>;
}) {
  const [certificate, setCertificate] = useState("");
  const [privateKey, setPrivateKey] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const isValid =
    certificate.includes("BEGIN CERTIFICATE") && privateKey.includes("PRIVATE KEY");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isValid || isSubmitting) return;
    setIsSubmitting(true);
    const arn = await onImport({ certificate, privateKey });
    setIsSubmitting(false);
    if (arn) {
      setCertificate("");
      setPrivateKey("");
      onOpenChange(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <form onSubmit={handleSubmit} className="min-w-0">
          <DialogHeader>
            <DialogTitle>Import certificate</DialogTitle>
            <DialogDescription>
              Paste a PEM-encoded certificate and its private key.
            </DialogDescription>
          </DialogHeader>
          <div className="mt-4 grid gap-4">
            <div className="grid gap-2">
              <Label htmlFor="acm-cert">Certificate (PEM)</Label>
              <textarea
                id="acm-cert"
                className="min-h-28 w-full rounded-md border bg-background px-3 py-2 font-mono text-xs"
                placeholder={"-----BEGIN CERTIFICATE-----\n…"}
                value={certificate}
                onChange={(e) => setCertificate(e.target.value)}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="acm-key">Private key (PEM)</Label>
              <textarea
                id="acm-key"
                className="min-h-28 w-full rounded-md border bg-background px-3 py-2 font-mono text-xs"
                placeholder={"-----BEGIN PRIVATE KEY-----\n…"}
                value={privateKey}
                onChange={(e) => setPrivateKey(e.target.value)}
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
            <Button type="submit" disabled={!isValid || isSubmitting}>
              {isSubmitting ? "Importing…" : "Import"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
