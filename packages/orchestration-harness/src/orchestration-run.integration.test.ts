import { describe, expect, it } from 'vitest';
import { runFiftyAgentScenario } from './scenario';

describe('fifty-agent orchestration scenario', () => {
  it('dispatches fifty of sixty tasks first and completes only after CEO deployment approval', async () => {
    const result = await runFiftyAgentScenario();
    expect(result.firstDispatchCount).toBe(50);
    expect(result.completedTaskCount).toBe(60);
    expect(result.escalatedTaskCount).toBe(0);
    expect(result.deploymentWaitingForApproval).toBe(true);
    expect(result.deploymentCompletedAfterApproval).toBe(true);
    expect(result.mergeEvidenceCount).toBeGreaterThan(0);
    expect(result.traceIds.length).toBeGreaterThan(0);
    expect(result.usageRecordCount).toBe(60);
    expect(result.deployCommandCount).toBe(1);
  });
});
