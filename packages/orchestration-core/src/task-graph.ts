import type { Task, TaskId } from '@aicompany/contracts';
import {
  InvalidTaskGraphError,
  MissingTaskDependencyError,
  TaskDependencyCycleError
} from './domain-errors.js';

const indexTasks = (tasks: readonly Task[]): Map<TaskId, Task> => {
  const taskById = new Map<TaskId, Task>();

  for (const task of tasks) {
    if (taskById.has(task.id)) {
      throw new InvalidTaskGraphError(`Duplicate task ID in graph: ${task.id}`);
    }
    taskById.set(task.id, task);
  }

  return taskById;
};

const validateDependencies = (taskById: ReadonlyMap<TaskId, Task>): void => {
  for (const task of taskById.values()) {
    for (const dependencyId of task.dependencyIds) {
      if (!taskById.has(dependencyId)) {
        throw new MissingTaskDependencyError(task.id, dependencyId);
      }
    }
  }
};

const validateCycles = (taskById: ReadonlyMap<TaskId, Task>): void => {
  const visiting = new Set<TaskId>();
  const visited = new Set<TaskId>();
  const path: TaskId[] = [];

  const visit = (taskId: TaskId): void => {
    if (visiting.has(taskId)) {
      const cycleStart = path.indexOf(taskId);
      throw new TaskDependencyCycleError([...path.slice(cycleStart), taskId]);
    }
    if (visited.has(taskId)) {
      return;
    }

    visiting.add(taskId);
    path.push(taskId);
    const task = taskById.get(taskId);
    if (task === undefined) {
      throw new InvalidTaskGraphError(`Task ${taskId} is not present in the graph`);
    }
    for (const dependencyId of task.dependencyIds) {
      visit(dependencyId);
    }
    path.pop();
    visiting.delete(taskId);
    visited.add(taskId);
  };

  for (const taskId of taskById.keys()) {
    visit(taskId);
  }
};

export function validateTaskGraph(tasks: readonly Task[]): void {
  const taskById = indexTasks(tasks);
  validateDependencies(taskById);
  validateCycles(taskById);
}

const compareText = (left: string, right: string): number => {
  if (left < right) {
    return -1;
  }
  if (left > right) {
    return 1;
  }
  return 0;
};

export function findReadyTasks(
  tasks: readonly Task[],
  completedTaskIds: ReadonlySet<TaskId>
): Task[] {
  validateTaskGraph(tasks);

  return tasks
    .filter((task) =>
      task.state === 'PENDING' &&
      task.dependencyIds.every((dependencyId) => completedTaskIds.has(dependencyId))
    )
    .sort((left, right) =>
      (right.priority ?? 0) - (left.priority ?? 0) ||
      left.createdAt.getTime() - right.createdAt.getTime() ||
      compareText(left.id, right.id)
    );
}
