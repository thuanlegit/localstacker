function rewriteLocalstackUrl(rawUrl: string): string | null {
  const localstackHealthMatch = rawUrl.match(
    /^http:\/\/(?:localhost|127\.0\.0\.1):4566\/_localstack\/(.*)/,
  );
  if (localstackHealthMatch) {
    return `/_localstack/${localstackHealthMatch[1]}`;
  }

  const localstackApiMatch = rawUrl.match(
    /^http:\/\/(?:localhost|127\.0\.0\.1):4566\/(.*)/,
  );
  if (localstackApiMatch) {
    return `/localstack-proxy/${localstackApiMatch[1]}`;
  }

  return null;
}

interface ForwardResponse {
  status: number;
  status_text: string;
  headers: Record<string, string>;
  body: number[];
}

/**
 * Platform-aware fetch that bypasses webview CORS / Origin restrictions.
 *
 * In the Tauri desktop app, requests run through native Rust reqwest via `forward_request`,
 * which does not attach browser `Origin` or `Referer` headers. This prevents LocalStack
 * from rejecting the request with 403 Forbidden.
 *
 * In browser development mode, falls back to Vite's reverse proxy with origin/referer stripping.
 * In unit tests / Node, falls back to standard fetch.
 */
export async function platformFetch(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<Response> {
  if (typeof window !== "undefined" && "__TAURI_INTERNALS__" in window) {
    // Dynamic import keeps platform-specific Tauri APIs out of browser-dev / test paths
    const { invoke } = await import("@tauri-apps/api/core");

    let method = "GET";
    let url = "";
    const headers: Record<string, string> = {};
    let body: number[] | null = null;

    if (typeof input === "string") {
      url = input;
    } else if (input instanceof URL) {
      url = input.href;
    } else if (typeof Request !== "undefined" && input instanceof Request) {
      url = input.url;
      method = input.method;
      input.headers.forEach((v, k) => {
        headers[k] = v;
      });
      const buffer = await input.arrayBuffer();
      if (buffer.byteLength > 0 || (method !== "GET" && method !== "HEAD")) {
        body = Array.from(new Uint8Array(buffer));
      }
    }

    if (init) {
      if (init.method) method = init.method;
      if (init.headers) {
        new Headers(init.headers).forEach((v, k) => {
          headers[k] = v;
        });
      }
      if (init.body !== undefined && init.body !== null) {
        if (ArrayBuffer.isView(init.body)) {
          body = Array.from(
            new Uint8Array(
              init.body.buffer,
              init.body.byteOffset,
              init.body.byteLength,
            ),
          );
        } else if (init.body instanceof ArrayBuffer) {
          body = Array.from(new Uint8Array(init.body));
        } else if (typeof init.body === "string") {
          body = Array.from(new TextEncoder().encode(init.body));
        } else if (
          init.body instanceof Blob ||
          typeof (init.body as { arrayBuffer?: unknown }).arrayBuffer === "function"
        ) {
          const buffer = await (init.body as unknown as Blob).arrayBuffer();
          body = Array.from(new Uint8Array(buffer));
        } else if (
          typeof (init.body as { getReader?: unknown }).getReader === "function"
        ) {
          const reader = (init.body as ReadableStream<Uint8Array>).getReader();
          const chunks: Uint8Array[] = [];
          let totalLen = 0;
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            if (value) {
              chunks.push(value);
              totalLen += value.length;
            }
          }
          const merged = new Uint8Array(totalLen);
          let offset = 0;
          for (const chunk of chunks) {
            merged.set(chunk, offset);
            offset += chunk.length;
          }
          body = Array.from(merged);
        }
      }
    }

    if (method !== "GET" && method !== "HEAD" && body === null) {
      body = [];
    }

    const res = await invoke<ForwardResponse>("forward_request", {
      req: {
        method,
        url,
        headers,
        body,
      },
    });

    const bodyBytes = new Uint8Array(res.body);
    return new Response(bodyBytes as unknown as BlobPart, {
      status: res.status,
      statusText: res.status_text,
      headers: res.headers,
    });
  }

  // In browser dev, route LocalStack requests through Vite's same-origin proxy
  // to prevent browser Origin/Referer headers from triggering LocalStack 403 Forbidden.
  if (typeof window !== "undefined") {
    if (typeof input === "string") {
      const rewritten = rewriteLocalstackUrl(input);
      if (rewritten) return fetch(rewritten, init);
    } else if (input instanceof URL) {
      const rewritten = rewriteLocalstackUrl(input.href);
      if (rewritten) return fetch(rewritten, init);
    } else if (typeof Request !== "undefined" && input instanceof Request) {
      const rewritten = rewriteLocalstackUrl(input.url);
      if (rewritten) {
        const base =
          typeof window !== "undefined" && window.location?.origin
            ? window.location.origin
            : "http://localhost:1420";
        const targetUrl = new URL(rewritten, base).href;
        const hasBody = input.method !== "GET" && input.method !== "HEAD";
        const body = hasBody ? await input.clone().arrayBuffer() : undefined;
        return fetch(
          new Request(targetUrl, {
            method: input.method,
            headers: input.headers,
            body,
            signal: input.signal,
          })
        );
      }
    }
  }

  return fetch(input, init);
}
