import {
  type IAMClient,
  ListRolesCommand,
  GetRoleCommand,
  CreateRoleCommand,
  DeleteRoleCommand,
  ListRolePoliciesCommand,
  GetRolePolicyCommand,
  PutRolePolicyCommand,
  DeleteRolePolicyCommand,
  ListAttachedRolePoliciesCommand,
  DetachRolePolicyCommand,
  ListUsersCommand,
  CreateUserCommand,
  DeleteUserCommand,
  ListUserPoliciesCommand,
  DeleteUserPolicyCommand,
  ListAttachedUserPoliciesCommand,
  DetachUserPolicyCommand,
  ListAccessKeysCommand,
  CreateAccessKeyCommand,
  UpdateAccessKeyCommand,
  DeleteAccessKeyCommand,
  ListPoliciesCommand,
  type StatusType,
  type PolicyScopeType,
  type ListRolesCommandOutput,
  type ListRolePoliciesCommandOutput,
  type ListAttachedRolePoliciesCommandOutput,
  type ListUsersCommandOutput,
  type ListUserPoliciesCommandOutput,
  type ListAttachedUserPoliciesCommandOutput,
  type ListAccessKeysCommandOutput,
  type ListPoliciesCommandOutput,
} from "@aws-sdk/client-iam";

export interface RoleSummary {
  roleName: string;
  roleId: string;
  arn: string;
  createDate?: Date;
  description?: string;
  path?: string;
  assumeRolePolicyDocument?: string; // URL-decoded JSON string
}

export interface UserSummary {
  userName: string;
  userId: string;
  arn: string;
  createDate?: Date;
  path?: string;
}

export interface AccessKeySummary {
  accessKeyId: string;
  userName: string;
  status: "Active" | "Inactive";
  createDate?: Date;
}

export interface CreatedAccessKey {
  accessKeyId: string;
  secretAccessKey: string;
  userName: string;
  createDate?: Date;
}

export interface PolicySummary {
  policyName: string;
  policyId: string;
  arn: string;
  path?: string;
  defaultVersionId?: string;
  attachmentCount?: number;
  isAttachable?: boolean;
  createDate?: Date;
  updateDate?: Date;
  isAwsManaged: boolean;
}

export interface AttachedPolicySummary {
  policyName: string;
  policyArn: string;
}

export function decodePolicyDocument(raw?: string): string {
  if (!raw) return "";
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}

export async function listRoles(client: IAMClient): Promise<RoleSummary[]> {
  const roles: RoleSummary[] = [];
  let marker: string | undefined = undefined;

  do {
    const res: ListRolesCommandOutput = await client.send(
      new ListRolesCommand({
        Marker: marker,
      }),
    );

    if (res.Roles) {
      for (const r of res.Roles) {
        roles.push({
          roleName: r.RoleName ?? "",
          roleId: r.RoleId ?? "",
          arn: r.Arn ?? "",
          createDate: r.CreateDate,
          description: r.Description,
          path: r.Path,
          assumeRolePolicyDocument: decodePolicyDocument(
            r.AssumeRolePolicyDocument,
          ),
        });
      }
    }

    marker = res.IsTruncated ? res.Marker : undefined;
  } while (marker);

  return roles;
}

export async function getRole(
  client: IAMClient,
  roleName: string,
): Promise<RoleSummary> {
  const res = await client.send(
    new GetRoleCommand({
      RoleName: roleName,
    }),
  );

  const r = res.Role;
  if (!r) {
    throw new Error(`Role not found: ${roleName}`);
  }

  return {
    roleName: r.RoleName ?? "",
    roleId: r.RoleId ?? "",
    arn: r.Arn ?? "",
    createDate: r.CreateDate,
    description: r.Description,
    path: r.Path,
    assumeRolePolicyDocument: decodePolicyDocument(r.AssumeRolePolicyDocument),
  };
}

export async function createRole(
  client: IAMClient,
  input: {
    roleName: string;
    assumeRolePolicyDocument: string;
    description?: string;
    path?: string;
  },
): Promise<RoleSummary> {
  const res = await client.send(
    new CreateRoleCommand({
      RoleName: input.roleName,
      AssumeRolePolicyDocument: input.assumeRolePolicyDocument,
      Description: input.description,
      Path: input.path,
    }),
  );

  const r = res.Role;
  if (!r) {
    throw new Error(`Failed to create role: ${input.roleName}`);
  }

  return {
    roleName: r.RoleName ?? "",
    roleId: r.RoleId ?? "",
    arn: r.Arn ?? "",
    createDate: r.CreateDate,
    description: r.Description,
    path: r.Path,
    assumeRolePolicyDocument: decodePolicyDocument(r.AssumeRolePolicyDocument),
  };
}

export async function deleteRole(
  client: IAMClient,
  roleName: string,
): Promise<void> {
  // Delete inline policies
  const inlinePolicies = await listRolePolicies(client, roleName);
  for (const policyName of inlinePolicies) {
    await deleteRolePolicy(client, roleName, policyName);
  }

  // Detach attached policies
  const attachedPolicies = await listAttachedRolePolicies(client, roleName);
  for (const p of attachedPolicies) {
    await client.send(
      new DetachRolePolicyCommand({
        RoleName: roleName,
        PolicyArn: p.policyArn,
      }),
    );
  }

  // Delete the role
  await client.send(
    new DeleteRoleCommand({
      RoleName: roleName,
    }),
  );
}

export async function listRolePolicies(
  client: IAMClient,
  roleName: string,
): Promise<string[]> {
  const policies: string[] = [];
  let marker: string | undefined = undefined;

  do {
    const res: ListRolePoliciesCommandOutput = await client.send(
      new ListRolePoliciesCommand({
        RoleName: roleName,
        Marker: marker,
      }),
    );

    if (res.PolicyNames) {
      policies.push(...res.PolicyNames);
    }

    marker = res.IsTruncated ? res.Marker : undefined;
  } while (marker);

  return policies;
}

export async function getRolePolicy(
  client: IAMClient,
  roleName: string,
  policyName: string,
): Promise<{ policyName: string; policyDocument: string }> {
  const res = await client.send(
    new GetRolePolicyCommand({
      RoleName: roleName,
      PolicyName: policyName,
    }),
  );

  return {
    policyName: res.PolicyName ?? policyName,
    policyDocument: decodePolicyDocument(res.PolicyDocument),
  };
}

export async function putRolePolicy(
  client: IAMClient,
  roleName: string,
  policyName: string,
  policyDocument: string,
): Promise<void> {
  // Validate JSON client-side
  JSON.parse(policyDocument);

  await client.send(
    new PutRolePolicyCommand({
      RoleName: roleName,
      PolicyName: policyName,
      PolicyDocument: policyDocument,
    }),
  );
}

export async function deleteRolePolicy(
  client: IAMClient,
  roleName: string,
  policyName: string,
): Promise<void> {
  await client.send(
    new DeleteRolePolicyCommand({
      RoleName: roleName,
      PolicyName: policyName,
    }),
  );
}

export async function listAttachedRolePolicies(
  client: IAMClient,
  roleName: string,
): Promise<AttachedPolicySummary[]> {
  const attached: AttachedPolicySummary[] = [];
  let marker: string | undefined = undefined;

  do {
    const res: ListAttachedRolePoliciesCommandOutput = await client.send(
      new ListAttachedRolePoliciesCommand({
        RoleName: roleName,
        Marker: marker,
      }),
    );

    if (res.AttachedPolicies) {
      for (const p of res.AttachedPolicies) {
        attached.push({
          policyName: p.PolicyName ?? "",
          policyArn: p.PolicyArn ?? "",
        });
      }
    }

    marker = res.IsTruncated ? res.Marker : undefined;
  } while (marker);

  return attached;
}

export async function listUsers(client: IAMClient): Promise<UserSummary[]> {
  const users: UserSummary[] = [];
  let marker: string | undefined = undefined;

  do {
    const res: ListUsersCommandOutput = await client.send(
      new ListUsersCommand({
        Marker: marker,
      }),
    );

    if (res.Users) {
      for (const u of res.Users) {
        users.push({
          userName: u.UserName ?? "",
          userId: u.UserId ?? "",
          arn: u.Arn ?? "",
          createDate: u.CreateDate,
          path: u.Path,
        });
      }
    }

    marker = res.IsTruncated ? res.Marker : undefined;
  } while (marker);

  return users;
}

export async function createUser(
  client: IAMClient,
  input: { userName: string; path?: string },
): Promise<UserSummary> {
  const res = await client.send(
    new CreateUserCommand({
      UserName: input.userName,
      Path: input.path,
    }),
  );

  const u = res.User;
  if (!u) {
    throw new Error(`Failed to create user: ${input.userName}`);
  }

  return {
    userName: u.UserName ?? "",
    userId: u.UserId ?? "",
    arn: u.Arn ?? "",
    createDate: u.CreateDate,
    path: u.Path,
  };
}

export async function deleteUser(
  client: IAMClient,
  userName: string,
): Promise<void> {
  // Delete access keys first
  const keys = await listAccessKeys(client, userName);
  for (const k of keys) {
    await deleteAccessKey(client, userName, k.accessKeyId);
  }

  // Delete user inline policies
  let marker: string | undefined = undefined;
  do {
    const res: ListUserPoliciesCommandOutput = await client.send(
      new ListUserPoliciesCommand({
        UserName: userName,
        Marker: marker,
      }),
    );
    if (res.PolicyNames) {
      for (const pName of res.PolicyNames) {
        await client.send(
          new DeleteUserPolicyCommand({
            UserName: userName,
            PolicyName: pName,
          }),
        );
      }
    }
    marker = res.IsTruncated ? res.Marker : undefined;
  } while (marker);

  // Detach attached policies
  let attachedMarker: string | undefined = undefined;
  do {
    const res: ListAttachedUserPoliciesCommandOutput = await client.send(
      new ListAttachedUserPoliciesCommand({
        UserName: userName,
        Marker: attachedMarker,
      }),
    );
    if (res.AttachedPolicies) {
      for (const p of res.AttachedPolicies) {
        if (p.PolicyArn) {
          await client.send(
            new DetachUserPolicyCommand({
              UserName: userName,
              PolicyArn: p.PolicyArn,
            }),
          );
        }
      }
    }
    attachedMarker = res.IsTruncated ? res.Marker : undefined;
  } while (attachedMarker);

  // Delete user
  await client.send(
    new DeleteUserCommand({
      UserName: userName,
    }),
  );
}

export async function listAccessKeys(
  client: IAMClient,
  userName: string,
): Promise<AccessKeySummary[]> {
  const keys: AccessKeySummary[] = [];
  let marker: string | undefined = undefined;

  do {
    const res: ListAccessKeysCommandOutput = await client.send(
      new ListAccessKeysCommand({
        UserName: userName,
        Marker: marker,
      }),
    );

    if (res.AccessKeyMetadata) {
      for (const k of res.AccessKeyMetadata) {
        keys.push({
          accessKeyId: k.AccessKeyId ?? "",
          userName: k.UserName ?? userName,
          status: (k.Status as "Active" | "Inactive") ?? "Active",
          createDate: k.CreateDate,
        });
      }
    }

    marker = res.IsTruncated ? res.Marker : undefined;
  } while (marker);

  return keys;
}

export async function createAccessKey(
  client: IAMClient,
  userName: string,
): Promise<CreatedAccessKey> {
  const res = await client.send(
    new CreateAccessKeyCommand({
      UserName: userName,
    }),
  );

  const k = res.AccessKey;
  if (!k) {
    throw new Error(`Failed to create access key for user: ${userName}`);
  }

  return {
    accessKeyId: k.AccessKeyId ?? "",
    secretAccessKey: k.SecretAccessKey ?? "",
    userName: k.UserName ?? userName,
    createDate: k.CreateDate,
  };
}

export async function updateAccessKeyStatus(
  client: IAMClient,
  userName: string,
  accessKeyId: string,
  status: "Active" | "Inactive",
): Promise<void> {
  await client.send(
    new UpdateAccessKeyCommand({
      UserName: userName,
      AccessKeyId: accessKeyId,
      Status: status as StatusType,
    }),
  );
}

export async function deleteAccessKey(
  client: IAMClient,
  userName: string,
  accessKeyId: string,
): Promise<void> {
  await client.send(
    new DeleteAccessKeyCommand({
      UserName: userName,
      AccessKeyId: accessKeyId,
    }),
  );
}

export async function listPolicies(
  client: IAMClient,
  scope: "All" | "AWS" | "Local" = "All",
): Promise<PolicySummary[]> {
  const policies: PolicySummary[] = [];
  let marker: string | undefined = undefined;

  do {
    const res: ListPoliciesCommandOutput = await client.send(
      new ListPoliciesCommand({
        Scope: scope as PolicyScopeType,
        Marker: marker,
      }),
    );

    if (res.Policies) {
      for (const p of res.Policies) {
        policies.push({
          policyName: p.PolicyName ?? "",
          policyId: p.PolicyId ?? "",
          arn: p.Arn ?? "",
          path: p.Path,
          defaultVersionId: p.DefaultVersionId,
          attachmentCount: p.AttachmentCount,
          isAttachable: p.IsAttachable,
          createDate: p.CreateDate,
          updateDate: p.UpdateDate,
          isAwsManaged: p.Arn?.startsWith("arn:aws:iam::aws:") ?? false,
        });
      }
    }

    marker = res.IsTruncated ? res.Marker : undefined;
  } while (marker);

  return policies;
}
