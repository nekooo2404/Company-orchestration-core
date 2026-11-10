import { z } from 'zod';
export declare const ApprovalSubjectTypeSchema: z.ZodEnum<["CAPABILITY", "DEPLOYMENT", "RECOVERY_ESCALATION"]>;
export type ApprovalSubjectType = z.infer<typeof ApprovalSubjectTypeSchema>;
export declare const ApprovalStateSchema: z.ZodEnum<["PENDING", "APPROVED", "REJECTED", "EXPIRED", "CANCELLED"]>;
export type ApprovalState = z.infer<typeof ApprovalStateSchema>;
export declare const ApprovalDecisionSchema: z.ZodEnum<["APPROVE", "REJECT"]>;
export type ApprovalDecision = z.infer<typeof ApprovalDecisionSchema>;
export declare const ApprovalRecordSchema: z.ZodDiscriminatedUnion<"state", [z.ZodObject<{
    state: z.ZodLiteral<"PENDING">;
    decision: z.ZodNull;
    decisionReason: z.ZodNull;
    decidedBy: z.ZodNull;
    decidedAt: z.ZodNull;
    approvalId: z.ZodEffects<z.ZodEffects<z.ZodString, string, string>, string & {
        readonly __brand: "ApprovalId";
    }, string>;
    subjectType: z.ZodEnum<["CAPABILITY", "DEPLOYMENT", "RECOVERY_ESCALATION"]>;
    subjectId: z.ZodEffects<z.ZodString, string, string>;
    reason: z.ZodEffects<z.ZodString, string, string>;
    requestedBy: z.ZodUnion<[z.ZodObject<{
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
    version: z.ZodNumber;
    createdAt: z.ZodDate;
    updatedAt: z.ZodDate;
}, "strip", z.ZodTypeAny, {
    state: "PENDING";
    version: number;
    createdAt: Date;
    updatedAt: Date;
    decision: null;
    decisionReason: null;
    decidedBy: null;
    decidedAt: null;
    approvalId: string & {
        readonly __brand: "ApprovalId";
    };
    subjectType: "CAPABILITY" | "DEPLOYMENT" | "RECOVERY_ESCALATION";
    subjectId: string;
    reason: string;
    requestedBy: {
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
    correlationId: string & {
        readonly __brand: "CorrelationId";
    };
    causationId: string & {
        readonly __brand: "EventId";
    };
}, {
    state: "PENDING";
    version: number;
    createdAt: Date;
    updatedAt: Date;
    decision: null;
    decisionReason: null;
    decidedBy: null;
    decidedAt: null;
    approvalId: string;
    subjectType: "CAPABILITY" | "DEPLOYMENT" | "RECOVERY_ESCALATION";
    subjectId: string;
    reason: string;
    requestedBy: {
        kind: "CEO";
    } | {
        kind: "AGENT";
        sessionId: string;
    } | {
        kind: "SYSTEM";
        name: string;
    };
    correlationId: string;
    causationId: string;
}>, z.ZodObject<{
    state: z.ZodLiteral<"APPROVED">;
    decision: z.ZodLiteral<"APPROVE">;
    decisionReason: z.ZodEffects<z.ZodString, string, string>;
    decidedBy: z.ZodUnion<[z.ZodObject<{
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
    decidedAt: z.ZodDate;
    approvalId: z.ZodEffects<z.ZodEffects<z.ZodString, string, string>, string & {
        readonly __brand: "ApprovalId";
    }, string>;
    subjectType: z.ZodEnum<["CAPABILITY", "DEPLOYMENT", "RECOVERY_ESCALATION"]>;
    subjectId: z.ZodEffects<z.ZodString, string, string>;
    reason: z.ZodEffects<z.ZodString, string, string>;
    requestedBy: z.ZodUnion<[z.ZodObject<{
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
    version: z.ZodNumber;
    createdAt: z.ZodDate;
    updatedAt: z.ZodDate;
}, "strip", z.ZodTypeAny, {
    state: "APPROVED";
    version: number;
    createdAt: Date;
    updatedAt: Date;
    decision: "APPROVE";
    decisionReason: string;
    decidedBy: {
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
    decidedAt: Date;
    approvalId: string & {
        readonly __brand: "ApprovalId";
    };
    subjectType: "CAPABILITY" | "DEPLOYMENT" | "RECOVERY_ESCALATION";
    subjectId: string;
    reason: string;
    requestedBy: {
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
    correlationId: string & {
        readonly __brand: "CorrelationId";
    };
    causationId: string & {
        readonly __brand: "EventId";
    };
}, {
    state: "APPROVED";
    version: number;
    createdAt: Date;
    updatedAt: Date;
    decision: "APPROVE";
    decisionReason: string;
    decidedBy: {
        kind: "CEO";
    } | {
        kind: "AGENT";
        sessionId: string;
    } | {
        kind: "SYSTEM";
        name: string;
    };
    decidedAt: Date;
    approvalId: string;
    subjectType: "CAPABILITY" | "DEPLOYMENT" | "RECOVERY_ESCALATION";
    subjectId: string;
    reason: string;
    requestedBy: {
        kind: "CEO";
    } | {
        kind: "AGENT";
        sessionId: string;
    } | {
        kind: "SYSTEM";
        name: string;
    };
    correlationId: string;
    causationId: string;
}>, z.ZodObject<{
    state: z.ZodLiteral<"REJECTED">;
    decision: z.ZodLiteral<"REJECT">;
    decisionReason: z.ZodEffects<z.ZodString, string, string>;
    decidedBy: z.ZodUnion<[z.ZodObject<{
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
    decidedAt: z.ZodDate;
    approvalId: z.ZodEffects<z.ZodEffects<z.ZodString, string, string>, string & {
        readonly __brand: "ApprovalId";
    }, string>;
    subjectType: z.ZodEnum<["CAPABILITY", "DEPLOYMENT", "RECOVERY_ESCALATION"]>;
    subjectId: z.ZodEffects<z.ZodString, string, string>;
    reason: z.ZodEffects<z.ZodString, string, string>;
    requestedBy: z.ZodUnion<[z.ZodObject<{
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
    version: z.ZodNumber;
    createdAt: z.ZodDate;
    updatedAt: z.ZodDate;
}, "strip", z.ZodTypeAny, {
    state: "REJECTED";
    version: number;
    createdAt: Date;
    updatedAt: Date;
    decision: "REJECT";
    decisionReason: string;
    decidedBy: {
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
    decidedAt: Date;
    approvalId: string & {
        readonly __brand: "ApprovalId";
    };
    subjectType: "CAPABILITY" | "DEPLOYMENT" | "RECOVERY_ESCALATION";
    subjectId: string;
    reason: string;
    requestedBy: {
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
    correlationId: string & {
        readonly __brand: "CorrelationId";
    };
    causationId: string & {
        readonly __brand: "EventId";
    };
}, {
    state: "REJECTED";
    version: number;
    createdAt: Date;
    updatedAt: Date;
    decision: "REJECT";
    decisionReason: string;
    decidedBy: {
        kind: "CEO";
    } | {
        kind: "AGENT";
        sessionId: string;
    } | {
        kind: "SYSTEM";
        name: string;
    };
    decidedAt: Date;
    approvalId: string;
    subjectType: "CAPABILITY" | "DEPLOYMENT" | "RECOVERY_ESCALATION";
    subjectId: string;
    reason: string;
    requestedBy: {
        kind: "CEO";
    } | {
        kind: "AGENT";
        sessionId: string;
    } | {
        kind: "SYSTEM";
        name: string;
    };
    correlationId: string;
    causationId: string;
}>, z.ZodObject<{
    state: z.ZodLiteral<"EXPIRED">;
    decision: z.ZodNull;
    decisionReason: z.ZodNull;
    decidedBy: z.ZodUnion<[z.ZodObject<{
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
    decidedAt: z.ZodDate;
    approvalId: z.ZodEffects<z.ZodEffects<z.ZodString, string, string>, string & {
        readonly __brand: "ApprovalId";
    }, string>;
    subjectType: z.ZodEnum<["CAPABILITY", "DEPLOYMENT", "RECOVERY_ESCALATION"]>;
    subjectId: z.ZodEffects<z.ZodString, string, string>;
    reason: z.ZodEffects<z.ZodString, string, string>;
    requestedBy: z.ZodUnion<[z.ZodObject<{
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
    version: z.ZodNumber;
    createdAt: z.ZodDate;
    updatedAt: z.ZodDate;
}, "strip", z.ZodTypeAny, {
    state: "EXPIRED";
    version: number;
    createdAt: Date;
    updatedAt: Date;
    decision: null;
    decisionReason: null;
    decidedBy: {
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
    decidedAt: Date;
    approvalId: string & {
        readonly __brand: "ApprovalId";
    };
    subjectType: "CAPABILITY" | "DEPLOYMENT" | "RECOVERY_ESCALATION";
    subjectId: string;
    reason: string;
    requestedBy: {
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
    correlationId: string & {
        readonly __brand: "CorrelationId";
    };
    causationId: string & {
        readonly __brand: "EventId";
    };
}, {
    state: "EXPIRED";
    version: number;
    createdAt: Date;
    updatedAt: Date;
    decision: null;
    decisionReason: null;
    decidedBy: {
        kind: "CEO";
    } | {
        kind: "AGENT";
        sessionId: string;
    } | {
        kind: "SYSTEM";
        name: string;
    };
    decidedAt: Date;
    approvalId: string;
    subjectType: "CAPABILITY" | "DEPLOYMENT" | "RECOVERY_ESCALATION";
    subjectId: string;
    reason: string;
    requestedBy: {
        kind: "CEO";
    } | {
        kind: "AGENT";
        sessionId: string;
    } | {
        kind: "SYSTEM";
        name: string;
    };
    correlationId: string;
    causationId: string;
}>, z.ZodObject<{
    state: z.ZodLiteral<"CANCELLED">;
    decision: z.ZodNull;
    decisionReason: z.ZodNull;
    decidedBy: z.ZodUnion<[z.ZodObject<{
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
    decidedAt: z.ZodDate;
    approvalId: z.ZodEffects<z.ZodEffects<z.ZodString, string, string>, string & {
        readonly __brand: "ApprovalId";
    }, string>;
    subjectType: z.ZodEnum<["CAPABILITY", "DEPLOYMENT", "RECOVERY_ESCALATION"]>;
    subjectId: z.ZodEffects<z.ZodString, string, string>;
    reason: z.ZodEffects<z.ZodString, string, string>;
    requestedBy: z.ZodUnion<[z.ZodObject<{
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
    version: z.ZodNumber;
    createdAt: z.ZodDate;
    updatedAt: z.ZodDate;
}, "strip", z.ZodTypeAny, {
    state: "CANCELLED";
    version: number;
    createdAt: Date;
    updatedAt: Date;
    decision: null;
    decisionReason: null;
    decidedBy: {
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
    decidedAt: Date;
    approvalId: string & {
        readonly __brand: "ApprovalId";
    };
    subjectType: "CAPABILITY" | "DEPLOYMENT" | "RECOVERY_ESCALATION";
    subjectId: string;
    reason: string;
    requestedBy: {
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
    correlationId: string & {
        readonly __brand: "CorrelationId";
    };
    causationId: string & {
        readonly __brand: "EventId";
    };
}, {
    state: "CANCELLED";
    version: number;
    createdAt: Date;
    updatedAt: Date;
    decision: null;
    decisionReason: null;
    decidedBy: {
        kind: "CEO";
    } | {
        kind: "AGENT";
        sessionId: string;
    } | {
        kind: "SYSTEM";
        name: string;
    };
    decidedAt: Date;
    approvalId: string;
    subjectType: "CAPABILITY" | "DEPLOYMENT" | "RECOVERY_ESCALATION";
    subjectId: string;
    reason: string;
    requestedBy: {
        kind: "CEO";
    } | {
        kind: "AGENT";
        sessionId: string;
    } | {
        kind: "SYSTEM";
        name: string;
    };
    correlationId: string;
    causationId: string;
}>]>;
export type ApprovalRecord = z.infer<typeof ApprovalRecordSchema>;
//# sourceMappingURL=approval.d.ts.map