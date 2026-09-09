# LocalStacker — Product Plan

> A local-first, zero-account desktop GUI for LocalStack. TablePlus-grade polish for your local AWS stack.
>
> Community project. **Not affiliated with LocalStack GmbH.**

## Product statement

LocalStacker is an open-source desktop client that connects to a running LocalStack
instance (default `http://localhost:4566`) and gives developers fast, polished,
daily-driver access to their local AWS resources — browse, inspect, and operate
them without reaching for the CLI.

- **Personal-first**: built as the author's daily tool; open-sourced so others can adopt it.
- **Local-first**: no accounts, no cloud dependency, no telemetry, ever.
- **High polish**: the missing "TablePlus for local AWS" — distinctive design, keyboard-driven, small and fast.

## Non-goals

- No real-AWS mode (storing/using real cloud credentials is out of scope and identity).
- No monetization, licensing, or anti-tamper machinery.
- No full CRUD on every service — curated daily-driver actions only (see Feature contract).
- Not an IaC/deployment tool (no Terraform/CDK orchestration).

## Positioning

- Identity: a **LocalStack client**. Named, branded, and tested for LocalStack.
- LocalStack-specific superpowers are allowed and encouraged where they unlock the
  best UX (auth-token header, internal endpoints such as Lambda logs, health info).
- Everything else uses standard AWS APIs against a configurable endpoint. As a
  side effect, alternative emulators (floci, ministack, moto, …) may work —
  incidentally, untested, unsupported in v1.

## Architecture

- **Shell**: Tauri 2 (Rust) + React + TypeScript. The Rust surface stays thin
  (window, menus, packaging); no business logic in Rust.
- **Data plane**: pure TypeScript running in the webview — `@aws-sdk/v3` clients
  (`-s3`, `-sqs`, `-secrets-manager`, `-lambda`) instantiated per connection
  profile with endpoint override and dummy credentials (`test`/`test`).
  LocalStack's edge sends permissive CORS (its own web console does direct
  browser calls); Tauri webview CORS relaxations as belt-and-braces.
- **Server state**: TanStack Query (polling, retries, refetch-on-focus for health
  and queue depths). **App state**: Zustand. **Long lists**: TanStack Virtual.
- **UI**: shadcn/ui + Tailwind, custom theme, dark + light from day one.

### Connection model

- Saved profiles: name, endpoint URL (default `http://localhost:4566`), region
  (default `us-east-1`), optional LocalStack auth token (required for
  Secrets Manager on Hobby+ tiers; sent as a header).
- Built-in zero-config **Local** profile → `localhost:4566`. First-run is instant.
- Health: poll `GET /_localstack/health`; status badge, auto-reconnect, friendly
  "not running" screen.
- Docker: **connect-only in v1**. Container lifecycle management (detect/start/
  stop/create via Docker socket) is a v1.1 feature.

## v1 feature contract — "daily-driver tier"

| Service | Browse | Curated write actions | Explicitly skipped in v1 |
|---|---|---|---|
| **S3** | Buckets; folder-style object tree (virtual, paginated); metadata; image/text/JSON previews | Create/delete bucket; drag-drop upload; download; delete object; copy presigned URL | Versioning UI; bucket policies; lifecycle rules |
| **SQS** | Queues; attributes (depth, in-flight); DLQ badge | Send message (validated JSON editor); **peek without consuming**; purge queue; delete message; DLQ → queue redrive | Full attribute editing; FIFO dedup tooling (basic create only) |
| **Secrets Manager** | Secret list; value reveal; versions/stages | Create/update secret; delete secret | Rotation UI |
| **Lambda** | Function list; config (runtime, handler, env, timeout) | **Invoke with test payload → response + duration + logs** (logs via LocalStack endpoint, capability-detected); edit env vars | Code editor; zip upload; layers; aliases |

Notes:
- SQS peek = receive with a short visibility timeout; restore visibility after inspection.
- Lambda logs use a LocalStack-internal endpoint — detect availability and degrade gracefully.
- Secrets Manager requires an auth token (Hobby+); the UI must explain this, not fail silently.

## Information architecture

- Left sidebar: connection selector + services (S3, SQS, Secrets, Lambda).
- Resources (bucket, queue, secret, function) open as **tabs** in the main area.
- **Cmd-K** quick-jump palette to open any resource by name (additive, not primary).

## Quality & release engineering

- **Tests**: Vitest + Testing Library (units/components). CI runs data-plane
  integration tests against a real LocalStack Docker container (the data plane
  is pure TS, so no GUI needed for those). Playwright e2e through the Tauri
  webview for critical flows.
- **Releases**: GitHub Actions matrix (macOS, Windows, Linux) building Tauri
  installers (dmg / msi / AppImage) attached to GitHub Releases.
- **Distribution polish from v1**: macOS notarization + Tauri auto-updater.
  Standing dependency: Apple Developer account ($99/yr) + signing certs in CI
  secrets. Homebrew cask when external users appear.

## Milestones

- **M0 — Scaffold & shell** (this build): Tauri 2 + Vite + React + TS + Tailwind
  + shadcn/ui; app shell (sidebar, tabbed main area, Cmd-K stub); profile store
  with built-in Local profile; health badge polling `/_localstack/health`;
  CI skeleton. Acceptance: app builds & runs, shows health status against a
  local `docker run localstack/localstack`.
- **M1 — S3 vertical slice**: the v1 S3 row of the feature contract, end to end.
  First dogfood milestone.
- **M2 — SQS**: queues, send/peek/purge/redrive.
- **M3 — Lambda + Secrets Manager**: invoke with logs (capability-detected);
  token-gated secrets.
- **M4 — Hardening**: Playwright e2e suite, notarization, auto-updater,
  README/landing polish, tagged v1.0.0.

## Risks & mitigations

| Risk | Mitigation |
|---|---|
| Secrets Manager unusable without Hobby+ token | UX explains and gates gracefully; Local profile works for all community services |
| Lambda logs endpoint is LocalStack-internal and may change | Capability detection + graceful degradation to "logs unavailable" |
| Notarization blocked on Apple Developer account | Tracked as M4 dependency; unsigned builds still shippable for personal use |
| CORS/SDK edge cases in webview | LocalStack sends permissive CORS; Tauri allows disabling webview CORS if needed |
