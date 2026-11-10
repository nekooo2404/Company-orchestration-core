export type AgentRole = 'CEO' | 'Dev' | 'QA' | 'Reviewer' | 'Analyst';
export interface AgentProfile {
    id: string;
    name: string;
    role: AgentRole;
    department: string;
    endpointId: string;
    accessRoots: string[];
    terminal: 'READY' | 'RUNNING' | 'OFFLINE';
}
export interface AgentProfileStore {
    list(): Promise<AgentProfile[]>;
    get(id: string): Promise<AgentProfile | null>;
    save(profile: AgentProfile): Promise<void>;
}
export declare class FileAgentProfileStore implements AgentProfileStore {
    private readonly path;
    constructor(path: string);
    list(): Promise<AgentProfile[]>;
    get(id: string): Promise<AgentProfile | null>;
    save(profile: AgentProfile): Promise<void>;
}
export declare class InMemoryAgentProfileStore extends FileAgentProfileStore {
    private readonly profiles;
    constructor(initial?: readonly AgentProfile[]);
    list(): Promise<AgentProfile[]>;
    get(id: string): Promise<AgentProfile | null>;
    save(profile: AgentProfile): Promise<void>;
}
//# sourceMappingURL=agent-profiles.d.ts.map