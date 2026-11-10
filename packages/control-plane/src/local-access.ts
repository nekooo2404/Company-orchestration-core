import { access, mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, join, normalize, resolve } from 'node:path';
import { homedir } from 'node:os';

export interface LocalAccessRoot { id: string; label: string; path: string; exists: boolean; granted: boolean; }
const names = [['claude', '.claude'], ['codex', '.codex'], ['agents', '.agents'], ['claude-config', '.config\\claude']] as const;
const home = homedir();
const safeRoot = (path: string): boolean => { const target = normalize(resolve(path)); return names.some(([, name]) => target.toLowerCase() === normalize(resolve(home, name)).toLowerCase()); };
const exists = async (path: string): Promise<boolean> => { try { await access(path); return true; } catch { return false; } };
const readGranted = async (path: string): Promise<string[]> => { try { return JSON.parse(await readFile(path, 'utf8')) as string[]; } catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return []; throw error; } };
export const listLocalAccessRoots = async (grantFile: string): Promise<LocalAccessRoot[]> => {
  const granted = await readGranted(grantFile);
  return Promise.all(names.map(async ([id, name]) => ({
    id,
    label: name,
    path: join(home, name),
    exists: await exists(join(home, name)),
    granted: granted.includes(id)
  })));
};
export const grantLocalAccessRoot = async (grantFile: string, id: string): Promise<void> => { const item = names.find(([key]) => key === id); if (!item) throw new Error('Access root is not allowlisted'); const current = await readGranted(grantFile); if (!current.includes(id)) current.push(id); await mkdir(dirname(grantFile), { recursive: true }); const temporary = `${grantFile}.tmp-${process.pid}`; await writeFile(temporary, JSON.stringify(current), 'utf8'); await rename(temporary, grantFile); if (!safeRoot(join(home, item[1]))) throw new Error('Access root failed safety validation'); };
