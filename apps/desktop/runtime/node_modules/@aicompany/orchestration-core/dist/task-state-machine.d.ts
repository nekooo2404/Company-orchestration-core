import { type ActorRef, type AgentSessionId, type ApprovalId, type ApprovalRecord, type DomainEvent, type Task } from '@aicompany/contracts';
export type TaskTransition = {
    type: 'TASK_READY';
} | {
    type: 'TASK_STARTED';
    sessionId: AgentSessionId;
} | {
    type: 'TASK_REVIEW_REQUESTED';
} | {
    type: 'TASK_COMPLETED';
    evidenceIds: string[];
} | {
    type: 'TASK_BLOCKED';
    reason: string;
} | {
    type: 'TASK_FAILED';
    failureFingerprint: string;
} | {
    type: 'RECOVERY_STARTED';
    recoveryId: string;
} | {
    type: 'TASK_ESCALATED';
    reason: string;
} | {
    type: 'TASK_CANCELLED';
    reason: string;
} | {
    type: 'APPROVAL_REQUESTED';
    approvalId: ApprovalId;
} | {
    type: 'DEPLOYMENT_APPROVED';
    approvalId: ApprovalId;
    approvalRecord: ApprovalRecord;
} | {
    type: 'DEPLOYMENT_REJECTED';
    approvalId: ApprovalId;
    reason: string;
    approvalRecord: ApprovalRecord;
} | {
    type: 'DEPLOYMENT_RESULT_RECORDED';
    approvalId: ApprovalId;
    attemptId: string;
    verified: true;
    evidenceIds: string[];
};
export interface TransitionContext {
    actor: ActorRef;
    now: Date;
    evidenceIds: string[];
    isDeployment: boolean;
}
export interface TransitionResult {
    task: Task;
    event: DomainEvent;
}
export declare function transitionTask(task: Task, transition: TaskTransition, context: TransitionContext): TransitionResult;
//# sourceMappingURL=task-state-machine.d.ts.map