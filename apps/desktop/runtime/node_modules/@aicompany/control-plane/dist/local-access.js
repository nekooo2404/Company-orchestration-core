import { access, mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, join, normalize, resolve } from 'node:path';
import { homedir } from 'node:os';
const names = [['claude', '.claude'], ['codex', '.codex'], ['agents', '.agents'], ['claude-config', '.config\\claude']];
const home = homedir();
const safeRoot = (path) => { const target = normalize(resolve(path)); return names.some(([, name]) => target.toLowerCase() === normalize(resolve(home, name)).toLowerCase()); };
const exists = async (path) => { try {
    await access(path);
    return true;
}
catch {
    return false;
} };
const readGranted = async (path) => { try {
    return JSON.parse(await readFile(path, 'utf8'));
}
catch (error) {
    if (error.code === 'ENOENT')
        return [];
    throw error;
} };
export const listLocalAccessRoots = async (grantFile) => {
    const granted = await readGranted(grantFile);
    return Promise.all(names.map(async ([id, name]) => ({
        id,
        label: name,
        path: join(home, name),
        exists: await exists(join(home, name)),
        granted: granted.includes(id)
    })));
};
export const grantLocalAccessRoot = async (grantFile, id) => { const item = names.find(([key]) => key === id); if (!item)
    throw new Error('Access root is not allowlisted'); const current = await readGranted(grantFile); if (!current.includes(id))
    current.push(id); await mkdir(dirname(grantFile), { recursive: true }); const temporary = `${grantFile}.tmp-${process.pid}`; await writeFile(temporary, JSON.stringify(current), 'utf8'); await rename(temporary, grantFile); if (!safeRoot(join(home, item[1])))
    throw new Error('Access root failed safety validation'); };
//# sourceMappingURL=local-access.js.map