import { z } from 'zod';
import { type EventId } from './ids.js';
import { type ActorRef } from './agent.js';
export declare const EventTypeSchema: z.ZodEnum<["TASK_CREATED", "TASK_READY", "TASK_STARTED", "TASK_PROGRESS", "REVIEW_REQUESTED", "ARTIFACT_CREATED", "BLOCKED", "TASK_FAILED", "RECOVERY_STARTED", "TASK_COMPLETED", "DEPLOYMENT_APPROVAL_REQUESTED", "DEPLOYMENT_APPROVED", "DEPLOYMENT_REJECTED", "DEPLOYMENT_RESULT_RECORDED", "APPROVAL_REQUESTED", "TASK_ESCALATED", "TASK_CANCELLED", "AGENT_SESSION_CREATED", "AGENT_SESSION_STARTED", "AGENT_SESSION_PAUSED", "AGENT_SESSION_RESUMED", "AGENT_SESSION_COMPLETED", "AGENT_SESSION_FAILED", "AGENT_SESSION_CANCELLED", "APPROVAL_APPROVED", "APPROVAL_REJECTED"]>;
export type EventType = z.infer<typeof EventTypeSchema>;
export declare const TaskCreatedPayloadSchema: z.ZodObject<{
    taskId: z.ZodEffects<z.ZodEffects<z.ZodString, string, string>, string & {
        readonly __brand: "TaskId";
    }, string>;
    workflowId: z.ZodEffects<z.ZodEffects<z.ZodString, string, string>, string & {
        readonly __brand: "WorkflowId";
    }, string>;
}, "strip", z.ZodTypeAny, {
    workflowId: string & {
        readonly __brand: "WorkflowId";
    };
    taskId: string & {
        readonly __brand: "TaskId";
    };
}, {
    workflowId: string;
    taskId: string;
}>;
export declare const TaskReadyPayloadSchema: z.ZodObject<{
    taskId: z.ZodEffects<z.ZodEffects<z.ZodString, string, string>, string & {
        readonly __brand: "TaskId";
    }, string>;
}, "strip", z.ZodTypeAny, {
    taskId: string & {
        readonly __brand: "TaskId";
    };
}, {
    taskId: string;
}>;
export declare const TaskStartedPayloadSchema: z.ZodObject<{
    sessionId: z.ZodEffects<z.ZodEffects<z.ZodString, string, string>, string & {
        readonly __brand: "AgentSessionId";
    }, string>;
    taskId: z.ZodOptional<z.ZodEffects<z.ZodEffects<z.ZodString, string, string>, string & {
        readonly __brand: "TaskId";
    }, string>>;
}, "strip", z.ZodTypeAny, {
    sessionId: string & {
        readonly __brand: "AgentSessionId";
    };
    taskId?: (string & {
        readonly __brand: "TaskId";
    }) | undefined;
}, {
    sessionId: string;
    taskId?: string | undefined;
}>;
export declare const TaskProgressPayloadSchema: z.ZodEffects<z.ZodObject<{
    taskId: z.ZodOptional<z.ZodEffects<z.ZodEffects<z.ZodString, string, string>, string & {
        readonly __brand: "TaskId";
    }, string>>;
    progress: z.ZodOptional<z.ZodEffects<z.ZodString, string, string>>;
    message: z.ZodOptional<z.ZodEffects<z.ZodString, string, string>>;
    percent: z.ZodOptional<z.ZodNumber>;
}, "strip", z.ZodTypeAny, {
    message?: string | undefined;
    taskId?: (string & {
        readonly __brand: "TaskId";
    }) | undefined;
    progress?: string | undefined;
    percent?: number | undefined;
}, {
    message?: string | undefined;
    taskId?: string | undefined;
    progress?: string | undefined;
    percent?: number | undefined;
}>, {
    message?: string | undefined;
    taskId?: (string & {
        readonly __brand: "TaskId";
    }) | undefined;
    progress?: string | undefined;
    percent?: number | undefined;
}, {
    message?: string | undefined;
    taskId?: string | undefined;
    progress?: string | undefined;
    percent?: number | undefined;
}>;
export declare const ReviewRequestedPayloadSchema: z.ZodObject<{
    taskId: z.ZodEffects<z.ZodEffects<z.ZodString, string, string>, string & {
        readonly __brand: "TaskId";
    }, string>;
    evidenceIds: z.ZodOptional<z.ZodArray<z.ZodEffects<z.ZodString, string, string>, "many">>;
}, "strip", z.ZodTypeAny, {
    taskId: string & {
        readonly __brand: "TaskId";
    };
    evidenceIds?: string[] | undefined;
}, {
    taskId: string;
    evidenceIds?: string[] | undefined;
}>;
export declare const ArtifactCreatedPayloadSchema: z.ZodUnion<[z.ZodObject<{
    artifactId: z.ZodEffects<z.ZodString, string, string>;
    taskId: z.ZodOptional<z.ZodEffects<z.ZodEffects<z.ZodString, string, string>, string & {
        readonly __brand: "TaskId";
    }, string>>;
}, "strip", z.ZodTypeAny, {
    artifactId: string;
    taskId?: (string & {
        readonly __brand: "TaskId";
    }) | undefined;
}, {
    artifactId: string;
    taskId?: string | undefined;
}>, z.ZodObject<{
    artifactReference: z.ZodEffects<z.ZodString, string, string>;
    taskId: z.ZodOptional<z.ZodEffects<z.ZodEffects<z.ZodString, string, string>, string & {
        readonly __brand: "TaskId";
    }, string>>;
}, "strip", z.ZodTypeAny, {
    artifactReference: string;
    taskId?: (string & {
        readonly __brand: "TaskId";
    }) | undefined;
}, {
    artifactReference: string;
    taskId?: string | undefined;
}>]>;
export declare const BlockedPayloadSchema: z.ZodObject<{
    reason: z.ZodEffects<z.ZodString, string, string>;
    taskId: z.ZodOptional<z.ZodEffects<z.ZodEffects<z.ZodString, string, string>, string & {
        readonly __brand: "TaskId";
    }, string>>;
}, "strip", z.ZodTypeAny, {
    reason: string;
    taskId?: (string & {
        readonly __brand: "TaskId";
    }) | undefined;
}, {
    reason: string;
    taskId?: string | undefined;
}>;
export declare const TaskFailedPayloadSchema: z.ZodObject<{
    failureFingerprint: z.ZodEffects<z.ZodString, string, string>;
    taskId: z.ZodOptional<z.ZodEffects<z.ZodEffects<z.ZodString, string, string>, string & {
        readonly __brand: "TaskId";
    }, string>>;
}, "strip", z.ZodTypeAny, {
    failureFingerprint: string;
    taskId?: (string & {
        readonly __brand: "TaskId";
    }) | undefined;
}, {
    failureFingerprint: string;
    taskId?: string | undefined;
}>;
export declare const RecoveryStartedPayloadSchema: z.ZodObject<{
    recoveryId: z.ZodEffects<z.ZodString, string, string>;
    taskId: z.ZodOptional<z.ZodEffects<z.ZodEffects<z.ZodString, string, string>, string & {
        readonly __brand: "TaskId";
    }, string>>;
}, "strip", z.ZodTypeAny, {
    recoveryId: string;
    taskId?: (string & {
        readonly __brand: "TaskId";
    }) | undefined;
}, {
    recoveryId: string;
    taskId?: string | undefined;
}>;
export declare const TaskCompletedPayloadSchema: z.ZodObject<{
    evidenceIds: z.ZodArray<z.ZodEffects<z.ZodString, string, string>, "many">;
    taskId: z.ZodOptional<z.ZodEffects<z.ZodEffects<z.ZodString, string, string>, string & {
        readonly __brand: "TaskId";
    }, string>>;
}, "strip", z.ZodTypeAny, {
    evidenceIds: string[];
    taskId?: (string & {
        readonly __brand: "TaskId";
    }) | undefined;
}, {
    evidenceIds: string[];
    taskId?: string | undefined;
}>;
export declare const DeploymentApprovalRequestedPayloadSchema: z.ZodObject<{
    approvalId: z.ZodEffects<z.ZodEffects<z.ZodString, string, string>, string & {
        readonly __brand: "ApprovalId";
    }, string>;
    taskId: z.ZodEffects<z.ZodEffects<z.ZodString, string, string>, string & {
        readonly __brand: "TaskId";
    }, string>;
}, "strip", z.ZodTypeAny, {
    taskId: string & {
        readonly __brand: "TaskId";
    };
    approvalId: string & {
        readonly __brand: "ApprovalId";
    };
}, {
    taskId: string;
    approvalId: string;
}>;
export declare const DeploymentApprovedPayloadSchema: z.ZodObject<{
    approvalId: z.ZodEffects<z.ZodEffects<z.ZodString, string, string>, string & {
        readonly __brand: "ApprovalId";
    }, string>;
    taskId: z.ZodEffects<z.ZodEffects<z.ZodString, string, string>, string & {
        readonly __brand: "TaskId";
    }, string>;
}, "strip", z.ZodTypeAny, {
    taskId: string & {
        readonly __brand: "TaskId";
    };
    approvalId: string & {
        readonly __brand: "ApprovalId";
    };
}, {
    taskId: string;
    approvalId: string;
}>;
export declare const DeploymentRejectedPayloadSchema: z.ZodObject<{
    approvalId: z.ZodEffects<z.ZodEffects<z.ZodString, string, string>, string & {
        readonly __brand: "ApprovalId";
    }, string>;
    taskId: z.ZodEffects<z.ZodEffects<z.ZodString, string, string>, string & {
        readonly __brand: "TaskId";
    }, string>;
    reason: z.ZodEffects<z.ZodString, string, string>;
}, "strip", z.ZodTypeAny, {
    taskId: string & {
        readonly __brand: "TaskId";
    };
    approvalId: string & {
        readonly __brand: "ApprovalId";
    };
    reason: string;
}, {
    taskId: string;
    approvalId: string;
    reason: string;
}>;
export declare const DeploymentResultRecordedPayloadSchema: z.ZodObject<{
    taskId: z.ZodEffects<z.ZodEffects<z.ZodString, string, string>, string & {
        readonly __brand: "TaskId";
    }, string>;
    approvalId: z.ZodEffects<z.ZodEffects<z.ZodString, string, string>, string & {
        readonly __brand: "ApprovalId";
    }, string>;
    attemptId: z.ZodEffects<z.ZodString, string, string>;
    evidenceIds: z.ZodArray<z.ZodEffects<z.ZodString, string, string>, "many">;
}, "strip", z.ZodTypeAny, {
    taskId: string & {
        readonly __brand: "TaskId";
    };
    approvalId: string & {
        readonly __brand: "ApprovalId";
    };
    evidenceIds: string[];
    attemptId: string;
}, {
    taskId: string;
    approvalId: string;
    evidenceIds: string[];
    attemptId: string;
}>;
export declare const ApprovalRequestedPayloadSchema: z.ZodObject<{
    approvalId: z.ZodEffects<z.ZodEffects<z.ZodString, string, string>, string & {
        readonly __brand: "ApprovalId";
    }, string>;
    subjectType: z.ZodEnum<["CAPABILITY", "DEPLOYMENT", "RECOVERY_ESCALATION"]>;
    subjectId: z.ZodEffects<z.ZodString, string, string>;
    reason: z.ZodEffects<z.ZodString, string, string>;
}, "strip", z.ZodTypeAny, {
    approvalId: string & {
        readonly __brand: "ApprovalId";
    };
    subjectType: "CAPABILITY" | "DEPLOYMENT" | "RECOVERY_ESCALATION";
    subjectId: string;
    reason: string;
}, {
    approvalId: string;
    subjectType: "CAPABILITY" | "DEPLOYMENT" | "RECOVERY_ESCALATION";
    subjectId: string;
    reason: string;
}>;
export declare const TaskEscalatedPayloadSchema: z.ZodObject<{
    reason: z.ZodEffects<z.ZodString, string, string>;
    taskId: z.ZodOptional<z.ZodEffects<z.ZodEffects<z.ZodString, string, string>, string & {
        readonly __brand: "TaskId";
    }, string>>;
}, "strip", z.ZodTypeAny, {
    reason: string;
    taskId?: (string & {
        readonly __brand: "TaskId";
    }) | undefined;
}, {
    reason: string;
    taskId?: string | undefined;
}>;
export declare const TaskCancelledPayloadSchema: z.ZodObject<{
    reason: z.ZodEffects<z.ZodString, string, string>;
    taskId: z.ZodOptional<z.ZodEffects<z.ZodEffects<z.ZodString, string, string>, string & {
        readonly __brand: "TaskId";
    }, string>>;
}, "strip", z.ZodTypeAny, {
    reason: string;
    taskId?: (string & {
        readonly __brand: "TaskId";
    }) | undefined;
}, {
    reason: string;
    taskId?: string | undefined;
}>;
export declare const AgentSessionCreatedPayloadSchema: z.ZodObject<{
    sessionId: z.ZodEffects<z.ZodEffects<z.ZodString, string, string>, string & {
        readonly __brand: "AgentSessionId";
    }, string>;
    taskId: z.ZodEffects<z.ZodEffects<z.ZodString, string, string>, string & {
        readonly __brand: "TaskId";
    }, string>;
    agentDefinitionId: z.ZodEffects<z.ZodEffects<z.ZodString, string, string>, string & {
        readonly __brand: "AgentDefinitionId";
    }, string>;
}, "strip", z.ZodTypeAny, {
    sessionId: string & {
        readonly __brand: "AgentSessionId";
    };
    taskId: string & {
        readonly __brand: "TaskId";
    };
    agentDefinitionId: string & {
        readonly __brand: "AgentDefinitionId";
    };
}, {
    sessionId: string;
    taskId: string;
    agentDefinitionId: string;
}>;
export declare const AgentSessionStartedPayloadSchema: z.ZodObject<{
    sessionId: z.ZodEffects<z.ZodEffects<z.ZodString, string, string>, string & {
        readonly __brand: "AgentSessionId";
    }, string>;
    taskId: z.ZodOptional<z.ZodEffects<z.ZodEffects<z.ZodString, string, string>, string & {
        readonly __brand: "TaskId";
    }, string>>;
}, "strip", z.ZodTypeAny, {
    sessionId: string & {
        readonly __brand: "AgentSessionId";
    };
    taskId?: (string & {
        readonly __brand: "TaskId";
    }) | undefined;
}, {
    sessionId: string;
    taskId?: string | undefined;
}>;
export declare const AgentSessionPausedPayloadSchema: z.ZodObject<{
    sessionId: z.ZodEffects<z.ZodEffects<z.ZodString, string, string>, string & {
        readonly __brand: "AgentSessionId";
    }, string>;
    reason: z.ZodEffects<z.ZodString, string, string>;
}, "strip", z.ZodTypeAny, {
    sessionId: string & {
        readonly __brand: "AgentSessionId";
    };
    reason: string;
}, {
    sessionId: string;
    reason: string;
}>;
export declare const AgentSessionResumedPayloadSchema: z.ZodObject<{
    sessionId: z.ZodEffects<z.ZodEffects<z.ZodString, string, string>, string & {
        readonly __brand: "AgentSessionId";
    }, string>;
}, "strip", z.ZodTypeAny, {
    sessionId: string & {
        readonly __brand: "AgentSessionId";
    };
}, {
    sessionId: string;
}>;
export declare const AgentSessionCompletedPayloadSchema: z.ZodObject<{
    sessionId: z.ZodEffects<z.ZodEffects<z.ZodString, string, string>, string & {
        readonly __brand: "AgentSessionId";
    }, string>;
}, "strip", z.ZodTypeAny, {
    sessionId: string & {
        readonly __brand: "AgentSessionId";
    };
}, {
    sessionId: string;
}>;
export declare const AgentSessionFailedPayloadSchema: z.ZodObject<{
    sessionId: z.ZodEffects<z.ZodEffects<z.ZodString, string, string>, string & {
        readonly __brand: "AgentSessionId";
    }, string>;
    failureFingerprint: z.ZodEffects<z.ZodString, string, string>;
}, "strip", z.ZodTypeAny, {
    sessionId: string & {
        readonly __brand: "AgentSessionId";
    };
    failureFingerprint: string;
}, {
    sessionId: string;
    failureFingerprint: string;
}>;
export declare const AgentSessionCancelledPayloadSchema: z.ZodObject<{
    sessionId: z.ZodEffects<z.ZodEffects<z.ZodString, string, string>, string & {
        readonly __brand: "AgentSessionId";
    }, string>;
    reason: z.ZodEffects<z.ZodString, string, string>;
}, "strip", z.ZodTypeAny, {
    sessionId: string & {
        readonly __brand: "AgentSessionId";
    };
    reason: string;
}, {
    sessionId: string;
    reason: string;
}>;
export declare const ApprovalApprovedPayloadSchema: z.ZodObject<{
    approvalId: z.ZodEffects<z.ZodEffects<z.ZodString, string, string>, string & {
        readonly __brand: "ApprovalId";
    }, string>;
    decisionReason: z.ZodOptional<z.ZodEffects<z.ZodString, string, string>>;
    decidedAt: z.ZodOptional<z.ZodDate>;
}, "strip", z.ZodTypeAny, {
    approvalId: string & {
        readonly __brand: "ApprovalId";
    };
    decisionReason?: string | undefined;
    decidedAt?: Date | undefined;
}, {
    approvalId: string;
    decisionReason?: string | undefined;
    decidedAt?: Date | undefined;
}>;
export declare const ApprovalRejectedPayloadSchema: z.ZodObject<{
    approvalId: z.ZodEffects<z.ZodEffects<z.ZodString, string, string>, string & {
        readonly __brand: "ApprovalId";
    }, string>;
    reason: z.ZodEffects<z.ZodString, string, string>;
    decisionReason: z.ZodOptional<z.ZodEffects<z.ZodString, string, string>>;
}, "strip", z.ZodTypeAny, {
    approvalId: string & {
        readonly __brand: "ApprovalId";
    };
    reason: string;
    decisionReason?: string | undefined;
}, {
    approvalId: string;
    reason: string;
    decisionReason?: string | undefined;
}>;
export declare const EventPayloadSchema: z.ZodUnion<[z.ZodObject<{
    taskId: z.ZodEffects<z.ZodEffects<z.ZodString, string, string>, string & {
        readonly __brand: "TaskId";
    }, string>;
    workflowId: z.ZodEffects<z.ZodEffects<z.ZodString, string, string>, string & {
        readonly __brand: "WorkflowId";
    }, string>;
}, "strip", z.ZodTypeAny, {
    workflowId: string & {
        readonly __brand: "WorkflowId";
    };
    taskId: string & {
        readonly __brand: "TaskId";
    };
}, {
    workflowId: string;
    taskId: string;
}>, z.ZodObject<{
    taskId: z.ZodEffects<z.ZodEffects<z.ZodString, string, string>, string & {
        readonly __brand: "TaskId";
    }, string>;
}, "strip", z.ZodTypeAny, {
    taskId: string & {
        readonly __brand: "TaskId";
    };
}, {
    taskId: string;
}>, z.ZodObject<{
    sessionId: z.ZodEffects<z.ZodEffects<z.ZodString, string, string>, string & {
        readonly __brand: "AgentSessionId";
    }, string>;
    taskId: z.ZodOptional<z.ZodEffects<z.ZodEffects<z.ZodString, string, string>, string & {
        readonly __brand: "TaskId";
    }, string>>;
}, "strip", z.ZodTypeAny, {
    sessionId: string & {
        readonly __brand: "AgentSessionId";
    };
    taskId?: (string & {
        readonly __brand: "TaskId";
    }) | undefined;
}, {
    sessionId: string;
    taskId?: string | undefined;
}>, z.ZodEffects<z.ZodObject<{
    taskId: z.ZodOptional<z.ZodEffects<z.ZodEffects<z.ZodString, string, string>, string & {
        readonly __brand: "TaskId";
    }, string>>;
    progress: z.ZodOptional<z.ZodEffects<z.ZodString, string, string>>;
    message: z.ZodOptional<z.ZodEffects<z.ZodString, string, string>>;
    percent: z.ZodOptional<z.ZodNumber>;
}, "strip", z.ZodTypeAny, {
    message?: string | undefined;
    taskId?: (string & {
        readonly __brand: "TaskId";
    }) | undefined;
    progress?: string | undefined;
    percent?: number | undefined;
}, {
    message?: string | undefined;
    taskId?: string | undefined;
    progress?: string | undefined;
    percent?: number | undefined;
}>, {
    message?: string | undefined;
    taskId?: (string & {
        readonly __brand: "TaskId";
    }) | undefined;
    progress?: string | undefined;
    percent?: number | undefined;
}, {
    message?: string | undefined;
    taskId?: string | undefined;
    progress?: string | undefined;
    percent?: number | undefined;
}>, z.ZodObject<{
    taskId: z.ZodEffects<z.ZodEffects<z.ZodString, string, string>, string & {
        readonly __brand: "TaskId";
    }, string>;
    evidenceIds: z.ZodOptional<z.ZodArray<z.ZodEffects<z.ZodString, string, string>, "many">>;
}, "strip", z.ZodTypeAny, {
    taskId: string & {
        readonly __brand: "TaskId";
    };
    evidenceIds?: string[] | undefined;
}, {
    taskId: string;
    evidenceIds?: string[] | undefined;
}>, z.ZodUnion<[z.ZodObject<{
    artifactId: z.ZodEffects<z.ZodString, string, string>;
    taskId: z.ZodOptional<z.ZodEffects<z.ZodEffects<z.ZodString, string, string>, string & {
        readonly __brand: "TaskId";
    }, string>>;
}, "strip", z.ZodTypeAny, {
    artifactId: string;
    taskId?: (string & {
        readonly __brand: "TaskId";
    }) | undefined;
}, {
    artifactId: string;
    taskId?: string | undefined;
}>, z.ZodObject<{
    artifactReference: z.ZodEffects<z.ZodString, string, string>;
    taskId: z.ZodOptional<z.ZodEffects<z.ZodEffects<z.ZodString, string, string>, string & {
        readonly __brand: "TaskId";
    }, string>>;
}, "strip", z.ZodTypeAny, {
    artifactReference: string;
    taskId?: (string & {
        readonly __brand: "TaskId";
    }) | undefined;
}, {
    artifactReference: string;
    taskId?: string | undefined;
}>]>, z.ZodObject<{
    reason: z.ZodEffects<z.ZodString, string, string>;
    taskId: z.ZodOptional<z.ZodEffects<z.ZodEffects<z.ZodString, string, string>, string & {
        readonly __brand: "TaskId";
    }, string>>;
}, "strip", z.ZodTypeAny, {
    reason: string;
    taskId?: (string & {
        readonly __brand: "TaskId";
    }) | undefined;
}, {
    reason: string;
    taskId?: string | undefined;
}>, z.ZodObject<{
    failureFingerprint: z.ZodEffects<z.ZodString, string, string>;
    taskId: z.ZodOptional<z.ZodEffects<z.ZodEffects<z.ZodString, string, string>, string & {
        readonly __brand: "TaskId";
    }, string>>;
}, "strip", z.ZodTypeAny, {
    failureFingerprint: string;
    taskId?: (string & {
        readonly __brand: "TaskId";
    }) | undefined;
}, {
    failureFingerprint: string;
    taskId?: string | undefined;
}>, z.ZodObject<{
    recoveryId: z.ZodEffects<z.ZodString, string, string>;
    taskId: z.ZodOptional<z.ZodEffects<z.ZodEffects<z.ZodString, string, string>, string & {
        readonly __brand: "TaskId";
    }, string>>;
}, "strip", z.ZodTypeAny, {
    recoveryId: string;
    taskId?: (string & {
        readonly __brand: "TaskId";
    }) | undefined;
}, {
    recoveryId: string;
    taskId?: string | undefined;
}>, z.ZodObject<{
    evidenceIds: z.ZodArray<z.ZodEffects<z.ZodString, string, string>, "many">;
    taskId: z.ZodOptional<z.ZodEffects<z.ZodEffects<z.ZodString, string, string>, string & {
        readonly __brand: "TaskId";
    }, string>>;
}, "strip", z.ZodTypeAny, {
    evidenceIds: string[];
    taskId?: (string & {
        readonly __brand: "TaskId";
    }) | undefined;
}, {
    evidenceIds: string[];
    taskId?: string | undefined;
}>, z.ZodObject<{
    approvalId: z.ZodEffects<z.ZodEffects<z.ZodString, string, string>, string & {
        readonly __brand: "ApprovalId";
    }, string>;
    taskId: z.ZodEffects<z.ZodEffects<z.ZodString, string, string>, string & {
        readonly __brand: "TaskId";
    }, string>;
}, "strip", z.ZodTypeAny, {
    taskId: string & {
        readonly __brand: "TaskId";
    };
    approvalId: string & {
        readonly __brand: "ApprovalId";
    };
}, {
    taskId: string;
    approvalId: string;
}>, z.ZodObject<{
    approvalId: z.ZodEffects<z.ZodEffects<z.ZodString, string, string>, string & {
        readonly __brand: "ApprovalId";
    }, string>;
    taskId: z.ZodEffects<z.ZodEffects<z.ZodString, string, string>, string & {
        readonly __brand: "TaskId";
    }, string>;
}, "strip", z.ZodTypeAny, {
    taskId: string & {
        readonly __brand: "TaskId";
    };
    approvalId: string & {
        readonly __brand: "ApprovalId";
    };
}, {
    taskId: string;
    approvalId: string;
}>, z.ZodObject<{
    approvalId: z.ZodEffects<z.ZodEffects<z.ZodString, string, string>, string & {
        readonly __brand: "ApprovalId";
    }, string>;
    taskId: z.ZodEffects<z.ZodEffects<z.ZodString, string, string>, string & {
        readonly __brand: "TaskId";
    }, string>;
    reason: z.ZodEffects<z.ZodString, string, string>;
}, "strip", z.ZodTypeAny, {
    taskId: string & {
        readonly __brand: "TaskId";
    };
    approvalId: string & {
        readonly __brand: "ApprovalId";
    };
    reason: string;
}, {
    taskId: string;
    approvalId: string;
    reason: string;
}>, z.ZodObject<{
    taskId: z.ZodEffects<z.ZodEffects<z.ZodString, string, string>, string & {
        readonly __brand: "TaskId";
    }, string>;
    approvalId: z.ZodEffects<z.ZodEffects<z.ZodString, string, string>, string & {
        readonly __brand: "ApprovalId";
    }, string>;
    attemptId: z.ZodEffects<z.ZodString, string, string>;
    evidenceIds: z.ZodArray<z.ZodEffects<z.ZodString, string, string>, "many">;
}, "strip", z.ZodTypeAny, {
    taskId: string & {
        readonly __brand: "TaskId";
    };
    approvalId: string & {
        readonly __brand: "ApprovalId";
    };
    evidenceIds: string[];
    attemptId: string;
}, {
    taskId: string;
    approvalId: string;
    evidenceIds: string[];
    attemptId: string;
}>, z.ZodObject<{
    approvalId: z.ZodEffects<z.ZodEffects<z.ZodString, string, string>, string & {
        readonly __brand: "ApprovalId";
    }, string>;
    subjectType: z.ZodEnum<["CAPABILITY", "DEPLOYMENT", "RECOVERY_ESCALATION"]>;
    subjectId: z.ZodEffects<z.ZodString, string, string>;
    reason: z.ZodEffects<z.ZodString, string, string>;
}, "strip", z.ZodTypeAny, {
    approvalId: string & {
        readonly __brand: "ApprovalId";
    };
    subjectType: "CAPABILITY" | "DEPLOYMENT" | "RECOVERY_ESCALATION";
    subjectId: string;
    reason: string;
}, {
    approvalId: string;
    subjectType: "CAPABILITY" | "DEPLOYMENT" | "RECOVERY_ESCALATION";
    subjectId: string;
    reason: string;
}>, z.ZodObject<{
    reason: z.ZodEffects<z.ZodString, string, string>;
    taskId: z.ZodOptional<z.ZodEffects<z.ZodEffects<z.ZodString, string, string>, string & {
        readonly __brand: "TaskId";
    }, string>>;
}, "strip", z.ZodTypeAny, {
    reason: string;
    taskId?: (string & {
        readonly __brand: "TaskId";
    }) | undefined;
}, {
    reason: string;
    taskId?: string | undefined;
}>, z.ZodObject<{
    reason: z.ZodEffects<z.ZodString, string, string>;
    taskId: z.ZodOptional<z.ZodEffects<z.ZodEffects<z.ZodString, string, string>, string & {
        readonly __brand: "TaskId";
    }, string>>;
}, "strip", z.ZodTypeAny, {
    reason: string;
    taskId?: (string & {
        readonly __brand: "TaskId";
    }) | undefined;
}, {
    reason: string;
    taskId?: string | undefined;
}>, z.ZodObject<{
    sessionId: z.ZodEffects<z.ZodEffects<z.ZodString, string, string>, string & {
        readonly __brand: "AgentSessionId";
    }, string>;
    taskId: z.ZodEffects<z.ZodEffects<z.ZodString, string, string>, string & {
        readonly __brand: "TaskId";
    }, string>;
    agentDefinitionId: z.ZodEffects<z.ZodEffects<z.ZodString, string, string>, string & {
        readonly __brand: "AgentDefinitionId";
    }, string>;
}, "strip", z.ZodTypeAny, {
    sessionId: string & {
        readonly __brand: "AgentSessionId";
    };
    taskId: string & {
        readonly __brand: "TaskId";
    };
    agentDefinitionId: string & {
        readonly __brand: "AgentDefinitionId";
    };
}, {
    sessionId: string;
    taskId: string;
    agentDefinitionId: string;
}>, z.ZodObject<{
    sessionId: z.ZodEffects<z.ZodEffects<z.ZodString, string, string>, string & {
        readonly __brand: "AgentSessionId";
    }, string>;
    taskId: z.ZodOptional<z.ZodEffects<z.ZodEffects<z.ZodString, string, string>, string & {
        readonly __brand: "TaskId";
    }, string>>;
}, "strip", z.ZodTypeAny, {
    sessionId: string & {
        readonly __brand: "AgentSessionId";
    };
    taskId?: (string & {
        readonly __brand: "TaskId";
    }) | undefined;
}, {
    sessionId: string;
    taskId?: string | undefined;
}>, z.ZodObject<{
    sessionId: z.ZodEffects<z.ZodEffects<z.ZodString, string, string>, string & {
        readonly __brand: "AgentSessionId";
    }, string>;
    reason: z.ZodEffects<z.ZodString, string, string>;
}, "strip", z.ZodTypeAny, {
    sessionId: string & {
        readonly __brand: "AgentSessionId";
    };
    reason: string;
}, {
    sessionId: string;
    reason: string;
}>, z.ZodObject<{
    sessionId: z.ZodEffects<z.ZodEffects<z.ZodString, string, string>, string & {
        readonly __brand: "AgentSessionId";
    }, string>;
}, "strip", z.ZodTypeAny, {
    sessionId: string & {
        readonly __brand: "AgentSessionId";
    };
}, {
    sessionId: string;
}>, z.ZodObject<{
    sessionId: z.ZodEffects<z.ZodEffects<z.ZodString, string, string>, string & {
        readonly __brand: "AgentSessionId";
    }, string>;
}, "strip", z.ZodTypeAny, {
    sessionId: string & {
        readonly __brand: "AgentSessionId";
    };
}, {
    sessionId: string;
}>, z.ZodObject<{
    sessionId: z.ZodEffects<z.ZodEffects<z.ZodString, string, string>, string & {
        readonly __brand: "AgentSessionId";
    }, string>;
    failureFingerprint: z.ZodEffects<z.ZodString, string, string>;
}, "strip", z.ZodTypeAny, {
    sessionId: string & {
        readonly __brand: "AgentSessionId";
    };
    failureFingerprint: string;
}, {
    sessionId: string;
    failureFingerprint: string;
}>, z.ZodObject<{
    sessionId: z.ZodEffects<z.ZodEffects<z.ZodString, string, string>, string & {
        readonly __brand: "AgentSessionId";
    }, string>;
    reason: z.ZodEffects<z.ZodString, string, string>;
}, "strip", z.ZodTypeAny, {
    sessionId: string & {
        readonly __brand: "AgentSessionId";
    };
    reason: string;
}, {
    sessionId: string;
    reason: string;
}>, z.ZodObject<{
    approvalId: z.ZodEffects<z.ZodEffects<z.ZodString, string, string>, string & {
        readonly __brand: "ApprovalId";
    }, string>;
    decisionReason: z.ZodOptional<z.ZodEffects<z.ZodString, string, string>>;
    decidedAt: z.ZodOptional<z.ZodDate>;
}, "strip", z.ZodTypeAny, {
    approvalId: string & {
        readonly __brand: "ApprovalId";
    };
    decisionReason?: string | undefined;
    decidedAt?: Date | undefined;
}, {
    approvalId: string;
    decisionReason?: string | undefined;
    decidedAt?: Date | undefined;
}>, z.ZodObject<{
    approvalId: z.ZodEffects<z.ZodEffects<z.ZodString, string, string>, string & {
        readonly __brand: "ApprovalId";
    }, string>;
    reason: z.ZodEffects<z.ZodString, string, string>;
    decisionReason: z.ZodOptional<z.ZodEffects<z.ZodString, string, string>>;
}, "strip", z.ZodTypeAny, {
    approvalId: string & {
        readonly __brand: "ApprovalId";
    };
    reason: string;
    decisionReason?: string | undefined;
}, {
    approvalId: string;
    reason: string;
    decisionReason?: string | undefined;
}>]>;
export type EventPayload = z.infer<typeof EventPayloadSchema>;
export declare const DomainEventSchema: z.ZodDiscriminatedUnion<"eventType", [z.ZodObject<{
    eventType: z.ZodLiteral<"TASK_CREATED">;
    payload: z.ZodObject<{
        taskId: z.ZodEffects<z.ZodEffects<z.ZodString, string, string>, string & {
            readonly __brand: "TaskId";
        }, string>;
        workflowId: z.ZodEffects<z.ZodEffects<z.ZodString, string, string>, string & {
            readonly __brand: "WorkflowId";
        }, string>;
    }, "strip", z.ZodTypeAny, {
        workflowId: string & {
            readonly __brand: "WorkflowId";
        };
        taskId: string & {
            readonly __brand: "TaskId";
        };
    }, {
        workflowId: string;
        taskId: string;
    }>;
    eventId: z.ZodEffects<z.ZodEffects<z.ZodString, string, string>, string & {
        readonly __brand: "EventId";
    }, string>;
    aggregateType: z.ZodEffects<z.ZodString, string, string>;
    aggregateId: z.ZodEffects<z.ZodString, string, string>;
    aggregateVersion: z.ZodNumber;
    actor: z.ZodUnion<[z.ZodObject<{
        kind: z.ZodLiteral<"CEO">;
    }, "strip", z.ZodTypeAny, {
        kind: "CEO";
    }, {
        kind: "CEO";
    }>, z.ZodObject<{
        kind: z.ZodLiteral<"AGENT">;
        sessionId: z.ZodEffects<z.ZodEffects<z.ZodString, string, string>, string & {
            readonly __brand: "AgentSessionId";
        }, string>;
    }, "strip", z.ZodTypeAny, {
        kind: "AGENT";
        sessionId: string & {
            readonly __brand: "AgentSessionId";
        };
    }, {
        kind: "AGENT";
        sessionId: string;
    }>, z.ZodObject<{
        kind: z.ZodLiteral<"SYSTEM">;
        name: z.ZodEffects<z.ZodString, string, string>;
    }, "strip", z.ZodTypeAny, {
        kind: "SYSTEM";
        name: string;
    }, {
        kind: "SYSTEM";
        name: string;
    }>]>;
    correlationId: z.ZodEffects<z.ZodEffects<z.ZodString, string, string>, string & {
        readonly __brand: "CorrelationId";
    }, string>;
    causationId: z.ZodEffects<z.ZodEffects<z.ZodString, string, string>, string & {
        readonly __brand: "EventId";
    }, string>;
    occurredAt: z.ZodDate;
}, "strip", z.ZodTypeAny, {
    correlationId: string & {
        readonly __brand: "CorrelationId";
    };
    causationId: string & {
        readonly __brand: "EventId";
    };
    eventType: "TASK_CREATED";
    payload: {
        workflowId: string & {
            readonly __brand: "WorkflowId";
        };
        taskId: string & {
            readonly __brand: "TaskId";
        };
    };
    eventId: string & {
        readonly __brand: "EventId";
    };
    aggregateType: string;
    aggregateId: string;
    aggregateVersion: number;
    actor: {
        kind: "CEO";
    } | {
        kind: "AGENT";
        sessionId: string & {
            readonly __brand: "AgentSessionId";
        };
    } | {
        kind: "SYSTEM";
        name: string;
    };
    occurredAt: Date;
}, {
    correlationId: string;
    causationId: string;
    eventType: "TASK_CREATED";
    payload: {
        workflowId: string;
        taskId: string;
    };
    eventId: string;
    aggregateType: string;
    aggregateId: string;
    aggregateVersion: number;
    actor: {
        kind: "CEO";
    } | {
        kind: "AGENT";
        sessionId: string;
    } | {
        kind: "SYSTEM";
        name: string;
    };
    occurredAt: Date;
}>, z.ZodObject<{
    eventType: z.ZodLiteral<"TASK_READY">;
    payload: z.ZodObject<{
        taskId: z.ZodEffects<z.ZodEffects<z.ZodString, string, string>, string & {
            readonly __brand: "TaskId";
        }, string>;
    }, "strip", z.ZodTypeAny, {
        taskId: string & {
            readonly __brand: "TaskId";
        };
    }, {
        taskId: string;
    }>;
    eventId: z.ZodEffects<z.ZodEffects<z.ZodString, string, string>, string & {
        readonly __brand: "EventId";
    }, string>;
    aggregateType: z.ZodEffects<z.ZodString, string, string>;
    aggregateId: z.ZodEffects<z.ZodString, string, string>;
    aggregateVersion: z.ZodNumber;
    actor: z.ZodUnion<[z.ZodObject<{
        kind: z.ZodLiteral<"CEO">;
    }, "strip", z.ZodTypeAny, {
        kind: "CEO";
    }, {
        kind: "CEO";
    }>, z.ZodObject<{
        kind: z.ZodLiteral<"AGENT">;
        sessionId: z.ZodEffects<z.ZodEffects<z.ZodString, string, string>, string & {
            readonly __brand: "AgentSessionId";
        }, string>;
    }, "strip", z.ZodTypeAny, {
        kind: "AGENT";
        sessionId: string & {
            readonly __brand: "AgentSessionId";
        };
    }, {
        kind: "AGENT";
        sessionId: string;
    }>, z.ZodObject<{
        kind: z.ZodLiteral<"SYSTEM">;
        name: z.ZodEffects<z.ZodString, string, string>;
    }, "strip", z.ZodTypeAny, {
        kind: "SYSTEM";
        name: string;
    }, {
        kind: "SYSTEM";
        name: string;
    }>]>;
    correlationId: z.ZodEffects<z.ZodEffects<z.ZodString, string, string>, string & {
        readonly __brand: "CorrelationId";
    }, string>;
    causationId: z.ZodEffects<z.ZodEffects<z.ZodString, string, string>, string & {
        readonly __brand: "EventId";
    }, string>;
    occurredAt: z.ZodDate;
}, "strip", z.ZodTypeAny, {
    correlationId: string & {
        readonly __brand: "CorrelationId";
    };
    causationId: string & {
        readonly __brand: "EventId";
    };
    eventType: "TASK_READY";
    payload: {
        taskId: string & {
            readonly __brand: "TaskId";
        };
    };
    eventId: string & {
        readonly __brand: "EventId";
    };
    aggregateType: string;
    aggregateId: string;
    aggregateVersion: number;
    actor: {
        kind: "CEO";
    } | {
        kind: "AGENT";
        sessionId: string & {
            readonly __brand: "AgentSessionId";
        };
    } | {
        kind: "SYSTEM";
        name: string;
    };
    occurredAt: Date;
}, {
    correlationId: string;
    causationId: string;
    eventType: "TASK_READY";
    payload: {
        taskId: string;
    };
    eventId: string;
    aggregateType: string;
    aggregateId: string;
    aggregateVersion: number;
    actor: {
        kind: "CEO";
    } | {
        kind: "AGENT";
        sessionId: string;
    } | {
        kind: "SYSTEM";
        name: string;
    };
    occurredAt: Date;
}>, z.ZodObject<{
    eventType: z.ZodLiteral<"TASK_STARTED">;
    payload: z.ZodObject<{
        sessionId: z.ZodEffects<z.ZodEffects<z.ZodString, string, string>, string & {
            readonly __brand: "AgentSessionId";
        }, string>;
        taskId: z.ZodOptional<z.ZodEffects<z.ZodEffects<z.ZodString, string, string>, string & {
            readonly __brand: "TaskId";
        }, string>>;
    }, "strip", z.ZodTypeAny, {
        sessionId: string & {
            readonly __brand: "AgentSessionId";
        };
        taskId?: (string & {
            readonly __brand: "TaskId";
        }) | undefined;
    }, {
        sessionId: string;
        taskId?: string | undefined;
    }>;
    eventId: z.ZodEffects<z.ZodEffects<z.ZodString, string, string>, string & {
        readonly __brand: "EventId";
    }, string>;
    aggregateType: z.ZodEffects<z.ZodString, string, string>;
    aggregateId: z.ZodEffects<z.ZodString, string, string>;
    aggregateVersion: z.ZodNumber;
    actor: z.ZodUnion<[z.ZodObject<{
        kind: z.ZodLiteral<"CEO">;
    }, "strip", z.ZodTypeAny, {
        kind: "CEO";
    }, {
        kind: "CEO";
    }>, z.ZodObject<{
        kind: z.ZodLiteral<"AGENT">;
        sessionId: z.ZodEffects<z.ZodEffects<z.ZodString, string, string>, string & {
            readonly __brand: "AgentSessionId";
        }, string>;
    }, "strip", z.ZodTypeAny, {
        kind: "AGENT";
        sessionId: string & {
            readonly __brand: "AgentSessionId";
        };
    }, {
        kind: "AGENT";
        sessionId: string;
    }>, z.ZodObject<{
        kind: z.ZodLiteral<"SYSTEM">;
        name: z.ZodEffects<z.ZodString, string, string>;
    }, "strip", z.ZodTypeAny, {
        kind: "SYSTEM";
        name: string;
    }, {
        kind: "SYSTEM";
        name: string;
    }>]>;
    correlationId: z.ZodEffects<z.ZodEffects<z.ZodString, string, string>, string & {
        readonly __brand: "CorrelationId";
    }, string>;
    causationId: z.ZodEffects<z.ZodEffects<z.ZodString, string, string>, string & {
        readonly __brand: "EventId";
    }, string>;
    occurredAt: z.ZodDate;
}, "strip", z.ZodTypeAny, {
    correlationId: string & {
        readonly __brand: "CorrelationId";
    };
    causationId: string & {
        readonly __brand: "EventId";
    };
    eventType: "TASK_STARTED";
    payload: {
        sessionId: string & {
            readonly __brand: "AgentSessionId";
        };
        taskId?: (string & {
            readonly __brand: "TaskId";
        }) | undefined;
    };
    eventId: string & {
        readonly __brand: "EventId";
    };
    aggregateType: string;
    aggregateId: string;
    aggregateVersion: number;
    actor: {
        kind: "CEO";
    } | {
        kind: "AGENT";
        sessionId: string & {
            readonly __brand: "AgentSessionId";
        };
    } | {
        kind: "SYSTEM";
        name: string;
    };
    occurredAt: Date;
}, {
    correlationId: string;
    causationId: string;
    eventType: "TASK_STARTED";
    payload: {
        sessionId: string;
        taskId?: string | undefined;
    };
    eventId: string;
    aggregateType: string;
    aggregateId: string;
    aggregateVersion: number;
    actor: {
        kind: "CEO";
    } | {
        kind: "AGENT";
        sessionId: string;
    } | {
        kind: "SYSTEM";
        name: string;
    };
    occurredAt: Date;
}>, z.ZodObject<{
    eventType: z.ZodLiteral<"TASK_PROGRESS">;
    payload: z.ZodEffects<z.ZodObject<{
        taskId: z.ZodOptional<z.ZodEffects<z.ZodEffects<z.ZodString, string, string>, string & {
            readonly __brand: "TaskId";
        }, string>>;
        progress: z.ZodOptional<z.ZodEffects<z.ZodString, string, string>>;
        message: z.ZodOptional<z.ZodEffects<z.ZodString, string, string>>;
        percent: z.ZodOptional<z.ZodNumber>;
    }, "strip", z.ZodTypeAny, {
        message?: string | undefined;
        taskId?: (string & {
            readonly __brand: "TaskId";
        }) | undefined;
        progress?: string | undefined;
        percent?: number | undefined;
    }, {
        message?: string | undefined;
        taskId?: string | undefined;
        progress?: string | undefined;
        percent?: number | undefined;
    }>, {
        message?: string | undefined;
        taskId?: (string & {
            readonly __brand: "TaskId";
        }) | undefined;
        progress?: string | undefined;
        percent?: number | undefined;
    }, {
        message?: string | undefined;
        taskId?: string | undefined;
        progress?: string | undefined;
        percent?: number | undefined;
    }>;
    eventId: z.ZodEffects<z.ZodEffects<z.ZodString, string, string>, string & {
        readonly __brand: "EventId";
    }, string>;
    aggregateType: z.ZodEffects<z.ZodString, string, string>;
    aggregateId: z.ZodEffects<z.ZodString, string, string>;
    aggregateVersion: z.ZodNumber;
    actor: z.ZodUnion<[z.ZodObject<{
        kind: z.ZodLiteral<"CEO">;
    }, "strip", z.ZodTypeAny, {
        kind: "CEO";
    }, {
        kind: "CEO";
    }>, z.ZodObject<{
        kind: z.ZodLiteral<"AGENT">;
        sessionId: z.ZodEffects<z.ZodEffects<z.ZodString, string, string>, string & {
            readonly __brand: "AgentSessionId";
        }, string>;
    }, "strip", z.ZodTypeAny, {
        kind: "AGENT";
        sessionId: string & {
            readonly __brand: "AgentSessionId";
        };
    }, {
        kind: "AGENT";
        sessionId: string;
    }>, z.ZodObject<{
        kind: z.ZodLiteral<"SYSTEM">;
        name: z.ZodEffects<z.ZodString, string, string>;
    }, "strip", z.ZodTypeAny, {
        kind: "SYSTEM";
        name: string;
    }, {
        kind: "SYSTEM";
        name: string;
    }>]>;
    correlationId: z.ZodEffects<z.ZodEffects<z.ZodString, string, string>, string & {
        readonly __brand: "CorrelationId";
    }, string>;
    causationId: z.ZodEffects<z.ZodEffects<z.ZodString, string, string>, string & {
        readonly __brand: "EventId";
    }, string>;
    occurredAt: z.ZodDate;
}, "strip", z.ZodTypeAny, {
    correlationId: string & {
        readonly __brand: "CorrelationId";
    };
    causationId: string & {
        readonly __brand: "EventId";
    };
    eventType: "TASK_PROGRESS";
    payload: {
        message?: string | undefined;
        taskId?: (string & {
            readonly __brand: "TaskId";
        }) | undefined;
        progress?: string | undefined;
        percent?: number | undefined;
    };
    eventId: string & {
        readonly __brand: "EventId";
    };
    aggregateType: string;
    aggregateId: string;
    aggregateVersion: number;
    actor: {
        kind: "CEO";
    } | {
        kind: "AGENT";
        sessionId: string & {
            readonly __brand: "AgentSessionId";
        };
    } | {
        kind: "SYSTEM";
        name: string;
    };
    occurredAt: Date;
}, {
    correlationId: string;
    causationId: string;
    eventType: "TASK_PROGRESS";
    payload: {
        message?: string | undefined;
        taskId?: string | undefined;
        progress?: string | undefined;
        percent?: number | undefined;
    };
    eventId: string;
    aggregateType: string;
    aggregateId: string;
    aggregateVersion: number;
    actor: {
        kind: "CEO";
    } | {
        kind: "AGENT";
        sessionId: string;
    } | {
        kind: "SYSTEM";
        name: string;
    };
    occurredAt: Date;
}>, z.ZodObject<{
    eventType: z.ZodLiteral<"REVIEW_REQUESTED">;
    payload: z.ZodObject<{
        taskId: z.ZodEffects<z.ZodEffects<z.ZodString, string, string>, string & {
            readonly __brand: "TaskId";
        }, string>;
        evidenceIds: z.ZodOptional<z.ZodArray<z.ZodEffects<z.ZodString, string, string>, "many">>;
    }, "strip", z.ZodTypeAny, {
        taskId: string & {
            readonly __brand: "TaskId";
        };
        evidenceIds?: string[] | undefined;
    }, {
        taskId: string;
        evidenceIds?: string[] | undefined;
    }>;
    eventId: z.ZodEffects<z.ZodEffects<z.ZodString, string, string>, string & {
        readonly __brand: "EventId";
    }, string>;
    aggregateType: z.ZodEffects<z.ZodString, string, string>;
    aggregateId: z.ZodEffects<z.ZodString, string, string>;
    aggregateVersion: z.ZodNumber;
    actor: z.ZodUnion<[z.ZodObject<{
        kind: z.ZodLiteral<"CEO">;
    }, "strip", z.ZodTypeAny, {
        kind: "CEO";
    }, {
        kind: "CEO";
    }>, z.ZodObject<{
        kind: z.ZodLiteral<"AGENT">;
        sessionId: z.ZodEffects<z.ZodEffects<z.ZodString, string, string>, string & {
            readonly __brand: "AgentSessionId";
        }, string>;
    }, "strip", z.ZodTypeAny, {
        kind: "AGENT";
        sessionId: string & {
            readonly __brand: "AgentSessionId";
        };
    }, {
        kind: "AGENT";
        sessionId: string;
    }>, z.ZodObject<{
        kind: z.ZodLiteral<"SYSTEM">;
        name: z.ZodEffects<z.ZodString, string, string>;
    }, "strip", z.ZodTypeAny, {
        kind: "SYSTEM";
        name: string;
    }, {
        kind: "SYSTEM";
        name: string;
    }>]>;
    correlationId: z.ZodEffects<z.ZodEffects<z.ZodString, string, string>, string & {
        readonly __brand: "CorrelationId";
    }, string>;
    causationId: z.ZodEffects<z.ZodEffects<z.ZodString, string, string>, string & {
        readonly __brand: "EventId";
    }, string>;
    occurredAt: z.ZodDate;
}, "strip", z.ZodTypeAny, {
    correlationId: string & {
        readonly __brand: "CorrelationId";
    };
    causationId: string & {
        readonly __brand: "EventId";
    };
    eventType: "REVIEW_REQUESTED";
    payload: {
        taskId: string & {
            readonly __brand: "TaskId";
        };
        evidenceIds?: string[] | undefined;
    };
    eventId: string & {
        readonly __brand: "EventId";
    };
    aggregateType: string;
    aggregateId: string;
    aggregateVersion: number;
    actor: {
        kind: "CEO";
    } | {
        kind: "AGENT";
        sessionId: string & {
            readonly __brand: "AgentSessionId";
        };
    } | {
        kind: "SYSTEM";
        name: string;
    };
    occurredAt: Date;
}, {
    correlationId: string;
    causationId: string;
    eventType: "REVIEW_REQUESTED";
    payload: {
        taskId: string;
        evidenceIds?: string[] | undefined;
    };
    eventId: string;
    aggregateType: string;
    aggregateId: string;
    aggregateVersion: number;
    actor: {
        kind: "CEO";
    } | {
        kind: "AGENT";
        sessionId: string;
    } | {
        kind: "SYSTEM";
        name: string;
    };
    occurredAt: Date;
}>, z.ZodObject<{
    eventType: z.ZodLiteral<"ARTIFACT_CREATED">;
    payload: z.ZodUnion<[z.ZodObject<{
        artifactId: z.ZodEffects<z.ZodString, string, string>;
        taskId: z.ZodOptional<z.ZodEffects<z.ZodEffects<z.ZodString, string, string>, string & {
            readonly __brand: "TaskId";
        }, string>>;
    }, "strip", z.ZodTypeAny, {
        artifactId: string;
        taskId?: (string & {
            readonly __brand: "TaskId";
        }) | undefined;
    }, {
        artifactId: string;
        taskId?: string | undefined;
    }>, z.ZodObject<{
        artifactReference: z.ZodEffects<z.ZodString, string, string>;
        taskId: z.ZodOptional<z.ZodEffects<z.ZodEffects<z.ZodString, string, string>, string & {
            readonly __brand: "TaskId";
        }, string>>;
    }, "strip", z.ZodTypeAny, {
        artifactReference: string;
        taskId?: (string & {
            readonly __brand: "TaskId";
        }) | undefined;
    }, {
        artifactReference: string;
        taskId?: string | undefined;
    }>]>;
    eventId: z.ZodEffects<z.ZodEffects<z.ZodString, string, string>, string & {
        readonly __brand: "EventId";
    }, string>;
    aggregateType: z.ZodEffects<z.ZodString, string, string>;
    aggregateId: z.ZodEffects<z.ZodString, string, string>;
    aggregateVersion: z.ZodNumber;
    actor: z.ZodUnion<[z.ZodObject<{
        kind: z.ZodLiteral<"CEO">;
    }, "strip", z.ZodTypeAny, {
        kind: "CEO";
    }, {
        kind: "CEO";
    }>, z.ZodObject<{
        kind: z.ZodLiteral<"AGENT">;
        sessionId: z.ZodEffects<z.ZodEffects<z.ZodString, string, string>, string & {
            readonly __brand: "AgentSessionId";
        }, string>;
    }, "strip", z.ZodTypeAny, {
        kind: "AGENT";
        sessionId: string & {
            readonly __brand: "AgentSessionId";
        };
    }, {
        kind: "AGENT";
        sessionId: string;
    }>, z.ZodObject<{
        kind: z.ZodLiteral<"SYSTEM">;
        name: z.ZodEffects<z.ZodString, string, string>;
    }, "strip", z.ZodTypeAny, {
        kind: "SYSTEM";
        name: string;
    }, {
        kind: "SYSTEM";
        name: string;
    }>]>;
    correlationId: z.ZodEffects<z.ZodEffects<z.ZodString, string, string>, string & {
        readonly __brand: "CorrelationId";
    }, string>;
    causationId: z.ZodEffects<z.ZodEffects<z.ZodString, string, string>, string & {
        readonly __brand: "EventId";
    }, string>;
    occurredAt: z.ZodDate;
}, "strip", z.ZodTypeAny, {
    correlationId: string & {
        readonly __brand: "CorrelationId";
    };
    causationId: string & {
        readonly __brand: "EventId";
    };
    eventType: "ARTIFACT_CREATED";
    payload: {
        artifactId: string;
        taskId?: (string & {
            readonly __brand: "TaskId";
        }) | undefined;
    } | {
        artifactReference: string;
        taskId?: (string & {
            readonly __brand: "TaskId";
        }) | undefined;
    };
    eventId: string & {
        readonly __brand: "EventId";
    };
    aggregateType: string;
    aggregateId: string;
    aggregateVersion: number;
    actor: {
        kind: "CEO";
    } | {
        kind: "AGENT";
        sessionId: string & {
            readonly __brand: "AgentSessionId";
        };
    } | {
        kind: "SYSTEM";
        name: string;
    };
    occurredAt: Date;
}, {
    correlationId: string;
    causationId: string;
    eventType: "ARTIFACT_CREATED";
    payload: {
        artifactId: string;
        taskId?: string | undefined;
    } | {
        artifactReference: string;
        taskId?: string | undefined;
    };
    eventId: string;
    aggregateType: string;
    aggregateId: string;
    aggregateVersion: number;
    actor: {
        kind: "CEO";
    } | {
        kind: "AGENT";
        sessionId: string;
    } | {
        kind: "SYSTEM";
        name: string;
    };
    occurredAt: Date;
}>, z.ZodObject<{
    eventType: z.ZodLiteral<"BLOCKED">;
    payload: z.ZodObject<{
        reason: z.ZodEffects<z.ZodString, string, string>;
        taskId: z.ZodOptional<z.ZodEffects<z.ZodEffects<z.ZodString, string, string>, string & {
            readonly __brand: "TaskId";
        }, string>>;
    }, "strip", z.ZodTypeAny, {
        reason: string;
        taskId?: (string & {
            readonly __brand: "TaskId";
        }) | undefined;
    }, {
        reason: string;
        taskId?: string | undefined;
    }>;
    eventId: z.ZodEffects<z.ZodEffects<z.ZodString, string, string>, string & {
        readonly __brand: "EventId";
    }, string>;
    aggregateType: z.ZodEffects<z.ZodString, string, string>;
    aggregateId: z.ZodEffects<z.ZodString, string, string>;
    aggregateVersion: z.ZodNumber;
    actor: z.ZodUnion<[z.ZodObject<{
        kind: z.ZodLiteral<"CEO">;
    }, "strip", z.ZodTypeAny, {
        kind: "CEO";
    }, {
        kind: "CEO";
    }>, z.ZodObject<{
        kind: z.ZodLiteral<"AGENT">;
        sessionId: z.ZodEffects<z.ZodEffects<z.ZodString, string, string>, string & {
            readonly __brand: "AgentSessionId";
        }, string>;
    }, "strip", z.ZodTypeAny, {
        kind: "AGENT";
        sessionId: string & {
            readonly __brand: "AgentSessionId";
        };
    }, {
        kind: "AGENT";
        sessionId: string;
    }>, z.ZodObject<{
        kind: z.ZodLiteral<"SYSTEM">;
        name: z.ZodEffects<z.ZodString, string, string>;
    }, "strip", z.ZodTypeAny, {
        kind: "SYSTEM";
        name: string;
    }, {
        kind: "SYSTEM";
        name: string;
    }>]>;
    correlationId: z.ZodEffects<z.ZodEffects<z.ZodString, string, string>, string & {
        readonly __brand: "CorrelationId";
    }, string>;
    causationId: z.ZodEffects<z.ZodEffects<z.ZodString, string, string>, string & {
        readonly __brand: "EventId";
    }, string>;
    occurredAt: z.ZodDate;
}, "strip", z.ZodTypeAny, {
    correlationId: string & {
        readonly __brand: "CorrelationId";
    };
    causationId: string & {
        readonly __brand: "EventId";
    };
    eventType: "BLOCKED";
    payload: {
        reason: string;
        taskId?: (string & {
            readonly __brand: "TaskId";
        }) | undefined;
    };
    eventId: string & {
        readonly __brand: "EventId";
    };
    aggregateType: string;
    aggregateId: string;
    aggregateVersion: number;
    actor: {
        kind: "CEO";
    } | {
        kind: "AGENT";
        sessionId: string & {
            readonly __brand: "AgentSessionId";
        };
    } | {
        kind: "SYSTEM";
        name: string;
    };
    occurredAt: Date;
}, {
    correlationId: string;
    causationId: string;
    eventType: "BLOCKED";
    payload: {
        reason: string;
        taskId?: string | undefined;
    };
    eventId: string;
    aggregateType: string;
    aggregateId: string;
    aggregateVersion: number;
    actor: {
        kind: "CEO";
    } | {
        kind: "AGENT";
        sessionId: string;
    } | {
        kind: "SYSTEM";
        name: string;
    };
    occurredAt: Date;
}>, z.ZodObject<{
    eventType: z.ZodLiteral<"TASK_FAILED">;
    payload: z.ZodObject<{
        failureFingerprint: z.ZodEffects<z.ZodString, string, string>;
        taskId: z.ZodOptional<z.ZodEffects<z.ZodEffects<z.ZodString, string, string>, string & {
            readonly __brand: "TaskId";
        }, string>>;
    }, "strip", z.ZodTypeAny, {
        failureFingerprint: string;
        taskId?: (string & {
            readonly __brand: "TaskId";
        }) | undefined;
    }, {
        failureFingerprint: string;
        taskId?: string | undefined;
    }>;
    eventId: z.ZodEffects<z.ZodEffects<z.ZodString, string, string>, string & {
        readonly __brand: "EventId";
    }, string>;
    aggregateType: z.ZodEffects<z.ZodString, string, string>;
    aggregateId: z.ZodEffects<z.ZodString, string, string>;
    aggregateVersion: z.ZodNumber;
    actor: z.ZodUnion<[z.ZodObject<{
        kind: z.ZodLiteral<"CEO">;
    }, "strip", z.ZodTypeAny, {
        kind: "CEO";
    }, {
        kind: "CEO";
    }>, z.ZodObject<{
        kind: z.ZodLiteral<"AGENT">;
        sessionId: z.ZodEffects<z.ZodEffects<z.ZodString, string, string>, string & {
            readonly __brand: "AgentSessionId";
        }, string>;
    }, "strip", z.ZodTypeAny, {
        kind: "AGENT";
        sessionId: string & {
            readonly __brand: "AgentSessionId";
        };
    }, {
        kind: "AGENT";
        sessionId: string;
    }>, z.ZodObject<{
        kind: z.ZodLiteral<"SYSTEM">;
        name: z.ZodEffects<z.ZodString, string, string>;
    }, "strip", z.ZodTypeAny, {
        kind: "SYSTEM";
        name: string;
    }, {
        kind: "SYSTEM";
        name: string;
    }>]>;
    correlationId: z.ZodEffects<z.ZodEffects<z.ZodString, string, string>, string & {
        readonly __brand: "CorrelationId";
    }, string>;
    causationId: z.ZodEffects<z.ZodEffects<z.ZodString, string, string>, string & {
        readonly __brand: "EventId";
    }, string>;
    occurredAt: z.ZodDate;
}, "strip", z.ZodTypeAny, {
    correlationId: string & {
        readonly __brand: "CorrelationId";
    };
    causationId: string & {
        readonly __brand: "EventId";
    };
    eventType: "TASK_FAILED";
    payload: {
        failureFingerprint: string;
        taskId?: (string & {
            readonly __brand: "TaskId";
        }) | undefined;
    };
    eventId: string & {
        readonly __brand: "EventId";
    };
    aggregateType: string;
    aggregateId: string;
    aggregateVersion: number;
    actor: {
        kind: "CEO";
    } | {
        kind: "AGENT";
        sessionId: string & {
            readonly __brand: "AgentSessionId";
        };
    } | {
        kind: "SYSTEM";
        name: string;
    };
    occurredAt: Date;
}, {
    correlationId: string;
    causationId: string;
    eventType: "TASK_FAILED";
    payload: {
        failureFingerprint: string;
        taskId?: string | undefined;
    };
    eventId: string;
    aggregateType: string;
    aggregateId: string;
    aggregateVersion: number;
    actor: {
        kind: "CEO";
    } | {
        kind: "AGENT";
        sessionId: string;
    } | {
        kind: "SYSTEM";
        name: string;
    };
    occurredAt: Date;
}>, z.ZodObject<{
    eventType: z.ZodLiteral<"RECOVERY_STARTED">;
    payload: z.ZodObject<{
        recoveryId: z.ZodEffects<z.ZodString, string, string>;
        taskId: z.ZodOptional<z.ZodEffects<z.ZodEffects<z.ZodString, string, string>, string & {
            readonly __brand: "TaskId";
        }, string>>;
    }, "strip", z.ZodTypeAny, {
        recoveryId: string;
        taskId?: (string & {
            readonly __brand: "TaskId";
        }) | undefined;
    }, {
        recoveryId: string;
        taskId?: string | undefined;
    }>;
    eventId: z.ZodEffects<z.ZodEffects<z.ZodString, string, string>, string & {
        readonly __brand: "EventId";
    }, string>;
    aggregateType: z.ZodEffects<z.ZodString, string, string>;
    aggregateId: z.ZodEffects<z.ZodString, string, string>;
    aggregateVersion: z.ZodNumber;
    actor: z.ZodUnion<[z.ZodObject<{
        kind: z.ZodLiteral<"CEO">;
    }, "strip", z.ZodTypeAny, {
        kind: "CEO";
    }, {
        kind: "CEO";
    }>, z.ZodObject<{
        kind: z.ZodLiteral<"AGENT">;
        sessionId: z.ZodEffects<z.ZodEffects<z.ZodString, string, string>, string & {
            readonly __brand: "AgentSessionId";
        }, string>;
    }, "strip", z.ZodTypeAny, {
        kind: "AGENT";
        sessionId: string & {
            readonly __brand: "AgentSessionId";
        };
    }, {
        kind: "AGENT";
        sessionId: string;
    }>, z.ZodObject<{
        kind: z.ZodLiteral<"SYSTEM">;
        name: z.ZodEffects<z.ZodString, string, string>;
    }, "strip", z.ZodTypeAny, {
        kind: "SYSTEM";
        name: string;
    }, {
        kind: "SYSTEM";
        name: string;
    }>]>;
    correlationId: z.ZodEffects<z.ZodEffects<z.ZodString, string, string>, string & {
        readonly __brand: "CorrelationId";
    }, string>;
    causationId: z.ZodEffects<z.ZodEffects<z.ZodString, string, string>, string & {
        readonly __brand: "EventId";
    }, string>;
    occurredAt: z.ZodDate;
}, "strip", z.ZodTypeAny, {
    correlationId: string & {
        readonly __brand: "CorrelationId";
    };
    causationId: string & {
        readonly __brand: "EventId";
    };
    eventType: "RECOVERY_STARTED";
    payload: {
        recoveryId: string;
        taskId?: (string & {
            readonly __brand: "TaskId";
        }) | undefined;
    };
    eventId: string & {
        readonly __brand: "EventId";
    };
    aggregateType: string;
    aggregateId: string;
    aggregateVersion: number;
    actor: {
        kind: "CEO";
    } | {
        kind: "AGENT";
        sessionId: string & {
            readonly __brand: "AgentSessionId";
        };
    } | {
        kind: "SYSTEM";
        name: string;
    };
    occurredAt: Date;
}, {
    correlationId: string;
    causationId: string;
    eventType: "RECOVERY_STARTED";
    payload: {
        recoveryId: string;
        taskId?: string | undefined;
    };
    eventId: string;
    aggregateType: string;
    aggregateId: string;
    aggregateVersion: number;
    actor: {
        kind: "CEO";
    } | {
        kind: "AGENT";
        sessionId: string;
    } | {
        kind: "SYSTEM";
        name: string;
    };
    occurredAt: Date;
}>, z.ZodObject<{
    eventType: z.ZodLiteral<"TASK_COMPLETED">;
    payload: z.ZodObject<{
        evidenceIds: z.ZodArray<z.ZodEffects<z.ZodString, string, string>, "many">;
        taskId: z.ZodOptional<z.ZodEffects<z.ZodEffects<z.ZodString, string, string>, string & {
            readonly __brand: "TaskId";
        }, string>>;
    }, "strip", z.ZodTypeAny, {
        evidenceIds: string[];
        taskId?: (string & {
            readonly __brand: "TaskId";
        }) | undefined;
    }, {
        evidenceIds: string[];
        taskId?: string | undefined;
    }>;
    eventId: z.ZodEffects<z.ZodEffects<z.ZodString, string, string>, string & {
        readonly __brand: "EventId";
    }, string>;
    aggregateType: z.ZodEffects<z.ZodString, string, string>;
    aggregateId: z.ZodEffects<z.ZodString, string, string>;
    aggregateVersion: z.ZodNumber;
    actor: z.ZodUnion<[z.ZodObject<{
        kind: z.ZodLiteral<"CEO">;
    }, "strip", z.ZodTypeAny, {
        kind: "CEO";
    }, {
        kind: "CEO";
    }>, z.ZodObject<{
        kind: z.ZodLiteral<"AGENT">;
        sessionId: z.ZodEffects<z.ZodEffects<z.ZodString, string, string>, string & {
            readonly __brand: "AgentSessionId";
        }, string>;
    }, "strip", z.ZodTypeAny, {
        kind: "AGENT";
        sessionId: string & {
            readonly __brand: "AgentSessionId";
        };
    }, {
        kind: "AGENT";
        sessionId: string;
    }>, z.ZodObject<{
        kind: z.ZodLiteral<"SYSTEM">;
        name: z.ZodEffects<z.ZodString, string, string>;
    }, "strip", z.ZodTypeAny, {
        kind: "SYSTEM";
        name: string;
    }, {
        kind: "SYSTEM";
        name: string;
    }>]>;
    correlationId: z.ZodEffects<z.ZodEffects<z.ZodString, string, string>, string & {
        readonly __brand: "CorrelationId";
    }, string>;
    causationId: z.ZodEffects<z.ZodEffects<z.ZodString, string, string>, string & {
        readonly __brand: "EventId";
    }, string>;
    occurredAt: z.ZodDate;
}, "strip", z.ZodTypeAny, {
    correlationId: string & {
        readonly __brand: "CorrelationId";
    };
    causationId: string & {
        readonly __brand: "EventId";
    };
    eventType: "TASK_COMPLETED";
    payload: {
        evidenceIds: string[];
        taskId?: (string & {
            readonly __brand: "TaskId";
        }) | undefined;
    };
    eventId: string & {
        readonly __brand: "EventId";
    };
    aggregateType: string;
    aggregateId: string;
    aggregateVersion: number;
    actor: {
        kind: "CEO";
    } | {
        kind: "AGENT";
        sessionId: string & {
            readonly __brand: "AgentSessionId";
        };
    } | {
        kind: "SYSTEM";
        name: string;
    };
    occurredAt: Date;
}, {
    correlationId: string;
    causationId: string;
    eventType: "TASK_COMPLETED";
    payload: {
        evidenceIds: string[];
        taskId?: string | undefined;
    };
    eventId: string;
    aggregateType: string;
    aggregateId: string;
    aggregateVersion: number;
    actor: {
        kind: "CEO";
    } | {
        kind: "AGENT";
        sessionId: string;
    } | {
        kind: "SYSTEM";
        name: string;
    };
    occurredAt: Date;
}>, z.ZodObject<{
    eventType: z.ZodLiteral<"DEPLOYMENT_APPROVAL_REQUESTED">;
    payload: z.ZodObject<{
        approvalId: z.ZodEffects<z.ZodEffects<z.ZodString, string, string>, string & {
            readonly __brand: "ApprovalId";
        }, string>;
        taskId: z.ZodEffects<z.ZodEffects<z.ZodString, string, string>, string & {
            readonly __brand: "TaskId";
        }, string>;
    }, "strip", z.ZodTypeAny, {
        taskId: string & {
            readonly __brand: "TaskId";
        };
        approvalId: string & {
            readonly __brand: "ApprovalId";
        };
    }, {
        taskId: string;
        approvalId: string;
    }>;
    eventId: z.ZodEffects<z.ZodEffects<z.ZodString, string, string>, string & {
        readonly __brand: "EventId";
    }, string>;
    aggregateType: z.ZodEffects<z.ZodString, string, string>;
    aggregateId: z.ZodEffects<z.ZodString, string, string>;
    aggregateVersion: z.ZodNumber;
    actor: z.ZodUnion<[z.ZodObject<{
        kind: z.ZodLiteral<"CEO">;
    }, "strip", z.ZodTypeAny, {
        kind: "CEO";
    }, {
        kind: "CEO";
    }>, z.ZodObject<{
        kind: z.ZodLiteral<"AGENT">;
        sessionId: z.ZodEffects<z.ZodEffects<z.ZodString, string, string>, string & {
            readonly __brand: "AgentSessionId";
        }, string>;
    }, "strip", z.ZodTypeAny, {
        kind: "AGENT";
        sessionId: string & {
            readonly __brand: "AgentSessionId";
        };
    }, {
        kind: "AGENT";
        sessionId: string;
    }>, z.ZodObject<{
        kind: z.ZodLiteral<"SYSTEM">;
        name: z.ZodEffects<z.ZodString, string, string>;
    }, "strip", z.ZodTypeAny, {
        kind: "SYSTEM";
        name: string;
    }, {
        kind: "SYSTEM";
        name: string;
    }>]>;
    correlationId: z.ZodEffects<z.ZodEffects<z.ZodString, string, string>, string & {
        readonly __brand: "CorrelationId";
    }, string>;
    causationId: z.ZodEffects<z.ZodEffects<z.ZodString, string, string>, string & {
        readonly __brand: "EventId";
    }, string>;
    occurredAt: z.ZodDate;
}, "strip", z.ZodTypeAny, {
    correlationId: string & {
        readonly __brand: "CorrelationId";
    };
    causationId: string & {
        readonly __brand: "EventId";
    };
    eventType: "DEPLOYMENT_APPROVAL_REQUESTED";
    payload: {
        taskId: string & {
            readonly __brand: "TaskId";
        };
        approvalId: string & {
            readonly __brand: "ApprovalId";
        };
    };
    eventId: string & {
        readonly __brand: "EventId";
    };
    aggregateType: string;
    aggregateId: string;
    aggregateVersion: number;
    actor: {
        kind: "CEO";
    } | {
        kind: "AGENT";
        sessionId: string & {
            readonly __brand: "AgentSessionId";
        };
    } | {
        kind: "SYSTEM";
        name: string;
    };
    occurredAt: Date;
}, {
    correlationId: string;
    causationId: string;
    eventType: "DEPLOYMENT_APPROVAL_REQUESTED";
    payload: {
        taskId: string;
        approvalId: string;
    };
    eventId: string;
    aggregateType: string;
    aggregateId: string;
    aggregateVersion: number;
    actor: {
        kind: "CEO";
    } | {
        kind: "AGENT";
        sessionId: string;
    } | {
        kind: "SYSTEM";
        name: string;
    };
    occurredAt: Date;
}>, z.ZodObject<{
    eventType: z.ZodLiteral<"DEPLOYMENT_APPROVED">;
    payload: z.ZodObject<{
        approvalId: z.ZodEffects<z.ZodEffects<z.ZodString, string, string>, string & {
            readonly __brand: "ApprovalId";
        }, string>;
        taskId: z.ZodEffects<z.ZodEffects<z.ZodString, string, string>, string & {
            readonly __brand: "TaskId";
        }, string>;
    }, "strip", z.ZodTypeAny, {
        taskId: string & {
            readonly __brand: "TaskId";
        };
        approvalId: string & {
            readonly __brand: "ApprovalId";
        };
    }, {
        taskId: string;
        approvalId: string;
    }>;
    eventId: z.ZodEffects<z.ZodEffects<z.ZodString, string, string>, string & {
        readonly __brand: "EventId";
    }, string>;
    aggregateType: z.ZodEffects<z.ZodString, string, string>;
    aggregateId: z.ZodEffects<z.ZodString, string, string>;
    aggregateVersion: z.ZodNumber;
    actor: z.ZodUnion<[z.ZodObject<{
        kind: z.ZodLiteral<"CEO">;
    }, "strip", z.ZodTypeAny, {
        kind: "CEO";
    }, {
        kind: "CEO";
    }>, z.ZodObject<{
        kind: z.ZodLiteral<"AGENT">;
        sessionId: z.ZodEffects<z.ZodEffects<z.ZodString, string, string>, string & {
            readonly __brand: "AgentSessionId";
        }, string>;
    }, "strip", z.ZodTypeAny, {
        kind: "AGENT";
        sessionId: string & {
            readonly __brand: "AgentSessionId";
        };
    }, {
        kind: "AGENT";
        sessionId: string;
    }>, z.ZodObject<{
        kind: z.ZodLiteral<"SYSTEM">;
        name: z.ZodEffects<z.ZodString, string, string>;
    }, "strip", z.ZodTypeAny, {
        kind: "SYSTEM";
        name: string;
    }, {
        kind: "SYSTEM";
        name: string;
    }>]>;
    correlationId: z.ZodEffects<z.ZodEffects<z.ZodString, string, string>, string & {
        readonly __brand: "CorrelationId";
    }, string>;
    causationId: z.ZodEffects<z.ZodEffects<z.ZodString, string, string>, string & {
        readonly __brand: "EventId";
    }, string>;
    occurredAt: z.ZodDate;
}, "strip", z.ZodTypeAny, {
    correlationId: string & {
        readonly __brand: "CorrelationId";
    };
    causationId: string & {
        readonly __brand: "EventId";
    };
    eventType: "DEPLOYMENT_APPROVED";
    payload: {
        taskId: string & {
            readonly __brand: "TaskId";
        };
        approvalId: string & {
            readonly __brand: "ApprovalId";
        };
    };
    eventId: string & {
        readonly __brand: "EventId";
    };
    aggregateType: string;
    aggregateId: string;
    aggregateVersion: number;
    actor: {
        kind: "CEO";
    } | {
        kind: "AGENT";
        sessionId: string & {
            readonly __brand: "AgentSessionId";
        };
    } | {
        kind: "SYSTEM";
        name: string;
    };
    occurredAt: Date;
}, {
    correlationId: string;
    causationId: string;
    eventType: "DEPLOYMENT_APPROVED";
    payload: {
        taskId: string;
        approvalId: string;
    };
    eventId: string;
    aggregateType: string;
    aggregateId: string;
    aggregateVersion: number;
    actor: {
        kind: "CEO";
    } | {
        kind: "AGENT";
        sessionId: string;
    } | {
        kind: "SYSTEM";
        name: string;
    };
    occurredAt: Date;
}>, z.ZodObject<{
    eventType: z.ZodLiteral<"DEPLOYMENT_REJECTED">;
    payload: z.ZodObject<{
        approvalId: z.ZodEffects<z.ZodEffects<z.ZodString, string, string>, string & {
            readonly __brand: "ApprovalId";
        }, string>;
        taskId: z.ZodEffects<z.ZodEffects<z.ZodString, string, string>, string & {
            readonly __brand: "TaskId";
        }, string>;
        reason: z.ZodEffects<z.ZodString, string, string>;
    }, "strip", z.ZodTypeAny, {
        taskId: string & {
            readonly __brand: "TaskId";
        };
        approvalId: string & {
            readonly __brand: "ApprovalId";
        };
        reason: string;
    }, {
        taskId: string;
        approvalId: string;
        reason: string;
    }>;
    eventId: z.ZodEffects<z.ZodEffects<z.ZodString, string, string>, string & {
        readonly __brand: "EventId";
    }, string>;
    aggregateType: z.ZodEffects<z.ZodString, string, string>;
    aggregateId: z.ZodEffects<z.ZodString, string, string>;
    aggregateVersion: z.ZodNumber;
    actor: z.ZodUnion<[z.ZodObject<{
        kind: z.ZodLiteral<"CEO">;
    }, "strip", z.ZodTypeAny, {
        kind: "CEO";
    }, {
        kind: "CEO";
    }>, z.ZodObject<{
        kind: z.ZodLiteral<"AGENT">;
        sessionId: z.ZodEffects<z.ZodEffects<z.ZodString, string, string>, string & {
            readonly __brand: "AgentSessionId";
        }, string>;
    }, "strip", z.ZodTypeAny, {
        kind: "AGENT";
        sessionId: string & {
            readonly __brand: "AgentSessionId";
        };
    }, {
        kind: "AGENT";
        sessionId: string;
    }>, z.ZodObject<{
        kind: z.ZodLiteral<"SYSTEM">;
        name: z.ZodEffects<z.ZodString, string, string>;
    }, "strip", z.ZodTypeAny, {
        kind: "SYSTEM";
        name: string;
    }, {
        kind: "SYSTEM";
        name: string;
    }>]>;
    correlationId: z.ZodEffects<z.ZodEffects<z.ZodString, string, string>, string & {
        readonly __brand: "CorrelationId";
    }, string>;
    causationId: z.ZodEffects<z.ZodEffects<z.ZodString, string, string>, string & {
        readonly __brand: "EventId";
    }, string>;
    occurredAt: z.ZodDate;
}, "strip", z.ZodTypeAny, {
    correlationId: string & {
        readonly __brand: "CorrelationId";
    };
    causationId: string & {
        readonly __brand: "EventId";
    };
    eventType: "DEPLOYMENT_REJECTED";
    payload: {
        taskId: string & {
            readonly __brand: "TaskId";
        };
        approvalId: string & {
            readonly __brand: "ApprovalId";
        };
        reason: string;
    };
    eventId: string & {
        readonly __brand: "EventId";
    };
    aggregateType: string;
    aggregateId: string;
    aggregateVersion: number;
    actor: {
        kind: "CEO";
    } | {
        kind: "AGENT";
        sessionId: string & {
            readonly __brand: "AgentSessionId";
        };
    } | {
        kind: "SYSTEM";
        name: string;
    };
    occurredAt: Date;
}, {
    correlationId: string;
    causationId: string;
    eventType: "DEPLOYMENT_REJECTED";
    payload: {
        taskId: string;
        approvalId: string;
        reason: string;
    };
    eventId: string;
    aggregateType: string;
    aggregateId: string;
    aggregateVersion: number;
    actor: {
        kind: "CEO";
    } | {
        kind: "AGENT";
        sessionId: string;
    } | {
        kind: "SYSTEM";
        name: string;
    };
    occurredAt: Date;
}>, z.ZodObject<{
    eventType: z.ZodLiteral<"DEPLOYMENT_RESULT_RECORDED">;
    payload: z.ZodObject<{
        taskId: z.ZodEffects<z.ZodEffects<z.ZodString, string, string>, string & {
            readonly __brand: "TaskId";
        }, string>;
        approvalId: z.ZodEffects<z.ZodEffects<z.ZodString, string, string>, string & {
            readonly __brand: "ApprovalId";
        }, string>;
        attemptId: z.ZodEffects<z.ZodString, string, string>;
        evidenceIds: z.ZodArray<z.ZodEffects<z.ZodString, string, string>, "many">;
    }, "strip", z.ZodTypeAny, {
        taskId: string & {
            readonly __brand: "TaskId";
        };
        approvalId: string & {
            readonly __brand: "ApprovalId";
        };
        evidenceIds: string[];
        attemptId: string;
    }, {
        taskId: string;
        approvalId: string;
        evidenceIds: string[];
        attemptId: string;
    }>;
    eventId: z.ZodEffects<z.ZodEffects<z.ZodString, string, string>, string & {
        readonly __brand: "EventId";
    }, string>;
    aggregateType: z.ZodEffects<z.ZodString, string, string>;
    aggregateId: z.ZodEffects<z.ZodString, string, string>;
    aggregateVersion: z.ZodNumber;
    actor: z.ZodUnion<[z.ZodObject<{
        kind: z.ZodLiteral<"CEO">;
    }, "strip", z.ZodTypeAny, {
        kind: "CEO";
    }, {
        kind: "CEO";
    }>, z.ZodObject<{
        kind: z.ZodLiteral<"AGENT">;
        sessionId: z.ZodEffects<z.ZodEffects<z.ZodString, string, string>, string & {
            readonly __brand: "AgentSessionId";
        }, string>;
    }, "strip", z.ZodTypeAny, {
        kind: "AGENT";
        sessionId: string & {
            readonly __brand: "AgentSessionId";
        };
    }, {
        kind: "AGENT";
        sessionId: string;
    }>, z.ZodObject<{
        kind: z.ZodLiteral<"SYSTEM">;
        name: z.ZodEffects<z.ZodString, string, string>;
    }, "strip", z.ZodTypeAny, {
        kind: "SYSTEM";
        name: string;
    }, {
        kind: "SYSTEM";
        name: string;
    }>]>;
    correlationId: z.ZodEffects<z.ZodEffects<z.ZodString, string, string>, string & {
        readonly __brand: "CorrelationId";
    }, string>;
    causationId: z.ZodEffects<z.ZodEffects<z.ZodString, string, string>, string & {
        readonly __brand: "EventId";
    }, string>;
    occurredAt: z.ZodDate;
}, "strip", z.ZodTypeAny, {
    correlationId: string & {
        readonly __brand: "CorrelationId";
    };
    causationId: string & {
        readonly __brand: "EventId";
    };
    eventType: "DEPLOYMENT_RESULT_RECORDED";
    payload: {
        taskId: string & {
            readonly __brand: "TaskId";
        };
        approvalId: string & {
            readonly __brand: "ApprovalId";
        };
        evidenceIds: string[];
        attemptId: string;
    };
    eventId: string & {
        readonly __brand: "EventId";
    };
    aggregateType: string;
    aggregateId: string;
    aggregateVersion: number;
    actor: {
        kind: "CEO";
    } | {
        kind: "AGENT";
        sessionId: string & {
            readonly __brand: "AgentSessionId";
        };
    } | {
        kind: "SYSTEM";
        name: string;
    };
    occurredAt: Date;
}, {
    correlationId: string;
    causationId: string;
    eventType: "DEPLOYMENT_RESULT_RECORDED";
    payload: {
        taskId: string;
        approvalId: string;
        evidenceIds: string[];
        attemptId: string;
    };
    eventId: string;
    aggregateType: string;
    aggregateId: string;
    aggregateVersion: number;
    actor: {
        kind: "CEO";
    } | {
        kind: "AGENT";
        sessionId: string;
    } | {
        kind: "SYSTEM";
        name: string;
    };
    occurredAt: Date;
}>, z.ZodObject<{
    aggregateVersion: z.ZodNumber;
    eventType: z.ZodLiteral<"APPROVAL_REQUESTED">;
    payload: z.ZodObject<{
        approvalId: z.ZodEffects<z.ZodEffects<z.ZodString, string, string>, string & {
            readonly __brand: "ApprovalId";
        }, string>;
        subjectType: z.ZodEnum<["CAPABILITY", "DEPLOYMENT", "RECOVERY_ESCALATION"]>;
        subjectId: z.ZodEffects<z.ZodString, string, string>;
        reason: z.ZodEffects<z.ZodString, string, string>;
    }, "strip", z.ZodTypeAny, {
        approvalId: string & {
            readonly __brand: "ApprovalId";
        };
        subjectType: "CAPABILITY" | "DEPLOYMENT" | "RECOVERY_ESCALATION";
        subjectId: string;
        reason: string;
    }, {
        approvalId: string;
        subjectType: "CAPABILITY" | "DEPLOYMENT" | "RECOVERY_ESCALATION";
        subjectId: string;
        reason: string;
    }>;
    eventId: z.ZodEffects<z.ZodEffects<z.ZodString, string, string>, string & {
        readonly __brand: "EventId";
    }, string>;
    aggregateType: z.ZodEffects<z.ZodString, string, string>;
    aggregateId: z.ZodEffects<z.ZodString, string, string>;
    actor: z.ZodUnion<[z.ZodObject<{
        kind: z.ZodLiteral<"CEO">;
    }, "strip", z.ZodTypeAny, {
        kind: "CEO";
    }, {
        kind: "CEO";
    }>, z.ZodObject<{
        kind: z.ZodLiteral<"AGENT">;
        sessionId: z.ZodEffects<z.ZodEffects<z.ZodString, string, string>, string & {
            readonly __brand: "AgentSessionId";
        }, string>;
    }, "strip", z.ZodTypeAny, {
        kind: "AGENT";
        sessionId: string & {
            readonly __brand: "AgentSessionId";
        };
    }, {
        kind: "AGENT";
        sessionId: string;
    }>, z.ZodObject<{
        kind: z.ZodLiteral<"SYSTEM">;
        name: z.ZodEffects<z.ZodString, string, string>;
    }, "strip", z.ZodTypeAny, {
        kind: "SYSTEM";
        name: string;
    }, {
        kind: "SYSTEM";
        name: string;
    }>]>;
    correlationId: z.ZodEffects<z.ZodEffects<z.ZodString, string, string>, string & {
        readonly __brand: "CorrelationId";
    }, string>;
    causationId: z.ZodEffects<z.ZodEffects<z.ZodString, string, string>, string & {
        readonly __brand: "EventId";
    }, string>;
    occurredAt: z.ZodDate;
}, "strip", z.ZodTypeAny, {
    correlationId: string & {
        readonly __brand: "CorrelationId";
    };
    causationId: string & {
        readonly __brand: "EventId";
    };
    eventType: "APPROVAL_REQUESTED";
    payload: {
        approvalId: string & {
            readonly __brand: "ApprovalId";
        };
        subjectType: "CAPABILITY" | "DEPLOYMENT" | "RECOVERY_ESCALATION";
        subjectId: string;
        reason: string;
    };
    eventId: string & {
        readonly __brand: "EventId";
    };
    aggregateType: string;
    aggregateId: string;
    aggregateVersion: number;
    actor: {
        kind: "CEO";
    } | {
        kind: "AGENT";
        sessionId: string & {
            readonly __brand: "AgentSessionId";
        };
    } | {
        kind: "SYSTEM";
        name: string;
    };
    occurredAt: Date;
}, {
    correlationId: string;
    causationId: string;
    eventType: "APPROVAL_REQUESTED";
    payload: {
        approvalId: string;
        subjectType: "CAPABILITY" | "DEPLOYMENT" | "RECOVERY_ESCALATION";
        subjectId: string;
        reason: string;
    };
    eventId: string;
    aggregateType: string;
    aggregateId: string;
    aggregateVersion: number;
    actor: {
        kind: "CEO";
    } | {
        kind: "AGENT";
        sessionId: string;
    } | {
        kind: "SYSTEM";
        name: string;
    };
    occurredAt: Date;
}>, z.ZodObject<{
    eventType: z.ZodLiteral<"TASK_ESCALATED">;
    payload: z.ZodObject<{
        reason: z.ZodEffects<z.ZodString, string, string>;
        taskId: z.ZodOptional<z.ZodEffects<z.ZodEffects<z.ZodString, string, string>, string & {
            readonly __brand: "TaskId";
        }, string>>;
    }, "strip", z.ZodTypeAny, {
        reason: string;
        taskId?: (string & {
            readonly __brand: "TaskId";
        }) | undefined;
    }, {
        reason: string;
        taskId?: string | undefined;
    }>;
    eventId: z.ZodEffects<z.ZodEffects<z.ZodString, string, string>, string & {
        readonly __brand: "EventId";
    }, string>;
    aggregateType: z.ZodEffects<z.ZodString, string, string>;
    aggregateId: z.ZodEffects<z.ZodString, string, string>;
    aggregateVersion: z.ZodNumber;
    actor: z.ZodUnion<[z.ZodObject<{
        kind: z.ZodLiteral<"CEO">;
    }, "strip", z.ZodTypeAny, {
        kind: "CEO";
    }, {
        kind: "CEO";
    }>, z.ZodObject<{
        kind: z.ZodLiteral<"AGENT">;
        sessionId: z.ZodEffects<z.ZodEffects<z.ZodString, string, string>, string & {
            readonly __brand: "AgentSessionId";
        }, string>;
    }, "strip", z.ZodTypeAny, {
        kind: "AGENT";
        sessionId: string & {
            readonly __brand: "AgentSessionId";
        };
    }, {
        kind: "AGENT";
        sessionId: string;
    }>, z.ZodObject<{
        kind: z.ZodLiteral<"SYSTEM">;
        name: z.ZodEffects<z.ZodString, string, string>;
    }, "strip", z.ZodTypeAny, {
        kind: "SYSTEM";
        name: string;
    }, {
        kind: "SYSTEM";
        name: string;
    }>]>;
    correlationId: z.ZodEffects<z.ZodEffects<z.ZodString, string, string>, string & {
        readonly __brand: "CorrelationId";
    }, string>;
    causationId: z.ZodEffects<z.ZodEffects<z.ZodString, string, string>, string & {
        readonly __brand: "EventId";
    }, string>;
    occurredAt: z.ZodDate;
}, "strip", z.ZodTypeAny, {
    correlationId: string & {
        readonly __brand: "CorrelationId";
    };
    causationId: string & {
        readonly __brand: "EventId";
    };
    eventType: "TASK_ESCALATED";
    payload: {
        reason: string;
        taskId?: (string & {
            readonly __brand: "TaskId";
        }) | undefined;
    };
    eventId: string & {
        readonly __brand: "EventId";
    };
    aggregateType: string;
    aggregateId: string;
    aggregateVersion: number;
    actor: {
        kind: "CEO";
    } | {
        kind: "AGENT";
        sessionId: string & {
            readonly __brand: "AgentSessionId";
        };
    } | {
        kind: "SYSTEM";
        name: string;
    };
    occurredAt: Date;
}, {
    correlationId: string;
    causationId: string;
    eventType: "TASK_ESCALATED";
    payload: {
        reason: string;
        taskId?: string | undefined;
    };
    eventId: string;
    aggregateType: string;
    aggregateId: string;
    aggregateVersion: number;
    actor: {
        kind: "CEO";
    } | {
        kind: "AGENT";
        sessionId: string;
    } | {
        kind: "SYSTEM";
        name: string;
    };
    occurredAt: Date;
}>, z.ZodObject<{
    eventType: z.ZodLiteral<"TASK_CANCELLED">;
    payload: z.ZodObject<{
        reason: z.ZodEffects<z.ZodString, string, string>;
        taskId: z.ZodOptional<z.ZodEffects<z.ZodEffects<z.ZodString, string, string>, string & {
            readonly __brand: "TaskId";
        }, string>>;
    }, "strip", z.ZodTypeAny, {
        reason: string;
        taskId?: (string & {
            readonly __brand: "TaskId";
        }) | undefined;
    }, {
        reason: string;
        taskId?: string | undefined;
    }>;
    eventId: z.ZodEffects<z.ZodEffects<z.ZodString, string, string>, string & {
        readonly __brand: "EventId";
    }, string>;
    aggregateType: z.ZodEffects<z.ZodString, string, string>;
    aggregateId: z.ZodEffects<z.ZodString, string, string>;
    aggregateVersion: z.ZodNumber;
    actor: z.ZodUnion<[z.ZodObject<{
        kind: z.ZodLiteral<"CEO">;
    }, "strip", z.ZodTypeAny, {
        kind: "CEO";
    }, {
        kind: "CEO";
    }>, z.ZodObject<{
        kind: z.ZodLiteral<"AGENT">;
        sessionId: z.ZodEffects<z.ZodEffects<z.ZodString, string, string>, string & {
            readonly __brand: "AgentSessionId";
        }, string>;
    }, "strip", z.ZodTypeAny, {
        kind: "AGENT";
        sessionId: string & {
            readonly __brand: "AgentSessionId";
        };
    }, {
        kind: "AGENT";
        sessionId: string;
    }>, z.ZodObject<{
        kind: z.ZodLiteral<"SYSTEM">;
        name: z.ZodEffects<z.ZodString, string, string>;
    }, "strip", z.ZodTypeAny, {
        kind: "SYSTEM";
        name: string;
    }, {
        kind: "SYSTEM";
        name: string;
    }>]>;
    correlationId: z.ZodEffects<z.ZodEffects<z.ZodString, string, string>, string & {
        readonly __brand: "CorrelationId";
    }, string>;
    causationId: z.ZodEffects<z.ZodEffects<z.ZodString, string, string>, string & {
        readonly __brand: "EventId";
    }, string>;
    occurredAt: z.ZodDate;
}, "strip", z.ZodTypeAny, {
    correlationId: string & {
        readonly __brand: "CorrelationId";
    };
    causationId: string & {
        readonly __brand: "EventId";
    };
    eventType: "TASK_CANCELLED";
    payload: {
        reason: string;
        taskId?: (string & {
            readonly __brand: "TaskId";
        }) | undefined;
    };
    eventId: string & {
        readonly __brand: "EventId";
    };
    aggregateType: string;
    aggregateId: string;
    aggregateVersion: number;
    actor: {
        kind: "CEO";
    } | {
        kind: "AGENT";
        sessionId: string & {
            readonly __brand: "AgentSessionId";
        };
    } | {
        kind: "SYSTEM";
        name: string;
    };
    occurredAt: Date;
}, {
    correlationId: string;
    causationId: string;
    eventType: "TASK_CANCELLED";
    payload: {
        reason: string;
        taskId?: string | undefined;
    };
    eventId: string;
    aggregateType: string;
    aggregateId: string;
    aggregateVersion: number;
    actor: {
        kind: "CEO";
    } | {
        kind: "AGENT";
        sessionId: string;
    } | {
        kind: "SYSTEM";
        name: string;
    };
    occurredAt: Date;
}>, z.ZodObject<{
    eventType: z.ZodLiteral<"AGENT_SESSION_CREATED">;
    payload: z.ZodObject<{
        sessionId: z.ZodEffects<z.ZodEffects<z.ZodString, string, string>, string & {
            readonly __brand: "AgentSessionId";
        }, string>;
        taskId: z.ZodEffects<z.ZodEffects<z.ZodString, string, string>, string & {
            readonly __brand: "TaskId";
        }, string>;
        agentDefinitionId: z.ZodEffects<z.ZodEffects<z.ZodString, string, string>, string & {
            readonly __brand: "AgentDefinitionId";
        }, string>;
    }, "strip", z.ZodTypeAny, {
        sessionId: string & {
            readonly __brand: "AgentSessionId";
        };
        taskId: string & {
            readonly __brand: "TaskId";
        };
        agentDefinitionId: string & {
            readonly __brand: "AgentDefinitionId";
        };
    }, {
        sessionId: string;
        taskId: string;
        agentDefinitionId: string;
    }>;
    eventId: z.ZodEffects<z.ZodEffects<z.ZodString, string, string>, string & {
        readonly __brand: "EventId";
    }, string>;
    aggregateType: z.ZodEffects<z.ZodString, string, string>;
    aggregateId: z.ZodEffects<z.ZodString, string, string>;
    aggregateVersion: z.ZodNumber;
    actor: z.ZodUnion<[z.ZodObject<{
        kind: z.ZodLiteral<"CEO">;
    }, "strip", z.ZodTypeAny, {
        kind: "CEO";
    }, {
        kind: "CEO";
    }>, z.ZodObject<{
        kind: z.ZodLiteral<"AGENT">;
        sessionId: z.ZodEffects<z.ZodEffects<z.ZodString, string, string>, string & {
            readonly __brand: "AgentSessionId";
        }, string>;
    }, "strip", z.ZodTypeAny, {
        kind: "AGENT";
        sessionId: string & {
            readonly __brand: "AgentSessionId";
        };
    }, {
        kind: "AGENT";
        sessionId: string;
    }>, z.ZodObject<{
        kind: z.ZodLiteral<"SYSTEM">;
        name: z.ZodEffects<z.ZodString, string, string>;
    }, "strip", z.ZodTypeAny, {
        kind: "SYSTEM";
        name: string;
    }, {
        kind: "SYSTEM";
        name: string;
    }>]>;
    correlationId: z.ZodEffects<z.ZodEffects<z.ZodString, string, string>, string & {
        readonly __brand: "CorrelationId";
    }, string>;
    causationId: z.ZodEffects<z.ZodEffects<z.ZodString, string, string>, string & {
        readonly __brand: "EventId";
    }, string>;
    occurredAt: z.ZodDate;
}, "strip", z.ZodTypeAny, {
    correlationId: string & {
        readonly __brand: "CorrelationId";
    };
    causationId: string & {
        readonly __brand: "EventId";
    };
    eventType: "AGENT_SESSION_CREATED";
    payload: {
        sessionId: string & {
            readonly __brand: "AgentSessionId";
        };
        taskId: string & {
            readonly __brand: "TaskId";
        };
        agentDefinitionId: string & {
            readonly __brand: "AgentDefinitionId";
        };
    };
    eventId: string & {
        readonly __brand: "EventId";
    };
    aggregateType: string;
    aggregateId: string;
    aggregateVersion: number;
    actor: {
        kind: "CEO";
    } | {
        kind: "AGENT";
        sessionId: string & {
            readonly __brand: "AgentSessionId";
        };
    } | {
        kind: "SYSTEM";
        name: string;
    };
    occurredAt: Date;
}, {
    correlationId: string;
    causationId: string;
    eventType: "AGENT_SESSION_CREATED";
    payload: {
        sessionId: string;
        taskId: string;
        agentDefinitionId: string;
    };
    eventId: string;
    aggregateType: string;
    aggregateId: string;
    aggregateVersion: number;
    actor: {
        kind: "CEO";
    } | {
        kind: "AGENT";
        sessionId: string;
    } | {
        kind: "SYSTEM";
        name: string;
    };
    occurredAt: Date;
}>, z.ZodObject<{
    eventType: z.ZodLiteral<"AGENT_SESSION_STARTED">;
    payload: z.ZodObject<{
        sessionId: z.ZodEffects<z.ZodEffects<z.ZodString, string, string>, string & {
            readonly __brand: "AgentSessionId";
        }, string>;
        taskId: z.ZodOptional<z.ZodEffects<z.ZodEffects<z.ZodString, string, string>, string & {
            readonly __brand: "TaskId";
        }, string>>;
    }, "strip", z.ZodTypeAny, {
        sessionId: string & {
            readonly __brand: "AgentSessionId";
        };
        taskId?: (string & {
            readonly __brand: "TaskId";
        }) | undefined;
    }, {
        sessionId: string;
        taskId?: string | undefined;
    }>;
    eventId: z.ZodEffects<z.ZodEffects<z.ZodString, string, string>, string & {
        readonly __brand: "EventId";
    }, string>;
    aggregateType: z.ZodEffects<z.ZodString, string, string>;
    aggregateId: z.ZodEffects<z.ZodString, string, string>;
    aggregateVersion: z.ZodNumber;
    actor: z.ZodUnion<[z.ZodObject<{
        kind: z.ZodLiteral<"CEO">;
    }, "strip", z.ZodTypeAny, {
        kind: "CEO";
    }, {
        kind: "CEO";
    }>, z.ZodObject<{
        kind: z.ZodLiteral<"AGENT">;
        sessionId: z.ZodEffects<z.ZodEffects<z.ZodString, string, string>, string & {
            readonly __brand: "AgentSessionId";
        }, string>;
    }, "strip", z.ZodTypeAny, {
        kind: "AGENT";
        sessionId: string & {
            readonly __brand: "AgentSessionId";
        };
    }, {
        kind: "AGENT";
        sessionId: string;
    }>, z.ZodObject<{
        kind: z.ZodLiteral<"SYSTEM">;
        name: z.ZodEffects<z.ZodString, string, string>;
    }, "strip", z.ZodTypeAny, {
        kind: "SYSTEM";
        name: string;
    }, {
        kind: "SYSTEM";
        name: string;
    }>]>;
    correlationId: z.ZodEffects<z.ZodEffects<z.ZodString, string, string>, string & {
        readonly __brand: "CorrelationId";
    }, string>;
    causationId: z.ZodEffects<z.ZodEffects<z.ZodString, string, string>, string & {
        readonly __brand: "EventId";
    }, string>;
    occurredAt: z.ZodDate;
}, "strip", z.ZodTypeAny, {
    correlationId: string & {
        readonly __brand: "CorrelationId";
    };
    causationId: string & {
        readonly __brand: "EventId";
    };
    eventType: "AGENT_SESSION_STARTED";
    payload: {
        sessionId: string & {
            readonly __brand: "AgentSessionId";
        };
        taskId?: (string & {
            readonly __brand: "TaskId";
        }) | undefined;
    };
    eventId: string & {
        readonly __brand: "EventId";
    };
    aggregateType: string;
    aggregateId: string;
    aggregateVersion: number;
    actor: {
        kind: "CEO";
    } | {
        kind: "AGENT";
        sessionId: string & {
            readonly __brand: "AgentSessionId";
        };
    } | {
        kind: "SYSTEM";
        name: string;
    };
    occurredAt: Date;
}, {
    correlationId: string;
    causationId: string;
    eventType: "AGENT_SESSION_STARTED";
    payload: {
        sessionId: string;
        taskId?: string | undefined;
    };
    eventId: string;
    aggregateType: string;
    aggregateId: string;
    aggregateVersion: number;
    actor: {
        kind: "CEO";
    } | {
        kind: "AGENT";
        sessionId: string;
    } | {
        kind: "SYSTEM";
        name: string;
    };
    occurredAt: Date;
}>, z.ZodObject<{
    eventType: z.ZodLiteral<"AGENT_SESSION_PAUSED">;
    payload: z.ZodObject<{
        sessionId: z.ZodEffects<z.ZodEffects<z.ZodString, string, string>, string & {
            readonly __brand: "AgentSessionId";
        }, string>;
        reason: z.ZodEffects<z.ZodString, string, string>;
    }, "strip", z.ZodTypeAny, {
        sessionId: string & {
            readonly __brand: "AgentSessionId";
        };
        reason: string;
    }, {
        sessionId: string;
        reason: string;
    }>;
    eventId: z.ZodEffects<z.ZodEffects<z.ZodString, string, string>, string & {
        readonly __brand: "EventId";
    }, string>;
    aggregateType: z.ZodEffects<z.ZodString, string, string>;
    aggregateId: z.ZodEffects<z.ZodString, string, string>;
    aggregateVersion: z.ZodNumber;
    actor: z.ZodUnion<[z.ZodObject<{
        kind: z.ZodLiteral<"CEO">;
    }, "strip", z.ZodTypeAny, {
        kind: "CEO";
    }, {
        kind: "CEO";
    }>, z.ZodObject<{
        kind: z.ZodLiteral<"AGENT">;
        sessionId: z.ZodEffects<z.ZodEffects<z.ZodString, string, string>, string & {
            readonly __brand: "AgentSessionId";
        }, string>;
    }, "strip", z.ZodTypeAny, {
        kind: "AGENT";
        sessionId: string & {
            readonly __brand: "AgentSessionId";
        };
    }, {
        kind: "AGENT";
        sessionId: string;
    }>, z.ZodObject<{
        kind: z.ZodLiteral<"SYSTEM">;
        name: z.ZodEffects<z.ZodString, string, string>;
    }, "strip", z.ZodTypeAny, {
        kind: "SYSTEM";
        name: string;
    }, {
        kind: "SYSTEM";
        name: string;
    }>]>;
    correlationId: z.ZodEffects<z.ZodEffects<z.ZodString, string, string>, string & {
        readonly __brand: "CorrelationId";
    }, string>;
    causationId: z.ZodEffects<z.ZodEffects<z.ZodString, string, string>, string & {
        readonly __brand: "EventId";
    }, string>;
    occurredAt: z.ZodDate;
}, "strip", z.ZodTypeAny, {
    correlationId: string & {
        readonly __brand: "CorrelationId";
    };
    causationId: string & {
        readonly __brand: "EventId";
    };
    eventType: "AGENT_SESSION_PAUSED";
    payload: {
        sessionId: string & {
            readonly __brand: "AgentSessionId";
        };
        reason: string;
    };
    eventId: string & {
        readonly __brand: "EventId";
    };
    aggregateType: string;
    aggregateId: string;
    aggregateVersion: number;
    actor: {
        kind: "CEO";
    } | {
        kind: "AGENT";
        sessionId: string & {
            readonly __brand: "AgentSessionId";
        };
    } | {
        kind: "SYSTEM";
        name: string;
    };
    occurredAt: Date;
}, {
    correlationId: string;
    causationId: string;
    eventType: "AGENT_SESSION_PAUSED";
    payload: {
        sessionId: string;
        reason: string;
    };
    eventId: string;
    aggregateType: string;
    aggregateId: string;
    aggregateVersion: number;
    actor: {
        kind: "CEO";
    } | {
        kind: "AGENT";
        sessionId: string;
    } | {
        kind: "SYSTEM";
        name: string;
    };
    occurredAt: Date;
}>, z.ZodObject<{
    eventType: z.ZodLiteral<"AGENT_SESSION_RESUMED">;
    payload: z.ZodObject<{
        sessionId: z.ZodEffects<z.ZodEffects<z.ZodString, string, string>, string & {
            readonly __brand: "AgentSessionId";
        }, string>;
    }, "strip", z.ZodTypeAny, {
        sessionId: string & {
            readonly __brand: "AgentSessionId";
        };
    }, {
        sessionId: string;
    }>;
    eventId: z.ZodEffects<z.ZodEffects<z.ZodString, string, string>, string & {
        readonly __brand: "EventId";
    }, string>;
    aggregateType: z.ZodEffects<z.ZodString, string, string>;
    aggregateId: z.ZodEffects<z.ZodString, string, string>;
    aggregateVersion: z.ZodNumber;
    actor: z.ZodUnion<[z.ZodObject<{
        kind: z.ZodLiteral<"CEO">;
    }, "strip", z.ZodTypeAny, {
        kind: "CEO";
    }, {
        kind: "CEO";
    }>, z.ZodObject<{
        kind: z.ZodLiteral<"AGENT">;
        sessionId: z.ZodEffects<z.ZodEffects<z.ZodString, string, string>, string & {
            readonly __brand: "AgentSessionId";
        }, string>;
    }, "strip", z.ZodTypeAny, {
        kind: "AGENT";
        sessionId: string & {
            readonly __brand: "AgentSessionId";
        };
    }, {
        kind: "AGENT";
        sessionId: string;
    }>, z.ZodObject<{
        kind: z.ZodLiteral<"SYSTEM">;
        name: z.ZodEffects<z.ZodString, string, string>;
    }, "strip", z.ZodTypeAny, {
        kind: "SYSTEM";
        name: string;
    }, {
        kind: "SYSTEM";
        name: string;
    }>]>;
    correlationId: z.ZodEffects<z.ZodEffects<z.ZodString, string, string>, string & {
        readonly __brand: "CorrelationId";
    }, string>;
    causationId: z.ZodEffects<z.ZodEffects<z.ZodString, string, string>, string & {
        readonly __brand: "EventId";
    }, string>;
    occurredAt: z.ZodDate;
}, "strip", z.ZodTypeAny, {
    correlationId: string & {
        readonly __brand: "CorrelationId";
    };
    causationId: string & {
        readonly __brand: "EventId";
    };
    eventType: "AGENT_SESSION_RESUMED";
    payload: {
        sessionId: string & {
            readonly __brand: "AgentSessionId";
        };
    };
    eventId: string & {
        readonly __brand: "EventId";
    };
    aggregateType: string;
    aggregateId: string;
    aggregateVersion: number;
    actor: {
        kind: "CEO";
    } | {
        kind: "AGENT";
        sessionId: string & {
            readonly __brand: "AgentSessionId";
        };
    } | {
        kind: "SYSTEM";
        name: string;
    };
    occurredAt: Date;
}, {
    correlationId: string;
    causationId: string;
    eventType: "AGENT_SESSION_RESUMED";
    payload: {
        sessionId: string;
    };
    eventId: string;
    aggregateType: string;
    aggregateId: string;
    aggregateVersion: number;
    actor: {
        kind: "CEO";
    } | {
        kind: "AGENT";
        sessionId: string;
    } | {
        kind: "SYSTEM";
        name: string;
    };
    occurredAt: Date;
}>, z.ZodObject<{
    eventType: z.ZodLiteral<"AGENT_SESSION_COMPLETED">;
    payload: z.ZodObject<{
        sessionId: z.ZodEffects<z.ZodEffects<z.ZodString, string, string>, string & {
            readonly __brand: "AgentSessionId";
        }, string>;
    }, "strip", z.ZodTypeAny, {
        sessionId: string & {
            readonly __brand: "AgentSessionId";
        };
    }, {
        sessionId: string;
    }>;
    eventId: z.ZodEffects<z.ZodEffects<z.ZodString, string, string>, string & {
        readonly __brand: "EventId";
    }, string>;
    aggregateType: z.ZodEffects<z.ZodString, string, string>;
    aggregateId: z.ZodEffects<z.ZodString, string, string>;
    aggregateVersion: z.ZodNumber;
    actor: z.ZodUnion<[z.ZodObject<{
        kind: z.ZodLiteral<"CEO">;
    }, "strip", z.ZodTypeAny, {
        kind: "CEO";
    }, {
        kind: "CEO";
    }>, z.ZodObject<{
        kind: z.ZodLiteral<"AGENT">;
        sessionId: z.ZodEffects<z.ZodEffects<z.ZodString, string, string>, string & {
            readonly __brand: "AgentSessionId";
        }, string>;
    }, "strip", z.ZodTypeAny, {
        kind: "AGENT";
        sessionId: string & {
            readonly __brand: "AgentSessionId";
        };
    }, {
        kind: "AGENT";
        sessionId: string;
    }>, z.ZodObject<{
        kind: z.ZodLiteral<"SYSTEM">;
        name: z.ZodEffects<z.ZodString, string, string>;
    }, "strip", z.ZodTypeAny, {
        kind: "SYSTEM";
        name: string;
    }, {
        kind: "SYSTEM";
        name: string;
    }>]>;
    correlationId: z.ZodEffects<z.ZodEffects<z.ZodString, string, string>, string & {
        readonly __brand: "CorrelationId";
    }, string>;
    causationId: z.ZodEffects<z.ZodEffects<z.ZodString, string, string>, string & {
        readonly __brand: "EventId";
    }, string>;
    occurredAt: z.ZodDate;
}, "strip", z.ZodTypeAny, {
    correlationId: string & {
        readonly __brand: "CorrelationId";
    };
    causationId: string & {
        readonly __brand: "EventId";
    };
    eventType: "AGENT_SESSION_COMPLETED";
    payload: {
        sessionId: string & {
            readonly __brand: "AgentSessionId";
        };
    };
    eventId: string & {
        readonly __brand: "EventId";
    };
    aggregateType: string;
    aggregateId: string;
    aggregateVersion: number;
    actor: {
        kind: "CEO";
    } | {
        kind: "AGENT";
        sessionId: string & {
            readonly __brand: "AgentSessionId";
        };
    } | {
        kind: "SYSTEM";
        name: string;
    };
    occurredAt: Date;
}, {
    correlationId: string;
    causationId: string;
    eventType: "AGENT_SESSION_COMPLETED";
    payload: {
        sessionId: string;
    };
    eventId: string;
    aggregateType: string;
    aggregateId: string;
    aggregateVersion: number;
    actor: {
        kind: "CEO";
    } | {
        kind: "AGENT";
        sessionId: string;
    } | {
        kind: "SYSTEM";
        name: string;
    };
    occurredAt: Date;
}>, z.ZodObject<{
    eventType: z.ZodLiteral<"AGENT_SESSION_FAILED">;
    payload: z.ZodObject<{
        sessionId: z.ZodEffects<z.ZodEffects<z.ZodString, string, string>, string & {
            readonly __brand: "AgentSessionId";
        }, string>;
        failureFingerprint: z.ZodEffects<z.ZodString, string, string>;
    }, "strip", z.ZodTypeAny, {
        sessionId: string & {
            readonly __brand: "AgentSessionId";
        };
        failureFingerprint: string;
    }, {
        sessionId: string;
        failureFingerprint: string;
    }>;
    eventId: z.ZodEffects<z.ZodEffects<z.ZodString, string, string>, string & {
        readonly __brand: "EventId";
    }, string>;
    aggregateType: z.ZodEffects<z.ZodString, string, string>;
    aggregateId: z.ZodEffects<z.ZodString, string, string>;
    aggregateVersion: z.ZodNumber;
    actor: z.ZodUnion<[z.ZodObject<{
        kind: z.ZodLiteral<"CEO">;
    }, "strip", z.ZodTypeAny, {
        kind: "CEO";
    }, {
        kind: "CEO";
    }>, z.ZodObject<{
        kind: z.ZodLiteral<"AGENT">;
        sessionId: z.ZodEffects<z.ZodEffects<z.ZodString, string, string>, string & {
            readonly __brand: "AgentSessionId";
        }, string>;
    }, "strip", z.ZodTypeAny, {
        kind: "AGENT";
        sessionId: string & {
            readonly __brand: "AgentSessionId";
        };
    }, {
        kind: "AGENT";
        sessionId: string;
    }>, z.ZodObject<{
        kind: z.ZodLiteral<"SYSTEM">;
        name: z.ZodEffects<z.ZodString, string, string>;
    }, "strip", z.ZodTypeAny, {
        kind: "SYSTEM";
        name: string;
    }, {
        kind: "SYSTEM";
        name: string;
    }>]>;
    correlationId: z.ZodEffects<z.ZodEffects<z.ZodString, string, string>, string & {
        readonly __brand: "CorrelationId";
    }, string>;
    causationId: z.ZodEffects<z.ZodEffects<z.ZodString, string, string>, string & {
        readonly __brand: "EventId";
    }, string>;
    occurredAt: z.ZodDate;
}, "strip", z.ZodTypeAny, {
    correlationId: string & {
        readonly __brand: "CorrelationId";
    };
    causationId: string & {
        readonly __brand: "EventId";
    };
    eventType: "AGENT_SESSION_FAILED";
    payload: {
        sessionId: string & {
            readonly __brand: "AgentSessionId";
        };
        failureFingerprint: string;
    };
    eventId: string & {
        readonly __brand: "EventId";
    };
    aggregateType: string;
    aggregateId: string;
    aggregateVersion: number;
    actor: {
        kind: "CEO";
    } | {
        kind: "AGENT";
        sessionId: string & {
            readonly __brand: "AgentSessionId";
        };
    } | {
        kind: "SYSTEM";
        name: string;
    };
    occurredAt: Date;
}, {
    correlationId: string;
    causationId: string;
    eventType: "AGENT_SESSION_FAILED";
    payload: {
        sessionId: string;
        failureFingerprint: string;
    };
    eventId: string;
    aggregateType: string;
    aggregateId: string;
    aggregateVersion: number;
    actor: {
        kind: "CEO";
    } | {
        kind: "AGENT";
        sessionId: string;
    } | {
        kind: "SYSTEM";
        name: string;
    };
    occurredAt: Date;
}>, z.ZodObject<{
    eventType: z.ZodLiteral<"AGENT_SESSION_CANCELLED">;
    payload: z.ZodObject<{
        sessionId: z.ZodEffects<z.ZodEffects<z.ZodString, string, string>, string & {
            readonly __brand: "AgentSessionId";
        }, string>;
        reason: z.ZodEffects<z.ZodString, string, string>;
    }, "strip", z.ZodTypeAny, {
        sessionId: string & {
            readonly __brand: "AgentSessionId";
        };
        reason: string;
    }, {
        sessionId: string;
        reason: string;
    }>;
    eventId: z.ZodEffects<z.ZodEffects<z.ZodString, string, string>, string & {
        readonly __brand: "EventId";
    }, string>;
    aggregateType: z.ZodEffects<z.ZodString, string, string>;
    aggregateId: z.ZodEffects<z.ZodString, string, string>;
    aggregateVersion: z.ZodNumber;
    actor: z.ZodUnion<[z.ZodObject<{
        kind: z.ZodLiteral<"CEO">;
    }, "strip", z.ZodTypeAny, {
        kind: "CEO";
    }, {
        kind: "CEO";
    }>, z.ZodObject<{
        kind: z.ZodLiteral<"AGENT">;
        sessionId: z.ZodEffects<z.ZodEffects<z.ZodString, string, string>, string & {
            readonly __brand: "AgentSessionId";
        }, string>;
    }, "strip", z.ZodTypeAny, {
        kind: "AGENT";
        sessionId: string & {
            readonly __brand: "AgentSessionId";
        };
    }, {
        kind: "AGENT";
        sessionId: string;
    }>, z.ZodObject<{
        kind: z.ZodLiteral<"SYSTEM">;
        name: z.ZodEffects<z.ZodString, string, string>;
    }, "strip", z.ZodTypeAny, {
        kind: "SYSTEM";
        name: string;
    }, {
        kind: "SYSTEM";
        name: string;
    }>]>;
    correlationId: z.ZodEffects<z.ZodEffects<z.ZodString, string, string>, string & {
        readonly __brand: "CorrelationId";
    }, string>;
    causationId: z.ZodEffects<z.ZodEffects<z.ZodString, string, string>, string & {
        readonly __brand: "EventId";
    }, string>;
    occurredAt: z.ZodDate;
}, "strip", z.ZodTypeAny, {
    correlationId: string & {
        readonly __brand: "CorrelationId";
    };
    causationId: string & {
        readonly __brand: "EventId";
    };
    eventType: "AGENT_SESSION_CANCELLED";
    payload: {
        sessionId: string & {
            readonly __brand: "AgentSessionId";
        };
        reason: string;
    };
    eventId: string & {
        readonly __brand: "EventId";
    };
    aggregateType: string;
    aggregateId: string;
    aggregateVersion: number;
    actor: {
        kind: "CEO";
    } | {
        kind: "AGENT";
        sessionId: string & {
            readonly __brand: "AgentSessionId";
        };
    } | {
        kind: "SYSTEM";
        name: string;
    };
    occurredAt: Date;
}, {
    correlationId: string;
    causationId: string;
    eventType: "AGENT_SESSION_CANCELLED";
    payload: {
        sessionId: string;
        reason: string;
    };
    eventId: string;
    aggregateType: string;
    aggregateId: string;
    aggregateVersion: number;
    actor: {
        kind: "CEO";
    } | {
        kind: "AGENT";
        sessionId: string;
    } | {
        kind: "SYSTEM";
        name: string;
    };
    occurredAt: Date;
}>, z.ZodObject<{
    eventType: z.ZodLiteral<"APPROVAL_APPROVED">;
    payload: z.ZodObject<{
        approvalId: z.ZodEffects<z.ZodEffects<z.ZodString, string, string>, string & {
            readonly __brand: "ApprovalId";
        }, string>;
        decisionReason: z.ZodOptional<z.ZodEffects<z.ZodString, string, string>>;
        decidedAt: z.ZodOptional<z.ZodDate>;
    }, "strip", z.ZodTypeAny, {
        approvalId: string & {
            readonly __brand: "ApprovalId";
        };
        decisionReason?: string | undefined;
        decidedAt?: Date | undefined;
    }, {
        approvalId: string;
        decisionReason?: string | undefined;
        decidedAt?: Date | undefined;
    }>;
    eventId: z.ZodEffects<z.ZodEffects<z.ZodString, string, string>, string & {
        readonly __brand: "EventId";
    }, string>;
    aggregateType: z.ZodEffects<z.ZodString, string, string>;
    aggregateId: z.ZodEffects<z.ZodString, string, string>;
    aggregateVersion: z.ZodNumber;
    actor: z.ZodUnion<[z.ZodObject<{
        kind: z.ZodLiteral<"CEO">;
    }, "strip", z.ZodTypeAny, {
        kind: "CEO";
    }, {
        kind: "CEO";
    }>, z.ZodObject<{
        kind: z.ZodLiteral<"AGENT">;
        sessionId: z.ZodEffects<z.ZodEffects<z.ZodString, string, string>, string & {
            readonly __brand: "AgentSessionId";
        }, string>;
    }, "strip", z.ZodTypeAny, {
        kind: "AGENT";
        sessionId: string & {
            readonly __brand: "AgentSessionId";
        };
    }, {
        kind: "AGENT";
        sessionId: string;
    }>, z.ZodObject<{
        kind: z.ZodLiteral<"SYSTEM">;
        name: z.ZodEffects<z.ZodString, string, string>;
    }, "strip", z.ZodTypeAny, {
        kind: "SYSTEM";
        name: string;
    }, {
        kind: "SYSTEM";
        name: string;
    }>]>;
    correlationId: z.ZodEffects<z.ZodEffects<z.ZodString, string, string>, string & {
        readonly __brand: "CorrelationId";
    }, string>;
    causationId: z.ZodEffects<z.ZodEffects<z.ZodString, string, string>, string & {
        readonly __brand: "EventId";
    }, string>;
    occurredAt: z.ZodDate;
}, "strip", z.ZodTypeAny, {
    correlationId: string & {
        readonly __brand: "CorrelationId";
    };
    causationId: string & {
        readonly __brand: "EventId";
    };
    eventType: "APPROVAL_APPROVED";
    payload: {
        approvalId: string & {
            readonly __brand: "ApprovalId";
        };
        decisionReason?: string | undefined;
        decidedAt?: Date | undefined;
    };
    eventId: string & {
        readonly __brand: "EventId";
    };
    aggregateType: string;
    aggregateId: string;
    aggregateVersion: number;
    actor: {
        kind: "CEO";
    } | {
        kind: "AGENT";
        sessionId: string & {
            readonly __brand: "AgentSessionId";
        };
    } | {
        kind: "SYSTEM";
        name: string;
    };
    occurredAt: Date;
}, {
    correlationId: string;
    causationId: string;
    eventType: "APPROVAL_APPROVED";
    payload: {
        approvalId: string;
        decisionReason?: string | undefined;
        decidedAt?: Date | undefined;
    };
    eventId: string;
    aggregateType: string;
    aggregateId: string;
    aggregateVersion: number;
    actor: {
        kind: "CEO";
    } | {
        kind: "AGENT";
        sessionId: string;
    } | {
        kind: "SYSTEM";
        name: string;
    };
    occurredAt: Date;
}>, z.ZodObject<{
    eventType: z.ZodLiteral<"APPROVAL_REJECTED">;
    payload: z.ZodObject<{
        approvalId: z.ZodEffects<z.ZodEffects<z.ZodString, string, string>, string & {
            readonly __brand: "ApprovalId";
        }, string>;
        reason: z.ZodEffects<z.ZodString, string, string>;
        decisionReason: z.ZodOptional<z.ZodEffects<z.ZodString, string, string>>;
    }, "strip", z.ZodTypeAny, {
        approvalId: string & {
            readonly __brand: "ApprovalId";
        };
        reason: string;
        decisionReason?: string | undefined;
    }, {
        approvalId: string;
        reason: string;
        decisionReason?: string | undefined;
    }>;
    eventId: z.ZodEffects<z.ZodEffects<z.ZodString, string, string>, string & {
        readonly __brand: "EventId";
    }, string>;
    aggregateType: z.ZodEffects<z.ZodString, string, string>;
    aggregateId: z.ZodEffects<z.ZodString, string, string>;
    aggregateVersion: z.ZodNumber;
    actor: z.ZodUnion<[z.ZodObject<{
        kind: z.ZodLiteral<"CEO">;
    }, "strip", z.ZodTypeAny, {
        kind: "CEO";
    }, {
        kind: "CEO";
    }>, z.ZodObject<{
        kind: z.ZodLiteral<"AGENT">;
        sessionId: z.ZodEffects<z.ZodEffects<z.ZodString, string, string>, string & {
            readonly __brand: "AgentSessionId";
        }, string>;
    }, "strip", z.ZodTypeAny, {
        kind: "AGENT";
        sessionId: string & {
            readonly __brand: "AgentSessionId";
        };
    }, {
        kind: "AGENT";
        sessionId: string;
    }>, z.ZodObject<{
        kind: z.ZodLiteral<"SYSTEM">;
        name: z.ZodEffects<z.ZodString, string, string>;
    }, "strip", z.ZodTypeAny, {
        kind: "SYSTEM";
        name: string;
    }, {
        kind: "SYSTEM";
        name: string;
    }>]>;
    correlationId: z.ZodEffects<z.ZodEffects<z.ZodString, string, string>, string & {
        readonly __brand: "CorrelationId";
    }, string>;
    causationId: z.ZodEffects<z.ZodEffects<z.ZodString, string, string>, string & {
        readonly __brand: "EventId";
    }, string>;
    occurredAt: z.ZodDate;
}, "strip", z.ZodTypeAny, {
    correlationId: string & {
        readonly __brand: "CorrelationId";
    };
    causationId: string & {
        readonly __brand: "EventId";
    };
    eventType: "APPROVAL_REJECTED";
    payload: {
        approvalId: string & {
            readonly __brand: "ApprovalId";
        };
        reason: string;
        decisionReason?: string | undefined;
    };
    eventId: string & {
        readonly __brand: "EventId";
    };
    aggregateType: string;
    aggregateId: string;
    aggregateVersion: number;
    actor: {
        kind: "CEO";
    } | {
        kind: "AGENT";
        sessionId: string & {
            readonly __brand: "AgentSessionId";
        };
    } | {
        kind: "SYSTEM";
        name: string;
    };
    occurredAt: Date;
}, {
    correlationId: string;
    causationId: string;
    eventType: "APPROVAL_REJECTED";
    payload: {
        approvalId: string;
        reason: string;
        decisionReason?: string | undefined;
    };
    eventId: string;
    aggregateType: string;
    aggregateId: string;
    aggregateVersion: number;
    actor: {
        kind: "CEO";
    } | {
        kind: "AGENT";
        sessionId: string;
    } | {
        kind: "SYSTEM";
        name: string;
    };
    occurredAt: Date;
}>]>;
export type DomainEvent = z.infer<typeof DomainEventSchema>;
export declare const CommandTypeSchema: z.ZodEnum<["START_AGENT_SESSION", "START_RECOVERY", "REQUEST_APPROVAL", "DEPLOY"]>;
export type CommandType = z.infer<typeof CommandTypeSchema>;
export declare const StartAgentSessionPayloadSchema: z.ZodObject<{
    taskId: z.ZodEffects<z.ZodEffects<z.ZodString, string, string>, string & {
        readonly __brand: "TaskId";
    }, string>;
    workflowId: z.ZodEffects<z.ZodEffects<z.ZodString, string, string>, string & {
        readonly __brand: "WorkflowId";
    }, string>;
    agentDefinitionId: z.ZodEffects<z.ZodEffects<z.ZodString, string, string>, string & {
        readonly __brand: "AgentDefinitionId";
    }, string>;
    leaseId: z.ZodEffects<z.ZodString, string, string>;
    idempotencyKey: z.ZodEffects<z.ZodEffects<z.ZodString, string, string>, string & {
        readonly __brand: "AgentSessionId";
    }, string>;
    attempt: z.ZodOptional<z.ZodNumber>;
    completedOperationKeys: z.ZodOptional<z.ZodArray<z.ZodEffects<z.ZodString, string, string>, "many">>;
}, "strip", z.ZodTypeAny, {
    workflowId: string & {
        readonly __brand: "WorkflowId";
    };
    taskId: string & {
        readonly __brand: "TaskId";
    };
    agentDefinitionId: string & {
        readonly __brand: "AgentDefinitionId";
    };
    leaseId: string;
    idempotencyKey: string & {
        readonly __brand: "AgentSessionId";
    };
    attempt?: number | undefined;
    completedOperationKeys?: string[] | undefined;
}, {
    workflowId: string;
    taskId: string;
    agentDefinitionId: string;
    leaseId: string;
    idempotencyKey: string;
    attempt?: number | undefined;
    completedOperationKeys?: string[] | undefined;
}>;
export declare const StartRecoveryPayloadSchema: z.ZodObject<{
    taskId: z.ZodEffects<z.ZodEffects<z.ZodString, string, string>, string & {
        readonly __brand: "TaskId";
    }, string>;
    recoveryId: z.ZodEffects<z.ZodString, string, string>;
}, "strip", z.ZodTypeAny, {
    taskId: string & {
        readonly __brand: "TaskId";
    };
    recoveryId: string;
}, {
    taskId: string;
    recoveryId: string;
}>;
export declare const RequestApprovalPayloadSchema: z.ZodObject<{
    subjectType: z.ZodEnum<["CAPABILITY", "DEPLOYMENT", "RECOVERY_ESCALATION"]>;
    subjectId: z.ZodEffects<z.ZodString, string, string>;
    reason: z.ZodEffects<z.ZodString, string, string>;
}, "strip", z.ZodTypeAny, {
    subjectType: "CAPABILITY" | "DEPLOYMENT" | "RECOVERY_ESCALATION";
    subjectId: string;
    reason: string;
}, {
    subjectType: "CAPABILITY" | "DEPLOYMENT" | "RECOVERY_ESCALATION";
    subjectId: string;
    reason: string;
}>;
export declare const DeployPayloadSchema: z.ZodObject<{
    taskId: z.ZodEffects<z.ZodEffects<z.ZodString, string, string>, string & {
        readonly __brand: "TaskId";
    }, string>;
    approvalId: z.ZodEffects<z.ZodEffects<z.ZodString, string, string>, string & {
        readonly __brand: "ApprovalId";
    }, string>;
    attemptId: z.ZodEffects<z.ZodString, string, string>;
}, "strip", z.ZodTypeAny, {
    taskId: string & {
        readonly __brand: "TaskId";
    };
    approvalId: string & {
        readonly __brand: "ApprovalId";
    };
    attemptId: string;
}, {
    taskId: string;
    approvalId: string;
    attemptId: string;
}>;
export declare const OutboxCommandSchema: z.ZodDiscriminatedUnion<"type", [z.ZodObject<{
    type: z.ZodLiteral<"START_AGENT_SESSION">;
    payload: z.ZodObject<{
        taskId: z.ZodEffects<z.ZodEffects<z.ZodString, string, string>, string & {
            readonly __brand: "TaskId";
        }, string>;
        workflowId: z.ZodEffects<z.ZodEffects<z.ZodString, string, string>, string & {
            readonly __brand: "WorkflowId";
        }, string>;
        agentDefinitionId: z.ZodEffects<z.ZodEffects<z.ZodString, string, string>, string & {
            readonly __brand: "AgentDefinitionId";
        }, string>;
        leaseId: z.ZodEffects<z.ZodString, string, string>;
        idempotencyKey: z.ZodEffects<z.ZodEffects<z.ZodString, string, string>, string & {
            readonly __brand: "AgentSessionId";
        }, string>;
        attempt: z.ZodOptional<z.ZodNumber>;
        completedOperationKeys: z.ZodOptional<z.ZodArray<z.ZodEffects<z.ZodString, string, string>, "many">>;
    }, "strip", z.ZodTypeAny, {
        workflowId: string & {
            readonly __brand: "WorkflowId";
        };
        taskId: string & {
            readonly __brand: "TaskId";
        };
        agentDefinitionId: string & {
            readonly __brand: "AgentDefinitionId";
        };
        leaseId: string;
        idempotencyKey: string & {
            readonly __brand: "AgentSessionId";
        };
        attempt?: number | undefined;
        completedOperationKeys?: string[] | undefined;
    }, {
        workflowId: string;
        taskId: string;
        agentDefinitionId: string;
        leaseId: string;
        idempotencyKey: string;
        attempt?: number | undefined;
        completedOperationKeys?: string[] | undefined;
    }>;
    commandId: z.ZodEffects<z.ZodString, string, string>;
    actor: z.ZodUnion<[z.ZodObject<{
        kind: z.ZodLiteral<"CEO">;
    }, "strip", z.ZodTypeAny, {
        kind: "CEO";
    }, {
        kind: "CEO";
    }>, z.ZodObject<{
        kind: z.ZodLiteral<"AGENT">;
        sessionId: z.ZodEffects<z.ZodEffects<z.ZodString, string, string>, string & {
            readonly __brand: "AgentSessionId";
        }, string>;
    }, "strip", z.ZodTypeAny, {
        kind: "AGENT";
        sessionId: string & {
            readonly __brand: "AgentSessionId";
        };
    }, {
        kind: "AGENT";
        sessionId: string;
    }>, z.ZodObject<{
        kind: z.ZodLiteral<"SYSTEM">;
        name: z.ZodEffects<z.ZodString, string, string>;
    }, "strip", z.ZodTypeAny, {
        kind: "SYSTEM";
        name: string;
    }, {
        kind: "SYSTEM";
        name: string;
    }>]>;
    issuedAt: z.ZodDate;
    availableAt: z.ZodDate;
    correlationId: z.ZodEffects<z.ZodEffects<z.ZodString, string, string>, string & {
        readonly __brand: "CorrelationId";
    }, string>;
    causationId: z.ZodEffects<z.ZodEffects<z.ZodString, string, string>, string & {
        readonly __brand: "EventId";
    }, string>;
    claimedBy: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    claimedAt: z.ZodOptional<z.ZodNullable<z.ZodDate>>;
    completedAt: z.ZodOptional<z.ZodNullable<z.ZodDate>>;
}, "strip", z.ZodTypeAny, {
    type: "START_AGENT_SESSION";
    correlationId: string & {
        readonly __brand: "CorrelationId";
    };
    causationId: string & {
        readonly __brand: "EventId";
    };
    payload: {
        workflowId: string & {
            readonly __brand: "WorkflowId";
        };
        taskId: string & {
            readonly __brand: "TaskId";
        };
        agentDefinitionId: string & {
            readonly __brand: "AgentDefinitionId";
        };
        leaseId: string;
        idempotencyKey: string & {
            readonly __brand: "AgentSessionId";
        };
        attempt?: number | undefined;
        completedOperationKeys?: string[] | undefined;
    };
    actor: {
        kind: "CEO";
    } | {
        kind: "AGENT";
        sessionId: string & {
            readonly __brand: "AgentSessionId";
        };
    } | {
        kind: "SYSTEM";
        name: string;
    };
    commandId: string;
    issuedAt: Date;
    availableAt: Date;
    claimedBy?: string | null | undefined;
    claimedAt?: Date | null | undefined;
    completedAt?: Date | null | undefined;
}, {
    type: "START_AGENT_SESSION";
    correlationId: string;
    causationId: string;
    payload: {
        workflowId: string;
        taskId: string;
        agentDefinitionId: string;
        leaseId: string;
        idempotencyKey: string;
        attempt?: number | undefined;
        completedOperationKeys?: string[] | undefined;
    };
    actor: {
        kind: "CEO";
    } | {
        kind: "AGENT";
        sessionId: string;
    } | {
        kind: "SYSTEM";
        name: string;
    };
    commandId: string;
    issuedAt: Date;
    availableAt: Date;
    claimedBy?: string | null | undefined;
    claimedAt?: Date | null | undefined;
    completedAt?: Date | null | undefined;
}>, z.ZodObject<{
    type: z.ZodLiteral<"START_RECOVERY">;
    payload: z.ZodObject<{
        taskId: z.ZodEffects<z.ZodEffects<z.ZodString, string, string>, string & {
            readonly __brand: "TaskId";
        }, string>;
        recoveryId: z.ZodEffects<z.ZodString, string, string>;
    }, "strip", z.ZodTypeAny, {
        taskId: string & {
            readonly __brand: "TaskId";
        };
        recoveryId: string;
    }, {
        taskId: string;
        recoveryId: string;
    }>;
    commandId: z.ZodEffects<z.ZodString, string, string>;
    actor: z.ZodUnion<[z.ZodObject<{
        kind: z.ZodLiteral<"CEO">;
    }, "strip", z.ZodTypeAny, {
        kind: "CEO";
    }, {
        kind: "CEO";
    }>, z.ZodObject<{
        kind: z.ZodLiteral<"AGENT">;
        sessionId: z.ZodEffects<z.ZodEffects<z.ZodString, string, string>, string & {
            readonly __brand: "AgentSessionId";
        }, string>;
    }, "strip", z.ZodTypeAny, {
        kind: "AGENT";
        sessionId: string & {
            readonly __brand: "AgentSessionId";
        };
    }, {
        kind: "AGENT";
        sessionId: string;
    }>, z.ZodObject<{
        kind: z.ZodLiteral<"SYSTEM">;
        name: z.ZodEffects<z.ZodString, string, string>;
    }, "strip", z.ZodTypeAny, {
        kind: "SYSTEM";
        name: string;
    }, {
        kind: "SYSTEM";
        name: string;
    }>]>;
    issuedAt: z.ZodDate;
    availableAt: z.ZodDate;
    correlationId: z.ZodEffects<z.ZodEffects<z.ZodString, string, string>, string & {
        readonly __brand: "CorrelationId";
    }, string>;
    causationId: z.ZodEffects<z.ZodEffects<z.ZodString, string, string>, string & {
        readonly __brand: "EventId";
    }, string>;
    claimedBy: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    claimedAt: z.ZodOptional<z.ZodNullable<z.ZodDate>>;
    completedAt: z.ZodOptional<z.ZodNullable<z.ZodDate>>;
}, "strip", z.ZodTypeAny, {
    type: "START_RECOVERY";
    correlationId: string & {
        readonly __brand: "CorrelationId";
    };
    causationId: string & {
        readonly __brand: "EventId";
    };
    payload: {
        taskId: string & {
            readonly __brand: "TaskId";
        };
        recoveryId: string;
    };
    actor: {
        kind: "CEO";
    } | {
        kind: "AGENT";
        sessionId: string & {
            readonly __brand: "AgentSessionId";
        };
    } | {
        kind: "SYSTEM";
        name: string;
    };
    commandId: string;
    issuedAt: Date;
    availableAt: Date;
    claimedBy?: string | null | undefined;
    claimedAt?: Date | null | undefined;
    completedAt?: Date | null | undefined;
}, {
    type: "START_RECOVERY";
    correlationId: string;
    causationId: string;
    payload: {
        taskId: string;
        recoveryId: string;
    };
    actor: {
        kind: "CEO";
    } | {
        kind: "AGENT";
        sessionId: string;
    } | {
        kind: "SYSTEM";
        name: string;
    };
    commandId: string;
    issuedAt: Date;
    availableAt: Date;
    claimedBy?: string | null | undefined;
    claimedAt?: Date | null | undefined;
    completedAt?: Date | null | undefined;
}>, z.ZodObject<{
    type: z.ZodLiteral<"REQUEST_APPROVAL">;
    payload: z.ZodObject<{
        subjectType: z.ZodEnum<["CAPABILITY", "DEPLOYMENT", "RECOVERY_ESCALATION"]>;
        subjectId: z.ZodEffects<z.ZodString, string, string>;
        reason: z.ZodEffects<z.ZodString, string, string>;
    }, "strip", z.ZodTypeAny, {
        subjectType: "CAPABILITY" | "DEPLOYMENT" | "RECOVERY_ESCALATION";
        subjectId: string;
        reason: string;
    }, {
        subjectType: "CAPABILITY" | "DEPLOYMENT" | "RECOVERY_ESCALATION";
        subjectId: string;
        reason: string;
    }>;
    commandId: z.ZodEffects<z.ZodString, string, string>;
    actor: z.ZodUnion<[z.ZodObject<{
        kind: z.ZodLiteral<"CEO">;
    }, "strip", z.ZodTypeAny, {
        kind: "CEO";
    }, {
        kind: "CEO";
    }>, z.ZodObject<{
        kind: z.ZodLiteral<"AGENT">;
        sessionId: z.ZodEffects<z.ZodEffects<z.ZodString, string, string>, string & {
            readonly __brand: "AgentSessionId";
        }, string>;
    }, "strip", z.ZodTypeAny, {
        kind: "AGENT";
        sessionId: string & {
            readonly __brand: "AgentSessionId";
        };
    }, {
        kind: "AGENT";
        sessionId: string;
    }>, z.ZodObject<{
        kind: z.ZodLiteral<"SYSTEM">;
        name: z.ZodEffects<z.ZodString, string, string>;
    }, "strip", z.ZodTypeAny, {
        kind: "SYSTEM";
        name: string;
    }, {
        kind: "SYSTEM";
        name: string;
    }>]>;
    issuedAt: z.ZodDate;
    availableAt: z.ZodDate;
    correlationId: z.ZodEffects<z.ZodEffects<z.ZodString, string, string>, string & {
        readonly __brand: "CorrelationId";
    }, string>;
    causationId: z.ZodEffects<z.ZodEffects<z.ZodString, string, string>, string & {
        readonly __brand: "EventId";
    }, string>;
    claimedBy: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    claimedAt: z.ZodOptional<z.ZodNullable<z.ZodDate>>;
    completedAt: z.ZodOptional<z.ZodNullable<z.ZodDate>>;
}, "strip", z.ZodTypeAny, {
    type: "REQUEST_APPROVAL";
    correlationId: string & {
        readonly __brand: "CorrelationId";
    };
    causationId: string & {
        readonly __brand: "EventId";
    };
    payload: {
        subjectType: "CAPABILITY" | "DEPLOYMENT" | "RECOVERY_ESCALATION";
        subjectId: string;
        reason: string;
    };
    actor: {
        kind: "CEO";
    } | {
        kind: "AGENT";
        sessionId: string & {
            readonly __brand: "AgentSessionId";
        };
    } | {
        kind: "SYSTEM";
        name: string;
    };
    commandId: string;
    issuedAt: Date;
    availableAt: Date;
    claimedBy?: string | null | undefined;
    claimedAt?: Date | null | undefined;
    completedAt?: Date | null | undefined;
}, {
    type: "REQUEST_APPROVAL";
    correlationId: string;
    causationId: string;
    payload: {
        subjectType: "CAPABILITY" | "DEPLOYMENT" | "RECOVERY_ESCALATION";
        subjectId: string;
        reason: string;
    };
    actor: {
        kind: "CEO";
    } | {
        kind: "AGENT";
        sessionId: string;
    } | {
        kind: "SYSTEM";
        name: string;
    };
    commandId: string;
    issuedAt: Date;
    availableAt: Date;
    claimedBy?: string | null | undefined;
    claimedAt?: Date | null | undefined;
    completedAt?: Date | null | undefined;
}>, z.ZodObject<{
    type: z.ZodLiteral<"DEPLOY">;
    payload: z.ZodObject<{
        taskId: z.ZodEffects<z.ZodEffects<z.ZodString, string, string>, string & {
            readonly __brand: "TaskId";
        }, string>;
        approvalId: z.ZodEffects<z.ZodEffects<z.ZodString, string, string>, string & {
            readonly __brand: "ApprovalId";
        }, string>;
        attemptId: z.ZodEffects<z.ZodString, string, string>;
    }, "strip", z.ZodTypeAny, {
        taskId: string & {
            readonly __brand: "TaskId";
        };
        approvalId: string & {
            readonly __brand: "ApprovalId";
        };
        attemptId: string;
    }, {
        taskId: string;
        approvalId: string;
        attemptId: string;
    }>;
    commandId: z.ZodEffects<z.ZodString, string, string>;
    actor: z.ZodUnion<[z.ZodObject<{
        kind: z.ZodLiteral<"CEO">;
    }, "strip", z.ZodTypeAny, {
        kind: "CEO";
    }, {
        kind: "CEO";
    }>, z.ZodObject<{
        kind: z.ZodLiteral<"AGENT">;
        sessionId: z.ZodEffects<z.ZodEffects<z.ZodString, string, string>, string & {
            readonly __brand: "AgentSessionId";
        }, string>;
    }, "strip", z.ZodTypeAny, {
        kind: "AGENT";
        sessionId: string & {
            readonly __brand: "AgentSessionId";
        };
    }, {
        kind: "AGENT";
        sessionId: string;
    }>, z.ZodObject<{
        kind: z.ZodLiteral<"SYSTEM">;
        name: z.ZodEffects<z.ZodString, string, string>;
    }, "strip", z.ZodTypeAny, {
        kind: "SYSTEM";
        name: string;
    }, {
        kind: "SYSTEM";
        name: string;
    }>]>;
    issuedAt: z.ZodDate;
    availableAt: z.ZodDate;
    correlationId: z.ZodEffects<z.ZodEffects<z.ZodString, string, string>, string & {
        readonly __brand: "CorrelationId";
    }, string>;
    causationId: z.ZodEffects<z.ZodEffects<z.ZodString, string, string>, string & {
        readonly __brand: "EventId";
    }, string>;
    claimedBy: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    claimedAt: z.ZodOptional<z.ZodNullable<z.ZodDate>>;
    completedAt: z.ZodOptional<z.ZodNullable<z.ZodDate>>;
}, "strip", z.ZodTypeAny, {
    type: "DEPLOY";
    correlationId: string & {
        readonly __brand: "CorrelationId";
    };
    causationId: string & {
        readonly __brand: "EventId";
    };
    payload: {
        taskId: string & {
            readonly __brand: "TaskId";
        };
        approvalId: string & {
            readonly __brand: "ApprovalId";
        };
        attemptId: string;
    };
    actor: {
        kind: "CEO";
    } | {
        kind: "AGENT";
        sessionId: string & {
            readonly __brand: "AgentSessionId";
        };
    } | {
        kind: "SYSTEM";
        name: string;
    };
    commandId: string;
    issuedAt: Date;
    availableAt: Date;
    claimedBy?: string | null | undefined;
    claimedAt?: Date | null | undefined;
    completedAt?: Date | null | undefined;
}, {
    type: "DEPLOY";
    correlationId: string;
    causationId: string;
    payload: {
        taskId: string;
        approvalId: string;
        attemptId: string;
    };
    actor: {
        kind: "CEO";
    } | {
        kind: "AGENT";
        sessionId: string;
    } | {
        kind: "SYSTEM";
        name: string;
    };
    commandId: string;
    issuedAt: Date;
    availableAt: Date;
    claimedBy?: string | null | undefined;
    claimedAt?: Date | null | undefined;
    completedAt?: Date | null | undefined;
}>]>;
export type OutboxCommand = z.infer<typeof OutboxCommandSchema>;
export type EventActor = ActorRef;
export type EventCausationId = EventId;
//# sourceMappingURL=events.d.ts.map