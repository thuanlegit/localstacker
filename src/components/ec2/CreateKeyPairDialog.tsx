import { useState, useEffect } from "react";
import { Loader2, Key } from "lucide-react";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useKeyPairActions } from "@/hooks/use-ec2";
import type { CreatedKeyPair } from "@/lib/ec2";

interface CreateKeyPairDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated?: (keyPair: CreatedKeyPair) => void;
}

export function CreateKeyPairDialog({
  open,
  onOpenChange,
  onCreated,
}: CreateKeyPairDialogProps) {
  const [keyName, setKeyName] = useState("");
  const [keyType, setKeyType] = useState<"rsa" | "ed25519">("rsa");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const { createKeyPair } = useKeyPairActions();

  useEffect(() => {
    if (open) {
      setKeyName("");
      setKeyType("rsa");
      setIsSubmitting(false);
    }
  }, [open]);

  const trimmed = keyName.trim();
  const nameRegex = /^[a-zA-Z0-9._\-]+$/;
  const nameError = !trimmed
    ? "Key name is required"
    : !nameRegex.test(trimmed)
      ? "Key name may only contain alphanumeric characters, periods, underscores, and dashes"
      : null;

  const isValid = !nameError;

  const handleCreate = async () => {
    if (!isValid || isSubmitting) return;

    setIsSubmitting(true);
    try {
      const created = await createKeyPair({
        keyName: trimmed,
        keyType,
      });

      if (created) {
        // Trigger automatic client-side .pem download
        const blob = new Blob([created.keyMaterial], {
          type: "application/x-pem-file",
        });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `${created.keyName}.pem`;
        a.click();
        URL.revokeObjectURL(url);

        onCreated?.(created);
        onOpenChange(false);
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[450px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Key className="size-4 text-primary" />
            Create SSH Key Pair
          </DialogTitle>
          <DialogDescription>
            Create an EC2 key pair. The private key (.pem) will be downloaded
            automatically and cannot be retrieved later.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4 py-2">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="key-name">Key Pair Name</Label>
            <Input
              id="key-name"
              placeholder="e.g. dev-bastion-key"
              value={keyName}
              onChange={(e) => setKeyName(e.target.value)}
              disabled={isSubmitting}
            />
            {trimmed.length > 0 && nameError && (
              <span className="text-xs text-destructive">{nameError}</span>
            )}
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="key-type">Key Type</Label>
            <Select
              value={keyType}
              onValueChange={(v) => setKeyType(v as "rsa" | "ed25519")}
              disabled={isSubmitting}
            >
              <SelectTrigger id="key-type" className="w-full">
                <SelectValue placeholder="Select type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="rsa">RSA (Standard 2048-bit)</SelectItem>
                <SelectItem value="ed25519">ED25519 (Elliptic Curve)</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
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
            {isSubmitting ? (
              <>
                <Loader2 className="mr-2 size-4 animate-spin" />
                Creating...
              </>
            ) : (
              "Create Key Pair"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
