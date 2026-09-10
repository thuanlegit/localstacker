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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  useInstanceActions,
  useKeyPairs,
  useSecurityGroups,
} from "@/hooks/use-ec2";
import type { InstanceSummary } from "@/lib/ec2";

interface LaunchInstanceDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onLaunched?: (instance: InstanceSummary) => void;
}

const INSTANCE_TYPES = [
  { value: "t2.micro", label: "t2.micro (1 vCPU, 1 GiB RAM)" },
  { value: "t2.small", label: "t2.small (1 vCPU, 2 GiB RAM)" },
  { value: "t3.micro", label: "t3.micro (2 vCPUs, 1 GiB RAM)" },
  { value: "t3.small", label: "t3.small (2 vCPUs, 2 GiB RAM)" },
  { value: "m5.large", label: "m5.large (2 vCPUs, 8 GiB RAM)" },
];

export function LaunchInstanceDialog({
  open,
  onOpenChange,
  onLaunched,
}: LaunchInstanceDialogProps) {
  const [name, setName] = useState("");
  const [instanceType, setInstanceType] = useState("t2.micro");
  const [keyName, setKeyName] = useState("__none__");
  const [securityGroupId, setSecurityGroupId] = useState("__none__");
  const [amiId, setAmiId] = useState("ami-12345678");
  const [count, setCount] = useState("1");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const { data: keyPairs } = useKeyPairs({ enabled: open });
  const { data: securityGroups } = useSecurityGroups({ enabled: open });
  const { launchInstance } = useInstanceActions();

  useEffect(() => {
    if (open) {
      setName("");
      setInstanceType("t2.micro");
      setKeyName("__none__");
      setSecurityGroupId("__none__");
      setAmiId("ami-12345678");
      setCount("1");
      setIsSubmitting(false);
    }
  }, [open]);

  const countNum = parseInt(count, 10);
  const isValidCount = !isNaN(countNum) && countNum >= 1 && countNum <= 10;
  const isValidAmi = amiId.trim().length > 0;
  const isValid = isValidCount && isValidAmi;

  const handleLaunch = async () => {
    if (!isValid || isSubmitting) return;

    setIsSubmitting(true);
    try {
      const created = await launchInstance({
        name: name.trim() || undefined,
        instanceType,
        keyName: keyName !== "__none__" ? keyName : undefined,
        securityGroupIds:
          securityGroupId !== "__none__" ? [securityGroupId] : undefined,
        imageId: amiId.trim() || undefined,
        minCount: countNum,
        maxCount: countNum,
      });

      if (created) {
        onLaunched?.(created);
        onOpenChange(false);
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Launch Mock Instance</DialogTitle>
          <DialogDescription>
            Provision a stateful mock EC2 instance in LocalStack.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4 py-2">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="instance-name">Name tag (optional)</Label>
            <Input
              id="instance-name"
              placeholder="e.g. web-server-1"
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={isSubmitting}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="instance-type">Instance Type</Label>
            <Select
              value={instanceType}
              onValueChange={setInstanceType}
              disabled={isSubmitting}
            >
              <SelectTrigger id="instance-type" className="w-full">
                <SelectValue placeholder="Select instance type" />
              </SelectTrigger>
              <SelectContent>
                {INSTANCE_TYPES.map((type) => (
                  <SelectItem key={type.value} value={type.value}>
                    {type.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="instance-keypair">Key Pair (optional)</Label>
              <Select
                value={keyName}
                onValueChange={setKeyName}
                disabled={isSubmitting}
              >
                <SelectTrigger id="instance-keypair" className="w-full">
                  <SelectValue placeholder="None" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">None</SelectItem>
                  {keyPairs?.map((kp) => (
                    <SelectItem key={kp.keyName} value={kp.keyName}>
                      {kp.keyName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="instance-sg">Security Group (optional)</Label>
              <Select
                value={securityGroupId}
                onValueChange={setSecurityGroupId}
                disabled={isSubmitting}
              >
                <SelectTrigger id="instance-sg" className="w-full">
                  <SelectValue placeholder="None" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">None</SelectItem>
                  {securityGroups?.map((sg) => (
                    <SelectItem key={sg.groupId} value={sg.groupId}>
                      {sg.groupName} ({sg.groupId})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="instance-ami">AMI ID</Label>
              <Input
                id="instance-ami"
                placeholder="ami-12345678"
                value={amiId}
                onChange={(e) => setAmiId(e.target.value)}
                disabled={isSubmitting}
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="instance-count">Count</Label>
              <Input
                id="instance-count"
                type="number"
                min={1}
                max={10}
                value={count}
                onChange={(e) => setCount(e.target.value)}
                disabled={isSubmitting}
              />
            </div>
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
            onClick={handleLaunch}
            disabled={!isValid || isSubmitting}
          >
            {isSubmitting ? (
              <>
                <Loader2 className="mr-2 size-4 animate-spin" />
                Launching...
              </>
            ) : (
              "Launch Instance"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
