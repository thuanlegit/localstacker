import { useState } from "react";
import {
  User,
  Copy,
  Check,
  Trash2,
  Plus,
  Loader2,
  RotateCw,
  Key,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DeleteConfirmDialog } from "@/components/DeleteConfirmDialog";
import { AccessKeyCreatedDialog } from "./AccessKeyCreatedDialog";
import {
  useUsers,
  useAccessKeys,
  useUserActions,
} from "@/hooks/use-iam";
import { useTabs } from "@/store/tabs";
import { formatDate } from "@/lib/format";
import type { CreatedAccessKey } from "@/lib/iam";

interface UserViewProps {
  userName: string;
}

export function UserView({ userName }: UserViewProps) {
  const [copiedArn, setCopiedArn] = useState(false);
  const [isDeleteUserOpen, setIsDeleteUserOpen] = useState(false);
  const [isDeletingUser, setIsDeletingUser] = useState(false);

  // Access key deletion state
  const [deletingKeyId, setDeletingKeyId] = useState<string | null>(null);
  const [isDeletingKey, setIsDeletingKey] = useState(false);

  // Created access key dialog state
  const [createdKey, setCreatedKey] = useState<CreatedAccessKey | null>(null);
  const [isKeyCreatedDialogOpen, setIsKeyCreatedDialogOpen] = useState(false);

  // Loading state for toggle
  const [togglingKeyId, setTogglingKeyId] = useState<string | null>(null);

  const { data: users = [], isLoading: isUsersLoading, refetch: refetchUsers } =
    useUsers();
  const userSummary = users.find((u) => u.userName === userName);

  const {
    data: accessKeys = [],
    isLoading: isKeysLoading,
    refetch: refetchKeys,
  } = useAccessKeys(userName);

  const {
    deleteUser,
    createAccessKey,
    updateAccessKeyStatus,
    deleteAccessKey,
  } = useUserActions();

  const handleCopyArn = async (arn: string) => {
    try {
      await navigator.clipboard.writeText(arn);
      setCopiedArn(true);
      toast.success("User ARN copied to clipboard");
      setTimeout(() => setCopiedArn(false), 2000);
    } catch {
      toast.error("Failed to copy ARN");
    }
  };

  const handleDeleteUser = async () => {
    setIsDeletingUser(true);
    try {
      const ok = await deleteUser(userName);
      if (ok) {
        setIsDeleteUserOpen(false);
        useTabs.getState().closeTab(`iamUser:${userName}`);
      }
    } finally {
      setIsDeletingUser(false);
    }
  };

  const handleCreateKey = async () => {
    const res = await createAccessKey(userName);
    if (res) {
      setCreatedKey(res);
      setIsKeyCreatedDialogOpen(true);
      refetchKeys();
    }
  };

  const handleToggleKeyStatus = async (
    accessKeyId: string,
    currentStatus: "Active" | "Inactive",
  ) => {
    const nextStatus = currentStatus === "Active" ? "Inactive" : "Active";
    setTogglingKeyId(accessKeyId);
    try {
      await updateAccessKeyStatus(userName, accessKeyId, nextStatus);
      refetchKeys();
    } finally {
      setTogglingKeyId(null);
    }
  };

  const handleDeleteKey = async () => {
    if (!deletingKeyId) return;
    setIsDeletingKey(true);
    try {
      const ok = await deleteAccessKey(userName, deletingKeyId);
      if (ok) {
        setDeletingKeyId(null);
        refetchKeys();
      }
    } finally {
      setIsDeletingKey(false);
    }
  };

  if (isUsersLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
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
              <User className="h-5 w-5" />
            </div>
            <h1 className="text-xl font-semibold tracking-tight">{userName}</h1>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-xs">
            {userSummary?.arn && (
              <Badge
                variant="outline"
                className="flex items-center gap-1.5 font-mono text-[11px] py-0.5"
              >
                <span>{userSummary.arn}</span>
                <button
                  type="button"
                  onClick={() => handleCopyArn(userSummary.arn)}
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
            )}
            {userSummary?.createDate && (
              <span className="text-muted-foreground">
                Created: {formatDate(userSummary.createDate)}
              </span>
            )}
            {userSummary?.path && (
              <span className="text-muted-foreground font-mono">
                Path: {userSummary.path}
              </span>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              refetchUsers();
              refetchKeys();
            }}
            title="Refresh User"
          >
            <RotateCw className="h-4 w-4" />
          </Button>
          <Button
            variant="destructive"
            size="sm"
            onClick={() => setIsDeleteUserOpen(true)}
          >
            <Trash2 className="mr-1.5 h-4 w-4" /> Delete User
          </Button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex-1 overflow-auto p-6">
        <Tabs defaultValue="keys" className="w-full space-y-4">
          <TabsList>
            <TabsTrigger value="keys">
              Access Keys ({accessKeys.length})
            </TabsTrigger>
          </TabsList>

          {/* Access Keys Tab */}
          <TabsContent value="keys" className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-medium">Access Keys</h3>
                <p className="text-xs text-muted-foreground">
                  Security credentials used for programmatic API and CLI access.
                </p>
              </div>
              <Button size="sm" onClick={handleCreateKey}>
                <Plus className="mr-1.5 h-4 w-4" /> Create Access Key
              </Button>
            </div>

            {isKeysLoading ? (
              <div className="flex h-32 items-center justify-center">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : accessKeys.length === 0 ? (
              <div className="rounded-md border border-dashed p-8 text-center text-sm text-muted-foreground">
                No active or inactive access keys for this user.
              </div>
            ) : (
              <div className="rounded-md border overflow-hidden">
                <table className="w-full text-xs text-left">
                  <thead className="bg-muted/50 border-b text-muted-foreground font-medium">
                    <tr>
                      <th className="py-2.5 px-4">Access Key ID</th>
                      <th className="py-2.5 px-4">Status</th>
                      <th className="py-2.5 px-4">Created Date</th>
                      <th className="py-2.5 px-4 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {accessKeys.map((key) => (
                      <tr key={key.accessKeyId} className="hover:bg-muted/20">
                        <td className="py-2.5 px-4 font-mono font-medium">
                          <div className="flex items-center gap-1.5">
                            <Key className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                            <span>{key.accessKeyId}</span>
                          </div>
                        </td>
                        <td className="py-2.5 px-4">
                          <Badge
                            variant={key.status === "Active" ? "default" : "outline"}
                            className={`text-[10px] px-1.5 py-0 ${
                              key.status === "Active"
                                ? "bg-emerald-600 hover:bg-emerald-700 text-white"
                                : "text-muted-foreground"
                            }`}
                          >
                            {key.status}
                          </Badge>
                        </td>
                        <td className="py-2.5 px-4 text-muted-foreground">
                          {key.createDate ? formatDate(key.createDate) : "—"}
                        </td>
                        <td className="py-2.5 px-4 text-right">
                          <div className="flex items-center justify-end gap-2">
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-7 text-xs"
                              disabled={togglingKeyId === key.accessKeyId}
                              onClick={() =>
                                handleToggleKeyStatus(key.accessKeyId, key.status)
                              }
                            >
                              {togglingKeyId === key.accessKeyId && (
                                <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                              )}
                              {key.status === "Active" ? "Deactivate" : "Activate"}
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-7 text-xs text-destructive hover:bg-destructive/10"
                              onClick={() => setDeletingKeyId(key.accessKeyId)}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </TabsContent>
        </Tabs>
      </div>

      {/* Delete User Confirm Dialog */}
      <DeleteConfirmDialog
        open={isDeleteUserOpen}
        onOpenChange={setIsDeleteUserOpen}
        title="Delete IAM User"
        description={`Are you sure you want to delete user "${userName}"? All access keys, inline policies, and group memberships will be permanently removed.`}
        onConfirm={handleDeleteUser}
        isPending={isDeletingUser}
      />

      {/* Delete Access Key Confirm Dialog */}
      <DeleteConfirmDialog
        open={Boolean(deletingKeyId)}
        onOpenChange={(open) => !open && setDeletingKeyId(null)}
        title="Delete Access Key"
        description={`Are you sure you want to delete access key "${deletingKeyId}"? Applications using this key will immediately lose access.`}
        onConfirm={handleDeleteKey}
        isPending={isDeletingKey}
      />

      {/* Access Key Created Dialog */}
      <AccessKeyCreatedDialog
        open={isKeyCreatedDialogOpen}
        onOpenChange={setIsKeyCreatedDialogOpen}
        accessKey={createdKey}
      />
    </div>
  );
}
