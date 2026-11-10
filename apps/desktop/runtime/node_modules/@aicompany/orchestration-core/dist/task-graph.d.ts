import type { Task, TaskId } from '@aicompany/contracts';
export declare function validateTaskGraph(tasks: readonly Task[]): void;
export declare function findReadyTasks(tasks: readonly Task[], completedTaskIds: ReadonlySet<TaskId>): Task[];
//# sourceMappingURL=task-graph.d.ts.map