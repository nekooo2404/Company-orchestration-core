export interface WorkspaceDescriptor {
    projectId: string;
    rootPath: string;
    canonicalSource: 'INTERNAL' | 'GITHUB' | 'GITLAB' | 'HYBRID';
    sourceReference?: string;
}
export interface ResourceQuota {
    maxConcurrentProcesses: number;
    maxOutputBytes: number;
    maxFileBytes: number;
    timeoutMs: number;
    allowNetwork: boolean;
    maxMemoryMb?: number;
    maxCpuCores?: number;
    maxPids?: number;
}
export interface CommandSpec {
    command: string;
    args: readonly string[];
    cwd?: string;
    env?: Readonly<Record<string, string>>;
    network?: boolean;
}
export interface CommandResult {
    exitCode: number | null;
    signal: NodeJS.Signals | null;
    stdout: string;
    stderr: string;
    durationMs: number;
    timedOut: boolean;
}
export interface ToolRunner {
    run(projectId: string, command: CommandSpec): Promise<CommandResult>;
}
export interface SnapshotFile {
    relativePath: string;
    size: number;
    sha256: string;
}
export interface WorkspaceSnapshot {
    snapshotId: string;
    projectId: string;
    createdAt: Date;
    files: SnapshotFile[];
}
export interface SnapshotStore {
    create(projectId: string): Promise<WorkspaceSnapshot>;
    restore(projectId: string, snapshotId: string): Promise<void>;
    list(projectId: string): Promise<WorkspaceSnapshot[]>;
}
//# sourceMappingURL=types.d.ts.map