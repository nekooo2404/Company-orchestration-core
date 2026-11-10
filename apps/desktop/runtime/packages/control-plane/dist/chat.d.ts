export interface AgentChatMessage {
    id: string;
    workflowId: string;
    agentId: string;
    role: 'CEO' | 'AGENT' | 'SYSTEM';
    content: string;
    createdAt: string;
}
export interface AgentChatStore {
    list(workflowId: string): Promise<AgentChatMessage[]>;
    append(message: AgentChatMessage): Promise<void>;
}
export declare class FileAgentChatStore implements AgentChatStore {
    private readonly path;
    constructor(path: string);
    list(workflowId: string): Promise<AgentChatMessage[]>;
    append(message: AgentChatMessage): Promise<void>;
}
export declare class InMemoryAgentChatStore implements AgentChatStore {
    private readonly messages;
    list(workflowId: string): Promise<AgentChatMessage[]>;
    append(message: AgentChatMessage): Promise<void>;
}
//# sourceMappingURL=chat.d.ts.map