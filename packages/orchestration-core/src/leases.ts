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

const copyLease = (lease: Lease): Lease => ({
  ...lease,
  expiresAt: new Date(lease.expiresAt)
});

export class LeaseManager {
  private readonly leases = new Map<TaskId, Lease>();
  private readonly sequences = new Map<TaskId, number>();
  private readonly durationMs: number;

  public constructor(private readonly options: LeaseManagerOptions) {
    this.durationMs = options.durationMs ?? 5 * 60 * 1000;
    if (!Number.isFinite(this.durationMs) || this.durationMs < 0) {
      throw new RangeError('lease duration must be a non-negative finite number');
    }
  }

  public acquire(taskId: TaskId): Lease {
    const current = this.leases.get(taskId);
    const currentTime = this.options.clock.now();
    if (current !== undefined && current.expiresAt.getTime() > currentTime.getTime()) {
      return copyLease(current);
    }

    const sequence = (this.sequences.get(taskId) ?? 0) + 1;
    this.sequences.set(taskId, sequence);
    const lease: Lease = {
      taskId,
      leaseId: `lease:${taskId}:${sequence}`,
      expiresAt: new Date(currentTime.getTime() + this.durationMs)
    };
    this.leases.set(taskId, lease);
    return copyLease(lease);
  }

  public current(taskId: TaskId): Lease | null {
    const lease = this.leases.get(taskId);
    if (lease === undefined) {
      return null;
    }
    if (lease.expiresAt.getTime() <= this.options.clock.now().getTime()) {
      return null;
    }
    return copyLease(lease);
  }

  public release(taskId: TaskId, leaseId?: string): void {
    const current = this.leases.get(taskId);
    if (current !== undefined && (leaseId === undefined || current.leaseId === leaseId)) {
      this.leases.delete(taskId);
    }
  }
}
