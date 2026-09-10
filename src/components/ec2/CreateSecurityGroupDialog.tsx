import { useState, useEffect } from "react";
import { Loader2, Shield } from "lucide-react";
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
import { useSecurityGroupActions } from "@/hooks/use-ec2";

interface CreateSecurityGroupDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated?: (groupId: string) => void;
}

export function CreateSecurityGroupDialog({
  open,
  onOpenChange,
  onCreated,
}: CreateSecurityGroupDialogProps) {
  const [groupName, setGroupName] = useState("");
  const [description, setDescription] = useState("");
  const [vpcId, setVpcId] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const { createSecurityGroup } = useSecurityGroupActions();

  useEffect(() => {
    if (open) {
      setGroupName("");
      setDescription("");
      setVpcId("");
      setIsSubmitting(false);
    }
  }, [open]);

  const trimmedName = groupName.trim();
  const trimmedDesc = description.trim();
  const nameRegex = /^[a-zA-Z0-9._\- ]{1,255}$/;
  const nameError = !trimmedName
    ? "Group name is required"
    : !nameRegex.test(trimmedName)
      ? "Invalid group name (alphanumeric, spaces, periods, underscores, dashes up to 255 chars)"
      : null;

  const descError = !trimmedDesc ? "Description is required" : null;

  const isValid = !nameError && !descError;

  const handleCreate = async () => {
    if (!isValid || isSubmitting) return;

    setIsSubmitting(true);
    try {
      const groupId = await createSecurityGroup({
        groupName: trimmedName,
        description: trimmedDesc,
        vpcId: vpcId.trim() || undefined,
      });

      if (groupId) {
        onCreated?.(groupId);
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
          <DialogTitle className="flex items-center gap-2">
            <Shield className="size-4 text-primary" />
            Create Security Group
          </DialogTitle>
          <DialogDescription>
            A security group acts as a virtual firewall for your EC2 instances to
            control incoming and outgoing traffic.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4 py-2">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="sg-name">Security Group Name</Label>
            <Input
              id="sg-name"
              placeholder="e.g. web-tier-sg"
              value={groupName}
              onChange={(e) => setGroupName(e.target.value)}
              disabled={isSubmitting}
            />
            {trimmedName.length > 0 && nameError && (
              <span className="text-xs text-destructive">{nameError}</span>
            )}
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="sg-desc">Description</Label>
            <Input
              id="sg-desc"
              placeholder="e.g. Allow HTTP/HTTPS traffic from anywhere"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              disabled={isSubmitting}
            />
            {description.length > 0 && descError && (
              <span className="text-xs text-destructive">{descError}</span>
            )}
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="sg-vpc">VPC ID (optional)</Label>
            <Input
              id="sg-vpc"
              placeholder="e.g. vpc-12345678"
              value={vpcId}
              onChange={(e) => setVpcId(e.target.value)}
              disabled={isSubmitting}
            />
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
              "Create Security Group"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
