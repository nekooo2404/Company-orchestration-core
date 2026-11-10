export class InvalidTaskTransitionError extends Error {
    taskId;
    fromState;
    transitionType;
    code = 'INVALID_TASK_TRANSITION';
    constructor(taskId, fromState, transitionType, reason = 'transition is not allowed') {
        super(`Task ${taskId} cannot apply ${transitionType} from ${fromState}: ${reason}`);
        this.taskId = taskId;
        this.fromState = fromState;
        this.transitionType = transitionType;
        this.name = 'InvalidTaskTransitionError';
    }
}
export class InvalidTaskGraphError extends Error {
    code = 'INVALID_TASK_GRAPH';
    constructor(message) {
        super(message);
        this.name = 'InvalidTaskGraphError';
    }
}
export class MissingTaskDependencyError extends InvalidTaskGraphError {
    taskId;
    dependencyId;
    code = 'MISSING_TASK_DEPENDENCY';
    constructor(taskId, dependencyId) {
        super(`Task ${taskId} depends on missing task ${dependencyId}`);
        this.taskId = taskId;
        this.dependencyId = dependencyId;
        this.name = 'MissingTaskDependencyError';
    }
}
export class TaskDependencyCycleError extends InvalidTaskGraphError {
    cycle;
    code = 'TASK_DEPENDENCY_CYCLE';
    constructor(cycle) {
        super(`Task dependency cycle detected: ${cycle.join(' -> ')}`);
        this.cycle = cycle;
        this.name = 'TaskDependencyCycleError';
    }
}
//# sourceMappingURL=domain-errors.js.map