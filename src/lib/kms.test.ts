import { describe, it, expect, vi } from "vitest";
import type { KMSClient } from "@aws-sdk/client-kms";
import {
  listKeys,
  describeKey,
  listAliases,
  createKey,
  createAlias,
  deleteAlias,
  encrypt,
  decrypt,
  getRotationStatus,
  getKeyPolicy,
  deleteKey,
} from "./kms";

describe("kms data plane", () => {
  describe("listKeys", () => {
    it("paginates by NextMarker/Marker and maps ids", async () => {
      const send = vi
        .fn()
        .mockResolvedValueOnce({
          Keys: [{ KeyId: "k1", KeyArn: "arn:k1" }],
          NextMarker: "m1",
          Truncated: true,
        })
        .mockResolvedValueOnce({
          Keys: [{ KeyId: "k2", KeyArn: "arn:k2" }],
          Truncated: false,
        });

      const client = { send } as unknown as KMSClient;
      const keys = await listKeys(client);

      expect(send).toHaveBeenCalledTimes(2);
      expect(send).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({ input: { Marker: "m1", Limit: 100 } }),
      );
      expect(keys).toEqual([
        { keyId: "k1", arn: "arn:k1" },
        { keyId: "k2", arn: "arn:k2" },
      ]);
    });
  });

  describe("describeKey", () => {
    it("maps metadata to a summary", async () => {
      const send = vi.fn().mockResolvedValueOnce({
        KeyMetadata: {
          KeyId: "k1",
          Arn: "arn:k1",
          Description: "orders key",
          KeyState: "Enabled",
          KeyUsage: "ENCRYPT_DECRYPT",
          CustomerMasterKeySpec: "SYMMETRIC_DEFAULT",
          CreationDate: new Date("2026-01-01T00:00:00Z"),
          KeyManager: "CUSTOMER",
          Enabled: true,
        },
      });
      const client = { send } as unknown as KMSClient;
      const summary = await describeKey(client, "k1");

      expect(summary).toMatchObject({
        keyId: "k1",
        arn: "arn:k1",
        description: "orders key",
        state: "Enabled",
        usage: "ENCRYPT_DECRYPT",
        spec: "SYMMETRIC_DEFAULT",
        manager: "CUSTOMER",
        enabled: true,
      });
    });

    it("throws when metadata is missing", async () => {
      const send = vi.fn().mockResolvedValueOnce({});
      const client = { send } as unknown as KMSClient;
      await expect(describeKey(client, "k1")).rejects.toThrow(/metadata/i);
    });
  });

  describe("listAliases", () => {
    it("maps alias names and targets", async () => {
      const send = vi.fn().mockResolvedValueOnce({
        Aliases: [{ AliasName: "alias/orders", TargetKeyId: "k1" }],
      });
      const client = { send } as unknown as KMSClient;
      const aliases = await listAliases(client);
      expect(aliases).toEqual([{ name: "alias/orders", targetKeyId: "k1" }]);
    });
  });

  describe("createKey and aliases", () => {
    it("creates a symmetric key and returns its id", async () => {
      const send = vi.fn().mockResolvedValueOnce({
        KeyMetadata: { KeyId: "k1" },
      });
      const client = { send } as unknown as KMSClient;
      const keyId = await createKey(client, { description: "orders key" });

      expect(send).toHaveBeenCalledWith(
        expect.objectContaining({
          input: {
            Description: "orders key",
            KeyUsage: "ENCRYPT_DECRYPT",
            CustomerMasterKeySpec: "SYMMETRIC_DEFAULT",
          },
        }),
      );
      expect(keyId).toBe("k1");
    });

    it("creates an alias requiring the alias/ prefix", async () => {
      const send = vi.fn().mockResolvedValueOnce({});
      const client = { send } as unknown as KMSClient;
      await createAlias(client, { name: "alias/orders", targetKeyId: "k1" });
      expect(send).toHaveBeenCalledWith(
        expect.objectContaining({
          input: { AliasName: "alias/orders", TargetKeyId: "k1" },
        }),
      );
      await expect(
        createAlias(client, { name: "orders", targetKeyId: "k1" }),
      ).rejects.toThrow(/alias\//);
    });

    it("deletes an alias by name", async () => {
      const send = vi.fn().mockResolvedValueOnce({});
      const client = { send } as unknown as KMSClient;
      await deleteAlias(client, "alias/orders");
      expect(send).toHaveBeenCalledWith(
        expect.objectContaining({ input: { AliasName: "alias/orders" } }),
      );
    });
  });

  describe("encrypt and decrypt", () => {
    it("round-trips plaintext through base64 ciphertext", async () => {
      const ciphertext = btoa("cipher-bytes");
      const send = vi
        .fn()
        .mockResolvedValueOnce({ CiphertextBlob: new TextEncoder().encode("cipher-bytes") })
        .mockResolvedValueOnce({
          Plaintext: new TextEncoder().encode("secret-hello"),
        });
      const client = { send } as unknown as KMSClient;

      const encoded = await encrypt(client, { keyId: "k1", plaintext: "secret-hello" });
      expect(send).toHaveBeenNthCalledWith(
        1,
        expect.objectContaining({
          input: {
            KeyId: "k1",
            Plaintext: new TextEncoder().encode("secret-hello"),
          },
        }),
      );
      expect(encoded).toBe(ciphertext);

      const decoded = await decrypt(client, { keyId: "k1", ciphertextBase64: encoded });
      expect(decoded).toBe("secret-hello");
    });

    it("rejects invalid base64 ciphertext", async () => {
      const client = { send: vi.fn() } as unknown as KMSClient;
      await expect(
        decrypt(client, { keyId: "k1", ciphertextBase64: "!!not-base64!!" }),
      ).rejects.toThrow(/base64/i);
    });
  });

  describe("rotation, policy, deletion", () => {
    it("reads rotation status", async () => {
      const send = vi.fn().mockResolvedValueOnce({ KeyRotationEnabled: true });
      const client = { send } as unknown as KMSClient;
      expect(await getRotationStatus(client, "k1")).toBe(true);
    });

    it("reads the default key policy", async () => {
      const send = vi.fn().mockResolvedValueOnce({ Policy: '{"Version":"2012-10-17"}' });
      const client = { send } as unknown as KMSClient;
      const policy = await getKeyPolicy(client, "k1");
      expect(send).toHaveBeenCalledWith(
        expect.objectContaining({
          input: { KeyId: "k1", PolicyName: "default" },
        }),
      );
      expect(policy).toBe('{"Version":"2012-10-17"}');
    });

    it("schedules deletion with a 7 day window", async () => {
      const send = vi.fn().mockResolvedValueOnce({});
      const client = { send } as unknown as KMSClient;
      await deleteKey(client, "k1");
      expect(send).toHaveBeenCalledWith(
        expect.objectContaining({
          input: { KeyId: "k1", PendingWindowInDays: 7 },
        }),
      );
    });
  });
});
