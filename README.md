# LocalStacker

A local-first, zero-account desktop GUI for [LocalStack](https://localstack.cloud) —
browse and operate your local AWS resources without reaching for the CLI.

> Community project. **Not affiliated with LocalStack GmbH.**

## Why

- The official LocalStack Console requires sign-in and is cloud-connected.
  LocalStacker talks straight to `localhost:4566` — no accounts, no telemetry.
- Community GUIs in this space are web-server based, stale, or single-service.
  LocalStacker aims for a "TablePlus for local AWS" bar: native, fast, keyboard-driven.

## Status

Pre-alpha — milestone M0 (app shell) in flight. Roadmap from [`docs/plan.md`](docs/plan.md):

| Milestone | Scope | Status |
|---|---|---|
| M0 | Scaffold, app shell, connection profiles, health badge | In progress |
| M1 | S3 — buckets/objects, upload/download, presigned URLs | Planned |
| M2 | SQS — send, peek, purge, DLQ redrive | Planned |
| M3 | Lambda (invoke + logs) and Secrets Manager | Planned |
| M4 | Hardening — e2e, notarization, auto-updater | Planned |

## Planned v1 — daily-driver tier

| Service | Highlights |
|---|---|
| **S3** | Folder-style browsing with previews, drag & drop upload, download, presigned URLs |
| **SQS** | Queue depth & DLQ badges, send with JSON editor, **peek without consuming**, purge, redrive |
| **Secrets Manager** | List, reveal, create/update, delete (requires a LocalStack auth token — Hobby+) |
| **Lambda** | Invoke with test payload → response + duration + logs, edit env vars |

## Development

Prerequisites: Node 20+, pnpm, Rust toolchain.

```sh
pnpm install
pnpm tauri dev
```

Point it at a running LocalStack:

```sh
docker run --rm -p 4566:4566 localstack/localstack
```

### Scripts

| Command | Purpose |
|---|---|
| `pnpm tauri dev` | Run the desktop app with hot reload |
| `pnpm tauri build` | Build installers (dmg / msi / AppImage) |
| `pnpm dev` | Frontend only, in a browser |
| `pnpm typecheck` | `tsc --noEmit` |
| `pnpm test` | Vitest suite |

## Stack

Tauri 2 · React 19 · TypeScript · Tailwind CSS v4 · shadcn/ui · TanStack Query ·
Zustand · AWS SDK v3 · Vitest + Testing Library

## Documentation

- [`docs/plan.md`](docs/plan.md) — product plan, v1 feature contract, milestones, risks
- [`docs/decisions.md`](docs/decisions.md) — ADR-style log of the foundational decisions
