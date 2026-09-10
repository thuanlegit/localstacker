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
import { validatePolicyDocument } from "./InlinePolicyDialog";

interface CreateRoleDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated?: (roleName: string) => void;
}

export const DEFAULT_LAMBDA_TRUST_POLICY = JSON.stringify(
  {
    Version: "2012-10-17",
    Statement: [
      {
        Effect: "Allow",
        Principal: {
          Service: "lambda.amazonaws.com",
        },
        Action: "sts:AssumeRole",
      },
    ],
  },
  null,
  2,
);

export function CreateRoleDialog({
  open,
  onOpenChange,
  onCreated,
}: CreateRoleDialogProps) {
  const [roleName, setRoleName] = useState("");
  const [description, setDescription] = useState("");
  const [trustPolicy, setTrustPolicy] = useState(DEFAULT_LAMBDA_TRUST_POLICY);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const { createRole } = useRoleActions();

  useEffect(() => {
    if (open) {
      setRoleName("");
      setDescription("");
      setTrustPolicy(DEFAULT_LAMBDA_TRUST_POLICY);
      setIsSubmitting(false);
    }
  }, [open]);

  const nameError = !roleName.trim()
    ? "Role name is required"
    : !/^[\w+=,.@-]{1,64}$/.test(roleName.trim())
      ? "Role name must be 1-64 alphanumeric characters or +=,.@-"
      : null;

  const policyError = validatePolicyDocument(trustPolicy);
  const isValid = !nameError && !policyError;

  const handleCreate = async () => {
    if (!isValid || isSubmitting) return;

    setIsSubmitting(true);
    try {
      const created = await createRole({
        roleName: roleName.trim(),
        description: description.trim() || undefined,
        assumeRolePolicyDocument: trustPolicy,
      });
      if (created) {
        onCreated?.(created.roleName);
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
          <DialogTitle>Create IAM Role</DialogTitle>
          <DialogDescription>
            Create an IAM role with an assume-role trust relationship policy.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label htmlFor="role-name">Role Name</Label>
            <Input
              id="role-name"
              placeholder="e.g. MyLambdaExecutionRole"
              value={roleName}
              onChange={(e) => setRoleName(e.target.value)}
              disabled={isSubmitting}
            />
            {nameError && roleName.length > 0 && (
              <p className="text-xs text-destructive">{nameError}</p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="role-desc">Description (optional)</Label>
            <Input
              id="role-desc"
              placeholder="Role purpose or notes"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              disabled={isSubmitting}
            />
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label htmlFor="trust-policy">Trust Relationship Policy (JSON)</Label>
              {policyError && (
                <span className="flex items-center gap-1 text-xs text-destructive">
                  <AlertCircle className="h-3 w-3" />
                  {policyError}
                </span>
              )}
            </div>
            <textarea
              id="trust-policy"
              className="flex min-h-[180px] w-full rounded-md border border-input bg-background px-3 py-2 text-xs font-mono ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
              value={trustPolicy}
              onChange={(e) => setTrustPolicy(e.target.value)}
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
            onClick={handleCreate}
            disabled={!isValid || isSubmitting}
          >
            {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Create Role
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
