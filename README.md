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

### S3 Object Preview
![S3 Object Preview](docs/screenshots/s3-bucket.png)

### Lambda Invocation & Execution Logs
![Lambda Invocation](docs/screenshots/lambda-invoke.png)

## Status

**v1.0.0 shipped** ✅. All core milestones implemented and verified with end-to-end coverage:

| Milestone | Scope | Status |
|---|---|---|
| M0 | Scaffold, app shell, connection profiles, health badge | ✅ Done |
| M1 | S3 — buckets/objects, upload/download, presigned URLs | ✅ Done |
| M2 | SQS — send, peek, purge, DLQ redrive | ✅ Done |
| M3 | Lambda (invoke + logs) and Secrets Manager | ✅ Done |
| M4 | Hardening — Playwright e2e suite, release engineering, auto-updater, v1.0.0 | ✅ Done |

See [`docs/plan.md`](docs/plan.md) for the architecture and roadmap.

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

Tauri 2 · React 19 · TypeScript · Tailwind CSS v4 · shadcn/ui · TanStack Query · Zustand · AWS SDK v3 · Playwright · Vitest + Testing Library

## Documentation

- [`docs/plan.md`](docs/plan.md) — product plan, v1 feature contract, milestones, risks
- [`docs/decisions.md`](docs/decisions.md) — ADR-style log of foundational architectural decisions
