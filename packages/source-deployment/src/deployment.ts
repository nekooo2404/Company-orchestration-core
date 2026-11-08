import type { DeploymentReceipt, DeploymentRequest, DeploymentRunner, DeploymentToolRunner } from './types.js';

export class CommandDeploymentRunner implements DeploymentRunner {
  public constructor(private readonly runner: DeploymentToolRunner, private readonly now: () => Date = () => new Date()) {}

  public async deploy(input: DeploymentRequest): Promise<DeploymentReceipt> {
    return this.execute(input, `deployment:${input.attemptId}`);
  }

  public async rollback(input: DeploymentRequest): Promise<DeploymentReceipt> {
    return this.execute(input, `rollback:${input.attemptId}`);
  }

  private async execute(input: DeploymentRequest, evidencePrefix: string): Promise<DeploymentReceipt> {
    const startedAt = this.now();
    const result = await this.runner.run(input.projectId, input.command);
    const completedAt = this.now();
    return { approvalId: input.approvalId, attemptId: input.attemptId, target: input.target, succeeded: result.exitCode === 0 && !result.timedOut, evidenceIds: [`${evidencePrefix}:stdout`, `${evidencePrefix}:stderr`], artifactReference: `artifact://${input.projectId}/${input.attemptId}`, startedAt, completedAt, result };
  }
}
