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
import { useUserActions } from "@/hooks/use-iam";

interface CreateUserDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated?: (userName: string) => void;
}

export function CreateUserDialog({
  open,
  onOpenChange,
  onCreated,
}: CreateUserDialogProps) {
  const [userName, setUserName] = useState("");
  const [path, setPath] = useState("/");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const { createUser } = useUserActions();

  useEffect(() => {
    if (open) {
      setUserName("");
      setPath("/");
      setIsSubmitting(false);
    }
  }, [open]);

  const nameError = !userName.trim()
    ? "User name is required"
    : !/^[\w+=,.@-]{1,64}$/.test(userName.trim())
      ? "User name must be 1-64 characters (letters, numbers, +=,.@-)"
      : null;

  const isValid = !nameError;

  const handleCreate = async () => {
    if (!isValid || isSubmitting) return;

    setIsSubmitting(true);
    try {
      const created = await createUser({
        userName: userName.trim(),
        path: path.trim() || undefined,
      });
      if (created) {
        onCreated?.(created.userName);
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
          <DialogTitle>Create IAM User</DialogTitle>
          <DialogDescription>
            Add a new IAM user identity for credentials and permissions management.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label htmlFor="user-name">User Name</Label>
            <Input
              id="user-name"
              placeholder="e.g. dev-admin"
              value={userName}
              onChange={(e) => setUserName(e.target.value)}
              disabled={isSubmitting}
            />
            {nameError && userName.length > 0 && (
              <p className="text-xs text-destructive">{nameError}</p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="user-path">Path (optional)</Label>
            <Input
              id="user-path"
              placeholder="/"
              value={path}
              onChange={(e) => setPath(e.target.value)}
              disabled={isSubmitting}
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
            Create User
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
