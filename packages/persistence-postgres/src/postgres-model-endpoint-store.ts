import { Pool } from 'pg';
import { validateModelEndpoint, type ModelEndpointInput, type ModelEndpointStore } from '@aicompany/control-plane';
import type { ModelEndpointConfig } from '@aicompany/model-gateway';

interface EndpointRow {
  endpoint_id: string;
  provider: string;
  base_url: string;
  model: string;
  credential_ref: string;
  headers: Record<string, string> | null;
  timeout_ms: number;
  max_retries: number;
  circuit_failure_threshold: number;
  circuit_reset_ms: number;
  input_cost_per_million_tokens: number | null;
  output_cost_per_million_tokens: number | null;
  allow_insecure_local_http: boolean;
}

const toConfig = (row: EndpointRow): ModelEndpointConfig => validateModelEndpoint({
  id: row.endpoint_id,
  provider: row.provider,
  baseUrl: row.base_url,
  model: row.model,
  credentialRef: row.credential_ref,
  ...(row.headers === null ? {} : { headers: row.headers }),
  timeoutMs: row.timeout_ms,
  maxRetries: row.max_retries,
  circuitFailureThreshold: row.circuit_failure_threshold,
  circuitResetMs: row.circuit_reset_ms,
  ...(row.input_cost_per_million_tokens === null ? {} : { inputCostPerMillionTokens: row.input_cost_per_million_tokens }),
  ...(row.output_cost_per_million_tokens === null ? {} : { outputCostPerMillionTokens: row.output_cost_per_million_tokens }),
  allowInsecureLocalHttp: row.allow_insecure_local_http
});

const select = `SELECT endpoint_id, provider, base_url, model, credential_ref, headers,
  timeout_ms, max_retries, circuit_failure_threshold, circuit_reset_ms,
  input_cost_per_million_tokens, output_cost_per_million_tokens,
  allow_insecure_local_http FROM model_endpoints`;

export class PostgresModelEndpointStore implements ModelEndpointStore {
  public constructor(private readonly pool: Pool) {}

  public static connect(connectionString: string): PostgresModelEndpointStore {
    return new PostgresModelEndpointStore(new Pool({ connectionString }));
  }

  public async close(): Promise<void> { await this.pool.end(); }

  public async list(): Promise<ModelEndpointConfig[]> {
    const result = await this.pool.query<EndpointRow>(`${select} ORDER BY endpoint_id`);
    return result.rows.map(toConfig);
  }

  public async get(id: string): Promise<ModelEndpointConfig | null> {
    const result = await this.pool.query<EndpointRow>(`${select} WHERE endpoint_id = $1`, [id]);
    return result.rows[0] ? toConfig(result.rows[0]) : null;
  }

  public async save(input: ModelEndpointInput): Promise<void> {
    const config = validateModelEndpoint(input);
    await this.pool.query(`INSERT INTO model_endpoints (
      endpoint_id, provider, base_url, model, credential_ref, headers, timeout_ms,
      max_retries, circuit_failure_threshold, circuit_reset_ms,
      input_cost_per_million_tokens, output_cost_per_million_tokens,
      allow_insecure_local_http, updated_at
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,CURRENT_TIMESTAMP)
    ON CONFLICT (endpoint_id) DO UPDATE SET provider=EXCLUDED.provider,
      base_url=EXCLUDED.base_url, model=EXCLUDED.model, credential_ref=EXCLUDED.credential_ref,
      headers=EXCLUDED.headers, timeout_ms=EXCLUDED.timeout_ms, max_retries=EXCLUDED.max_retries,
      circuit_failure_threshold=EXCLUDED.circuit_failure_threshold, circuit_reset_ms=EXCLUDED.circuit_reset_ms,
      input_cost_per_million_tokens=EXCLUDED.input_cost_per_million_tokens,
      output_cost_per_million_tokens=EXCLUDED.output_cost_per_million_tokens,
      allow_insecure_local_http=EXCLUDED.allow_insecure_local_http, updated_at=CURRENT_TIMESTAMP`, [
      config.id, config.provider, config.baseUrl, config.model, config.credentialRef,
      config.headers ? JSON.stringify(config.headers) : null, config.timeoutMs, config.maxRetries,
      config.circuitFailureThreshold, config.circuitResetMs, config.inputCostPerMillionTokens ?? null,
      config.outputCostPerMillionTokens ?? null, config.allowInsecureLocalHttp ?? false
    ]);
  }
}
