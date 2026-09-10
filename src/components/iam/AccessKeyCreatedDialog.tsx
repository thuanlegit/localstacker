import { useState } from "react";
import { AlertTriangle, Check, Copy } from "lucide-react";
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
import { toast } from "sonner";
import type { CreatedAccessKey } from "@/lib/iam";

interface AccessKeyCreatedDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  accessKey: CreatedAccessKey | null;
}

export function AccessKeyCreatedDialog({
  open,
  onOpenChange,
  accessKey,
}: AccessKeyCreatedDialogProps) {
  const [copiedKey, setCopiedKey] = useState(false);
  const [copiedSecret, setCopiedSecret] = useState(false);

  if (!accessKey) return null;

  const copyKeyId = async () => {
    try {
      await navigator.clipboard.writeText(accessKey.accessKeyId);
      setCopiedKey(true);
      toast.success("Access Key ID copied");
      setTimeout(() => setCopiedKey(false), 2000);
    } catch {
      toast.error("Failed to copy Access Key ID");
    }
  };

  const copySecret = async () => {
    try {
      await navigator.clipboard.writeText(accessKey.secretAccessKey);
      setCopiedSecret(true);
      toast.success("Secret Access Key copied");
      setTimeout(() => setCopiedSecret(false), 2000);
    } catch {
      toast.error("Failed to copy Secret Access Key");
    }
  };

  const copyBoth = async () => {
    try {
      const text = `AWS_ACCESS_KEY_ID=${accessKey.accessKeyId}\nAWS_SECRET_ACCESS_KEY=${accessKey.secretAccessKey}`;
      await navigator.clipboard.writeText(text);
      toast.success("Credentials copied (.env format)");
    } catch {
      toast.error("Failed to copy credentials");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Access Key Created</DialogTitle>
          <DialogDescription>
            New credentials for user{" "}
            <span className="font-semibold text-foreground">
              {accessKey.userName}
            </span>
            .
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="flex items-start gap-2.5 rounded-md border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-600 dark:text-amber-400">
            <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
            <p className="leading-normal">
              Secret Access Key cannot be viewed again once this dialog is closed.
              Copy and store it securely now.
            </p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="access-key-id">Access Key ID</Label>
            <div className="flex gap-2">
              <Input
                id="access-key-id"
                readOnly
                value={accessKey.accessKeyId}
                className="font-mono text-xs"
              />
              <Button
                type="button"
                variant="outline"
                size="icon"
                onClick={copyKeyId}
                title="Copy Access Key ID"
              >
                {copiedKey ? (
                  <Check className="h-4 w-4 text-emerald-500" />
                ) : (
                  <Copy className="h-4 w-4" />
                )}
              </Button>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="secret-access-key">Secret Access Key</Label>
            <div className="flex gap-2">
              <Input
                id="secret-access-key"
                readOnly
                type="text"
                value={accessKey.secretAccessKey}
                className="font-mono text-xs"
              />
              <Button
                type="button"
                variant="outline"
                size="icon"
                onClick={copySecret}
                title="Copy Secret Access Key"
              >
                {copiedSecret ? (
                  <Check className="h-4 w-4 text-emerald-500" />
                ) : (
                  <Copy className="h-4 w-4" />
                )}
              </Button>
            </div>
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button type="button" variant="secondary" onClick={copyBoth}>
            Copy Both (.env)
          </Button>
          <Button type="button" onClick={() => onOpenChange(false)}>
            Done
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
