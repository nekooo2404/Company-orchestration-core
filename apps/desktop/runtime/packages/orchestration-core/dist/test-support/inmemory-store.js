import { DomainEventSchema, EventIdSchema, OutboxCommandSchema, TaskIdSchema, TaskSchema, WorkflowIdSchema } from '../../../contracts/dist/index.js';
import { DuplicatePersistenceIdError, InvalidPersistenceOperationError, OptimisticConcurrencyError } from '../repository.js';
const clone = (value) => globalThis.structuredClone(value);
const canonicalize = (value) => {
    if (value instanceof Date) {
        return value.toISOString();
    }
    if (Array.isArray(value)) {
        return value.map(canonicalize);
    }
    if (value !== null && typeof value === 'object') {
        return Object.fromEntries(Object.entries(value)
            .sort(([left], [right]) => left.localeCompare(right))
            .map(([key, nestedValue]) => [key, canonicalize(nestedValue)]));
    }
    return value;
};
const sameValue = (left, right) => JSON.stringify(canonicalize(left)) === JSON.stringify(canonicalize(right));
const canonicalId = (value, name) => {
    if (typeof value !== 'string' || value.trim().length === 0) {
        throw new InvalidPersistenceOperationError(`${name} cannot be empty`);
    }
    return value.trim();
};
const parseDomainEvent = (event) => {
    const parsed = DomainEventSchema.parse(event);
    return { ...parsed, aggregateId: canonicalId(parsed.aggregateId, 'aggregateId') };
};
const parseOutboxCommand = (command) => {
    const parsed = OutboxCommandSchema.parse(command);
    const hasClaimedBy = parsed.claimedBy !== undefined && parsed.claimedBy !== null;
    const hasClaimedAt = parsed.claimedAt !== undefined && parsed.claimedAt !== null;
    if (hasClaimedBy !== hasClaimedAt) {
        throw new InvalidPersistenceOperationError('claimedBy and claimedAt must be provided together');
    }
    return {
        ...parsed,
        commandId: canonicalId(parsed.commandId, 'commandId'),
        ...(hasClaimedBy ? { claimedBy: canonicalId(parsed.claimedBy, 'claimedBy') } : {})
    };
};
const sameOutboxCommandIdentity = (left, right) => sameValue({
    commandId: left.commandId,
    type: left.type,
    payload: left.payload,
    actor: left.actor,
    issuedAt: left.issuedAt,
    availableAt: left.availableAt,
    correlationId: left.correlationId,
    causationId: left.causationId
}, {
    commandId: right.commandId,
    type: right.type,
    payload: right.payload,
    actor: right.actor,
    issuedAt: right.issuedAt,
    availableAt: right.availableAt,
    correlationId: right.correlationId,
    causationId: right.causationId
});
const assertVersion = (version, name) => {
    if (!Number.isInteger(version) || version < 0) {
        throw new InvalidPersistenceOperationError(`${name} must be a non-negative integer`);
    }
};
export class InMemoryEventStore {
    streams = new Map();
    eventsById = new Map();
    async append(events, expectedVersion) {
        assertVersion(expectedVersion, 'expectedVersion');
        if (events.length === 0) {
            return;
        }
        const parsedEvents = events.map(parseDomainEvent);
        const aggregateId = parsedEvents[0].aggregateId;
        const seenIds = new Set();
        let existingCount = 0;
        for (const event of parsedEvents) {
            if (event.aggregateId !== aggregateId) {
                throw new InvalidPersistenceOperationError('An event append must target one aggregate');
            }
            if (seenIds.has(event.eventId)) {
                throw new DuplicatePersistenceIdError('event', event.eventId);
            }
            seenIds.add(event.eventId);
            const existing = this.eventsById.get(event.eventId);
            if (existing !== undefined) {
                existingCount += 1;
                if (!sameValue(existing, event)) {
                    throw new DuplicatePersistenceIdError('event', event.eventId);
                }
            }
        }
        if (existingCount === parsedEvents.length) {
            return;
        }
        if (existingCount > 0) {
            throw new InvalidPersistenceOperationError('An append cannot mix stored and new events');
        }
        const stream = this.streams.get(aggregateId) ?? [];
        const actualVersion = stream.at(-1)?.aggregateVersion ?? 0;
        if (actualVersion !== expectedVersion) {
            throw new OptimisticConcurrencyError(aggregateId, expectedVersion, actualVersion);
        }
        parsedEvents.forEach((event, index) => {
            const expectedEventVersion = expectedVersion + index + 1;
            if (event.aggregateVersion !== expectedEventVersion) {
                throw new InvalidPersistenceOperationError(`Event ${event.eventId} must have aggregate version ${expectedEventVersion}`);
            }
        });
        const storedEvents = parsedEvents.map(clone);
        stream.push(...storedEvents);
        this.streams.set(aggregateId, stream);
        for (const event of storedEvents) {
            this.eventsById.set(event.eventId, event);
        }
    }
    async appendApprovalRequest(event) {
        const parsedEvent = parseDomainEvent(event);
        if (parsedEvent.aggregateType !== 'APPROVAL' ||
            parsedEvent.eventType !== 'APPROVAL_REQUESTED' ||
            parsedEvent.aggregateVersion !== 0) {
            throw new InvalidPersistenceOperationError('Only an APPROVAL_REQUESTED event at aggregate version 0 can initialize an approval stream');
        }
        const existingById = this.eventsById.get(parsedEvent.eventId);
        if (existingById !== undefined) {
            if (!sameValue(existingById, parsedEvent)) {
                throw new DuplicatePersistenceIdError('event', parsedEvent.eventId);
            }
            return;
        }
        const stream = this.streams.get(parsedEvent.aggregateId) ?? [];
        if (stream.length > 0) {
            throw new OptimisticConcurrencyError(parsedEvent.aggregateId, -1, stream.at(-1)?.aggregateVersion ?? 0);
        }
        const stored = clone(parsedEvent);
        this.streams.set(parsedEvent.aggregateId, [stored]);
        this.eventsById.set(parsedEvent.eventId, stored);
    }
    async readStream(aggregateId, afterVersion = -1) {
        if (!Number.isInteger(afterVersion) || afterVersion < -1) {
            throw new InvalidPersistenceOperationError('afterVersion must be an integer greater than or equal to -1');
        }
        const canonicalAggregateId = canonicalId(aggregateId, 'aggregateId');
        return (this.streams.get(canonicalAggregateId) ?? [])
            .filter((event) => event.aggregateVersion > afterVersion)
            .map(clone);
    }
    async hasEvent(eventId) {
        return this.eventsById.has(EventIdSchema.parse(eventId));
    }
    snapshot() {
        return clone({ streams: [...this.streams.entries()], eventsById: [...this.eventsById.entries()] });
    }
    restore(snapshot) {
        this.streams.clear();
        this.eventsById.clear();
        for (const [aggregateId, events] of snapshot.streams)
            this.streams.set(aggregateId, clone(events));
        for (const [eventId, event] of snapshot.eventsById)
            this.eventsById.set(eventId, clone(event));
    }
}
export class InMemoryDispatchClaimStore {
    tasks;
    claims = new Map();
    transactionTail = Promise.resolve();
    constructor(tasks) {
        this.tasks = tasks;
    }
    async claimDispatch(input) {
        return this.serialize(async () => {
            const workerId = canonicalId(input.workerId, 'workerId');
            const task = await this.tasks?.get(input.taskId);
            if (this.tasks !== undefined && (task === null || task?.state !== 'READY' || task.version !== input.taskVersion || input.taskState !== 'READY' || (task.ownerAgentDefinitionId !== null && task.ownerAgentDefinitionId !== input.agentDefinitionId)))
                return null;
            const existing = this.claims.get(input.taskId);
            if (existing !== undefined && existing.taskVersion === input.taskVersion && (existing.expiresAt > input.now || existing.cleanupInProgress)) {
                return null;
            }
            if (existing !== undefined && existing.taskVersion === input.taskVersion &&
                (existing.agentDefinitionId !== input.agentDefinitionId || existing.sessionId !== input.sessionId))
                return null;
            if (input.maxConcurrency !== undefined) {
                const running = await this.tasks?.countActiveByAgent(input.agentDefinitionId) ?? 0;
                const candidates = [...this.claims.values()].filter((candidate) => candidate.taskId !== input.taskId && candidate.agentDefinitionId === input.agentDefinitionId &&
                    candidate.expiresAt > input.now && !candidate.cleanupInProgress);
                const pending = (await Promise.all(candidates.map(async (candidate) => (await this.tasks?.get(candidate.taskId))?.state === 'READY'))).filter(Boolean).length;
                if (running + pending >= input.maxConcurrency)
                    return null;
            }
            const reclaim = existing !== undefined && existing.taskVersion === input.taskVersion;
            const claim = reclaim
                ? { ...clone(existing), workerId, expiresAt: clone(input.expiresAt), generation: existing.generation + 1 }
                : { ...clone(input), workerId, generation: (existing?.generation ?? 0) + 1, cleanupInProgress: false };
            this.claims.set(input.taskId, claim);
            return clone(claim);
        });
    }
    async beginDispatchCleanup(taskId, workerId, leaseId, generation) {
        return this.serialize(async () => {
            const claim = this.claims.get(taskId);
            const task = await this.tasks?.get(taskId);
            if (!claim || claim.workerId !== workerId || claim.leaseId !== leaseId || claim.generation !== generation ||
                claim.cleanupInProgress || (task && (task.state !== 'READY' || task.version !== claim.taskVersion)))
                return false;
            this.claims.set(taskId, { ...claim, cleanupInProgress: true });
            return true;
        });
    }
    async abortDispatchCleanup(taskId, workerId, leaseId, generation) {
        const claim = this.claims.get(taskId);
        if (claim?.workerId === workerId && claim.leaseId === leaseId && claim.generation === generation) {
            this.claims.set(taskId, { ...claim, cleanupInProgress: false });
        }
    }
    retire(taskId) { this.claims.delete(taskId); }
    snapshot() { return clone(this.claims); }
    restore(snapshot) {
        this.claims.clear();
        for (const [id, claim] of snapshot)
            this.claims.set(id, clone(claim));
    }
    async getDispatchClaim(taskId) {
        const claim = this.claims.get(TaskIdSchema.parse(taskId));
        return claim === undefined ? null : clone(claim);
    }
    async releaseDispatch(taskId, workerId, leaseId) {
        const claim = this.claims.get(taskId);
        if (claim === undefined || claim.workerId !== canonicalId(workerId, 'workerId') || claim.leaseId !== leaseId) {
            return false;
        }
        this.claims.delete(taskId);
        return true;
    }
    async serialize(operation) {
        const previous = this.transactionTail;
        let release;
        this.transactionTail = new Promise((resolve) => { release = resolve; });
        await previous;
        try {
            return await operation();
        }
        finally {
            release();
        }
    }
}
export class InMemoryTransactionalPersistence {
    persistence;
    claims;
    constructor(persistence, claims) {
        this.persistence = persistence;
        this.claims = claims;
    }
    saveTaskAndAppend(input) {
        return this.persistence.saveTaskAndAppend(input);
    }
    saveRecoveryAndAppend(input) {
        const recovery = this.persistence;
        if (!recovery.saveRecoveryAndAppend)
            throw new InvalidPersistenceOperationError('Atomic recovery persistence is not configured');
        return recovery.saveRecoveryAndAppend(input);
    }
    async saveApprovalDecisionAndTask(input) {
        void input;
        throw new InvalidPersistenceOperationError('Atomic approval persistence is not configured');
    }
    async saveApprovalRequest(input) {
        void input;
        throw new InvalidPersistenceOperationError('Atomic approval request persistence is not configured');
    }
    claimDispatch(input) {
        return this.claims.claimDispatch(input);
    }
    getDispatchClaim(taskId) { return this.claims.getDispatchClaim(taskId); }
    beginDispatchCleanup(taskId, workerId, leaseId, generation) {
        return this.claims.beginDispatchCleanup(taskId, workerId, leaseId, generation);
    }
    abortDispatchCleanup(taskId, workerId, leaseId, generation) {
        return this.claims.abortDispatchCleanup(taskId, workerId, leaseId, generation);
    }
    releaseDispatch(taskId, workerId, leaseId) {
        return this.claims.releaseDispatch(taskId, workerId, leaseId);
    }
}
export class InMemoryTaskRepository {
    tasks = new Map();
    async get(taskId) {
        const task = this.tasks.get(TaskIdSchema.parse(taskId));
        return task === undefined ? null : clone(task);
    }
    async listByWorkflow(workflowId) {
        const parsedWorkflowId = WorkflowIdSchema.parse(workflowId);
        return [...this.tasks.values()]
            .filter((task) => task.workflowId === parsedWorkflowId)
            .sort((left, right) => left.id.localeCompare(right.id))
            .map(clone);
    }
    async countActiveByAgent(agentId) {
        return [...this.tasks.values()].filter((task) => task.ownerAgentDefinitionId === agentId && task.state === 'RUNNING').length;
    }
    async save(task, expectedVersion) {
        assertVersion(expectedVersion, 'expectedVersion');
        const parsedTask = TaskSchema.parse(task);
        const existing = this.tasks.get(parsedTask.id);
        if (existing === undefined) {
            if (expectedVersion !== 0 || parsedTask.version !== 0) {
                throw new OptimisticConcurrencyError(parsedTask.id, expectedVersion, 0);
            }
            this.tasks.set(parsedTask.id, clone(parsedTask));
            return;
        }
        if (existing.version !== expectedVersion) {
            throw new OptimisticConcurrencyError(task.id, expectedVersion, existing.version);
        }
        if (parsedTask.version !== expectedVersion + 1) {
            throw new InvalidPersistenceOperationError(`Task ${parsedTask.id} must have version ${expectedVersion + 1}`);
        }
        this.tasks.set(parsedTask.id, clone(parsedTask));
    }
    snapshot(taskId) { const task = this.tasks.get(taskId); return task ? clone(task) : null; }
    restore(taskId, task) { if (task)
        this.tasks.set(taskId, clone(task));
    else
        this.tasks.delete(taskId); }
}
export class InMemoryOutbox {
    commands = new Map();
    now;
    leaseDurationMs;
    constructor(options = {}) {
        this.now = options.now ?? (() => new Date());
        this.leaseDurationMs = options.leaseDurationMs ?? 5 * 60 * 1000;
        if (!Number.isFinite(this.leaseDurationMs) || this.leaseDurationMs < 0) {
            throw new InvalidPersistenceOperationError('leaseDurationMs must be a non-negative number');
        }
    }
    async enqueue(command) {
        const parsedCommand = parseOutboxCommand(command);
        const existing = this.commands.get(parsedCommand.commandId);
        if (existing !== undefined) {
            if (!sameOutboxCommandIdentity(existing, parsedCommand)) {
                throw new DuplicatePersistenceIdError('outbox command', parsedCommand.commandId);
            }
            return;
        }
        this.commands.set(parsedCommand.commandId, clone(parsedCommand));
    }
    async claim(limit, workerId) {
        if (!Number.isInteger(limit) || limit < 0) {
            throw new InvalidPersistenceOperationError('limit must be a non-negative integer');
        }
        const canonicalWorkerId = canonicalId(workerId, 'workerId');
        const currentTime = this.now();
        const staleBefore = currentTime.getTime() - this.leaseDurationMs;
        const candidates = [...this.commands.values()]
            .filter((command) => {
            if (command.completedAt !== undefined && command.completedAt !== null) {
                return false;
            }
            if (command.availableAt.getTime() > currentTime.getTime()) {
                return false;
            }
            if (command.claimedBy === undefined || command.claimedBy === null) {
                return true;
            }
            return command.claimedAt !== undefined &&
                command.claimedAt !== null &&
                command.claimedAt.getTime() <= staleBefore;
        })
            .sort((left, right) => left.availableAt.getTime() - right.availableAt.getTime() ||
            left.commandId.localeCompare(right.commandId))
            .slice(0, limit);
        return candidates.map((command) => {
            const claimed = {
                ...command,
                claimedBy: canonicalWorkerId,
                claimedAt: clone(currentTime)
            };
            this.commands.set(command.commandId, claimed);
            return clone(claimed);
        });
    }
    async markCompleted(commandId) {
        const canonicalCommandId = canonicalId(commandId, 'commandId');
        const command = this.commands.get(canonicalCommandId);
        if (command === undefined) {
            throw new InvalidPersistenceOperationError(`Outbox command ${canonicalCommandId} does not exist`);
        }
        if (command.completedAt !== undefined && command.completedAt !== null) {
            return;
        }
        this.commands.set(canonicalCommandId, {
            ...command,
            completedAt: clone(this.now())
        });
    }
    snapshot() {
        return clone(this.commands);
    }
    restore(snapshot) {
        this.commands.clear();
        for (const [commandId, command] of snapshot.entries())
            this.commands.set(commandId, clone(command));
    }
    retireStartsForTask(taskId) {
        for (const [id, command] of this.commands) {
            if (command.type === 'START_AGENT_SESSION' && command.payload.taskId === taskId && !command.completedAt) {
                this.commands.set(id, { ...command, completedAt: clone(this.now()) });
            }
        }
    }
}
export class InMemoryApprovalTransactionalPersistence {
    options;
    claims;
    operations = new Map();
    transactionTail = Promise.resolve();
    constructor(options) {
        this.options = options;
        this.claims = options.claims ?? new InMemoryDispatchClaimStore(options.tasks);
    }
    async saveTaskAndAppend(input) {
        return this.serialize(() => this.atomicTask(input));
    }
    async saveRecoveryAndAppend(input) {
        return this.serialize(async () => {
            const existing = this.operations.get(input.idempotencyKey);
            if (existing !== undefined) {
                if (existing !== input.requestFingerprint)
                    throw new InvalidPersistenceOperationError('Recovery idempotency key reused with different data');
                return;
            }
            if (!this.options.records)
                throw new InvalidPersistenceOperationError('Atomic recovery record store is not configured');
            const task = this.options.tasks.snapshot(input.task.id);
            const events = this.options.events.snapshot();
            const outbox = this.options.outbox.snapshot();
            const records = this.options.records.snapshot();
            const claims = this.claims.snapshot();
            try {
                await this.writeTask(input);
                this.failIf('after-recovery-task');
                if (input.record.state === 'SUCCEEDED' && input.task.state === 'READY') {
                    this.claims.retire(input.task.id);
                    this.options.outbox.retireStartsForTask(input.task.id);
                }
                await this.options.records.save(input.record);
                this.failIf('after-recovery-record');
                this.operations.set(input.idempotencyKey, input.requestFingerprint);
            }
            catch (error) {
                this.options.tasks.restore(input.task.id, task);
                this.options.events.restore(events);
                this.options.outbox.restore(outbox);
                this.options.records.restore(records);
                this.claims.restore(claims);
                throw error;
            }
        });
    }
    async atomicTask(input) {
        const task = this.options.tasks.snapshot(input.task.id);
        const events = this.options.events.snapshot();
        const outbox = this.options.outbox.snapshot();
        try {
            await this.writeTask(input);
        }
        catch (error) {
            this.options.tasks.restore(input.task.id, task);
            this.options.events.restore(events);
            this.options.outbox.restore(outbox);
            throw error;
        }
    }
    async writeTask(input) {
        await this.options.tasks.save(input.task, input.expectedVersion);
        await this.options.events.append(input.events, input.expectedVersion);
        for (const command of input.commands)
            await this.options.outbox.enqueue(command);
    }
    async serialize(operation) {
        const prior = this.transactionTail;
        let release;
        this.transactionTail = new Promise((resolve) => { release = resolve; });
        await prior;
        try {
            return await operation();
        }
        finally {
            release();
        }
    }
    async saveApprovalRequest(input) {
        return this.serialize(async () => {
            const prior = await this.options.approvals.findByIdempotencyKey(input.idempotencyKey);
            if (prior !== null) {
                if (prior.fingerprint !== input.requestFingerprint) {
                    throw new InvalidPersistenceOperationError('Approval request idempotency key was reused with different data');
                }
                return prior.record;
            }
            if (input.approval.version !== 0 || input.approval.state !== 'PENDING') {
                throw new InvalidPersistenceOperationError('Approval requests must start as pending version 0 records');
            }
            const approvalSnapshot = this.options.approvals.snapshot();
            const eventSnapshot = this.options.events.snapshot();
            const outboxSnapshot = this.options.outbox.snapshot();
            try {
                const persisted = await this.options.approvals.commitRequest(input.approval, input.idempotencyKey, input.requestFingerprint, input.requestEvent, input.command);
                this.failIf('after-request-approval');
                await this.options.events.appendApprovalRequest(input.requestEvent);
                this.failIf('after-request-event');
                await this.options.outbox.enqueue(input.command);
                this.failIf('after-request-outbox');
                return persisted;
            }
            catch (error) {
                this.options.approvals.restore(approvalSnapshot);
                this.options.events.restore(eventSnapshot);
                this.options.outbox.restore(outboxSnapshot);
                throw error;
            }
        });
    }
    async saveApprovalDecisionAndTask(input) {
        return this.serialize(async () => {
            const priorFingerprint = this.operations.get(input.idempotencyKey);
            if (priorFingerprint !== undefined) {
                if (priorFingerprint !== input.requestFingerprint) {
                    throw new InvalidPersistenceOperationError('Atomic approval idempotency key was reused with different data');
                }
                return;
            }
            const taskProvided = input.task !== undefined || input.taskEvent !== undefined || input.expectedTaskVersion !== undefined;
            if (taskProvided !== (input.task !== undefined && input.taskEvent !== undefined && input.expectedTaskVersion !== undefined)) {
                throw new InvalidPersistenceOperationError('Atomic approval task fields must be provided together');
            }
            const approvalSnapshot = this.options.approvals.snapshot();
            const eventSnapshot = this.options.events.snapshot();
            const outboxSnapshot = this.options.outbox.snapshot();
            const taskSnapshot = input.task === undefined ? null : this.options.tasks.snapshot(input.task.id);
            try {
                await this.options.approvals.commitDecision(input.approval, input.expectedApprovalVersion, input.approvalEvent, input.idempotencyKey, input.requestFingerprint);
                this.failIf('after-approval');
                if (input.task !== undefined && input.taskEvent !== undefined && input.expectedTaskVersion !== undefined) {
                    await this.options.tasks.save(input.task, input.expectedTaskVersion);
                    this.failIf('after-task');
                }
                await this.options.events.append([input.approvalEvent], input.expectedApprovalVersion);
                this.failIf('after-approval-event');
                if (input.taskEvent !== undefined && input.expectedTaskVersion !== undefined) {
                    await this.options.events.append([input.taskEvent], input.expectedTaskVersion);
                    this.failIf('after-task-event');
                }
                for (const command of input.commands)
                    await this.options.outbox.enqueue(command);
                this.failIf('after-outbox');
                this.operations.set(input.idempotencyKey, input.requestFingerprint);
            }
            catch (error) {
                this.options.approvals.restore(approvalSnapshot);
                this.options.events.restore(eventSnapshot);
                this.options.outbox.restore(outboxSnapshot);
                if (input.task !== undefined)
                    this.options.tasks.restore(input.task.id, taskSnapshot);
                throw error;
            }
        });
    }
    claimDispatch(input) {
        return this.serialize(() => this.claims.claimDispatch(input));
    }
    getDispatchClaim(taskId) { return this.claims.getDispatchClaim(taskId); }
    beginDispatchCleanup(taskId, workerId, leaseId, generation) {
        return this.serialize(() => this.claims.beginDispatchCleanup(taskId, workerId, leaseId, generation));
    }
    abortDispatchCleanup(taskId, workerId, leaseId, generation) {
        return this.serialize(() => this.claims.abortDispatchCleanup(taskId, workerId, leaseId, generation));
    }
    releaseDispatch(taskId, workerId, leaseId) {
        return this.serialize(() => this.claims.releaseDispatch(taskId, workerId, leaseId));
    }
    failIf(point) {
        if (this.options.failAfter === point)
            throw new Error(`Injected atomic approval failure at ${point}`);
    }
}
export { DuplicatePersistenceIdError, InvalidPersistenceOperationError, OptimisticConcurrencyError };
//# sourceMappingURL=inmemory-store.js.map