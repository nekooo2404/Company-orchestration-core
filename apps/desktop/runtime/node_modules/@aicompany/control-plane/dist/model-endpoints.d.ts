import type { ModelEndpointConfig } from '@aicompany/model-gateway';
export type ModelEndpointInput = Omit<ModelEndpointConfig, 'id'> & {
    id: string;
    apiKey?: string;
};
export type StoredModelEndpoint = ModelEndpointConfig & {
    apiKey?: string;
};
export interface ModelEndpointStore {
    list(): Promise<ModelEndpointConfig[]>;
    get(id: string): Promise<StoredModelEndpoint | null>;
    save(config: ModelEndpointInput): Promise<void>;
}
export declare const validateModelEndpoint: (input: ModelEndpointInput) => ModelEndpointConfig;
export declare class InMemoryModelEndpointStore implements ModelEndpointStore {
    private readonly endpoints;
    constructor(initial?: readonly ModelEndpointConfig[]);
    list(): Promise<ModelEndpointConfig[]>;
    get(id: string): Promise<StoredModelEndpoint | null>;
    save(input: ModelEndpointInput): Promise<void>;
}
//# sourceMappingURL=model-endpoints.d.ts.map