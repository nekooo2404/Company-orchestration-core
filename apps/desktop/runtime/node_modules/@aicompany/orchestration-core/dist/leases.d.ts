import type { TaskId } from '@aicompany/contracts';
export interface Clock {
    now(): Date;
}
export interface Lease {
    taskId: TaskId;
    leaseId: string;
    expiresAt: Date;
}
export interface LeaseManagerOptions {
    clock: Clock;
    durationMs?: number;
}
export declare class LeaseManager {
    private readonly options;
    private readonly leases;
    private readonly sequences;
    private readonly durationMs;
    constructor(options: LeaseManagerOptions);
    acquire(taskId: TaskId): Lease;
    current(taskId: TaskId): Lease | null;
    release(taskId: TaskId, leaseId?: string): void;
}
//# sourceMappingURL=leases.d.ts.map