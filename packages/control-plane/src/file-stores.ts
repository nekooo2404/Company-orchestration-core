import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { TaskSchema } from '@aicompany/contracts';
import type { Mission, MissionStore } from './types.js';
import { validateModelEndpoint, type ModelEndpointInput, type ModelEndpointStore, type StoredModelEndpoint } from './model-endpoints.js';

const clone = <T>(value: T): T => structuredClone(value);

const readJson = async <T>(path: string, fallback: T): Promise<T> => {
  try { return JSON.parse(await readFile(path, 'utf8')) as T; }
  catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return fallback; throw error; }
};

const writeJson = async (path: string, value: unknown): Promise<void> => {
  await mkdir(dirname(path), { recursive: true });
  const temporary = `${path}.tmp-${process.pid}`;
  await writeFile(temporary, JSON.stringify(value), 'utf8');
  await rename(temporary, path);
};

const hydrateMission = (mission: Mission): Mission => ({
  ...mission,
  createdAt: new Date(mission.createdAt),
  updatedAt: new Date(mission.updatedAt),
  tasks: mission.tasks.map((task) => TaskSchema.parse({ ...task, createdAt: new Date(task.createdAt), updatedAt: new Date(task.updatedAt) }))
});

export class FileMissionStore implements MissionStore {
  public constructor(private readonly path: string) {}

  public async save(mission: Mission, metadata?: { idempotencyKey?: string; requestFingerprint?: string }): Promise<void> {
    const state = await readJson<{ missions: Record<string, Mission>; idempotency: Record<string, { fingerprint: string; missionId: string }> }>(this.path, { missions: {}, idempotency: {} });
    if (metadata?.idempotencyKey && metadata.requestFingerprint) {
      const prior = state.idempotency[metadata.idempotencyKey];
      if (prior && prior.fingerprint !== metadata.requestFingerprint) throw new Error('Mission idempotency key was reused with different input');
      state.idempotency[metadata.idempotencyKey] = { fingerprint: metadata.requestFingerprint, missionId: mission.missionId };
    }
    state.missions[mission.missionId] = clone(mission);
    await writeJson(this.path, state);
  }

  public async findByIdempotencyKey(idempotencyKey: string): Promise<{ fingerprint: string; mission: Mission } | null> {
    const state = await readJson<{ missions: Record<string, Mission>; idempotency: Record<string, { fingerprint: string; missionId: string }> }>(this.path, { missions: {}, idempotency: {} });
    const entry = state.idempotency[idempotencyKey];
    return entry && state.missions[entry.missionId] ? { fingerprint: entry.fingerprint, mission: hydrateMission(clone(state.missions[entry.missionId])) } : null;
  }

  public async get(missionId: string): Promise<Mission | null> {
    const state = await readJson<{ missions: Record<string, Mission> }>(this.path, { missions: {} });
    return state.missions[missionId] ? hydrateMission(clone(state.missions[missionId])) : null;
  }

  public async list(projectId: string): Promise<Mission[]> {
    const state = await readJson<{ missions: Record<string, Mission> }>(this.path, { missions: {} });
    return Object.values(state.missions).filter((mission) => mission.projectId === projectId).sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()).map((mission) => hydrateMission(clone(mission)));
  }
}

export class FileModelEndpointStore implements ModelEndpointStore {
  public constructor(private readonly path: string) {}

  public async list(): Promise<StoredModelEndpoint[]> {
    const state = await readJson<Record<string, StoredModelEndpoint>>(this.path, {});
    return Object.values(state).map(clone);
  }

  public async get(id: string): Promise<StoredModelEndpoint | null> {
    const state = await readJson<Record<string, StoredModelEndpoint>>(this.path, {});
    return state[id] ? clone(state[id]) : null;
  }

  public async save(input: ModelEndpointInput): Promise<void> {
    const state = await readJson<Record<string, StoredModelEndpoint>>(this.path, {});
    const config = validateModelEndpoint(input);
    const prior = state[config.id];
    const apiKey = input.apiKey?.trim() || prior?.apiKey;
    state[config.id] = apiKey ? { ...config, apiKey } : config;
    await writeJson(this.path, state);
  }
}
