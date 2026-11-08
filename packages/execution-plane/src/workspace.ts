import { createHash } from 'node:crypto';
import { mkdir, readFile, readdir, realpath, rename, rm, stat, writeFile } from 'node:fs/promises';
import { dirname, join, relative } from 'node:path';
import { assertValidProjectId, resolveWorkspacePath } from './path-policy.js';
import type { SnapshotFile, SnapshotStore, WorkspaceDescriptor, WorkspaceSnapshot } from './types.js';

const clone = <T>(value: T): T => structuredClone(value);

const hashFile = async (path: string): Promise<{ size: number; sha256: string }> => {
  const bytes = await readFile(path);
  return { size: bytes.byteLength, sha256: createHash('sha256').update(bytes).digest('hex') };
};

const filesUnder = async (root: string, current = root): Promise<string[]> => {
  const entries = await readdir(current, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const path = join(current, entry.name);
    if (entry.isDirectory()) files.push(...await filesUnder(root, path));
    else if (entry.isFile()) files.push(path);
  }
  return files;
};

export class FilesystemWorkspace {
  public constructor(private readonly basePath: string) {}

  public projectRoot(projectId: string): string {
    return resolveWorkspacePath(this.basePath, assertValidProjectId(projectId));
  }

  public async create(descriptor: Omit<WorkspaceDescriptor, 'rootPath'>): Promise<WorkspaceDescriptor> {
    const projectId = assertValidProjectId(descriptor.projectId);
    const rootPath = this.projectRoot(projectId);
    await mkdir(rootPath, { recursive: true });
    return { ...descriptor, projectId, rootPath };
  }

  public resolve(descriptor: WorkspaceDescriptor, requestedPath = '.'): string {
    return resolveWorkspacePath(descriptor.rootPath, requestedPath);
  }

  public async assertSafe(descriptor: WorkspaceDescriptor, requestedPath = '.'): Promise<string> {
    const candidate = this.resolve(descriptor, requestedPath);
    const root = await realpath(descriptor.rootPath);
    let existing = candidate;
    while (true) {
      try { await stat(existing); break; }
      catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT' || existing === dirname(existing)) throw error;
        existing = dirname(existing);
      }
    }
    const resolvedExisting = await realpath(existing);
    const relativeExisting = relative(root, resolvedExisting);
    if (relativeExisting.startsWith('..') || relativeExisting.includes(':')) throw new Error('Workspace path follows a symlink outside project root');
    return candidate;
  }

  public async read(descriptor: WorkspaceDescriptor, requestedPath: string, maxBytes: number): Promise<Buffer> {
    const path = await this.assertSafe(descriptor, requestedPath);
    const metadata = await stat(path);
    if (metadata.size > maxBytes) throw new Error(`File exceeds ${maxBytes} byte quota`);
    return readFile(path);
  }

  public async write(descriptor: WorkspaceDescriptor, requestedPath: string, content: Uint8Array, maxBytes: number): Promise<void> {
    if (content.byteLength > maxBytes) throw new Error(`File exceeds ${maxBytes} byte quota`);
    const path = this.resolve(descriptor, requestedPath);
    const parent = resolveWorkspacePath(descriptor.rootPath, requestedPath.split(/[\\/]/).slice(0, -1).join('/') || '.');
    await mkdir(parent, { recursive: true });
    await this.assertSafe(descriptor, requestedPath);
    const temporary = `${path}.tmp-${process.pid}-${Date.now()}`;
    await writeFile(temporary, content, { flag: 'wx' });
    await rename(temporary, path);
  }
}

export class FilesystemSnapshotStore implements SnapshotStore {
  public constructor(private readonly workspace: FilesystemWorkspace, private readonly snapshotBasePath: string) {}

  public async create(projectId: string): Promise<WorkspaceSnapshot> {
    const safeProjectId = assertValidProjectId(projectId);
    const descriptor = await this.workspace.create({ projectId: safeProjectId, canonicalSource: 'INTERNAL' });
    const snapshotId = `snapshot-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    const target = resolveWorkspacePath(this.snapshotBasePath, `${safeProjectId}/${snapshotId}`);
    await mkdir(target, { recursive: true });
    const files: SnapshotFile[] = [];
    for (const path of await filesUnder(descriptor.rootPath)) {
      const relativePath = relative(descriptor.rootPath, path);
      const destination = resolveWorkspacePath(target, relativePath);
      await mkdir(resolveWorkspacePath(target, relativePath.split(/[\\/]/).slice(0, -1).join('/') || '.'), { recursive: true });
      const metadata = await hashFile(path);
      await writeFile(destination, await readFile(path), { flag: 'wx' });
      files.push({ relativePath, ...metadata });
    }
    return { snapshotId, projectId: safeProjectId, createdAt: new Date(), files };
  }

  public async restore(projectId: string, snapshotId: string): Promise<void> {
    const safeProjectId = assertValidProjectId(projectId);
    const source = resolveWorkspacePath(this.snapshotBasePath, `${safeProjectId}/${snapshotId}`);
    const descriptor = await this.workspace.create({ projectId: safeProjectId, canonicalSource: 'INTERNAL' });
    const staging = resolveWorkspacePath(dirname(this.workspace.projectRoot(safeProjectId)), `.restore-${safeProjectId}-${Date.now()}`);
    await rm(staging, { recursive: true, force: true });
    await mkdir(staging, { recursive: true });
    for (const path of await filesUnder(source)) {
      const relativePath = relative(source, path);
      const destination = resolveWorkspacePath(staging, relativePath);
      await mkdir(resolveWorkspacePath(staging, relativePath.split(/[\\/]/).slice(0, -1).join('/') || '.'), { recursive: true });
      await writeFile(destination, await readFile(path), { flag: 'wx' });
    }
    const backup = resolveWorkspacePath(dirname(descriptor.rootPath), `.backup-${safeProjectId}-${Date.now()}`);
    await rm(backup, { recursive: true, force: true });
    await rename(descriptor.rootPath, backup);
    try { await rename(staging, descriptor.rootPath); }
    catch (error) { await rename(backup, descriptor.rootPath); throw error; }
    await rm(backup, { recursive: true, force: true });
  }

  public async list(projectId: string): Promise<WorkspaceSnapshot[]> {
    const safeProjectId = assertValidProjectId(projectId);
    const root = resolveWorkspacePath(this.snapshotBasePath, safeProjectId);
    try {
      const entries = await readdir(root, { withFileTypes: true });
      const snapshots: WorkspaceSnapshot[] = [];
      for (const entry of entries.filter((item) => item.isDirectory())) {
        const files = await filesUnder(join(root, entry.name));
        snapshots.push({ snapshotId: entry.name, projectId: safeProjectId, createdAt: new Date(0), files: await Promise.all(files.map(async (path) => ({ relativePath: relative(join(root, entry.name), path), ...await hashFile(path) }))) });
      }
      return snapshots.map(clone);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
      throw error;
    }
  }
}
