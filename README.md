# LocalStacker

A local-first, zero-account desktop GUI for [LocalStack](https://localstack.cloud) —
browse and operate your local AWS resources without reaching for the CLI.

> Community project. **Not affiliated with LocalStack GmbH.**

[![CI](https://github.com/thuanlegit/localstacker/actions/workflows/ci.yml/badge.svg)](https://github.com/thuanlegit/localstacker/actions/workflows/ci.yml)
[![Release](https://img.shields.io/github/v/release/thuanlegit/localstacker)](https://github.com/thuanlegit/localstacker/releases)

![LocalStacker Queue Peek](docs/screenshots/sqs-peek.png)

LocalStacker delivers a fast, keyboard-driven desktop companion for local AWS development. Operating entirely on your machine, it communicates directly with `localhost:4566` without cloud accounts, telemetry, or external subscriptions.

## Install

Download the latest prebuilt installer from [GitHub Releases](https://github.com/thuanlegit/localstacker/releases/latest):

| Platform | Format | Notes |
|---|---|---|
| **macOS** | `.dmg` | Apple silicon (`aarch64-apple-darwin`) |
| **Windows** | `.exe` | NSIS installer (auto-updates enabled) |
| **Linux** | `.AppImage` | Universal binary (auto-updates enabled) |

LocalStacker includes a built-in auto-updater that notifies you when a new release is available and handles update installation and relaunch in one click.

> **Note for macOS users**: Initial release builds are not notarized through Apple. If macOS displays a Gatekeeper notice, right-click `LocalStacker.app` and choose **Open**, or run:
> ```sh
> xattr -d com.apple.quarantine /Applications/LocalStacker.app
> ```

## Features

| Service | Capabilities |
|---|---|
| **S3** | Folder-style browsing with object previews, drag & drop uploads, downloads, presigned URL generation |
| **SQS** | Real-time queue depth & in-flight metrics, send validated JSON messages, **peek messages without consuming**, purge, dead-letter queue redrive |
| **Secrets Manager** | List secrets, create and update secrets, reveal decrypted secret values, delete secrets (explains LocalStack Hobby+ auth token requirements) |
| **Lambda** | Function listing, configuration inspection (runtime, handler, env vars), **invoke with test payload → response status + payload + logs (LogType=Tail)**, edit environment variables |
| **DynamoDB** | Tables list, key schema (`HASH`/`RANGE`), GSIs/LSIs, virtualized item grid, Scan & Query (PK/SK expressions), JSON item editor, delete item, clear table |
| **SNS** | Topics list (standard & FIFO), attributes, subscriptions list, publish message (payload + attributes), subscribe SQS queue helper |
| **CloudWatch Logs** | Log groups & streams exploration, virtualized log viewer with live tailing & search filter, deep-link from Lambda function view |
| **SSM Parameter Store** | Parameters in path hierarchy and flat views, type badges (`String`, `StringList`, `SecureString`), decrypted value toggle, create/update/delete |
| **EventBridge** | Event buses (default & custom), rules explorer with event pattern viewer/editor, target management (Lambda, SQS, SNS), rule enable/disable, PutEvents test event publisher |
| **EventBridge Scheduler** | Schedule groups, schedules list (rate/cron/at) with enable/disable toggles, create/delete schedules, target & payload inspector |
| **API Gateway** | REST APIs listing, resource tree, method inspector, stage deployments, **built-in Method Test Runner** (`TestInvokeMethod`) |
| **SES** | Verified email & domain identities, send test email modal, **LocalStack Captured Mailbox** with HTML, plaintext, raw MIME, and attachment tabs |

### S3 Object Preview
![S3 Object Preview](docs/screenshots/s3-bucket.png)

### Lambda Invocation & Execution Logs
![Lambda Invocation](docs/screenshots/lambda-invoke.png)

### DynamoDB Table Browser & JSON Inspector
![DynamoDB Table Browser](docs/screenshots/dynamodb-table.png)

### SNS Topics & Subscriptions
![SNS Topics](docs/screenshots/sns-topic.png)

### CloudWatch Logs Live Tailing & Search
![CloudWatch Logs](docs/screenshots/logs-view.png)

### SSM Parameter Store Hierarchy
![SSM Parameter Store](docs/screenshots/ssm-params.png)

### EventBridge Buses & Rules
![EventBridge Buses & Rules](docs/screenshots/eventbridge-bus.png)

### EventBridge Scheduler
![EventBridge Scheduler](docs/screenshots/scheduler-schedules.png)

### API Gateway REST API & Method Inspector
![API Gateway REST API](docs/screenshots/apigateway-api.png)

### SES Captured Mailbox & HTML Email Preview
![SES Captured Mailbox](docs/screenshots/ses-mailbox.png)

## Status & Roadmap

**v1.0.0 shipped** ✅. Core milestones implemented and verified with end-to-end coverage:

| Milestone | Scope | Status |
|---|---|---|
| **M0** | Scaffold, app shell, connection profiles, health badge | ✅ Done |
| **M1** | S3 — buckets/objects, upload/download, presigned URLs | ✅ Done |
| **M2** | SQS — send, peek, purge, DLQ redrive | ✅ Done |
| **M3** | Lambda (invoke + logs) and Secrets Manager | ✅ Done |
| **M4** | Hardening — Playwright e2e suite, release engineering, auto-updater, v1.0.0 | ✅ Done |
| **M5** | **DynamoDB & SNS** — table inspector, scan/query, document editor; topic pub/sub & SQS subscription helper | ✅ Done |
| **M6** | **CloudWatch Logs & SSM Parameter Store** — log groups/streams viewer, live tailing, parameter hierarchy & SecureString decryption | ✅ Done |
| **M7** | **EventBridge & EventBridge Scheduler** — event buses/rules, PutEvents test publisher, schedules explorer | ✅ Done |
| **M8** | **API Gateway REST API & SES** — resource tree, method test runner, verified identities & captured mailbox viewer | ✅ Done |
| **M9** | **IAM & Route53** — role/policy inspector, access keys, hosted zones & DNS records grid | 📋 Planned |
| **M10** | **EC2 Mock** — instance states, security groups rule matrix, key pairs | 📋 Planned |
| **v1.1** | **Docker Lifecycle** — detect, start, stop, and restart LocalStack containers via Docker socket | 🔭 Future |

See [`docs/plan.md`](docs/plan.md) for detailed service contracts and architectural decisions.

## Development

Prerequisites: Node 22+, pnpm, Rust toolchain, Docker.

```sh
pnpm install
pnpm tauri dev
```

Point LocalStacker at a running LocalStack container:

```sh
docker run --rm -p 4566:4566 -v /var/run/docker.sock:/var/run/docker.sock localstack/localstack:4.14.0
```

> **Why LocalStack 4.14.0?**
> LocalStack 4.14.0 is pinned as the community release operating without mandatory auth tokens across core services. Mounting `/var/run/docker.sock` is required by LocalStack to execute Lambda function runtimes.

### Scripts

| Command | Purpose |
|---|---|
| `pnpm tauri dev` | Run desktop app with hot reload |
| `pnpm tauri build` | Build release installers locally |
| `pnpm dev` | Run frontend in browser dev mode |
| `pnpm typecheck` | Run TypeScript type checking (`tsc --noEmit`) |
| `pnpm test` | Run Vitest unit tests |
| `pnpm test:watch` | Run Vitest in watch mode |
| `pnpm e2e` | Run Playwright end-to-end test suite against LocalStack |
| `pnpm e2e:headed` | Run Playwright tests in headed browser mode |
| `pnpm screenshots` | Regenerate documentation screenshots |

### Releasing

1. Ensure working directory is clean on `main`.
2. Bump versions across `package.json`, `src-tauri/tauri.conf.json`, and `src-tauri/Cargo.toml`.
3. Verify test suites: `pnpm typecheck && pnpm test && pnpm e2e`.
4. Commit: `git commit -m "chore(release): vX.Y.Z"`.
5. Tag: `git tag -a vX.Y.Z -m "LocalStacker vX.Y.Z"`.
6. Push commit and tag: `git push origin main --tags`.
7. The GitHub Actions release workflow builds the cross-platform matrix, signs updater artifacts, and creates a draft release on GitHub. Review and publish the release.

#### Required Repository Secrets
- `TAURI_SIGNING_PRIVATE_KEY`: Private minisign key generated via `pnpm tauri signer generate`.
- `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`: Passphrase protecting the private signing key.
- `APPLE_*` (optional): Set `APPLE_CERTIFICATE`, `APPLE_CERTIFICATE_PASSWORD`, `APPLE_SIGNING_IDENTITY`, `APPLE_ID`, `APPLE_PASSWORD`, `APPLE_TEAM` when an Apple Developer account is configured for notarization. If omitted, the workflow cleanly skips notarization and produces unsigned DMGs.

## Stack

Tauri 2 · React 19 · TypeScript · Tailwind CSS v4 · shadcn/ui · TanStack Query · TanStack Virtual · Zustand · AWS SDK v3 · Playwright · Vitest + Testing Library

## Documentation

- [`docs/plan.md`](docs/plan.md) — product plan, v1 feature contract, milestones, risks
- [`docs/decisions.md`](docs/decisions.md) — ADR-style log of foundational architectural decisions
