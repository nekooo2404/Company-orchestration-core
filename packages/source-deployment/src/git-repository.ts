import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { resolveWorkspacePath } from '@aicompany/execution-plane';
import type { CommandResult } from '@aicompany/execution-plane';
import type { GitCommandExecutor, GitStatus, MergeResult, SourceRepository, CommitResult } from './types.js';

const execFileAsync = promisify(execFile);
const validBranch = (branch: string): boolean => /^[A-Za-z0-9][A-Za-z0-9._/-]*$/.test(branch) && !branch.includes('..') && !branch.endsWith('/') && !branch.endsWith('.');

export class ProcessGitCommandExecutor implements GitCommandExecutor {
  public async run(args: readonly string[], cwd: string): Promise<CommandResult> {
    const startedAt = Date.now();
    try {
      const result = await execFileAsync('git', [...args], { cwd, windowsHide: true, maxBuffer: 2 * 1024 * 1024 });
      return { exitCode: 0, signal: null, stdout: String(result.stdout), stderr: String(result.stderr), durationMs: Date.now() - startedAt, timedOut: false };
    } catch (error) {
      const typed = error as NodeJS.ErrnoException & { code?: number; stdout?: string; stderr?: string; signal?: NodeJS.Signals };
      return { exitCode: typeof typed.code === 'number' ? typed.code : 1, signal: typed.signal ?? null, stdout: typed.stdout ?? '', stderr: typed.stderr ?? typed.message ?? 'git failed', durationMs: Date.now() - startedAt, timedOut: false };
    }
  }
}

export class LocalGitRepository implements SourceRepository {
  public constructor(private readonly rootPath: string, private readonly executor: GitCommandExecutor = new ProcessGitCommandExecutor()) {}

  public async status(): Promise<GitStatus> {
    const branch = await this.run(['branch', '--show-current']);
    const porcelain = await this.run(['status', '--porcelain=v1', '--branch']);
    const lines = porcelain.stdout.split(/\r?\n/).filter(Boolean);
    const header = lines.find((line) => line.startsWith('## ')) ?? '';
    const changedPaths = lines.filter((line: string) => !line.startsWith('## ')).map((line: string) => line.slice(3).split(' -> ').at(-1)!).filter(Boolean);
    const tracking: string[] = header.match(/ahead (\d+)|behind (\d+)/g) ?? [];
    return { branch: branch.stdout.trim(), changedPaths, ahead: Number(tracking.find((part: string) => part.startsWith('ahead'))?.match(/\d+/)?.[0] ?? 0), behind: Number(tracking.find((part: string) => part.startsWith('behind'))?.match(/\d+/)?.[0] ?? 0) };
  }

  public async createBranch(branch: string): Promise<void> {
    if (!validBranch(branch)) throw new Error('Unsafe git branch name');
    await this.run(['switch', '-c', branch]);
  }

  public async commit(message: string, paths: readonly string[]): Promise<CommitResult> {
    if (!message.trim() || paths.length === 0) throw new Error('Commit message and paths are required');
    for (const path of paths) resolveWorkspacePath(this.rootPath, path);
    await this.run(['add', '--', ...paths]);
    await this.run(['commit', '-m', message.trim()]);
    const commitId = (await this.run(['rev-parse', 'HEAD'])).stdout.trim();
    return { commitId, branch: (await this.status()).branch, changedPaths: [...paths] };
  }

  public async merge(branch: string): Promise<MergeResult> {
    if (!validBranch(branch)) throw new Error('Unsafe git branch name');
    const result = await this.run(['merge', '--no-edit', branch], false);
    if (result.exitCode === 0) return { merged: true, conflictPaths: [], output: result.stdout };
    const conflicts = (await this.run(['diff', '--name-only', '--diff-filter=U'], false)).stdout.split(/\r?\n/).filter(Boolean);
    return { merged: false, conflictPaths: conflicts, output: `${result.stdout}\n${result.stderr}`.trim() };
  }

  private async run(args: readonly string[], fail = true): Promise<CommandResult> {
    const result = await this.executor.run(args, this.rootPath);
    if (fail && result.exitCode !== 0) throw new Error(`git ${args.join(' ')} failed: ${result.stderr || result.stdout}`);
    return result;
  }
}
