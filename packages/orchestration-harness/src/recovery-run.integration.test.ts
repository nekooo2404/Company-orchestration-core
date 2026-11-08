import { describe, expect, it } from 'vitest';
import { runRecoveryScenario } from './scenario';

describe('recovery integration scenario', () => {
  it('changes strategy after a repeated failure, escalates at cycle five, and holds only the dependent branch', async () => {
    const result = await runRecoveryScenario();
    expect(result).toMatchObject({
      successfulRecoveryCycles: 1,
      retryRecoveryCycles: 2,
      escalatedRecoveryCycles: 5,
      escalatedTaskCount: 1,
      independentBranchState: 'COMPLETED',
      dependentBranchState: 'PENDING'
    });
    const retryAttempts = result.recoveryAttempts.filter(({ taskId }) => taskId === 'recovery-retry');
    expect(retryAttempts).toHaveLength(2);
    expect(new Set(retryAttempts.map(({ fingerprint }) => fingerprint)).size).toBe(1);
    expect(retryAttempts[0].fingerprint).toBe(retryAttempts[1].fingerprint);
    expect(retryAttempts.map(({ failureAssumption }) => failureAssumption)).toEqual([
      'primary-agent-is-unreliable',
      'primary-agent-is-unreliable'
    ]);
    expect(retryAttempts[0].selectedStrategyName).not.toBe(retryAttempts[1].selectedStrategyName);
    expect(retryAttempts[1]).toMatchObject({
      action: 'ALTERNATE_AGENT',
      selectedStrategyName: result.successfulStrategyName,
      usedStrategyName: result.successfulStrategyName,
      state: 'SUCCEEDED',
      succeeded: true,
      environment: { activeAgent: 'alternate' }
    });
    expect(retryAttempts[1].selectedStrategyName).not.toBe(retryAttempts[0].selectedStrategyName);
    expect(retryAttempts[0]).toMatchObject({ action: 'RETRY', succeeded: false, environment: { activeAgent: 'primary' } });
  });
});
