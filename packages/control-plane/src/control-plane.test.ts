import { describe, expect, it } from 'vitest';
import { correlationId } from '@aicompany/contracts';
import { ControlPlaneService, DefaultControlPlaneAuthorization, HeuristicMissionPlanner, InMemoryMissionStore } from './index';

describe('control plane', () => {
  it('turns one CEO solution brief into idempotent dependency tasks', async () => {
    const service = new ControlPlaneService({ planner: new HeuristicMissionPlanner(), missions: new InMemoryMissionStore(), authorization: new DefaultControlPlaneAuthorization() });
    const input = { projectId: 'project-1', title: 'Mission', brief: '- Build API\n- Add tests', requestedBy: { kind: 'CEO' as const }, correlationId: correlationId('trace-1'), idempotencyKey: 'mission-1' };
    const first = await service.submit(input);
    const second = await service.submit(input);
    expect(second).toEqual(first);
    expect(first.tasks).toHaveLength(2);
    expect(first.tasks[1].dependencyIds).toEqual([first.tasks[0].id]);
  });

  it('rejects non-CEO brief submission', async () => {
    const service = new ControlPlaneService({ planner: new HeuristicMissionPlanner(), missions: new InMemoryMissionStore() });
    await expect(service.submit({ projectId: 'project-1', title: 'Mission', brief: 'Build', requestedBy: { kind: 'AGENT', sessionId: 'session-1' as never }, correlationId: correlationId('trace-1'), idempotencyKey: 'mission-1' })).rejects.toThrow(/CEO/i);
  });
});
