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
  (window, menus, packaging, and — from v1.1 — the Docker Engine client via
  `bollard`); no service business logic in Rust.
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
- Docker: container lifecycle management (detect/inspect/start/stop/restart/
  remove/create via Docker socket) shipped in v1.1; v1 remains connect-only.

## v1 feature contract — "daily-driver tier"

| Service | Browse | Curated write actions | Explicitly skipped in v1 |
|---|---|---|---|
| **S3** | Buckets; folder-style object tree (virtual, paginated); metadata; image/text/JSON previews | Create/delete bucket; drag-drop upload; download; delete object; copy presigned URL | Versioning UI; bucket policies; lifecycle rules |
| **SQS** | Queues; attributes (depth, in-flight); DLQ badge | Send message (validated JSON editor); **peek without consuming**; purge queue; delete message; DLQ → queue redrive | Full attribute editing; FIFO dedup tooling (basic create only) |
| **Secrets Manager** | Secret list; value reveal; versions/stages | Create/update secret; delete secret | Rotation UI |
| **Lambda** | Function list; config (runtime, handler, env, timeout) | **Invoke with test payload → response + duration + logs** (logs via LocalStack endpoint, capability-detected); edit env vars | Code editor; zip upload; layers; aliases |

Notes:
- SQS peek = receive with a short visibility timeout; restore visibility after inspection.
- Lambda logs use standard AWS `LogType: "Tail"` invocation logs (D13), decoded client-side.
- Secrets Manager requires an auth token (Hobby+); the UI explains this with a token configuration prompt.

## Upcoming services contract (v1.x)

| Service | Milestone | Browse | Curated write actions | Explicitly skipped |
|---|---|---|---|---|
| **DynamoDB** | M5 (Shipped ✅) | Tables list; key schema (`HASH`/`RANGE`), GSIs/LSIs; virtualized item grid; Scan & Query (PK/SK condition expressions); raw JSON & document inspector | Put/edit item (validated JSON); delete item; truncate/clear table | Complex table creation wizard; secondary index mutation; auto-scaling / throughput editing; backup / PITR |
| **SNS** | M5 (Shipped ✅) | Topics list (standard & FIFO); attributes; subscriptions list (protocol, endpoint, status) | Create/delete topic; publish message (payload + JSON attributes); subscribe SQS queue helper | Delivery retry policies; SMS sandbox management; data protection policies |
| **CloudWatch Logs** | M6 (Shipped ✅) | Log groups; log streams (sorted by event time); virtualized log viewer with live tailing & search filter | Create/delete log group; delete stream; deep-link from Lambda FunctionView | Metric filters; subscription filters; CloudWatch metrics/alarms |
| **SSM Parameter Store** | M6 (Shipped ✅) | Parameters (path hierarchy & flat views); type badges (`String`, `StringList`, `SecureString`); decrypted value toggle | Create/update parameter; delete parameter; decrypt `SecureString` using local KMS | Parameter tier editing; advanced policies; history diffing |
| **EventBridge** | M7 (Shipped ✅) | Event buses list (default & custom); rules list per bus (status, schedule/pattern); targets list per rule (target type, ARN, input transformer) | Create/delete event bus; create/edit/delete rule (event pattern JSON editor); add/remove targets; **PutEvents test publisher modal** (DetailType, Source, Detail JSON) | Archive & Replay; Schema Registry; Partner Event Sources; CloudWatch Alarms / cross-region replication |
| **EventBridge Scheduler** | M7 (Shipped ✅) | Schedule groups; schedules list (state `ENABLED`/`DISABLED`, expression: rate/cron/at, target ARN, time window) | Create/delete schedule (name, group, cron/rate expression, payload JSON, target ARN); enable/disable toggle | Complex retry policies with DLQ routing; cross-account IAM role assumptions |
| **API Gateway REST API** | M8 (Shipped ✅) | REST APIs list; resource tree hierarchy (`/`, `/{proxy+}`); method inspector (verb, auth, integration: Lambda/Mock/HTTP); stages list with deployment history and direct URL | Create/delete REST API; create resource and method; deploy API to stage; **Built-in Method Test Runner** (path/query params, headers, body → invoke against LocalStack → display status, latency, headers, body, logs) | WebSocket APIs; HTTP APIs v2 (REST only in this slice); Authorizer creation wizards; VPC Links; Usage Plans / API Keys |
| **SES** | M8 (Shipped ✅) | Verified email addresses and domain identities; **LocalStack Captured Mailbox** (`GET /_aws/ses` / `/_localstack/ses`): sent email list with timestamp, sender, recipients, subject, tabbed HTML preview, plaintext preview, raw MIME headers, attachments | Verify email/domain identity; delete identity; **Send test email modal** (To, From, Subject, Text/HTML body) with instant capture into Mailbox | DKIM signing configuration; configuration sets; dedicated IP pools; custom verification email templates |
| **IAM** | M9 (Shipped ✅) | Roles list; policies list (AWS managed + customer inline/managed); users list. Role detail: Trust relationship policy doc, attached policies, inline policies with syntax-highlighted JSON viewer. User detail: attached policies, access keys list | Create/delete role; create/update/delete inline role policy; create/delete user; create/deactivate/delete access key; copy ARN / Access Key ID | SAML/OIDC identity providers; Permission Boundaries; Access Analyzer; credential report generation; complex MFA |
| **Route53** | M9 (Shipped ✅) | Hosted zones list (Domain Name, ID, Type: Public/Private, Record count); ResourceRecordSets virtualized grid (Name, Type: A, AAAA, CNAME, TXT, MX, etc.; TTL; Values / Routing target) | Create/delete hosted zone (domain name, comment, private zone flag); create/edit/delete DNS record sets (name, type, TTL, routing records) | Traffic Flow / Traffic Policies; Health Checks; DNSSEC configuration; Geo-location / latency routing rules |
| **EC2** | M10 | Instances list (Instance ID, AMI, Type, State badge: running, stopped, terminated, IPs, Security Groups, Key Name); Security Groups list; Key Pairs list. Security Group Inspector: visual matrix of Inbound (Ingress) and Outbound (Egress) rules | Mock Instance state transitions (Start, Stop, Reboot, Terminate); Create/delete Security Group; Authorize/Revoke Security Group Ingress/Egress rules; Create/delete Key Pair (download private key `.pem`) | Launch Templates; EBS volume management / snapshots; Elastic IPs; NAT Gateways; Transit Gateways; complex VPC route tables |

## Information architecture

- Left sidebar: connection selector + services organized into collapsible categories:
  - **Compute & Edge**: Lambda, API Gateway, EC2
  - **Storage & Database**: S3, DynamoDB
  - **Messaging & Integration**: SQS, SNS, EventBridge, EventBridge Scheduler, SES
  - **Security & Configuration**: IAM, Secrets Manager, SSM Parameter Store
  - **Observability & DNS**: CloudWatch Logs, Route53
- Resources open as **tabs** in the main area:
  - Shipped: `bucket`, `queue`, `secret`, `function`, `table`, `topic`, `logGroup`, `parameter`, `eventBus`, `scheduleGroup`.
  - M8–M10: `restApi`, `sesIdentity`, `sesMailbox`, `iamRole`, `iamPolicy`, `iamUser`, `hostedZone`, `securityGroup`, `ec2Instance`.
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
  README/landing polish, tagged v1.0.0. (Shipped ✅)
- **M5 — DynamoDB & SNS** (Shipped ✅):
  - DynamoDB vertical slice: `@aws-sdk/client-dynamodb` + `@aws-sdk/lib-dynamodb`,
    table listing, key schema inspection, virtualized item grid, Scan and Query
    filtering, item JSON editor, item deletion, clear table action.
  - SNS vertical slice: `@aws-sdk/client-sns`, topic listing (standard/FIFO),
    create/delete topic, subscriptions inspector, publish message modal,
    quick SQS queue subscription helper.
  - E2E Playwright tests against LocalStack 4.14.0 container.
- **M6 — CloudWatch Logs & SSM Parameter Store** (Shipped ✅):
  - CloudWatch Logs: `@aws-sdk/client-cloudwatch-logs`, log group & stream exploration,
    virtualized live log tailing with search filter, deep link from Lambda function view.
  - SSM Parameter Store: `@aws-sdk/client-ssm`, path hierarchy browser,
    parameter editing, local KMS `SecureString` decryption.
- **M7 — EventBridge & EventBridge Scheduler (Event-Driven Messaging & Schedules)** (Shipped ✅):
  - EventBridge: `@aws-sdk/client-eventbridge`, bus listing (default/custom), create/delete bus, rules explorer with event pattern JSON viewer, targets list (Lambda, SQS, SNS), rule toggle, PutEvents test event publisher modal.
  - EventBridge Scheduler: `@aws-sdk/client-scheduler`, schedule group explorer, schedule listing (rate/cron/at), create/delete schedule, enable/disable toggle, payload inspector.
  - E2E Playwright test: create bus, create rule with SQS target, publish event via PutEvents modal, assert message received on target queue with matched detail.
- **M8 — API Gateway REST API & SES (Edge Routing & Email Testing)** (Shipped ✅):
  - API Gateway REST: `@aws-sdk/client-api-gateway`, REST APIs list, resource hierarchy tree, method viewer (Lambda/Mock/HTTP integration), stage deployments, built-in Method Test Runner (headers, query params, request body, latency & status inspection).
  - SES: `@aws-sdk/client-ses`, verified email/domain identities management, send test email modal, LocalStack Captured Mailbox (`GET /_localstack/ses`) with tabbed HTML rendered preview, plaintext view, raw headers, and attachments.
  - E2E Playwright test: deploy REST API with mock integration, execute method test invoke in console, assert status 200 + response body; verify email identity, send email via modal, assert email captured in LocalStack Mailbox viewer.
- **M9 — IAM & Route53 (Cloud Security & DNS)** (Shipped ✅):
  - IAM: `@aws-sdk/client-iam`, roles list, trust relationship & policies inspector (syntax-highlighted JSON viewer), inline policy editor with client-side JSON validation, user management with access keys list, status toggling, and credential copy helper (.env format).
  - Route53: `@aws-sdk/client-route-53`, hosted zones (public/private) list, virtualized ResourceRecordSets grid powered by `@tanstack/react-virtual` (A, CNAME, TXT, MX, etc.), create/edit/delete DNS records with TTL and type-specific value validation, apex record protection.
  - E2E Playwright test: create IAM role with inline policy, assert policy JSON rendered; create user, generate and deactivate access key; create hosted zone, add A and CNAME record sets, edit TTL, assert in grid, delete records and zone.
- **M10 — EC2 Mock (Compute & Network Mock)** (Shipped ✅):
  - EC2: `@aws-sdk/client-ec2`, instances list with mock state transitions (Start, Stop, Reboot, Terminate), Key Pairs manager (create with `.pem` download, delete), Security Groups list with visual Inbound/Outbound rule matrix visualizer, Authorize/Revoke ingress/egress rules.
  - E2E Playwright test: create security group, add ingress rule for port 443, assert in rule matrix, revoke rule; create key pair, assert fingerprint, delete key pair and security group.
- **v1.1 — Docker Lifecycle Management** (Shipped ✅):
  - Architecture: Docker Engine access via `bollard` in the Tauri Rust backend
    (unix socket on macOS/Linux, named pipe on Windows; no CLI sidecar). Typed
    `#[tauri::command]`s: `docker_status`, `list_containers`,
    `inspect_container`, `container_logs`, `start_container`, `stop_container`,
    `restart_container`, `create_container`, `remove_container`.
  - TS seam: injectable `DockerAdapter` interface in `src/lib/docker.ts`
    wrapping `invoke`; component tests and Playwright e2e run against a mock
    adapter (the browser harness cannot call Tauri commands), bollard commands
    get Rust integration tests against a real daemon in CI.
  - Shell: dedicated Docker sidebar section above Services (whale icon),
    `docker` tab kind; container list polls every 5s.
  - Availability: lazy probe on first panel open; daemon down / socket missing /
    `EACCES` render a status row with actionable guidance and retry — users who
    never open the panel pay zero cost, connect-only flows unaffected.
  - Discovery: containers whose image matches `localstack/localstack*` or
    `gresau/localstack-persist*`, default Docker context only (no
    `DOCKER_HOST`/remote contexts in v1.1); per-row actions Start, Stop,
    Restart, Remove, Connect; inspect drawer (image+tag, created, status,
    ports, mounts, networks, env with secret values masked).
  - Stop semantics: persistence = `/var/lib/localstack` mount or persist-
    flavored image; no persistence → state-loss warning before stop/restart.
    Stop timeout 60s for persist-flavored images (commit-on-stop,
    "persisting…" progress), 10s otherwise. Remove confirms and optionally
    deletes named volumes (default off).
  - Logs: snapshot (last N lines) plus follow tail with autoscroll/pause,
    in-tab console per container.
  - Create wizard: curated fields — container name, image+tag picker (both
    families plus custom image), visual service picker (toggle chips for every
    supported LocalStack service plus a free-text field for additional service
    names; emits the `SERVICES` env var, deduped, with an all-services-when-
    empty default; manual `SERVICES` env rows are rejected in favor of the
    picker), host port (default 4566) and extra port mappings, key=value env
    rows (API key masked), PERSIST toggle creating a named volume, network
    picker, restart policy (default `unless-stopped`), hostname — plus Advanced
    JSON overrides deep-merged into the bollard create request (client-side
    validation, merged-config preview). Image pull shows layer progress and is
    cancellable.
  - Post-create: wait for health, find-or-create `localhost:<port>` profile,
    auto-connect; profiles stay pure endpoint+auth, container control never
    becomes a profile field.
  - E2E Playwright test (mock adapter): panel states, lifecycle actions with
    and without persistence warnings, wizard validation and JSON-merge
    preview, remove confirmation.
- **v1.2 — First-Run Onboarding** (Shipped ✅):
  - Gate: `AppShell` swaps Sidebar/MainArea/CommandPalette for
    `src/components/onboarding/Onboarding.tsx` until the persisted
    `useOnboarding` store (`localstacker.onboarding`) records `completedAt`;
    ⌘, stays inert mid-onboarding. Reset app data wipes the key, so Reset
    replays onboarding (intended semantics).
  - Single screen, no wizard: a live lamp board of all 15 supported services
    polls the active profile endpoint every 5s, reusing the HomeView lamp
    logic extracted to `src/lib/services.ts` (`LampStatus`, `lampStatus`,
    `LAMP_CLASS`); inline endpoint editing commits to the Local profile on
    Enter/blur; `Checking…` / `Not running` / `Connected · <version>` states
    replace each other in place.
  - Docker one-click reuse: `createAndConnect` with
    `localstack/localstack:4.14.0`, host port 4566, all services (`env: []`),
    persistence volume; pull percent from `PullProgressEvent`, then the
    hook's status text; on failure the down state returns with the error in
    the reason line. Copy-command fallback (`LOCALSTACK_RUN_COMMAND` in
    `src/lib/docker.ts`) plus `Skip for now` setting the same flag.
  - E2E: `e2e/fixtures.ts` seeds the completed flag into every existing spec
    (one import-line change each); `e2e/onboarding.spec.ts` imports
    `@playwright/test` directly to exercise genuine unseeded first launches
    (complete → shell → reload persistence, and the skip path).
- **M11 — Step Functions (State Machine Studio)** (Shipped ✅ · v1.2):
  - `@aws-sdk/client-sfn`, state machines list, ASL definition viewer (syntax-highlighted JSON), StartExecution test runner with JSON input editor, executions list per state machine, execution event-history timeline, StopExecution.
  - Visual state graph: `react-flow` renders ASL Task/Choice/Parallel/Map/Pass/Fail/Succeed/Wait states with transition edges; read-only, node click scrolls the definition viewer to the matching state.
  - E2E Playwright test: deploy a standard state machine, run an execution from the test runner, assert execution succeeds and event history renders; assert graph nodes match the ASL states.
- **M12 — DynamoDB Streams & Kinesis Data Streams** (Planned 🚧 · v1.2):
  - DynamoDB Streams: `@aws-sdk/client-dynamodb` + `@aws-sdk/client-dynamodbstreams`, enable/disable streams on existing tables (view-type selector, `NEW_AND_OLD_IMAGES` default), stream ARN + shard list, shard-iterator record peek.
  - Kinesis: `@aws-sdk/client-kinesis`, streams list with shard map, PutRecord/PutRecords test publisher, record peek via shard iterator, consumer (EFO) list/registration.
  - E2E Playwright test: enable a stream on a table, write an item, assert the record appears in shard peek; create a Kinesis stream, publish a record, assert it in the peek viewer.
- **M13 — CloudWatch Metrics & STS Identity** (Planned 🚧 · v1.2):
  - CloudWatch: `@aws-sdk/client-cloudwatch`, namespace/metric browser with dimension search, PutMetricData test publisher, alarm list with state/detail drawer, alarm create/edit (threshold, comparison, evaluation periods) — the monitoring pillar for the Home status board.
  - STS: `@aws-sdk/client-sts`, GetCallerIdentity card (account, user ARN) alongside Home endpoint facts.
  - E2E Playwright test: put a custom metric, assert it in the browser; create a threshold alarm, assert its state renders; assert the identity card shows the LocalStack account id.
- **M14 — KMS & ACM (Encryption & Certificates)** (Planned 🚧 · v1.2):
  - KMS: `@aws-sdk/client-kms`, key list with state and rotation, alias management, encrypt/decrypt playground (plaintext/base64 toggle), key policy viewer.
  - ACM: `@aws-sdk/client-acm`, certificate inventory, ImportCertificate (cert/key paste), RequestCertificate with DNS validation tokens, detail drawer.
  - E2E Playwright test: create a symmetric key, alias it, round-trip encrypt→decrypt; import a self-signed certificate, assert fingerprint and detail drawer.
- **M15 — CloudFormation & Route53 Resolver (Stacks & Hybrid DNS)** (Planned 🚧 · v1.2):
  - CloudFormation: `@aws-sdk/client-cloudformation`, stack list with status, template body viewer, events timeline, resource list with drift status; deploy-from-template-file deferred to a follow-up.
  - Route53 Resolver: `@aws-sdk/client-route-53-resolver`, resolver rules and inbound/outbound endpoints with detail drawer.
  - E2E Playwright test: deploy a two-resource stack (S3 bucket + SQS queue), assert resources/events render, delete the stack; create a resolver rule, assert it in the list.

## Risks & mitigations

| Risk | Mitigation |
|---|---|
| Secrets Manager unusable without Hobby+ token | UX explains and gates gracefully; Local profile works for all community services |
| Lambda logs endpoint is LocalStack-internal and may change | Capability detection + graceful degradation to "logs unavailable" |
| Notarization blocked on Apple Developer account | Tracked as M4 dependency; unsigned builds still shippable for personal use |
| CORS/SDK edge cases in webview | LocalStack sends permissive CORS; Tauri allows disabling webview CORS if needed |
| SES Captured Mailbox endpoint changes | `GET /_localstack/ses` is an internal LocalStack endpoint; capability-detect with graceful degradation to verified identities only |
| EventBridge Scheduler community emulation depth | LocalStack community may have partial execution support; validate execution semantics, surface Pro requirement badge if scheduler engine requires token while keeping CRUD active |
| EC2 expectation mismatch (real VMs vs mock) | UI clearly indicates "Stateful Mock" and emphasizes Security Groups / Key Pairs as the primary daily-driver value |
| IAM policy JSON validation errors | Syntax-highlighted editor validates JSON structure client-side before sending PutRolePolicy / CreatePolicy to avoid opaque AWS errors |
| Docker socket unavailable or permission denied (notably Linux socket group) | Lazy probe on first panel open; status row with actionable guidance and retry; connect-only flows unaffected |
| Windows named-pipe connectivity via bollard unverified | Smoke test NSIS build against Docker Desktop; degrade to "Docker unavailable" panel state rather than failing |
| Advanced JSON overrides produce invalid or unsafe container configs | Client-side JSON validation plus merged-config preview before create; daemon errors surfaced verbatim |
| `gresau/localstack-persist` commit window exceeds stop timeout on large states | 60s per-image stop timeout with "persisting…" progress; no SIGKILL mid-commit, container remains inspectable |
