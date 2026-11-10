import type { Task } from '@aicompany/contracts';
export interface FairQueueEntry {
    task: Task;
    department: string;
    weight?: number;
}
export interface FairQueueOptions {
    weights?: Readonly<Record<string, number>>;
}
export declare class FairQueue {
    private readonly options;
    private nextSlot;
    constructor(options?: FairQueueOptions);
    take(entries: readonly FairQueueEntry[], capacity: number): FairQueueEntry[];
}
export declare function orderFairly(entries: readonly FairQueueEntry[], capacity: number, options?: FairQueueOptions): FairQueueEntry[];
//# sourceMappingURL=fair-queue.d.ts.map