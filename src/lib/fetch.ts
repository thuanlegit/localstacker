/**
 * Platform-aware fetch that bypasses webview CORS / Origin restrictions.
 *
 * In the Tauri desktop app, requests run through `@tauri-apps/plugin-http`
 * (backed by Rust reqwest), which does not attach a browser `Origin` header.
 * This prevents LocalStack from rejecting the request with 403 Forbidden.
 *
 * In browser development mode or test environments, falls back to standard fetch
 * (or Vite's proxy when available).
 */
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

export async function platformFetch(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<Response> {
  if (typeof window !== "undefined" && "__TAURI_INTERNALS__" in window) {
    // Dynamic import keeps platform-specific Tauri plugins out of the browser-dev bundle path
    const { fetch: tauriFetch } = await import("@tauri-apps/plugin-http");
    return tauriFetch(input, init);
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
        return fetch(new Request(targetUrl, input), init);
      }
    }
  }

  return fetch(input, init);
}
