import { Pool, type PoolClient } from 'pg';
import {
  type OutboxCommand,
  type Task
} from '@aicompany/contracts';
import {
  DuplicatePersistenceIdError,
  InvalidPersistenceOperationError,
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
