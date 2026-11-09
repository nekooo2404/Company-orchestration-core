# Local Production App Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Turn AIcompany into a restart-safe local production app where CEO commands run from PowerShell and Mission Grid only observes live state.

**Architecture:** Keep `127.0.0.1` as the trust boundary. Control Plane accepts CEO terminal requests, persists missions/tasks in PostgreSQL, and exposes read-only telemetry endpoints. Scheduler, model gateway, execution plane, and deployment adapters remain explicit services behind ports; no IdP is required in local single-CEO mode.

**Tech Stack:** TypeScript, Node.js, PostgreSQL, `pg`, Next.js, React, TailwindCSS, Vitest, Docker.

**Spec:** `docs/superpowers/specs/2026-11-08-ai-company-design.md`

## Global Constraints

- CEO command authority stays in terminal; Mission Grid is read-only.
- Local API binds to `127.0.0.1`; remote auth is a later deployment profile.
- All mission submit requests use idempotency keys and parameterized SQL.
- No secrets enter source, prompts, logs, or committed environment files.
- PostgreSQL integration must remain explicitly gated when Docker/database is unavailable.

### Task 1: Durable Mission Store

**Files:**
- Modify: `packages/control-plane/src/types.ts`
- Create: `packages/control-plane/src/postgres-mission-store.ts`
- Modify: `packages/control-plane/src/service.ts`
- Modify: `packages/control-plane/src/control-plane.test.ts`
- Modify: `packages/persistence-postgres/migrations/001_orchestration.sql`

- [ ] Add durable idempotency methods to `MissionStore`.
- [ ] Add failing restart/idempotency test.
- [ ] Implement parameterized PostgreSQL mission persistence.
- [ ] Run control-plane tests.

Status: completed. PostgreSQL mission upsert/idempotency and model endpoint persistence are implemented; live mission smoke passed.

### Task 2: Local Server Wiring

**Files:**
- Modify: `apps/control-plane-server/server.mjs`
- Modify: `apps/control-plane-server/server.mjs` migration startup
- Create: `packages/control-plane/src/postgres-mission-store.test.ts`

- [ ] Select PostgreSQL when `DATABASE_URL` exists.
- [ ] Apply checked-in migration before accepting requests.
- [ ] Fail closed when production mode has no database URL.
- [ ] Verify root, health, submit, list, and status endpoints.

Status: completed. Server applies migration in PostgreSQL mode and exposes model endpoint configuration.

### Task 3: Runtime Execution

**Files:**
- Create: `apps/local-worker/worker.mjs`
- Modify: `packages/control-plane/src/service.ts`
- Test: worker dispatch/recovery integration

- [ ] Consume pending missions through the durable scheduler.
- [ ] Route model calls through `OpenAICompatibleGateway`.
- [ ] Route commands through `DockerToolRunner`.
- [ ] Persist task/session/checkpoint transitions.

Status: completed for local Ollama + Docker path. Worker consumes PostgreSQL mission tasks, calls `OpenAICompatibleGateway`, runs `DockerToolRunner`, and persists completion/recovery state.

### Task 4: Production Safety Gate

**Files:**
- Create: `infra/local-production/compose.yaml`
- Create: `infra/local-production/.env.example`
- Create: `docs/superpowers/sdd/2026-11-10-local-production-report.md`

- [ ] Add PostgreSQL health, backup, restore, and restart checks.
- [ ] Add security scan and failure-injection commands.
- [ ] Run clean-checkout verification.
- [ ] Request independent diff review.

