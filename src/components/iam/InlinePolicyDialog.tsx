import { useState, useEffect } from "react";
import { AlertCircle, Loader2 } from "lucide-react";
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
import { useRoleActions } from "@/hooks/use-iam";

interface InlinePolicyDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  roleName: string;
  initialPolicyName?: string;
  initialPolicyDocument?: string;
  onSaved?: () => void;
}

const DEFAULT_POLICY_TEMPLATE = JSON.stringify(
  {
    Version: "2012-10-17",
    Statement: [
      {
        Effect: "Allow",
        Action: "*",
        Resource: "*",
      },
    ],
  },
  null,
  2,
);

export function validatePolicyDocument(doc: string): string | null {
  if (!doc.trim()) {
    return "Policy document cannot be empty";
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(doc);
  } catch {
    return "Invalid JSON format";
  }

  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    return "Policy document must be a JSON object";
  }

  const obj = parsed as Record<string, unknown>;
  if (!obj.Statement) {
    return "Policy document must contain a 'Statement' block";
  }

  if (!Array.isArray(obj.Statement) && typeof obj.Statement !== "object") {
    return "'Statement' must be an array or object";
  }

  return null;
}

export function InlinePolicyDialog({
  open,
  onOpenChange,
  roleName,
  initialPolicyName = "",
  initialPolicyDocument = "",
  onSaved,
}: InlinePolicyDialogProps) {
  const isEditing = Boolean(initialPolicyName);
  const [policyName, setPolicyName] = useState(initialPolicyName);
  const [document, setDocument] = useState(
    initialPolicyDocument || DEFAULT_POLICY_TEMPLATE,
  );
  const [isSubmitting, setIsSubmitting] = useState(false);

  const { putRolePolicy } = useRoleActions();

  useEffect(() => {
    if (open) {
      setPolicyName(initialPolicyName);
      setDocument(initialPolicyDocument || DEFAULT_POLICY_TEMPLATE);
      setIsSubmitting(false);
    }
  }, [open, initialPolicyName, initialPolicyDocument]);

  const nameError = !policyName.trim()
    ? "Policy name is required"
    : !/^[\w+=,.@-]{1,128}$/.test(policyName.trim())
      ? "Policy name must be 1-128 characters (letters, numbers, +=,.@-)"
      : null;

  const docError = validatePolicyDocument(document);
  const isValid = !nameError && !docError;

  const handleSave = async () => {
    if (!isValid || isSubmitting) return;

    setIsSubmitting(true);
    try {
      const ok = await putRolePolicy(roleName, policyName.trim(), document);
      if (ok) {
        onSaved?.();
        onOpenChange(false);
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle>
            {isEditing ? `Edit Inline Policy: ${initialPolicyName}` : "Add Inline Policy"}
          </DialogTitle>
          <DialogDescription>
            Embedded policy directly attached to role{" "}
            <span className="font-semibold text-foreground">{roleName}</span>.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label htmlFor="policy-name">Policy Name</Label>
            <Input
              id="policy-name"
              placeholder="e.g. S3BucketAccess"
              value={policyName}
              onChange={(e) => setPolicyName(e.target.value)}
              disabled={isEditing || isSubmitting}
            />
            {nameError && policyName.length > 0 && (
              <p className="text-xs text-destructive">{nameError}</p>
            )}
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label htmlFor="policy-doc">Policy Document (JSON)</Label>
              {docError && (
                <span className="flex items-center gap-1 text-xs text-destructive">
                  <AlertCircle className="h-3 w-3" />
                  {docError}
                </span>
              )}
            </div>
            <textarea
              id="policy-doc"
              className="flex min-h-[220px] w-full rounded-md border border-input bg-background px-3 py-2 text-xs font-mono ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
              value={document}
              onChange={(e) => setDocument(e.target.value)}
              disabled={isSubmitting}
              spellCheck={false}
            />
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
            onClick={handleSave}
            disabled={!isValid || isSubmitting}
          >
            {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {isEditing ? "Update Policy" : "Save Policy"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
