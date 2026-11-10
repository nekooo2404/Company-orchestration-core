import { TaskSchema, workflowId } from '@aicompany/contracts';
import type { Mission, MissionPlanner, MissionStore, ControlPlaneAuthorization, SolutionBriefInput, MissionCommand, MissionCommandHandler } from './types.js';
export declare class InMemoryMissionStore implements MissionStore {
    private readonly missions;
    private readonly idempotency;
    save(mission: Mission, metadata?: {
        idempotencyKey?: string;
        requestFingerprint?: string;
    }): Promise<void>;
    findByIdempotencyKey(idempotencyKey: string): Promise<{
        fingerprint: string;
        mission: Mission;
    } | null>;
    get(missionId: string): Promise<Mission | null>;
    list(projectId: string): Promise<Mission[]>;
}
export declare class DefaultControlPlaneAuthorization implements ControlPlaneAuthorization {
    canSubmit(actor: SolutionBriefInput['requestedBy'], projectId: string): boolean;
    canRead(actor: SolutionBriefInput['requestedBy'], mission: Mission): boolean;
}
export declare class HeuristicMissionPlanner implements MissionPlanner {
    plan(input: SolutionBriefInput): Promise<{
        workflowId: ReturnType<typeof workflowId>;
        tasks: ReturnType<typeof TaskSchema.parse>[];
    }>;
}
export declare class ControlPlaneService {
    private readonly options;
    private readonly commands;
    constructor(options: {
        planner: MissionPlanner;
        missions: MissionStore;
        authorization?: ControlPlaneAuthorization;
        commandHandler?: MissionCommandHandler;
        now?: () => Date;
        missionIdFactory?: (input: SolutionBriefInput) => string;
    });
    submit(input: SolutionBriefInput): Promise<Mission>;
    get(missionId: string, actor: SolutionBriefInput['requestedBy']): Promise<Mission>;
    list(projectId: string, actor: SolutionBriefInput['requestedBy']): Promise<Mission[]>;
    command(command: MissionCommand): Promise<void>;
}
//# sourceMappingURL=service.d.ts.map