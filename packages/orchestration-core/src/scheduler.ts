import {
  type AgentDefinition,
  type AgentDefinitionId,
  type Task
} from '@aicompany/contracts';
import { findReadyTasks } from './task-graph';
import { transitionTask } from './task-state-machine';
import { FairQueue, type FairQueueEntry, type FairQueueOptions } from './fair-queue';
import type { Lease } from './leases';
import type { TaskRepository } from './repository';
import type {
  AgentSessionLauncher,
  DispatchDecision,
  DispatchOptions,
  RecoveryCoordinator,
  TaskDispatcher
} from './dispatch';
import { TaskDispatcher as DefaultTaskDispatcher } from './dispatch';
import type { Outbox, TransactionalPersistence } from './ports';
import type { Clock } from './leases';

export interface SchedulerTickInput {
  workflowId: Task['workflowId'];
  capacity: number;
  workerId: string;
}

export interface ProviderHealth {
  isHealthy(): boolean | Promise<boolean>;
}

export type SchedulerAgentDefinition = Pick<
  AgentDefinition,
  'id' | 'department' | 'allowedCapabilities' | 'budget' | 'maxConcurrency'
>;

export interface CapabilityPolicy {
  canRun(task: Task, agent: SchedulerAgentDefinition): boolean | Promise<boolean>;
}

export interface BudgetPolicy {
  canRun(task: Task, agent: SchedulerAgentDefinition): boolean | Promise<boolean>;
}

export interface SchedulerOptions extends DispatchOptions {
  taskRepository: TaskRepository;
  agentDefinitions?: readonly SchedulerAgentDefinition[];
  agents?: readonly SchedulerAgentDefinition[];
  capabilityPolicy?: CapabilityPolicy;
  budgetPolicy?: BudgetPolicy;
  providerHealth?: ProviderHealth | (() => boolean | Promise<boolean>);
  providerHealthy?: () => boolean | Promise<boolean>;
  leaseDurationMs?: number;
  fairQueue?: FairQueueOptions;
  recoveryCoordinator?: RecoveryCoordinator;
  outbox?: Outbox;
  launcher: AgentSessionLauncher;
  transactionalPersistence: TransactionalPersistence;
  clock: Clock;
}

export interface Scheduler {
  tick(input: SchedulerTickInput): Promise<DispatchDecision[]>;
}

const systemActor = { kind: 'SYSTEM' as const, name: 'scheduler' };

const compareTasks = (left: Task, right: Task): number =>
  (right.priority ?? 0) - (left.priority ?? 0) ||
  left.createdAt.getTime() - right.createdAt.getTime() ||
  left.id.localeCompare(right.id);

const dependenciesCompleted = (task: Task, completedTaskIds: ReadonlySet<Task['id']>): boolean =>
  task.dependencyIds.every((dependencyId) => completedTaskIds.has(dependencyId));

const defaultCapabilityPolicy: CapabilityPolicy = {
  canRun: (task, agent) => task.requiredCapabilities.every(
    (required) => agent.allowedCapabilities.includes(required)
  )
};

const defaultBudgetPolicy: BudgetPolicy = {
  canRun: (task, agent) =>
    task.budget.maxTokens <= agent.budget.maxTokens &&
    task.budget.maxCostUsd <= agent.budget.maxCostUsd
};

const asProviderHealth = (
  providerHealth: SchedulerOptions['providerHealth'],
  providerHealthy: SchedulerOptions['providerHealthy']
): (() => boolean | Promise<boolean>) => {
  if (providerHealthy !== undefined) {
    return providerHealthy;
  }
  if (providerHealth === undefined) {
    return () => true;
  }
  return typeof providerHealth === 'function'
    ? providerHealth
    : () => providerHealth.isHealthy();
};

export class SchedulerService implements Scheduler {
  private readonly agents: readonly SchedulerAgentDefinition[];
  private readonly queue: FairQueue;
  private readonly dispatcher: TaskDispatcher;
  private readonly providerIsHealthy: () => boolean | Promise<boolean>;
  private readonly capabilityPolicy: CapabilityPolicy;
  private readonly budgetPolicy: BudgetPolicy;

  public constructor(private readonly options: SchedulerOptions) {
    this.agents = [...(options.agentDefinitions ?? options.agents ?? [])]
      .sort((left, right) => left.department.localeCompare(right.department) || left.id.localeCompare(right.id));
    this.queue = new FairQueue(options.fairQueue);
    const dispatchOptions: DispatchOptions = {
      transactionalPersistence: options.transactionalPersistence,
      launcher: options.launcher,
      clock: options.clock
    };
    if (options.outbox !== undefined) {
      dispatchOptions.outbox = options.outbox;
    }
    if (options.recoveryCoordinator !== undefined) {
      dispatchOptions.recoveryCoordinator = options.recoveryCoordinator;
    }
    this.dispatcher = new DefaultTaskDispatcher(dispatchOptions);
    this.providerIsHealthy = asProviderHealth(options.providerHealth, options.providerHealthy);
    this.capabilityPolicy = options.capabilityPolicy ?? defaultCapabilityPolicy;
    this.budgetPolicy = options.budgetPolicy ?? defaultBudgetPolicy;
  }

  public async tick(input: SchedulerTickInput): Promise<DispatchDecision[]> {
    if (!Number.isInteger(input.capacity) || input.capacity < 0) {
      throw new RangeError('capacity must be a non-negative integer');
    }
    if (input.workerId.trim().length === 0) {
      throw new Error('workerId cannot be empty');
    }
    if (input.capacity === 0 || !(await this.providerIsHealthy())) {
      return [];
    }

    const tasks = await this.options.taskRepository.listByWorkflow(input.workflowId);
    const completedTaskIds = new Set(
      tasks.filter(({ state }) => state === 'COMPLETED').map(({ id }) => id)
    );
    const pendingReady = findReadyTasks(tasks, completedTaskIds);
    const existingReady = tasks
      .filter((task) => task.state === 'READY' && dependenciesCompleted(task, completedTaskIds))
      .sort(compareTasks);
    const readyById = new Map<Task['id'], Task>();
    for (const task of [...pendingReady, ...existingReady]) {
      readyById.set(task.id, task);
    }

    const activeByAgent = new Map<AgentDefinitionId, number>();
    for (const task of tasks) {
      if (task.state === 'RUNNING' && task.ownerAgentDefinitionId !== null) {
        activeByAgent.set(
          task.ownerAgentDefinitionId,
          (activeByAgent.get(task.ownerAgentDefinitionId) ?? 0) + 1
        );
      }
    }

    const plannedByAgent = new Map<AgentDefinitionId, number>();
    const agentByTask = new Map<Task['id'], SchedulerAgentDefinition>();
    const candidates: FairQueueEntry[] = [];
    for (const task of [...readyById.values()].sort(compareTasks)) {
      const agent = await this.selectAgent(task, activeByAgent, plannedByAgent);
      if (agent === null) {
        continue;
      }
      plannedByAgent.set(agent.id, (plannedByAgent.get(agent.id) ?? 0) + 1);
      agentByTask.set(task.id, agent);
      candidates.push({ task, department: agent.department });
    }

    const selected = this.queue.take(candidates, input.capacity);
    const results = await Promise.all(
      selected.map((entry) => this.dispatchOne(entry.task, agentByTask.get(entry.task.id)!, input.workerId))
    );
    return results.filter((decision): decision is DispatchDecision => decision !== null);
  }

  private async selectAgent(
    task: Task,
    activeByAgent: ReadonlyMap<AgentDefinitionId, number>,
    plannedByAgent: ReadonlyMap<AgentDefinitionId, number>
  ): Promise<SchedulerAgentDefinition | null> {
    const possibleAgents = this.agents;
    const eligible: SchedulerAgentDefinition[] = [];
    for (const agent of possibleAgents) {
      if (task.ownerAgentDefinitionId !== null && task.ownerAgentDefinitionId !== agent.id) {
        continue;
      }
      if (
        (activeByAgent.get(agent.id) ?? 0) + (plannedByAgent.get(agent.id) ?? 0) >= agent.maxConcurrency
      ) {
        continue;
      }
      if (!(await this.capabilityPolicy.canRun(task, agent))) {
        continue;
      }
      if (!(await this.budgetPolicy.canRun(task, agent))) {
        continue;
      }
      eligible.push(agent);
    }
    eligible.sort((left, right) =>
      ((activeByAgent.get(left.id) ?? 0) + (plannedByAgent.get(left.id) ?? 0)) -
        ((activeByAgent.get(right.id) ?? 0) + (plannedByAgent.get(right.id) ?? 0)) ||
      left.department.localeCompare(right.department) ||
      left.id.localeCompare(right.id)
    );
    return eligible[0] ?? null;
  }

  private async dispatchOne(
    task: Task,
    agent: SchedulerAgentDefinition,
    workerId: string
  ): Promise<DispatchDecision | null> {
    const agentDefinitionIdValue = agent.id;
    const now = this.options.clock.now();
    const durationMs = this.options.leaseDurationMs ?? 5 * 60 * 1000;
    const claim = await this.options.transactionalPersistence.claimDispatch({
      taskId: task.id,
      workerId,
      agentDefinitionId: agentDefinitionIdValue,
      leaseId: `dispatch:${task.id}`,
      now,
      expiresAt: new Date(now.getTime() + durationMs)
    });
    if (claim === null) return null;
    const lease: Lease = { taskId: task.id, leaseId: claim.leaseId, expiresAt: claim.expiresAt };

    const assignedTask = task.ownerAgentDefinitionId === null
        ? { ...task, ownerAgentDefinitionId: agentDefinitionIdValue }
        : task;
      let readyTask = assignedTask;
      if (assignedTask.state === 'PENDING') {
        const ready = transitionTask(assignedTask, { type: 'TASK_READY' }, {
          actor: systemActor,
          now: this.options.clock.now(),
          evidenceIds: [],
          isDeployment: assignedTask.isDeployment ?? false
        });
        await this.options.transactionalPersistence.saveTaskAndAppend({
          task: ready.task,
          expectedVersion: assignedTask.version,
          events: [ready.event],
          commands: []
        });
        readyTask = ready.task;
      }
      const result = await this.dispatcher.dispatch({
        task: readyTask,
        agentDefinitionId: agentDefinitionIdValue,
        lease
      });
      if (result.releaseClaim) {
        await this.options.transactionalPersistence.releaseDispatch(task.id, workerId, lease.leaseId);
      }
    return result.decision;
  }
}

export class TaskScheduler extends SchedulerService {}

export const createScheduler = (options: SchedulerOptions): Scheduler =>
  new TaskScheduler(options);
