import type { CommandResult, ToolRunner } from '@aicompany/execution-plane';

export interface GitCommandExecutor {
  run(args: readonly string[], cwd: string): Promise<CommandResult>;
}

export interface GitStatus {
  branch: string;
  changedPaths: string[];
  ahead: number;
  behind: number;
}

export interface CommitResult {
  commitId: string;
  branch: string;
  changedPaths: string[];
}

export interface MergeResult {
  merged: boolean;
  conflictPaths: string[];
  output: string;
}

export interface SourceRepository {
  status(): Promise<GitStatus>;
  createBranch(branch: string): Promise<void>;
  commit(message: string, paths: readonly string[]): Promise<CommitResult>;
  merge(branch: string): Promise<MergeResult>;
}

export interface DeploymentRequest {
  projectId: string;
  approvalId: string;
  attemptId: string;
  target: 'PREVIEW' | 'STAGING' | 'PRODUCTION';
  command: { command: string; args: readonly string[]; cwd?: string; network?: boolean };
}

export interface DeploymentReceipt {
  approvalId: string;
  attemptId: string;
  target: DeploymentRequest['target'];
  succeeded: boolean;
  evidenceIds: string[];
  artifactReference: string;
  startedAt: Date;
  completedAt: Date;
  result: CommandResult;
}

export interface DeploymentRunner {
  deploy(input: DeploymentRequest): Promise<DeploymentReceipt>;
  rollback(input: Omit<DeploymentRequest, 'command'> & { command: DeploymentRequest['command'] }): Promise<DeploymentReceipt>;
}

export type DeploymentToolRunner = Pick<ToolRunner, 'run'>;
