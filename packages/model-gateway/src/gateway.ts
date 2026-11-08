import { randomUUID } from 'node:crypto';
import { CircuitBreaker, CircuitOpenError } from './circuit-breaker.js';
import type { GatewayAuditRecord, GatewayOptions, HealthResult, ModelEndpointConfig, ModelGateway, ModelRequest, ModelResponse } from './types.js';

interface OpenAIResponse {
  id?: string;
  model?: string;
  choices?: Array<{ message?: { content?: string }; finish_reason?: string | null }>;
  usage?: { prompt_tokens?: number; completion_tokens?: number };
}

const sleepDefault = (milliseconds: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, milliseconds));
const retryable = (status: number): boolean => status === 408 || status === 409 || status === 429 || status >= 500;
const safeHeader = (key: string): boolean => !/authorization|api[-_]?key|token|secret/i.test(key);
const endpointUrl = (config: ModelEndpointConfig): string => {
  let parsed: URL;
  try { parsed = new URL(config.baseUrl); } catch { throw new Error(`Invalid model endpoint URL: ${config.baseUrl}`); }
  const localHttp = parsed.protocol === 'http:' && (parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1');
  if (parsed.protocol !== 'https:' && !(localHttp && config.allowInsecureLocalHttp)) throw new Error('Model endpoint must use HTTPS');
  if (parsed.username || parsed.password) throw new Error('Model endpoint URL must not contain credentials');
  return new URL('chat/completions', `${parsed.toString().replace(/\/$/, '')}/`).toString();
};
const healthUrl = (config: ModelEndpointConfig): string => new URL('models', `${new URL(config.baseUrl).toString().replace(/\/$/, '')}/`).toString();

export class OpenAICompatibleGateway implements ModelGateway {
  private readonly endpointMap: ReadonlyMap<string, ModelEndpointConfig>;
  private readonly circuits = new Map<string, CircuitBreaker>();
  private readonly fetcher: typeof globalThis.fetch;
  private readonly sleep: (milliseconds: number) => Promise<void>;
  private readonly idFactory: () => string;

  public constructor(private readonly options: GatewayOptions) {
    if (options.endpoints.length === 0) throw new Error('At least one model endpoint is required');
    this.endpointMap = new Map(options.endpoints.map((endpoint) => {
      endpointUrl(endpoint);
      if (!endpoint.credentialRef.trim()) throw new Error('Model credentialRef is required');
      if (!Number.isInteger(endpoint.maxRetries) || endpoint.maxRetries < 0) throw new Error('maxRetries must be non-negative');
      return [endpoint.id, endpoint];
    }));
    this.fetcher = options.fetch ?? globalThis.fetch;
    this.sleep = options.sleep ?? sleepDefault;
    this.idFactory = options.idFactory ?? randomUUID;
    for (const endpoint of options.endpoints) this.circuits.set(endpoint.id, new CircuitBreaker(endpoint.id, endpoint.circuitFailureThreshold, endpoint.circuitResetMs));
  }

  public async complete(input: ModelRequest): Promise<ModelResponse> {
    const endpoint = this.endpointMap.get(input.endpointId ?? this.options.endpoints[0].id);
    if (!endpoint) throw new Error(`Unknown model endpoint: ${input.endpointId}`);
    const requestId = this.idFactory();
    const circuit = this.circuits.get(endpoint.id)!;
    const startedAt = Date.now();
    let attempts = 0;
    try {
      circuit.assertClosed();
      const secret = await this.options.secrets.resolve(endpoint.credentialRef);
      if (!secret.trim()) throw new Error('Resolved model credential is empty');
      for (let attempt = 0; attempt <= endpoint.maxRetries; attempt += 1) {
        attempts = attempt + 1;
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), endpoint.timeoutMs);
        try {
          let response: Response;
          try {
            response = await this.fetcher(endpointUrl(endpoint), {
              method: 'POST', signal: controller.signal,
              headers: { 'content-type': 'application/json', authorization: `Bearer ${secret}`, ...this.safeHeaders(endpoint.headers) },
              body: JSON.stringify({ model: endpoint.model, messages: input.messages, ...(input.temperature === undefined ? {} : { temperature: input.temperature }), ...(input.maxTokens === undefined ? {} : { max_tokens: input.maxTokens }) })
            });
          } catch (error) {
            if (attempt < endpoint.maxRetries) { await this.sleep(2 ** attempt * 25); continue; }
            circuit.failure();
            throw error;
          }
          if (!response.ok) {
            const body = await response.text();
            if (retryable(response.status) && attempt < endpoint.maxRetries) { await this.sleep(2 ** attempt * 25); continue; }
            circuit.failure();
            throw new Error(`Model gateway request failed with HTTP ${response.status}: ${body.slice(0, 300)}`);
          }
          const payload = await response.json() as OpenAIResponse;
          const content = payload.choices?.[0]?.message?.content;
          if (typeof content !== 'string') throw new Error('Model response did not contain message content');
          const inputTokens = payload.usage?.prompt_tokens ?? 0;
          const outputTokens = payload.usage?.completion_tokens ?? 0;
          circuit.success();
          const result: ModelResponse = { requestId, endpointId: endpoint.id, provider: endpoint.provider, model: payload.model ?? endpoint.model, content, finishReason: payload.choices?.[0]?.finish_reason ?? null, inputTokens, outputTokens, createdAt: new Date() };
          await this.audit({ requestId, endpointId: endpoint.id, provider: endpoint.provider, model: result.model, status: 'SUCCESS', httpStatus: response.status, attempts, durationMs: Date.now() - startedAt });
          await this.recordUsage(input, endpoint, result);
          return result;
        } finally { clearTimeout(timeout); }
      }
      throw new Error('Model gateway exhausted retry budget');
    } catch (error) {
      const status: GatewayAuditRecord['status'] = error instanceof CircuitOpenError ? 'CIRCUIT_OPEN' : 'ERROR';
      await this.audit({ requestId, endpointId: endpoint.id, provider: endpoint.provider, model: endpoint.model, status, attempts, durationMs: Date.now() - startedAt, errorClass: error instanceof Error ? error.name : 'UnknownError' });
      throw error;
    }
  }

  public async health(endpointId: string): Promise<HealthResult> {
    const endpoint = this.endpointMap.get(endpointId);
    if (!endpoint) throw new Error(`Unknown model endpoint: ${endpointId}`);
    const startedAt = Date.now();
    try {
      const secret = await this.options.secrets.resolve(endpoint.credentialRef);
      const response = await this.fetcher(healthUrl(endpoint), { headers: { authorization: `Bearer ${secret}`, ...this.safeHeaders(endpoint.headers) } });
      return { endpointId, healthy: response.ok, latencyMs: Date.now() - startedAt, status: response.status, ...(response.ok ? {} : { reason: `HTTP ${response.status}` }) };
    } catch (error) {
      return { endpointId, healthy: false, latencyMs: Date.now() - startedAt, reason: error instanceof Error ? error.message : 'Unknown error' };
    }
  }

  private safeHeaders(headers: Readonly<Record<string, string>> | undefined): Record<string, string> {
    return Object.fromEntries(Object.entries(headers ?? {}).filter(([key]) => safeHeader(key)));
  }

  private async audit(record: GatewayAuditRecord): Promise<void> { await this.options.audit?.record(record); }

  private async recordUsage(input: ModelRequest, endpoint: ModelEndpointConfig, result: ModelResponse): Promise<void> {
    if (!this.options.usage) return;
    const estimatedCostUsd = (result.inputTokens / 1_000_000) * (endpoint.inputCostPerMillionTokens ?? 0) + (result.outputTokens / 1_000_000) * (endpoint.outputCostPerMillionTokens ?? 0);
    await this.options.usage.recordUsage({ usageId: `model:${result.requestId}`, workflowId: input.workflowId, taskId: input.taskId, agentSessionId: input.agentSessionId, agentDefinitionId: input.agentDefinitionId, department: input.department, provider: endpoint.provider, baseUrlIdentifier: endpoint.id, model: result.model, inputTokens: result.inputTokens, outputTokens: result.outputTokens, estimatedCostUsd, createdAt: result.createdAt });
  }
}

export { CircuitBreaker, CircuitOpenError } from './circuit-breaker.js';
