import type { ModelEndpointConfig } from '@aicompany/model-gateway';

export type ModelEndpointInput = Omit<ModelEndpointConfig, 'id'> & { id: string };

export interface ModelEndpointStore {
  list(): Promise<ModelEndpointConfig[]>;
  get(id: string): Promise<ModelEndpointConfig | null>;
  save(config: ModelEndpointInput): Promise<void>;
}

const clone = <T>(value: T): T => structuredClone(value);

export const validateModelEndpoint = (input: ModelEndpointInput): ModelEndpointConfig => {
  const id = input.id.trim();
  const provider = input.provider.trim();
  const baseUrl = input.baseUrl.trim();
  const model = input.model.trim();
  const credentialRef = input.credentialRef.trim();
  if (!/^[a-zA-Z0-9._-]+$/.test(id)) throw new Error('Endpoint ID contains unsafe characters');
  if (!provider || !baseUrl || !model || !credentialRef) throw new Error('provider, baseUrl, model, and credentialRef are required');
  if (!Number.isInteger(input.timeoutMs) || input.timeoutMs < 1000) throw new Error('timeoutMs must be an integer >= 1000');
  if (!Number.isInteger(input.maxRetries) || input.maxRetries < 0 || input.maxRetries > 10) throw new Error('maxRetries must be between 0 and 10');
  if (!Number.isInteger(input.circuitFailureThreshold) || input.circuitFailureThreshold < 1) throw new Error('circuitFailureThreshold must be positive');
  if (!Number.isInteger(input.circuitResetMs) || input.circuitResetMs < 1000) throw new Error('circuitResetMs must be >= 1000');
  const parsed = new URL(baseUrl);
  const localHttp = parsed.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(parsed.hostname);
  if (parsed.protocol !== 'https:' && !(localHttp && input.allowInsecureLocalHttp)) throw new Error('Model endpoint must use HTTPS or explicitly allow local HTTP');
  if (parsed.username || parsed.password) throw new Error('Model endpoint URL must not contain credentials');
  return clone({ ...input, id, provider, baseUrl, model, credentialRef });
};

export class InMemoryModelEndpointStore implements ModelEndpointStore {
  private readonly endpoints = new Map<string, ModelEndpointConfig>();

  public constructor(initial: readonly ModelEndpointConfig[] = []) {
    for (const config of initial) this.endpoints.set(config.id, validateModelEndpoint(config));
  }

  public async list(): Promise<ModelEndpointConfig[]> { return [...this.endpoints.values()].map(clone); }
  public async get(id: string): Promise<ModelEndpointConfig | null> { const config = this.endpoints.get(id); return config ? clone(config) : null; }
  public async save(input: ModelEndpointInput): Promise<void> { const config = validateModelEndpoint(input); this.endpoints.set(config.id, config); }
}
