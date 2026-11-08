import {
  type AgentDefinitionId,
  type AgentSession,
  type AgentSessionId,
  type CorrelationId,
  type OutboxCommand,
  type Task,
  type TaskId
} from '@aicompany/contracts';
import { failureFingerprint } from './failure-fingerprint';
import type { FailureContext, RecoveryCoordinator } from './recovery';
import { transitionTask } from './task-state-machine';
import type { Clock, Lease } from './leases';
import type { Outbox, TransactionalPersistence } from './ports';

export interface LaunchAgentSessionInput {
  taskId: TaskId;
  workflowId: Task['workflowId'];
  agentDefinitionId: AgentDefinitionId;
  leaseId: string;
  sessionId: AgentSessionId;
  idempotencyKey: AgentSessionId;
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

export type DispatchRecoveryCoordinator = Pick<RecoveryCoordinator, 'start'>;

export interface DispatchOptions {
  transactionalPersistence: TransactionalPersistence;
  outbox?: Outbox;
  launcher: AgentSessionLauncher;
  clock: Clock;
  recoveryCoordinator?: DispatchRecoveryCoordinator;
}

export interface DispatchTaskInput {
  task: Task;
  agentDefinitionId: AgentDefinitionId;
  lease: Lease;
  sessionId: AgentSessionId;
}

export interface DispatchResult {
  decision: DispatchDecision | null;
  releaseClaim: boolean;
}

const systemActor = { kind: 'SYSTEM' as const, name: 'scheduler' };

const errorExitCode = (error: unknown): number | undefined => {
  if (error === null || typeof error !== 'object') return undefined;
  const exitCode = (error as { exitCode?: unknown }).exitCode;
  return typeof exitCode === 'number' && Number.isFinite(exitCode) ? exitCode : undefined;
};

const failureContext = (
  task: Task,
  attemptId: AgentSessionId,
  error: unknown
): FailureContext => {
  const exitCode = errorExitCode(error);
  return {
    taskId: task.id,
    attemptId,
    errorClass: error instanceof Error ? error.name : 'UnknownError',
    commandName: 'START_AGENT_SESSION',
    ...(exitCode === undefined ? {} : { exitCode }),
    message: error instanceof Error ? error.message : String(error),
    evidenceIds: []
  };
};

const startCommand = (
  task: Task,
  lease: Lease,
  eventId: OutboxCommand['causationId'],
  issuedAt: Date,
  agentDefinitionId: AgentDefinitionId,
  idempotencyKey: AgentSessionId
): OutboxCommand => ({
  commandId: `start-agent-session:${task.id}:${lease.leaseId}`,
  type: 'START_AGENT_SESSION',
  payload: {
    taskId: task.id,
    workflowId: task.workflowId,
    agentDefinitionId,
    leaseId: lease.leaseId,
    idempotencyKey
  },
  actor: systemActor,
  issuedAt,
  availableAt: issuedAt,
  correlationId: task.traceId,
  causationId: eventId
});

export class TaskDispatcher {
  public constructor(private readonly options: DispatchOptions) {}

  public async dispatch(input: DispatchTaskInput): Promise<DispatchResult> {
    const { task, agentDefinitionId, lease, sessionId } = input;
    const launchInput: LaunchAgentSessionInput = {
      taskId: task.id,
      workflowId: task.workflowId,
      agentDefinitionId,
      leaseId: lease.leaseId,
      sessionId,
      idempotencyKey: sessionId,
      correlationId: task.traceId
    };

    let session: AgentSession;
    try {
      session = await this.options.launcher.launch(launchInput);
    } catch (error) {
      await this.persistFailure(task, sessionId, error);
      return { decision: null, releaseClaim: true };
    }

    if (session.sessionId !== sessionId) {
      const mismatch = new Error(
        `Launcher returned session ${session.sessionId}; expected persisted session ${sessionId}`
      );
      try {
        await this.options.launcher.stop(session.sessionId, 'launcher returned a different session identity');
      } catch (error) {
        throw new Error('Launcher session identity mismatch and cleanup failed', { cause: error });
      }
      await this.persistFailure(task, sessionId, mismatch);
      return { decision: null, releaseClaim: true };
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
      agentDefinitionId,
      sessionId
    );

    try {
      await this.options.transactionalPersistence.saveTaskAndAppend({
        task: started.task,
        expectedVersion: task.version,
        events: [started.event],
        commands: [command]
      });
    } catch (error) {
      try {
        await this.options.launcher.stop(session.sessionId, 'dispatch persistence failed');
        return { decision: null, releaseClaim: true };
      } catch (stopError) {
        throw new AggregateError([error, stopError], 'Dispatch persistence and provider cleanup both failed');
      }
    }

    return { decision: {
      taskId: task.id,
      agentDefinitionId,
      leaseId: lease.leaseId,
      expiresAt: new Date(lease.expiresAt),
      correlationId: task.traceId
    }, releaseClaim: false };
  }

  private async persistFailure(
    task: Task,
    attemptId: AgentSessionId,
    error: unknown
  ): Promise<void> {
    const failure = failureContext(task, attemptId, error);
    const fingerprint = failureFingerprint(failure);
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
    await this.options.transactionalPersistence.saveTaskAndAppend({
      task: failed.task,
      expectedVersion: task.version,
      events: [failed.event],
      commands: []
    });
    await this.options.recoveryCoordinator?.start({
      taskId: task.id,
      failure,
      actor: systemActor,
      correlationId: task.traceId,
    });
  }
}
