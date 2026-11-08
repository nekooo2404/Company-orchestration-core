import { describe, expect, it } from 'vitest';
import { CommandDeploymentRunner } from './deployment';
import { LocalGitRepository } from './git-repository';
import type { GitCommandExecutor } from './types';

describe('source and deployment adapters', () => {
  it('rejects unsafe branches and commits only workspace-relative paths', async () => {
    const calls: string[][] = [];
    const executor: GitCommandExecutor = { async run(args) { calls.push([...args]); return { exitCode: 0, signal: null, stdout: args[0] === 'branch' ? 'main\n' : args[0] === 'rev-parse' ? 'abc\n' : '## main\n', stderr: '', durationMs: 1, timedOut: false }; } };
    const repository = new LocalGitRepository('C:/workspace/project', executor);
    await expect(repository.createBranch('../escape')).rejects.toThrow(/unsafe/i);
    await expect(repository.commit('change', ['src/index.ts'])).resolves.toMatchObject({ commitId: 'abc' });
    expect(calls).toContainEqual(['add', '--', 'src/index.ts']);
  });

  it('returns deployment evidence and failed command status', async () => {
    const runner = new CommandDeploymentRunner({ async run() { return { exitCode: 1, signal: null, stdout: 'out', stderr: 'err', durationMs: 2, timedOut: false }; } });
    await expect(runner.deploy({ projectId: 'project-1', approvalId: 'approval-1', attemptId: 'attempt-1', target: 'STAGING', command: { command: 'deploy', args: [] } })).resolves.toMatchObject({ succeeded: false, artifactReference: 'artifact://project-1/attempt-1' });
  });
});
