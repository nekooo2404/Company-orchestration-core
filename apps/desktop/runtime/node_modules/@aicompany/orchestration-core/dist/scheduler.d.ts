import { type AgentDefinition, type Task } from '@aicompany/contracts';
import { type FairQueueOptions } from './fair-queue.js';
import type { TaskRepository } from './repository.js';
import type { AgentSessionLauncher, DispatchDecision, DispatchOptions, DispatchRecoveryCoordinator } from './dispatch.js';
import type { Outbox, TransactionalPersistence } from './ports.js';
import type { Clock } from './leases.js';
export interface SchedulerTickInput {
    workflowId: Task['workflowId'];
    capacity: number;
    workerId: string;
}
export interface ProviderHealth {
    isHealthy(): boolean | Promise<boolean>;
}
export type SchedulerAgentDefinition = Pick<AgentDefinition, 'id' | 'department' | 'allowedCapabilities' | 'budget' | 'maxConcurrency'>;
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
    recoveryCoordinator?: DispatchRecoveryCoordinator;
    outbox?: Outbox;
    launcher: AgentSessionLauncher;
    transactionalPersistence: TransactionalPersistence;
    clock: Clock;
}
export interface Scheduler {
    tick(input: SchedulerTickInput): Promise<DispatchDecision[]>;
}
export declare class SchedulerService implements Scheduler {
    private readonly options;
    private readonly agents;
    private readonly queue;
    private readonly dispatcher;
    private readonly providerIsHealthy;
    private readonly capabilityPolicy;
    private readonly budgetPolicy;
    constructor(options: SchedulerOptions);
    tick(input: SchedulerTickInput): Promise<DispatchDecision[]>;
    private selectAgent;
    private dispatchOne;
}
export declare class TaskScheduler extends SchedulerService {
}
export declare const createScheduler: (options: SchedulerOptions) => Scheduler;
//# sourceMappingURL=scheduler.d.ts.map