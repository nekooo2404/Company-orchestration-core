import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
const clone = (value) => structuredClone(value);
const read = async (path) => { try {
    return JSON.parse(await readFile(path, 'utf8'));
}
catch (error) {
    if (error.code === 'ENOENT')
        return {};
    throw error;
} };
const write = async (path, value) => { await mkdir(dirname(path), { recursive: true }); const temporary = `${path}.tmp-${process.pid}`; await writeFile(temporary, JSON.stringify(value), 'utf8'); await rename(temporary, path); };
export class FileAgentProfileStore {
    path;
    constructor(path) {
        this.path = path;
    }
    async list() { return Object.values(await read(this.path)).map(clone); }
    async get(id) { const value = (await read(this.path))[id]; return value ? clone(value) : null; }
    async save(profile) { const state = await read(this.path); state[profile.id] = clone(profile); await write(this.path, state); }
}
export class InMemoryAgentProfileStore extends FileAgentProfileStore {
    profiles = new Map();
    constructor(initial = []) { super(''); for (const profile of initial)
        this.profiles.set(profile.id, clone(profile)); }
    async list() { return [...this.profiles.values()].map(clone); }
    async get(id) { const profile = this.profiles.get(id); return profile ? clone(profile) : null; }
    async save(profile) { this.profiles.set(profile.id, clone(profile)); }
}
//# sourceMappingURL=agent-profiles.js.map