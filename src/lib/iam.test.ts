import { describe, it, expect, vi } from "vitest";
import type { IAMClient } from "@aws-sdk/client-iam";
import {
  decodePolicyDocument,
  listRoles,
  getRole,
  createRole,
  deleteRole,
  listRolePolicies,
  getRolePolicy,
  putRolePolicy,
  deleteRolePolicy,
  listAttachedRolePolicies,
  listUsers,
  createUser,
  deleteUser,
  listAccessKeys,
  createAccessKey,
  updateAccessKeyStatus,
  deleteAccessKey,
  listPolicies,
} from "./iam";

describe("iam data plane", () => {
  describe("decodePolicyDocument", () => {
    it("returns empty string when input is undefined or empty", () => {
      expect(decodePolicyDocument(undefined)).toBe("");
      expect(decodePolicyDocument("")).toBe("");
    });

    it("decodes URI-encoded policy documents", () => {
      const original = '{"Version":"2012-10-17","Statement":[]}';
      const encoded = encodeURIComponent(original);
      expect(decodePolicyDocument(encoded)).toBe(original);
    });

    it("returns plain string if not URI encoded", () => {
      const raw = '{"Version":"2012-10-17"}';
      expect(decodePolicyDocument(raw)).toBe(raw);
    });

    it("falls back to raw string on decodeURIComponent error", () => {
      // Invalid percent encoding
      const malformed = "%E0%A4%A";
      expect(decodePolicyDocument(malformed)).toBe(malformed);
    });
  });

  describe("listRoles", () => {
    it("loops pagination until IsTruncated is false", async () => {
      const send = vi
        .fn()
        .mockResolvedValueOnce({
          Roles: [
            {
              RoleName: "Role1",
              RoleId: "R1",
              Arn: "arn:aws:iam::000000000000:role/Role1",
              AssumeRolePolicyDocument: "%7B%22Statement%22%3A%5B%5D%7D",
            },
          ],
          IsTruncated: true,
          Marker: "marker-1",
        })
        .mockResolvedValueOnce({
          Roles: [
            {
              RoleName: "Role2",
              RoleId: "R2",
              Arn: "arn:aws:iam::000000000000:role/Role2",
            },
          ],
          IsTruncated: false,
        });

      const client = { send } as unknown as IAMClient;
      const roles = await listRoles(client);

      expect(send).toHaveBeenCalledTimes(2);
      expect(roles).toHaveLength(2);
      expect(roles[0].roleName).toBe("Role1");
      expect(roles[0].assumeRolePolicyDocument).toBe('{"Statement":[]}');
      expect(roles[1].roleName).toBe("Role2");
    });
  });

  describe("getRole", () => {
    it("returns decoded role summary", async () => {
      const send = vi.fn().mockResolvedValueOnce({
        Role: {
          RoleName: "MyRole",
          RoleId: "R-XYZ",
          Arn: "arn:aws:iam::000000000000:role/MyRole",
          AssumeRolePolicyDocument: "%7B%7D",
        },
      });

      const client = { send } as unknown as IAMClient;
      const role = await getRole(client, "MyRole");

      expect(role.roleName).toBe("MyRole");
      expect(role.assumeRolePolicyDocument).toBe("{}");
    });

    it("throws if role not returned", async () => {
      const send = vi.fn().mockResolvedValueOnce({});
      const client = { send } as unknown as IAMClient;

      await expect(getRole(client, "MissingRole")).rejects.toThrow(
        "Role not found: MissingRole",
      );
    });
  });

  describe("createRole", () => {
    it("sends CreateRoleCommand and returns summary", async () => {
      const send = vi.fn().mockResolvedValueOnce({
        Role: {
          RoleName: "NewRole",
          RoleId: "NR1",
          Arn: "arn:aws:iam::000000000000:role/NewRole",
          AssumeRolePolicyDocument: "%7B%7D",
        },
      });

      const client = { send } as unknown as IAMClient;
      const role = await createRole(client, {
        roleName: "NewRole",
        assumeRolePolicyDocument: "{}",
      });

      expect(role.roleName).toBe("NewRole");
      expect(send).toHaveBeenCalledTimes(1);
    });
  });

  describe("deleteRole", () => {
    it("deletes inline policies, detaches attached policies, then deletes role", async () => {
      const send = vi
        .fn()
        // listRolePolicies
        .mockResolvedValueOnce({
          PolicyNames: ["Inline1"],
          IsTruncated: false,
        })
        // deleteRolePolicy
        .mockResolvedValueOnce({})
        // listAttachedRolePolicies
        .mockResolvedValueOnce({
          AttachedPolicies: [
            {
              PolicyName: "Managed1",
              PolicyArn: "arn:aws:iam::aws:policy/Managed1",
            },
          ],
          IsTruncated: false,
        })
        // detachRolePolicy
        .mockResolvedValueOnce({})
        // deleteRole
        .mockResolvedValueOnce({});

      const client = { send } as unknown as IAMClient;
      await deleteRole(client, "RoleToDelete");

      expect(send).toHaveBeenCalledTimes(5);
    });
  });

  describe("listRolePolicies and getRolePolicy", () => {
    it("lists and gets role inline policies", async () => {
      const send = vi
        .fn()
        .mockResolvedValueOnce({
          PolicyNames: ["PolicyA"],
          IsTruncated: false,
        })
        .mockResolvedValueOnce({
          PolicyName: "PolicyA",
          PolicyDocument: "%7B%22Effect%22%3A%22Allow%22%7D",
        });

      const client = { send } as unknown as IAMClient;
      const names = await listRolePolicies(client, "RoleA");
      expect(names).toEqual(["PolicyA"]);

      const policy = await getRolePolicy(client, "RoleA", "PolicyA");
      expect(policy.policyName).toBe("PolicyA");
      expect(policy.policyDocument).toBe('{"Effect":"Allow"}');
    });
  });

  describe("putRolePolicy", () => {
    it("throws client-side on invalid JSON", async () => {
      const send = vi.fn();
      const client = { send } as unknown as IAMClient;

      await expect(
        putRolePolicy(client, "RoleA", "PolicyA", "not-json"),
      ).rejects.toThrow();
      expect(send).not.toHaveBeenCalled();
    });

    it("sends PutRolePolicyCommand on valid JSON", async () => {
      const send = vi.fn().mockResolvedValueOnce({});
      const client = { send } as unknown as IAMClient;

      await putRolePolicy(client, "RoleA", "PolicyA", '{"Version":"2012-10-17"}');
      expect(send).toHaveBeenCalledTimes(1);
    });
  });

  describe("deleteRolePolicy", () => {
    it("sends DeleteRolePolicyCommand", async () => {
      const send = vi.fn().mockResolvedValueOnce({});
      const client = { send } as unknown as IAMClient;

      await deleteRolePolicy(client, "RoleA", "PolicyA");
      expect(send).toHaveBeenCalledTimes(1);
    });
  });

  describe("listAttachedRolePolicies", () => {
    it("lists attached policies with pagination", async () => {
      const send = vi
        .fn()
        .mockResolvedValueOnce({
          AttachedPolicies: [
            {
              PolicyName: "Pol1",
              PolicyArn: "arn:aws:iam::aws:policy/Pol1",
            },
          ],
          IsTruncated: true,
          Marker: "m1",
        })
        .mockResolvedValueOnce({
          AttachedPolicies: [
            {
              PolicyName: "Pol2",
              PolicyArn: "arn:aws:iam::aws:policy/Pol2",
            },
          ],
          IsTruncated: false,
        });

      const client = { send } as unknown as IAMClient;
      const res = await listAttachedRolePolicies(client, "RoleA");

      expect(res).toHaveLength(2);
      expect(res[0].policyName).toBe("Pol1");
      expect(res[1].policyName).toBe("Pol2");
    });
  });

  describe("listUsers and createUser", () => {
    it("lists users with pagination", async () => {
      const send = vi.fn().mockResolvedValueOnce({
        Users: [
          {
            UserName: "User1",
            UserId: "U1",
            Arn: "arn:aws:iam::000000000000:user/User1",
          },
        ],
        IsTruncated: false,
      });

      const client = { send } as unknown as IAMClient;
      const users = await listUsers(client);

      expect(users).toHaveLength(1);
      expect(users[0].userName).toBe("User1");
    });

    it("creates a user", async () => {
      const send = vi.fn().mockResolvedValueOnce({
        User: {
          UserName: "NewUser",
          UserId: "NU1",
          Arn: "arn:aws:iam::000000000000:user/NewUser",
        },
      });

      const client = { send } as unknown as IAMClient;
      const user = await createUser(client, { userName: "NewUser" });

      expect(user.userName).toBe("NewUser");
    });
  });

  describe("deleteUser", () => {
    it("deletes keys, user policies, attached policies, and user", async () => {
      const send = vi
        .fn()
        // listAccessKeys
        .mockResolvedValueOnce({
          AccessKeyMetadata: [{ AccessKeyId: "AK1", UserName: "UserX" }],
          IsTruncated: false,
        })
        // deleteAccessKey
        .mockResolvedValueOnce({})
        // listUserPolicies
        .mockResolvedValueOnce({
          PolicyNames: ["UPolicy1"],
          IsTruncated: false,
        })
        // deleteUserPolicy
        .mockResolvedValueOnce({})
        // listAttachedUserPolicies
        .mockResolvedValueOnce({
          AttachedPolicies: [
            {
              PolicyName: "APol1",
              PolicyArn: "arn:aws:iam::aws:policy/APol1",
            },
          ],
          IsTruncated: false,
        })
        // detachUserPolicy
        .mockResolvedValueOnce({})
        // deleteUser
        .mockResolvedValueOnce({});

      const client = { send } as unknown as IAMClient;
      await deleteUser(client, "UserX");

      expect(send).toHaveBeenCalledTimes(7);
    });
  });

  describe("access keys", () => {
    it("lists access keys", async () => {
      const send = vi.fn().mockResolvedValueOnce({
        AccessKeyMetadata: [
          {
            AccessKeyId: "AK123",
            UserName: "User1",
            Status: "Active",
          },
        ],
        IsTruncated: false,
      });

      const client = { send } as unknown as IAMClient;
      const keys = await listAccessKeys(client, "User1");

      expect(keys).toHaveLength(1);
      expect(keys[0].accessKeyId).toBe("AK123");
      expect(keys[0].status).toBe("Active");
    });

    it("creates access key", async () => {
      const send = vi.fn().mockResolvedValueOnce({
        AccessKey: {
          AccessKeyId: "AKNEW",
          SecretAccessKey: "SECRET123",
          UserName: "User1",
        },
      });

      const client = { send } as unknown as IAMClient;
      const res = await createAccessKey(client, "User1");

      expect(res.accessKeyId).toBe("AKNEW");
      expect(res.secretAccessKey).toBe("SECRET123");
    });

    it("updates access key status and deletes key", async () => {
      const send = vi.fn().mockResolvedValue({});
      const client = { send } as unknown as IAMClient;

      await updateAccessKeyStatus(client, "User1", "AK123", "Inactive");
      await deleteAccessKey(client, "User1", "AK123");

      expect(send).toHaveBeenCalledTimes(2);
    });
  });

  describe("listPolicies", () => {
    it("distinguishes AWS managed policies from local policies", async () => {
      const send = vi.fn().mockResolvedValueOnce({
        Policies: [
          {
            PolicyName: "AdministratorAccess",
            PolicyId: "P1",
            Arn: "arn:aws:iam::aws:policy/AdministratorAccess",
          },
          {
            PolicyName: "CustomPolicy",
            PolicyId: "P2",
            Arn: "arn:aws:iam::000000000000:policy/CustomPolicy",
          },
        ],
        IsTruncated: false,
      });

      const client = { send } as unknown as IAMClient;
      const policies = await listPolicies(client, "All");

      expect(policies).toHaveLength(2);
      expect(policies[0].isAwsManaged).toBe(true);
      expect(policies[1].isAwsManaged).toBe(false);
    });
  });
});
