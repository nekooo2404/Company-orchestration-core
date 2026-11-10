import { failureFingerprint } from './failure-fingerprint.js';
import { transitionTask } from './task-state-machine.js';
const systemActor = { kind: 'SYSTEM', name: 'scheduler' };
const errorExitCode = (error) => {
    if (error === null || typeof error !== 'object')
        return undefined;
    const exitCode = error.exitCode;
    return typeof exitCode === 'number' && Number.isFinite(exitCode) ? exitCode : undefined;
};
const failureContext = (task, attemptId, error) => {
    const exitCode = errorExitCode(error);
    return {
        taskId: task.id,
        attemptId,
        errorClass: error instanceof Error ? error.name : 'UnknownError',
        commandName: 'START_AGENT_SESSION',
        ...(exitCode === undefined ? {} : { exitCode }),
        message: error instanceof Error ? error.message : String(error),
        evidenceIds: []
    };
};
const startCommand = (task, lease, eventId, issuedAt, agentDefinitionId, idempotencyKey) => ({
    commandId: `start-agent-session:${task.id}:${lease.leaseId}`,
    type: 'START_AGENT_SESSION',
    payload: {
        taskId: task.id,
        workflowId: task.workflowId,
        agentDefinitionId,
        leaseId: lease.leaseId,
        idempotencyKey
    },
    actor: systemActor,
    issuedAt,
    availableAt: issuedAt,
    correlationId: task.traceId,
    causationId: eventId
});
export class TaskDispatcher {
    options;
    constructor(options) {
        this.options = options;
    }
    async dispatch(input) {
        const { task, agentDefinitionId, lease, sessionId, claim } = input;
        const launchInput = {
            taskId: task.id,
            workflowId: task.workflowId,
            agentDefinitionId,
            leaseId: lease.leaseId,
            sessionId,
            expectedTaskVersion: task.version,
            idempotencyKey: sessionId,
            correlationId: task.traceId
        };
        let session;
        try {
            session = await this.options.launcher.launch(launchInput);
        }
        catch (error) {
            if (this.options.launcher.persistsStart)
                return { decision: null, releaseClaim: false };
            await this.persistFailure(task, sessionId, error);
            return { decision: null, releaseClaim: true };
        }
        if (session.sessionId !== sessionId) {
            const mismatch = new Error(`Launcher returned session ${session.sessionId}; expected persisted session ${sessionId}`);
            try {
                await this.options.launcher.stop(session.sessionId, 'launcher returned a different session identity');
            }
            catch (error) {
                throw new Error('Launcher session identity mismatch and cleanup failed', { cause: error });
            }
            await this.persistFailure(task, sessionId, mismatch);
            return { decision: null, releaseClaim: true };
        }
        if (this.options.launcher.persistsStart)
            return { decision: {
                    taskId: task.id, agentDefinitionId, leaseId: lease.leaseId,
                    expiresAt: new Date(lease.expiresAt), correlationId: task.traceId
                }, releaseClaim: false };
        const context = {
            actor: systemActor,
            now: this.options.clock.now(),
            evidenceIds: [],
            isDeployment: task.isDeployment ?? false
        };
        const started = transitionTask(task, { type: 'TASK_STARTED', sessionId: session.sessionId }, context);
        const command = startCommand(task, lease, started.event.eventId, context.now, agentDefinitionId, sessionId);
        try {
            await this.options.transactionalPersistence.saveTaskAndAppend({
                task: started.task,
                expectedVersion: task.version,
                events: [started.event],
                commands: [command]
            });
        }
        catch (error) {
            if (claim) {
                const fenced = await this.options.transactionalPersistence.beginDispatchCleanup(task.id, claim.workerId, claim.leaseId, claim.generation);
                if (!fenced)
                    return { decision: null, releaseClaim: false };
            }
            try {
                await this.options.launcher.stop(session.sessionId, 'dispatch persistence failed');
                return { decision: null, releaseClaim: true };
            }
            catch (stopError) {
                if (claim)
                    await this.options.transactionalPersistence.abortDispatchCleanup(task.id, claim.workerId, claim.leaseId, claim.generation);
                throw new AggregateError([error, stopError], 'Dispatch persistence and provider cleanup both failed');
            }
        }
        return { decision: {
                taskId: task.id,
                agentDefinitionId,
                leaseId: lease.leaseId,
                expiresAt: new Date(lease.expiresAt),
                correlationId: task.traceId
            }, releaseClaim: false };
    }
    async persistFailure(task, attemptId, error) {
        const failure = failureContext(task, attemptId, error);
        const fingerprint = failureFingerprint(failure);
        const context = {
            actor: systemActor,
            now: this.options.clock.now(),
            evidenceIds: [],
            isDeployment: task.isDeployment ?? false
        };
        const failed = transitionTask(task, { type: 'TASK_FAILED', failureFingerprint: fingerprint }, context);
        await this.options.transactionalPersistence.saveTaskAndAppend({
            task: failed.task,
            expectedVersion: task.version,
            events: [failed.event],
            commands: []
        });
        const recovery = this.options.recoveryCoordinator;
        if (recovery?.handleTaskEvent) {
            await recovery.handleTaskEvent(failed.event, failure);
            return;
        }
        await recovery?.start({ taskId: task.id, failure, actor: systemActor, correlationId: task.traceId });
    }
}
//# sourceMappingURL=dispatch.js.map