# Orchestration Core

`@aicompany/orchestration-core` contains provider-neutral task, workflow, session, scheduler, recovery, communication, approval, and telemetry contracts. Public exports are re-exported from `src/index.ts`; shared wire and persistence shapes come from `@aicompany/contracts`.

## Boundary and ports

The core owns decisions and asks adapters to perform effects. It does not call a model provider, create a VM, clone a repository, deploy an application, or run a production agent. The first track supplies in-memory implementations for tests and a PostgreSQL persistence adapter; the agent launcher and harness use deterministic simulations.

| Port | Contract and boundary | Idempotency / events |
| --- | --- | --- |
| `TaskRepository` | Read task by ID, list by workflow, save at an expected task version. | Save is optimistic-concurrency guarded. State changes are represented by domain events and should be committed with `TransactionalPersistence`, not as an independent write. |
| `EventStore` | Append a versioned event stream, read after a version, and test event ID existence. | Event IDs and `(aggregateId, aggregateVersion)` are unique. `append` requires the expected prior aggregate version. |
| `TransactionalPersistence` | Atomically save task + events + outbox commands; atomically save an approval request; atomically save an approval decision and optional task transition; acquire/release a dispatch claim. | Approval request/decision use idempotency key plus request fingerprint. Repeating the same operation returns its prior result; reusing a key with different data fails. Task writes require `expectedVersion`. |
| `Outbox` | Enqueue, lease a batch for a worker, and mark a command complete. | `commandId` is stable and unique. Consumers must be idempotent: a lease can expire and a command can be delivered again. Commands are `START_AGENT_SESSION`, `START_RECOVERY`, `REQUEST_APPROVAL`, or `DEPLOY`. |
| `AgentSessionLauncher` | `launch` starts/resolves a session; `stop` cleans it up. The core passes task/workflow/agent IDs, lease, session ID, idempotency key, and correlation ID. | Launcher must treat `idempotencyKey` as the stable session identity. Core verifies returned session ID and records `TASK_STARTED`; cleanup is attempted if persistence fails. |
| `CheckpointStore` | Save a checkpoint and read the latest checkpoint for a session. Checkpoints carry sequence, context reference, last event ID, and completed operation keys. | Sequence starts at 1 and advances exactly by one. Resume must honor completed operation keys to avoid repeating side effects. |
| `RecoveryCoordinator` / `RecoveryRecordStore` | Select a `RecoveryStrategy`, record attempts, complete recovery or escalate. | Failure fingerprints identify equivalent failures; a repeated fingerprint selects a different eligible strategy. At most five cycles are allowed, then `TASK_ESCALATED`. Implementations must make recovery IDs stable across retries. |
| `Communication` | Message, decision, and artifact records are scoped to project/workflow and checked by channel policy before access. | Message/decision IDs are caller-stable. Unauthorized cross-project reads or writes are rejected. The core emits corresponding domain events only where the event contract defines them; these in-memory records are not a durable message broker. |
| `ApprovalService` | Request/get/decide typed approval records. `CEOCommandService` accepts idempotent pause/resume/cancel commands. | Approval key + canonical request fingerprint; decisions also require expected approval version. Events: `APPROVAL_REQUESTED`, `APPROVAL_APPROVED`, `APPROVAL_REJECTED`. Deployment events: `DEPLOYMENT_APPROVAL_REQUESTED`, `DEPLOYMENT_APPROVED`, `DEPLOYMENT_REJECTED`; `DEPLOY` is queued only after approval. |
| `TraceSink`, `MetricsSink`, `CostSink` | Start/end spans, record counters/distributions, and record token/cost usage. Trace context carries workflow/task/session/correlation IDs. | Usage records use stable `usageId`; duplicate identical usage is safe and conflicting reuse is rejected. Current implementations are in-memory/no-op. No OpenTelemetry exporter or provider billing adapter is included. |

`DomainEvent` always carries event ID, aggregate type/ID/version, actor, correlation ID, causation ID, timestamp, typed payload. Event types include task lifecycle (`TASK_CREATED`, `TASK_READY`, `TASK_STARTED`, `TASK_PROGRESS`, `REVIEW_REQUESTED`, `ARTIFACT_CREATED`, `BLOCKED`, `TASK_FAILED`, `TASK_COMPLETED`, `TASK_CANCELLED`), recovery (`RECOVERY_STARTED`, `TASK_ESCALATED`), session lifecycle (`AGENT_SESSION_CREATED/STARTED/PAUSED/RESUMED/COMPLETED/FAILED/CANCELLED`), approval, and deployment result events. See `packages/contracts/src/events.ts` for the canonical discriminated union.

## Transaction and retry rules

Never split a business transition from its event or required command. `saveTaskAndAppend` commits task snapshot, event(s), and outbox command(s) together. Approval request commits its record, request event, and `REQUEST_APPROVAL` command together. Approval decision commits approval record/event and, for deployment, the task event and `DEPLOY` command in one operation. Dispatch claim is a separate lease operation performed before launcher I/O; the launcher call is outside the database transaction. If the process exits after launching but before persistence, the same session idempotency key is required on retry. A dispatch claim must be released only by its matching worker and lease.

The scheduler filters dependencies, capability and budget constraints, agent concurrency, and provider health before dispatch. Its fair queue chooses among eligible departments. `tick({ workflowId, capacity, workerId })` returns dispatch decisions; it does not wait for work completion. Recovery of one branch does not stop independent ready branches.

## Request / response examples

Examples show boundary shapes; IDs and timestamps are illustrative.

**Dispatch:** scheduler input `{ workflowId: 'wf-7', capacity: 1, workerId: 'scheduler-a' }` returns `[{ taskId: 'task-42', agentDefinitionId: 'agent-ts', leaseId: 'lease-9', expiresAt: Date, correlationId: 'trace-7' }]`. The launcher receives `{ taskId, workflowId, agentDefinitionId, leaseId, sessionId, idempotencyKey: sessionId, correlationId }`.

**Checkpoint:** save `{ sessionId: 'session-42', taskId: 'task-42', sequence: 2, state: 'PAUSED', contextReference: 'snapshot://task-42/2', lastEventId: 'event-42', completedOperationKeys: ['git:commit:abc'], createdAt: Date }`; response is `void`. `latest(sessionId)` returns this record or `null`.

**Recovery:** `start({ taskId: 'task-42', failure: { taskId: 'task-42', attemptId: 'session-42', errorClass: 'ToolError', commandName: 'RUN_TESTS', message: 'timeout', evidenceIds: [] }, actor, correlationId: 'trace-7' })` returns a recovery record with recovery ID, cycle, fingerprint, selected plan, state, and evidence IDs. Cycle five is the limit; an exhausted task escalates.

**Deployment approval:** request `{ subjectType: 'DEPLOYMENT', subjectId: 'task-release-3', reason: 'Release staging build', requestedBy: actor, correlationId: 'trace-release', idempotencyKey: 'approval-request:release-3' }` returns a `PENDING` approval record. A later decision `{ approvalId, decision: 'APPROVE', actor, reason: 'Checks reviewed', expectedVersion: 0, idempotencyKey: 'approval-decision:release-3' }` returns `APPROVED`; only then may the atomic decision transaction emit `DEPLOYMENT_APPROVED` and enqueue `DEPLOY`.

## Verification

Run from the monorepo root:

```powershell
corepack pnpm install --frozen-lockfile
corepack pnpm typecheck
corepack pnpm lint
corepack pnpm test
corepack pnpm --filter @aicompany/orchestration-harness test
```

The root suite includes deterministic unit tests and the simulated orchestration/recovery scenarios. Harness acceptance requires 50 unique first-wave dispatches from 60 tasks, all 60 completed after approval, one deploy command, trace and usage records, 60 artifact/checkpoint/evidence records, and no escalation on the successful workflow. The intentional failure scenario repeats a stable failure, changes strategy on retry, escalates at cycle five, and leaves the independent branch completed while its dependent remains pending.

For PostgreSQL, copy `infra/postgres/.env.example` to `infra/postgres/.env`, then run `docker compose --env-file infra/postgres/.env -f infra/postgres/compose.yaml up -d --wait`. Apply the migration with `corepack pnpm --filter @aicompany/persistence-postgres exec node -e "const { readFileSync } = require('node:fs'); const { Pool } = require('pg'); const p = new Pool({ connectionString: process.env.DATABASE_URL }); p.query(readFileSync('migrations/001_orchestration.sql', 'utf8')).then(() => p.end()).catch(async e => { console.error(e); await p.end(); process.exitCode = 1; });"` after setting `DATABASE_URL=postgresql://aicompany:aicompany_local_only@127.0.0.1:5432/aicompany` in the invoking PowerShell session. Run integration cases with `corepack pnpm --filter @aicompany/persistence-postgres exec vitest run --config vitest.config.ts src/postgres-store.integration.test.ts` while that variable is set. Without `DATABASE_URL` (or `POSTGRES_TESTCONTAINERS=1`), those cases are intentionally skipped; a green default suite is not PostgreSQL integration evidence.

## Scope and follow-ups

This track does not implement a persistent project VM/tool runner, a model gateway or real model health/routing, GitHub/GitLab or deployment targets, durable memory/knowledge ACLs, Mission Grid/Graphite Signal, or language-specific toolchain profiles. The launcher, communication stores, traces, metrics, costs, recovery records, and checkpoints have no production adapter here. Follow-up plans are required for execution plane; Model Gateway; source/deployment adapters; memory and knowledge; Mission Grid; and JavaScript/TypeScript, Python, .NET, and Java toolchain profiles.
