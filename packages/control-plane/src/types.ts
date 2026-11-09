import type { ActorRef, CorrelationId, Task, WorkflowId } from '@aicompany/contracts';

export interface SolutionBriefInput {
  projectId: string;
  title: string;
  brief: string;
  requestedBy: ActorRef;
  correlationId: CorrelationId;
  idempotencyKey: string;
}

export interface Mission {
  missionId: string;
  projectId: string;
  title: string;
  brief: string;
  workflowId: WorkflowId;
  tasks: Task[];
  status: 'PENDING' | 'RUNNING' | 'COMPLETED' | 'BLOCKED' | 'FAILED';
  createdAt: Date;
  updatedAt: Date;
}

export interface MissionPlanner {
  plan(input: SolutionBriefInput): Promise<{ workflowId: WorkflowId; tasks: Task[] }>;
}

export interface MissionStore {
  save(mission: Mission, metadata?: { idempotencyKey?: string; requestFingerprint?: string }): Promise<void>;
  findByIdempotencyKey(idempotencyKey: string): Promise<{ fingerprint: string; mission: Mission } | null>;
  get(missionId: string): Promise<Mission | null>;
  list(projectId: string): Promise<Mission[]>;
}

export interface ControlPlaneAuthorization {
  canSubmit(actor: ActorRef, projectId: string): boolean;
  canRead(actor: ActorRef, mission: Mission): boolean;
}

export interface MissionCommand {
  type: 'PAUSE' | 'RESUME' | 'CANCEL';
  missionId: string;
  actor: ActorRef;
  idempotencyKey: string;
  reason: string;
}

export interface MissionCommandHandler {
  execute(command: MissionCommand): Promise<void>;
}
