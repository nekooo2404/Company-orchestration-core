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
    expect(result.strategyNames[0]).not.toBe(result.strategyNames[1]);
  });
});
