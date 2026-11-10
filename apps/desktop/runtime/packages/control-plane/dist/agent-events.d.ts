export type AgentEventSource = 'claude' | 'codex' | 'generic';
export type AgentEventStatus = 'RUNNING' | 'READY' | 'OFFLINE';
export interface AgentEvent {
    source: AgentEventSource;
    event: string;
    sessionId: string;
    cwd?: string;
    status: AgentEventStatus;
    agentId: string;
}
export declare const normalizeAgentEvent: (input: Record<string, unknown>) => AgentEvent;
export declare const eventMessage: (event: AgentEvent) => string;
//# sourceMappingURL=agent-events.d.ts.map