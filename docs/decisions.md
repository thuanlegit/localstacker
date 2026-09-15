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

## D15. M5 DynamoDB + SNS: document client for items, bounded client-side clear table, SQS subscribe helper via QueueArn

**Context**: DynamoDB item manipulation requires marshaling/unmarshaling attribute values if raw client is used, causing awkward UI code and boilerplate. DynamoDB has no native truncate table API. SQS subscriptions from SNS need the queue's ARN, which is already present inside SQS attributes.

**Decision**:
- Use `@aws-sdk/lib-dynamodb` document client for item operations (`ScanCommand`, `QueryCommand`, `PutCommand`, `DeleteCommand`, `BatchWriteCommand`), operating directly on plain JSON records without manual marshalling. Schema inspection (`ListTablesCommand`, `DescribeTableCommand`) uses the raw `@aws-sdk/client-dynamodb` client.
- Clear table is implemented as a client-side loop: scan up to 100 items/page projecting only key attributes → batch delete via `BatchWriteCommand` in chunks of 25 with up to 3 retry rounds for `UnprocessedItems`, capped at 5000 items (`CLEAR_TABLE_MAX_ITEMS`).
- Query builder is scoped to partition key equality plus sort key operators (`eq`, `begins_with`, `between`), coercing values based on table/index `AttributeDefinitions` (handling string, number, and base64 binary).
- SQS subscribe helper in SNS reuses the queue ARN exposed directly on `QueueSummary.attributes.arn` (parsed from `QueueArn` in SQS attributes).

**Consequences**: UI components handle standard JavaScript objects cleanly. Truncate is safe and bounded. SNS to SQS subscription requires zero manual ARN entry by the user.

## D16. M6 CloudWatch Logs + SSM: unified FilterLogEvents API, client-side tailing/filtering, SecureString KMS auto-decryption

**Context**: CloudWatch Logs has multiple event retrieval APIs (`GetLogEvents`, `FilterLogEvents`). SSM Parameter Store supports hierarchical names with `/` and encrypted `SecureString` values. On LocalStack community, default KMS keys are auto-provisioned.

**Decision**:
- Use a single `FilterLogEventsCommand` API for event browsing, search filtering, and live tailing. Live tailing polls every 3 seconds (`TAIL_POLL_INTERVAL_MS`) with a `startTime` cursor set to `lastTimestamp + 1`, merging and deduplicating by event ID, capped at 5000 events (`MAX_LOG_EVENTS`). Search filtering includes client-side substring matching on message and stream name to provide responsive, instant filtering across all environments including community emulators.
- SSM `SecureString` values are decrypted via `WithDecryption: true` in `GetParameterCommand` against LocalStack's auto-provisioned default KMS key (`aws/ssm`), avoiding the need for an explicit KMS client or key ID in local development.
- Hierarchy is built client-side via `buildParameterTree` from `DescribeParameters`, supporting arbitrary nested slash paths and resolving folder/leaf collisions cleanly.
- Lambda to CloudWatch Logs deep-link links directly to `/aws/lambda/<name>` log group, displaying a helpful empty state if the runtime has not yet emitted or forwarded logs.

**Consequences**: Log viewer provides smooth, responsive streaming and search without multiple API abstractions. SSM parameters cleanly display both flat and tree representations, with secure reveal and editing in-place.

## D17. M7 EventBridge + Scheduler: GetSchedule fan-out, failed entry error propagation, community execution note, shared TargetPicker

**Context**: EventBridge and EventBridge Scheduler both route events and schedules to AWS targets (Lambda, SQS, SNS, etc.). `ListSchedules` in the Scheduler API omits critical schedule attributes such as the `ScheduleExpression`, `FlexibleTimeWindow`, and `Target.Input`. In EventBridge, `PutEvents` and `PutTargets` return HTTP 200 even when individual entries fail (`FailedEntryCount > 0`). LocalStack Community (v2.3.0+) implements Scheduler as a mocked CRUD store without actual execution or target triggering.

**Decision**:
- In `src/lib/eventbridge.ts`, `putEvents`, `putRuleTargets`, and `removeRuleTargets` inspect `FailedEntryCount` and throw an informative `Error` containing the first entry's `ErrorCode` and `ErrorMessage`, cleanly propagating API-level failures into UI toast notifications.
- In `src/lib/scheduler.ts`, `listSchedules` fans out `GetScheduleCommand` across all returned schedule summaries using `Promise.all` (matching the SQS `listQueues` -> `getQueueAttributes` fan-out precedent), populating `expression`, `targetInput`, `timezone`, and window settings.
- Schedule state toggling (`updateScheduleState`) fetches the current schedule with `GetScheduleCommand` and calls `UpdateScheduleCommand` retaining all configured fields while inverting `State` (`ENABLED` <-> `DISABLED`), since Scheduler has no dedicated enable/disable API verbs.
- A shared `<TargetPicker />` component is extracted into `src/components/eventbridge/TargetPicker.tsx` and reused across both `EventBusView` and `ScheduleGroupView`. For Lambda functions (which lack ARNs in their summaries), the target ARN is deterministically constructed from the active region (`arn:aws:lambda:<region>:000000000000:function:<name>`).
- Schedule creation uses fixed `FlexibleTimeWindow { Mode: "OFF" }` and defaults `RoleArn` to `arn:aws:iam::000000000000:role/localstacker-scheduler` (which real AWS requires and LocalStack permits).
- Rather than gating Scheduler behind a Pro license badge, an informational banner ("LocalStack community stores schedules but does not execute them") is displayed following the D13 secrets-token precedent, allowing full local CRUD testing.

**Consequences**: Data planes are thin and idiomatic over `@aws-sdk/client-eventbridge` and `@aws-sdk/client-scheduler`. Scheduler views show complete expressions and input payloads. E2E tests exercise complete EventBridge event delivery to SQS queues and full Scheduler CRUD without requiring a LocalStack Pro license.

## D18. M8 API Gateway + SES: TestInvokeMethod-backed Method Test Runner, curated integration creation, captured mailbox via internal endpoint

**Context**: API Gateway REST APIs require stages and deployments for live invocations, but LocalStack implements `TestInvokeMethod` in its legacy provider, allowing direct method simulation without deployment. Method creation in AWS API Gateway has complex multi-step sequences across methods, integrations, method responses, and integration responses. In SES, emails sent locally in LocalStack are intercepted rather than sent externally; modern LocalStack stores captured emails in an internal endpoint (`/_aws/ses`, historically `/_localstack/ses`), which is lazily registered on first SES API use. SES `SendEmail` strictly requires a verified sender identity.

**Decision**:
- In `src/lib/apigateway.ts`, `testInvokeMethod` leverages `TestInvokeMethodCommand` to execute synchronous test invocations, extracting status, response headers, response body, latency, and execution log. Status codes in the 4xx and 5xx ranges are treated as valid simulation results and rendered directly in the Test Runner results panel rather than thrown as exceptions. LocalStack reports latency as an integer representing whole seconds (often reading ~0 ms); the raw number is displayed faithfully.
- Method creation is curated into three well-defined integration types:
  1. **MOCK**: Automatically provisions the four-step sequence (`PutMethod` -> `PutIntegration` -> `PutMethodResponse` -> `PutIntegrationResponse`) with default request templates and an editable JSON response template.
  2. **AWS_PROXY (Lambda)**: Configures Lambda proxy integration using `POST` and a constructed integration URI (`arn:aws:apigateway:<region>:lambda:path/2015-03-31/functions/<arn>/invocations`), reusing `<TargetPicker />` from EventBridge.
  3. **HTTP_PROXY**: Configures HTTP passthrough to arbitrary target URLs.
- Deployed stage invoke URLs follow LocalStack's ASF route structure: `{endpoint}/restapis/{apiId}/{stageName}/_user_request_{path}`.
- In `src/lib/ses.ts`, `listIdentities` fans out `GetIdentityVerificationAttributesCommand` to resolve verification status and tokens for all identities. `sendEmail` guards that either text or HTML body is provided.
- LocalStack Captured Mailbox accesses `/_aws/ses` with automatic fallback to `/_localstack/ses`. If the endpoint is unavailable (e.g. before any SES call has registered the route or on non-LocalStack endpoints), an informational banner is shown ("Captured mailbox is unavailable on this LocalStack instance"), preserving identity management functionality per D13 precedent.
- Client-side MIME attachment parsing (`parseAttachments`) parses `Content-Disposition: attachment; filename="..."` headers out of raw MIME data, providing attachment listing and size breakdown.
- The Send Test Email dialog automatically restricts the sender address (`From`) to verified email identities, preventing `MessageRejected` errors.

**Consequences**: The Method Test Runner and Captured Mailbox provide interactive local feedback loops without needing external curl commands or deployed infrastructure. The integration creation wizard eliminates low-level AWS API Gateway wiring boilerplate.

## D19. Relicense PolyForm-Noncommercial 1.0.0 → AGPL-3.0-only

**Context**: PolyForm-NC permitted noncommercial use only, which excluded the core audience (developers running LocalStacker at work) and capped adoption. MIT/Apache would remove all fork protection. At switch time the project has a single copyright holder (all commits, one author) and every dependency is Apache-2.0/MIT/ISC, so AGPL aggregation is conflict-free.

**Decision**:
- Relicense to GNU AGPL-3.0-only: verbatim `LICENSE`, `package.json` `license` field, README badge and License section.
- Released versions ≤ v1.1.0 remain PolyForm-Noncommercial 1.0.0; the switch applies from the next release onward.
- Inbound contributions are accepted under AGPL-3.0-only (inbound = outbound). As sole copyright holder, dual licensing (AGPL-3.0 or paid exception via buymeacoffee.com/ryleth) remains available; the first external contribution without a copyright grant locks that code to AGPL-3.0.

**Consequences**: Commercial use is permitted under copyleft — derivatives and network-offered services (including a potential web-hosted fork of the React frontend) must ship source under AGPL-3.0. Corporate policies that blanket-ban AGPL will flag the project; accepted as a tradeoff against the NC use-ban on the primary audience.
