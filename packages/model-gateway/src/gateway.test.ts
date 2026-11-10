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

  it('routes Anthropic messages with its API contract', async () => {
    let url = '';
    let init: RequestInit | undefined;
    const anthropic = { ...endpoint, id: 'anthropic', provider: 'anthropic', baseUrl: 'https://api.anthropic.com/v1', allowInsecureLocalHttp: false };
    const gateway = new OpenAICompatibleGateway({
      endpoints: [anthropic],
      secrets: { async resolve() { return 'anthropic-secret'; } },
      fetch: vi.fn(async (requestUrl, requestInit) => {
        url = String(requestUrl);
        init = requestInit;
        return new Response(JSON.stringify({ model: 'claude-test', stop_reason: 'end_turn', content: [{ type: 'text', text: 'hello ' }, { type: 'text', text: 'anthropic' }], usage: { input_tokens: 4, output_tokens: 5 } }), { status: 200 });
      })
    });
    const result = await gateway.complete({ ...request, messages: [{ role: 'system', content: 'Be concise' }, { role: 'user', content: 'hello' }], maxTokens: 128 });
    const body = JSON.parse(String(init?.body)) as { model: string; system: string; max_tokens: number; messages: Array<{ role: string; content: string }> };
    expect(result).toMatchObject({ content: 'hello anthropic', inputTokens: 4, outputTokens: 5, finishReason: 'end_turn' });
    expect(url).toBe('https://api.anthropic.com/v1/messages');
    expect(init?.headers).toMatchObject({ 'x-api-key': 'anthropic-secret', 'anthropic-version': '2023-06-01' });
    expect(body).toEqual({ model: 'test-model', system: 'Be concise', max_tokens: 128, messages: [{ role: 'user', content: 'hello' }] });
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
