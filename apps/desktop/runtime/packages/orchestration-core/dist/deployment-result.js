import { transitionTask } from './task-state-machine.js';
export class DeploymentResultRecorder {
    options;
    constructor(options) {
        this.options = options;
    }
    async record(taskId) {
        const task = await this.options.tasks.get(taskId);
        if (!task || !task.isDeployment || task.state !== 'RUNNING' ||
            !task.deploymentApprovalId || !task.deploymentAttemptId) {
            throw new Error('Deployment has no active approved attempt');
        }
        const result = await this.options.verifier.verify({ taskId,
            approvalId: task.deploymentApprovalId, attemptId: task.deploymentAttemptId });
        if (!result || result.evidenceIds.length === 0) {
            throw new Error('Verified deployment result evidence is required');
        }
        if (result.approvalId !== task.deploymentApprovalId || result.attemptId !== task.deploymentAttemptId) {
            throw new Error('Verified deployment result does not match the approved attempt');
        }
        const context = { actor: { kind: 'SYSTEM', name: 'deployment-result-recorder' },
            now: this.options.now(), evidenceIds: result.evidenceIds, isDeployment: true };
        if (!result.succeeded) {
            const failed = transitionTask(task, { type: 'TASK_FAILED', failureFingerprint: `deployment:${result.attemptId}:failed` }, context);
            await this.options.persistence.saveTaskAndAppend({ task: failed.task,
                expectedVersion: task.version, events: [failed.event], commands: [] });
            await this.options.recoveryCoordinator?.start({
                taskId: task.id,
                failure: { taskId: task.id, attemptId: result.attemptId, errorClass: 'DeploymentFailed', commandName: 'DEPLOY', message: 'Verified deployment result reported failure', evidenceIds: result.evidenceIds },
                actor: context.actor,
                correlationId: task.traceId
            });
            return failed.task;
        }
        const transitioned = transitionTask(task, { type: 'DEPLOYMENT_RESULT_RECORDED',
            approvalId: result.approvalId, attemptId: result.attemptId, verified: true,
            evidenceIds: result.evidenceIds }, context);
        await this.options.persistence.saveTaskAndAppend({ task: transitioned.task,
            expectedVersion: task.version, events: [transitioned.event], commands: [] });
        return transitioned.task;
    }
}
//# sourceMappingURL=deployment-result.js.map