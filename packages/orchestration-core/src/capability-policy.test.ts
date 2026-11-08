import { describe, expect, it } from 'vitest';
import { agentSessionId, correlationId, taskId, type ActorRef } from '@aicompany/contracts';
import {
  DEFAULT_CAPABILITY_POLICY,
  InMemoryCapabilityPolicy,
  type CapabilityRequest
} from './capability-policy';

const request = (capability: string): CapabilityRequest => ({
  actor: { kind: 'AGENT', sessionId: agentSessionId('session-1') },
  taskId: taskId('task-1'),
  capability,
  resource: 'repo:main',
  correlationId: correlationId('trace-1')
});

describe('InMemoryCapabilityPolicy', () => {
  it('allows role defaults and denies capabilities outside the role matrix', async () => {
    const policy = new InMemoryCapabilityPolicy();
    await expect(policy.evaluate(request('repo.read'))).resolves.toMatchObject({ allowed: true, requiresApproval: false });
    await expect(policy.evaluate(request('repo.write'))).resolves.toMatchObject({ allowed: false, requiresApproval: false });
  });

  it('routes security, secret, and deploy escalations to CEO approval', async () => {
    const approvals: string[] = [];
    const policy = new InMemoryCapabilityPolicy({
      requestApproval: async (input) => { approvals.push(input.capability); return `approval:${input.capability}` as never; }
    });
    for (const capability of ['security.scan', 'secret.use', 'deploy.staging', 'deploy.production']) {
      const result = await policy.evaluate(request(capability));
      expect(result).toMatchObject({ allowed: false, requiresApproval: true, approvalId: `approval:${capability}` });
    }
    expect(approvals).toEqual(['security.scan', 'secret.use', 'deploy.staging', 'deploy.production']);
    expect(DEFAULT_CAPABILITY_POLICY.version).toBeGreaterThan(0);
  });

  it('does not grant capabilities to a CEO actor through agent role defaults', async () => {
    const policy = new InMemoryCapabilityPolicy();
    const input = { ...request('repo.read'), actor: { kind: 'CEO' } as ActorRef };
    await expect(policy.evaluate(input)).resolves.toMatchObject({ allowed: false });
  });
});
