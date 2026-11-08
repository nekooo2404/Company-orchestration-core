import {
  type AgentDefinitionId,
  type AgentSession,
  type AgentSessionId,
  type CorrelationId,
  type OutboxCommand,
  type Task,
  type TaskId
} from '@aicompany/contracts';
import { transitionTask } from './task-state-machine';
import type { Clock, Lease } from './leases';
import type { Outbox, TransactionalPersistence } from './ports';

export interface LaunchAgentSessionInput {
  taskId: TaskId;
  workflowId: Task['workflowId'];
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

export interface RecoveryRequest {
  taskId: TaskId;
  workflowId: Task['workflowId'];
  recoveryId: string;
  failureFingerprint: string;
  correlationId: CorrelationId;
  command: OutboxCommand;
}

export interface RecoveryCoordinator {
  request(input: RecoveryRequest): Promise<void>;
}

export interface DispatchOptions {
  transactionalPersistence: TransactionalPersistence;
  outbox?: Outbox;
  launcher: AgentSessionLauncher;
  clock: Clock;
  recoveryCoordinator?: RecoveryCoordinator;
}

export interface DispatchTaskInput {
  task: Task;
  agentDefinitionId: AgentDefinitionId;
  lease: Lease;
}

const systemActor = { kind: 'SYSTEM' as const, name: 'scheduler' };

const failureFingerprint = (error: unknown): string => {
  const name = error instanceof Error ? error.name : 'UnknownError';
  const message = error instanceof Error ? error.message : String(error);
  return `${name}:${message.replace(/\s+/g, ' ').trim().slice(0, 200)}`;
};

const startCommand = (
  task: Task,
  lease: Lease,
  eventId: OutboxCommand['causationId'],
  issuedAt: Date,
  agentDefinitionId: AgentDefinitionId
): OutboxCommand => ({
  commandId: `start-agent-session:${task.id}:${lease.leaseId}`,
  type: 'START_AGENT_SESSION',
  payload: {
    taskId: task.id,
    workflowId: task.workflowId,
    agentDefinitionId,
    leaseId: lease.leaseId
  },
  actor: systemActor,
  issuedAt,
  availableAt: issuedAt,
  correlationId: task.traceId,
  causationId: eventId
});

const recoveryCommand = (
  task: Task,
  recoveryId: string,
  eventId: OutboxCommand['causationId'],
  issuedAt: Date
): OutboxCommand => ({
  commandId: `start-recovery:${task.id}:${recoveryId}`,
  type: 'START_RECOVERY',
  payload: { taskId: task.id, recoveryId },
  actor: systemActor,
  issuedAt,
  availableAt: issuedAt,
  correlationId: task.traceId,
  causationId: eventId
});

export class TaskDispatcher {
  public constructor(private readonly options: DispatchOptions) {}

  public async dispatch(input: DispatchTaskInput): Promise<DispatchDecision | null> {
    const { task, agentDefinitionId, lease } = input;
    const launchInput: LaunchAgentSessionInput = {
      taskId: task.id,
      workflowId: task.workflowId,
      agentDefinitionId,
      leaseId: lease.leaseId,
      correlationId: task.traceId
    };

    let session: AgentSession;
    try {
      session = await this.options.launcher.launch(launchInput);
    } catch (error) {
      await this.persistFailure(task, lease, failureFingerprint(error));
      return null;
    }

    const context = {
      actor: systemActor,
      now: this.options.clock.now(),
      evidenceIds: [],
      isDeployment: task.isDeployment ?? false
    };
    const started = transitionTask(
      task,
      { type: 'TASK_STARTED', sessionId: session.sessionId },
      context
    );
    const command = startCommand(
      task,
      lease,
      started.event.eventId,
      context.now,
      agentDefinitionId
    );

    try {
      await this.options.transactionalPersistence.saveTaskAndAppend({
        task: started.task,
        expectedVersion: task.version,
        events: [started.event],
        commands: [command]
      });
    } catch (error) {
      await this.options.launcher.stop(session.sessionId, 'dispatch persistence failed').catch(() => undefined);
      throw error;
    }

    return {
      taskId: task.id,
      agentDefinitionId,
      leaseId: lease.leaseId,
      expiresAt: new Date(lease.expiresAt),
      correlationId: task.traceId
    };
  }

  private async persistFailure(
    task: Task,
    lease: Lease,
    fingerprint: string
  ): Promise<void> {
    const context = {
      actor: systemActor,
      now: this.options.clock.now(),
      evidenceIds: [],
      isDeployment: task.isDeployment ?? false
    };
    const failed = transitionTask(
      task,
      { type: 'TASK_FAILED', failureFingerprint: fingerprint },
      context
    );
    const recoveryId = `recovery:${task.id}:cycle:${task.recoveryCycles + 1}`;
    const command = recoveryCommand(task, recoveryId, failed.event.eventId, context.now);
    await this.options.transactionalPersistence.saveTaskAndAppend({
      task: failed.task,
      expectedVersion: task.version,
      events: [failed.event],
      commands: [command]
    });
    await this.options.recoveryCoordinator?.request({
      taskId: task.id,
      workflowId: task.workflowId,
      recoveryId,
      failureFingerprint: fingerprint,
      correlationId: task.traceId,
      command
    });
  }
}
