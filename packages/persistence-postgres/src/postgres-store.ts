import { Pool, type PoolClient, type QueryResultRow } from 'pg';
import {
  ApprovalRecordSchema,
  DomainEventSchema,
  TaskSchema,
  agentSessionId,
  type DomainEvent,
  type EventId,
  type ApprovalRecord,
  type OutboxCommand,
  type Task
} from '@aicompany/contracts';
import {
  DuplicatePersistenceIdError,
  InvalidPersistenceOperationError,
  OptimisticConcurrencyError,
  type EventStore,
  type SaveTaskAndAppendInput,
  type SaveApprovalRequestInput,
  type SaveApprovalDecisionAndTaskInput,
  type DispatchClaim,
  type DispatchClaimRequest,
  type RecoveryRecord,
  type TransactionalPersistence
} from '@aicompany/orchestration-core';
import {
  assertVersion,
  assertReadVersion,
  canonicalId,
  parseDomainEvent,
  parseEventId,
  parseOutboxCommand,
  parseTask,
  sameOutboxCommandIdentity,
  sameValue
} from './persistence-validation.js';

export type { SaveTaskAndAppendInput } from '@aicompany/orchestration-core';

export interface DomainEventRow extends QueryResultRow {
  event_id: string;
  aggregate_type: string;
  aggregate_id: string;
  aggregate_version: number;
  event_type: string;
  payload: unknown;
  actor: unknown;
  correlation_id: string;
  causation_id: string;
  occurred_at: Date;
}

export interface TaskRow extends QueryResultRow {
  task_id: string;
  workflow_id: string;
  state: string;
  dependency_ids: unknown;
  recovery_cycles: number;
  version: number;
  updated_at: Date;
  required_capabilities: unknown;
  output_contract: string;
  budget: unknown;
  project_id: string;
  parent_task_id: string | null;
  owner_agent_definition_id: string | null;
  deadline: Date | null;
  trace_id: string;
  created_at: Date;
  priority: number | null;
  title: string | null;
  description: string | null;
  is_deployment: boolean | null;
  deployment_approval_id: string | null;
  deployment_attempt_id: string | null;
}

export interface OutboxCommandRow extends QueryResultRow {
  command_id: string;
  command_type: string;
  payload: unknown;
  available_at: Date;
  claimed_by: string | null;
  claimed_at: Date | null;
  completed_at: Date | null;
  actor: unknown;
  issued_at: Date;
  correlation_id: string;
  causation_id: string;
}

export interface RecoveryRecordRow extends QueryResultRow {
  recovery_id: string;
  task_id: string;
  cycle: number;
  fingerprint: string;
  plan: unknown;
  state: string;
  created_at: Date;
  evidence_ids: unknown;
  start_fingerprint: string | null;
  completion_fingerprint: string | null;
  start_idempotency_key: string | null;
  start_request_fingerprint: string | null;
  completion_idempotency_key: string | null;
  completion_request_fingerprint: string | null;
  idempotency_key: string | null;
  request_fingerprint: string | null;
}

interface ApprovalRow extends QueryResultRow {
  approval_id: string;
  subject_type: string;
  subject_id: string;
  reason: string;
  requested_by: unknown;
  correlation_id: string;
  causation_id: string;
  state: string;
  decision: string | null;
  decision_reason: string | null;
  decided_by: unknown | null;
  decided_at: Date | null;
  version: number;
  created_at: Date;
  updated_at: Date;
  request_idempotency_key: string | null;
  request_fingerprint: string | null;
}

const json = (value: unknown): string => JSON.stringify(value) ?? 'null';

const hydrateEventPayload = (eventType: string, payload: unknown): unknown => {
  if (
    eventType !== 'APPROVAL_APPROVED' ||
    payload === null ||
    typeof payload !== 'object' ||
    !('decidedAt' in payload) ||
    typeof payload.decidedAt !== 'string'
  ) {
    return payload;
  }
  return { ...payload, decidedAt: new Date(payload.decidedAt) };
};

const toDomainEvent = (row: DomainEventRow): DomainEvent => DomainEventSchema.parse({
  eventId: row.event_id,
  aggregateType: row.aggregate_type,
  aggregateId: row.aggregate_id,
  aggregateVersion: row.aggregate_version,
  eventType: row.event_type,
  payload: hydrateEventPayload(row.event_type, row.payload),
  actor: row.actor,
  correlationId: row.correlation_id,
  causationId: row.causation_id,
  occurredAt: row.occurred_at
});

const toOutboxCommand = (row: OutboxCommandRow): OutboxCommand => parseOutboxCommand({
  commandId: row.command_id,
  type: row.command_type,
  payload: row.payload,
  actor: row.actor,
  issuedAt: row.issued_at,
  availableAt: row.available_at,
  correlationId: row.correlation_id,
  causationId: row.causation_id,
  claimedBy: row.claimed_by,
  claimedAt: row.claimed_at,
  completedAt: row.completed_at
});

export const taskFromRow = (row: TaskRow): Task => TaskSchema.parse({
  id: row.task_id,
  workflowId: row.workflow_id,
  state: row.state,
  dependencyIds: row.dependency_ids,
  requiredCapabilities: row.required_capabilities,
  outputContract: row.output_contract,
  budget: row.budget,
  recoveryCycles: row.recovery_cycles,
  projectId: row.project_id,
  parentTaskId: row.parent_task_id,
  ownerAgentDefinitionId: row.owner_agent_definition_id,
  deadline: row.deadline,
  traceId: row.trace_id,
  version: row.version,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
  ...(row.priority === null ? {} : { priority: row.priority }),
  ...(row.title === null ? {} : { title: row.title }),
  ...(row.description === null ? {} : { description: row.description }),
  ...(row.is_deployment === null ? {} : { isDeployment: row.is_deployment }),
  ...(row.deployment_approval_id === null ? {} : { deploymentApprovalId: row.deployment_approval_id }),
  ...(row.deployment_attempt_id === null ? {} : { deploymentAttemptId: row.deployment_attempt_id })
});

const eventParameters = (event: DomainEvent): unknown[] => [
  event.eventId,
  event.aggregateType,
  event.aggregateId,
  event.aggregateVersion,
  event.eventType,
  json(event.payload),
  json(event.actor),
  event.correlationId,
  event.causationId,
  event.occurredAt
];

const commandParameters = (command: OutboxCommand): unknown[] => [
  command.commandId,
  command.type,
  json(command.payload),
  command.availableAt,
  command.claimedBy ?? null,
  command.claimedAt ?? null,
  command.completedAt ?? null,
  json(command.actor),
  command.issuedAt,
  command.correlationId,
  command.causationId
];

const recoveryActions = new Set<RecoveryRecord['plan']['action']>([
  'RETRY', 'ALTERNATE_AGENT', 'DEPENDENCY_REPAIR', 'ROLLBACK', 'REPLAN'
]);
const recoveryStates = new Set<RecoveryRecord['state']>([
  'STARTED', 'SUCCEEDED', 'FAILED', 'ESCALATED'
]);

const requiredText = (value: unknown, name: string): string => {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new InvalidPersistenceOperationError(`${name} must be a non-empty string`);
  }
  return value.trim();
};

const stringArray = (value: unknown, name: string): string[] => {
  if (!Array.isArray(value) || value.some((entry) => typeof entry !== 'string' || entry.trim().length === 0)) {
    throw new InvalidPersistenceOperationError(`${name} must be an array of non-empty strings`);
  }
  return value.map((entry) => (entry as string).trim());
};

export const parseRecoveryRecord = (record: RecoveryRecord): RecoveryRecord => {
  const recoveryId = requiredText(record.recoveryId, 'recoveryId');
  const taskId = requiredText(record.taskId, 'taskId') as RecoveryRecord['taskId'];
  if (!Number.isSafeInteger(record.cycle) || record.cycle < 1 || record.cycle > 5) {
    throw new InvalidPersistenceOperationError('Recovery cycle must be an integer between 1 and 5');
  }
  if (!recoveryStates.has(record.state)) {
    throw new InvalidPersistenceOperationError(`Unknown recovery state ${String(record.state)}`);
  }
  const plan = record.plan;
  if (plan === null || typeof plan !== 'object') {
    throw new InvalidPersistenceOperationError('Recovery plan must be an object');
  }
  const planValue = plan as unknown as Record<string, unknown>;
  const strategyName = requiredText(planValue.strategyName, 'recovery plan strategyName');
  const changedAssumption = requiredText(planValue.changedAssumption, 'recovery plan changedAssumption');
  if (typeof planValue.action !== 'string' || !recoveryActions.has(planValue.action as RecoveryRecord['plan']['action'])) {
    throw new InvalidPersistenceOperationError('Recovery plan action is invalid');
  }
  const createdAt = record.createdAt instanceof Date ? new Date(record.createdAt.getTime()) : new Date(record.createdAt);
  if (Number.isNaN(createdAt.getTime())) {
    throw new InvalidPersistenceOperationError('Recovery createdAt must be a valid date');
  }
  const startFingerprint = record.startFingerprint === undefined
    ? undefined
    : requiredText(record.startFingerprint, 'startFingerprint');
  const completionFingerprint = record.completionFingerprint === undefined
    ? undefined
    : requiredText(record.completionFingerprint, 'completionFingerprint');
  return {
    recoveryId,
    taskId,
    cycle: record.cycle,
    fingerprint: requiredText(record.fingerprint, 'recovery fingerprint'),
    plan: { strategyName, changedAssumption, action: planValue.action as RecoveryRecord['plan']['action'] },
    state: record.state,
    createdAt,
    evidenceIds: stringArray(record.evidenceIds, 'evidenceIds'),
    ...(startFingerprint === undefined ? {} : { startFingerprint }),
    ...(completionFingerprint === undefined ? {} : { completionFingerprint })
  };
};

export const recoveryRecordFromRow = (row: RecoveryRecordRow): RecoveryRecord =>
  parseRecoveryRecord({
    recoveryId: row.recovery_id,
    taskId: row.task_id as RecoveryRecord['taskId'],
    cycle: row.cycle,
    fingerprint: row.fingerprint,
    plan: row.plan as RecoveryRecord['plan'],
    state: row.state as RecoveryRecord['state'],
    createdAt: row.created_at,
    evidenceIds: row.evidence_ids as string[],
    ...(row.start_fingerprint === null ? {} : { startFingerprint: row.start_fingerprint }),
    ...(row.completion_fingerprint === null ? {} : { completionFingerprint: row.completion_fingerprint })
  });

export const recoveryRecordParameters = (
  record: RecoveryRecord,
  startIdempotencyKey: string | null = null,
  startRequestFingerprint: string | null = null,
  completionIdempotencyKey: string | null = null,
  completionRequestFingerprint: string | null = null
): unknown[] => {
  const parsed = parseRecoveryRecord(record);
  return [
    parsed.recoveryId,
    parsed.taskId,
    parsed.cycle,
    parsed.fingerprint,
    json(parsed.plan),
    parsed.state,
    parsed.createdAt,
    json(parsed.evidenceIds),
    parsed.startFingerprint ?? null,
    parsed.completionFingerprint ?? null,
    startIdempotencyKey,
    startRequestFingerprint,
    completionIdempotencyKey,
    completionRequestFingerprint,
    null,
    null
  ];
};

const approvalFromRow = (row: ApprovalRow): ApprovalRecord => ApprovalRecordSchema.parse({
  approvalId: row.approval_id,
  subjectType: row.subject_type,
  subjectId: row.subject_id,
  reason: row.reason,
  requestedBy: row.requested_by,
  correlationId: row.correlation_id,
  causationId: row.causation_id,
  state: row.state,
  decision: row.decision,
  decisionReason: row.decision_reason,
  decidedBy: row.decided_by,
  decidedAt: row.decided_at,
  version: row.version,
  createdAt: row.created_at,
  updatedAt: row.updated_at
});

const updateTaskColumns = `
  workflow_id = $2,
  state = $3,
  dependency_ids = $4,
  recovery_cycles = $5,
  version = $6,
  updated_at = $7,
  required_capabilities = $8,
  output_contract = $9,
  budget = $10,
  project_id = $11,
  parent_task_id = $12,
  owner_agent_definition_id = $13,
  deadline = $14,
  trace_id = $15,
  priority = $16,
  title = $17,
  description = $18,
  is_deployment = $19,
  deployment_approval_id = $20,
  deployment_attempt_id = $21`;

const taskParameters = (task: Task): unknown[] => [
  task.id,
  task.workflowId,
  task.state,
  json(task.dependencyIds),
  task.recoveryCycles,
  task.version,
  task.updatedAt,
  json(task.requiredCapabilities),
  task.outputContract,
  json(task.budget),
  task.projectId,
  task.parentTaskId,
  task.ownerAgentDefinitionId,
  task.deadline,
  task.traceId,
  task.priority ?? null,
  task.title ?? null,
  task.description ?? null,
  task.isDeployment ?? null,
  task.deploymentApprovalId ?? null,
  task.deploymentAttemptId ?? null
];

const taskInsertParameters = (task: Task): unknown[] => [
  ...taskParameters(task),
  task.createdAt
];

const aggregateIdForLock = (events: readonly DomainEvent[]): string | undefined =>
  events.length === 0 ? undefined : events[0].aggregateId;

const parseEventBatch = (events: readonly DomainEvent[]): DomainEvent[] => {
  const parsedEvents = events.map(parseDomainEvent);
  if (parsedEvents.length === 0) {
    return parsedEvents;
  }

  const aggregateId = parsedEvents[0].aggregateId;
  const seenIds = new Set<string>();
  for (const event of parsedEvents) {
    if (event.aggregateId !== aggregateId) {
      throw new InvalidPersistenceOperationError('An event append must target one aggregate');
    }
    if (seenIds.has(event.eventId)) {
      throw new DuplicatePersistenceIdError('event', event.eventId);
    }
    seenIds.add(event.eventId);
  }
  return parsedEvents;
};

interface PreparedSaveTaskAndAppendInput {
  task: Task;
  expectedVersion: number;
  events: DomainEvent[];
  commands: OutboxCommand[];
}

interface PreparedSaveApprovalDecisionAndTaskInput {
  approval: ApprovalRecord;
  expectedApprovalVersion: number;
  approvalEvent: DomainEvent;
  task?: Task;
  expectedTaskVersion?: number;
  taskEvent?: DomainEvent;
  commands: OutboxCommand[];
  idempotencyKey: string;
  requestFingerprint: string;
}

interface PreparedSaveApprovalRequestInput {
  approval: ApprovalRecord;
  requestEvent: DomainEvent;
  command: OutboxCommand;
  idempotencyKey: string;
  requestFingerprint: string;
}

interface PreparedSaveRecoveryAndAppendInput extends PreparedSaveTaskAndAppendInput {
  record: RecoveryRecord;
  idempotencyKey: string;
  requestFingerprint: string;
}

const prepareSaveTaskAndAppend = (
  input: SaveTaskAndAppendInput
): PreparedSaveTaskAndAppendInput => {
  assertVersion(input.expectedVersion, 'expectedVersion');
  const task = parseTask(input.task);
  const events = parseEventBatch(input.events);
  const commands = input.commands.map(parseOutboxCommand);

  const initialTaskVersion = input.expectedVersion === 0 && task.version === 0;
  const updatedTaskVersion = task.version === input.expectedVersion + 1;
  if (!initialTaskVersion && !updatedTaskVersion) {
    throw new InvalidPersistenceOperationError(
      `Task ${task.id} must have version 0 for a new task or ${input.expectedVersion + 1}`
    );
  }

  if (events.length > 0) {
    if (events[0].aggregateId !== task.id) {
      throw new InvalidPersistenceOperationError(
        `Task ${task.id} does not match event aggregate ${events[0].aggregateId}`
      );
    }
    events.forEach((event, index) => {
      const expectedEventVersion = input.expectedVersion + index + 1;
      if (event.aggregateVersion !== expectedEventVersion) {
        throw new InvalidPersistenceOperationError(
          `Event ${event.eventId} must have aggregate version ${expectedEventVersion}`
        );
      }
    });
  }

  return { task, expectedVersion: input.expectedVersion, events, commands };
};

const prepareSaveRecoveryAndAppend = (
  input: SaveTaskAndAppendInput & {
    record: RecoveryRecord;
    idempotencyKey: string;
    requestFingerprint: string;
  }
): PreparedSaveRecoveryAndAppendInput => {
  const prepared = prepareSaveTaskAndAppend(input);
  const record = parseRecoveryRecord(input.record);
  if (record.taskId !== prepared.task.id) {
    throw new InvalidPersistenceOperationError('Recovery record task does not match the task snapshot');
  }
  return {
    ...prepared,
    record,
    idempotencyKey: canonicalId(input.idempotencyKey, 'idempotencyKey'),
    requestFingerprint: canonicalId(input.requestFingerprint, 'requestFingerprint')
  };
};

const prepareSaveApprovalDecisionAndTask = (
  input: SaveApprovalDecisionAndTaskInput
): PreparedSaveApprovalDecisionAndTaskInput => {
  assertVersion(input.expectedApprovalVersion, 'expectedApprovalVersion');
  const idempotencyKey = canonicalId(input.idempotencyKey, 'idempotencyKey');
  const requestFingerprint = canonicalId(input.requestFingerprint, 'requestFingerprint');
  const approval = ApprovalRecordSchema.parse(input.approval);
  const approvalEvent = parseDomainEvent(input.approvalEvent);
  if (
    approvalEvent.aggregateId !== approval.approvalId ||
    approvalEvent.aggregateVersion !== input.expectedApprovalVersion + 1
  ) {
    throw new InvalidPersistenceOperationError('Approval event does not match the approval decision version');
  }

  const hasTask = input.task !== undefined;
  const hasTaskEvent = input.taskEvent !== undefined;
  const hasTaskVersion = input.expectedTaskVersion !== undefined;
  if (hasTask !== hasTaskEvent || hasTask !== hasTaskVersion) {
    throw new InvalidPersistenceOperationError('Atomic approval task fields must be provided together');
  }

  const task = input.task === undefined ? undefined : parseTask(input.task);
  const taskEvent = input.taskEvent === undefined ? undefined : parseDomainEvent(input.taskEvent);
  if (task !== undefined && taskEvent !== undefined && input.expectedTaskVersion !== undefined) {
    assertVersion(input.expectedTaskVersion, 'expectedTaskVersion');
    if (
      taskEvent.aggregateId !== task.id ||
      taskEvent.aggregateVersion !== input.expectedTaskVersion + 1
    ) {
      throw new InvalidPersistenceOperationError('Task event does not match the deployment transition version');
    }
  }

  return {
    approval,
    expectedApprovalVersion: input.expectedApprovalVersion,
    approvalEvent,
    ...(task === undefined ? {} : { task }),
    ...(input.expectedTaskVersion === undefined ? {} : { expectedTaskVersion: input.expectedTaskVersion }),
    ...(taskEvent === undefined ? {} : { taskEvent }),
    commands: input.commands.map(parseOutboxCommand),
    idempotencyKey,
    requestFingerprint
  };
};

const prepareSaveApprovalRequest = (
  input: SaveApprovalRequestInput
): PreparedSaveApprovalRequestInput => {
  const approval = ApprovalRecordSchema.parse(input.approval);
  if (approval.version !== 0 || approval.state !== 'PENDING') {
    throw new InvalidPersistenceOperationError('Approval requests must start as pending version 0 records');
  }
  const requestEvent = parseDomainEvent(input.requestEvent);
  if (
    requestEvent.aggregateType !== 'APPROVAL' ||
    requestEvent.aggregateId !== approval.approvalId ||
    requestEvent.eventType !== 'APPROVAL_REQUESTED' ||
    requestEvent.aggregateVersion !== 0
  ) {
    throw new InvalidPersistenceOperationError('Approval request event must initialize an approval stream at version 0');
  }
  const command = parseOutboxCommand(input.command);
  if (
    command.type !== 'REQUEST_APPROVAL' ||
    command.payload.subjectType !== approval.subjectType ||
    command.payload.subjectId !== approval.subjectId ||
    command.payload.reason !== approval.reason
  ) {
    throw new InvalidPersistenceOperationError('Approval request command does not match the approval record');
  }
  return {
    approval,
    requestEvent,
    command,
    idempotencyKey: canonicalId(input.idempotencyKey, 'idempotencyKey'),
    requestFingerprint: canonicalId(input.requestFingerprint, 'requestFingerprint')
  };
};

const lockAggregate = async (client: PoolClient, aggregateId: string): Promise<void> => {
  await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [aggregateId]);
};

export const saveTaskSnapshot = async (
  client: PoolClient,
  task: Task,
  expectedVersion: number
): Promise<void> => {
  assertVersion(expectedVersion, 'expectedVersion');
  const validatedTask = parseTask(task);
  const existing = await client.query<{ version: number }>(
    'SELECT version FROM tasks WHERE task_id = $1 FOR UPDATE',
    [validatedTask.id]
  );

  if (existing.rowCount === 0) {
    if (expectedVersion !== 0 || validatedTask.version !== 0) {
      throw new OptimisticConcurrencyError(validatedTask.id, expectedVersion, 0);
    }
    await client.query(
      `INSERT INTO workflows (workflow_id, created_at, updated_at)
       VALUES ($1, $2, $2)
       ON CONFLICT (workflow_id) DO NOTHING`,
      [validatedTask.workflowId, validatedTask.createdAt]
    );
    await client.query(
      `INSERT INTO tasks (
         task_id, workflow_id, state, dependency_ids, recovery_cycles, version, updated_at,
         required_capabilities, output_contract, budget, project_id, parent_task_id,
         owner_agent_definition_id, deadline, trace_id, created_at, priority, title,
         description, is_deployment, deployment_approval_id, deployment_attempt_id
       ) VALUES (
         $1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
         $11, $12, $13, $14, $15, $22, $16, $17, $18, $19, $20, $21
       )`,
      taskInsertParameters(validatedTask)
    );
    return;
  }

  const actualVersion = existing.rows[0].version;
  if (actualVersion !== expectedVersion) {
    throw new OptimisticConcurrencyError(validatedTask.id, expectedVersion, actualVersion);
  }
  if (validatedTask.version !== expectedVersion + 1) {
    throw new InvalidPersistenceOperationError(
      `Task ${validatedTask.id} must have version ${expectedVersion + 1}`
    );
  }

  const updated = await client.query(
    `UPDATE tasks SET ${updateTaskColumns}
     WHERE task_id = $1 AND version = $22`,
    [...taskParameters(validatedTask), expectedVersion]
  );
  if (updated.rowCount !== 1) {
    throw new OptimisticConcurrencyError(validatedTask.id, expectedVersion, actualVersion);
  }
}

const saveRecoveryRecord = async (
  client: PoolClient,
  input: PreparedSaveRecoveryAndAppendInput
): Promise<boolean> => {
  const existingResult = await client.query<RecoveryRecordRow>(
    `SELECT recovery_id, task_id, cycle, fingerprint, plan, state, created_at, evidence_ids,
            start_fingerprint, completion_fingerprint,
            start_idempotency_key, start_request_fingerprint,
            completion_idempotency_key, completion_request_fingerprint,
            idempotency_key, request_fingerprint
     FROM recovery_records
     WHERE recovery_id = $1 OR start_idempotency_key = $2 OR completion_idempotency_key = $2
        OR idempotency_key = $2
     ORDER BY CASE WHEN recovery_id = $1 THEN 0 ELSE 1 END
     LIMIT 1
     FOR UPDATE`,
    [input.record.recoveryId, input.idempotencyKey]
  );
  const existing = existingResult.rows[0];
  if (existing !== undefined) {
    const stored = recoveryRecordFromRow(existing);
    const replayed = input.record.state === 'STARTED'
      ? (existing.start_idempotency_key ?? existing.idempotency_key) === input.idempotencyKey &&
        (existing.start_request_fingerprint ?? existing.request_fingerprint) === input.requestFingerprint
      : (existing.completion_idempotency_key === input.idempotencyKey &&
        existing.completion_request_fingerprint === input.requestFingerprint);
    if (replayed) {
      if (!sameValue(stored, input.record)) {
        throw new DuplicatePersistenceIdError('recovery record', input.idempotencyKey);
      }
      return true;
    }
    if (input.record.state === 'STARTED' || existing.state !== 'STARTED' || existing.recovery_id !== input.record.recoveryId) {
      throw new DuplicatePersistenceIdError('recovery record', input.idempotencyKey);
    }
    if (stored.taskId !== input.record.taskId || stored.cycle !== input.record.cycle ||
        stored.fingerprint !== input.record.fingerprint ||
        !sameValue(stored.plan, input.record.plan) ||
        stored.createdAt.getTime() !== input.record.createdAt.getTime() ||
        stored.startFingerprint !== input.record.startFingerprint) {
      throw new DuplicatePersistenceIdError('recovery record', input.idempotencyKey);
    }

    await client.query(
      `UPDATE recovery_records
       SET state = $2,
           evidence_ids = $3,
           completion_fingerprint = $4,
           completion_idempotency_key = $5,
           completion_request_fingerprint = $6
       WHERE recovery_id = $1
         AND state = 'STARTED'
         AND completion_idempotency_key IS NULL`,
      [
        input.record.recoveryId,
        input.record.state,
        json(input.record.evidenceIds),
        input.record.completionFingerprint ?? null,
        input.idempotencyKey,
        input.requestFingerprint
      ]
    );
    return false;
  }

  if (input.record.state !== 'STARTED') {
    throw new InvalidPersistenceOperationError('A recovery record must be started before completion');
  }

  await client.query(
    `INSERT INTO recovery_records (
       recovery_id, task_id, cycle, fingerprint, plan, state, created_at, evidence_ids,
       start_fingerprint, completion_fingerprint,
       start_idempotency_key, start_request_fingerprint,
       completion_idempotency_key, completion_request_fingerprint,
       idempotency_key, request_fingerprint
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)`,
    recoveryRecordParameters(input.record, input.idempotencyKey, input.requestFingerprint)
  );
  return false;
};

const retireRecoveredTaskDispatch = async (
  client: PoolClient,
  taskId: Task['id']
): Promise<void> => {
  await client.query('DELETE FROM task_dispatch_claims WHERE task_id = $1', [taskId]);
  await client.query(
    `UPDATE outbox_commands
     SET completed_at = COALESCE(completed_at, CURRENT_TIMESTAMP)
     WHERE command_type = 'START_AGENT_SESSION'
       AND completed_at IS NULL
       AND payload ->> 'taskId' = $1`,
    [taskId]
  );
};

const saveApprovalDecision = async (
  client: PoolClient,
  input: PreparedSaveApprovalDecisionAndTaskInput
): Promise<boolean> => {
  const existing = await client.query<{
    version: number;
    decision_idempotency_key: string | null;
    decision_fingerprint: string | null;
  }>(
    `SELECT version, decision_idempotency_key, decision_fingerprint
     FROM approvals
     WHERE approval_id = $1
     FOR UPDATE`,
    [input.approval.approvalId]
  );
  const row = existing.rows[0];
  if (row === undefined) {
    throw new InvalidPersistenceOperationError(`Approval ${input.approval.approvalId} was not found`);
  }
  if (row.decision_idempotency_key !== null) {
    if (
      row.decision_idempotency_key !== input.idempotencyKey ||
      row.decision_fingerprint !== input.requestFingerprint
    ) {
      throw new DuplicatePersistenceIdError('approval decision', input.idempotencyKey);
    }
    return true;
  }
  if (row.version !== input.expectedApprovalVersion) {
    throw new OptimisticConcurrencyError(
      input.approval.approvalId,
      input.expectedApprovalVersion,
      row.version
    );
  }
  if (input.approval.version !== input.expectedApprovalVersion + 1) {
    throw new InvalidPersistenceOperationError(
      `Approval ${input.approval.approvalId} must have version ${input.expectedApprovalVersion + 1}`
    );
  }

  const updated = await client.query(
    `UPDATE approvals
     SET state = $2,
         decision = $3,
         decision_reason = $4,
         decided_by = $5,
         decided_at = $6,
         version = $7,
         updated_at = $8,
         decision_idempotency_key = $9,
         decision_fingerprint = $10
     WHERE approval_id = $1 AND version = $11 AND decision_idempotency_key IS NULL`,
    [
      input.approval.approvalId,
      input.approval.state,
      input.approval.decision,
      input.approval.decisionReason,
      input.approval.decidedBy === null ? null : json(input.approval.decidedBy),
      input.approval.decidedAt,
      input.approval.version,
      input.approval.updatedAt,
      input.idempotencyKey,
      input.requestFingerprint,
      input.expectedApprovalVersion
    ]
  );
  if (updated.rowCount !== 1) {
    throw new OptimisticConcurrencyError(
      input.approval.approvalId,
      input.expectedApprovalVersion,
      row.version
    );
  }
  return false;
};

const saveApprovalRequestRecord = async (
  client: PoolClient,
  input: PreparedSaveApprovalRequestInput
): Promise<{ record: ApprovalRecord; replayed: boolean }> => {
  const existingResult = await client.query<ApprovalRow>(
    `SELECT approval_id, subject_type, subject_id, reason, requested_by, correlation_id,
            causation_id, state, decision, decision_reason, decided_by, decided_at,
            version, created_at, updated_at, request_idempotency_key, request_fingerprint
     FROM approvals
     WHERE approval_id = $1 OR request_idempotency_key = $2
     ORDER BY CASE WHEN approval_id = $1 THEN 0 ELSE 1 END
     LIMIT 1
     FOR UPDATE`,
    [input.approval.approvalId, input.idempotencyKey]
  );
  const existing = existingResult.rows[0];
  if (existing !== undefined) {
    if (
      existing.request_idempotency_key !== input.idempotencyKey ||
      existing.request_fingerprint !== input.requestFingerprint
    ) {
      throw new DuplicatePersistenceIdError('approval request', input.idempotencyKey);
    }
    return { record: approvalFromRow(existing), replayed: true };
  }

  await client.query(
    `INSERT INTO approvals (
       approval_id, subject_type, subject_id, reason, requested_by, correlation_id,
       causation_id, state, decision, decision_reason, decided_by, decided_at,
       version, created_at, updated_at, request_idempotency_key, request_fingerprint
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, 'PENDING', NULL, NULL, NULL, NULL, $8, $9, $10, $11, $12)`,
    [
      input.approval.approvalId,
      input.approval.subjectType,
      input.approval.subjectId,
      input.approval.reason,
      json(input.approval.requestedBy),
      input.approval.correlationId,
      input.approval.causationId,
      input.approval.version,
      input.approval.createdAt,
      input.approval.updatedAt,
      input.idempotencyKey,
      input.requestFingerprint
    ]
  );
  return { record: input.approval, replayed: false };
};

const appendApprovalRequestWithClient = async (
  client: PoolClient,
  event: DomainEvent
): Promise<void> => {
  const parsedEvent = parseDomainEvent(event);
  if (
    parsedEvent.aggregateType !== 'APPROVAL' ||
    parsedEvent.eventType !== 'APPROVAL_REQUESTED' ||
    parsedEvent.aggregateVersion !== 0
  ) {
    throw new InvalidPersistenceOperationError(
      'Only an APPROVAL_REQUESTED event at aggregate version 0 can initialize an approval stream'
    );
  }

  const existingResult = await client.query<DomainEventRow>(
    `SELECT event_id, aggregate_type, aggregate_id, aggregate_version, event_type, payload, actor,
            correlation_id, causation_id, occurred_at
     FROM domain_events
     WHERE event_id = $1`,
    [parsedEvent.eventId]
  );
  const existing = existingResult.rows[0];
  if (existing !== undefined) {
    if (!sameValue(toDomainEvent(existing), parsedEvent)) {
      throw new DuplicatePersistenceIdError('event', parsedEvent.eventId);
    }
    return;
  }

  const streamResult = await client.query<{ version: number }>(
    `SELECT COALESCE(MAX(aggregate_version), -1)::integer AS version
     FROM domain_events
     WHERE aggregate_id = $1`,
    [parsedEvent.aggregateId]
  );
  const actualVersion = streamResult.rows[0].version;
  if (actualVersion !== -1) {
    throw new OptimisticConcurrencyError(parsedEvent.aggregateId, -1, actualVersion);
  }
  await client.query(
    `INSERT INTO domain_events (
       event_id, aggregate_type, aggregate_id, aggregate_version, event_type, payload, actor,
       correlation_id, causation_id, occurred_at
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
    eventParameters(parsedEvent)
  );
};

export class PostgresStore implements EventStore, TransactionalPersistence {
  public constructor(private readonly pool: Pool) {}

  public async saveRecoveryAndAppend(input: SaveTaskAndAppendInput & {
    record: RecoveryRecord;
    idempotencyKey: string;
    requestFingerprint: string;
  }): Promise<void> {
    const prepared = prepareSaveRecoveryAndAppend(input);
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await lockAggregate(client, prepared.task.id);
      await lockAggregate(client, `recovery-request:${prepared.idempotencyKey}`);
      const replayed = await saveRecoveryRecord(client, prepared);
      if (!replayed) {
        await saveTaskSnapshot(client, prepared.task, prepared.expectedVersion);
        await this.appendEvents(client, prepared.events, prepared.expectedVersion);
        await this.enqueueCommands(client, prepared.commands);
        if (prepared.record.state === 'SUCCEEDED' && prepared.task.state === 'READY') {
          await retireRecoveredTaskDispatch(client, prepared.task.id);
        }
      }
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }

  public async append(events: readonly DomainEvent[], expectedVersion: number): Promise<void> {
    assertVersion(expectedVersion, 'expectedVersion');
    const parsedEvents = parseEventBatch(events);
    if (parsedEvents.length === 0) {
      return;
    }
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const aggregateId = aggregateIdForLock(parsedEvents);
      if (aggregateId !== undefined) {
        await lockAggregate(client, aggregateId);
      }
      await this.appendEvents(client, parsedEvents, expectedVersion);
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }

  public async appendApprovalRequest(event: DomainEvent): Promise<void> {
    const parsedEvent = parseDomainEvent(event);
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await lockAggregate(client, parsedEvent.aggregateId);
      await appendApprovalRequestWithClient(client, parsedEvent);
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }

  public async readStream(aggregateId: string, afterVersion = -1): Promise<DomainEvent[]> {
    assertReadVersion(afterVersion, 'afterVersion');
    const canonicalAggregateId = canonicalId(aggregateId, 'aggregateId');
    const result = await this.pool.query<DomainEventRow>(
      `SELECT event_id, aggregate_type, aggregate_id, aggregate_version, event_type, payload, actor,
              correlation_id, causation_id, occurred_at
       FROM domain_events
       WHERE aggregate_id = $1 AND aggregate_version > $2
       ORDER BY aggregate_version ASC`,
      [canonicalAggregateId, afterVersion]
    );
    return result.rows.map(toDomainEvent);
  }

  public async hasEvent(eventId: EventId): Promise<boolean> {
    const canonicalEventId = parseEventId(eventId);
    const result = await this.pool.query(
      'SELECT 1 FROM domain_events WHERE event_id = $1',
      [canonicalEventId]
    );
    return result.rowCount === 1;
  }

  public async saveTaskAndAppend(input: SaveTaskAndAppendInput): Promise<void> {
    const prepared = prepareSaveTaskAndAppend(input);
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const aggregateId = aggregateIdForLock(prepared.events);
      if (aggregateId !== undefined) {
        await lockAggregate(client, aggregateId);
      }
      await saveTaskSnapshot(client, prepared.task, prepared.expectedVersion);
      await this.appendEvents(client, prepared.events, prepared.expectedVersion);
      await this.enqueueCommands(client, prepared.commands);
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }

  public async saveApprovalRequest(input: SaveApprovalRequestInput): Promise<ApprovalRecord> {
    const prepared = prepareSaveApprovalRequest(input);
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await lockAggregate(client, `approval-request:${prepared.idempotencyKey}`);
      await lockAggregate(client, prepared.approval.approvalId);
      const persisted = await saveApprovalRequestRecord(client, prepared);
      if (!persisted.replayed) {
        await appendApprovalRequestWithClient(client, prepared.requestEvent);
        await this.enqueueCommands(client, [prepared.command]);
      }
      await client.query('COMMIT');
      return persisted.record;
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }

  public async saveApprovalDecisionAndTask(input: SaveApprovalDecisionAndTaskInput): Promise<void> {
    const prepared = prepareSaveApprovalDecisionAndTask(input);
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await lockAggregate(client, prepared.approval.approvalId);
      const alreadyApplied = await saveApprovalDecision(client, prepared);
      if (!alreadyApplied) {
        if (prepared.task !== undefined && prepared.expectedTaskVersion !== undefined) {
          await saveTaskSnapshot(client, prepared.task, prepared.expectedTaskVersion);
        }
        await this.appendEvents(client, [prepared.approvalEvent], prepared.expectedApprovalVersion);
        if (prepared.taskEvent !== undefined && prepared.expectedTaskVersion !== undefined) {
          await this.appendEvents(client, [prepared.taskEvent], prepared.expectedTaskVersion);
        }
        await this.enqueueCommands(client, prepared.commands);
      }
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }

  public async claimDispatch(input: DispatchClaimRequest): Promise<DispatchClaim | null> {
    const taskIdValue = canonicalId(input.taskId, 'taskId');
    const workerId = canonicalId(input.workerId, 'workerId');
    const agentId = canonicalId(input.agentDefinitionId, 'agentDefinitionId');
    const leaseId = canonicalId(input.leaseId, 'leaseId');
    const sessionId = canonicalId(input.sessionId, 'sessionId');
    if (!Number.isInteger(input.taskVersion) || input.taskVersion < 0 || input.taskState !== 'READY') return null;
    if (input.expiresAt.getTime() <= input.now.getTime()) {
      throw new InvalidPersistenceOperationError('Dispatch claim expiry must follow now');
    }
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await lockAggregate(client, `agent-capacity:${agentId}`);
      const taskResult = await client.query<{ version: number; state: string; owner_agent_definition_id: string | null }>(
        'SELECT version, state, owner_agent_definition_id FROM tasks WHERE task_id = $1 FOR UPDATE', [taskIdValue]
      );
      const task = taskResult.rows[0];
      if (task === undefined || task.version !== input.taskVersion || task.state !== 'READY' || (task.owner_agent_definition_id !== null && task.owner_agent_definition_id !== agentId)) {
        await client.query('ROLLBACK');
        return null;
      }
      if (input.maxConcurrency !== undefined) {
        const usage = await client.query<{ running: string; pending: string }>(
          `SELECT (SELECT COUNT(*) FROM tasks WHERE owner_agent_definition_id = $1 AND state = 'RUNNING')::text AS running,
                  (SELECT COUNT(*) FROM task_dispatch_claims c JOIN tasks t ON t.task_id = c.task_id
                   WHERE c.agent_definition_id = $1 AND c.task_id <> $2 AND t.state = 'READY'
                   AND c.expires_at > $3 AND c.cleanup_in_progress = false)::text AS pending`,
          [agentId, taskIdValue, input.now]
        );
        if (Number(usage.rows[0].running) + Number(usage.rows[0].pending) >= input.maxConcurrency) {
          await client.query('ROLLBACK');
          return null;
        }
      }
      const result = await client.query<{
      task_id: string; worker_id: string; agent_definition_id: string; lease_id: string;
      expires_at: Date; session_id: string; task_version: number; task_state: string;
      generation: number; cleanup_in_progress: boolean;
    }>(
      `INSERT INTO task_dispatch_claims (task_id, worker_id, agent_definition_id, task_version, task_state, lease_id, session_id, expires_at)
       VALUES ($1, $2, $3, $4, 'READY', $5, $6, $7)
       ON CONFLICT (task_id) DO UPDATE SET worker_id = EXCLUDED.worker_id, expires_at = EXCLUDED.expires_at,
         task_version = EXCLUDED.task_version, task_state = EXCLUDED.task_state,
         agent_definition_id = EXCLUDED.agent_definition_id,
         lease_id = CASE WHEN task_dispatch_claims.task_version = EXCLUDED.task_version
           THEN task_dispatch_claims.lease_id ELSE EXCLUDED.lease_id END,
         session_id = CASE WHEN task_dispatch_claims.task_version = EXCLUDED.task_version
           THEN task_dispatch_claims.session_id ELSE EXCLUDED.session_id END,
         generation = task_dispatch_claims.generation + 1, cleanup_in_progress = false
       WHERE task_dispatch_claims.cleanup_in_progress = false
         AND (task_dispatch_claims.task_version < EXCLUDED.task_version OR task_dispatch_claims.expires_at <= $8)
         AND (task_dispatch_claims.task_version < EXCLUDED.task_version OR
           (task_dispatch_claims.agent_definition_id = EXCLUDED.agent_definition_id AND
            task_dispatch_claims.session_id = EXCLUDED.session_id))
       RETURNING task_id, worker_id, agent_definition_id, lease_id, expires_at, session_id, task_version, task_state,
                 generation, cleanup_in_progress`,
      [taskIdValue, workerId, agentId, input.taskVersion, leaseId, sessionId, input.expiresAt, input.now]
    );
      await client.query('COMMIT');
      const row = result.rows[0];
      return row === undefined ? null : {
        taskId: row.task_id as DispatchClaim['taskId'], workerId: row.worker_id,
        agentDefinitionId: row.agent_definition_id as DispatchClaim['agentDefinitionId'],
        taskVersion: row.task_version, taskState: row.task_state as DispatchClaim['taskState'],
        leaseId: row.lease_id, sessionId: agentSessionId(row.session_id), now: input.now, expiresAt: row.expires_at,
        generation: row.generation, cleanupInProgress: row.cleanup_in_progress
      };
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }

  public async getDispatchClaim(taskId: Task['id']): Promise<DispatchClaim | null> {
    const result = await this.pool.query<{
      task_id: string; worker_id: string; agent_definition_id: string; lease_id: string;
      expires_at: Date; session_id: string; task_version: number; task_state: string;
      generation: number; cleanup_in_progress: boolean;
    }>(`SELECT task_id, worker_id, agent_definition_id, lease_id, expires_at, session_id,
              task_version, task_state, generation, cleanup_in_progress
           FROM task_dispatch_claims WHERE task_id = $1`, [taskId]);
    const row = result.rows[0];
    return row ? { taskId: row.task_id as Task['id'], workerId: row.worker_id,
      agentDefinitionId: row.agent_definition_id as DispatchClaim['agentDefinitionId'],
      taskVersion: row.task_version, taskState: row.task_state as DispatchClaim['taskState'],
      leaseId: row.lease_id, sessionId: agentSessionId(row.session_id), now: new Date(0),
      expiresAt: row.expires_at, generation: row.generation, cleanupInProgress: row.cleanup_in_progress } : null;
  }

  public async beginDispatchCleanup(taskId: Task['id'], workerId: string, leaseId: string, generation: number): Promise<boolean> {
    const result = await this.pool.query(
      `UPDATE task_dispatch_claims SET cleanup_in_progress = true
       WHERE task_id = $1 AND worker_id = $2 AND lease_id = $3 AND generation = $4
         AND cleanup_in_progress = false AND EXISTS
         (SELECT 1 FROM tasks WHERE task_id = $1 AND state = 'READY' AND version = task_dispatch_claims.task_version)`,
      [taskId, workerId, leaseId, generation]
    );
    return result.rowCount === 1;
  }

  public async abortDispatchCleanup(taskId: Task['id'], workerId: string, leaseId: string, generation: number): Promise<void> {
    await this.pool.query(
      `UPDATE task_dispatch_claims SET cleanup_in_progress = false
       WHERE task_id = $1 AND worker_id = $2 AND lease_id = $3 AND generation = $4`,
      [taskId, workerId, leaseId, generation]
    );
  }

  public async releaseDispatch(taskId: Task['id'], workerId: string, leaseId: string): Promise<boolean> {
    const result = await this.pool.query(
      'DELETE FROM task_dispatch_claims WHERE task_id = $1 AND worker_id = $2 AND lease_id = $3',
      [canonicalId(taskId, 'taskId'), canonicalId(workerId, 'workerId'), canonicalId(leaseId, 'leaseId')]
    );
    return result.rowCount === 1;
  }

  public async close(): Promise<void> {
    await this.pool.end();
  }

  private async appendEvents(
    client: PoolClient,
    events: readonly DomainEvent[],
    expectedVersion: number
  ): Promise<void> {
    assertVersion(expectedVersion, 'expectedVersion');
    if (events.length === 0) {
      return;
    }

    const parsedEvents = events;
    const aggregateId = parsedEvents[0].aggregateId;
    const seenIds = new Set<string>();
    for (const event of parsedEvents) {
      if (event.aggregateId !== aggregateId) {
        throw new InvalidPersistenceOperationError('An event append must target one aggregate');
      }
      if (seenIds.has(event.eventId)) {
        throw new DuplicatePersistenceIdError('event', event.eventId);
      }
      seenIds.add(event.eventId);
    }

    const existingResult = await client.query<DomainEventRow>(
      `SELECT event_id, aggregate_type, aggregate_id, aggregate_version, event_type, payload, actor,
              correlation_id, causation_id, occurred_at
       FROM domain_events
       WHERE event_id = ANY($1::text[])`,
      [[...seenIds]]
    );
    const existing = new Map(existingResult.rows.map((row) => [row.event_id, toDomainEvent(row)]));
    for (const event of parsedEvents) {
      const stored = existing.get(event.eventId);
      if (stored !== undefined && !sameValue(stored, event)) {
        throw new DuplicatePersistenceIdError('event', event.eventId);
      }
    }
    if (existing.size === parsedEvents.length) {
      return;
    }
    if (existing.size > 0) {
      throw new InvalidPersistenceOperationError('An append cannot mix stored and new events');
    }

    const currentVersionResult = await client.query<{ version: number }>(
      `SELECT COALESCE(MAX(aggregate_version), 0)::integer AS version
       FROM domain_events
       WHERE aggregate_id = $1`,
      [aggregateId]
    );
    const actualVersion = currentVersionResult.rows[0].version;
    if (actualVersion !== expectedVersion) {
      throw new OptimisticConcurrencyError(aggregateId, expectedVersion, actualVersion);
    }
    parsedEvents.forEach((event, index) => {
      const expectedEventVersion = expectedVersion + index + 1;
      if (event.aggregateVersion !== expectedEventVersion) {
        throw new InvalidPersistenceOperationError(
          `Event ${event.eventId} must have aggregate version ${expectedEventVersion}`
        );
      }
    });

    for (const event of parsedEvents) {
      await client.query(
        `INSERT INTO domain_events (
           event_id, aggregate_type, aggregate_id, aggregate_version, event_type, payload, actor,
           correlation_id, causation_id, occurred_at
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
        eventParameters(event)
      );
    }
  }

  private async enqueueCommands(
    client: PoolClient,
    commands: readonly OutboxCommand[]
  ): Promise<void> {
    for (const command of commands) {
      const parsedCommand = parseOutboxCommand(command);
      await client.query(
        `INSERT INTO outbox_commands (
           command_id, command_type, payload, available_at, claimed_by, claimed_at,
           completed_at, actor, issued_at, correlation_id, causation_id
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
         ON CONFLICT (command_id) DO NOTHING`,
        commandParameters(parsedCommand)
      );
      const existingResult = await client.query<OutboxCommandRow>(
        `SELECT command_id, command_type, payload, available_at, claimed_by, claimed_at,
                completed_at, actor, issued_at, correlation_id, causation_id
         FROM outbox_commands
         WHERE command_id = $1`,
        [parsedCommand.commandId]
      );
      if (existingResult.rowCount !== 1) {
        throw new InvalidPersistenceOperationError(
          `Outbox command ${parsedCommand.commandId} was not persisted`
        );
      }
      const existing = toOutboxCommand(existingResult.rows[0]);
      if (!sameOutboxCommandIdentity(existing, parsedCommand)) {
        throw new DuplicatePersistenceIdError('outbox command', parsedCommand.commandId);
      }
    }
  }
}
