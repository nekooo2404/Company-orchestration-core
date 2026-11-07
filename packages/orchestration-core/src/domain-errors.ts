import type { TaskId, TaskState } from '@aicompany/contracts';

export class InvalidTaskTransitionError extends Error {
  public readonly code = 'INVALID_TASK_TRANSITION';

  public constructor(
    public readonly taskId: TaskId,
    public readonly fromState: TaskState,
    public readonly transitionType: string,
    reason = 'transition is not allowed'
  ) {
    super(`Task ${taskId} cannot apply ${transitionType} from ${fromState}: ${reason}`);
    this.name = 'InvalidTaskTransitionError';
  }
}

export class InvalidTaskGraphError extends Error {
  public readonly code: string = 'INVALID_TASK_GRAPH';

  public constructor(message: string) {
    super(message);
    this.name = 'InvalidTaskGraphError';
  }
}

export class MissingTaskDependencyError extends InvalidTaskGraphError {
  public readonly code = 'MISSING_TASK_DEPENDENCY';

  public constructor(
    public readonly taskId: TaskId,
    public readonly dependencyId: TaskId
  ) {
    super(`Task ${taskId} depends on missing task ${dependencyId}`);
    this.name = 'MissingTaskDependencyError';
  }
}

export class TaskDependencyCycleError extends InvalidTaskGraphError {
  public readonly code = 'TASK_DEPENDENCY_CYCLE';

  public constructor(public readonly cycle: readonly TaskId[]) {
    super(`Task dependency cycle detected: ${cycle.join(' -> ')}`);
    this.name = 'TaskDependencyCycleError';
  }
}
