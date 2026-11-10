import { AgentSessionSchema, DomainEventSchema, agentSessionId, eventId } from '../../contracts/dist/index.js';
import { InvalidTaskTransitionError } from './domain-errors.js';
import { canonicalFingerprint } from './session-commands.js';
import { OptimisticConcurrencyError } from './repository.js';
import { transitionTask } from './task-state-machine.js';
const actor = { kind: 'SYSTEM', name: 'agent-session-manager' };
export class AgentSessionManagerService {
    options;
    nextSession = 0;
    nextEvent = 0;
    constructor(options) {
        this.options = options;
    }
    async start(input) {
        if (!input.idempotencyKey.trim())
            throw new Error('A deterministic idempotency key is required');
        if (!Number.isSafeInteger(input.expectedTaskVersion) || input.expectedTaskVersion < 0)
            throw new Error('expectedTaskVersion must be a non-negative integer');
        const prior = await this.options.sessionRepository.findByTask(input.taskId, input.idempotencyKey);
        if (prior) {
            const expectedFingerprint = this.startFingerprint(input);
            if (await this.options.sessionRepository.startFingerprint(input.taskId, input.idempotencyKey) !== expectedFingerprint)
                throw new Error('Start idempotency key was reused with different input');
            return prior;
        }
        const task = await this.options.taskRepository.get(input.taskId);
        if (!task)
            throw new Error(`Task ${input.taskId} does not exist`);
        if (task.version !== input.expectedTaskVersion)
            throw new OptimisticConcurrencyError(task.id, input.expectedTaskVersion, task.version);
        if (!await this.options.workflowStatus.isActive(task.workflowId))
            throw new Error('Workflow is not active');
        const claim = await this.options.dispatchClaims.getDispatchClaim(task.id);
        if (!claim || claim.leaseId !== input.leaseId || claim.expiresAt.getTime() <= this.options.clock.now().getTime() || claim.taskVersion !== task.version || claim.agentDefinitionId !== input.agentDefinitionId || claim.cleanupInProgress || (task.ownerAgentDefinitionId !== null && task.ownerAgentDefinitionId !== input.agentDefinitionId))
            throw new Error('Current dispatch lease is missing, expired, stale, cleanup-fenced, or does not match task owner');
        if (task.state !== 'READY')
            throw new InvalidTaskTransitionError(task.id, task.state, 'TASK_STARTED');
        const now = this.options.clock.now();
        const sessionId = claim.sessionId;
        const assignedTask = task.ownerAgentDefinitionId === null
            ? { ...task, ownerAgentDefinitionId: input.agentDefinitionId }
            : task;
        const transitioned = transitionTask(assignedTask, { type: 'TASK_STARTED', sessionId }, {
            actor, now, evidenceIds: [], isDeployment: task.isDeployment ?? false
        });
        const session = AgentSessionSchema.parse({
            sessionId, taskId: task.id, workflowId: task.workflowId,
            agentDefinitionId: input.agentDefinitionId, state: 'RUNNING',
            contextReference: `session:${sessionId}`, checkpointReference: null,
            traceId: input.correlationId, usage: { inputTokens: 0, outputTokens: 0, costUsd: 0 },
            toolCallHistory: [], attempt: 1, version: 0, createdAt: now, updatedAt: now
        });
        const command = {
            commandId: `start-agent-session:${input.idempotencyKey}:attempt:1`, type: 'START_AGENT_SESSION',
            actor, issuedAt: now, availableAt: now, correlationId: input.correlationId, causationId: transitioned.event.eventId,
            payload: { taskId: task.id, workflowId: task.workflowId, agentDefinitionId: input.agentDefinitionId,
                leaseId: input.leaseId, idempotencyKey: sessionId, attempt: 1, completedOperationKeys: [] }
        };
        const event = DomainEventSchema.parse({ eventId: eventId(`session:${sessionId}:v1`), aggregateType: 'AGENT_SESSION',
            aggregateId: sessionId, aggregateVersion: 1, eventType: 'AGENT_SESSION_STARTED', actor,
            correlationId: input.correlationId, causationId: transitioned.event.eventId, occurredAt: now,
            payload: { sessionId, taskId: task.id } });
        await this.options.lifecyclePersistence.start({ task: transitioned.task, expectedTaskVersion: task.version, session,
            expectedSessionVersion: 0, taskEvent: transitioned.event, event, command, idempotencyKey: input.idempotencyKey,
            requestFingerprint: this.startFingerprint(input) });
        return session;
    }
    async checkpoint(input) {
        if (!Number.isSafeInteger(input.expectedSequence) || input.expectedSequence < 0 || !Number.isSafeInteger(input.expectedSessionVersion) || input.expectedSessionVersion < 0 || !input.idempotencyKey.trim())
            throw new Error('Checkpoint sequence, expected session version, and idempotency key are required');
        const requestFingerprint = canonicalFingerprint({ operation: 'checkpoint', sessionId: input.sessionId,
            expectedSessionVersion: input.expectedSessionVersion, expectedSequence: input.expectedSequence, state: input.state,
            contextReference: input.contextReference, lastEventId: input.lastEventId,
            completedOperationKeys: input.completedOperationKeys });
        if (this.options.lifecyclePersistence.operationFingerprint(input.idempotencyKey) !== null) {
            if (this.options.lifecyclePersistence.requestFingerprint(input.idempotencyKey) !== requestFingerprint)
                throw new Error('Checkpoint idempotency key was reused with different input');
            const prior = this.options.lifecyclePersistence.operationCheckpoint(input.idempotencyKey);
            if (prior)
                return prior;
            throw new Error('Checkpoint operation result is unavailable');
        }
        const session = await this.requireSession(input.sessionId);
        if (session.version !== input.expectedSessionVersion)
            throw new OptimisticConcurrencyError(session.sessionId, input.expectedSessionVersion, session.version);
        if (session.state === 'CANCELLED' || session.state === 'COMPLETED' || session.state === 'FAILED')
            throw new Error('Terminal session cannot be checkpointed');
        const task = await this.options.taskRepository.get(session.taskId);
        if (!task || task.state === 'CANCELLED' || task.state === 'COMPLETED' || task.state === 'ESCALATED_TO_CEO')
            throw new Error('Terminal task cannot be checkpointed');
        const latest = await this.options.checkpointStore.latest(input.sessionId);
        const current = latest?.sequence ?? 0;
        if (input.expectedSequence !== current)
            throw new Error(`Checkpoint sequence conflict: expected ${input.expectedSequence}, actual ${current}`);
        const checkpoint = {
            sessionId: session.sessionId, taskId: session.taskId, sequence: current + 1,
            state: input.state, contextReference: input.contextReference,
            lastEventId: input.lastEventId, completedOperationKeys: [...new Set([...(latest?.completedOperationKeys ?? []), ...input.completedOperationKeys])],
            createdAt: this.options.clock.now()
        };
        const updated = { ...session, state: input.state, contextReference: input.contextReference,
            checkpointReference: `${session.sessionId}:checkpoint:${checkpoint.sequence}`,
            version: session.version + 1, updatedAt: checkpoint.createdAt };
        const event = DomainEventSchema.parse({ eventId: this.newEventId(), aggregateType: 'AGENT_SESSION',
            aggregateId: session.sessionId, aggregateVersion: updated.version + 1, eventType: input.state === 'COMPLETED' ? 'AGENT_SESSION_COMPLETED' : 'AGENT_SESSION_PAUSED', actor,
            correlationId: session.traceId, causationId: input.lastEventId, occurredAt: checkpoint.createdAt,
            payload: { sessionId: session.sessionId, reason: 'checkpoint' } });
        await this.options.lifecyclePersistence.checkpoint({ checkpoint, session: updated, expectedSessionVersion: session.version,
            event, idempotencyKey: input.idempotencyKey, requestFingerprint });
        return checkpoint;
    }
    async resume(sessionId, options) {
        if (!options.idempotencyKey.trim() || !Number.isSafeInteger(options.expectedVersion) || options.expectedVersion < 0 || !Number.isSafeInteger(options.attempt) || options.attempt < 1)
            throw new Error('Resume expectedVersion, attempt, and idempotencyKey are required');
        const session = await this.requireSession(sessionId);
        if (session.state === 'CANCELLED')
            throw new Error('A cancelled session cannot be resumed');
        const task = await this.options.taskRepository.get(session.taskId);
        if (!task || task.workflowId !== session.workflowId || !['RUNNING', 'READY'].includes(task.state) || !await this.options.workflowStatus.isActive(session.workflowId)) {
            throw new Error('Session task or workflow is no longer active');
        }
        const expectedCommandId = `start-agent-session:${sessionId}:attempt:${options.attempt}`;
        const requestFingerprint = canonicalFingerprint({ operation: 'resume', sessionId, expectedVersion: options.expectedVersion,
            requestedAttempt: options.attempt, commandId: expectedCommandId });
        if (this.options.lifecyclePersistence.operationFingerprint(options.idempotencyKey) !== null) {
            if (this.options.lifecyclePersistence.requestFingerprint(options.idempotencyKey) !== requestFingerprint)
                throw new Error('Resume idempotency key was reused with different input');
            const prior = this.options.lifecyclePersistence.operationResult(options.idempotencyKey);
            if (prior?.sessionId === sessionId && session.state === 'RUNNING' && prior.version === session.version && prior.attempt === options.attempt)
                return session;
            throw new Error('Stored resume result does not match the current session');
        }
        if (session.version !== options.expectedVersion)
            throw new OptimisticConcurrencyError(sessionId, options.expectedVersion, session.version);
        if (session.state === 'RUNNING') {
            throw new Error('Running session does not match this resume idempotency key');
        }
        if (session.state !== 'PAUSED' && session.state !== 'WAITING_FOR_TOOL') {
            throw new Error(`Session in ${session.state} cannot be resumed`);
        }
        const checkpoint = await this.options.checkpointStore.latest(sessionId);
        if (!checkpoint)
            throw new Error('Cannot resume without a checkpoint');
        const attempt = (session.attempt ?? 1) + 1;
        if (options.attempt !== attempt)
            throw new Error(`Requested resume attempt must be ${attempt}`);
        const now = this.options.clock.now();
        const updated = AgentSessionSchema.parse({ ...session, state: 'RUNNING', attempt,
            version: session.version + 1, updatedAt: now });
        const operationKey = options.idempotencyKey;
        const causationId = eventId(`resume-event:${operationKey}`);
        const command = { commandId: `start-agent-session:${sessionId}:attempt:${attempt}`, type: 'START_AGENT_SESSION',
            actor, issuedAt: now, availableAt: now, correlationId: session.traceId, causationId,
            payload: { taskId: session.taskId, workflowId: session.workflowId, agentDefinitionId: session.agentDefinitionId,
                leaseId: `resume:${sessionId}:${attempt}`, idempotencyKey: sessionId, attempt,
                completedOperationKeys: [...checkpoint.completedOperationKeys] } };
        const event = DomainEventSchema.parse({ eventId: causationId, aggregateType: 'AGENT_SESSION',
            aggregateId: sessionId, aggregateVersion: updated.version + 1, eventType: 'AGENT_SESSION_RESUMED', actor,
            correlationId: session.traceId, causationId: checkpoint.lastEventId, occurredAt: now,
            payload: { sessionId } });
        try {
            await this.options.lifecyclePersistence.transition({ session: updated, expectedSessionVersion: session.version, event, command, expectedTaskVersion: null,
                idempotencyKey: operationKey, requestFingerprint });
        }
        catch (error) {
            const current = await this.requireSession(sessionId);
            const winning = this.options.lifecyclePersistence.operationResult(operationKey);
            if (this.options.lifecyclePersistence.requestFingerprint(operationKey) === requestFingerprint && current.state === 'RUNNING' && winning?.sessionId === sessionId && winning.attempt === options.attempt && winning.version === current.version)
                return current;
            throw error;
        }
        return updated;
    }
    async pause(sessionId, reason, options) {
        if (!reason.trim())
            throw new Error('Pause reason is required');
        const session = await this.requireSession(sessionId);
        if (session.state === 'PAUSED') {
            if (session.version !== options.expectedVersion + 1)
                throw new OptimisticConcurrencyError(sessionId, options.expectedVersion + 1, session.version);
            const request = this.options.lifecyclePersistence.requestFingerprint(options.idempotencyKey);
            if (request === canonicalFingerprint({ operation: 'pause', sessionId, expectedVersion: options.expectedVersion, reason }))
                return;
            throw new Error('Idempotency key was reused with different input');
        }
        this.validateLifecycleOptions(sessionId, session.version, options);
        if (!['RUNNING', 'WAITING_FOR_TOOL'].includes(session.state))
            throw new Error(`Session in ${session.state} cannot be paused`);
        const now = this.options.clock.now();
        const updated = AgentSessionSchema.parse({ ...session, state: 'PAUSED', version: session.version + 1, updatedAt: now });
        const latest = await this.options.checkpointStore.latest(sessionId);
        const requestFingerprint = canonicalFingerprint({ operation: 'pause', sessionId, expectedVersion: session.version, reason });
        const event = DomainEventSchema.parse({ eventId: this.newEventId(), aggregateType: 'AGENT_SESSION',
            aggregateId: sessionId, aggregateVersion: updated.version + 1, eventType: 'AGENT_SESSION_PAUSED', actor,
            correlationId: session.traceId, causationId: latest?.lastEventId ?? this.newEventId(), occurredAt: now,
            payload: { sessionId, reason } });
        await this.options.lifecyclePersistence.transition({ session: updated, expectedSessionVersion: session.version, event, command: null, expectedTaskVersion: null,
            idempotencyKey: options.idempotencyKey, requestFingerprint });
    }
    async cancel(sessionId, reason, options) {
        if (!reason.trim())
            throw new Error('Cancellation reason is required');
        const session = await this.requireSession(sessionId);
        if (session.state === 'CANCELLED') {
            const request = this.options.lifecyclePersistence.requestFingerprint(options.idempotencyKey);
            if (session.version !== options.expectedVersion + 1)
                throw new OptimisticConcurrencyError(sessionId, options.expectedVersion + 1, session.version);
            if (request === canonicalFingerprint({ operation: 'cancel', sessionId, expectedVersion: options.expectedVersion, reason }))
                return;
            throw new Error('Cancelled session does not match this cancellation idempotency key');
        }
        this.validateLifecycleOptions(sessionId, session.version, options);
        if (await this.options.hasPendingCleanup?.(sessionId))
            throw new Error('Session cancellation is blocked while dependent cleanup is pending');
        const task = await this.options.taskRepository.get(session.taskId);
        if (!task)
            throw new Error(`Task ${session.taskId} does not exist`);
        if (task.state === 'CANCELLED')
            throw new Error('Task is already cancelled by another lifecycle operation');
        const now = this.options.clock.now();
        const transitioned = transitionTask(task, { type: 'TASK_CANCELLED', reason }, {
            actor, now, evidenceIds: [], isDeployment: task.isDeployment ?? false
        });
        const event = DomainEventSchema.parse({
            eventId: this.newEventId(), aggregateType: 'AGENT_SESSION', aggregateId: session.sessionId,
            aggregateVersion: session.version + 2, eventType: 'AGENT_SESSION_CANCELLED',
            actor, correlationId: session.traceId, causationId: transitioned.event.eventId, occurredAt: now,
            payload: { sessionId, reason }
        });
        const cancelledSession = AgentSessionSchema.parse({ ...session, state: 'CANCELLED', version: session.version + 1, updatedAt: now });
        const requestFingerprint = canonicalFingerprint({ operation: 'cancel', sessionId, expectedVersion: session.version, reason });
        await this.options.lifecyclePersistence.cancel({ task: transitioned.task, expectedTaskVersion: task.version,
            session: cancelledSession, expectedSessionVersion: session.version, taskEvent: transitioned.event,
            event, idempotencyKey: options.idempotencyKey, requestFingerprint });
    }
    async requireSession(sessionId) {
        const session = await this.options.sessionRepository.get(sessionId);
        if (!session)
            throw new Error(`Session ${sessionId} does not exist`);
        return session;
    }
    newSessionId(attempt) {
        this.nextSession += 1;
        return this.options.idFactory?.(attempt) ?? agentSessionId(`agent-session-${this.nextSession}`);
    }
    startFingerprint(input) {
        return JSON.stringify({ taskId: input.taskId, leaseId: input.leaseId, agentDefinitionId: input.agentDefinitionId,
            correlationId: input.correlationId, expectedTaskVersion: input.expectedTaskVersion });
    }
    validateLifecycleOptions(sessionId, version, options) {
        if (!options.idempotencyKey.trim() || !Number.isSafeInteger(options.expectedVersion) || options.expectedVersion < 0)
            throw new Error('Lifecycle expectedVersion and idempotencyKey are required');
        if (version !== options.expectedVersion)
            throw new OptimisticConcurrencyError(sessionId, options.expectedVersion, version);
    }
    newEventId() {
        this.nextEvent += 1;
        return this.options.eventIdFactory?.() ?? eventId(`agent-session-event-${this.nextEvent}`);
    }
}
export class SessionManagerLauncher {
    manager;
    persistsStart = true;
    constructor(manager) {
        this.manager = manager;
    }
    launch(input) {
        return this.manager.start({ taskId: input.taskId, leaseId: input.leaseId,
            agentDefinitionId: input.agentDefinitionId, correlationId: input.correlationId,
            expectedTaskVersion: input.expectedTaskVersion, idempotencyKey: input.idempotencyKey });
    }
    async stop() {
        throw new Error('Manager-owned startup cannot be stopped through the dispatch launcher');
    }
}
//# sourceMappingURL=agent-session-manager.js.map