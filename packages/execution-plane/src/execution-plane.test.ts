import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { eventId, taskId, agentSessionId } from '@aicompany/contracts';
import { FileCheckpointStore } from './checkpoint-store';
import { ProcessToolRunner } from './runner';
import { FilesystemSnapshotStore, FilesystemWorkspace } from './workspace';

const temporaryRoots: string[] = [];
afterEach(async () => { await Promise.all(temporaryRoots.splice(0).map((path) => rm(path, { recursive: true, force: true }))); });

describe('execution plane', () => {
  it('keeps workspace paths inside project root and snapshots/restores files', async () => {
    const root = await mkdtemp(join(tmpdir(), 'aicompany-execution-')); temporaryRoots.push(root);
    const workspace = new FilesystemWorkspace(join(root, 'projects'));
    const descriptor = await workspace.create({ projectId: 'project-1', canonicalSource: 'INTERNAL' });
    await workspace.write(descriptor, 'src/main.ts', Buffer.from('v1'), 100);
    const snapshots = new FilesystemSnapshotStore(workspace, join(root, 'snapshots'));
    const snapshot = await snapshots.create('project-1');
    await workspace.write(descriptor, 'src/main.ts', Buffer.from('v2'), 100);
    await snapshots.restore('project-1', snapshot.snapshotId);
    await expect(workspace.read(descriptor, 'src/main.ts', 100)).resolves.toEqual(Buffer.from('v1'));
    expect(() => workspace.resolve(descriptor, '../outside')).toThrow(/escapes/i);
  });

  it('runs allowlisted commands with bounded output and timeout', async () => {
    const root = await mkdtemp(join(tmpdir(), 'aicompany-runner-')); temporaryRoots.push(root);
    const workspace = new FilesystemWorkspace(join(root, 'projects'));
    const descriptor = await workspace.create({ projectId: 'project-1', canonicalSource: 'INTERNAL' });
    const runner = new ProcessToolRunner(workspace, new Map([[descriptor.projectId, descriptor]]), {
      maxConcurrentProcesses: 1, maxOutputBytes: 100, maxFileBytes: 1000, timeoutMs: 5000, allowNetwork: false
    });
    await expect(runner.run('project-1', { command: process.platform === 'win32' ? 'node' : 'node', args: ['-e', 'console.log("ok")'] })).resolves.toMatchObject({ exitCode: 0, stdout: 'ok\n' });
    await expect(runner.run('project-1', { command: 'curl', args: [] })).rejects.toThrow(/not allowed/i);
  });

  it('persists monotonic checkpoint keys across store instances', async () => {
    const root = await mkdtemp(join(tmpdir(), 'aicompany-checkpoint-')); temporaryRoots.push(root);
    const path = join(root, 'checkpoints.json');
    const first = new FileCheckpointStore(path);
    await first.save({ sessionId: agentSessionId('session-1'), taskId: taskId('task-1'), sequence: 1, state: 'PAUSED', contextReference: 'ctx', lastEventId: eventId('event-1'), completedOperationKeys: ['tool:1'], createdAt: new Date() });
    const second = new FileCheckpointStore(path);
    await second.save({ sessionId: agentSessionId('session-1'), taskId: taskId('task-1'), sequence: 2, state: 'RUNNING', contextReference: 'ctx-2', lastEventId: eventId('event-2'), completedOperationKeys: [], createdAt: new Date() });
    await expect(second.latest(agentSessionId('session-1'))).resolves.toMatchObject({ sequence: 2, completedOperationKeys: ['tool:1'] });
    expect(await readFile(path, 'utf8')).toContain('tool:1');
  });
});
