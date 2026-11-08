import {
  DomainEventSchema,
  approvalId,
  eventId,
  type ActorRef,
  type AgentSessionId,
  type ApprovalId,
  type DomainEvent,
  type Task,
  type TaskState
} from '@aicompany/contracts';
import { InvalidTaskTransitionError } from './domain-errors';

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

type TransitionType = TaskTransition['type'];

const transitions = (...types: TransitionType[]): ReadonlySet<TransitionType> => new Set(types);

const TRANSITION_TABLE: Readonly<Record<TaskState, ReadonlySet<TransitionType>>> = {
  PENDING: transitions('TASK_READY', 'TASK_BLOCKED', 'TASK_CANCELLED'),
  READY: transitions('TASK_STARTED', 'TASK_BLOCKED', 'TASK_FAILED', 'TASK_CANCELLED'),
  RUNNING: transitions(
    'TASK_REVIEW_REQUESTED',
    'TASK_COMPLETED',
    'TASK_BLOCKED',
    'TASK_FAILED',
    'TASK_CANCELLED'
  ),
  REVIEW: transitions(
    'TASK_COMPLETED',
    'APPROVAL_REQUESTED',
    'TASK_BLOCKED',
    'TASK_FAILED',
    'TASK_CANCELLED'
  ),
  COMPLETED: transitions(),
  BLOCKED: transitions('RECOVERY_STARTED', 'TASK_CANCELLED'),
  RECOVERING: transitions('TASK_READY', 'TASK_FAILED', 'TASK_ESCALATED', 'TASK_CANCELLED'),
  FAILED: transitions('RECOVERY_STARTED', 'TASK_CANCELLED'),
  ESCALATED_TO_CEO: transitions(),
  CANCELLED: transitions(),
  WAITING_FOR_APPROVAL: transitions('TASK_CANCELLED')
};

const nonEmpty = (value: string): boolean => value.trim().length > 0;

const deepFreeze = <T>(value: T): T => {
  if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const nestedValue of Object.values(value as Record<string, unknown>)) {
      deepFreeze(nestedValue);
    }
    Object.freeze(value);
  }
  return value;
};

const invalid = (
  task: Task,
  transition: TaskTransition,
  reason: string
): never => {
  throw new InvalidTaskTransitionError(task.id, task.state, transition.type, reason);
};

const freezeTask = (task: Task): Task => {
  return deepFreeze(globalThis.structuredClone(task));
};

const freezeEvent = (event: DomainEvent): DomainEvent => {
  return deepFreeze(globalThis.structuredClone(event));
};

const eventIdentifiers = (task: Task, nextVersion: number) => ({
  eventId: eventId(`task:${task.id}:v${nextVersion}`),
  causationId: eventId(`task:${task.id}:v${task.version}`)
});

const deploymentApprovalId = (task: Task, nextVersion: number): ApprovalId =>
  approvalId(`deployment:${task.id}:v${nextVersion}`);

const resolveDeploymentMode = (
  task: Task,
  transition: TaskTransition,
  context: TransitionContext
): boolean => {
  if (task.isDeployment !== undefined && task.isDeployment !== context.isDeployment) {
    invalid(task, transition, 'task and transition context deployment flags disagree');
  }
  return task.isDeployment ?? context.isDeployment;
};

export function transitionTask(
  task: Task,
  transition: TaskTransition,
  context: TransitionContext
): TransitionResult {
  const isDeployment = resolveDeploymentMode(task, transition, context);

  if (!TRANSITION_TABLE[task.state].has(transition.type)) {
    invalid(task, transition, 'transition is not allowed from the current state');
  }

  const nextVersion = task.version + 1;
  let nextState: TaskState = task.state;
  let nextRecoveryCycles = task.recoveryCycles;
  let eventType: DomainEvent['eventType'];
  let payload: DomainEvent['payload'];

  switch (transition.type) {
    case 'TASK_READY':
      nextState = 'READY';
      eventType = 'TASK_READY';
      payload = { taskId: task.id };
      break;
    case 'TASK_STARTED':
      nextState = 'RUNNING';
      eventType = 'TASK_STARTED';
      payload = { sessionId: transition.sessionId, taskId: task.id };
      break;
    case 'TASK_REVIEW_REQUESTED':
      nextState = 'REVIEW';
      eventType = 'REVIEW_REQUESTED';
      payload = {
        taskId: task.id,
        ...(context.evidenceIds.length > 0
          ? { evidenceIds: [...context.evidenceIds] }
          : {})
      };
      break;
    case 'TASK_COMPLETED': {
      if (
        transition.evidenceIds.length === 0 ||
        transition.evidenceIds.some((evidenceId) => !nonEmpty(evidenceId))
      ) {
        invalid(task, transition, 'completion requires at least one evidence ID');
      }

      if (isDeployment) {
        nextState = 'WAITING_FOR_APPROVAL';
        eventType = 'DEPLOYMENT_APPROVAL_REQUESTED';
        payload = {
          approvalId: deploymentApprovalId(task, nextVersion),
          taskId: task.id
        };
      } else {
        nextState = 'COMPLETED';
        eventType = 'TASK_COMPLETED';
        payload = {
          evidenceIds: [...transition.evidenceIds],
          taskId: task.id
        };
      }
      break;
    }
    case 'TASK_BLOCKED':
      if (!nonEmpty(transition.reason)) {
        invalid(task, transition, 'blocking requires a reason');
      }
      nextState = 'BLOCKED';
      eventType = 'BLOCKED';
      payload = { reason: transition.reason, taskId: task.id };
      break;
    case 'TASK_FAILED':
      if (!nonEmpty(transition.failureFingerprint)) {
        invalid(task, transition, 'failure requires a fingerprint');
      }
      nextState = 'FAILED';
      eventType = 'TASK_FAILED';
      payload = {
        failureFingerprint: transition.failureFingerprint,
        taskId: task.id
      };
      break;
    case 'RECOVERY_STARTED':
      if (!nonEmpty(transition.recoveryId)) {
        invalid(task, transition, 'recovery requires an ID');
      }
      if (task.recoveryCycles >= 5) {
        invalid(task, transition, 'maximum recovery cycles have been exhausted');
      }
      nextState = 'RECOVERING';
      nextRecoveryCycles += 1;
      eventType = 'RECOVERY_STARTED';
      payload = { recoveryId: transition.recoveryId, taskId: task.id };
      break;
    case 'TASK_ESCALATED':
      if (!nonEmpty(transition.reason)) {
        invalid(task, transition, 'escalation requires a reason');
      }
      if (task.state !== 'RECOVERING' || task.recoveryCycles !== 5) {
        invalid(task, transition, 'normal escalation requires the fifth recovery cycle');
      }
      nextState = 'ESCALATED_TO_CEO';
      eventType = 'TASK_ESCALATED';
      payload = { reason: transition.reason, taskId: task.id };
      break;
    case 'TASK_CANCELLED':
      if (!nonEmpty(transition.reason)) {
        invalid(task, transition, 'cancellation requires a reason');
      }
      nextState = 'CANCELLED';
      eventType = 'TASK_CANCELLED';
      payload = { reason: transition.reason, taskId: task.id };
      break;
    case 'APPROVAL_REQUESTED':
      if (!isDeployment) {
        invalid(task, transition, 'approval requests are only valid for deployment tasks');
      }
      nextState = 'WAITING_FOR_APPROVAL';
      eventType = 'DEPLOYMENT_APPROVAL_REQUESTED';
      payload = { approvalId: transition.approvalId, taskId: task.id };
      break;
  }

  const nextTask = freezeTask({
    ...task,
    state: nextState,
    recoveryCycles: nextRecoveryCycles,
    version: nextVersion,
    updatedAt: context.now
  });
  const identifiers = eventIdentifiers(task, nextVersion);
  const event = freezeEvent(DomainEventSchema.parse({
    ...identifiers,
    aggregateType: 'TASK',
    aggregateId: task.id,
    aggregateVersion: nextVersion,
    eventType,
    actor: context.actor,
    correlationId: task.traceId,
    occurredAt: context.now,
    payload
  }));

  return { task: nextTask, event };
}
