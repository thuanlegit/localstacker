import { useState } from "react";
import {
  ShieldCheck,
  Copy,
  Check,
  Trash2,
  Plus,
  Edit2,
  Loader2,
  RotateCw,
  AlertCircle,
  FileCode,
  FileText,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DeleteConfirmDialog } from "@/components/DeleteConfirmDialog";
import { PolicyJsonViewer } from "./PolicyJsonViewer";
import { InlinePolicyDialog } from "./InlinePolicyDialog";
import {
  useRole,
  useRolePolicies,
  useRolePolicy,
  useAttachedRolePolicies,
  useRoleActions,
} from "@/hooks/use-iam";
import { useTabs } from "@/store/tabs";
import { formatDate } from "@/lib/format";

interface RoleViewProps {
  roleName: string;
}

export function RoleView({ roleName }: RoleViewProps) {
  const [copiedArn, setCopiedArn] = useState(false);
  const [isDeleteRoleOpen, setIsDeleteRoleOpen] = useState(false);
  const [isDeletingRole, setIsDeletingRole] = useState(false);

  // Inline policy modal state
  const [isPolicyDialogOpen, setIsPolicyDialogOpen] = useState(false);
  const [editingPolicyName, setEditingPolicyName] = useState<string | undefined>();
  const [editingPolicyDoc, setEditingPolicyDoc] = useState<string | undefined>();

  // Inline policy delete state
  const [deletingPolicyName, setDeletingPolicyName] = useState<string | null>(null);
  const [isDeletingPolicy, setIsDeletingPolicy] = useState(false);

  // Active selected inline policy to view
  const [selectedInlinePolicy, setSelectedInlinePolicy] = useState<string | null>(null);

  const {
    data: role,
    isLoading: isRoleLoading,
    error: roleError,
    refetch: refetchRole,
  } = useRole(roleName);

  const {
    data: inlinePolicyNames = [],
    refetch: refetchPolicies,
  } = useRolePolicies(roleName);

  const effectiveSelectedPolicy =
    selectedInlinePolicy && inlinePolicyNames.includes(selectedInlinePolicy)
      ? selectedInlinePolicy
      : inlinePolicyNames[0] ?? null;

  const {
    data: selectedPolicyData,
    isLoading: isPolicyDocLoading,
  } = useRolePolicy(roleName, effectiveSelectedPolicy ?? "", {
    enabled: Boolean(effectiveSelectedPolicy),
  });

  const {
    data: attachedPolicies = [],
    refetch: refetchAttached,
  } = useAttachedRolePolicies(roleName);

  const { deleteRole, deleteRolePolicy } = useRoleActions();

  const handleCopyArn = async (arn: string) => {
    try {
      await navigator.clipboard.writeText(arn);
      setCopiedArn(true);
      toast.success("Role ARN copied to clipboard");
      setTimeout(() => setCopiedArn(false), 2000);
    } catch {
      toast.error("Failed to copy ARN");
    }
  };

  const handleDeleteRole = async () => {
    setIsDeletingRole(true);
    try {
      const ok = await deleteRole(roleName);
      if (ok) {
        setIsDeleteRoleOpen(false);
        useTabs.getState().closeTab(`iamRole:${roleName}`);
      }
    } finally {
      setIsDeletingRole(false);
    }
  };

  const handleDeleteInlinePolicy = async () => {
    if (!deletingPolicyName) return;
    setIsDeletingPolicy(true);
    try {
      const ok = await deleteRolePolicy(roleName, deletingPolicyName);
      if (ok) {
        setDeletingPolicyName(null);
        if (selectedInlinePolicy === deletingPolicyName) {
          setSelectedInlinePolicy(null);
        }
      }
    } finally {
      setIsDeletingPolicy(false);
    }
  };

  if (isRoleLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (roleError || !role) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center">
        <AlertCircle className="h-10 w-10 text-destructive" />
        <h2 className="text-lg font-semibold">Role Not Found</h2>
        <p className="text-sm text-muted-foreground">
          {roleError instanceof Error ? roleError.message : `Role "${roleName}" could not be loaded.`}
        </p>
        <Button variant="outline" size="sm" onClick={() => refetchRole()}>
          <RotateCw className="mr-2 h-4 w-4" /> Retry
        </Button>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col overflow-hidden bg-background">
      {/* Header */}
      <div className="flex shrink-0 items-start justify-between border-b px-6 py-4">
        <div className="space-y-1.5">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-md bg-primary/10 text-primary">
              <ShieldCheck className="h-5 w-5" />
            </div>
            <h1 className="text-xl font-semibold tracking-tight">{role.roleName}</h1>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <Badge
              variant="outline"
              className="flex items-center gap-1.5 font-mono text-[11px] py-0.5"
            >
              <span>{role.arn}</span>
              <button
                type="button"
                onClick={() => handleCopyArn(role.arn)}
                className="hover:text-foreground text-muted-foreground ml-1"
                title="Copy ARN"
              >
                {copiedArn ? (
                  <Check className="h-3 w-3 text-emerald-500" />
                ) : (
                  <Copy className="h-3 w-3" />
                )}
              </button>
            </Badge>
            {role.createDate && (
              <span className="text-muted-foreground">
                Created: {formatDate(role.createDate)}
              </span>
            )}
            {role.description && (
              <span className="text-muted-foreground italic">— {role.description}</span>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              refetchRole();
              refetchPolicies();
              refetchAttached();
            }}
            title="Refresh Role"
          >
            <RotateCw className="h-4 w-4" />
          </Button>
          <Button
            variant="destructive"
            size="sm"
            onClick={() => setIsDeleteRoleOpen(true)}
          >
            <Trash2 className="mr-1.5 h-4 w-4" /> Delete Role
          </Button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex-1 overflow-auto p-6">
        <Tabs defaultValue="trust" className="w-full space-y-4">
          <TabsList>
            <TabsTrigger value="trust">Trust Relationship</TabsTrigger>
            <TabsTrigger value="inline">
              Inline Policies ({inlinePolicyNames.length})
            </TabsTrigger>
            <TabsTrigger value="attached">
              Attached Policies ({attachedPolicies.length})
            </TabsTrigger>
          </TabsList>

          {/* Trust Relationship Tab */}
          <TabsContent value="trust" className="space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-medium">Assume Role Policy Document</h3>
                <p className="text-xs text-muted-foreground">
                  Defines which principals (services or accounts) can assume this role.
                </p>
              </div>
            </div>
            <PolicyJsonViewer json={role.assumeRolePolicyDocument || "{}"} />
          </TabsContent>

          {/* Inline Policies Tab */}
          <TabsContent value="inline" className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-medium">Inline Policies</h3>
                <p className="text-xs text-muted-foreground">
                  Policies embedded directly into this IAM role.
                </p>
              </div>
              <Button
                size="sm"
                onClick={() => {
                  setEditingPolicyName(undefined);
                  setEditingPolicyDoc(undefined);
                  setIsPolicyDialogOpen(true);
                }}
              >
                <Plus className="mr-1.5 h-4 w-4" /> Add Inline Policy
              </Button>
            </div>

            {inlinePolicyNames.length === 0 ? (
              <div className="rounded-md border border-dashed p-8 text-center text-sm text-muted-foreground">
                No inline policies attached to this role.
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                {/* Policy list column */}
                <div className="space-y-1.5 md:border-r md:pr-4">
                  <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                    Policies
                  </span>
                  {inlinePolicyNames.map((name) => (
                    <button
                      key={name}
                      type="button"
                      onClick={() => setSelectedInlinePolicy(name)}
                      className={`flex w-full items-center justify-between rounded-md px-3 py-2 text-left text-xs transition-colors ${
                        effectiveSelectedPolicy === name
                          ? "bg-accent font-medium text-accent-foreground"
                          : "hover:bg-muted/60 text-muted-foreground"
                      }`}
                    >
                      <span className="flex items-center gap-1.5 truncate">
                        <FileCode className="h-3.5 w-3.5 shrink-0" />
                        <span className="truncate">{name}</span>
                      </span>
                    </button>
                  ))}
                </div>

                {/* Policy document column */}
                <div className="md:col-span-3 space-y-3">
                  {effectiveSelectedPolicy && (
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-medium font-mono">
                        {effectiveSelectedPolicy}
                      </span>
                      <div className="flex items-center gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 text-xs"
                          onClick={() => {
                            setEditingPolicyName(effectiveSelectedPolicy);
                            setEditingPolicyDoc(selectedPolicyData?.policyDocument || "");
                            setIsPolicyDialogOpen(true);
                          }}
                        >
                          <Edit2 className="mr-1 h-3 w-3" /> Edit
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 text-xs text-destructive hover:bg-destructive/10"
                          onClick={() => setDeletingPolicyName(effectiveSelectedPolicy)}
                        >
                          <Trash2 className="mr-1 h-3 w-3" /> Delete
                        </Button>
                      </div>
                    </div>
                  )}

                  {isPolicyDocLoading ? (
                    <div className="flex h-40 items-center justify-center rounded-md border bg-muted/20">
                      <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                    </div>
                  ) : (
                    <PolicyJsonViewer
                      json={selectedPolicyData?.policyDocument || "{}"}
                    />
                  )}
                </div>
              </div>
            )}
          </TabsContent>

          {/* Attached Policies Tab */}
          <TabsContent value="attached" className="space-y-3">
            <div>
              <h3 className="text-sm font-medium">Attached Managed Policies</h3>
              <p className="text-xs text-muted-foreground">
                Standalone AWS-managed or customer-managed policies attached to this role.
              </p>
            </div>

            {attachedPolicies.length === 0 ? (
              <div className="rounded-md border border-dashed p-8 text-center text-sm text-muted-foreground">
                No managed policies attached to this role.
              </div>
            ) : (
              <div className="rounded-md border divide-y text-xs">
                {attachedPolicies.map((p) => (
                  <div
                    key={p.policyArn}
                    className="flex items-center justify-between p-3 hover:bg-muted/30"
                  >
                    <div className="flex items-center gap-2">
                      <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
                      <div>
                        <p className="font-medium text-foreground">{p.policyName}</p>
                        <p className="font-mono text-[11px] text-muted-foreground">
                          {p.policyArn}
                        </p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </div>

      {/* Delete Role Confirm Dialog */}
      <DeleteConfirmDialog
        open={isDeleteRoleOpen}
        onOpenChange={setIsDeleteRoleOpen}
        title="Delete IAM Role"
        description={`Are you sure you want to delete role "${roleName}"? All inline policies will be removed and attached policies will be detached.`}
        onConfirm={handleDeleteRole}
        isPending={isDeletingRole}
      />

      {/* Delete Inline Policy Confirm Dialog */}
      <DeleteConfirmDialog
        open={Boolean(deletingPolicyName)}
        onOpenChange={(open) => !open && setDeletingPolicyName(null)}
        title="Delete Inline Policy"
        description={`Are you sure you want to delete inline policy "${deletingPolicyName}" from role "${roleName}"?`}
        onConfirm={handleDeleteInlinePolicy}
        isPending={isDeletingPolicy}
      />

      {/* Inline Policy Dialog (Create / Edit) */}
      <InlinePolicyDialog
        open={isPolicyDialogOpen}
        onOpenChange={setIsPolicyDialogOpen}
        roleName={roleName}
        initialPolicyName={editingPolicyName}
        initialPolicyDocument={editingPolicyDoc}
        onSaved={() => {
          refetchPolicies();
        }}
      />
    </div>
  );
}
