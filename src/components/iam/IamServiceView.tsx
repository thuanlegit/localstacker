import { useState } from "react";
import {
  ShieldCheck,
  User,
  FileText,
  Search,
  Plus,
  RotateCw,
  MoreHorizontal,
  Copy,
  Check,
  Trash2,
  ExternalLink,
  Loader2,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { DeleteConfirmDialog } from "@/components/DeleteConfirmDialog";
import { ServiceDisabledView } from "@/components/ServiceDisabledView";
import { isServiceDisabledError, useServiceStatus } from "@/hooks/use-health";
import { CreateRoleDialog } from "./CreateRoleDialog";
import { CreateUserDialog } from "./CreateUserDialog";
import {
  useRoles,
  useUsers,
  usePolicies,
  useRoleActions,
  useUserActions,
} from "@/hooks/use-iam";
import { useTabs } from "@/store/tabs";
import { formatDate } from "@/lib/format";
import type { RoleSummary, UserSummary } from "@/lib/iam";

export function IamServiceView() {
  const serviceStatus = useServiceStatus("iam");
  const [activeTab, setActiveTab] = useState("roles");

  // Search queries
  const [roleSearch, setRoleSearch] = useState("");
  const [userSearch, setUserSearch] = useState("");
  const [policySearch, setPolicySearch] = useState("");
  const [policyScope, setPolicyScope] = useState<"All" | "Local" | "AWS">("All");

  // Dialog states
  const [isCreateRoleOpen, setIsCreateRoleOpen] = useState(false);
  const [isCreateUserOpen, setIsCreateUserOpen] = useState(false);

  // Deletion states
  const [roleToDelete, setRoleToDelete] = useState<RoleSummary | null>(null);
  const [isDeletingRole, setIsDeletingRole] = useState(false);
  const [userToDelete, setUserToDelete] = useState<UserSummary | null>(null);
  const [isDeletingUser, setIsDeletingUser] = useState(false);

  // Copied ARN states
  const [copiedArn, setCopiedArn] = useState<string | null>(null);

  // Queries
  const {
    data: roles = [],
    isLoading: isRolesLoading,
    isFetching: isRolesFetching,
    error: rolesError,
    refetch: refetchRoles,
  } = useRoles({ enabled: serviceStatus !== "disabled" });

  const {
    data: users = [],
    isLoading: isUsersLoading,
    isFetching: isUsersFetching,
    error: usersError,
    refetch: refetchUsers,
  } = useUsers({ enabled: serviceStatus !== "disabled" });

  const {
    data: policies = [],
    isLoading: isPoliciesLoading,
    isFetching: isPoliciesFetching,
    error: policiesError,
    refetch: refetchPolicies,
  } = usePolicies(policyScope, { enabled: serviceStatus !== "disabled" });

  const { deleteRole } = useRoleActions();
  const { deleteUser } = useUserActions();
  const { openTab, closeTab } = useTabs();

  if (
    serviceStatus === "disabled" ||
    [rolesError, usersError, policiesError].some(
      (e) => e && isServiceDisabledError(e),
    )
  ) {
    return <ServiceDisabledView service="iam" />;
  }

  const handleCopyArn = async (arn: string) => {
    try {
      await navigator.clipboard.writeText(arn);
      setCopiedArn(arn);
      toast.success("ARN copied to clipboard");
      setTimeout(() => setCopiedArn(null), 2000);
    } catch {
      toast.error("Failed to copy ARN");
    }
  };

  const handleOpenRole = (roleName: string) => {
    openTab({
      id: `iamRole:${roleName}`,
      kind: "iamRole",
      roleName,
      title: roleName,
    });
  };

  const handleOpenUser = (userName: string) => {
    openTab({
      id: `iamUser:${userName}`,
      kind: "iamUser",
      userName,
      title: userName,
    });
  };

  const handleDeleteRole = async () => {
    if (!roleToDelete) return;
    setIsDeletingRole(true);
    try {
      const ok = await deleteRole(roleToDelete.roleName);
      if (ok) {
        closeTab(`iamRole:${roleToDelete.roleName}`);
        setRoleToDelete(null);
      }
    } finally {
      setIsDeletingRole(false);
    }
  };

  const handleDeleteUser = async () => {
    if (!userToDelete) return;
    setIsDeletingUser(true);
    try {
      const ok = await deleteUser(userToDelete.userName);
      if (ok) {
        closeTab(`iamUser:${userToDelete.userName}`);
        setUserToDelete(null);
      }
    } finally {
      setIsDeletingUser(false);
    }
  };

  // Filtered lists
  const filteredRoles = roles.filter(
    (r) =>
      r.roleName.toLowerCase().includes(roleSearch.toLowerCase()) ||
      (r.description &&
        r.description.toLowerCase().includes(roleSearch.toLowerCase())),
  );

  const filteredUsers = users.filter((u) =>
    u.userName.toLowerCase().includes(userSearch.toLowerCase()),
  );

  const filteredPolicies = policies.filter((p) =>
    p.policyName.toLowerCase().includes(policySearch.toLowerCase()),
  );

  const isFetching =
    activeTab === "roles"
      ? isRolesFetching
      : activeTab === "users"
        ? isUsersFetching
        : isPoliciesFetching;

  const handleRefresh = () => {
    if (activeTab === "roles") refetchRoles();
    else if (activeTab === "users") refetchUsers();
    else refetchPolicies();
  };

  return (
    <div className="flex h-full flex-col overflow-hidden bg-background">
      {/* Service Header */}
      <div className="flex shrink-0 items-center justify-between border-b px-6 py-4">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <ShieldCheck className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-lg font-semibold">IAM</h1>
            <p className="text-xs text-muted-foreground">
              Identity & Access Management (Roles, Users, and Policies)
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handleRefresh}
            disabled={isFetching}
            title="Refresh"
          >
            <RotateCw className={`h-4 w-4 ${isFetching ? "animate-spin" : ""}`} />
            <span className="hidden sm:inline">Refresh</span>
          </Button>
          {activeTab === "roles" && (
            <Button size="sm" onClick={() => setIsCreateRoleOpen(true)}>
              <Plus className="mr-1.5 h-4 w-4" /> Create Role
            </Button>
          )}
          {activeTab === "users" && (
            <Button size="sm" onClick={() => setIsCreateUserOpen(true)}>
              <Plus className="mr-1.5 h-4 w-4" /> Create User
            </Button>
          )}
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 overflow-auto p-6">
        <Tabs
          value={activeTab}
          onValueChange={setActiveTab}
          className="w-full space-y-4"
        >
          <TabsList>
            <TabsTrigger value="roles">Roles ({roles.length})</TabsTrigger>
            <TabsTrigger value="users">Users ({users.length})</TabsTrigger>
            <TabsTrigger value="policies">Policies ({policies.length})</TabsTrigger>
          </TabsList>

          {/* Roles Tab */}
          <TabsContent value="roles" className="space-y-4">
            <div className="flex items-center justify-between gap-4">
              <div className="relative flex-1 max-w-sm">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search roles..."
                  className="pl-8 text-xs"
                  value={roleSearch}
                  onChange={(e) => setRoleSearch(e.target.value)}
                />
              </div>
            </div>

            {isRolesLoading ? (
              <div className="flex h-40 items-center justify-center">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : filteredRoles.length === 0 ? (
              <div className="rounded-md border border-dashed p-8 text-center text-sm text-muted-foreground">
                {roleSearch ? "No roles match your search." : "No IAM roles found."}
              </div>
            ) : (
              <div className="rounded-md border overflow-hidden">
                <table className="w-full text-xs text-left">
                  <thead className="bg-muted/50 border-b text-muted-foreground font-medium">
                    <tr>
                      <th className="py-2.5 px-4">Role Name</th>
                      <th className="py-2.5 px-4">Path</th>
                      <th className="py-2.5 px-4">ARN</th>
                      <th className="py-2.5 px-4">Created Date</th>
                      <th className="py-2.5 px-4 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {filteredRoles.map((role) => (
                      <tr key={role.roleName} className="hover:bg-muted/20">
                        <td className="py-2.5 px-4 font-medium">
                          <button
                            type="button"
                            className="font-medium hover:underline text-left text-foreground flex items-center gap-1.5"
                            onClick={() => handleOpenRole(role.roleName)}
                          >
                            <ShieldCheck className="h-3.5 w-3.5 text-primary shrink-0" />
                            <span>{role.roleName}</span>
                          </button>
                          {role.description && (
                            <p className="text-[11px] text-muted-foreground font-normal truncate max-w-xs mt-0.5">
                              {role.description}
                            </p>
                          )}
                        </td>
                        <td className="py-2.5 px-4 text-muted-foreground font-mono">
                          {role.path || "/"}
                        </td>
                        <td className="py-2.5 px-4 font-mono text-[11px] text-muted-foreground">
                          <div className="flex items-center gap-1">
                            <span className="truncate max-w-xs">{role.arn}</span>
                            <button
                              type="button"
                              onClick={() => handleCopyArn(role.arn)}
                              className="hover:text-foreground text-muted-foreground ml-1"
                              title="Copy ARN"
                            >
                              {copiedArn === role.arn ? (
                                <Check className="h-3 w-3 text-emerald-500" />
                              ) : (
                                <Copy className="h-3 w-3" />
                              )}
                            </button>
                          </div>
                        </td>
                        <td className="py-2.5 px-4 text-muted-foreground">
                          {role.createDate ? formatDate(role.createDate) : "—"}
                        </td>
                        <td className="py-2.5 px-4 text-right">
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon" className="h-7 w-7">
                                <MoreHorizontal className="h-3.5 w-3.5" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem
                                onClick={() => handleOpenRole(role.roleName)}
                              >
                                <ExternalLink className="mr-2 h-3.5 w-3.5" /> Open
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                onClick={() => handleCopyArn(role.arn)}
                              >
                                <Copy className="mr-2 h-3.5 w-3.5" /> Copy ARN
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                className="text-destructive focus:text-destructive"
                                onClick={() => setRoleToDelete(role)}
                              >
                                <Trash2 className="mr-2 h-3.5 w-3.5" /> Delete
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </TabsContent>

          {/* Users Tab */}
          <TabsContent value="users" className="space-y-4">
            <div className="flex items-center justify-between gap-4">
              <div className="relative flex-1 max-w-sm">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search users..."
                  className="pl-8 text-xs"
                  value={userSearch}
                  onChange={(e) => setUserSearch(e.target.value)}
                />
              </div>
            </div>

            {isUsersLoading ? (
              <div className="flex h-40 items-center justify-center">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : filteredUsers.length === 0 ? (
              <div className="rounded-md border border-dashed p-8 text-center text-sm text-muted-foreground">
                {userSearch ? "No users match your search." : "No IAM users found."}
              </div>
            ) : (
              <div className="rounded-md border overflow-hidden">
                <table className="w-full text-xs text-left">
                  <thead className="bg-muted/50 border-b text-muted-foreground font-medium">
                    <tr>
                      <th className="py-2.5 px-4">User Name</th>
                      <th className="py-2.5 px-4">Path</th>
                      <th className="py-2.5 px-4">ARN</th>
                      <th className="py-2.5 px-4">Created Date</th>
                      <th className="py-2.5 px-4 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {filteredUsers.map((user) => (
                      <tr key={user.userName} className="hover:bg-muted/20">
                        <td className="py-2.5 px-4 font-medium">
                          <button
                            type="button"
                            className="font-medium hover:underline text-left text-foreground flex items-center gap-1.5"
                            onClick={() => handleOpenUser(user.userName)}
                          >
                            <User className="h-3.5 w-3.5 text-primary shrink-0" />
                            <span>{user.userName}</span>
                          </button>
                        </td>
                        <td className="py-2.5 px-4 text-muted-foreground font-mono">
                          {user.path || "/"}
                        </td>
                        <td className="py-2.5 px-4 font-mono text-[11px] text-muted-foreground">
                          <div className="flex items-center gap-1">
                            <span className="truncate max-w-xs">{user.arn}</span>
                            <button
                              type="button"
                              onClick={() => handleCopyArn(user.arn)}
                              className="hover:text-foreground text-muted-foreground ml-1"
                              title="Copy ARN"
                            >
                              {copiedArn === user.arn ? (
                                <Check className="h-3 w-3 text-emerald-500" />
                              ) : (
                                <Copy className="h-3 w-3" />
                              )}
                            </button>
                          </div>
                        </td>
                        <td className="py-2.5 px-4 text-muted-foreground">
                          {user.createDate ? formatDate(user.createDate) : "—"}
                        </td>
                        <td className="py-2.5 px-4 text-right">
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon" className="h-7 w-7">
                                <MoreHorizontal className="h-3.5 w-3.5" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem
                                onClick={() => handleOpenUser(user.userName)}
                              >
                                <ExternalLink className="mr-2 h-3.5 w-3.5" /> Open
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                onClick={() => handleCopyArn(user.arn)}
                              >
                                <Copy className="mr-2 h-3.5 w-3.5" /> Copy ARN
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                className="text-destructive focus:text-destructive"
                                onClick={() => setUserToDelete(user)}
                              >
                                <Trash2 className="mr-2 h-3.5 w-3.5" /> Delete
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </TabsContent>

          {/* Policies Tab */}
          <TabsContent value="policies" className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div className="relative flex-1 max-w-sm">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search policies..."
                  className="pl-8 text-xs"
                  value={policySearch}
                  onChange={(e) => setPolicySearch(e.target.value)}
                />
              </div>

              <div className="flex items-center gap-1 rounded-lg border p-1 bg-muted/30">
                <Button
                  size="sm"
                  variant={policyScope === "All" ? "secondary" : "ghost"}
                  className="h-7 text-xs px-2.5"
                  onClick={() => setPolicyScope("All")}
                >
                  All
                </Button>
                <Button
                  size="sm"
                  variant={policyScope === "Local" ? "secondary" : "ghost"}
                  className="h-7 text-xs px-2.5"
                  onClick={() => setPolicyScope("Local")}
                >
                  Customer Managed
                </Button>
                <Button
                  size="sm"
                  variant={policyScope === "AWS" ? "secondary" : "ghost"}
                  className="h-7 text-xs px-2.5"
                  onClick={() => setPolicyScope("AWS")}
                >
                  AWS Managed
                </Button>
              </div>
            </div>

            {isPoliciesLoading ? (
              <div className="flex h-40 items-center justify-center">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : filteredPolicies.length === 0 ? (
              <div className="rounded-md border border-dashed p-8 text-center text-sm text-muted-foreground">
                {policySearch
                  ? "No policies match your search."
                  : "No policies found for the selected scope."}
              </div>
            ) : (
              <div className="rounded-md border overflow-hidden">
                <table className="w-full text-xs text-left">
                  <thead className="bg-muted/50 border-b text-muted-foreground font-medium">
                    <tr>
                      <th className="py-2.5 px-4">Policy Name</th>
                      <th className="py-2.5 px-4">Type</th>
                      <th className="py-2.5 px-4">ARN</th>
                      <th className="py-2.5 px-4">Attachments</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {filteredPolicies.map((p) => (
                      <tr key={p.arn} className="hover:bg-muted/20">
                        <td className="py-2.5 px-4 font-medium flex items-center gap-1.5">
                          <FileText className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                          <span>{p.policyName}</span>
                        </td>
                        <td className="py-2.5 px-4">
                          <Badge
                            variant={p.isAwsManaged ? "secondary" : "outline"}
                            className="text-[10px] px-1.5 py-0"
                          >
                            {p.isAwsManaged ? "AWS Managed" : "Customer"}
                          </Badge>
                        </td>
                        <td className="py-2.5 px-4 font-mono text-[11px] text-muted-foreground">
                          <div className="flex items-center gap-1">
                            <span className="truncate max-w-xs">{p.arn}</span>
                            <button
                              type="button"
                              onClick={() => handleCopyArn(p.arn)}
                              className="hover:text-foreground text-muted-foreground ml-1"
                              title="Copy ARN"
                            >
                              {copiedArn === p.arn ? (
                                <Check className="h-3 w-3 text-emerald-500" />
                              ) : (
                                <Copy className="h-3 w-3" />
                              )}
                            </button>
                          </div>
                        </td>
                        <td className="py-2.5 px-4 text-muted-foreground">
                          {p.attachmentCount ?? 0}
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

      {/* Delete Role Dialog */}
      <DeleteConfirmDialog
        open={Boolean(roleToDelete)}
        onOpenChange={(open) => !open && setRoleToDelete(null)}
        title="Delete IAM Role"
        description={`Are you sure you want to delete role "${roleToDelete?.roleName}"? All inline policies and attached policies will be removed.`}
        onConfirm={handleDeleteRole}
        isPending={isDeletingRole}
      />

      {/* Delete User Dialog */}
      <DeleteConfirmDialog
        open={Boolean(userToDelete)}
        onOpenChange={(open) => !open && setUserToDelete(null)}
        title="Delete IAM User"
        description={`Are you sure you want to delete user "${userToDelete?.userName}"? All credentials will be deleted.`}
        onConfirm={handleDeleteUser}
        isPending={isDeletingUser}
      />

      {/* Create Role Dialog */}
      <CreateRoleDialog
        open={isCreateRoleOpen}
        onOpenChange={setIsCreateRoleOpen}
        onCreated={(roleName) => {
          handleOpenRole(roleName);
        }}
      />

      {/* Create User Dialog */}
      <CreateUserDialog
        open={isCreateUserOpen}
        onOpenChange={setIsCreateUserOpen}
        onCreated={(userName) => {
          handleOpenUser(userName);
        }}
      />
    </div>
  );
}
