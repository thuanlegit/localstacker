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
import { useSecurityGroupActions, useSecurityGroups } from "@/hooks/use-ec2";
import type { IpPermissionRuleInput } from "@/lib/ec2";

export interface AddRuleDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  groupId: string;
  direction: "inbound" | "outbound";
  onAdded?: () => void;
}

const PRESETS: Array<{
  id: string;
  label: string;
  protocol: string;
  fromPort?: number;
  toPort?: number;
}> = [
  { id: "custom-tcp", label: "Custom TCP", protocol: "tcp" },
  { id: "custom-udp", label: "Custom UDP", protocol: "udp" },
  { id: "all-traffic", label: "All Traffic", protocol: "-1" },
  { id: "ssh", label: "SSH (22)", protocol: "tcp", fromPort: 22, toPort: 22 },
  { id: "http", label: "HTTP (80)", protocol: "tcp", fromPort: 80, toPort: 80 },
  { id: "https", label: "HTTPS (443)", protocol: "tcp", fromPort: 443, toPort: 443 },
  {
    id: "mysql",
    label: "MySQL / Aurora (3306)",
    protocol: "tcp",
    fromPort: 3306,
    toPort: 3306,
  },
  {
    id: "postgres",
    label: "PostgreSQL (5432)",
    protocol: "tcp",
    fromPort: 5432,
    toPort: 5432,
  },
  { id: "redis", label: "Redis (6379)", protocol: "tcp", fromPort: 6379, toPort: 6379 },
];

export function AddRuleDialog({
  open,
  onOpenChange,
  groupId,
  direction,
  onAdded,
}: AddRuleDialogProps) {
  const [presetId, setPresetId] = useState("custom-tcp");
  const [portRange, setPortRange] = useState("80");
  const [targetType, setTargetType] = useState<"anywhere" | "custom" | "sg">(
    "anywhere",
  );
  const [customCidr, setCustomCidr] = useState("0.0.0.0/0");
  const [sourceSgId, setSourceSgId] = useState("");
  const [description, setDescription] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const { data: securityGroups = [] } = useSecurityGroups({ enabled: open });
  const { addIngressRule, addEgressRule } = useSecurityGroupActions();

  const selectedPreset =
    PRESETS.find((p) => p.id === presetId) || PRESETS[0];

  useEffect(() => {
    if (open) {
      setPresetId(direction === "inbound" ? "https" : "all-traffic");
      if (direction === "inbound") {
        setPortRange("443");
      } else {
        setPortRange("");
      }
      setTargetType("anywhere");
      setCustomCidr("0.0.0.0/0");
      setSourceSgId("");
      setDescription("");
      setIsSubmitting(false);
    }
  }, [open, direction]);

  // When preset changes, update portRange
  const handlePresetChange = (newPresetId: string) => {
    setPresetId(newPresetId);
    const preset = PRESETS.find((p) => p.id === newPresetId);
    if (!preset) return;

    if (preset.fromPort !== undefined) {
      setPortRange(
        preset.fromPort === preset.toPort
          ? `${preset.fromPort}`
          : `${preset.fromPort}-${preset.toPort}`,
      );
    } else if (preset.protocol === "-1") {
      setPortRange("");
    }
  };

  // Validation
  const isAllTraffic = selectedPreset.protocol === "-1";
  let parsedFromPort: number | undefined;
  let parsedToPort: number | undefined;
  let portError: string | null = null;

  if (!isAllTraffic) {
    if (selectedPreset.fromPort !== undefined) {
      parsedFromPort = selectedPreset.fromPort;
      parsedToPort = selectedPreset.toPort;
    } else {
      const trimmedPort = portRange.trim();
      if (!trimmedPort) {
        portError = "Port or port range is required";
      } else if (trimmedPort.includes("-")) {
        const [fromStr, toStr] = trimmedPort.split("-");
        const from = parseInt(fromStr, 10);
        const to = parseInt(toStr, 10);
        if (
          isNaN(from) ||
          isNaN(to) ||
          from < 0 ||
          to > 65535 ||
          from > to
        ) {
          portError = "Invalid port range (0-65535, from <= to)";
        } else {
          parsedFromPort = from;
          parsedToPort = to;
        }
      } else {
        const port = parseInt(trimmedPort, 10);
        if (isNaN(port) || port < 0 || port > 65535) {
          portError = "Invalid port (0-65535)";
        } else {
          parsedFromPort = port;
          parsedToPort = port;
        }
      }
    }
  }

  const cidrRegex = /^\d{1,3}(\.\d{1,3}){3}\/\d{1,2}$/;
  let targetError: string | null = null;
  if (targetType === "custom") {
    if (!cidrRegex.test(customCidr.trim())) {
      targetError = "Invalid CIDR block format (e.g. 10.0.0.0/16 or 0.0.0.0/0)";
    }
  } else if (targetType === "sg") {
    if (!sourceSgId) {
      targetError = "Please select a security group";
    }
  }

  const isValid = !portError && !targetError;

  const handleAddRule = async () => {
    if (!isValid || isSubmitting) return;

    setIsSubmitting(true);
    try {
      const rule: IpPermissionRuleInput = {
        ipProtocol: selectedPreset.protocol,
        fromPort: parsedFromPort,
        toPort: parsedToPort,
        cidrIp:
          targetType === "anywhere"
            ? "0.0.0.0/0"
            : targetType === "custom"
              ? customCidr.trim()
              : undefined,
        sourceGroupId:
          targetType === "sg" ? sourceSgId : undefined,
        description: description.trim() || undefined,
      };

      const ok =
        direction === "inbound"
          ? await addIngressRule(groupId, rule)
          : await addEgressRule(groupId, rule);

      if (ok) {
        onAdded?.();
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
          <DialogTitle>
            Add {direction === "inbound" ? "Inbound" : "Outbound"} Rule
          </DialogTitle>
          <DialogDescription>
            Authorize traffic for security group {groupId}.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4 py-2">
          {/* Preset / Protocol */}
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="rule-type">Type</Label>
            <Select
              value={presetId}
              onValueChange={handlePresetChange}
              disabled={isSubmitting}
            >
              <SelectTrigger id="rule-type" className="w-full">
                <SelectValue placeholder="Select rule type" />
              </SelectTrigger>
              <SelectContent>
                {PRESETS.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Port Range (if not preset fixed) */}
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="rule-port">Port Range</Label>
            <Input
              id="rule-port"
              placeholder={isAllTraffic ? "All traffic" : "e.g. 80 or 8000-8080"}
              value={isAllTraffic ? "All" : portRange}
              onChange={(e) => setPortRange(e.target.value)}
              disabled={
                isSubmitting ||
                isAllTraffic ||
                selectedPreset.fromPort !== undefined
              }
            />
            {portError && (
              <span className="text-xs text-destructive">{portError}</span>
            )}
          </div>

          {/* Source / Destination Target */}
          <div className="flex flex-col gap-2">
            <Label>
              {direction === "inbound" ? "Source" : "Destination"}
            </Label>
            <div className="grid grid-cols-3 gap-2">
              <Button
                type="button"
                variant={targetType === "anywhere" ? "default" : "outline"}
                size="sm"
                onClick={() => setTargetType("anywhere")}
                disabled={isSubmitting}
              >
                Anywhere-IPv4
              </Button>
              <Button
                type="button"
                variant={targetType === "custom" ? "default" : "outline"}
                size="sm"
                onClick={() => setTargetType("custom")}
                disabled={isSubmitting}
              >
                Custom CIDR
              </Button>
              <Button
                type="button"
                variant={targetType === "sg" ? "default" : "outline"}
                size="sm"
                onClick={() => setTargetType("sg")}
                disabled={isSubmitting}
              >
                Security Group
              </Button>
            </div>

            {targetType === "anywhere" && (
              <div className="text-xs text-muted-foreground font-mono bg-muted/40 p-2 rounded">
                0.0.0.0/0 (Allows traffic from/to anywhere)
              </div>
            )}

            {targetType === "custom" && (
              <div className="flex flex-col gap-1 mt-1">
                <Input
                  placeholder="0.0.0.0/0 or 10.0.0.0/16"
                  value={customCidr}
                  onChange={(e) => setCustomCidr(e.target.value)}
                  disabled={isSubmitting}
                />
                {targetError && (
                  <span className="text-xs text-destructive">
                    {targetError}
                  </span>
                )}
              </div>
            )}

            {targetType === "sg" && (
              <div className="flex flex-col gap-1 mt-1">
                <Select
                  value={sourceSgId}
                  onValueChange={setSourceSgId}
                  disabled={isSubmitting}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Select a security group" />
                  </SelectTrigger>
                  <SelectContent>
                    {securityGroups.map((sg) => (
                      <SelectItem key={sg.groupId} value={sg.groupId}>
                        {sg.groupName} ({sg.groupId})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {targetError && (
                  <span className="text-xs text-destructive">
                    {targetError}
                  </span>
                )}
              </div>
            )}
          </div>

          {/* Description */}
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="rule-desc">Description (optional)</Label>
            <Input
              id="rule-desc"
              placeholder="e.g. Allow HTTPS traffic"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
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
            onClick={handleAddRule}
            disabled={!isValid || isSubmitting}
          >
            {isSubmitting ? (
              <>
                <Loader2 className="mr-2 size-4 animate-spin" />
                Authorizing...
              </>
            ) : (
              "Save Rule"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
