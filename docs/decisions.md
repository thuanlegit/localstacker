# Decision Log (ADR)

Compact record of the foundational decisions. Each entry: context → decision → consequences.

---

## D1. Ambition: personal-first OSS with high-polish bar

**Context**: Greenfield project; could be a throwaway script, a portfolio play, or a commercial product.

**Decision**: Build as the author's daily tool, open-source from day one, aiming for a "TablePlus for local AWS" quality bar. No telemetry, accounts, or monetization.

**Consequences**: Fast feedback (author = user #1), scope cuts are legitimate, no licensing machinery. Polish bar raises design investment early.

## D2. Positioning: LocalStack-first, portable-API discipline

**Context**: LocalStack alternatives (floci 23.8k★, ministack 4.6k★, moto) speak the same AWS API. A "universal emulator GUI" branding would demand a multi-emulator test matrix in v1.

**Decision**: Brand and test for LocalStack only. Use LocalStack-specific powers (auth token, internal endpoints like Lambda logs). Implement everything else via standard AWS APIs against a configurable endpoint.

**Consequences**: Best-possible LocalStack UX; alternative emulators likely work incidentally but are unsupported in v1. Testing matrix stays trivial.

## D3. Form factor: Tauri 2 desktop app

**Context**: Desktop (Tauri/Electron), local web server (`npx` → browser tab), or VS Code extension. Web-server ceiling is low for polish goals; VS Code is a different product with an official LocalStack toolkit already there.

**Decision**: Tauri 2 + React/TS. Thin Rust shell; all data-plane logic in TypeScript in the webview.

**Consequences**: ~10 MB binaries, native dialogs/menus/hotkeys, built-in updater path. Small Rust surface must be maintained. Differentiates from web-server-based competitors (stackport, dynamodb-admin).

## D4. Docker scope: connect-only in v1

**Context**: "Must support docker LocalStack" could mean browsing any running instance or also managing container lifecycle (start/stop/create via Docker socket).

**Decision**: v1 connects to an endpoint (default `localhost:4566`) with health polling, auto-reconnect, and a friendly "not running" screen. Instance management is v1.1.

**Consequences**: No Docker socket access in v1 (avoids platform permission edge cases); works with any launch method (docker run, compose, testcontainers). Remote endpoints supported for free later.

## D5. Connections: saved profiles + zero-config default

**Context**: Single implicit connection vs profile list. Secrets Manager support requires a per-connection auth token, so per-connection config must exist anyway.

**Decision**: TablePlus-style saved profiles (name, endpoint, region `us-east-1`, optional auth token) plus a built-in **Local** profile → `localhost:4566` with dummy creds (`test`/`test`). No real-AWS mode ever.

**Consequences**: First-run stays instant; multiple ports/instances and per-profile tokens work. Small extra UI surface.

## D6. Capability depth: daily-driver tier

**Context**: Read-only viewer vs curated writes vs full CRUD per service.

**Decision**: Full browsing plus a curated set of daily write actions per service (see plan.md feature contract): S3 upload/download/delete/presigned; SQS send/peek/purge/redrive; Secrets create/update/delete/reveal; Lambda invoke-with-logs + env edit.

**Consequences**: The "magic moments" (queue peek, invoke + logs, drag-drop upload) ship in v1. Policies/versioning/code-editing explicitly deferred.

## D7. UI layer: shadcn/ui + Tailwind, custom theme

**Context**: shadcn/ui+Tailwind vs admin component kits (MUI/Ant). Category is full of generic dashboards.

**Decision**: shadcn/ui + Tailwind with a custom theme; dark/light from day one. Core: TanStack Query (server state), Zustand (app state), TanStack Virtual (lists), @aws-sdk/v3 (data plane).

**Consequences**: Full design ownership (more up-front design work) in exchange for a distinctive product identity.

## D8. Navigation: sidebar + tabs + Cmd-K

**Context**: Service-first sidebar, palette-first, or single-pane drill-down.

**Decision**: Left rail (connection + services); resources open as tabs in the main area; Cmd-K quick-jump palette layered on top.

**Consequences**: Familiar (AWS console echoes), scales with future services and the v1.1 instance manager; palette is additive, cheap, high feel-value.

## D9. Quality & release: full release engineering from v1

**Context**: Pragmatic CI vs full release engineering (Playwright e2e through Tauri webview, macOS notarization, auto-updater). **User chose to exceed the recommendation.**

**Decision**: Vitest + Testing Library; CI integration tests against a real LocalStack container; Playwright e2e; GitHub Actions release matrix (dmg/msi/AppImage); macOS notarization + Tauri auto-updater from v1.

**Consequences**: Slower first release; smoother forever after. Standing dependency: Apple Developer account ($99/yr) + signing certs in CI secrets (blocks M4's notarization only).

## D10. Name: "LocalStacker"

**Context**: Descriptive repo name vs new distinctive brand before any users exist.

**Decision**: Keep **LocalStacker**; README carries a "not affiliated with LocalStack GmbH" disclaimer. Rename later only if the project outgrows LocalStack.

**Consequences**: Instant searchability ("localstack gui"); trademark hygiene handled by disclaimer; renaming before popularity is cheap.

## D11. M1 S3: pure-TS data plane + Tauri plugins for file save

**Context**: Downloading objects inside a webview requires file system access, but the data plane is pure TypeScript running in the webview.
**Decision**: Run AWS SDK v3 in the webview; implement download via `GetObjectCommand` paired with `@tauri-apps/plugin-dialog` and `@tauri-apps/plugin-fs` for native file save with a browser `<a download>` fallback; generate presigned URLs client-side using `@aws-sdk/s3-request-presigner`; use `sonner` for user feedback toasts.

**Consequences**: The Rust surface stays thin (2-line plugin registration in `src-tauri/src/lib.rs` and scoped capability in `default.json`); browser `pnpm dev` remains fully functional through fallback paths without bundling native plugins into browser dev bundles.

## D12. M2 SQS: peek via short visibility timeout with explicit restore; redrive as receive→resend→delete loop

**Context**: Peek must not consume messages, but SQS has no native non-consuming read API. Similarly, SQS has no native queue-to-queue redrive API for non-DLQ setups or manual transfers.

**Decision**:
- Peek uses `ReceiveMessageCommand` with a 30s visibility timeout (`PEEK_VISIBILITY_TIMEOUT_SECONDS`) coupled with `ChangeMessageVisibilityBatchCommand` (timeout 0) for immediate explicit restore on peek refresh, tab close, tab switch, and component unmount.
- Queue depth and stats are kept fresh by polling `useQueues` at a 10s interval (`refetchInterval: 10_000`).
- Redrive is implemented as a client-side loop: receive up to 10 messages with 30s visibility → send to target queue (preserving FIFO `MessageGroupId` when the target is a `.fifo` queue) → batch delete from source queue via `DeleteMessageBatchCommand`, bounded by a 1000-message cap (`REDRIVE_MAX_MESSAGES`).

**Consequences**: Peeked messages briefly count as in-flight (honest AWS SQS semantics) until explicitly restored or visibility naturally expires. A crash mid-redrive self-heals at visibility expiry with at-least-once duplicate delivery guarantees (documented in the redrive dialog).

## D13. M3 Lambda + Secrets: LogType=Tail invocation logs; auth token as Authorization header

**Context**: `docs/plan.md` assumed a LocalStack-internal logs endpoint (`/_localstack/lambda/*`) which no longer exists at LocalStack HEAD (verified; 0 Sourcegraph matches). Secrets Manager tier requirements have evolved: `secretsmanager` lives in community core at HEAD, but LocalStack auth token handling is required across services on modern unified images.

**Decision**:
- Use standard AWS `LogType: "Tail"` invoke parameter and base64-decode `LogResult`. When `LogResult` is absent, degrade gracefully to "Logs unavailable for this invocation (LocalStack returns logs via LogType=Tail)" rather than failing.
- Pass connection profile `authToken` as the `Authorization` header on all SDK requests via a `withAuthHeader` fetch handler wrapper. LocalStack ignores SigV4 on service APIs, so overriding `Authorization` is safe and authenticates against licensed/internal endpoints.
- Secrets Manager token gating is explanatory UX (informational note under header and error-path explanation) rather than a hard client-side block, since community containers may operate without a token while licensed containers require one.

**Consequences**: The logs mechanism is portable to any AWS-compatible emulator or real AWS; token headers are harmless on unauthenticated or activated instances; users can configure tokens directly in the UI via Connection settings.

## D14. M4: e2e via Chromium against vite proxy; release engineering

**Context**: `docs/plan.md` specified Playwright e2e "through the Tauri webview". This is technically infeasible: WKWebView (macOS) and webkit2gtk (Linux) do not expose Chrome DevTools Protocol (CDP), and Playwright does not speak WebDriver. Additionally, modern LocalStack images (≥2026.03) mandate cloud authentication tokens, while `localstack/localstack:4.14.0` represents the final token-free community release.

**Decision**:
- Drive end-to-end tests via Playwright + Chromium against the Vite dev server (`http://localhost:1420`), using the Vite reverse proxy to forward LocalStack traffic to `http://127.0.0.1:4566`. In browser mode, request bodies are buffered as ArrayBuffers to prevent Chromium's HTTP/1.1 streaming body ALPN errors. LocalStack is pinned to `localstack/localstack:4.14.0` with `/var/run/docker.sock` mounted for Lambda execution.
- Release engineering uses a GitHub Actions matrix across `macos-14` (Apple silicon DMG), `ubuntu-22.04` (AppImage), and `windows-latest` (NSIS).
- Secrets-gated notarization: if Apple signing/notarization secrets are absent, `tauri-action` outputs unsigned DMGs without failing the build.
- Updater artifacts use NSIS (not MSI) on Windows, and minisign ed25519 signing keys with the public key committed to `tauri.conf.json`.

**Consequences**: E2E runs identically locally and in CI; the Rust `forward_request` path remains covered by unit tests and desktop dogfooding. Release workflow safely produces artifacts even prior to acquiring an Apple Developer account.
