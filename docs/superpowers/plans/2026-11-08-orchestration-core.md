# Orchestration Core Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox syntax for tracking.

**Goal:** Build the durable orchestration kernel that turns one normalized software brief into a dependency-aware workflow with 50+ independent agent sessions, scoped communication, bounded recovery and CEO deployment approval.

**Architecture:** Use a TypeScript monorepo with a framework-free domain package, explicit ports for persistence, queues and session launchers, and a PostgreSQL adapter for transactional workflow state plus append-only events. The first deliverable uses simulated agent workers so orchestration behavior is tested without a model provider, project VM or UI; those systems integrate through the ports in later plans.

**Tech Stack:** Node.js LTS, TypeScript, pnpm via Corepack, PostgreSQL, node-postgres, Zod for runtime contract validation, and Vitest for unit/integration tests.

**Spec:** docs/superpowers/specs/2026-11-08-ai-company-design.md

## Global Constraints

- Cloud SaaS for one CEO account in the MVP; no team accounts or public multi-tenancy.
- The scheduler must support 50+ active independent LLM agent sessions for one project workflow.
- BLOCKED and FAILED start automatic recovery; each task gets at most five recovery cycles before escalation.
- Routine workflow execution is automatic; permission escalation, security risk and deployment require CEO approval.
- Merge is automatic only after required review, test and security evidence; deployment always pauses for CEO approval.
- Communication uses hierarchy for assignment and scoped peer channels for task/project collaboration.
- Memory and security integrations consume ports defined by this plan; raw provider keys must never reach an agent session.
- The orchestration core must not assume a specific LLM provider, repository provider, project language or UI framework.
- Every state transition, command, event, recovery attempt and approval must be traceable with actor, timestamp, correlation ID and causation ID.
- All task and event writes must be idempotent or protected by optimistic version checks.

## Plan Scope

This plan covers Track 1 from the spec: the orchestration core. It excludes the persistent project VM, Model Gateway implementation, memory index, Git providers, deployment runners and Mission Grid UI. Those systems implement the ports created here in separate plans.

The repository currently contains the approved design spec but no application source. The first task bootstraps the monorepo. Generated visual companion files under .superpowers/ are not source inputs and must remain ignored.

---

### Task 1: Bootstrap the TypeScript workspace and test harness

**Files:**

- Create: package.json
- Create: pnpm-workspace.yaml
- Create: tsconfig.base.json
- Create: tsconfig.json
- Create: .gitignore
- Create: eslint.config.mjs
- Create: vitest.config.ts
- Create: packages/contracts/package.json
- Create: packages/contracts/tsconfig.json
- Create: packages/contracts/src/index.ts
- Create: packages/orchestration-core/package.json
- Create: packages/orchestration-core/tsconfig.json
- Create: packages/orchestration-core/src/index.ts
- Test: packages/contracts/src/index.test.ts

**Interfaces:**

- Produces workspace package names @aicompany/contracts and @aicompany/orchestration-core.
- Produces root commands corepack pnpm test, corepack pnpm typecheck and corepack pnpm lint.

- [ ] **Step 1: Write the root workspace manifest**

Create a private root package with scripts that run all package tests and TypeScript checks. Configure the package manager through Corepack rather than assuming a global pnpm binary.

~~~json
{
  "name": "ai-company",
  "private": true,
  "scripts": {
    "test": "vitest run",
    "test:watch": "vitest",
    "typecheck": "tsc -b",
    "lint": "eslint ."
  },
  "devDependencies": {
    "@eslint/js": "^9.0.0",
    "@types/node": "^22.0.0",
    "eslint": "^9.0.0",
    "typescript": "^5.0.0",
    "typescript-eslint": "^8.0.0",
    "vitest": "^2.0.0"
  }
}
~~~

- [ ] **Step 2: Define workspace, compiler and lint boundaries**

Set packages/* as the pnpm workspace. Use strict TypeScript, ESM, declaration output, no implicit any, exact optional properties and project references. Add a root tsconfig.json with references to both initial packages. Add eslint.config.mjs using the ESLint recommended rules and typescript-eslint recommended rules. Keep package source under src and tests next to the source until the repository grows enough to justify a separate test tree.

The root project-reference file must start as:

~~~json
{
  "files": [],
  "references": [
    { "path": "./packages/contracts" },
    { "path": "./packages/orchestration-core" }
  ]
}
~~~

The root lint config must start as:

~~~js
import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['node_modules/**', 'dist/**', 'coverage/**', '.superpowers/**'] },
  eslint.configs.recommended,
  ...tseslint.configs.recommended
);
~~~

- [ ] **Step 3: Add initial package manifests**

Make @aicompany/contracts depend only on zod. Make @aicompany/orchestration-core depend on @aicompany/contracts. Both packages expose build, test and typecheck scripts.

- [ ] **Step 4: Add the initial test**

Create a test that imports the contracts package and asserts that the package can be loaded. This is a smoke test for workspace resolution, not a product behavior test.

~~~ts
import { describe, expect, it } from 'vitest';

describe('workspace bootstrap', () => {
  it('loads the contracts package', async () => {
    const contracts = await import('./index');
    expect(contracts).toBeDefined();
  });
});
~~~

- [ ] **Step 5: Add repository ignores**

Ignore node_modules, build output, coverage, local environment files, PostgreSQL volumes and .superpowers/. Do not modify the parent repository ignore file.

- [ ] **Step 6: Install and verify the empty workspace**

Run:

~~~text
corepack pnpm install
corepack pnpm typecheck
corepack pnpm test
~~~

Expected: dependency installation succeeds, TypeScript exits with code 0 and the bootstrap test passes.

- [ ] **Step 7: Commit the bootstrap**

~~~text
git add package.json pnpm-workspace.yaml tsconfig.base.json tsconfig.json .gitignore eslint.config.mjs vitest.config.ts packages
git commit -m "build: bootstrap orchestration workspace"
~~~

### Task 2: Define shared IDs, state, commands and event contracts

**Files:**

- Create: packages/contracts/src/ids.ts
- Create: packages/contracts/src/task.ts
- Create: packages/contracts/src/agent.ts
- Create: packages/contracts/src/events.ts
- Create: packages/contracts/src/approval.ts
- Create: packages/contracts/src/errors.ts
- Modify: packages/contracts/src/index.ts
- Test: packages/contracts/src/contracts.test.ts

**Interfaces:**

- Produces branded WorkflowId, TaskId, AgentDefinitionId, AgentSessionId, EventId, ApprovalId and CorrelationId.
- Produces ActorRef for CEO, agent and system actors.
- Produces TaskState, AgentSessionState, ApprovalState and EventType unions.
- Produces Zod schemas and inferred TypeScript types for tasks, agent sessions, events and approvals.
- Is consumed by every later orchestration package; names in this task are canonical.

- [ ] **Step 1: Write failing contract tests**

Cover state values, branded ID factory behavior, valid task parsing, invalid task rejection and event envelope parsing. Assert that a task with a negative budget, empty output contract or unknown state is rejected.

~~~ts
it('rejects a task with a negative budget', () => {
  const result = TaskSchema.safeParse({
    id: taskId('task-1'),
    workflowId: workflowId('workflow-1'),
    state: 'READY',
    dependencyIds: [],
    requiredCapabilities: ['repo.read'],
    outputContract: 'test report',
    budget: { maxTokens: -1, maxCostUsd: 1 },
    recoveryCycles: 0,
    version: 0,
    createdAt: new Date(),
    updatedAt: new Date()
  });

  expect(result.success).toBe(false);
});
~~~

- [ ] **Step 2: Implement branded ID factories**

Use a string brand for compile-time separation and a factory that rejects empty values. Do not encode database UUID generation into the contracts package; inject ID generation in the core.

~~~ts
export type WorkflowId = string & { readonly __brand: 'WorkflowId' };
export const workflowId = (value: string): WorkflowId => {
  if (value.length === 0) throw new Error('WorkflowId cannot be empty');
  return value as WorkflowId;
};
~~~

- [ ] **Step 3: Implement task and session contracts**

Define task states exactly as:

~~~ts
export type TaskState =
  | 'PENDING'
  | 'READY'
  | 'RUNNING'
  | 'REVIEW'
  | 'COMPLETED'
  | 'BLOCKED'
  | 'RECOVERING'
  | 'FAILED'
  | 'ESCALATED_TO_CEO'
  | 'CANCELLED'
  | 'WAITING_FOR_APPROVAL';
~~~

Define Task, AgentDefinition, AgentSession, TaskBudget, OutputContract and CapabilityRequirement with the fields used by the spec. Include version and updatedAt on mutable aggregates.

- [ ] **Step 4: Implement event and approval envelopes**

Define an append-only DomainEvent with eventId, aggregateType, aggregateId, aggregateVersion, eventType, actor, correlationId, causationId, occurredAt and a validated payload. Define approval records with approvalId, subjectType, subjectId, reason, requestedBy, state, decision and decidedBy.

- [ ] **Step 5: Export contracts and run tests**

Export only public schemas, types and factories from packages/contracts/src/index.ts. Run:

~~~text
corepack pnpm --filter @aicompany/contracts test
corepack pnpm typecheck
~~~

Expected: all contract tests pass and no package imports internal files from another package.

- [ ] **Step 6: Commit the contracts**

~~~text
git add packages/contracts
git commit -m "feat: define orchestration contracts"
~~~

### Task 3: Implement the task state machine and dependency graph

**Files:**

- Create: packages/orchestration-core/src/task-state-machine.ts
- Create: packages/orchestration-core/src/task-graph.ts
- Create: packages/orchestration-core/src/domain-errors.ts
- Modify: packages/orchestration-core/src/index.ts
- Test: packages/orchestration-core/src/task-state-machine.test.ts
- Test: packages/orchestration-core/src/task-graph.test.ts

**Interfaces:**

- Consumes contracts from @aicompany/contracts.
- Produces:

~~~ts
export type TaskTransition =
  | { type: 'TASK_READY' }
  | { type: 'TASK_STARTED'; sessionId: AgentSessionId }
  | { type: 'TASK_REVIEW_REQUESTED' }
  | { type: 'TASK_COMPLETED'; evidenceIds: string[] }
  | { type: 'TASK_BLOCKED'; reason: string }
  | { type: 'TASK_FAILED'; failureFingerprint: string }
  | { type: 'RECOVERY_STARTED'; recoveryId: string }
  | { type: 'TASK_ESCALATED'; reason: string }
  | { type: 'TASK_CANCELLED'; reason: string }
  | { type: 'APPROVAL_REQUESTED'; approvalId: ApprovalId };

export interface TransitionContext {
  actor: ActorRef;
  now: Date;
  evidenceIds: string[];
  isDeployment: boolean;
}

export interface TransitionResult {
  task: Task;
  event: DomainEvent;
}

export function transitionTask(
  task: Task,
  transition: TaskTransition,
  context: TransitionContext
): TransitionResult;

export function findReadyTasks(
  tasks: readonly Task[],
  completedTaskIds: ReadonlySet<TaskId>
): Task[];
~~~

- [ ] **Step 1: Write state transition tests**

Cover valid transitions, invalid transitions, evidence requirements and version increments. Test that RUNNING cannot become COMPLETED without evidence, FAILED can enter RECOVERING, the fifth recovery cycle can escalate, and a deployment task enters WAITING_FOR_APPROVAL instead of completing.

- [ ] **Step 2: Implement the transition table**

Use an explicit transition map and a single transitionTask function. Reject transitions not in the map with a typed InvalidTaskTransitionError. The function must return a new immutable task and a domain event descriptor; it must not write to storage.

- [ ] **Step 3: Write dependency graph tests**

Cover tasks with no dependencies, tasks whose dependencies are all complete, tasks with incomplete dependencies, missing dependency IDs and cycles. A cyclic graph must be rejected when a workflow is created; it must never be silently scheduled.

- [ ] **Step 4: Implement graph validation and readiness**

Implement cycle detection with a DFS or Kahn traversal. findReadyTasks returns only tasks in PENDING whose dependencies are all COMPLETED; tasks in any other state are excluded. Sort ready tasks by priority, creation time and task ID for deterministic scheduling.

- [ ] **Step 5: Run focused tests**

~~~text
corepack pnpm --filter @aicompany/orchestration-core test -- task-state-machine.test.ts task-graph.test.ts
~~~

Expected: all transition and graph tests pass, including invalid transition and cycle cases.

- [ ] **Step 6: Commit the domain state machine**

~~~text
git add packages/orchestration-core
git commit -m "feat: add task state machine and dependency graph"
~~~

### Task 4: Add durable event-store and repository ports

**Files:**

- Create: packages/orchestration-core/src/ports.ts
- Create: packages/orchestration-core/src/repository.ts
- Create: packages/orchestration-core/src/test-support/inmemory-store.ts
- Create: packages/persistence-postgres/package.json
- Create: packages/persistence-postgres/tsconfig.json
- Create: packages/persistence-postgres/src/index.ts
- Create: packages/persistence-postgres/src/postgres-store.ts
- Create: packages/persistence-postgres/src/postgres-repositories.ts
- Create: packages/persistence-postgres/migrations/001_orchestration.sql
- Create: infra/postgres/compose.yaml
- Modify: tsconfig.json
- Test: packages/orchestration-core/src/inmemory-store.test.ts
- Test: packages/persistence-postgres/src/postgres-store.integration.test.ts

**Interfaces:**

- Produces ports consumed by scheduler, recovery and approval services:

~~~ts
export interface EventStore {
  append(events: readonly DomainEvent[], expectedVersion: number): Promise<void>;
  readStream(aggregateId: string, afterVersion?: number): Promise<DomainEvent[]>;
  hasEvent(eventId: EventId): Promise<boolean>;
}

export interface TaskRepository {
  get(taskId: TaskId): Promise<Task | null>;
  listByWorkflow(workflowId: WorkflowId): Promise<Task[]>;
  save(task: Task, expectedVersion: number): Promise<void>;
}

export interface OutboxCommand {
  commandId: string;
  type: 'START_AGENT_SESSION' | 'START_RECOVERY' | 'REQUEST_APPROVAL' | 'DEPLOY';
  payload: Record<string, unknown>;
  availableAt: Date;
}

export interface Outbox {
  enqueue(command: OutboxCommand): Promise<void>;
  claim(limit: number, workerId: string): Promise<OutboxCommand[]>;
  markCompleted(commandId: string): Promise<void>;
}
~~~

- [ ] **Step 1: Write in-memory repository tests**

Test append ordering, optimistic concurrency, duplicate event IDs, stream reads and task version conflicts. The in-memory implementation is only a deterministic test adapter; it must enforce the same invariants as PostgreSQL.

- [ ] **Step 2: Implement core ports and in-memory adapters**

Implement InMemoryEventStore, InMemoryTaskRepository and InMemoryOutbox in orchestration-core test support. Use a Map per aggregate and reject an append when expectedVersion does not match.

- [ ] **Step 3: Write the PostgreSQL schema and package dependencies**

Create tables for workflows, tasks, agent_sessions, domain_events, outbox_commands and approvals. Enforce:

- unique aggregate_id plus aggregate_version on domain events;
- unique event_id;
- unique task_id;
- task version for optimistic concurrency;
- outbox available_at, claimed_by, claimed_at and completed_at;
- timestamps in UTC.

Add pg as a runtime dependency and testcontainers as an integration-test dependency. Add the PostgreSQL package reference to the root tsconfig.json.

The event and task tables must have the following minimum shape:

~~~sql
CREATE TABLE domain_events (
  event_id text PRIMARY KEY,
  aggregate_id text NOT NULL,
  aggregate_version integer NOT NULL,
  event_type text NOT NULL,
  payload jsonb NOT NULL,
  actor jsonb NOT NULL,
  correlation_id text NOT NULL,
  causation_id text,
  occurred_at timestamptz NOT NULL
);

CREATE UNIQUE INDEX domain_events_aggregate_version
  ON domain_events (aggregate_id, aggregate_version);

CREATE TABLE tasks (
  task_id text PRIMARY KEY,
  workflow_id text NOT NULL,
  state text NOT NULL,
  dependency_ids jsonb NOT NULL,
  recovery_cycles integer NOT NULL DEFAULT 0,
  version integer NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL
);

CREATE TABLE outbox_commands (
  command_id text PRIMARY KEY,
  command_type text NOT NULL,
  payload jsonb NOT NULL,
  available_at timestamptz NOT NULL,
  claimed_by text,
  claimed_at timestamptz,
  completed_at timestamptz
);
~~~

- [ ] **Step 4: Implement transactional PostgreSQL writes**

Use one database transaction for task update, event append and outbox enqueue. A version conflict must roll back all three writes. append must be idempotent for a previously stored eventId and must reject a different payload with the same ID.

- [ ] **Step 5: Add local PostgreSQL compose configuration**

Provide a local PostgreSQL service with a named volume, health check and a non-production password supplied through an environment file. The compose file must not contain real credentials.

- [ ] **Step 6: Write integration tests**

Run the schema against PostgreSQL and test concurrent version updates, event ordering, outbox claiming by two workers and claim recovery after a stale lease. The test must fail if two workers receive the same uncompleted command.

- [ ] **Step 7: Run persistence verification**

~~~text
corepack pnpm --filter @aicompany/persistence-postgres test
corepack pnpm typecheck
~~~

Expected: unit tests pass without PostgreSQL and integration tests pass when the local service is healthy.

- [ ] **Step 8: Commit durable persistence**

~~~text
git add packages/orchestration-core packages/persistence-postgres infra/postgres
git commit -m "feat: add durable orchestration persistence"
~~~

### Task 5: Implement fair scheduling and 50+ dispatch

**Files:**

- Create: packages/orchestration-core/src/scheduler.ts
- Create: packages/orchestration-core/src/fair-queue.ts
- Create: packages/orchestration-core/src/leases.ts
- Create: packages/orchestration-core/src/dispatch.ts
- Test: packages/orchestration-core/src/scheduler.test.ts
- Test: packages/orchestration-core/src/fair-queue.test.ts

**Interfaces:**

- Consumes TaskRepository, Outbox, AgentSessionLauncher, Clock, task graph readiness and capability policy.
- Produces:

~~~ts
export interface Clock {
  now(): Date;
}

export interface LaunchAgentSessionInput {
  taskId: TaskId;
  workflowId: WorkflowId;
  agentDefinitionId: AgentDefinitionId;
  leaseId: string;
  correlationId: CorrelationId;
}

export interface AgentSessionLauncher {
  launch(input: LaunchAgentSessionInput): Promise<AgentSession>;
  stop(sessionId: AgentSessionId, reason: string): Promise<void>;
}

export interface DispatchDecision {
  taskId: TaskId;
  agentDefinitionId: AgentDefinitionId;
  leaseId: string;
  expiresAt: Date;
  correlationId: CorrelationId;
}

export interface Scheduler {
  tick(input: SchedulerTickInput): Promise<DispatchDecision[]>;
}

export interface SchedulerTickInput {
  workflowId: WorkflowId;
  capacity: number;
  workerId: string;
}
~~~

- [ ] **Step 1: Write fair-queue tests**

Create tasks for three departments with different priorities and verify that repeated ticks do not starve a department. Verify deterministic ordering for equal priority and that a task with an unmet dependency is never returned.

- [ ] **Step 2: Implement ready-task selection**

Read workflow tasks, call findReadyTasks, filter by capability and budget policy, then group by department. Use weighted round-robin with a default equal weight. Keep ordering deterministic by priority, creation time and task ID.

- [ ] **Step 3: Write the 50+ capacity tests**

Create 60 independent tasks and call the scheduler with capacity 50. Assert exactly 50 dispatch decisions, 10 remaining ready tasks and no duplicate task IDs. Call the next tick after completing 10 sessions and assert the remaining 10 are dispatched.

- [ ] **Step 4: Implement leases and idempotent dispatch**

A dispatch decision must include a lease ID and expiry. Persist the task transition and outbox command transactionally. A repeated scheduler tick with the same lease must not launch a second session. A stale lease can be reclaimed only after expiry.

- [ ] **Step 5: Test failure and backpressure behavior**

Use a fake launcher that rejects selected tasks. Assert the task becomes FAILED, the recovery coordinator receives one command, and unrelated tasks continue. When capacity is zero or the provider is unhealthy, assert no task is started and ready tasks remain queued.

- [ ] **Step 6: Run scheduler tests**

~~~text
corepack pnpm --filter @aicompany/orchestration-core test -- scheduler.test.ts fair-queue.test.ts
~~~

Expected: fairness, 50+ dispatch, lease and backpressure tests pass.

- [ ] **Step 7: Commit scheduling**

~~~text
git add packages/orchestration-core
git commit -m "feat: schedule concurrent agent sessions"
~~~

### Task 6: Add agent session checkpoints and lifecycle commands

**Files:**

- Create: packages/orchestration-core/src/agent-session-manager.ts
- Create: packages/orchestration-core/src/checkpoints.ts
- Create: packages/orchestration-core/src/session-commands.ts
- Test: packages/orchestration-core/src/agent-session-manager.test.ts
- Test: packages/orchestration-core/src/checkpoints.test.ts

**Interfaces:**

- Produces:

~~~ts
export type AgentCheckpointState = 'RUNNING' | 'PAUSED' | 'WAITING_FOR_TOOL' | 'COMPLETED';

export interface AgentCheckpoint {
  sessionId: AgentSessionId;
  taskId: TaskId;
  sequence: number;
  state: AgentCheckpointState;
  contextReference: string;
  lastEventId: EventId;
  completedOperationKeys: string[];
  createdAt: Date;
}

export interface CheckpointStore {
  save(checkpoint: AgentCheckpoint): Promise<void>;
  latest(sessionId: AgentSessionId): Promise<AgentCheckpoint | null>;
}

export interface StartSessionInput {
  taskId: TaskId;
  leaseId: string;
  agentDefinitionId: AgentDefinitionId;
  correlationId: CorrelationId;
}

export interface SaveCheckpointInput {
  sessionId: AgentSessionId;
  expectedSequence: number;
  state: AgentCheckpointState;
  contextReference: string;
  lastEventId: EventId;
  completedOperationKeys: string[];
}

export interface AgentSessionManager {
  start(input: StartSessionInput): Promise<AgentSession>;
  checkpoint(input: SaveCheckpointInput): Promise<AgentCheckpoint>;
  resume(sessionId: AgentSessionId): Promise<AgentSession>;
  pause(sessionId: AgentSessionId, reason: string): Promise<void>;
  cancel(sessionId: AgentSessionId, reason: string): Promise<void>;
}
~~~

- [ ] **Step 1: Write lifecycle tests**

Cover start from a leased task, checkpoint after a model/tool event, resume from the latest checkpoint, pause, cancel and duplicate commands. A cancelled session cannot resume without an explicit new session command.

- [ ] **Step 2: Implement checkpoint records**

Store session ID, task ID, sequence number, state, context reference, last event ID, tool operation keys and timestamp. Use monotonic sequence numbers and reject an older checkpoint overwriting a newer one.

- [ ] **Step 3: Implement lifecycle transitions**

Use the same optimistic version rules as tasks. Starting a session transitions the task to RUNNING; pausing preserves the task state and sets session state to PAUSED; cancelling transitions the task to CANCELLED only when no dependent cleanup is pending.

- [ ] **Step 4: Add resume behavior**

Resume must load the latest checkpoint, verify the referenced task and workflow are still active, then emit a new session command with the same correlation ID and a new attempt ID. It must not replay a non-idempotent tool operation whose operation key is already completed.

- [ ] **Step 5: Run focused tests and commit**

~~~text
corepack pnpm --filter @aicompany/orchestration-core test -- agent-session-manager.test.ts checkpoints.test.ts
git add packages/orchestration-core
git commit -m "feat: checkpoint and resume agent sessions"
~~~

Expected: all lifecycle and checkpoint tests pass.

### Task 7: Implement scoped communication and decision records

**Files:**

- Create: packages/orchestration-core/src/communication.ts
- Create: packages/orchestration-core/src/channel-policy.ts
- Create: packages/orchestration-core/src/decision-records.ts
- Test: packages/orchestration-core/src/communication.test.ts
- Test: packages/orchestration-core/src/channel-policy.test.ts

**Interfaces:**

- Produces:

~~~ts
export type ChannelScope =
  | { kind: 'task'; taskId: TaskId }
  | { kind: 'project'; projectId: string };

export interface SendMessageInput {
  actor: ActorRef;
  scope: ChannelScope;
  messageType: 'CHAT' | 'PROGRESS' | 'HANDOFF' | 'BLOCKER';
  contentReference: string;
  correlationId: CorrelationId;
  causationId: EventId;
}

export interface Message {
  messageId: string;
  actor: ActorRef;
  scope: ChannelScope;
  messageType: 'CHAT' | 'PROGRESS' | 'HANDOFF' | 'BLOCKER';
  contentReference: string;
  correlationId: CorrelationId;
  causationId: EventId;
  createdAt: Date;
}

export interface CommunicationService {
  sendMessage(input: SendMessageInput): Promise<Message>;
  publishEvent(event: DomainEvent): Promise<void>;
  listMessages(scope: ChannelScope, after?: string): Promise<Message[]>;
}

export interface RecordDecisionInput {
  actor: ActorRef;
  scope: ChannelScope;
  subject: string;
  options: string[];
  selectedOption: string;
  rationale: string;
  evidenceIds: string[];
  correlationId: CorrelationId;
}

export interface DecisionRecord {
  decisionId: string;
  actor: ActorRef;
  scope: ChannelScope;
  subject: string;
  options: string[];
  selectedOption: string;
  rationale: string;
  evidenceIds: string[];
  supersedesDecisionId?: string;
  createdAt: Date;
}

export interface DecisionRecordService {
  record(input: RecordDecisionInput): Promise<DecisionRecord>;
}
~~~

- [ ] **Step 1: Write channel authorization tests**

Allow an assigned agent, its supervisor and an explicitly invited peer to write to a task channel. Allow project channel read access only to agents assigned to the project. Reject cross-project reads, unscoped global broadcasts and messages from cancelled sessions.

- [ ] **Step 2: Implement scoped message persistence**

Persist sender, channel scope, task/project IDs, message type, content reference, correlation ID, causation ID and timestamp. Store large payloads as artifact references; do not put raw secrets into message content.

- [ ] **Step 3: Implement typed event publishing**

Validate event payloads through the contracts package, reject unknown event types and publish each event exactly once using the event ID/idempotency key.

- [ ] **Step 4: Implement decision records**

A decision record must contain subject, options considered, selected option, rationale, author session, evidence IDs and supersession metadata. Store it separately from chat so later agents can retrieve decisions without replaying the entire conversation.

- [ ] **Step 5: Run communication tests and commit**

~~~text
corepack pnpm --filter @aicompany/orchestration-core test -- communication.test.ts channel-policy.test.ts
git add packages/orchestration-core
git commit -m "feat: add scoped agent communication"
~~~

Expected: authorization, idempotency, event validation and decision provenance tests pass.

### Task 8: Implement bounded recovery and escalation

**Files:**

- Create: packages/orchestration-core/src/recovery.ts
- Create: packages/orchestration-core/src/failure-fingerprint.ts
- Create: packages/orchestration-core/src/recovery-strategies.ts
- Test: packages/orchestration-core/src/recovery.test.ts
- Test: packages/orchestration-core/src/failure-fingerprint.test.ts

**Interfaces:**

- Produces:

~~~ts
export interface FailureContext {
  taskId: TaskId;
  attemptId: string;
  errorClass: string;
  commandName: string;
  exitCode?: number;
  message: string;
  evidenceIds: string[];
}

export interface RecoveryPlan {
  strategyName: string;
  changedAssumption: string;
  action: 'RETRY' | 'ALTERNATE_AGENT' | 'DEPENDENCY_REPAIR' | 'ROLLBACK' | 'REPLAN';
}

export interface RecoveryRequest {
  taskId: TaskId;
  failure: FailureContext;
  actor: ActorRef;
  correlationId: CorrelationId;
}

export interface RecoveryRecord {
  recoveryId: string;
  taskId: TaskId;
  cycle: number;
  fingerprint: string;
  plan: RecoveryPlan;
  state: 'STARTED' | 'SUCCEEDED' | 'FAILED' | 'ESCALATED';
  createdAt: Date;
}

export interface RecoveryCompletion {
  recoveryId: string;
  taskId: TaskId;
  succeeded: boolean;
  evidenceIds: string[];
}

export interface EscalationRequest {
  taskId: TaskId;
  reason: string;
  recoveryId: string;
  actor: ActorRef;
  correlationId: CorrelationId;
}

export interface RecoveryCoordinator {
  start(input: RecoveryRequest): Promise<RecoveryRecord>;
  complete(input: RecoveryCompletion): Promise<void>;
  escalate(input: EscalationRequest): Promise<ApprovalRecord>;
}

export interface RecoveryStrategy {
  name: string;
  canHandle(failure: FailureContext): boolean;
  plan(failure: FailureContext): RecoveryPlan;
}
~~~

- [ ] **Step 1: Write recovery policy tests**

Cover BLOCKED and FAILED entering RECOVERING, recovery cycle incrementing, identical failure fingerprints being rejected without a strategy change, successful repair returning to READY, and the fifth failed cycle producing ESCALATED_TO_CEO.

- [ ] **Step 2: Implement stable failure fingerprints**

Normalize error class, command name, relevant exit code and a bounded message digest. Exclude timestamps, random IDs and full secret-bearing output. Store the normalized fingerprint with each recovery record.

- [ ] **Step 3: Implement strategy selection**

Provide deterministic initial strategies: retry with changed timeout, alternate agent/model, dependency repair, workspace rollback and task-plan revision. A strategy must declare why it differs from the previous attempt.

- [ ] **Step 4: Implement recovery coordinator**

Start recovery transactionally with the task state change, recovery record and outbox command. On success, move the task to READY; on another failure, increment the cycle; after cycle five, create a CEO escalation and preserve all evidence.

- [ ] **Step 5: Test branch isolation**

Create one failing task with two independent tasks and one dependent task. Assert that the independent tasks continue, the dependent task remains held, and only the failed branch escalates after five cycles.

- [ ] **Step 6: Run recovery tests and commit**

~~~text
corepack pnpm --filter @aicompany/orchestration-core test -- recovery.test.ts failure-fingerprint.test.ts
git add packages/orchestration-core
git commit -m "feat: add bounded automatic recovery"
~~~

Expected: five-cycle recovery, strategy-change enforcement and branch isolation tests pass.

### Task 9: Implement capability policy and CEO approvals

**Files:**

- Create: packages/orchestration-core/src/capability-policy.ts
- Create: packages/orchestration-core/src/approvals.ts
- Create: packages/orchestration-core/src/ceo-commands.ts
- Test: packages/orchestration-core/src/capability-policy.test.ts
- Test: packages/orchestration-core/src/approvals.test.ts

**Interfaces:**

- Produces:

~~~ts
export interface CapabilityRequest {
  actor: ActorRef;
  taskId: TaskId;
  capability: string;
  resource: string;
  correlationId: CorrelationId;
}

export interface CapabilityDecision {
  allowed: boolean;
  requiresApproval: boolean;
  reason: string;
  approvalId?: ApprovalId;
}

export interface CapabilityPolicy {
  evaluate(request: CapabilityRequest): Promise<CapabilityDecision>;
}

export interface ApprovalRequest {
  subjectType: 'CAPABILITY' | 'DEPLOYMENT' | 'RECOVERY_ESCALATION';
  subjectId: string;
  reason: string;
  requestedBy: ActorRef;
  correlationId: CorrelationId;
  idempotencyKey: string;
}

export interface ApprovalDecision {
  approvalId: ApprovalId;
  decision: 'APPROVE' | 'REJECT';
  actor: ActorRef;
  reason: string;
  expectedVersion: number;
  idempotencyKey: string;
}

export interface ApprovalService {
  request(input: ApprovalRequest): Promise<ApprovalRecord>;
  decide(input: ApprovalDecision): Promise<ApprovalRecord>;
  get(approvalId: ApprovalId): Promise<ApprovalRecord>;
}

export interface CeoCommandService {
  pauseWorkflow(workflowId: WorkflowId, reason: string): Promise<void>;
  resumeWorkflow(workflowId: WorkflowId): Promise<void>;
  cancelTask(taskId: TaskId, reason: string): Promise<void>;
  reassignTask(taskId: TaskId, agentDefinitionId: AgentDefinitionId): Promise<void>;
}
~~~

- [ ] **Step 1: Write capability tests**

Allow a role's default capabilities, reject a missing capability, create an approval for a capability escalation, and reject any command from a non-CEO actor in the MVP. Include security, secret and deploy capabilities as approval-required examples.

- [ ] **Step 2: Implement default capability policy**

Represent capabilities as strings such as repo.read, repo.write, test.run, secret.use, deploy.staging and deploy.production. Keep the default role matrix in a versioned configuration object, not in agent prompt text.

- [ ] **Step 3: Write approval tests**

Cover idempotent approval requests, approve/reject decisions, stale decisions, duplicate CEO commands and the rule that a deployment task cannot transition to COMPLETED without an approved deployment record.

- [ ] **Step 4: Implement approval state transitions**

Use optimistic version checks and append approval events. An approved deployment emits a single outbox command; a rejected deployment returns the task to a repair/review state with the rejection reason.

- [ ] **Step 5: Implement CEO commands**

Route pause, resume, cancel and reassign through one command service. Each command must include actor, reason, idempotency key and correlation ID. A pause must prevent new dispatch while allowing active tool calls to reach a safe checkpoint.

- [ ] **Step 6: Run policy/approval tests and commit**

~~~text
corepack pnpm --filter @aicompany/orchestration-core test -- capability-policy.test.ts approvals.test.ts
git add packages/orchestration-core
git commit -m "feat: enforce capabilities and CEO approvals"
~~~

Expected: policy, approval and CEO command tests pass.

### Task 10: Add observability and cost accounting ports

**Files:**

- Create: packages/orchestration-core/src/observability.ts
- Create: packages/orchestration-core/src/cost.ts
- Create: packages/orchestration-core/src/metrics.ts
- Test: packages/orchestration-core/src/observability.test.ts
- Test: packages/orchestration-core/src/cost.test.ts

**Interfaces:**

- Produces:

~~~ts
export interface SpanInput {
  name: string;
  workflowId: WorkflowId;
  taskId?: TaskId;
  sessionId?: AgentSessionId;
  correlationId: CorrelationId;
  attributes: Record<string, string | number | boolean>;
}

export interface SpanHandle {
  end(attributes?: Record<string, string | number | boolean>): void;
  fail(error: Error): void;
}

export interface TraceSink {
  startSpan(input: SpanInput): SpanHandle;
}

export interface UsageRecord {
  usageId: string;
  workflowId: WorkflowId;
  taskId: TaskId;
  agentSessionId: AgentSessionId;
  provider: string;
  baseUrlIdentifier: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  estimatedCostUsd: number;
  createdAt: Date;
}

export interface CostSummary {
  workflowId: WorkflowId;
  inputTokens: number;
  outputTokens: number;
  estimatedCostUsd: number;
  byModel: Record<string, number>;
}

export interface CostSink {
  recordUsage(input: UsageRecord): Promise<void>;
  getWorkflowCost(workflowId: WorkflowId): Promise<CostSummary>;
}

export interface MetricsSink {
  increment(name: string, value: number, tags: Record<string, string>): void;
  observe(name: string, value: number, tags: Record<string, string>): void;
}
~~~

- [ ] **Step 1: Write trace tests**

Assert every command, session, tool operation, recovery cycle and approval carries workflow, task, session, correlation and causation identifiers needed to reconstruct a full trace.

- [ ] **Step 2: Implement no-op and in-memory sinks**

Use no-op sinks for unit tests and in-memory sinks for assertions. Never make business state depend on the success of a metrics write; dangerous actions depend on the audit event store instead.

- [ ] **Step 3: Write cost tests**

Record input tokens, output tokens, model, provider, base URL identifier, task, agent and estimated cost. Aggregate by workflow, department, agent and model. Reject negative usage and duplicate usage records.

- [ ] **Step 4: Implement budget checks**

Before a model/tool dispatch, check task, agent and workflow budget. Return a typed BudgetExceeded decision that creates a cost escalation and pauses only the affected branch.

- [ ] **Step 5: Run observability tests and commit**

~~~text
corepack pnpm --filter @aicompany/orchestration-core test -- observability.test.ts cost.test.ts
git add packages/orchestration-core
git commit -m "feat: add orchestration traces and cost controls"
~~~

Expected: trace propagation, usage aggregation and budget guard tests pass.

### Task 11: Build the simulated 50-agent integration harness

**Files:**

- Create: packages/orchestration-harness/package.json
- Create: packages/orchestration-harness/tsconfig.json
- Create: packages/orchestration-harness/src/simulated-agent.ts
- Create: packages/orchestration-harness/src/scenario.ts
- Create: packages/orchestration-harness/src/index.ts
- Modify: tsconfig.json
- Test: packages/orchestration-harness/src/orchestration-run.integration.test.ts
- Test: packages/orchestration-harness/src/recovery-run.integration.test.ts

**Interfaces:**

- Consumes the public ports from @aicompany/orchestration-core.
- Produces a deterministic test runner with:

~~~ts
export interface ScenarioResult {
  workflowId: WorkflowId;
  completedTaskCount: number;
  escalatedTaskCount: number;
  recoveryCycleCount: number;
  deploymentApprovalId: ApprovalId;
  traceIds: string[];
}

export function runFiftyAgentScenario(): Promise<ScenarioResult>;
~~~

- [ ] **Step 1: Write the successful scenario test**

Create at least 60 tasks across Product, Architecture, Development, Review, QA, Security and DevOps. Assert that 50 sessions are dispatched in the first tick, all tasks eventually complete, merge evidence exists and the deployment task is waiting for CEO approval.

- [ ] **Step 2: Implement deterministic simulated agents**

The simulated agent must emit progress, create an artifact record, request review or test, checkpoint and complete. It must use injected clocks, IDs and fake tool results so test output is reproducible.

- [ ] **Step 3: Write the recovery scenario test**

Configure one task to fail twice with the same fingerprint, then succeed after a strategy change. Configure another task to fail five times and escalate. Assert independent branches complete and the dependent branch remains held.

- [ ] **Step 4: Implement scenario wiring**

Wire in-memory repositories, scheduler, session manager, communication service, recovery coordinator, approval service, metrics sink and simulated agents. Keep the harness separate from production packages; it must not be imported by the control plane.

- [ ] **Step 5: Add the CEO approval assertion**

Assert the deployment task cannot complete before ApprovalService.decide({ approvalId, decision: 'APPROVE', actor: ceoActor, reason: 'staging evidence verified', expectedVersion, idempotencyKey }). After approval, assert one deployment outbox command is emitted and duplicate approval commands do not emit a second command. Add the harness package reference to the root tsconfig.json.

- [ ] **Step 6: Run the full orchestration verification**

~~~text
corepack pnpm --filter @aicompany/orchestration-harness test
corepack pnpm typecheck
corepack pnpm test
~~~

Expected: the 50-agent success scenario, recovery scenario and all unit tests pass.

- [ ] **Step 7: Commit the harness**

~~~text
git add packages/orchestration-harness
git commit -m "test: verify fifty-agent orchestration"
~~~

### Task 12: Document the orchestration API and verify the first track

**Files:**

- Create: packages/orchestration-core/README.md
- Create: packages/persistence-postgres/README.md
- Create: docs/superpowers/plans/2026-11-08-orchestration-core-verification.md
- Modify: docs/superpowers/specs/2026-11-08-ai-company-design.md only if an implementation-discovered contract correction is required

**Interfaces:**

- Documents the ports consumed by the next plans: execution plane, Model Gateway, memory, Git/deployment adapters and Mission Grid.
- Does not add provider-specific behavior to the orchestration core.

- [ ] **Step 1: Document the public port map**

Document each public interface, its idempotency requirement, its transaction boundary and the event types it emits. Include one request/response example for task dispatch, checkpoint, recovery and deployment approval.

- [ ] **Step 2: Document local verification**

Record the exact commands for starting PostgreSQL, running unit/integration tests, typechecking and running the 50-agent harness. Include expected pass criteria and the intentional failure scenario.

- [ ] **Step 3: Run final checks**

~~~text
corepack pnpm install --frozen-lockfile
corepack pnpm typecheck
corepack pnpm lint
corepack pnpm test
~~~

Expected: all checks pass with no uncommitted source changes except ignored local runtime files.

- [ ] **Step 4: Commit documentation**

~~~text
git add packages/orchestration-core/README.md packages/persistence-postgres/README.md docs/superpowers/plans/2026-11-08-orchestration-core-verification.md
git commit -m "docs: document orchestration core verification"
~~~

## Completion Gate

Track 1 is complete only when:

- the monorepo installs from a clean checkout;
- task transitions and dependency cycles are covered by tests;
- PostgreSQL state/event writes enforce optimistic concurrency and outbox idempotency;
- the scheduler dispatches 50+ independent tasks with fairness and no duplicates;
- sessions checkpoint and resume;
- scoped communication rejects unauthorized cross-project access;
- recovery changes strategy, caps at five cycles and escalates without stopping independent branches;
- CEO commands and deployment approvals are idempotent;
- traces and cost records cover the full workflow;
- the simulated 50-agent end-to-end scenario passes;
- the next subsystem plans can consume documented ports without importing internal implementation details.

## Follow-up Plans

Create separate plans after this track is complete:

1. Execution plane: persistent project VM, tool runner, snapshots and quotas.
2. Model Gateway: custom base_url, platform/BYOK credentials, routing, health, limits and cost.
3. Source/deployment adapters: internal workspace, GitHub/GitLab, staging and cloud targets.
4. Memory and knowledge: private/project/company scopes, ACLs, provenance and promotion.
5. Mission Grid: Graphite Signal control room, contextual chat and CEO commands.
6. Toolchain profiles: JavaScript/TypeScript, Python, .NET and Java adapters.
