import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { platformFetch } from "./fetch";

describe("platformFetch", () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    delete (window as unknown as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__;
  });

  it("rewrites localstack health URL to use Vite proxy when in browser dev", async () => {
    const mockResponse = new Response("ok", { status: 200 });
    globalThis.fetch = vi.fn().mockResolvedValue(mockResponse);

    const res = await platformFetch("http://localhost:4566/_localstack/health");

    expect(globalThis.fetch).toHaveBeenCalledWith("/_localstack/health", undefined);
    expect(res).toBe(mockResponse);
  });
  it("rewrites localstack API URL to use Vite proxy when in browser dev", async () => {
    const mockResponse = new Response("ok", { status: 200 });
    globalThis.fetch = vi.fn().mockResolvedValue(mockResponse);

    const res = await platformFetch("http://localhost:4566/my-bucket?list-type=2");

    expect(globalThis.fetch).toHaveBeenCalledWith(
      "/localstack-proxy/my-bucket?list-type=2",
      undefined,
    );
    expect(res).toBe(mockResponse);
  });
  it("rewrites Request instance localstack URL to use Vite proxy when in browser dev", async () => {
    const mockResponse = new Response("ok", { status: 200 });
    globalThis.fetch = vi.fn().mockResolvedValue(mockResponse);

    const req = new Request("http://localhost:4566/my-bucket");
    const res = await platformFetch(req);

    expect(globalThis.fetch).toHaveBeenCalled();
    const calledArg = vi.mocked(globalThis.fetch).mock.calls[0][0] as Request;
    expect(calledArg.url).toContain("/localstack-proxy/my-bucket");
    expect(res).toBe(mockResponse);
  });



  it("passes through other URLs untouched when not in Tauri", async () => {
    const mockResponse = new Response("ok", { status: 200 });
    globalThis.fetch = vi.fn().mockResolvedValue(mockResponse);

    const res = await platformFetch("https://api.example.com/data");

    expect(globalThis.fetch).toHaveBeenCalledWith("https://api.example.com/data", undefined);
    expect(res).toBe(mockResponse);
  });

  it("calls tauri forward_request command when running in Tauri", async () => {
    (window as unknown as { __TAURI_INTERNALS__: Record<string, unknown> }).__TAURI_INTERNALS__ = {};

    const mockInvoke = vi.fn().mockResolvedValue({
      status: 200,
      status_text: "OK",
      headers: { "content-type": "application/json" },
      body: Array.from(new TextEncoder().encode('{"services":{}}')),
    });
    vi.doMock("@tauri-apps/api/core", () => ({
      invoke: mockInvoke,
    }));

    const res = await platformFetch("http://localhost:4566/_localstack/health", { method: "GET" });

    expect(mockInvoke).toHaveBeenCalledWith("forward_request", {
      req: {
        method: "GET",
        url: "http://localhost:4566/_localstack/health",
        headers: {},
        body: null,
      },
    });
    expect(res.status).toBe(200);
    expect(await res.text()).toBe('{"services":{}}');
  });
});
