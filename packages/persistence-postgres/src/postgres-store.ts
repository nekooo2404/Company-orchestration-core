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
  type SaveApprovalDecisionAndTaskInput,
  type DispatchClaim,
  type DispatchClaimRequest,
  type TransactionalPersistence
} from '@aicompany/orchestration-core';
import {
  assertVersion,
  canonicalId,
  parseDomainEvent,
  parseEventId,
  parseOutboxCommand,
  parseTask,
  sameOutboxCommandIdentity,
  sameValue
} from './persistence-validation';

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
  ...(row.is_deployment === null ? {} : { isDeployment: row.is_deployment })
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
  is_deployment = $19`;

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
  task.isDeployment ?? null
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
         description, is_deployment
       ) VALUES (
         $1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
         $11, $12, $13, $14, $15, $20, $16, $17, $18, $19
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
     WHERE task_id = $1 AND version = $20`,
    [...taskParameters(validatedTask), expectedVersion]
  );
  if (updated.rowCount !== 1) {
    throw new OptimisticConcurrencyError(validatedTask.id, expectedVersion, actualVersion);
  }
}

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

export class PostgresStore implements EventStore, TransactionalPersistence {
  public constructor(private readonly pool: Pool) {}

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

  public async readStream(aggregateId: string, afterVersion = 0): Promise<DomainEvent[]> {
    assertVersion(afterVersion, 'afterVersion');
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
      const taskResult = await client.query<{ version: number; state: string }>(
        'SELECT version, state FROM tasks WHERE task_id = $1 FOR UPDATE', [taskIdValue]
      );
      const task = taskResult.rows[0];
      if (task === undefined || task.version !== input.taskVersion || task.state !== 'READY') {
        await client.query('ROLLBACK');
        return null;
      }
      const result = await client.query<{
      task_id: string; worker_id: string; agent_definition_id: string; lease_id: string;
      expires_at: Date; session_id: string; task_version: number; task_state: string;
    }>(
      `INSERT INTO task_dispatch_claims (task_id, worker_id, agent_definition_id, task_version, task_state, lease_id, session_id, expires_at)
       VALUES ($1, $2, $3, $4, 'READY', $5, $6, $7)
       ON CONFLICT (task_id) DO UPDATE SET worker_id = EXCLUDED.worker_id, expires_at = EXCLUDED.expires_at,
         task_version = EXCLUDED.task_version, task_state = EXCLUDED.task_state
       WHERE task_dispatch_claims.expires_at <= $8
         AND task_dispatch_claims.agent_definition_id = EXCLUDED.agent_definition_id
         AND task_dispatch_claims.task_version = EXCLUDED.task_version
         AND task_dispatch_claims.session_id = EXCLUDED.session_id
       RETURNING task_id, worker_id, agent_definition_id, lease_id, expires_at, session_id, task_version, task_state`,
      [taskIdValue, workerId, agentId, input.taskVersion, leaseId, sessionId, input.expiresAt, input.now]
    );
      await client.query('COMMIT');
      const row = result.rows[0];
      return row === undefined ? null : {
        taskId: row.task_id as DispatchClaim['taskId'], workerId: row.worker_id,
        agentDefinitionId: row.agent_definition_id as DispatchClaim['agentDefinitionId'],
        taskVersion: row.task_version, taskState: row.task_state as DispatchClaim['taskState'],
        leaseId: row.lease_id, sessionId: agentSessionId(row.session_id), now: input.now, expiresAt: row.expires_at
      };
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
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
