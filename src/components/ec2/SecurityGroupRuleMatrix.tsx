import { useState } from "react";
import { Plus, Trash2, Shield, ArrowDownLeft, ArrowUpRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DeleteConfirmDialog } from "@/components/DeleteConfirmDialog";
import {
  formatPortRange,
  type SecurityGroupSummary,
  type IpPermissionRule,
  type IpPermissionRuleInput,
} from "@/lib/ec2";
import { useSecurityGroupActions } from "@/hooks/use-ec2";

interface SecurityGroupRuleMatrixProps {
  securityGroup: SecurityGroupSummary;
  onAddRule?: (direction: "inbound" | "outbound") => void;
}

interface RuleTargetRow {
  direction: "inbound" | "outbound";
  protocol: string;
  fromPort?: number;
  toPort?: number;
  target: string;
  targetType: "cidr" | "ipv6" | "sg" | "none";
  description?: string;
  originalRule: IpPermissionRule;
}

function getProtocolBadge(protocol: string) {
  const upper = protocol === "-1" ? "ALL" : protocol.toUpperCase();
  return (
    <Badge variant="outline" className="font-mono text-xs">
      {upper}
    </Badge>
  );
}

function expandRulesToRows(
  rules: IpPermissionRule[],
  direction: "inbound" | "outbound",
): RuleTargetRow[] {
  const rows: RuleTargetRow[] = [];
  for (const rule of rules) {
    let hasTargets = false;
    for (const range of rule.ipRanges) {
      if (range.cidrIp) {
        hasTargets = true;
        rows.push({
          direction,
          protocol: rule.ipProtocol,
          fromPort: rule.fromPort,
          toPort: rule.toPort,
          target: range.cidrIp,
          targetType: "cidr",
          description: range.description,
          originalRule: rule,
        });
      }
    }
    for (const range of rule.ipv6Ranges) {
      if (range.cidrIpv6) {
        hasTargets = true;
        rows.push({
          direction,
          protocol: rule.ipProtocol,
          fromPort: rule.fromPort,
          toPort: rule.toPort,
          target: range.cidrIpv6,
          targetType: "ipv6",
          description: range.description,
          originalRule: rule,
        });
      }
    }
    for (const pair of rule.userIdGroupPairs) {
      if (pair.groupId) {
        hasTargets = true;
        rows.push({
          direction,
          protocol: rule.ipProtocol,
          fromPort: rule.fromPort,
          toPort: rule.toPort,
          target: pair.groupId,
          targetType: "sg",
          description: pair.description,
          originalRule: rule,
        });
      }
    }
    if (!hasTargets) {
      rows.push({
        direction,
        protocol: rule.ipProtocol,
        fromPort: rule.fromPort,
        toPort: rule.toPort,
        target: "—",
        targetType: "none",
        description: undefined,
        originalRule: rule,
      });
    }
  }
  return rows;
}

export function SecurityGroupRuleMatrix({
  securityGroup,
  onAddRule,
}: SecurityGroupRuleMatrixProps) {
  const [activeTab, setActiveTab] = useState<"inbound" | "outbound">("inbound");
  const [ruleToRevoke, setRuleToRevoke] = useState<RuleTargetRow | null>(null);
  const [isRevoking, setIsRevoking] = useState(false);

  const { removeIngressRule, removeEgressRule } = useSecurityGroupActions();

  const inboundRows = expandRulesToRows(
    securityGroup.inboundRules,
    "inbound",
  );
  const outboundRows = expandRulesToRows(
    securityGroup.outboundRules,
    "outbound",
  );

  const handleRevokeConfirm = async () => {
    if (!ruleToRevoke) return;

    setIsRevoking(true);
    try {
      const input: IpPermissionRuleInput = {
        ipProtocol: ruleToRevoke.protocol,
        fromPort: ruleToRevoke.fromPort,
        toPort: ruleToRevoke.toPort,
        cidrIp:
          ruleToRevoke.targetType === "cidr"
            ? ruleToRevoke.target
            : undefined,
        sourceGroupId:
          ruleToRevoke.targetType === "sg" ? ruleToRevoke.target : undefined,
        description: ruleToRevoke.description,
      };

      const ok =
        ruleToRevoke.direction === "inbound"
          ? await removeIngressRule(securityGroup.groupId, input)
          : await removeEgressRule(securityGroup.groupId, input);

      if (ok) {
        setRuleToRevoke(null);
      }
    } finally {
      setIsRevoking(false);
    }
  };

  const renderTable = (rows: RuleTargetRow[], direction: "inbound" | "outbound") => {
    return rows.length === 0 ? (
      <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-border p-8 text-center">
        <Shield className="size-8 text-muted-foreground/40 mb-2" />
        <p className="text-sm font-medium">
          No {direction === "inbound" ? "inbound" : "outbound"} rules configured
        </p>
        <p className="text-xs text-muted-foreground mt-0.5">
          {direction === "inbound"
            ? "Incoming traffic will be blocked by default."
            : "No outbound traffic allowed."}
        </p>
        {onAddRule && (
          <Button
            size="sm"
            variant="outline"
            className="mt-3 gap-1.5"
            onClick={() => onAddRule(direction)}
          >
            <Plus className="size-3.5" />
            Add {direction === "inbound" ? "Inbound" : "Outbound"} Rule
          </Button>
        )}
      </div>
    ) : (
      <div className="rounded-md border">
        <table className="w-full text-left text-sm">
          <thead className="border-b bg-muted/40 text-xs font-medium text-muted-foreground">
            <tr>
              <th className="px-4 py-3">Protocol</th>
              <th className="px-4 py-3">Port Range</th>
              <th className="px-4 py-3">
                {direction === "inbound" ? "Source" : "Destination"}
              </th>
              <th className="px-4 py-3">Description</th>
              <th className="px-4 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {rows.map((row, idx) => {
              const portText = formatPortRange(
                row.protocol,
                row.fromPort,
                row.toPort,
              );

              return (
                <tr
                  key={`${row.direction}-${row.protocol}-${row.fromPort}-${row.toPort}-${row.target}-${idx}`}
                  className="hover:bg-muted/30 transition-colors"
                >
                  <td className="px-4 py-3">
                    {getProtocolBadge(row.protocol)}
                  </td>
                  <td className="px-4 py-3 font-mono text-xs">
                    {portText}
                  </td>
                  <td className="px-4 py-3 font-mono text-xs">
                    <Badge variant="outline" className="font-mono">
                      {row.target}
                    </Badge>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground text-xs">
                    {row.description || "—"}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setRuleToRevoke(row)}
                      className="size-8 p-0 text-muted-foreground hover:text-destructive"
                      aria-label={`Revoke rule for port ${portText}`}
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    );
  };

  return (
    <div className="flex flex-col gap-4">
      <Tabs
        value={activeTab}
        onValueChange={(v) => setActiveTab(v as "inbound" | "outbound")}
      >
        <div className="flex items-center justify-between mb-3">
          <TabsList>
            <TabsTrigger value="inbound" className="gap-2">
              <ArrowDownLeft className="size-3.5 text-emerald-500" />
              Inbound Rules
              <Badge variant="secondary" className="px-1.5 py-0 text-xs">
                {inboundRows.length}
              </Badge>
            </TabsTrigger>
            <TabsTrigger value="outbound" className="gap-2">
              <ArrowUpRight className="size-3.5 text-blue-500" />
              Outbound Rules
              <Badge variant="secondary" className="px-1.5 py-0 text-xs">
                {outboundRows.length}
              </Badge>
            </TabsTrigger>
          </TabsList>

          {onAddRule && (
            <Button
              size="sm"
              onClick={() => onAddRule(activeTab)}
              className="gap-1.5"
            >
              <Plus className="size-3.5" />
              Add {activeTab === "inbound" ? "Inbound" : "Outbound"} Rule
            </Button>
          )}
        </div>

        <TabsContent value="inbound" className="m-0">
          {renderTable(inboundRows, "inbound")}
        </TabsContent>

        <TabsContent value="outbound" className="m-0">
          {renderTable(outboundRows, "outbound")}
        </TabsContent>
      </Tabs>

      {/* Revoke Rule Confirmation Modal */}
      <DeleteConfirmDialog
        open={Boolean(ruleToRevoke)}
        onOpenChange={(open) => !open && setRuleToRevoke(null)}
        title={`Revoke ${
          ruleToRevoke?.direction === "inbound" ? "Inbound" : "Outbound"
        } Rule`}
        description={`Are you sure you want to revoke rule for protocol ${ruleToRevoke?.protocol?.toUpperCase()}, port ${formatPortRange(
          ruleToRevoke?.protocol || "",
          ruleToRevoke?.fromPort,
          ruleToRevoke?.toPort,
        )}, target ${ruleToRevoke?.target}?`}
        confirmLabel="Revoke"
        onConfirm={handleRevokeConfirm}
        isPending={isRevoking}
      />
    </div>
  );
}
