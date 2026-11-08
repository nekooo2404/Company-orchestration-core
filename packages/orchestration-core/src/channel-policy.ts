import { ActorRefSchema, TaskIdSchema, type ActorRef, type TaskId } from '@aicompany/contracts';

export type ChannelScope =
  | { kind: 'task'; taskId: TaskId }
  | { kind: 'project'; projectId: string };

export interface ChannelAuthorization {
  authorizeRead(actor: ActorRef, scope: ChannelScope): Promise<void>;
  authorizeWrite(actor: ActorRef, scope: ChannelScope): Promise<void>;
}

export interface TaskChannelAccess {
  taskId: TaskId;
  projectId: string;
  assignee: ActorRef;
  supervisors: readonly ActorRef[];
  invited: readonly ActorRef[];
}

export interface ProjectAssignment {
  projectId: string;
  actor: ActorRef;
}

export interface InMemoryChannelAuthorizationOptions {
  tasks: readonly TaskChannelAccess[];
  projectAssignments: readonly ProjectAssignment[];
  cancelledSessions: readonly string[];
}

export class ChannelAuthorizationError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = 'ChannelAuthorizationError';
  }
}

const actorKey = (actor: ActorRef): string => {
  const parsed = ActorRefSchema.parse(actor);
  return parsed.kind === 'AGENT' ? `AGENT:${parsed.sessionId}` : parsed.kind === 'CEO' ? 'CEO' : `SYSTEM:${parsed.name}`;
};

const scopeKey = (scope: ChannelScope): string => {
  if (scope.kind === 'task') return `task:${TaskIdSchema.parse(scope.taskId)}`;
  if (scope.kind === 'project' && scope.projectId.trim().length > 0) return `project:${scope.projectId.trim()}`;
  throw new ChannelAuthorizationError('A valid scoped channel is required');
};

export class InMemoryChannelAuthorization implements ChannelAuthorization {
  private readonly tasks = new Map<string, TaskChannelAccess>();
  private readonly projectAssignments: readonly ProjectAssignment[];
  private readonly cancelledSessions: ReadonlySet<string>;

  public constructor(options: InMemoryChannelAuthorizationOptions) {
    this.tasks = new Map(options.tasks.map((entry) => [TaskIdSchema.parse(entry.taskId), entry]));
    this.projectAssignments = options.projectAssignments;
    this.cancelledSessions = new Set(options.cancelledSessions);
  }

  public async authorizeRead(actor: ActorRef, scope: ChannelScope): Promise<void> {
    this.assertActive(actor);
    scopeKey(scope);
    if (scope.kind === 'project') {
      if (actor.kind !== 'AGENT' || !this.projectAssignments.some((assignment) => assignment.projectId === scope.projectId.trim() && actorKey(assignment.actor) === actorKey(actor))) {
        throw new ChannelAuthorizationError('Actor is not assigned to this project channel');
      }
      return;
    }
    this.assertTaskParticipant(actor, scope.taskId);
  }

  public async authorizeWrite(actor: ActorRef, scope: ChannelScope): Promise<void> {
    this.assertActive(actor);
    scopeKey(scope);
    if (scope.kind === 'task') {
      this.assertTaskParticipant(actor, scope.taskId);
      return;
    }
    if (actor.kind !== 'AGENT' || !this.projectAssignments.some((assignment) => assignment.projectId === scope.projectId.trim() && actorKey(assignment.actor) === actorKey(actor))) {
      throw new ChannelAuthorizationError('Actor is not assigned to this project channel');
    }
  }

  private assertActive(actor: ActorRef): void {
    const parsed = ActorRefSchema.parse(actor);
    if (parsed.kind === 'AGENT' && this.cancelledSessions.has(parsed.sessionId)) {
      throw new ChannelAuthorizationError('Cancelled sessions cannot access communication channels');
    }
  }

  private assertTaskParticipant(actor: ActorRef, taskId: TaskId): void {
    const task = this.tasks.get(TaskIdSchema.parse(taskId));
    if (!task) throw new ChannelAuthorizationError('Task channel does not exist');
    const key = actorKey(actor);
    if ([task.assignee, ...task.supervisors, ...task.invited].some((participant) => actorKey(participant) === key)) return;
    throw new ChannelAuthorizationError('Actor is not authorized for this task channel');
  }
}
