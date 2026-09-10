import { useState, useEffect } from "react";
import { Loader2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useHostedZoneActions } from "@/hooks/use-route53";
import type { HostedZoneSummary } from "@/lib/route53";

interface CreateHostedZoneDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated?: (zone: HostedZoneSummary) => void;
}

export function CreateHostedZoneDialog({
  open,
  onOpenChange,
  onCreated,
}: CreateHostedZoneDialogProps) {
  const [domainName, setDomainName] = useState("");
  const [comment, setComment] = useState("");
  const [privateZone, setPrivateZone] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const { createHostedZone } = useHostedZoneActions();

  useEffect(() => {
    if (open) {
      setDomainName("");
      setComment("");
      setPrivateZone(false);
      setIsSubmitting(false);
    }
  }, [open]);

  const trimmedName = domainName.trim();
  const domainRegex =
    /^[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?)*\.?$/;
  const nameError = !trimmedName
    ? "Domain name is required"
    : trimmedName.includes(" ") || !domainRegex.test(trimmedName)
      ? "Invalid domain name format (e.g. example.com or local.dev)"
      : null;

  const isValid = !nameError;

  const handleCreate = async () => {
    if (!isValid || isSubmitting) return;

    setIsSubmitting(true);
    try {
      const created = await createHostedZone({
        name: trimmedName,
        comment: comment.trim() || undefined,
        privateZone,
      });
      if (created) {
        onCreated?.(created);
        onOpenChange(false);
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle>Create Hosted Zone</DialogTitle>
          <DialogDescription>
            A hosted zone contains DNS records for routing traffic for a domain.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label htmlFor="domain-name">Domain Name</Label>
            <Input
              id="domain-name"
              placeholder="e.g. myapp.local"
              value={domainName}
              onChange={(e) => setDomainName(e.target.value)}
              disabled={isSubmitting}
            />
            {nameError && domainName.length > 0 && (
              <p className="text-xs text-destructive">{nameError}</p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="zone-comment">Comment (optional)</Label>
            <Input
              id="zone-comment"
              placeholder="Description or notes"
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              disabled={isSubmitting}
            />
          </div>

          <div className="flex items-center gap-2 pt-1">
            <input
              type="checkbox"
              id="private-zone"
              checked={privateZone}
              onChange={(e) => setPrivateZone(e.target.checked)}
              disabled={isSubmitting}
              className="h-4 w-4 rounded border-input"
            />
            <Label htmlFor="private-zone" className="text-xs cursor-pointer font-normal">
              Private hosted zone (internal VPC routing)
            </Label>
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
          <Button
            type="button"
            onClick={handleCreate}
            disabled={!isValid || isSubmitting}
          >
            {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Create Hosted Zone
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
