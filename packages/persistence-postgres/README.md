# PostgreSQL Persistence Adapter

`@aicompany/persistence-postgres` implements the orchestration core's PostgreSQL persistence ports with `pg`. It exports `PostgresStore`, `PostgresTaskRepository`, and `PostgresOutbox`; schema is in `migrations/001_orchestration.sql`. The adapter is not a migration runner or a production deployment service. Construct it with a configured `pg.Pool`, apply migrations through deployment tooling, and close `PostgresStore` when its owning process shuts down.

## Port mapping

| Adapter | Core port | Behavior |
| --- | --- | --- |
| `PostgresStore` | `EventStore`, `TransactionalPersistence` | Version-checked task snapshot + event + outbox writes; approval request and decision transactions; dispatch claims; event stream reads. |
| `PostgresTaskRepository` | `TaskRepository` | Task lookup/list/save with expected-version checks. |
| `PostgresOutbox` | `Outbox` | Durable enqueue, leased claims, and completion marking. Expired claims can be reclaimed. |

Task versions are compare-and-set: a stale `expectedVersion` raises `OptimisticConcurrencyError`. Event identity and aggregate version are unique. Event payloads and records are validated against shared contracts before persistence. A duplicate identity with different content is rejected.

## Atomicity and idempotency

`saveTaskAndAppend` runs the task snapshot update/insert, event append, and outbox command inserts on one client transaction. A mismatch in task version, duplicate event, invalid command, or failed insert rolls back all three. `saveApprovalRequest` atomically stores the pending approval, `APPROVAL_REQUESTED`, and its `REQUEST_APPROVAL` command. `saveApprovalDecisionAndTask` atomically records the decision and approval event, optional deployment task transition/event, and associated command. The approval request and decision keys are persisted with request fingerprints: same key + same fingerprint replays the stored result; same key + different fingerprint is rejected.

Dispatch claim acquisition is its own short transaction. It only claims a matching `READY` task version, and the task ID and lease ID uniqueness prevent concurrent duplicate claims. Release requires matching worker and lease. External launcher calls must happen outside SQL transactions and use the persisted session ID as their idempotency key.

Outbox command IDs are unique. Claiming uses a lease, so delivery is at least once: consumers must deduplicate by `commandId` (and use operation-specific idempotency keys). Marking complete is idempotent for an already completed command. Do not assume a database transaction can atomically include a provider, VM, Git host, or deployment target.

The schema stores workflows, tasks, sessions, dispatch claims, domain events, outbox commands, and approvals. Session/checkpoint tables exist in the initial schema, but this package does not export a session/checkpoint repository yet. Recovery records, messages, decision records, spans, metrics, and usage/cost records also have no PostgreSQL adapter in this track.

## Local PostgreSQL and tests

From the monorepo root in PowerShell:

```powershell
Copy-Item infra/postgres/.env.example infra/postgres/.env
docker compose --env-file infra/postgres/.env -f infra/postgres/compose.yaml up -d --wait
$env:DATABASE_URL = 'postgresql://aicompany:aicompany_local_only@127.0.0.1:5432/aicompany'
corepack pnpm --filter @aicompany/persistence-postgres exec node -e "const { readFileSync } = require('node:fs'); const { Pool } = require('pg'); const p = new Pool({ connectionString: process.env.DATABASE_URL }); p.query(readFileSync('migrations/001_orchestration.sql', 'utf8')).then(() => p.end()).catch(async e => { console.error(e); await p.end(); process.exitCode = 1; });"
corepack pnpm --filter @aicompany/persistence-postgres exec vitest run --config vitest.config.ts src/postgres-store.integration.test.ts
```

`infra/postgres/.env` is local-only and ignored; use a non-local secret for any shared environment. Integration tests execute only when `DATABASE_URL` or `POSTGRES_TESTCONTAINERS` is present. Otherwise Vitest marks that suite skipped by design. Do not report that skip as a passing PostgreSQL integration check.

Standard checks from the monorepo root:

```powershell
corepack pnpm install --frozen-lockfile
corepack pnpm --filter @aicompany/persistence-postgres test
corepack pnpm typecheck
corepack pnpm lint
corepack pnpm test
```

The adapter tests assert optimistic concurrency, transactional rollback, event/outbox uniqueness, approval idempotency, dispatch claim exclusivity, and outbox leasing. A live integration pass additionally requires PostgreSQL reachable through `DATABASE_URL` and the migration applied. Full local compose lifecycle cleanup: `docker compose --env-file infra/postgres/.env -f infra/postgres/compose.yaml down` (add `-v` only when intentionally deleting local database data).
