import type { CommandResult, CommandSpec, ResourceQuota, ToolRunner, WorkspaceDescriptor } from './types.js';
import { FilesystemWorkspace } from './workspace.js';
export declare class ProcessToolRunner implements ToolRunner {
    private readonly workspace;
    private readonly descriptors;
    private readonly quota;
    private readonly allowedCommands;
    private readonly active;
    constructor(workspace: FilesystemWorkspace, descriptors: ReadonlyMap<string, WorkspaceDescriptor>, quota: ResourceQuota, allowedCommands?: ReadonlySet<string>);
    run(projectId: string, spec: CommandSpec): Promise<CommandResult>;
}
export declare class DockerToolRunner implements ToolRunner {
    private readonly workspace;
    private readonly descriptors;
    private readonly quota;
    private readonly image;
    private readonly dockerExecutable;
    private readonly allowedCommands;
    constructor(workspace: FilesystemWorkspace, descriptors: ReadonlyMap<string, WorkspaceDescriptor>, quota: ResourceQuota, image?: string, dockerExecutable?: string, allowedCommands?: ReadonlySet<string>);
    run(projectId: string, spec: CommandSpec): Promise<CommandResult>;
    private runProcess;
}
//# sourceMappingURL=runner.d.ts.map