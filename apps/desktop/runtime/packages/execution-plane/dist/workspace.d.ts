import type { SnapshotStore, WorkspaceDescriptor, WorkspaceSnapshot } from './types.js';
export declare class FilesystemWorkspace {
    private readonly basePath;
    constructor(basePath: string);
    projectRoot(projectId: string): string;
    create(descriptor: Omit<WorkspaceDescriptor, 'rootPath'>): Promise<WorkspaceDescriptor>;
    resolve(descriptor: WorkspaceDescriptor, requestedPath?: string): string;
    assertSafe(descriptor: WorkspaceDescriptor, requestedPath?: string): Promise<string>;
    read(descriptor: WorkspaceDescriptor, requestedPath: string, maxBytes: number): Promise<Buffer>;
    write(descriptor: WorkspaceDescriptor, requestedPath: string, content: Uint8Array, maxBytes: number): Promise<void>;
}
export declare class FilesystemSnapshotStore implements SnapshotStore {
    private readonly workspace;
    private readonly snapshotBasePath;
    constructor(workspace: FilesystemWorkspace, snapshotBasePath: string);
    create(projectId: string): Promise<WorkspaceSnapshot>;
    restore(projectId: string, snapshotId: string): Promise<void>;
    list(projectId: string): Promise<WorkspaceSnapshot[]>;
}
//# sourceMappingURL=workspace.d.ts.map