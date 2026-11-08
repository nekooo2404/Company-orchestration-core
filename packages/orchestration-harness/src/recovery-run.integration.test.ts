import { describe, expect, it } from 'vitest';
import { runRecoveryScenario } from './scenario';

describe('recovery integration scenario', () => {
  it('changes strategy after a repeated failure, escalates at cycle five, and holds only the dependent branch', async () => {
    const result = await runRecoveryScenario();
    expect(result).toMatchObject({
      successfulRecoveryCycles: 1,
      retryRecoveryCycles: 3,
      escalatedRecoveryCycles: 5,
      escalatedTaskCount: 1,
      independentBranchState: 'COMPLETED',
      dependentBranchState: 'PENDING'
    });
    const retryAttempts = result.recoveryAttempts.filter(({ taskId }) => taskId === 'recovery-retry');
    expect(retryAttempts).toHaveLength(3);
    expect(new Set(retryAttempts.map(({ fingerprint }) => fingerprint)).size).toBe(1);
    expect(retryAttempts[0].fingerprint).toBe(retryAttempts[1].fingerprint);
    expect(retryAttempts[0].selectedStrategyName).not.toBe(retryAttempts[1].selectedStrategyName);
    expect(retryAttempts[2]).toMatchObject({
      selectedStrategyName: result.successfulStrategyName,
      usedStrategyName: result.successfulStrategyName,
      state: 'SUCCEEDED'
    });
    expect(retryAttempts[2].selectedStrategyName).not.toBe(retryAttempts[1].selectedStrategyName);
  });
});
