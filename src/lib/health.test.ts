import { describe, it, expect } from "vitest";
import { checkHealth } from "./health";

const okJson = (body: unknown) => async () =>
  new Response(JSON.stringify(body), { status: 200 });

describe("checkHealth", () => {
  it("parses the legacy services map shape", async () => {
    const fetchFn = okJson({
      version: "4.14.0",
      edition: "community",
      services: { s3: "running", sqs: "running" },
    }) as unknown as typeof fetch;

    const info = await checkHealth({
      endpoint: "http://localhost:4566",
      fetchFn,
    });

    expect(info.status).toBe("up");
    if (info.status === "up") {
      expect(info.version).toBe("4.14.0");
      expect(info.edition).toBe("community");
      expect(info.services).toEqual([
        { name: "s3", status: "running" },
        { name: "sqs", status: "running" },
      ]);
    }
  });

  it("parses the array services shape", async () => {
    const fetchFn = okJson({
      status: "OK",
      version: "4.20.0",
      services: [
        { name: "s3", status: "available" },
        { name: "lambda", status: "available" },
      ],
    }) as unknown as typeof fetch;

    const info = await checkHealth({ endpoint: "http://localhost:4566/", fetchFn });

    expect(info.status).toBe("up");
    if (info.status === "up") {
      expect(info.services).toHaveLength(2);
      expect(info.services[1]).toEqual({ name: "lambda", status: "available" });
    }
  });

  it("reports down on network errors", async () => {
    const fetchFn = (async () => {
      throw new TypeError("fetch failed");
    }) as unknown as typeof fetch;

    const info = await checkHealth({ endpoint: "http://localhost:4566", fetchFn });
    expect(info).toMatchObject({ status: "down" });
  });

  it("reports down on non-200 responses", async () => {
    const fetchFn = (async () => new Response("nope", { status: 502 })) as unknown as typeof fetch;

    const info = await checkHealth({ endpoint: "http://localhost:4566", fetchFn });
    expect(info).toMatchObject({ status: "down" });
  });

  it("sends the auth token as a bearer-style authorization header when present", async () => {
    let seenHeaders: Headers | undefined;
    const fetchFn = (async (_input: RequestInfo | URL, init?: RequestInit) => {
      seenHeaders = new Headers(init?.headers);
      return new Response(JSON.stringify({ services: {} }), { status: 200 });
    }) as unknown as typeof fetch;

    await checkHealth({ endpoint: "http://localhost:4566", authToken: "tok", fetchFn });
    expect(seenHeaders?.get("authorization")).toBe("tok");
  });
});
