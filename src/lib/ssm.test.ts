import { describe, it, expect, vi } from "vitest";
import type { SSMClient } from "@aws-sdk/client-ssm";
import {
  describeParameters,
  getParameter,
  putParameter,
  deleteParameter,
  buildParameterTree,
  type ParameterSummary,
} from "./ssm";

describe("ssm data plane", () => {
  describe("describeParameters", () => {
    it("paginates and maps parameter summaries sorted by name", async () => {
      const send = vi
        .fn()
        .mockResolvedValueOnce({
          Parameters: [
            {
              Name: "/prod/database/url",
              Type: "String",
              Version: 1,
              LastModifiedDate: new Date("2026-01-01T00:00:00Z"),
            },
          ],
          NextToken: "token-1",
        })
        .mockResolvedValueOnce({
          Parameters: [
            {
              Name: "/dev/api-key",
              Type: "SecureString",
              Version: 3,
            },
          ],
        });

      const client = { send } as unknown as SSMClient;
      const params = await describeParameters(client);

      expect(send).toHaveBeenCalledTimes(2);
      expect(params).toEqual([
        {
          name: "/dev/api-key",
          type: "SecureString",
          version: 3,
          lastModified: undefined,
        },
        {
          name: "/prod/database/url",
          type: "String",
          version: 1,
          lastModified: new Date("2026-01-01T00:00:00Z"),
        },
      ]);
    });

    it("handles empty parameters", async () => {
      const send = vi.fn().mockResolvedValueOnce({});
      const client = { send } as unknown as SSMClient;
      const params = await describeParameters(client);
      expect(params).toEqual([]);
    });
  });

  describe("getParameter", () => {
    it("fetches parameter with decryption option", async () => {
      const send = vi.fn().mockResolvedValueOnce({
        Parameter: {
          Name: "/prod/secret",
          Type: "SecureString",
          Value: "super-secret-password",
          Version: 2,
          ARN: "arn:aws:ssm:us-east-1:000000000000:parameter/prod/secret",
          LastModifiedDate: new Date("2026-01-01T00:00:00Z"),
        },
      });

      const client = { send } as unknown as SSMClient;
      const param = await getParameter(client, {
        name: "/prod/secret",
        withDecryption: true,
      });

      expect(param).toEqual({
        name: "/prod/secret",
        type: "SecureString",
        value: "super-secret-password",
        version: 2,
        arn: "arn:aws:ssm:us-east-1:000000000000:parameter/prod/secret",
        lastModified: new Date("2026-01-01T00:00:00Z"),
      });
      expect(send).toHaveBeenCalledWith(
        expect.objectContaining({
          input: {
            Name: "/prod/secret",
            WithDecryption: true,
          },
        }),
      );
    });
  });

  describe("putParameter and deleteParameter", () => {
    it("puts parameter with overwrite option", async () => {
      const send = vi.fn().mockResolvedValueOnce({
        Version: 5,
      });

      const client = { send } as unknown as SSMClient;
      const res = await putParameter(client, {
        name: "/app/config",
        value: "my-value",
        type: "String",
        overwrite: true,
      });

      expect(res.version).toBe(5);
      expect(send).toHaveBeenCalledWith(
        expect.objectContaining({
          input: {
            Name: "/app/config",
            Value: "my-value",
            Type: "String",
            Overwrite: true,
          },
        }),
      );
    });

    it("deletes parameter", async () => {
      const send = vi.fn().mockResolvedValueOnce({});
      const client = { send } as unknown as SSMClient;
      await deleteParameter(client, "/app/config");

      expect(send).toHaveBeenCalledWith(
        expect.objectContaining({
          input: {
            Name: "/app/config",
          },
        }),
      );
    });
  });

  describe("buildParameterTree", () => {
    it("builds hierarchy from slash-delimited paths without empty root segment", () => {
      const params: ParameterSummary[] = [
        { name: "/app/backend/db-url", type: "String", version: 1 },
        { name: "/app/backend/db-pass", type: "SecureString", version: 1 },
        { name: "/app/frontend/api-url", type: "String", version: 2 },
      ];

      const tree = buildParameterTree(params);

      expect(tree).toHaveLength(1);
      expect(tree[0].segment).toBe("app");
      expect(tree[0].children).toHaveLength(2);

      const backendNode = tree[0].children.find((c) => c.segment === "backend")!;
      expect(backendNode).toBeDefined();
      expect(backendNode.children).toHaveLength(2);
      expect(backendNode.children.map((c) => c.segment)).toEqual([
        "db-pass",
        "db-url",
      ]);
      expect(backendNode.children[0].parameter?.name).toBe(
        "/app/backend/db-pass",
      );
    });

    it("resolves folder and leaf conflict on the same path node", () => {
      const params: ParameterSummary[] = [
        { name: "/app", type: "String", version: 1 },
        { name: "/app/service", type: "String", version: 1 },
      ];

      const tree = buildParameterTree(params);

      expect(tree).toHaveLength(1);
      const appNode = tree[0];
      expect(appNode.segment).toBe("app");
      expect(appNode.parameter).toBeDefined();
      expect(appNode.parameter?.name).toBe("/app");
      expect(appNode.children).toHaveLength(1);
      expect(appNode.children[0].segment).toBe("service");
      expect(appNode.children[0].parameter?.name).toBe("/app/service");
    });

    it("sorts children folders-first, then alphabetically", () => {
      const params: ParameterSummary[] = [
        { name: "/zeta", type: "String", version: 1 },
        { name: "/alpha/child", type: "String", version: 1 },
        { name: "/beta", type: "String", version: 1 },
        { name: "/gamma/child", type: "String", version: 1 },
      ];

      const tree = buildParameterTree(params);

      // Folders (alpha, gamma) come before leaves (beta, zeta)
      expect(tree.map((n) => n.segment)).toEqual([
        "alpha",
        "gamma",
        "beta",
        "zeta",
      ]);
    });
  });
});
