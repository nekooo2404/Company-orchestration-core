import {
  agentSessionId,
  type AgentDefinitionId,
  type AgentSession,
  type Task
} from '@aicompany/contracts';
import type { LaunchAgentSessionInput, AgentSessionLauncher } from '@aicompany/orchestration-core';

export interface SimulatedArtifact {
  artifactId: string;
  taskId: Task['id'];
  department: string;
  evidenceId: string;
}

export interface SimulatedAgentResult {
  artifact: SimulatedArtifact;
  progress: string[];
  requestedChecks: Array<'review' | 'test'>;
  checkpoint: string;
  evidenceIds: string[];
}

export class SimulatedAgent implements AgentSessionLauncher {
  public readonly launches: LaunchAgentSessionInput[] = [];
  public readonly artifacts: SimulatedArtifact[] = [];
  public readonly activity: SimulatedAgentResult[] = [];

  public constructor(
    private readonly now: () => Date,
    private readonly definitionForDepartment: (department: string) => AgentDefinitionId
  ) {}

  public async launch(input: LaunchAgentSessionInput): Promise<AgentSession> {
    this.launches.push(structuredClone(input));
    const createdAt = this.now();
    return {
      sessionId: input.sessionId,
      taskId: input.taskId,
      workflowId: input.workflowId,
      agentDefinitionId: input.agentDefinitionId,
      state: 'RUNNING',
      contextReference: `simulated:${input.sessionId}`,
      checkpointReference: null,
      traceId: input.correlationId,
      usage: { inputTokens: 0, outputTokens: 0, costUsd: 0 },
      toolCallHistory: ['fake:artifact.create', 'fake:review.request', 'fake:test.request'],
      attempt: 1,
      version: 0,
      createdAt,
      updatedAt: createdAt
    };
  }

  public async stop(): Promise<void> {}

  public execute(task: Task, department: string): SimulatedAgentResult {
    const evidenceId = `evidence:${task.id}:validated`;
    const artifact: SimulatedArtifact = {
      artifactId: `artifact:${task.id}`,
      taskId: task.id,
      department,
      evidenceId
    };
    const result: SimulatedAgentResult = {
      artifact,
      progress: [`${department}:started`, `${department}:validated`],
      requestedChecks: ['review', 'test'],
      checkpoint: `checkpoint:${task.id}:validated`,
      evidenceIds: [evidenceId]
    };
    this.artifacts.push(artifact);
    this.activity.push(result);
    void this.definitionForDepartment(department);
    return result;
  }

  public sessionIdFor(task: Task): ReturnType<typeof agentSessionId> {
    const launch = this.launches.find(({ taskId }) => taskId === task.id);
    if (launch === undefined) throw new Error(`No simulated session for ${task.id}`);
    return launch.sessionId;
  }
}
