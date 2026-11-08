import { describe, expect, it } from 'vitest';
import { type Task, correlationId, taskId, workflowId } from '@aicompany/contracts';
import { FairQueue, type FairQueueEntry } from './fair-queue';

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

const entry = (department: string, task: Task): FairQueueEntry => ({ department, task });

describe('fair task queue', () => {
  it('keeps equal-priority ordering deterministic', () => {
    const queue = new FairQueue();
    const tasks = [
      entry('platform', makeTask('task-z', { priority: 5 })),
      entry('platform', makeTask('task-a', { priority: 5 })),
      entry('platform', makeTask('task-high', { priority: 10 })),
      entry('platform', makeTask('task-old', {
        priority: 5,
        createdAt: new Date('2026-11-07T23:59:00.000Z')
      }))
    ];

    expect(queue.take(tasks, 4).map(({ task }) => task.id)).toEqual([
      'task-high',
      'task-old',
      'task-a',
      'task-z'
    ]);
  });

  it('advances across departments so a smaller department is not starved', () => {
    const queue = new FairQueue();
    const tasks = [
      ...Array.from({ length: 5 }, (_, index) => entry('engineering', makeTask(`eng-${index}`, { priority: 100 }))),
      ...Array.from({ length: 5 }, (_, index) => entry('product', makeTask(`product-${index}`, { priority: 50 }))),
      ...Array.from({ length: 5 }, (_, index) => entry('qa', makeTask(`qa-${index}`, { priority: 1 })))
    ];

    const first = queue.take(tasks, 2).map(({ task }) => task.id);
    const second = queue.take(tasks.filter(({ task }) => !first.includes(task.id)), 2)
      .map(({ task }) => task.id);
    const third = queue.take(
      tasks.filter(({ task }) => ![...first, ...second].includes(task.id)),
      2
    ).map(({ task }) => task.id);

    expect(new Set([...first, ...second, ...third])).toEqual(new Set([
      'eng-0', 'eng-1', 'product-0', 'product-1', 'qa-0', 'qa-1'
    ]));
    expect([...first, ...second, ...third].some((taskIdValue) => taskIdValue.startsWith('qa-')))
      .toBe(true);
  });

  it('honors a department weight without changing deterministic task ordering', () => {
    const queue = new FairQueue({ weights: { engineering: 2, qa: 1 } });
    const tasks = [
      ...Array.from({ length: 4 }, (_, index) => entry('engineering', makeTask(`eng-${index}`))),
      ...Array.from({ length: 2 }, (_, index) => entry('qa', makeTask(`qa-${index}`)))
    ];

    expect(queue.take(tasks, 6).map(({ department }) => department)).toEqual([
      'engineering', 'engineering', 'qa', 'engineering', 'engineering', 'qa'
    ]);
  });
});
