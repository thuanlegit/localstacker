import { describe, it, expect, vi } from "vitest";
import type { SecretsManagerClient } from "@aws-sdk/client-secrets-manager";
import {
  SECRET_NAME_REGEX,
  listSecrets,
  getSecretValue,
  listSecretVersions,
  createSecret,
  putSecretValue,
  deleteSecret,
} from "./secrets";

describe("SECRET_NAME_REGEX", () => {
  it("validates valid secret names", () => {
    expect(SECRET_NAME_REGEX.test("db-password")).toBe(true);
    expect(SECRET_NAME_REGEX.test("app/prod/api_key")).toBe(true);
    expect(SECRET_NAME_REGEX.test("my.secret+1=2@foo-bar")).toBe(true);
  });

  it("rejects invalid secret names", () => {
    expect(SECRET_NAME_REGEX.test("")).toBe(false);
    expect(SECRET_NAME_REGEX.test("invalid space")).toBe(false);
    expect(SECRET_NAME_REGEX.test("invalid$char")).toBe(false);
  });
});

describe("secrets data plane", () => {
  describe("listSecrets", () => {
    it("handles single-page responses", async () => {
      const created = new Date("2026-01-01T00:00:00Z");
      const changed = new Date("2026-01-02T00:00:00Z");
      const send = vi.fn().mockResolvedValue({
        SecretList: [
          {
            Name: "db-pass",
            ARN: "arn:aws:secretsmanager:us-east-1:000000000000:secret:db-pass-123",
            Description: "Database password",
            CreatedDate: created,
            LastChangedDate: changed,
          },
        ],
      });
      const client = { send } as unknown as SecretsManagerClient;

      const secrets = await listSecrets(client);

      expect(send).toHaveBeenCalledOnce();
      expect(send.mock.calls[0][0].input).toEqual({});
      expect(secrets).toEqual([
        {
          name: "db-pass",
          arn: "arn:aws:secretsmanager:us-east-1:000000000000:secret:db-pass-123",
          description: "Database password",
          createdDate: created,
          lastChangedDate: changed,
        },
      ]);
    });

    it("paginates when NextToken is returned", async () => {
      const send = vi
        .fn()
        .mockResolvedValueOnce({
          SecretList: [{ Name: "secret-1", ARN: "arn:1" }],
          NextToken: "token-abc",
        })
        .mockResolvedValueOnce({
          SecretList: [{ Name: "secret-2", ARN: "arn:2" }],
        });
      const client = { send } as unknown as SecretsManagerClient;

      const secrets = await listSecrets(client);

      expect(send).toHaveBeenCalledTimes(2);
      expect(send.mock.calls[0][0].input).toEqual({});
      expect(send.mock.calls[1][0].input).toEqual({ NextToken: "token-abc" });
      expect(secrets.map((s) => s.name)).toEqual(["secret-1", "secret-2"]);
    });

    it("propagates client rejection", async () => {
      const send = vi.fn().mockRejectedValue(new Error("Service error"));
      const client = { send } as unknown as SecretsManagerClient;

      await expect(listSecrets(client)).rejects.toThrow("Service error");
    });
  });

  describe("getSecretValue", () => {
    it("defaults to AWSCURRENT versionStage when neither versionId nor versionStage is passed", async () => {
      const created = new Date("2026-01-01T00:00:00Z");
      const send = vi.fn().mockResolvedValue({
        Name: "db-pass",
        VersionId: "v1",
        SecretString: '{"user":"admin"}',
        CreatedDate: created,
      });
      const client = { send } as unknown as SecretsManagerClient;

      const val = await getSecretValue(client, { secretId: "db-pass" });

      expect(send).toHaveBeenCalledOnce();
      expect(send.mock.calls[0][0].input).toEqual({
        SecretId: "db-pass",
        VersionStage: "AWSCURRENT",
      });
      expect(val).toEqual({
        name: "db-pass",
        versionId: "v1",
        secretString: '{"user":"admin"}',
        secretBinary: undefined,
        createdDate: created,
      });
    });

    it("passes explicit versionId when specified", async () => {
      const send = vi.fn().mockResolvedValue({
        Name: "db-pass",
        VersionId: "v2",
        SecretString: "hunter2",
      });
      const client = { send } as unknown as SecretsManagerClient;

      const val = await getSecretValue(client, {
        secretId: "db-pass",
        versionId: "v2",
      });

      expect(send).toHaveBeenCalledOnce();
      expect(send.mock.calls[0][0].input).toEqual({
        SecretId: "db-pass",
        VersionId: "v2",
      });
      expect(val.secretString).toBe("hunter2");
    });

    it("passes explicit versionStage when specified without versionId", async () => {
      const send = vi.fn().mockResolvedValue({
        Name: "db-pass",
        VersionId: "v0",
        SecretString: "old-val",
      });
      const client = { send } as unknown as SecretsManagerClient;

      await getSecretValue(client, {
        secretId: "db-pass",
        versionStage: "AWSPREVIOUS",
      });

      expect(send.mock.calls[0][0].input).toEqual({
        SecretId: "db-pass",
        VersionStage: "AWSPREVIOUS",
      });
    });

    it("propagates client rejection", async () => {
      const send = vi.fn().mockRejectedValue(new Error("ResourceNotFoundException"));
      const client = { send } as unknown as SecretsManagerClient;

      await expect(getSecretValue(client, { secretId: "missing" })).rejects.toThrow(
        "ResourceNotFoundException",
      );
    });
  });

  describe("listSecretVersions", () => {
    it("lists and sorts versions descending by createdDate with undated last, and paginates", async () => {
      const d1 = new Date("2026-01-01T00:00:00Z");
      const d2 = new Date("2026-01-03T00:00:00Z");
      const send = vi
        .fn()
        .mockResolvedValueOnce({
          Versions: [
            {
              VersionId: "v1",
              CreatedDate: d1,
              VersionStages: ["AWSPREVIOUS"],
            },
            {
              VersionId: "v-undated",
              VersionStages: ["CUSTOM"],
            },
          ],
          NextToken: "tok-next",
        })
        .mockResolvedValueOnce({
          Versions: [
            {
              VersionId: "v2",
              CreatedDate: d2,
              VersionStages: ["AWSCURRENT"],
            },
          ],
        });
      const client = { send } as unknown as SecretsManagerClient;

      const versions = await listSecretVersions(client, { secretId: "db-pass" });

      expect(send).toHaveBeenCalledTimes(2);
      expect(send.mock.calls[0][0].input).toEqual({ SecretId: "db-pass" });
      expect(send.mock.calls[1][0].input).toEqual({
        SecretId: "db-pass",
        NextToken: "tok-next",
      });
      expect(versions.map((v) => v.versionId)).toEqual(["v2", "v1", "v-undated"]);
      expect(versions[0].stages).toEqual(["AWSCURRENT"]);
      expect(versions[1].stages).toEqual(["AWSPREVIOUS"]);
    });

    it("propagates client rejection", async () => {
      const send = vi.fn().mockRejectedValue(new Error("Versions error"));
      const client = { send } as unknown as SecretsManagerClient;

      await expect(listSecretVersions(client, { secretId: "db-pass" })).rejects.toThrow(
        "Versions error",
      );
    });
  });

  describe("createSecret", () => {
    it("sends Name, SecretString and Description if provided", async () => {
      const send = vi.fn().mockResolvedValue({
        Name: "my-secret",
        ARN: "arn:secret",
        VersionId: "v1",
      });
      const client = { send } as unknown as SecretsManagerClient;

      const res = await createSecret(client, {
        name: "my-secret",
        secretString: "super-secret",
        description: "app secret",
      });

      expect(send).toHaveBeenCalledOnce();
      expect(send.mock.calls[0][0].input).toEqual({
        Name: "my-secret",
        SecretString: "super-secret",
        Description: "app secret",
      });
      expect(res).toEqual({
        name: "my-secret",
        arn: "arn:secret",
        versionId: "v1",
      });
    });

    it("omits Description when undefined", async () => {
      const send = vi.fn().mockResolvedValue({
        Name: "my-secret",
        ARN: "arn:secret",
        VersionId: "v1",
      });
      const client = { send } as unknown as SecretsManagerClient;

      await createSecret(client, {
        name: "my-secret",
        secretString: "super-secret",
      });

      expect(send.mock.calls[0][0].input).toEqual({
        Name: "my-secret",
        SecretString: "super-secret",
      });
    });

    it("propagates client rejection", async () => {
      const send = vi.fn().mockRejectedValue(new Error("Already exists"));
      const client = { send } as unknown as SecretsManagerClient;

      await expect(
        createSecret(client, { name: "my-secret", secretString: "val" }),
      ).rejects.toThrow("Already exists");
    });
  });

  describe("putSecretValue", () => {
    it("updates secret value and returns versionId and stages", async () => {
      const send = vi.fn().mockResolvedValue({
        VersionId: "v2",
        VersionStages: ["AWSCURRENT"],
      });
      const client = { send } as unknown as SecretsManagerClient;

      const res = await putSecretValue(client, {
        secretId: "my-secret",
        secretString: "new-value",
      });

      expect(send).toHaveBeenCalledOnce();
      expect(send.mock.calls[0][0].input).toEqual({
        SecretId: "my-secret",
        SecretString: "new-value",
      });
      expect(res).toEqual({
        versionId: "v2",
        versionStages: ["AWSCURRENT"],
      });
    });

    it("propagates client rejection", async () => {
      const send = vi.fn().mockRejectedValue(new Error("PutSecretValue error"));
      const client = { send } as unknown as SecretsManagerClient;

      await expect(
        putSecretValue(client, { secretId: "my-secret", secretString: "val" }),
      ).rejects.toThrow("PutSecretValue error");
    });
  });

  describe("deleteSecret", () => {
    it("deletes secret with ForceDeleteWithoutRecovery: true", async () => {
      const send = vi.fn().mockResolvedValue({});
      const client = { send } as unknown as SecretsManagerClient;

      await deleteSecret(client, "my-secret");

      expect(send).toHaveBeenCalledOnce();
      expect(send.mock.calls[0][0].input).toEqual({
        SecretId: "my-secret",
        ForceDeleteWithoutRecovery: true,
      });
    });

    it("propagates client rejection", async () => {
      const send = vi.fn().mockRejectedValue(new Error("Delete error"));
      const client = { send } as unknown as SecretsManagerClient;

      await expect(deleteSecret(client, "my-secret")).rejects.toThrow("Delete error");
    });
  });
});
