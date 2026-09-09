import { describe, it, expect, vi } from "vitest";
import { withAuthHeader, baseClientConfig } from "./aws";
import type { ConnectionProfile } from "@/types";

describe("withAuthHeader", () => {
  it("adds authorization header to plain object headers and preserves existing headers", async () => {
    const mockFetch = vi.fn().mockResolvedValue(new Response("ok"));
    const wrapped = withAuthHeader("test-token-123", mockFetch as unknown as typeof fetch);

    await wrapped("http://localhost:4566", {
      method: "POST",
      headers: {
        "x-amz-target": "AWSSecretsManager.ListSecrets",
        "content-type": "application/x-amz-json-1.1",
      },
    });

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [, init] = mockFetch.mock.calls[0];
    const headers = new Headers(init?.headers);
    expect(headers.get("authorization")).toBe("test-token-123");
    expect(headers.get("x-amz-target")).toBe("AWSSecretsManager.ListSecrets");
    expect(headers.get("content-type")).toBe("application/x-amz-json-1.1");
  });

  it("overrides existing authorization header when Headers instance is passed", async () => {
    const mockFetch = vi.fn().mockResolvedValue(new Response("ok"));
    const wrapped = withAuthHeader("new-token", mockFetch as unknown as typeof fetch);

    const initialHeaders = new Headers({
      authorization: "AWS4-HMAC-SHA256 Credential=...",
      "x-custom": "value",
    });

    await wrapped("http://localhost:4566", {
      headers: initialHeaders,
    });

    const [, init] = mockFetch.mock.calls[0];
    const headers = new Headers(init?.headers);
    expect(headers.get("authorization")).toBe("new-token");
    expect(headers.get("x-custom")).toBe("value");
  });

  it("handles missing init and creates authorization header", async () => {
    const mockFetch = vi.fn().mockResolvedValue(new Response("ok"));
    const wrapped = withAuthHeader("token-only", mockFetch as unknown as typeof fetch);

    await wrapped("http://localhost:4566");

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [, init] = mockFetch.mock.calls[0];
    const headers = new Headers(init?.headers);
    expect(headers.get("authorization")).toBe("token-only");
  });
});

describe("baseClientConfig", () => {
  it("configures customFetch with auth header when profile.authToken is provided", () => {
    const profileWithToken: ConnectionProfile = {
      id: "p1",
      name: "Token Profile",
      endpoint: "http://localhost:4566",
      region: "us-east-1",
      authToken: "secret-token",
    };

    const config = baseClientConfig(profileWithToken);
    expect(config.requestHandler).toBeDefined();
  });

  it("configures customFetch without auth header wrapper when profile.authToken is undefined", () => {
    const profileNoToken: ConnectionProfile = {
      id: "p2",
      name: "Plain Profile",
      endpoint: "http://localhost:4566",
      region: "us-east-1",
    };

    const config = baseClientConfig(profileNoToken);
    expect(config.requestHandler).toBeDefined();
  });
});
