import { type ActorRef, type TaskId } from '@aicompany/contracts';
export type ChannelScope = {
    kind: 'task';
    taskId: TaskId;
} | {
    kind: 'project';
    projectId: string;
};
export interface ChannelAuthorization {
    authorizeRead(actor: ActorRef, scope: ChannelScope): Promise<void>;
    authorizeWrite(actor: ActorRef, scope: ChannelScope): Promise<void>;
}
export interface TaskChannelAccess {
    taskId: TaskId;
    projectId: string;
    assignee: ActorRef;
    supervisors: readonly ActorRef[];
    invited: readonly ActorRef[];
}
export interface ProjectAssignment {
    projectId: string;
    actor: ActorRef;
}
export interface InMemoryChannelAuthorizationOptions {
    tasks: readonly TaskChannelAccess[];
    projectAssignments: readonly ProjectAssignment[];
    cancelledSessions: readonly string[];
}
export declare class ChannelAuthorizationError extends Error {
    constructor(message: string);
}
export declare class InMemoryChannelAuthorization implements ChannelAuthorization {
    private readonly tasks;
    private readonly projectAssignments;
    private readonly cancelledSessions;
    constructor(options: InMemoryChannelAuthorizationOptions);
    authorizeRead(actor: ActorRef, scope: ChannelScope): Promise<void>;
    authorizeWrite(actor: ActorRef, scope: ChannelScope): Promise<void>;
    private assertActive;
    private assertTaskParticipant;
}
//# sourceMappingURL=channel-policy.d.ts.map