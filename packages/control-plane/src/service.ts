import { ActorRefSchema, CorrelationIdSchema, TaskSchema, taskId, workflowId } from '@aicompany/contracts';
import type { Mission, MissionPlanner, MissionStore, ControlPlaneAuthorization, SolutionBriefInput, MissionCommand, MissionCommandHandler } from './types.js';

const clone = <T>(value: T): T => structuredClone(value);

export class InMemoryMissionStore implements MissionStore {
  private readonly missions = new Map<string, Mission>();
  public async save(mission: Mission): Promise<void> { this.missions.set(mission.missionId, clone(mission)); }
  public async get(missionId: string): Promise<Mission | null> { const mission = this.missions.get(missionId); return mission ? clone(mission) : null; }
  public async list(projectId: string): Promise<Mission[]> { return [...this.missions.values()].filter((mission) => mission.projectId === projectId).sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime()).map(clone); }
}

export class DefaultControlPlaneAuthorization implements ControlPlaneAuthorization {
  public canSubmit(actor: SolutionBriefInput['requestedBy'], projectId: string): boolean { return actor.kind === 'CEO' && projectId.trim().length > 0; }
  public canRead(actor: SolutionBriefInput['requestedBy'], mission: Mission): boolean { void mission; return actor.kind === 'CEO'; }
}

export class HeuristicMissionPlanner implements MissionPlanner {
  public async plan(input: SolutionBriefInput): Promise<{ workflowId: ReturnType<typeof workflowId>; tasks: ReturnType<typeof TaskSchema.parse>[] }> {
    const workflow = workflowId(`workflow:${input.projectId}:${input.idempotencyKey}`);
    const lines = input.brief.split(/\r?\n/).map((line) => line.replace(/^\s*(?:[-*]|\d+[.)])\s*/, '').trim()).filter(Boolean);
    const descriptions = lines.length > 0 ? lines : [input.brief.trim()];
    const now = new Date();
    const tasks = descriptions.map((description, index) => TaskSchema.parse({
      id: taskId(`task:${input.projectId}:${input.idempotencyKey}:${index + 1}`), workflowId: workflow, state: 'PENDING', dependencyIds: index === 0 ? [] : [taskId(`task:${input.projectId}:${input.idempotencyKey}:${index}`)], requiredCapabilities: ['repo.read'], outputContract: 'validated artifact and evidence', budget: { maxTokens: 10000, maxCostUsd: 5 }, recoveryCycles: 0, projectId: input.projectId, parentTaskId: null, ownerAgentDefinitionId: null, deadline: null, traceId: CorrelationIdSchema.parse(input.correlationId), version: 0, createdAt: now, updatedAt: now, title: description.slice(0, 120), description
    }));
    return { workflowId: workflow, tasks };
  }
}

export class ControlPlaneService {
  private readonly requests = new Map<string, { fingerprint: string; mission: Mission }>();
  private readonly commands = new Map<string, string>();

  public constructor(private readonly options: { planner: MissionPlanner; missions: MissionStore; authorization?: ControlPlaneAuthorization; commandHandler?: MissionCommandHandler; now?: () => Date; missionIdFactory?: (input: SolutionBriefInput) => string }) {}

  public async submit(input: SolutionBriefInput): Promise<Mission> {
    const actor = ActorRefSchema.parse(input.requestedBy);
    const title = input.title.trim(); const brief = input.brief.trim(); const key = input.idempotencyKey.trim();
    if (!title || !brief || !key) throw new Error('title, brief, and idempotencyKey are required');
    if (!(this.options.authorization ?? new DefaultControlPlaneAuthorization()).canSubmit(actor, input.projectId)) throw new Error('Only CEO may submit a solution brief');
    const fingerprint = JSON.stringify({ projectId: input.projectId, title, brief, actor, correlationId: input.correlationId });
    const prior = this.requests.get(key);
    if (prior) { if (prior.fingerprint !== fingerprint) throw new Error('Mission idempotency key was reused with different input'); return clone(prior.mission); }
    const planned = await this.options.planner.plan({ ...input, requestedBy: actor, title, brief, idempotencyKey: key, correlationId: CorrelationIdSchema.parse(input.correlationId) });
    const now = this.options.now?.() ?? new Date();
    const mission: Mission = { missionId: this.options.missionIdFactory?.(input) ?? `mission:${input.projectId}:${key}`, projectId: input.projectId, title, brief, workflowId: planned.workflowId, tasks: planned.tasks, status: 'PENDING', createdAt: now, updatedAt: now };
    await this.options.missions.save(mission); this.requests.set(key, { fingerprint, mission: clone(mission) }); return clone(mission);
  }

  public async get(missionId: string, actor: SolutionBriefInput['requestedBy']): Promise<Mission> {
    const mission = await this.options.missions.get(missionId); if (!mission) throw new Error('Mission was not found');
    if (!(this.options.authorization ?? new DefaultControlPlaneAuthorization()).canRead(actor, mission)) throw new Error('Mission read is not authorized');
    return mission;
  }

  public async list(projectId: string, actor: SolutionBriefInput['requestedBy']): Promise<Mission[]> {
    return (await this.options.missions.list(projectId)).filter((mission) => (this.options.authorization ?? new DefaultControlPlaneAuthorization()).canRead(actor, mission));
  }

  public async command(command: MissionCommand): Promise<void> {
    const actor = ActorRefSchema.parse(command.actor); if (actor.kind !== 'CEO') throw new Error('Only CEO may issue mission commands');
    const key = command.idempotencyKey.trim(); if (!key || !command.reason.trim()) throw new Error('Command idempotencyKey and reason are required');
    const fingerprint = JSON.stringify({ ...command, actor }); const prior = this.commands.get(key); if (prior) { if (prior !== fingerprint) throw new Error('Command idempotency key was reused with different input'); return; }
    if (!this.options.commandHandler) throw new Error('Mission command handler is not configured');
    await this.options.commandHandler.execute({ ...command, actor, idempotencyKey: key, reason: command.reason.trim() }); this.commands.set(key, fingerprint);
  }
}
