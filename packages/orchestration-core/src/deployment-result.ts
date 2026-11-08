import type { ApprovalId, Task, TaskId } from '@aicompany/contracts';
import type { TaskRepository } from './repository.js';
import type { TransactionalPersistence } from './ports.js';
import { transitionTask } from './task-state-machine.js';

export interface VerifiedDeploymentResult {
  approvalId: ApprovalId;
  attemptId: string;
  succeeded: boolean;
  evidenceIds: string[];
}

export interface DeploymentResultVerifier {
  verify(input: { taskId: TaskId; approvalId: ApprovalId; attemptId: string }): Promise<VerifiedDeploymentResult | null>;
}

export class DeploymentResultRecorder {
  public constructor(private readonly options: {
    tasks: TaskRepository;
    persistence: TransactionalPersistence;
    verifier: DeploymentResultVerifier;
    now: () => Date;
  }) {}

  public async record(taskId: TaskId): Promise<Task> {
    const task = await this.options.tasks.get(taskId);
    if (!task || !task.isDeployment || task.state !== 'RUNNING' ||
        !task.deploymentApprovalId || !task.deploymentAttemptId) {
      throw new Error('Deployment has no active approved attempt');
    }
    const result = await this.options.verifier.verify({ taskId,
      approvalId: task.deploymentApprovalId as ApprovalId, attemptId: task.deploymentAttemptId });
    if (!result || !result.succeeded || result.evidenceIds.length === 0) {
      throw new Error('Verified deployment result evidence is required');
    }
    if (result.approvalId !== task.deploymentApprovalId || result.attemptId !== task.deploymentAttemptId) {
      throw new Error('Verified deployment result does not match the approved attempt');
    }
    const transitioned = transitionTask(task, { type: 'DEPLOYMENT_RESULT_RECORDED',
      approvalId: result.approvalId, attemptId: result.attemptId, verified: true,
      evidenceIds: result.evidenceIds }, { actor: { kind: 'SYSTEM', name: 'deployment-result-recorder' },
      now: this.options.now(), evidenceIds: result.evidenceIds, isDeployment: true });
    await this.options.persistence.saveTaskAndAppend({ task: transitioned.task,
      expectedVersion: task.version, events: [transitioned.event], commands: [] });
    return transitioned.task;
  }
}
