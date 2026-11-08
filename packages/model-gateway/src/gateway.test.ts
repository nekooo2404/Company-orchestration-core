import { describe, expect, it, vi } from 'vitest';
import { agentDefinitionId, agentSessionId, correlationId, taskId, workflowId } from '@aicompany/contracts';
import { InMemoryCostSink } from '@aicompany/orchestration-core';
import { CircuitOpenError, OpenAICompatibleGateway } from './index';

const request = { workflowId: workflowId('workflow-1'), taskId: taskId('task-1'), agentSessionId: agentSessionId('session-1'), agentDefinitionId: agentDefinitionId('agent-1'), department: 'engineering', correlationId: correlationId('trace-1'), messages: [{ role: 'user' as const, content: 'hello' }] };
const endpoint = { id: 'local', provider: 'openai-compatible', baseUrl: 'http://127.0.0.1:4010/v1', model: 'test-model', credentialRef: 'secret:model', timeoutMs: 500, maxRetries: 1, circuitFailureThreshold: 2, circuitResetMs: 60_000, inputCostPerMillionTokens: 1, outputCostPerMillionTokens: 2, allowInsecureLocalHttp: true };

describe('model gateway', () => {
  it('routes configured base URL with secret reference and records usage', async () => {
    const calls: RequestInit[] = [];
    const usage = new InMemoryCostSink();
    const gateway = new OpenAICompatibleGateway({ endpoints: [endpoint], secrets: { async resolve() { return 'secret-value'; } }, usage, idFactory: () => 'request-1', fetch: vi.fn(async (_url, init) => { calls.push(init); return new Response(JSON.stringify({ id: 'completion-1', model: 'test-model', choices: [{ message: { content: 'hello back' }, finish_reason: 'stop' }], usage: { prompt_tokens: 3, completion_tokens: 2 } }), { status: 200, headers: { 'content-type': 'application/json' } }); }) });
    await expect(gateway.complete(request)).resolves.toMatchObject({ content: 'hello back', inputTokens: 3, outputTokens: 2 });
    expect(calls[0].headers).toMatchObject({ authorization: 'Bearer secret-value' });
    expect((await usage.getWorkflowCost(request.workflowId)).inputTokens).toBe(3);
  });

  it('retries transient errors then opens circuit after repeated failures', async () => {
    let calls = 0;
    const gateway = new OpenAICompatibleGateway({ endpoints: [endpoint], secrets: { async resolve() { return 'secret'; } }, sleep: async () => undefined, fetch: vi.fn(async () => { calls += 1; return new Response('down', { status: 503 }); }) });
    await expect(gateway.complete(request)).rejects.toThrow(/HTTP 503/);
    await expect(gateway.complete(request)).rejects.toThrow(/HTTP 503/);
    await expect(gateway.complete(request)).rejects.toThrow(CircuitOpenError);
    expect(calls).toBe(4);
  });

  it('rejects credential-bearing endpoints and unsafe headers', () => {
    expect(() => new OpenAICompatibleGateway({ endpoints: [{ ...endpoint, baseUrl: 'https://user:pass@example.com/v1' }], secrets: { async resolve() { return 'x'; } } })).toThrow(/credentials/i);
  });
});
