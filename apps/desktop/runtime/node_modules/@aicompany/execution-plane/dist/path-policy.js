import { isAbsolute, relative, resolve } from 'node:path';
export const resolveWorkspacePath = (rootPath, requestedPath = '.') => {
    if (isAbsolute(requestedPath))
        throw new Error('Workspace paths must be relative');
    const root = resolve(rootPath);
    const candidate = resolve(root, requestedPath);
    const escaped = relative(root, candidate).startsWith('..') || isAbsolute(relative(root, candidate));
    if (escaped)
        throw new Error('Workspace path escapes project root');
    return candidate;
};
export const assertValidProjectId = (projectId) => {
    const normalized = projectId.trim();
    if (!/^[a-zA-Z0-9._-]+$/.test(normalized))
        throw new Error('Project ID contains unsafe characters');
    return normalized;
};
//# sourceMappingURL=path-policy.js.map