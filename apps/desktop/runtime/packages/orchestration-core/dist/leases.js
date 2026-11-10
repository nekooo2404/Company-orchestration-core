const copyLease = (lease) => ({
    ...lease,
    expiresAt: new Date(lease.expiresAt)
});
export class LeaseManager {
    options;
    leases = new Map();
    sequences = new Map();
    durationMs;
    constructor(options) {
        this.options = options;
        this.durationMs = options.durationMs ?? 5 * 60 * 1000;
        if (!Number.isFinite(this.durationMs) || this.durationMs < 0) {
            throw new RangeError('lease duration must be a non-negative finite number');
        }
    }
    acquire(taskId) {
        const current = this.leases.get(taskId);
        const currentTime = this.options.clock.now();
        if (current !== undefined && current.expiresAt.getTime() > currentTime.getTime()) {
            return copyLease(current);
        }
        const sequence = (this.sequences.get(taskId) ?? 0) + 1;
        this.sequences.set(taskId, sequence);
        const lease = {
            taskId,
            leaseId: `lease:${taskId}:${sequence}`,
            expiresAt: new Date(currentTime.getTime() + this.durationMs)
        };
        this.leases.set(taskId, lease);
        return copyLease(lease);
    }
    current(taskId) {
        const lease = this.leases.get(taskId);
        if (lease === undefined) {
            return null;
        }
        if (lease.expiresAt.getTime() <= this.options.clock.now().getTime()) {
            return null;
        }
        return copyLease(lease);
    }
    release(taskId, leaseId) {
        const current = this.leases.get(taskId);
        if (current !== undefined && (leaseId === undefined || current.leaseId === leaseId)) {
            this.leases.delete(taskId);
        }
    }
}
//# sourceMappingURL=leases.js.map