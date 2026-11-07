import { describe, expect, it } from 'vitest';
import { type Task, correlationId, taskId, workflowId } from '@aicompany/contracts';
import {
  InvalidTaskGraphError,
  MissingTaskDependencyError,
  TaskDependencyCycleError,
  findReadyTasks,
  validateTaskGraph
} from './index';

const baseTime = new Date('2026-11-08T00:00:00.000Z');

const makeTask = (id: string, overrides: Partial<Task> = {}): Task => ({
  id: taskId(id),
  workflowId: workflowId('workflow-1'),
  state: 'PENDING',
  dependencyIds: [],
  requiredCapabilities: ['repo.read'],
  outputContract: 'validated output',
  budget: { maxTokens: 1000, maxCostUsd: 1 },
  recoveryCycles: 0,
  projectId: 'project-1',
  parentTaskId: null,
  ownerAgentDefinitionId: null,
  deadline: null,
  traceId: correlationId(`trace-${id}`),
  version: 0,
  createdAt: baseTime,
  updatedAt: baseTime,
  ...overrides
});

describe('task dependency graph', () => {
  it('returns a pending task with no dependencies as ready', () => {
    const task = makeTask('task-1');

    expect(findReadyTasks([task], new Set())).toEqual([task]);
  });

  it('returns a task when every dependency is complete', () => {
    const dependencyA = makeTask('dependency-a', { state: 'COMPLETED' });
    const dependencyB = makeTask('dependency-b', { state: 'COMPLETED' });
    const task = makeTask('task-1', {
      dependencyIds: [dependencyA.id, dependencyB.id]
    });

    expect(findReadyTasks([dependencyA, dependencyB, task], new Set([dependencyA.id, dependencyB.id])))
      .toEqual([task]);
  });

  it('excludes tasks with incomplete dependencies and tasks outside PENDING', () => {
    const dependency = makeTask('dependency-1', { state: 'RUNNING' });
    const blocked = makeTask('blocked-task', { dependencyIds: [dependency.id] });
    const running = makeTask('running-task', { state: 'RUNNING' });
    const completed = makeTask('completed-task', { state: 'COMPLETED' });

    expect(findReadyTasks([dependency, blocked, running, completed], new Set())).toEqual([]);
  });

  it('sorts ready tasks by descending priority, creation time and task ID', () => {
    const olderHigh = makeTask('task-b', {
      priority: 10,
      createdAt: new Date('2026-11-08T00:00:01.000Z')
    });
    const newerHigh = makeTask('task-a', {
      priority: 10,
      createdAt: new Date('2026-11-08T00:00:02.000Z')
    });
    const sameTimeLowerId = makeTask('task-a-1', {
      priority: 5,
      createdAt: new Date('2026-11-08T00:00:01.000Z')
    });
    const sameTimeHigherId = makeTask('task-z', {
      priority: 5,
      createdAt: new Date('2026-11-08T00:00:01.000Z')
    });

    expect(findReadyTasks([sameTimeHigherId, newerHigh, sameTimeLowerId, olderHigh], new Set()))
      .toEqual([olderHigh, newerHigh, sameTimeLowerId, sameTimeHigherId]);
  });

  it('rejects a dependency ID that is missing from the graph', () => {
    const task = makeTask('task-1', { dependencyIds: [taskId('missing')] });

    expect(() => validateTaskGraph([task])).toThrow(MissingTaskDependencyError);
    expect(() => findReadyTasks([task], new Set())).toThrow(InvalidTaskGraphError);
  });

  it('rejects cyclic graphs instead of scheduling them', () => {
    const taskA = makeTask('task-a', { dependencyIds: [taskId('task-b')] });
    const taskB = makeTask('task-b', { dependencyIds: [taskId('task-a')] });

    expect(() => validateTaskGraph([taskA, taskB])).toThrow(TaskDependencyCycleError);
    expect(() => findReadyTasks([taskA, taskB], new Set())).toThrow(TaskDependencyCycleError);
  });

  it('rejects duplicate task IDs in a graph', () => {
    const first = makeTask('task-1');
    const second = makeTask('task-1', { title: 'duplicate' });

    expect(() => validateTaskGraph([first, second])).toThrow(InvalidTaskGraphError);
  });
});
