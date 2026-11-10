import type { GatewayOptions, HealthResult, ModelGateway, ModelRequest, ModelResponse } from './types.js';
export declare class OpenAICompatibleGateway implements ModelGateway {
    private readonly options;
    private readonly endpointMap;
    private readonly circuits;
    private readonly fetcher;
    private readonly sleep;
    private readonly idFactory;
    constructor(options: GatewayOptions);
    complete(input: ModelRequest): Promise<ModelResponse>;
    health(endpointId: string): Promise<HealthResult>;
    private safeHeaders;
    private audit;
    private recordUsage;
}
export { CircuitBreaker, CircuitOpenError } from './circuit-breaker.js';
//# sourceMappingURL=gateway.d.ts.map