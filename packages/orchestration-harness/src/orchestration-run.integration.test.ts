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
    expect(result.deploymentTaskState).toBe('COMPLETED');
    expect(result.mergeEvidenceCount).toBeGreaterThan(0);
    expect(result.traceIds.length).toBeGreaterThan(0);
    expect(result.usageRecordCount).toBe(60);
    expect(result.deployCommandCount).toBe(1);
    expect(result.agentEvidence.progressCount).toBe(120);
    expect(result.agentEvidence.artifactIds).toHaveLength(60);
    expect(result.agentEvidence.artifactIds).toContain('artifact:scenario-task-60');
    expect(result.agentEvidence.reviewRequestCount).toBe(60);
    expect(result.agentEvidence.testRequestCount).toBe(60);
    expect(result.agentEvidence.checkpointIds).toHaveLength(60);
    expect(result.agentEvidence.checkpointIds).toContain('checkpoint:scenario-task-60:validated');
    expect(result.agentEvidence.evidenceIds).toHaveLength(60);
    expect(result.agentEvidence.evidenceIds).toContain('evidence:scenario-task-60:validated');
    expect(result.persistedEvidence).toEqual({
      checkpointCount: 60, progressMessageCount: 120, artifactReferenceCount: 60,
      testRequestCount: 60, reviewEventCount: 60
    });
  });
});
