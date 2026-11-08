# Orchestration Core: Track 1 Verification

## Purpose

Record the public orchestration boundary and the evidence required to call the first track verified. Tasks 1-11 are represented by approved commit `396db0b`; this plan documents and verifies that implementation without promoting simulated adapters to production claims.

## Public contracts

Next subsystems consume `@aicompany/contracts` and the exported ports in `@aicompany/orchestration-core`. They should depend on task/event/approval records, `TaskRepository`, `EventStore`, `TransactionalPersistence`, `Outbox`, `AgentSessionLauncher`, `CheckpointStore`, `RecoveryCoordinator`, and telemetry sinks. They should not import orchestration implementation internals.

`saveTaskAndAppend` is the task snapshot + event(s) + command(s) transaction. Approval request and decision methods define their own atomic units, including deployment task transition and `DEPLOY` command after approval. Dispatch claims are lease transactions; external calls are outside transactions and must use stable idempotency keys. Event IDs, aggregate versions, command IDs, expected versions, and approval fingerprints protect retries and concurrency.

The event envelope includes actor, correlation, causation, aggregate version, and timestamp. Canonical event names and payload schemas are the `DomainEvent` union in `packages/contracts/src/events.ts`; task, session, approval, recovery, and deployment names are enumerated in the orchestration core README.

## Verification commands

Run from `Code/AIcompany`:

```powershell
corepack pnpm install --frozen-lockfile
corepack pnpm typecheck
corepack pnpm lint
corepack pnpm test
```

These are the task's final checks. Focused checks are:

```powershell
corepack pnpm --filter @aicompany/orchestration-core test
corepack pnpm --filter @aicompany/persistence-postgres test
corepack pnpm --filter @aicompany/orchestration-harness test
```

The harness test is the simulated 50-agent end-to-end verification. Acceptance: first dispatch contains 50 unique tasks from a 60-task workflow; all 60 complete; deployment stays `WAITING_FOR_APPROVAL` until an idempotent approval decision, then one deploy command is emitted and deployment completes; usage, trace, artifact, checkpoint, evidence, review, and test records are present. The companion failure scenario is intentional: one retry changes strategy for the same failure fingerprint; the fifth cycle escalates that task; an independent branch completes while the dependent branch remains pending.

## PostgreSQL gate

Local setup from repository root (PowerShell):

```powershell
Copy-Item infra/postgres/.env.example infra/postgres/.env
docker compose --env-file infra/postgres/.env -f infra/postgres/compose.yaml up -d --wait
$env:DATABASE_URL = 'postgresql://aicompany:aicompany_local_only@127.0.0.1:5432/aicompany'
corepack pnpm --filter @aicompany/persistence-postgres exec node -e "const { readFileSync } = require('node:fs'); const { Pool } = require('pg'); const p = new Pool({ connectionString: process.env.DATABASE_URL }); p.query(readFileSync('migrations/001_orchestration.sql', 'utf8')).then(() => p.end()).catch(async e => { console.error(e); await p.end(); process.exitCode = 1; });"
corepack pnpm --filter @aicompany/persistence-postgres exec vitest run --config vitest.config.ts src/postgres-store.integration.test.ts
```

The `Copy-Item` step creates the ignored local environment file from the checked-in example; never commit `infra/postgres/.env` or replace its local-only password in a shared environment.

The integration suite is gated on `DATABASE_URL` or `POSTGRES_TESTCONTAINERS`; absent either setting, it is skipped. Record that outcome as **GATED/SKIPPED**, not passed. The schema and adapter tests cover SQL behavior, but only the enabled integration suite proves runtime interaction with PostgreSQL. Stop local PostgreSQL with `docker compose --env-file infra/postgres/.env -f infra/postgres/compose.yaml down` when finished.

## Track 1 completion evidence

| Criterion | Evidence / status |
| --- | --- |
| Clean frozen-lockfile install | Final `corepack pnpm install --frozen-lockfile` result. |
| Task transitions and dependency-cycle rejection | Core state-machine and task-graph unit tests. |
| Optimistic concurrency and atomic state/event/outbox; outbox idempotency | Persistence unit tests; live PostgreSQL integration remains gated unless explicitly enabled. |
| Fair scheduling of 50+ tasks without duplicates | Scheduler tests and 50-agent harness first-wave assertions. |
| Session checkpoint and resume | Core checkpoint/session lifecycle tests; production snapshot storage is a follow-up. |
| Scoped communication access | Communication/channel-policy tests; durable cross-process storage is not implemented. |
| Recovery strategy change, five-cycle cap, independent branches | Recovery unit tests and intentional-failure harness scenario. |
| Idempotent CEO commands and deployment approvals | Approval and CEO command unit tests; deployment harness asserts approval gate and one deploy command. |
| End-to-end traces and cost records | Simulated harness assertions only; production exporters and billing sources are follow-ups. |
| 50-agent simulated scenario | Harness test results. This is not evidence of 50 live model agents. |
| Consumer-facing port docs | Review the two package README files against exported contracts. |

Track 1 should not be called production-ready based on this evidence. No persistent execution VM/tool runner, real model gateway, source/deployment provider, durable memory, Mission Grid, language-specific toolchain adapters, or production telemetry/cost backend is part of this track.

## Follow-up plans

1. Execution plane: persistent project VM, tool runner, snapshots, and quotas.
2. Model Gateway: custom `base_url`, platform/BYOK credentials, routing, health, limits, and cost.
3. Source/deployment adapters: internal workspace, GitHub/GitLab, staging, and cloud targets.
4. Memory and knowledge: private/project/company scopes, ACLs, provenance, and promotion.
5. Mission Grid: Graphite Signal control room, contextual chat, and CEO commands.
6. Toolchain profiles: JavaScript/TypeScript, Python, .NET, and Java adapters.
