import { Pool, type PoolClient } from 'pg';
import {
  ActorRefSchema,
  AgentSessionSchema,
  CorrelationIdSchema,
  EventIdSchema,
  AgentSessionIdSchema,
  TaskIdSchema,
  WorkflowIdSchema,
  type OutboxCommand,
  type Task,
  type AgentSession,
  type AgentSessionId,
  type TaskId,
  type WorkflowId
} from '@aicompany/contracts';
import {
  DuplicatePersistenceIdError,
  InvalidPersistenceOperationError,
  type AgentSessionRepository,
  type CheckpointStore,
  type CostSink,
  type Message,
  type MessageStore,
  type AgentCheckpoint,
  type UsageRecord,
  type RecoveryRecord,
  type RecoveryRecordStore,
  type Outbox,
  type TaskRepository
} from '@aicompany/orchestration-core';
import {
  assertVersion,
  canonicalId,
  parseOutboxCommand,
  parseTask,
  parseTaskId,
  parseWorkflowId,
  sameOutboxCommandIdentity,
  sameValue
} from './persistence-validation.js';
import {
  saveTaskSnapshot,
  parseRecoveryRecord,
  recoveryRecordFromRow,
  recoveryRecordParameters,
  taskFromRow,
  type OutboxCommandRow,
  type RecoveryRecordRow,
  type TaskRow
} from './postgres-store.js';

const clone = <T>(value: T): T => globalThis.structuredClone(value);

const json = (value: unknown): string => JSON.stringify(value) ?? 'null';

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

const recoveryRecordColumns = `recovery_id, task_id, cycle, fingerprint, plan, state, created_at, evidence_ids,
  start_fingerprint, completion_fingerprint, start_idempotency_key, start_request_fingerprint,
  completion_idempotency_key, completion_request_fingerprint, idempotency_key, request_fingerprint`;

export class PostgresRecoveryRecordStore implements RecoveryRecordStore {
  public constructor(private readonly pool: Pool) {}

  public async get(recoveryId: string): Promise<RecoveryRecord | null> {
    const canonicalRecoveryId = canonicalId(recoveryId, 'recoveryId');
    const result = await this.pool.query<RecoveryRecordRow>(
      `SELECT ${recoveryRecordColumns}
       FROM recovery_records
       WHERE recovery_id = $1`,
      [canonicalRecoveryId]
    );
    return result.rowCount === 0 ? null : recoveryRecordFromRow(result.rows[0]);
  }

  public async list(taskId: Task['id']): Promise<RecoveryRecord[]> {
    const canonicalTaskId = parseTaskId(taskId);
    const result = await this.pool.query<RecoveryRecordRow>(
      `SELECT ${recoveryRecordColumns}
       FROM recovery_records
       WHERE task_id = $1
       ORDER BY cycle ASC, recovery_id ASC`,
      [canonicalTaskId]
    );
    return result.rows.map(recoveryRecordFromRow);
  }

  public async save(record: RecoveryRecord): Promise<void> {
    const parsed = parseRecoveryRecord(record);
    await this.pool.query(
       `INSERT INTO recovery_records (
         recovery_id, task_id, cycle, fingerprint, plan, state, created_at, evidence_ids,
         start_fingerprint, completion_fingerprint, start_idempotency_key, start_request_fingerprint,
         completion_idempotency_key, completion_request_fingerprint, idempotency_key, request_fingerprint
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
       ON CONFLICT (recovery_id) DO NOTHING`,
      recoveryRecordParameters(parsed)
    );
    const persisted = await this.get(parsed.recoveryId);
    if (persisted === null || !sameValue(persisted, parsed)) {
      throw new DuplicatePersistenceIdError('recovery record', parsed.recoveryId);
    }
  }
}

interface AgentSessionRow {
  session_id: string; task_id: string; workflow_id: string; agent_definition_id: string;
  state: string; context_reference: string; checkpoint_reference: string | null;
  trace_id: string; usage: unknown; tool_call_history: unknown; attempt: number | null;
  version: number; start_idempotency_key: string | null; start_fingerprint: string | null;
  created_at: Date; updated_at: Date;
}

const sessionFromRow = (row: AgentSessionRow): AgentSession => AgentSessionSchema.parse({
  sessionId: row.session_id, taskId: row.task_id, workflowId: row.workflow_id,
  agentDefinitionId: row.agent_definition_id, state: row.state,
  contextReference: row.context_reference, checkpointReference: row.checkpoint_reference,
  traceId: row.trace_id, usage: row.usage, toolCallHistory: row.tool_call_history,
  ...(row.attempt === null ? {} : { attempt: row.attempt }), version: row.version,
  createdAt: row.created_at, updatedAt: row.updated_at
});

export class PostgresAgentSessionRepository implements AgentSessionRepository {
  public constructor(private readonly pool: Pool) {}

  public async get(sessionId: AgentSessionId): Promise<AgentSession | null> {
    const result = await this.pool.query<AgentSessionRow>(this.sessionSelect('session_id = $1'), [AgentSessionIdSchema.parse(sessionId)]);
    return result.rowCount === 0 ? null : sessionFromRow(result.rows[0]);
  }

  public async findByTask(taskId: TaskId, idempotencyKey: string): Promise<AgentSession | null> {
    const result = await this.pool.query<AgentSessionRow>(this.sessionSelect('task_id = $1 AND start_idempotency_key = $2'), [TaskIdSchema.parse(taskId), idempotencyKey]);
    return result.rowCount === 0 ? null : sessionFromRow(result.rows[0]);
  }

  public async startFingerprint(taskId: TaskId, idempotencyKey: string): Promise<string | null> {
    const result = await this.pool.query<{ start_fingerprint: string | null }>('SELECT start_fingerprint FROM agent_sessions WHERE task_id = $1 AND start_idempotency_key = $2', [TaskIdSchema.parse(taskId), idempotencyKey]);
    return result.rowCount === 0 ? null : result.rows[0].start_fingerprint;
  }

  public async save(input: AgentSession, expectedVersion: number): Promise<void> {
    const session = AgentSessionSchema.parse(input);
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const existing = await client.query<{ version: number }>('SELECT version FROM agent_sessions WHERE session_id = $1 FOR UPDATE', [session.sessionId]);
      if (existing.rowCount === 0) {
        if (expectedVersion !== 0 || session.version !== 0) throw new InvalidPersistenceOperationError('New session must start at version 0');
        await client.query(`INSERT INTO agent_sessions (session_id, task_id, workflow_id, agent_definition_id, state, context_reference, checkpoint_reference, trace_id, usage, tool_call_history, attempt, version, created_at, updated_at)
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`, [session.sessionId, session.taskId, session.workflowId, session.agentDefinitionId, session.state, session.contextReference, session.checkpointReference, session.traceId, JSON.stringify(session.usage), JSON.stringify(session.toolCallHistory), session.attempt ?? null, session.version, session.createdAt, session.updatedAt]);
      } else {
        if (existing.rows[0].version !== expectedVersion || session.version !== expectedVersion + 1) throw new InvalidPersistenceOperationError('Session version conflict');
        await client.query(`UPDATE agent_sessions SET state=$2, context_reference=$3, checkpoint_reference=$4, usage=$5, tool_call_history=$6, attempt=$7, version=$8, updated_at=$9 WHERE session_id=$1 AND version=$10`, [session.sessionId, session.state, session.contextReference, session.checkpointReference, JSON.stringify(session.usage), JSON.stringify(session.toolCallHistory), session.attempt ?? null, session.version, session.updatedAt, expectedVersion]);
      }
      await client.query('COMMIT');
    } catch (error) { await client.query('ROLLBACK').catch(() => undefined); throw error; }
    finally { client.release(); }
  }

  private sessionSelect(where: string): string { return `SELECT session_id, task_id, workflow_id, agent_definition_id, state, context_reference, checkpoint_reference, trace_id, usage, tool_call_history, attempt, version, start_idempotency_key, start_fingerprint, created_at, updated_at FROM agent_sessions WHERE ${where}`; }
}

export class PostgresCheckpointStore implements CheckpointStore {
  public constructor(private readonly pool: Pool) {}

  public async save(input: AgentCheckpoint): Promise<void> {
    const sessionId = AgentSessionIdSchema.parse(input.sessionId);
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const latest = await client.query<{ sequence: number; state: string; completed_operation_keys: string[] }>('SELECT sequence, state, completed_operation_keys FROM agent_checkpoints WHERE session_id = $1 ORDER BY sequence DESC LIMIT 1 FOR UPDATE', [sessionId]);
      const current = latest.rows[0];
      if (current?.state === 'COMPLETED') throw new InvalidPersistenceOperationError('Completed session checkpoint is terminal');
      if (current && input.sequence !== current.sequence + 1) throw new InvalidPersistenceOperationError('Checkpoint sequence must advance exactly one step');
      if (!current && input.sequence !== 1) throw new InvalidPersistenceOperationError('First checkpoint sequence must be 1');
      const keys = [...new Set([...(current?.completed_operation_keys ?? []), ...input.completedOperationKeys])];
      await client.query(`INSERT INTO agent_checkpoints (session_id, sequence, task_id, state, context_reference, last_event_id, completed_operation_keys, created_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`, [sessionId, input.sequence, TaskIdSchema.parse(input.taskId), input.state, input.contextReference, EventIdSchema.parse(input.lastEventId), JSON.stringify(keys), input.createdAt]);
      await client.query('COMMIT');
    } catch (error) { await client.query('ROLLBACK').catch(() => undefined); throw error; }
    finally { client.release(); }
  }

  public async latest(sessionId: AgentSessionId): Promise<AgentCheckpoint | null> {
    const result = await this.pool.query<{ session_id: string; sequence: number; task_id: string; state: string; context_reference: string; last_event_id: string; completed_operation_keys: string[]; created_at: Date }>('SELECT session_id, sequence, task_id, state, context_reference, last_event_id, completed_operation_keys, created_at FROM agent_checkpoints WHERE session_id = $1 ORDER BY sequence DESC LIMIT 1', [AgentSessionIdSchema.parse(sessionId)]);
    const row = result.rows[0];
    return row ? { sessionId: AgentSessionIdSchema.parse(row.session_id), taskId: TaskIdSchema.parse(row.task_id), sequence: row.sequence, state: row.state as AgentCheckpoint['state'], contextReference: row.context_reference, lastEventId: EventIdSchema.parse(row.last_event_id), completedOperationKeys: row.completed_operation_keys, createdAt: row.created_at } : null;
  }
}

export class PostgresMessageStore implements MessageStore {
  public constructor(private readonly pool: Pool) {}

  public async append(message: Message, idempotencyKey: string): Promise<Message> {
    await this.pool.query(`INSERT INTO messages (message_id, idempotency_key, actor, scope, message_type, content_reference, correlation_id, causation_id, created_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) ON CONFLICT (idempotency_key) DO NOTHING`, [message.messageId, idempotencyKey, JSON.stringify(message.actor), JSON.stringify(message.scope), message.messageType, message.contentReference, message.correlationId, message.causationId, message.createdAt]);
    const result = await this.pool.query('SELECT message_id, actor, scope, message_type, content_reference, correlation_id, causation_id, created_at FROM messages WHERE idempotency_key = $1', [idempotencyKey]);
    const row = result.rows[0];
    if (!row) throw new InvalidPersistenceOperationError('Message was not persisted');
    return { messageId: row.message_id, actor: ActorRefSchema.parse(row.actor), scope: row.scope, messageType: row.message_type, contentReference: row.content_reference, correlationId: CorrelationIdSchema.parse(row.correlation_id), causationId: EventIdSchema.parse(row.causation_id), createdAt: row.created_at } as Message;
  }

  public async list(scope: Message['scope'], after?: string): Promise<Message[]> {
    const result = await this.pool.query('SELECT message_id, actor, scope, message_type, content_reference, correlation_id, causation_id, created_at FROM messages WHERE scope = $1 ORDER BY created_at ASC, message_id ASC', [JSON.stringify(scope)]);
    const rows = after ? result.rows.slice(Math.max(0, result.rows.findIndex((row) => row.message_id === after) + 1)) : result.rows;
    return rows.map((row) => ({ messageId: row.message_id, actor: ActorRefSchema.parse(row.actor), scope: row.scope, messageType: row.message_type, contentReference: row.content_reference, correlationId: CorrelationIdSchema.parse(row.correlation_id), causationId: EventIdSchema.parse(row.causation_id), createdAt: row.created_at } as Message));
  }
}

export class PostgresCostSink implements CostSink {
  public constructor(private readonly pool: Pool) {}

  public async recordUsage(input: UsageRecord): Promise<void> {
    await this.pool.query(`INSERT INTO usage_records (usage_id, workflow_id, task_id, agent_session_id, agent_definition_id, department, provider, base_url_identifier, model, input_tokens, output_tokens, estimated_cost_usd, created_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) ON CONFLICT (usage_id) DO NOTHING`, [input.usageId, input.workflowId, input.taskId, input.agentSessionId, input.agentDefinitionId, input.department, input.provider, input.baseUrlIdentifier, input.model, input.inputTokens, input.outputTokens, input.estimatedCostUsd, input.createdAt]);
  }

  public async getWorkflowCost(workflowId: WorkflowId) {
    const normalized = WorkflowIdSchema.parse(workflowId);
    const result = await this.pool.query<{ model: string; department: string; agent: string; input_tokens: string; output_tokens: string; cost: string }>('SELECT model, department, agent_definition_id AS agent, SUM(input_tokens)::text AS input_tokens, SUM(output_tokens)::text AS output_tokens, SUM(estimated_cost_usd)::text AS cost FROM usage_records WHERE workflow_id = $1 GROUP BY model, department, agent_definition_id', [normalized]);
    const summary = { workflowId: normalized, inputTokens: 0, outputTokens: 0, estimatedCostUsd: 0, byModel: Object.create(null) as Record<string, number>, byDepartment: Object.create(null) as Record<string, number>, byAgent: Object.create(null) as Record<string, number> };
    for (const row of result.rows) { const input = Number(row.input_tokens); const output = Number(row.output_tokens); const cost = Number(row.cost); summary.inputTokens += input; summary.outputTokens += output; summary.estimatedCostUsd += cost; summary.byModel[row.model] = (summary.byModel[row.model] ?? 0) + cost; summary.byDepartment[row.department] = (summary.byDepartment[row.department] ?? 0) + cost; summary.byAgent[row.agent] = (summary.byAgent[row.agent] ?? 0) + cost; }
    return summary;
  }
}

export class PostgresTaskRepository implements TaskRepository {
  public constructor(private readonly pool: Pool) {}

  public async countActiveByAgent(agentId: NonNullable<Task['ownerAgentDefinitionId']>): Promise<number> {
    const result = await this.pool.query<{ count: string }>(
      "SELECT COUNT(*)::text AS count FROM tasks WHERE owner_agent_definition_id = $1 AND state = 'RUNNING'", [agentId]
    );
    return Number(result.rows[0].count);
  }

  public async get(taskId: string): Promise<Task | null> {
    const canonicalTaskId = parseTaskId(taskId);
    const result = await this.pool.query<TaskRow>(
      `SELECT task_id, workflow_id, state, dependency_ids, recovery_cycles, version,
              updated_at, required_capabilities, output_contract, budget, project_id,
              parent_task_id, owner_agent_definition_id, deadline, trace_id, created_at,
              priority, title, description, is_deployment, deployment_approval_id, deployment_attempt_id
       FROM tasks
       WHERE task_id = $1`,
      [canonicalTaskId]
    );
    return result.rowCount === 0 ? null : taskFromRow(result.rows[0]);
  }

  public async listByWorkflow(workflowId: string): Promise<Task[]> {
    const canonicalWorkflowId = parseWorkflowId(workflowId);
    const result = await this.pool.query<TaskRow>(
      `SELECT task_id, workflow_id, state, dependency_ids, recovery_cycles, version,
              updated_at, required_capabilities, output_contract, budget, project_id,
              parent_task_id, owner_agent_definition_id, deadline, trace_id, created_at,
              priority, title, description, is_deployment, deployment_approval_id, deployment_attempt_id
       FROM tasks
       WHERE workflow_id = $1
       ORDER BY task_id ASC`,
      [canonicalWorkflowId]
    );
    return result.rows.map(taskFromRow);
  }

  public async save(task: Task, expectedVersion: number): Promise<void> {
    const parsedTask = parseTask(task);
    assertVersion(expectedVersion, 'expectedVersion');
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await saveTaskSnapshot(client, parsedTask, expectedVersion);
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }
}

export interface PostgresOutboxOptions {
  leaseDurationMs?: number;
}

export class PostgresOutbox implements Outbox {
  private readonly leaseDurationMs: number;

  public constructor(
    private readonly pool: Pool,
    options: PostgresOutboxOptions = {}
  ) {
    this.leaseDurationMs = options.leaseDurationMs ?? 5 * 60 * 1000;
    if (!Number.isFinite(this.leaseDurationMs) || this.leaseDurationMs < 0) {
      throw new InvalidPersistenceOperationError('leaseDurationMs must be a non-negative number');
    }
  }

  public async enqueue(command: OutboxCommand): Promise<void> {
    const parsedCommand = parseOutboxCommand(command);
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await this.enqueueWithClient(client, parsedCommand);
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }

  public async claim(limit: number, workerId: string): Promise<OutboxCommand[]> {
    if (!Number.isInteger(limit) || limit < 0) {
      throw new InvalidPersistenceOperationError('limit must be a non-negative integer');
    }
    const canonicalWorkerId = canonicalId(workerId, 'workerId');
    if (limit === 0) {
      return [];
    }

    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const selected = await client.query<OutboxCommandRow>(
        `SELECT command_id, command_type, payload, available_at, claimed_by, claimed_at,
                completed_at, actor, issued_at, correlation_id, causation_id
         FROM outbox_commands
         WHERE completed_at IS NULL
           AND available_at <= CURRENT_TIMESTAMP
           AND (
             claimed_by IS NULL
             OR claimed_at <= CURRENT_TIMESTAMP - ($2::double precision * interval '1 millisecond')
           )
         ORDER BY available_at ASC, command_id ASC
         FOR UPDATE SKIP LOCKED
         LIMIT $1`,
        [limit, this.leaseDurationMs]
      );
      const claimed: OutboxCommand[] = [];
      for (const row of selected.rows) {
        const updated = await client.query<OutboxCommandRow>(
          `UPDATE outbox_commands
           SET claimed_by = $2, claimed_at = CURRENT_TIMESTAMP
           WHERE command_id = $1
           RETURNING command_id, command_type, payload, available_at, claimed_by, claimed_at,
                     completed_at, actor, issued_at, correlation_id, causation_id`,
           [row.command_id, canonicalWorkerId]
        );
        claimed.push(toOutboxCommand(updated.rows[0]));
      }
      await client.query('COMMIT');
      return claimed.map(clone);
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }

  public async markCompleted(commandId: string): Promise<void> {
    const canonicalCommandId = canonicalId(commandId, 'commandId');
    const result = await this.pool.query(
      `UPDATE outbox_commands
       SET completed_at = CURRENT_TIMESTAMP
       WHERE command_id = $1 AND completed_at IS NULL`,
      [canonicalCommandId]
    );
    if (result.rowCount === 1) {
      return;
    }
    const exists = await this.pool.query(
      'SELECT 1 FROM outbox_commands WHERE command_id = $1',
      [canonicalCommandId]
    );
    if (exists.rowCount === 0) {
      throw new InvalidPersistenceOperationError(`Outbox command ${commandId} does not exist`);
    }
  }

  private async enqueueWithClient(
    client: PoolClient,
    command: OutboxCommand
  ): Promise<void> {
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
       WHERE command_id = $1
       FOR UPDATE`,
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
