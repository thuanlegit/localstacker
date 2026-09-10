import { useState } from "react";
import {
  Shield,
  Trash2,
  Copy,
  Check,
  Plus,
  ArrowLeft,
  RotateCw,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { DeleteConfirmDialog } from "@/components/DeleteConfirmDialog";
import { SecurityGroupRuleMatrix } from "./SecurityGroupRuleMatrix";
import { AddRuleDialog } from "./AddRuleDialog";
import {
  useSecurityGroups,
  useSecurityGroupActions,
} from "@/hooks/use-ec2";
import { useTabs } from "@/store/tabs";

interface SecurityGroupDetailViewProps {
  groupId: string;
}

export function SecurityGroupDetailView({
  groupId,
}: SecurityGroupDetailViewProps) {
  const [copiedId, setCopiedId] = useState(false);
  const [isAddRuleOpen, setIsAddRuleOpen] = useState(false);
  const [ruleDirection, setRuleDirection] = useState<"inbound" | "outbound">(
    "inbound",
  );
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const { data: securityGroups = [], isLoading, refetch } = useSecurityGroups();
  const { deleteSecurityGroup } = useSecurityGroupActions();
  const { closeTab } = useTabs();

  const sg = securityGroups.find((g) => g.groupId === groupId);

  const handleCopyId = async () => {
    try {
      await navigator.clipboard.writeText(groupId);
      setCopiedId(true);
      toast.success("Security Group ID copied");
      setTimeout(() => setCopiedId(false), 2000);
    } catch {
      toast.error("Failed to copy Group ID");
    }
  };

  const handleOpenAddRule = (dir: "inbound" | "outbound") => {
    setRuleDirection(dir);
    setIsAddRuleOpen(true);
  };

  const handleDeleteConfirm = async () => {
    if (!sg) return;

    setIsDeleting(true);
    try {
      const ok = await deleteSecurityGroup(sg.groupId, sg.groupName);
      if (ok) {
        closeTab(`securityGroup:${sg.groupId}`);
      }
    } finally {
      setIsDeleting(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center text-muted-foreground text-sm">
        Loading security group {groupId}...
      </div>
    );
  }

  if (!sg) {
    return (
      <div className="flex flex-col items-center justify-center p-12 text-center">
        <Shield className="size-12 text-muted-foreground/40 mb-3" />
        <h3 className="text-base font-semibold">Security Group Not Found</h3>
        <p className="text-sm text-muted-foreground mt-1 max-w-sm">
          Security group with ID &ldquo;{groupId}&rdquo; may have been deleted.
        </p>
        <Button
          variant="outline"
          size="sm"
          onClick={() => closeTab(`securityGroup:${groupId}`)}
          className="mt-4 gap-1.5"
        >
          <ArrowLeft className="size-4" />
          Close Tab
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6 p-6">
      {/* Header */}
      <div className="flex items-start justify-between border-b pb-4">
        <div className="flex items-center gap-3">
          <div className="flex size-10 items-center justify-center rounded-lg border bg-muted/40">
            <Shield className="size-5 text-primary" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold tracking-tight">
                {sg.groupName}
              </h1>
              <div className="flex items-center gap-1 font-mono text-xs text-muted-foreground">
                <Badge variant="outline" className="font-mono">
                  {sg.groupId}
                </Badge>
                <button
                  type="button"
                  onClick={handleCopyId}
                  className="hover:text-foreground text-muted-foreground"
                  title="Copy Group ID"
                >
                  {copiedId ? (
                    <Check className="size-3 text-emerald-500" />
                  ) : (
                    <Copy className="size-3" />
                  )}
                </button>
              </div>
              {sg.vpcId && (
                <Badge variant="secondary" className="font-mono text-xs">
                  VPC: {sg.vpcId}
                </Badge>
              )}
            </div>
            <p className="text-sm text-muted-foreground mt-0.5">
              {sg.description || "No description provided"}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => refetch()}
            className="gap-1.5"
          >
            <RotateCw className="size-3.5" />
            Refresh
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setIsDeleteOpen(true)}
            className="gap-1.5 text-muted-foreground hover:text-destructive"
          >
            <Trash2 className="size-3.5" />
            Delete
          </Button>
        </div>
      </div>

      {/* Rules Visualizer */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-semibold">Firewall Rules</h2>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => handleOpenAddRule("inbound")}
              className="gap-1.5"
            >
              <Plus className="size-3.5" />
              Add Inbound Rule
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => handleOpenAddRule("outbound")}
              className="gap-1.5"
            >
              <Plus className="size-3.5" />
              Add Outbound Rule
            </Button>
          </div>
        </div>

        <SecurityGroupRuleMatrix
          securityGroup={sg}
          onAddRule={handleOpenAddRule}
        />
      </div>

      {/* Add Rule Dialog */}
      <AddRuleDialog
        open={isAddRuleOpen}
        onOpenChange={setIsAddRuleOpen}
        groupId={sg.groupId}
        direction={ruleDirection}
      />

      {/* Delete Security Group Confirmation Dialog */}
      <DeleteConfirmDialog
        open={isDeleteOpen}
        onOpenChange={setIsDeleteOpen}
        title="Delete Security Group"
        description={`Are you sure you want to delete security group "${sg.groupName}" (${sg.groupId})? EC2 will reject deletion if this security group is referenced by active instances or other security groups.`}
        confirmLabel="Delete Security Group"
        onConfirm={handleDeleteConfirm}
        isPending={isDeleting}
      />
    </div>
  );
}
