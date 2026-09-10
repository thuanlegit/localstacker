import { describe, it, expect, vi } from "vitest";
import type { APIGatewayClient as ApiGatewayClient } from "@aws-sdk/client-api-gateway";
import {
  listRestApis,
  createRestApi,
  deleteRestApi,
  listResources,
  createResource,
  deleteResource,
  getMethod,
  putMethod,
  deleteMethod,
  listStages,
  deployApi,
  deleteStage,
  testInvokeMethod,
  buildLambdaIntegrationUri,
  invokeUrl,
} from "./apigateway";

describe("apigateway data plane", () => {
  describe("pure helpers", () => {
    it("buildLambdaIntegrationUri constructs correct ARN", () => {
      const uri = buildLambdaIntegrationUri(
        "us-east-1",
        "arn:aws:lambda:us-east-1:000000000000:function:my-fn",
      );
      expect(uri).toBe(
        "arn:aws:apigateway:us-east-1:lambda:path/2015-03-31/functions/arn:aws:lambda:us-east-1:000000000000:function:my-fn/invocations",
      );
    });

    it("invokeUrl constructs deployed stage URL", () => {
      const url = invokeUrl(
        "http://localhost:4566",
        "api-123",
        "dev",
        "/hello/world",
      );
      expect(url).toBe(
        "http://localhost:4566/restapis/api-123/dev/_user_request_/hello/world",
      );
    });

    it("invokeUrl handles trailing slash in endpoint and missing leading slash in path", () => {
      const url = invokeUrl(
        "http://localhost:4566/",
        "api-123",
        "prod",
        "users",
      );
      expect(url).toBe(
        "http://localhost:4566/restapis/api-123/prod/_user_request_/users",
      );
    });
  });

  describe("listRestApis", () => {
    it("paginates and maps APIs sorted by name", async () => {
      const send = vi
        .fn()
        .mockResolvedValueOnce({
          items: [
            {
              id: "api-z",
              name: "Zebra API",
              description: "Second page needed",
              createdDate: new Date("2026-01-02T00:00:00Z"),
            },
          ],
          position: "pos-1",
        })
        .mockResolvedValueOnce({
          items: [
            {
              id: "api-a",
              name: "Alpha API",
              createdDate: new Date("2026-01-01T00:00:00Z"),
            },
          ],
        });

      const client = { send } as unknown as ApiGatewayClient;
      const apis = await listRestApis(client);

      expect(send).toHaveBeenCalledTimes(2);
      expect(send).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({ input: { position: "pos-1" } }),
      );
      expect(apis).toEqual([
        {
          id: "api-a",
          name: "Alpha API",
          description: undefined,
          createdDate: "2026-01-01T00:00:00.000Z",
        },
        {
          id: "api-z",
          name: "Zebra API",
          description: "Second page needed",
          createdDate: "2026-01-02T00:00:00.000Z",
        },
      ]);
    });
  });

  describe("createRestApi", () => {
    it("returns created API summary", async () => {
      const send = vi.fn().mockResolvedValueOnce({
        id: "api-1",
        name: "Test API",
        createdDate: new Date("2026-01-01T00:00:00Z"),
      });
      const client = { send } as unknown as ApiGatewayClient;
      const api = await createRestApi(client, "Test API");

      expect(api).toEqual({
        id: "api-1",
        name: "Test API",
        description: undefined,
        createdDate: "2026-01-01T00:00:00.000Z",
      });
    });

    it("throws when CreateRestApi returns no id", async () => {
      const send = vi.fn().mockResolvedValueOnce({});
      const client = { send } as unknown as ApiGatewayClient;
      await expect(createRestApi(client, "Test API")).rejects.toThrow(
        "CreateRestApi returned no id",
      );
    });
  });

  describe("deleteRestApi", () => {
    it("deletes REST API by id", async () => {
      const send = vi.fn().mockResolvedValueOnce({});
      const client = { send } as unknown as ApiGatewayClient;
      await deleteRestApi(client, "api-1");
      expect(send).toHaveBeenCalledWith(
        expect.objectContaining({ input: { restApiId: "api-1" } }),
      );
    });
  });

  describe("listResources", () => {
    it("paginates and maps resources sorted by path", async () => {
      const send = vi
        .fn()
        .mockResolvedValueOnce({
          items: [
            {
              id: "res-users",
              parentId: "res-root",
              path: "/users",
              pathPart: "users",
              resourceMethods: { GET: {}, POST: {} },
            },
          ],
          position: "p1",
        })
        .mockResolvedValueOnce({
          items: [
            {
              id: "res-root",
              path: "/",
              resourceMethods: {},
            },
          ],
        });

      const client = { send } as unknown as ApiGatewayClient;
      const res = await listResources(client, "api-1");

      expect(send).toHaveBeenCalledTimes(2);
      expect(send).toHaveBeenNthCalledWith(
        1,
        expect.objectContaining({
          input: { restApiId: "api-1", embed: ["methods"], position: undefined },
        }),
      );
      expect(res).toEqual([
        {
          id: "res-root",
          parentId: undefined,
          path: "/",
          pathPart: undefined,
          methods: [],
        },
        {
          id: "res-users",
          parentId: "res-root",
          path: "/users",
          pathPart: "users",
          methods: ["GET", "POST"],
        },
      ]);
    });
  });

  describe("createResource", () => {
    it("finds root resource and creates child resource under it", async () => {
      const send = vi
        .fn()
        .mockResolvedValueOnce({
          items: [
            { id: "res-root", path: "/", resourceMethods: {} },
          ],
        })
        .mockResolvedValueOnce({
          id: "res-new",
          parentId: "res-root",
          path: "/items",
          pathPart: "items",
          resourceMethods: {},
        });

      const client = { send } as unknown as ApiGatewayClient;
      const resource = await createResource(client, {
        restApiId: "api-1",
        pathPart: "items",
      });

      expect(resource).toEqual({
        id: "res-new",
        parentId: "res-root",
        path: "/items",
        pathPart: "items",
        methods: [],
      });
      expect(send).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({
          input: {
            restApiId: "api-1",
            parentId: "res-root",
            pathPart: "items",
          },
        }),
      );
    });

    it("throws when root resource not found", async () => {
      const send = vi.fn().mockResolvedValueOnce({
        items: [],
      });
      const client = { send } as unknown as ApiGatewayClient;
      await expect(
        createResource(client, { restApiId: "api-1", pathPart: "items" }),
      ).rejects.toThrow("Root resource not found for API");
    });
  });

  describe("deleteResource", () => {
    it("deletes resource", async () => {
      const send = vi.fn().mockResolvedValueOnce({});
      const client = { send } as unknown as ApiGatewayClient;
      await deleteResource(client, { restApiId: "api-1", resourceId: "res-1" });
      expect(send).toHaveBeenCalledWith(
        expect.objectContaining({
          input: { restApiId: "api-1", resourceId: "res-1" },
        }),
      );
    });
  });

  describe("getMethod", () => {
    it("returns method details", async () => {
      const send = vi.fn().mockResolvedValueOnce({
        httpMethod: "GET",
        authorizationType: "NONE",
        apiKeyRequired: false,
        methodIntegration: {
          type: "MOCK",
          uri: undefined,
        },
      });
      const client = { send } as unknown as ApiGatewayClient;
      const detail = await getMethod(client, {
        restApiId: "api-1",
        resourceId: "res-1",
        httpMethod: "GET",
      });
      expect(detail).toEqual({
        httpMethod: "GET",
        authorizationType: "NONE",
        apiKeyRequired: false,
        integrationType: "MOCK",
        integrationUri: undefined,
      });
    });
  });

  describe("putMethod", () => {
    it("creates MOCK method with full sequence", async () => {
      const send = vi.fn().mockResolvedValue({});
      const client = { send } as unknown as ApiGatewayClient;

      await putMethod(client, {
        restApiId: "api-1",
        resourceId: "res-1",
        httpMethod: "GET",
        region: "us-east-1",
        integration: {
          type: "MOCK",
          responseTemplate: '{"message":"mock response"}',
        },
      });

      expect(send).toHaveBeenCalledTimes(4);
      // 1. PutMethod
      expect(send).toHaveBeenNthCalledWith(
        1,
        expect.objectContaining({
          input: {
            restApiId: "api-1",
            resourceId: "res-1",
            httpMethod: "GET",
            authorizationType: "NONE",
            apiKeyRequired: false,
          },
        }),
      );
      // 2. PutIntegration
      expect(send).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({
          input: {
            restApiId: "api-1",
            resourceId: "res-1",
            httpMethod: "GET",
            type: "MOCK",
            requestTemplates: { "application/json": '{"statusCode": 200}' },
          },
        }),
      );
      // 3. PutMethodResponse
      expect(send).toHaveBeenNthCalledWith(
        3,
        expect.objectContaining({
          input: {
            restApiId: "api-1",
            resourceId: "res-1",
            httpMethod: "GET",
            statusCode: "200",
          },
        }),
      );
      // 4. PutIntegrationResponse
      expect(send).toHaveBeenNthCalledWith(
        4,
        expect.objectContaining({
          input: {
            restApiId: "api-1",
            resourceId: "res-1",
            httpMethod: "GET",
            statusCode: "200",
            responseTemplates: { "application/json": '{"message":"mock response"}' },
          },
        }),
      );
    });

    it("creates AWS_PROXY method for Lambda", async () => {
      const send = vi.fn().mockResolvedValue({});
      const client = { send } as unknown as ApiGatewayClient;

      await putMethod(client, {
        restApiId: "api-1",
        resourceId: "res-1",
        httpMethod: "POST",
        region: "us-east-1",
        integration: {
          type: "AWS_PROXY",
          functionArn: "arn:aws:lambda:us-east-1:000000000000:function:my-fn",
        },
      });

      expect(send).toHaveBeenCalledTimes(2);
      expect(send).toHaveBeenNthCalledWith(
        1,
        expect.objectContaining({
          input: {
            restApiId: "api-1",
            resourceId: "res-1",
            httpMethod: "POST",
            authorizationType: "NONE",
            apiKeyRequired: false,
          },
        }),
      );
      expect(send).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({
          input: {
            restApiId: "api-1",
            resourceId: "res-1",
            httpMethod: "POST",
            type: "AWS_PROXY",
            integrationHttpMethod: "POST",
            uri: "arn:aws:apigateway:us-east-1:lambda:path/2015-03-31/functions/arn:aws:lambda:us-east-1:000000000000:function:my-fn/invocations",
          },
        }),
      );
    });

    it("creates HTTP_PROXY method", async () => {
      const send = vi.fn().mockResolvedValue({});
      const client = { send } as unknown as ApiGatewayClient;

      await putMethod(client, {
        restApiId: "api-1",
        resourceId: "res-1",
        httpMethod: "PUT",
        region: "us-east-1",
        integration: {
          type: "HTTP_PROXY",
          uri: "https://example.com/api",
        },
      });

      expect(send).toHaveBeenCalledTimes(2);
      expect(send).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({
          input: {
            restApiId: "api-1",
            resourceId: "res-1",
            httpMethod: "PUT",
            type: "HTTP_PROXY",
            integrationHttpMethod: "PUT",
            uri: "https://example.com/api",
          },
        }),
      );
    });
  });

  describe("deleteMethod", () => {
    it("deletes method", async () => {
      const send = vi.fn().mockResolvedValueOnce({});
      const client = { send } as unknown as ApiGatewayClient;
      await deleteMethod(client, {
        restApiId: "api-1",
        resourceId: "res-1",
        httpMethod: "DELETE",
      });
      expect(send).toHaveBeenCalledWith(
        expect.objectContaining({
          input: {
            restApiId: "api-1",
            resourceId: "res-1",
            httpMethod: "DELETE",
          },
        }),
      );
    });
  });

  describe("listStages", () => {
    it("lists stages sorted by name", async () => {
      const send = vi.fn().mockResolvedValueOnce({
        item: [
          {
            stageName: "prod",
            deploymentId: "dep-2",
            createdDate: new Date("2026-01-02T00:00:00Z"),
          },
          {
            stageName: "dev",
            deploymentId: "dep-1",
            createdDate: new Date("2026-01-01T00:00:00Z"),
          },
        ],
      });
      const client = { send } as unknown as ApiGatewayClient;
      const stages = await listStages(client, "api-1");

      expect(stages).toEqual([
        {
          stageName: "dev",
          deploymentId: "dep-1",
          createdDate: "2026-01-01T00:00:00.000Z",
        },
        {
          stageName: "prod",
          deploymentId: "dep-2",
          createdDate: "2026-01-02T00:00:00.000Z",
        },
      ]);
    });
  });

  describe("deployApi", () => {
    it("creates deployment and returns stage summary", async () => {
      const send = vi.fn().mockResolvedValueOnce({
        id: "dep-123",
        createdDate: new Date("2026-01-01T00:00:00Z"),
      });
      const client = { send } as unknown as ApiGatewayClient;
      const stage = await deployApi(client, {
        restApiId: "api-1",
        stageName: "staging",
      });

      expect(stage).toEqual({
        stageName: "staging",
        deploymentId: "dep-123",
        createdDate: "2026-01-01T00:00:00.000Z",
      });
    });

    it("throws when CreateDeployment returns no id", async () => {
      const send = vi.fn().mockResolvedValueOnce({});
      const client = { send } as unknown as ApiGatewayClient;
      await expect(
        deployApi(client, { restApiId: "api-1", stageName: "staging" }),
      ).rejects.toThrow("CreateDeployment returned no deployment id");
    });
  });

  describe("deleteStage", () => {
    it("deletes stage", async () => {
      const send = vi.fn().mockResolvedValueOnce({});
      const client = { send } as unknown as ApiGatewayClient;
      await deleteStage(client, { restApiId: "api-1", stageName: "dev" });
      expect(send).toHaveBeenCalledWith(
        expect.objectContaining({
          input: { restApiId: "api-1", stageName: "dev" },
        }),
      );
    });
  });

  describe("testInvokeMethod", () => {
    it("maps inputs and returns result with 200 without throwing", async () => {
      const send = vi.fn().mockResolvedValueOnce({
        status: 200,
        headers: { "content-type": "application/json" },
        body: '{"message":"mock response"}',
        log: "Execution log...",
        latency: 0,
      });
      const client = { send } as unknown as ApiGatewayClient;
      const res = await testInvokeMethod(client, {
        restApiId: "api-1",
        resourceId: "res-1",
        httpMethod: "GET",
        path: "/users",
        queryString: "limit=10",
        headers: { "x-custom": "value" },
        body: '{"foo":"bar"}',
      });

      expect(send).toHaveBeenCalledWith(
        expect.objectContaining({
          input: {
            restApiId: "api-1",
            resourceId: "res-1",
            httpMethod: "GET",
            pathWithQueryString: "/users?limit=10",
            headers: { "x-custom": "value" },
            body: '{"foo":"bar"}',
          },
        }),
      );
      expect(res).toEqual({
        status: 200,
        headers: { "content-type": "application/json" },
        body: '{"message":"mock response"}',
        log: "Execution log...",
        latency: 0,
      });
    });

    it("handles 500 without throwing", async () => {
      const send = vi.fn().mockResolvedValueOnce({
        status: 500,
        headers: {},
        body: "Internal server error",
        log: "Failed",
        latency: 12,
      });
      const client = { send } as unknown as ApiGatewayClient;
      const res = await testInvokeMethod(client, {
        restApiId: "api-1",
        resourceId: "res-1",
        httpMethod: "POST",
        path: "/fail",
      });

      expect(res.status).toBe(500);
      expect(res.body).toBe("Internal server error");
    });
  });
});
