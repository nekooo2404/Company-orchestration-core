import type { TaskId, TaskState } from '@aicompany/contracts';
export declare class InvalidTaskTransitionError extends Error {
    readonly taskId: TaskId;
    readonly fromState: TaskState;
    readonly transitionType: string;
    readonly code = "INVALID_TASK_TRANSITION";
    constructor(taskId: TaskId, fromState: TaskState, transitionType: string, reason?: string);
}
export declare class InvalidTaskGraphError extends Error {
    readonly code: string;
    constructor(message: string);
}
export declare class MissingTaskDependencyError extends InvalidTaskGraphError {
    readonly taskId: TaskId;
    readonly dependencyId: TaskId;
    readonly code = "MISSING_TASK_DEPENDENCY";
    constructor(taskId: TaskId, dependencyId: TaskId);
}
export declare class TaskDependencyCycleError extends InvalidTaskGraphError {
    readonly cycle: readonly TaskId[];
    readonly code = "TASK_DEPENDENCY_CYCLE";
    constructor(cycle: readonly TaskId[]);
}
//# sourceMappingURL=domain-errors.d.ts.map