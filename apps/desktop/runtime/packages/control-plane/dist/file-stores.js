import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { TaskSchema } from '../../contracts/dist/index.js';
import { validateModelEndpoint } from './model-endpoints.js';
const clone = (value) => structuredClone(value);
const readJson = async (path, fallback) => {
    try {
        return JSON.parse(await readFile(path, 'utf8'));
    }
    catch (error) {
        if (error.code === 'ENOENT')
            return fallback;
        throw error;
    }
};
const writeJson = async (path, value) => {
    await mkdir(dirname(path), { recursive: true });
    const temporary = `${path}.tmp-${process.pid}`;
    await writeFile(temporary, JSON.stringify(value), 'utf8');
    await rename(temporary, path);
};
const hydrateMission = (mission) => ({
    ...mission,
    createdAt: new Date(mission.createdAt),
    updatedAt: new Date(mission.updatedAt),
    tasks: mission.tasks.map((task) => TaskSchema.parse({ ...task, createdAt: new Date(task.createdAt), updatedAt: new Date(task.updatedAt) }))
});
export class FileMissionStore {
    path;
    constructor(path) {
        this.path = path;
    }
    async save(mission, metadata) {
        const state = await readJson(this.path, { missions: {}, idempotency: {} });
        if (metadata?.idempotencyKey && metadata.requestFingerprint) {
            const prior = state.idempotency[metadata.idempotencyKey];
            if (prior && prior.fingerprint !== metadata.requestFingerprint)
                throw new Error('Mission idempotency key was reused with different input');
            state.idempotency[metadata.idempotencyKey] = { fingerprint: metadata.requestFingerprint, missionId: mission.missionId };
        }
        state.missions[mission.missionId] = clone(mission);
        await writeJson(this.path, state);
    }
    async findByIdempotencyKey(idempotencyKey) {
        const state = await readJson(this.path, { missions: {}, idempotency: {} });
        const entry = state.idempotency[idempotencyKey];
        return entry && state.missions[entry.missionId] ? { fingerprint: entry.fingerprint, mission: hydrateMission(clone(state.missions[entry.missionId])) } : null;
    }
    async get(missionId) {
        const state = await readJson(this.path, { missions: {} });
        return state.missions[missionId] ? hydrateMission(clone(state.missions[missionId])) : null;
    }
    async list(projectId) {
        const state = await readJson(this.path, { missions: {} });
        return Object.values(state.missions).filter((mission) => mission.projectId === projectId).sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()).map((mission) => hydrateMission(clone(mission)));
    }
}
export class FileModelEndpointStore {
    path;
    constructor(path) {
        this.path = path;
    }
    async list() {
        const state = await readJson(this.path, {});
        return Object.values(state).map(clone);
    }
    async get(id) {
        const state = await readJson(this.path, {});
        return state[id] ? clone(state[id]) : null;
    }
    async save(input) {
        const state = await readJson(this.path, {});
        const config = validateModelEndpoint(input);
        const prior = state[config.id];
        const apiKey = input.apiKey?.trim() || prior?.apiKey;
        state[config.id] = apiKey ? { ...config, apiKey } : config;
        await writeJson(this.path, state);
    }
}
//# sourceMappingURL=file-stores.js.map