import { describe, it, expect, vi } from "vitest";
import type { LambdaClient } from "@aws-sdk/client-lambda";
import {
  listFunctions,
  getFunctionConfig,
  invokeFunction,
  updateFunctionEnvVars,
  createFunction,
  createDemoFunction,
  deleteFunction,
  buildStarterZip,
} from "./lambda";

describe("lambda data plane", () => {
  describe("listFunctions", () => {
    it("handles single-page responses and maps fields", async () => {
      const lastMod = "2026-01-01T00:00:00.000+0000";
      const send = vi.fn().mockResolvedValue({
        Functions: [
          {
            FunctionName: "hello",
            Runtime: "nodejs22.x",
            Handler: "index.handler",
            Description: "Hello function",
            CodeSize: 1024,
            LastModified: lastMod,
          },
        ],
      });
      const client = { send } as unknown as LambdaClient;

      const fns = await listFunctions(client);

      expect(send).toHaveBeenCalledOnce();
      expect(send.mock.calls[0][0].input).toEqual({});
      expect(fns).toEqual([
        {
          name: "hello",
          runtime: "nodejs22.x",
          handler: "index.handler",
          description: "Hello function",
          codeSize: 1024,
          lastModified: new Date(lastMod),
        },
      ]);
    });

    it("paginates when NextMarker is returned", async () => {
      const send = vi
        .fn()
        .mockResolvedValueOnce({
          Functions: [{ FunctionName: "fn-1" }],
          NextMarker: "marker-123",
        })
        .mockResolvedValueOnce({
          Functions: [{ FunctionName: "fn-2" }],
        });
      const client = { send } as unknown as LambdaClient;

      const fns = await listFunctions(client);

      expect(send).toHaveBeenCalledTimes(2);
      expect(send.mock.calls[0][0].input).toEqual({});
      expect(send.mock.calls[1][0].input).toEqual({ Marker: "marker-123" });
      expect(fns.map((f) => f.name)).toEqual(["fn-1", "fn-2"]);
    });

    it("propagates client rejection", async () => {
      const send = vi.fn().mockRejectedValue(new Error("Lambda list error"));
      const client = { send } as unknown as LambdaClient;

      await expect(listFunctions(client)).rejects.toThrow("Lambda list error");
    });
  });

  describe("getFunctionConfig", () => {
    it("maps config and applies defaults for Timeout (3), MemorySize (128), and envVars ({})", async () => {
      const send = vi.fn().mockResolvedValue({
        FunctionName: "hello",
        Runtime: "python3.12",
        Handler: "app.handler",
        Description: "Python func",
        Role: "arn:aws:iam::000000000000:role/lambda-role",
        State: "Active",
      });
      const client = { send } as unknown as LambdaClient;

      const config = await getFunctionConfig(client, "hello");

      expect(send).toHaveBeenCalledOnce();
      expect(send.mock.calls[0][0].input).toEqual({
        FunctionName: "hello",
      });
      expect(config).toEqual({
        name: "hello",
        runtime: "python3.12",
        handler: "app.handler",
        description: "Python func",
        role: "arn:aws:iam::000000000000:role/lambda-role",
        timeoutSeconds: 3,
        memorySize: 128,
        envVars: {},
        lastModified: undefined,
        state: "Active",
      });
    });

    it("maps explicit Timeout, MemorySize, Environment, and LastModified", async () => {
      const lastMod = "2026-01-02T12:00:00.000+0000";
      const send = vi.fn().mockResolvedValue({
        FunctionName: "custom",
        Timeout: 30,
        MemorySize: 512,
        Environment: {
          Variables: {
            NODE_ENV: "production",
            API_KEY: "secret",
          },
        },
        LastModified: lastMod,
      });
      const client = { send } as unknown as LambdaClient;

      const config = await getFunctionConfig(client, "custom");

      expect(config.timeoutSeconds).toBe(30);
      expect(config.memorySize).toBe(512);
      expect(config.envVars).toEqual({
        NODE_ENV: "production",
        API_KEY: "secret",
      });
      expect(config.lastModified).toEqual(new Date(lastMod));
    });

    it("propagates client rejection", async () => {
      const send = vi.fn().mockRejectedValue(new Error("Function not found"));
      const client = { send } as unknown as LambdaClient;

      await expect(getFunctionConfig(client, "missing")).rejects.toThrow(
        "Function not found",
      );
    });
  });

  describe("invokeFunction", () => {
    it("sends RequestResponse, LogType: Tail, decodes payload and base64 logs, and measures durationMs", async () => {
      const logText = "START RequestId: 1\nHello from Lambda!\nEND RequestId: 1";
      const encodedLogs = btoa(logText);
      const payloadBytes = new TextEncoder().encode('{"message":"success"}');

      const send = vi.fn().mockResolvedValue({
        StatusCode: 200,
        ExecutedVersion: "$LATEST",
        Payload: payloadBytes,
        LogResult: encodedLogs,
        $metadata: {
          requestId: "req-123",
          httpHeaders: {
            "x-amzn-requestid": "req-123",
          },
        },
      });
      const client = { send } as unknown as LambdaClient;

      const res = await invokeFunction(client, {
        functionName: "hello",
        payload: '{"name":"world"}',
      });

      expect(send).toHaveBeenCalledOnce();
      const input = send.mock.calls[0][0].input;
      expect(input.FunctionName).toBe("hello");
      expect(input.InvocationType).toBe("RequestResponse");
      expect(input.LogType).toBe("Tail");
      expect(new TextDecoder().decode(input.Payload)).toBe('{"name":"world"}');

      expect(res.statusCode).toBe(200);
      expect(res.executedVersion).toBe("$LATEST");
      expect(res.payload).toBe('{"message":"success"}');
      expect(res.logs).toBe(logText);
      expect(res.durationMs).toBeGreaterThanOrEqual(0);
      expect(res.requestId).toBe("req-123");
    });

    it("sets logs to undefined when LogResult is absent", async () => {
      const send = vi.fn().mockResolvedValue({
        StatusCode: 200,
        Payload: new TextEncoder().encode("{}"),
      });
      const client = { send } as unknown as LambdaClient;

      const res = await invokeFunction(client, { functionName: "hello" });

      expect(res.logs).toBeUndefined();
      expect(res.payload).toBe("{}");
    });

    it("propagates client rejection", async () => {
      const send = vi.fn().mockRejectedValue(new Error("Invoke failed"));
      const client = { send } as unknown as LambdaClient;

      await expect(
        invokeFunction(client, { functionName: "hello" }),
      ).rejects.toThrow("Invoke failed");
    });
  });

  describe("updateFunctionEnvVars", () => {
    it("replaces environment variables completely", async () => {
      const send = vi.fn().mockResolvedValue({});
      const client = { send } as unknown as LambdaClient;

      await updateFunctionEnvVars(client, {
        functionName: "hello",
        envVars: { FOO: "bar", NUM: "42" },
      });

      expect(send).toHaveBeenCalledOnce();
      expect(send.mock.calls[0][0].input).toEqual({
        FunctionName: "hello",
        Environment: {
          Variables: { FOO: "bar", NUM: "42" },
        },
      });
    });

    it("propagates client rejection", async () => {
      const send = vi.fn().mockRejectedValue(new Error("Update failed"));
      const client = { send } as unknown as LambdaClient;

      await expect(
        updateFunctionEnvVars(client, {
          functionName: "hello",
          envVars: {},
        }),
      ).rejects.toThrow("Update failed");
    });
  });

  describe("buildStarterZip", () => {
    it("packages node starter code into a zip buffer", () => {
      const zip = buildStarterZip("nodejs22.x", "exports.handler = () => {};");
      expect(zip).toBeInstanceOf(Uint8Array);
      expect(zip.length).toBeGreaterThan(0);
    });

    it("packages python starter code into a zip buffer", () => {
      const zip = buildStarterZip("python3.12", "def lambda_handler(): pass");
      expect(zip).toBeInstanceOf(Uint8Array);
      expect(zip.length).toBeGreaterThan(0);
    });
  });

  describe("createFunction", () => {
    it("sends CreateFunctionCommand with custom params", async () => {
      const send = vi.fn().mockResolvedValue({
        FunctionName: "custom-fn",
        FunctionArn: "arn:aws:lambda:us-east-1:000000000000:function:custom-fn",
      });
      const client = { send } as unknown as LambdaClient;
      const zip = new Uint8Array([1, 2, 3]);

      const res = await createFunction(client, {
        name: "custom-fn",
        runtime: "python3.12",
        handler: "lambda_function.lambda_handler",
        codeZip: zip,
        description: "My custom function",
        timeout: 10,
        memorySize: 256,
        envVars: { FOO: "bar" },
      });

      expect(res.name).toBe("custom-fn");
      expect(send).toHaveBeenCalledOnce();
      const input = send.mock.calls[0][0].input;
      expect(input.FunctionName).toBe("custom-fn");
      expect(input.Runtime).toBe("python3.12");
      expect(input.Handler).toBe("lambda_function.lambda_handler");
      expect(input.Timeout).toBe(10);
      expect(input.MemorySize).toBe(256);
      expect(input.Environment).toEqual({ Variables: { FOO: "bar" } });
      expect(input.Code.ZipFile).toBe(zip);
    });
  });

  describe("createDemoFunction", () => {
    it("creates a demo function with bundled zip and returns the name", async () => {
      const send = vi.fn().mockResolvedValue({
        FunctionArn: "arn:aws:lambda:us-east-1:000000000000:function:demo-hello",
      });
      const client = { send } as unknown as LambdaClient;

      const name = await createDemoFunction(client, "my-demo");
      expect(name).toBe("my-demo");
      expect(send).toHaveBeenCalledOnce();
      const input = send.mock.calls[0][0].input;
      expect(input.FunctionName).toBe("my-demo");
      expect(input.Runtime).toBe("nodejs22.x");
      expect(input.Handler).toBe("index.handler");
      expect(input.Code.ZipFile).toBeInstanceOf(Uint8Array);
      expect(input.Code.ZipFile.length).toBeGreaterThan(0);
    });
  });

  describe("deleteFunction", () => {
    it("deletes a function by name", async () => {
      const send = vi.fn().mockResolvedValue({});
      const client = { send } as unknown as LambdaClient;

      await deleteFunction(client, "to-delete");
      expect(send).toHaveBeenCalledOnce();
      expect(send.mock.calls[0][0].input).toEqual({
        FunctionName: "to-delete",
      });
    });
  });
});
