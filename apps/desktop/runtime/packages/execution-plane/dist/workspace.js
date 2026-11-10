import { createHash } from 'node:crypto';
import { mkdir, readFile, readdir, realpath, rename, rm, stat, writeFile } from 'node:fs/promises';
import { dirname, join, relative } from 'node:path';
import { assertValidProjectId, resolveWorkspacePath } from './path-policy.js';
const clone = (value) => structuredClone(value);
const hashFile = async (path) => {
    const bytes = await readFile(path);
    return { size: bytes.byteLength, sha256: createHash('sha256').update(bytes).digest('hex') };
};
const filesUnder = async (root, current = root) => {
    const entries = await readdir(current, { withFileTypes: true });
    const files = [];
    for (const entry of entries) {
        const path = join(current, entry.name);
        if (entry.isDirectory())
            files.push(...await filesUnder(root, path));
        else if (entry.isFile())
            files.push(path);
    }
    return files;
};
export class FilesystemWorkspace {
    basePath;
    constructor(basePath) {
        this.basePath = basePath;
    }
    projectRoot(projectId) {
        return resolveWorkspacePath(this.basePath, assertValidProjectId(projectId));
    }
    async create(descriptor) {
        const projectId = assertValidProjectId(descriptor.projectId);
        const rootPath = this.projectRoot(projectId);
        await mkdir(rootPath, { recursive: true });
        return { ...descriptor, projectId, rootPath };
    }
    resolve(descriptor, requestedPath = '.') {
        return resolveWorkspacePath(descriptor.rootPath, requestedPath);
    }
    async assertSafe(descriptor, requestedPath = '.') {
        const candidate = this.resolve(descriptor, requestedPath);
        const root = await realpath(descriptor.rootPath);
        let existing = candidate;
        while (true) {
            try {
                await stat(existing);
                break;
            }
            catch (error) {
                if (error.code !== 'ENOENT' || existing === dirname(existing))
                    throw error;
                existing = dirname(existing);
            }
        }
        const resolvedExisting = await realpath(existing);
        const relativeExisting = relative(root, resolvedExisting);
        if (relativeExisting.startsWith('..') || relativeExisting.includes(':'))
            throw new Error('Workspace path follows a symlink outside project root');
        return candidate;
    }
    async read(descriptor, requestedPath, maxBytes) {
        const path = await this.assertSafe(descriptor, requestedPath);
        const metadata = await stat(path);
        if (metadata.size > maxBytes)
            throw new Error(`File exceeds ${maxBytes} byte quota`);
        return readFile(path);
    }
    async write(descriptor, requestedPath, content, maxBytes) {
        if (content.byteLength > maxBytes)
            throw new Error(`File exceeds ${maxBytes} byte quota`);
        const path = this.resolve(descriptor, requestedPath);
        const parent = resolveWorkspacePath(descriptor.rootPath, requestedPath.split(/[\\/]/).slice(0, -1).join('/') || '.');
        await mkdir(parent, { recursive: true });
        await this.assertSafe(descriptor, requestedPath);
        const temporary = `${path}.tmp-${process.pid}-${Date.now()}`;
        await writeFile(temporary, content, { flag: 'wx' });
        await rename(temporary, path);
    }
}
export class FilesystemSnapshotStore {
    workspace;
    snapshotBasePath;
    constructor(workspace, snapshotBasePath) {
        this.workspace = workspace;
        this.snapshotBasePath = snapshotBasePath;
    }
    async create(projectId) {
        const safeProjectId = assertValidProjectId(projectId);
        const descriptor = await this.workspace.create({ projectId: safeProjectId, canonicalSource: 'INTERNAL' });
        const snapshotId = `snapshot-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
        const target = resolveWorkspacePath(this.snapshotBasePath, `${safeProjectId}/${snapshotId}`);
        await mkdir(target, { recursive: true });
        const files = [];
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
    async restore(projectId, snapshotId) {
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
        try {
            await rename(staging, descriptor.rootPath);
        }
        catch (error) {
            await rename(backup, descriptor.rootPath);
            throw error;
        }
        await rm(backup, { recursive: true, force: true });
    }
    async list(projectId) {
        const safeProjectId = assertValidProjectId(projectId);
        const root = resolveWorkspacePath(this.snapshotBasePath, safeProjectId);
        try {
            const entries = await readdir(root, { withFileTypes: true });
            const snapshots = [];
            for (const entry of entries.filter((item) => item.isDirectory())) {
                const files = await filesUnder(join(root, entry.name));
                snapshots.push({ snapshotId: entry.name, projectId: safeProjectId, createdAt: new Date(0), files: await Promise.all(files.map(async (path) => ({ relativePath: relative(join(root, entry.name), path), ...await hashFile(path) }))) });
            }
            return snapshots.map(clone);
        }
        catch (error) {
            if (error.code === 'ENOENT')
                return [];
            throw error;
        }
    }
}
//# sourceMappingURL=workspace.js.map