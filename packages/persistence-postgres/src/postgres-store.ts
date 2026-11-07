import { Pool, type PoolClient, type QueryResultRow } from 'pg';
import {
  DomainEventSchema,
  OutboxCommandSchema,
  TaskSchema,
  type DomainEvent,
  type EventId,
  type OutboxCommand,
  type Task
} from '@aicompany/contracts';
import {
  DuplicatePersistenceIdError,
  InvalidPersistenceOperationError,
  OptimisticConcurrencyError,
  type EventStore
} from '@aicompany/orchestration-core';

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

export interface SaveTaskAndAppendInput {
  task: Task;
  expectedVersion: number;
  events: readonly DomainEvent[];
  commands: readonly OutboxCommand[];
}

const canonicalize = (value: unknown): unknown => {
  if (value instanceof Date) {
    return value.toISOString();
  }
  if (Array.isArray(value)) {
    return value.map(canonicalize);
  }
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, nestedValue]) => [key, canonicalize(nestedValue)])
    );
  }
  return value;
};

const sameValue = (left: unknown, right: unknown): boolean =>
  JSON.stringify(canonicalize(left)) === JSON.stringify(canonicalize(right));

const json = (value: unknown): string => JSON.stringify(value) ?? 'null';

const assertVersion = (version: number, name: string): void => {
  if (!Number.isInteger(version) || version < 0) {
    throw new InvalidPersistenceOperationError(`${name} must be a non-negative integer`);
  }
};

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

const toOutboxCommand = (row: OutboxCommandRow): OutboxCommand => OutboxCommandSchema.parse({
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

const normalizeOutboxCommand = (command: OutboxCommand): OutboxCommand => ({
  ...command,
  claimedBy: command.claimedBy ?? null,
  claimedAt: command.claimedAt ?? null,
  completedAt: command.completedAt ?? null
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
  events.length === 0 ? undefined : DomainEventSchema.parse(events[0]).aggregateId;

const lockAggregate = async (client: PoolClient, aggregateId: string): Promise<void> => {
  await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [aggregateId]);
};

export const saveTaskSnapshot = async (
  client: PoolClient,
  task: Task,
  expectedVersion: number
): Promise<void> => {
  assertVersion(expectedVersion, 'expectedVersion');
  const validatedTask = TaskSchema.parse(task);
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

export class PostgresStore implements EventStore {
  public constructor(private readonly pool: Pool) {}

  public async append(events: readonly DomainEvent[], expectedVersion: number): Promise<void> {
    if (events.length === 0) {
      return;
    }
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const aggregateId = aggregateIdForLock(events);
      if (aggregateId !== undefined) {
        await lockAggregate(client, aggregateId);
      }
      await this.appendEvents(client, events, expectedVersion);
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
    const result = await this.pool.query<DomainEventRow>(
      `SELECT event_id, aggregate_type, aggregate_id, aggregate_version, event_type, payload, actor,
              correlation_id, causation_id, occurred_at
       FROM domain_events
       WHERE aggregate_id = $1 AND aggregate_version > $2
       ORDER BY aggregate_version ASC`,
      [aggregateId, afterVersion]
    );
    return result.rows.map(toDomainEvent);
  }

  public async hasEvent(eventId: EventId): Promise<boolean> {
    const result = await this.pool.query(
      'SELECT 1 FROM domain_events WHERE event_id = $1',
      [eventId]
    );
    return result.rowCount === 1;
  }

  public async saveTaskAndAppend(input: SaveTaskAndAppendInput): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const aggregateId = aggregateIdForLock(input.events);
      if (aggregateId !== undefined) {
        await lockAggregate(client, aggregateId);
      }
      await saveTaskSnapshot(client, input.task, input.expectedVersion);
      await this.appendEvents(client, input.events, input.expectedVersion);
      await this.enqueueCommands(client, input.commands);
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
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

    const parsedEvents = events.map((event) => DomainEventSchema.parse(event));
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
      const parsedCommand = OutboxCommandSchema.parse(command);
      const existingResult = await client.query<OutboxCommandRow>(
        `SELECT command_id, command_type, payload, available_at, claimed_by, claimed_at,
                completed_at, actor, issued_at, correlation_id, causation_id
         FROM outbox_commands
         WHERE command_id = $1`,
        [parsedCommand.commandId]
      );
      if (existingResult.rowCount === 1) {
        const existing = toOutboxCommand(existingResult.rows[0]);
        if (!sameValue(existing, normalizeOutboxCommand(parsedCommand))) {
          throw new DuplicatePersistenceIdError('outbox command', parsedCommand.commandId);
        }
        continue;
      }
      await client.query(
        `INSERT INTO outbox_commands (
           command_id, command_type, payload, available_at, claimed_by, claimed_at,
           completed_at, actor, issued_at, correlation_id, causation_id
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
        commandParameters(parsedCommand)
      );
    }
  }
}
