import type { Mission, MissionStore } from './types.js';
import { type ModelEndpointInput, type ModelEndpointStore, type StoredModelEndpoint } from './model-endpoints.js';
export declare class FileMissionStore implements MissionStore {
    private readonly path;
    constructor(path: string);
    save(mission: Mission, metadata?: {
        idempotencyKey?: string;
        requestFingerprint?: string;
    }): Promise<void>;
    findByIdempotencyKey(idempotencyKey: string): Promise<{
        fingerprint: string;
        mission: Mission;
    } | null>;
    get(missionId: string): Promise<Mission | null>;
    list(projectId: string): Promise<Mission[]>;
}
export declare class FileModelEndpointStore implements ModelEndpointStore {
    private readonly path;
    constructor(path: string);
    list(): Promise<StoredModelEndpoint[]>;
    get(id: string): Promise<StoredModelEndpoint | null>;
    save(input: ModelEndpointInput): Promise<void>;
}
//# sourceMappingURL=file-stores.d.ts.map