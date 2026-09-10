import { useState } from "react";
import {
  Shield,
  Search,
  Plus,
  Trash2,
  Copy,
  Check,
  ExternalLink,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { DeleteConfirmDialog } from "@/components/DeleteConfirmDialog";
import { CreateSecurityGroupDialog } from "./CreateSecurityGroupDialog";
import { useSecurityGroups, useSecurityGroupActions } from "@/hooks/use-ec2";
import { useTabs } from "@/store/tabs";
import type { SecurityGroupSummary } from "@/lib/ec2";

interface SecurityGroupListViewProps {
  onSelectGroup?: (groupId: string) => void;
}

export function SecurityGroupListView({
  onSelectGroup,
}: SecurityGroupListViewProps) {
  const [search, setSearch] = useState("");
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [groupToDelete, setGroupToDelete] =
    useState<SecurityGroupSummary | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const { data: securityGroups = [], isLoading } = useSecurityGroups();
  const { deleteSecurityGroup } = useSecurityGroupActions();
  const { openTab, closeTab } = useTabs();

  const handleCopy = async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedId(text);
      toast.success(`${label} copied to clipboard`);
      setTimeout(() => setCopiedId(null), 2000);
    } catch {
      toast.error(`Failed to copy ${label}`);
    }
  };

  const handleOpenGroup = (sg: SecurityGroupSummary) => {
    if (onSelectGroup) {
      onSelectGroup(sg.groupId);
    } else {
      openTab({
        id: `securityGroup:${sg.groupId}`,
        kind: "securityGroup",
        securityGroupId: sg.groupId,
        title: sg.groupName,
      });
    }
  };

  const handleDeleteConfirm = async () => {
    if (!groupToDelete) return;
    setIsDeleting(true);
    try {
      const ok = await deleteSecurityGroup(
        groupToDelete.groupId,
        groupToDelete.groupName,
      );
      if (ok) {
        closeTab(`securityGroup:${groupToDelete.groupId}`);
        setGroupToDelete(null);
      }
    } finally {
      setIsDeleting(false);
    }
  };

  const filteredGroups = securityGroups.filter((sg) => {
    const q = search.toLowerCase();
    return (
      sg.groupName.toLowerCase().includes(q) ||
      sg.groupId.toLowerCase().includes(q) ||
      (sg.description && sg.description.toLowerCase().includes(q)) ||
      (sg.vpcId && sg.vpcId.toLowerCase().includes(q))
    );
  });

  return (
    <div className="flex flex-col gap-4">
      {/* Controls */}
      <div className="flex items-center justify-between gap-3">
        <div className="relative max-w-sm flex-1">
          <Search className="absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
          <Input
            placeholder="Filter security groups by name, ID, VPC..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8"
          />
        </div>
        <Button onClick={() => setIsCreateOpen(true)} className="gap-1.5">
          <Plus className="size-4" />
          Create Security Group
        </Button>
      </div>

      {/* Content */}
      {isLoading ? (
        <div className="flex h-48 items-center justify-center text-muted-foreground">
          Loading security groups...
        </div>
      ) : filteredGroups.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-border p-12 text-center">
          <Shield className="size-12 text-muted-foreground/40 mb-3" />
          <h3 className="text-base font-semibold">No security groups found</h3>
          <p className="mt-1 text-sm text-muted-foreground max-w-sm">
            {search
              ? "No security groups match your search query."
              : "Create a security group to configure firewall rules for your compute instances."}
          </p>
          {!search && (
            <Button
              onClick={() => setIsCreateOpen(true)}
              className="mt-4 gap-1.5"
              variant="outline"
            >
              <Plus className="size-4" />
              Create Security Group
            </Button>
          )}
        </div>
      ) : (
        <div className="rounded-md border">
          <table className="w-full text-left text-sm">
            <thead className="border-b bg-muted/40 text-xs font-medium text-muted-foreground">
              <tr>
                <th className="px-4 py-3">Group Name</th>
                <th className="px-4 py-3">Group ID</th>
                <th className="px-4 py-3">Description</th>
                <th className="px-4 py-3">VPC ID</th>
                <th className="px-4 py-3">Inbound Rules</th>
                <th className="px-4 py-3">Outbound Rules</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {filteredGroups.map((sg) => (
                <tr
                  key={sg.groupId}
                  className="hover:bg-muted/30 transition-colors"
                >
                  {/* Name */}
                  <td className="px-4 py-3">
                    <button
                      type="button"
                      onClick={() => handleOpenGroup(sg)}
                      className="flex items-center gap-2 font-semibold text-foreground hover:underline text-left"
                    >
                      <Shield className="size-4 text-primary shrink-0" />
                      <span>{sg.groupName}</span>
                    </button>
                  </td>

                  {/* ID */}
                  <td className="px-4 py-3 font-mono text-xs">
                    <div className="flex items-center gap-1.5 text-muted-foreground">
                      <span>{sg.groupId}</span>
                      <button
                        type="button"
                        onClick={() => handleCopy(sg.groupId, "Group ID")}
                        className="hover:text-foreground"
                        title="Copy Group ID"
                      >
                        {copiedId === sg.groupId ? (
                          <Check className="size-3 text-emerald-500" />
                        ) : (
                          <Copy className="size-3" />
                        )}
                      </button>
                    </div>
                  </td>

                  {/* Description */}
                  <td className="px-4 py-3 text-muted-foreground text-xs max-w-xs truncate">
                    {sg.description || "—"}
                  </td>

                  {/* VPC */}
                  <td className="px-4 py-3 font-mono text-xs">
                    {sg.vpcId ? (
                      <Badge variant="secondary">{sg.vpcId}</Badge>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </td>

                  {/* Inbound Rules */}
                  <td className="px-4 py-3">
                    <Badge variant="outline" className="text-xs">
                      {sg.inboundRules.length} rule
                      {sg.inboundRules.length === 1 ? "" : "s"}
                    </Badge>
                  </td>

                  {/* Outbound Rules */}
                  <td className="px-4 py-3">
                    <Badge variant="outline" className="text-xs">
                      {sg.outboundRules.length} rule
                      {sg.outboundRules.length === 1 ? "" : "s"}
                    </Badge>
                  </td>

                  {/* Actions */}
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleOpenGroup(sg)}
                        className="gap-1 text-xs"
                      >
                        <ExternalLink className="size-3.5" />
                        Manage Rules
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setGroupToDelete(sg)}
                        className="size-8 p-0 text-muted-foreground hover:text-destructive"
                        aria-label={`Delete security group ${sg.groupName}`}
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Create Security Group Modal */}
      <CreateSecurityGroupDialog
        open={isCreateOpen}
        onOpenChange={setIsCreateOpen}
      />

      {/* Delete Confirmation Modal */}
      <DeleteConfirmDialog
        open={Boolean(groupToDelete)}
        onOpenChange={(open) => !open && setGroupToDelete(null)}
        title="Delete Security Group"
        description={`Are you sure you want to delete security group "${groupToDelete?.groupName}" (${groupToDelete?.groupId})?`}
        confirmLabel="Delete"
        onConfirm={handleDeleteConfirm}
        isPending={isDeleting}
      />
    </div>
  );
}
