import type { ApprovalId, Task, TaskId } from '@aicompany/contracts';
import type { TaskRepository } from './repository.js';
import type { TransactionalPersistence } from './ports.js';
import type { RecoveryCoordinator } from './recovery.js';
export interface VerifiedDeploymentResult {
    approvalId: ApprovalId;
    attemptId: string;
    succeeded: boolean;
    evidenceIds: string[];
}
export interface DeploymentResultVerifier {
    verify(input: {
        taskId: TaskId;
        approvalId: ApprovalId;
        attemptId: string;
    }): Promise<VerifiedDeploymentResult | null>;
}
export declare class DeploymentResultRecorder {
    private readonly options;
    constructor(options: {
        tasks: TaskRepository;
        persistence: TransactionalPersistence;
        verifier: DeploymentResultVerifier;
        now: () => Date;
        recoveryCoordinator?: Pick<RecoveryCoordinator, 'start'>;
    });
    record(taskId: TaskId): Promise<Task>;
}
//# sourceMappingURL=deployment-result.d.ts.map