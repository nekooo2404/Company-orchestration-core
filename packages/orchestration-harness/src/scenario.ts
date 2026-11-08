import {
  agentDefinitionId,
  agentSessionId,
  approvalId,
  correlationId,
  taskId,
  workflowId,
  type ApprovalId,
  type Task,
  type TaskId
} from '@aicompany/contracts';
import {
  ApprovalServiceImpl,
  InMemoryApprovalStore,
  InMemoryApprovalTransactionalPersistence,
  InMemoryCostSink,
  InMemoryMetricsSink,
  InMemoryRecoveryRecordStore,
  InMemoryTaskRepository,
  InMemoryEventStore,
  InMemoryOutbox,
  InMemoryTraceSink,
  RecoveryCoordinatorService,
  SchedulerService,
  createDefaultRecoveryStrategies,
  transitionTask
} from '@aicompany/orchestration-core';
import { SimulatedAgent } from './simulated-agent';
import type { SimulatedAgentResult } from './simulated-agent';

const fixedTime = new Date('2026-11-08T00:00:00.000Z');
const departments = ['Product', 'Architecture', 'Development', 'Review', 'QA', 'Security', 'DevOps'] as const;
const actor = { kind: 'SYSTEM' as const, name: 'integration-harness' };

export interface ScenarioResult {
  workflowId: Task['workflowId'];
  completedTaskCount: number;
  escalatedTaskCount: number;
  recoveryCycleCount: number;
  deploymentApprovalId: ApprovalId;
  traceIds: string[];
  firstDispatchCount: number;
  deploymentWaitingForApproval: boolean;
  deploymentCompletedAfterApproval: boolean;
  mergeEvidenceCount: number;
  usageRecordCount: number;
  deployCommandCount: number;
  deploymentTaskState: Task['state'];
  agentEvidence: {
    progressCount: number;
    artifactIds: string[];
    reviewRequestCount: number;
    testRequestCount: number;
    checkpointIds: string[];
    evidenceIds: string[];
  };
}

export interface RecoveryScenarioResult {
  successfulRecoveryCycles: number;
  retryRecoveryCycles: number;
  escalatedRecoveryCycles: number;
  escalatedTaskCount: number;
  independentBranchState: Task['state'];
  dependentBranchState: Task['state'];
  recoveryAttempts: Array<{
    taskId: TaskId;
    cycle: number;
    fingerprint: string;
    selectedStrategyName: string;
    usedStrategyName: string;
    state: string;
  }>;
  successfulStrategyName: string;
}

interface Harness {
  tasks: InMemoryTaskRepository;
  events: InMemoryEventStore;
  outbox: InMemoryOutbox;
  approvals: InMemoryApprovalStore;
  persistence: InMemoryApprovalTransactionalPersistence;
  recovery: RecoveryCoordinatorService;
  recoveryRecords: InMemoryRecoveryRecordStore;
  clock: { now: () => Date };
}

const createHarness = (): Harness => {
  const tasks = new InMemoryTaskRepository();
  const events = new InMemoryEventStore();
  const outbox = new InMemoryOutbox({ now: () => new Date(fixedTime) });
  const approvals = new InMemoryApprovalStore();
  const persistence = new InMemoryApprovalTransactionalPersistence({ tasks, events, outbox, approvals });
  const recoveryRecords = new InMemoryRecoveryRecordStore();
  const recovery = new RecoveryCoordinatorService({
    taskRepository: tasks,
    transactionalPersistence: persistence,
    records: recoveryRecords,
    strategies: createDefaultRecoveryStrategies(),
    now: () => new Date(fixedTime),
    newRecoveryId: (cycle, id) => `recovery:${id}:${cycle}`,
    newApprovalId: (cycle, id) => `recovery-approval:${id}:${cycle}`
  });
  return { tasks, events, outbox, approvals, persistence, recovery, recoveryRecords, clock: { now: () => new Date(fixedTime) } };
};

const makeTask = (id: TaskId, workflow: Task['workflowId'], index: number, deployment = false): Task => ({
  id,
  workflowId: workflow,
  state: 'PENDING',
  dependencyIds: [],
  requiredCapabilities: ['repo.read'],
  outputContract: `validated ${departments[index % departments.length]} output`,
  budget: { maxTokens: 20_000, maxCostUsd: 10 },
  recoveryCycles: 0,
  projectId: 'simulated-project',
  parentTaskId: null,
  ownerAgentDefinitionId: null,
  deadline: null,
  traceId: correlationId(`trace:${id}`),
  version: 0,
  createdAt: new Date(fixedTime.getTime() + index),
  updatedAt: new Date(fixedTime),
  title: `${departments[index % departments.length]} task ${index + 1}`,
  ...(deployment ? { isDeployment: true } : {})
});

const saveTransition = async (harness: Harness, task: Task, type: 'TASK_COMPLETED' | 'DEPLOYMENT_RESULT_RECORDED', evidenceIds: string[]): Promise<Task> => {
  const result = transitionTask(task, type === 'TASK_COMPLETED'
    ? { type, evidenceIds }
    : { type, evidenceIds }, {
    actor, now: harness.clock.now(), evidenceIds, isDeployment: task.isDeployment ?? false
  });
  await harness.persistence.saveTaskAndAppend({ task: result.task, expectedVersion: task.version, events: [result.event], commands: [] });
  return result.task;
};

const executeRecoveryPlan = (plan: { strategyName: string }, outcome: 'FAIL' | 'SUCCEED') => ({
  appliedStrategyName: plan.strategyName,
  outcome
});

const createScheduler = (harness: Harness, agent: SimulatedAgent): SchedulerService => {
  const definitions = departments.map((department) => ({
    id: agentDefinitionId(`agent:${department.toLowerCase()}`),
    department,
    allowedCapabilities: ['repo.read'],
    budget: { maxTokens: 20_000, maxCostUsd: 10 },
    maxConcurrency: 100
  }));
  return new SchedulerService({
    taskRepository: harness.tasks,
    agentDefinitions: definitions,
    transactionalPersistence: harness.persistence,
    launcher: agent,
    clock: harness.clock,
    leaseDurationMs: 60_000,
    recoveryCoordinator: harness.recovery
  });
};

export async function runFiftyAgentScenario(): Promise<ScenarioResult> {
  const harness = createHarness();
  const workflow = workflowId('scenario:fifty-agents');
  const agent = new SimulatedAgent(harness.clock.now, (department) => agentDefinitionId(`agent:${department.toLowerCase()}`));
  const trace = new InMemoryTraceSink(harness.clock.now);
  const metrics = new InMemoryMetricsSink();
  const costs = new InMemoryCostSink();
  const evidenceCollection: SimulatedAgentResult[] = [];
  const execute = (task: Task, department: string): SimulatedAgentResult => {
    const result = agent.execute(task, department);
    evidenceCollection.push(structuredClone(result));
    return result;
  };
  const generated = Array.from({ length: 60 }, (_, index) => makeTask(taskId(`scenario-task-${String(index + 1).padStart(2, '0')}`), workflow, index, index === 59));
  for (const task of generated) await harness.tasks.save(task, 0);

  const scheduler = createScheduler(harness, agent);
  const first = await scheduler.tick({ workflowId: workflow, capacity: 50, workerId: 'simulated-worker' });
  const firstDispatchCount = first.length;
  for (const decision of first) {
    const task = await harness.tasks.get(decision.taskId);
    if (task === null) throw new Error('Dispatched task disappeared');
    if (task.isDeployment) continue;
    const span = trace.startSpan({ name: 'simulated-agent-task', workflowId: workflow, taskId: task.id, correlationId: task.traceId, attributes: { department: task.title?.split(' ')[0] ?? 'unknown' } });
    const result = execute(task, task.title?.split(' ')[0] ?? 'Development');
    const started = transitionTask(task, { type: 'TASK_REVIEW_REQUESTED' }, { actor, now: harness.clock.now(), evidenceIds: result.evidenceIds, isDeployment: false });
    await harness.persistence.saveTaskAndAppend({ task: started.task, expectedVersion: task.version, events: [started.event], commands: [] });
    const review = transitionTask(started.task, { type: 'TASK_COMPLETED', evidenceIds: result.evidenceIds }, { actor, now: harness.clock.now(), evidenceIds: result.evidenceIds, isDeployment: false });
    await harness.persistence.saveTaskAndAppend({ task: review.task, expectedVersion: started.task.version, events: [review.event], commands: [] });
    span.end({ artifactCount: 1, checkpointed: true });
    const department = task.title?.split(' ')[0] ?? 'Development';
    await costs.recordUsage({ usageId: `usage:${task.id}`, workflowId: workflow, taskId: task.id, agentSessionId: agent.sessionIdFor(task), agentDefinitionId: agentDefinitionId(`agent:${department.toLowerCase()}`), department, provider: 'fake', baseUrlIdentifier: 'in-memory', model: 'simulated-deterministic', inputTokens: 100, outputTokens: 50, estimatedCostUsd: 0.001, createdAt: harness.clock.now() });
    metrics.increment('simulated.task.completed', 1, { department });
  }

  const second = await scheduler.tick({ workflowId: workflow, capacity: 50, workerId: 'simulated-worker' });
  if (second.length !== 10) throw new Error(`Expected ten remaining dispatches, got ${second.length}`);
  const deploymentDecision = second.find(({ taskId: id }) => generated.find((item) => item.id === id)?.isDeployment);
  if (deploymentDecision === undefined) throw new Error('Deployment task was not dispatched');
  for (const decision of second) {
    if (decision.taskId === deploymentDecision.taskId) continue;
    const task = (await harness.tasks.get(decision.taskId))!;
    const result = execute(task, task.title?.split(' ')[0] ?? 'Development');
    const review = transitionTask(task, { type: 'TASK_REVIEW_REQUESTED' }, { actor, now: harness.clock.now(), evidenceIds: result.evidenceIds, isDeployment: false });
    await harness.persistence.saveTaskAndAppend({ task: review.task, expectedVersion: task.version, events: [review.event], commands: [] });
    const complete = transitionTask(review.task, { type: 'TASK_COMPLETED', evidenceIds: result.evidenceIds }, { actor, now: harness.clock.now(), evidenceIds: result.evidenceIds, isDeployment: false });
    await harness.persistence.saveTaskAndAppend({ task: complete.task, expectedVersion: review.task.version, events: [complete.event], commands: [] });
    const department = task.title?.split(' ')[0] ?? 'Development';
    await costs.recordUsage({ usageId: `usage:${task.id}`, workflowId: workflow, taskId: task.id, agentSessionId: agent.sessionIdFor(task), agentDefinitionId: agentDefinitionId(`agent:${department.toLowerCase()}`), department, provider: 'fake', baseUrlIdentifier: 'in-memory', model: 'simulated-deterministic', inputTokens: 100, outputTokens: 50, estimatedCostUsd: 0.001, createdAt: harness.clock.now() });
  }
  const deploymentTask = await harness.tasks.get(deploymentDecision.taskId);
  if (deploymentTask === null) throw new Error('Deployment task disappeared');
  const deploymentResult = execute(deploymentTask, 'DevOps');
  await costs.recordUsage({ usageId: `usage:${deploymentTask.id}`, workflowId: workflow, taskId: deploymentTask.id, agentSessionId: agent.sessionIdFor(deploymentTask), agentDefinitionId: agentDefinitionId('agent:devops'), department: 'DevOps', provider: 'fake', baseUrlIdentifier: 'in-memory', model: 'simulated-deterministic', inputTokens: 100, outputTokens: 50, estimatedCostUsd: 0.001, createdAt: harness.clock.now() });
  const reviewTask = transitionTask(deploymentTask, { type: 'TASK_REVIEW_REQUESTED' }, { actor, now: harness.clock.now(), evidenceIds: deploymentResult.evidenceIds, isDeployment: true });
  await harness.persistence.saveTaskAndAppend({ task: reviewTask.task, expectedVersion: deploymentTask.version, events: [reviewTask.event], commands: [] });
  const waiting = await saveTransition(harness, reviewTask.task, 'TASK_COMPLETED', deploymentResult.evidenceIds);
  const deploymentApprovalId = approvalId(`harness-deployment:${waiting.id}`);
  const approvalService = new ApprovalServiceImpl({
    approvals: harness.approvals,
    taskRepository: harness.tasks,
    transactionalPersistence: harness.persistence,
    now: harness.clock.now,
    newApprovalId: () => deploymentApprovalId
  });
  const pendingApproval = await approvalService.request({
    subjectType: 'DEPLOYMENT', subjectId: waiting.id, reason: 'Staging deployment evidence is ready',
    requestedBy: actor, correlationId: waiting.traceId, idempotencyKey: `request:${waiting.id}`
  });
  const deploymentWaitingForApproval = (await harness.tasks.get(waiting.id))?.state === 'WAITING_FOR_APPROVAL';
  const beforeApproval = await harness.outbox.claim(1000, 'assert-no-premature-deploy');
  const prematureDeploys = beforeApproval.filter(({ type }) => type === 'DEPLOY');
  for (const command of beforeApproval) await harness.outbox.markCompleted(command.commandId);
  if (prematureDeploys.length !== 0) throw new Error('Deployment command emitted before CEO approval');
  const approved = await approvalService.decide({
    approvalId: pendingApproval.approvalId, decision: 'APPROVE', actor: { kind: 'CEO' },
    reason: 'staging evidence verified', expectedVersion: pendingApproval.version, idempotencyKey: 'ceo-approve-deployment'
  });
  await approvalService.decide({
    approvalId: pendingApproval.approvalId, decision: 'APPROVE', actor: { kind: 'CEO' },
    reason: 'staging evidence verified', expectedVersion: pendingApproval.version, idempotencyKey: 'ceo-approve-deployment'
  });
  const deployCommands = await harness.outbox.claim(1000, 'deploy-command-audit');
  const deploymentCompletedAfterApproval = approved.state === 'APPROVED' && (await harness.tasks.get(waiting.id))?.state === 'RUNNING';
  const deployed = await saveTransition(harness, (await harness.tasks.get(waiting.id))!, 'DEPLOYMENT_RESULT_RECORDED', [`deployment:${waiting.id}:verified`]);
  const storedDeployment = await harness.tasks.get(deployed.id);
  if (storedDeployment?.state !== 'COMPLETED') throw new Error('Persisted deployment task did not complete after verified deployment');
  const finalTasks = await harness.tasks.listByWorkflow(workflow);
  const cost = await costs.getWorkflowCost(workflow);
  metrics.observe('simulated.workflow.cost', cost.estimatedCostUsd, { workflow: workflow });
  return {
    workflowId: workflow,
    completedTaskCount: finalTasks.filter(({ state }) => state === 'COMPLETED').length,
    escalatedTaskCount: finalTasks.filter(({ state }) => state === 'ESCALATED_TO_CEO').length,
    recoveryCycleCount: finalTasks.reduce((sum, task) => sum + task.recoveryCycles, 0),
    deploymentApprovalId: pendingApproval.approvalId,
    traceIds: [...new Set(finalTasks.map(({ traceId }) => traceId))].sort(),
    firstDispatchCount,
    deploymentWaitingForApproval,
    deploymentCompletedAfterApproval,
    mergeEvidenceCount: agent.artifacts.filter(({ department }) => department === 'Review').length,
    usageRecordCount: costs.usages.length,
    deployCommandCount: deployCommands.filter(({ type }) => type === 'DEPLOY').length,
    deploymentTaskState: storedDeployment.state,
    agentEvidence: {
      progressCount: evidenceCollection.reduce((sum, evidence) => sum + evidence.progress.length, 0),
      artifactIds: evidenceCollection.map(({ artifact }) => artifact.artifactId).sort(),
      reviewRequestCount: evidenceCollection.filter(({ requestedChecks }) => requestedChecks.includes('review')).length,
      testRequestCount: evidenceCollection.filter(({ requestedChecks }) => requestedChecks.includes('test')).length,
      checkpointIds: evidenceCollection.map(({ checkpoint }) => checkpoint).sort(),
      evidenceIds: evidenceCollection.flatMap(({ evidenceIds: ids }) => ids).sort()
    }
  };
}

export async function runRecoveryScenario(): Promise<RecoveryScenarioResult> {
  const harness = createHarness();
  const workflow = workflowId('scenario:recovery');
  const retry = makeTask(taskId('recovery-retry'), workflow, 1);
  const escalated = makeTask(taskId('recovery-escalated'), workflow, 2);
  const independent = makeTask(taskId('recovery-independent'), workflow, 3);
  const dependent = { ...makeTask(taskId('recovery-dependent'), workflow, 4), dependencyIds: [escalated.id] };
  for (const task of [retry, escalated, independent, dependent]) await harness.tasks.save(task, 0);
  const recoveryAttempts: RecoveryScenarioResult['recoveryAttempts'] = [];
  const recoveryFor = async (task: Task, cycle: number, succeeds: boolean) => {
    let current = (await harness.tasks.get(task.id))!;
    if (current.state !== 'FAILED') {
      if (current.state === 'PENDING') {
        const readyTask = transitionTask(current, { type: 'TASK_READY' }, { actor, now: harness.clock.now(), evidenceIds: [], isDeployment: false });
        await harness.persistence.saveTaskAndAppend({ task: readyTask.task, expectedVersion: current.version, events: [readyTask.event], commands: [] });
        current = readyTask.task;
      }
      if (current.state === 'READY') {
        const running = transitionTask(current, { type: 'TASK_STARTED', sessionId: importSessionId(task.id) }, { actor, now: harness.clock.now(), evidenceIds: [], isDeployment: false });
        await harness.persistence.saveTaskAndAppend({ task: running.task, expectedVersion: current.version, events: [running.event], commands: [] });
        current = running.task;
      }
      const failed = transitionTask(current, { type: 'TASK_FAILED', failureFingerprint: `fingerprint:${task.id}` }, { actor, now: harness.clock.now(), evidenceIds: [], isDeployment: false });
      await harness.persistence.saveTaskAndAppend({ task: failed.task, expectedVersion: current.version, events: [failed.event], commands: [] });
    }
    const record = await harness.recovery.start({ taskId: task.id, failure: { taskId: task.id, attemptId: `attempt:${cycle}`, errorClass: 'SimulatedFailure', commandName: 'fake.execute', message: 'deterministic failure', evidenceIds: [] }, actor, correlationId: task.traceId });
    if (record.cycle !== cycle) throw new Error('Recovery cycle sequence diverged');
    const simulatedExecution = executeRecoveryPlan(record.plan, succeeds ? 'SUCCEED' : 'FAIL');
    await harness.recovery.complete({ recoveryId: record.recoveryId, taskId: task.id, succeeded: simulatedExecution.outcome === 'SUCCEED', evidenceIds: [`recovery-evidence:${task.id}:${cycle}`] });
    const completedRecord = await harness.recoveryRecords.get(record.recoveryId);
    if (completedRecord === null) throw new Error('Recovery record was not persisted');
    recoveryAttempts.push({
      taskId: task.id,
      cycle,
      fingerprint: completedRecord.fingerprint,
      selectedStrategyName: record.plan.strategyName,
      usedStrategyName: simulatedExecution.appliedStrategyName,
      state: completedRecord.state
    });
    return recoveryAttempts.at(-1)!;
  };
  await recoveryFor(retry, 1, false);
  await recoveryFor(retry, 2, false);
  const successfulAttempt = await recoveryFor(retry, 3, true);
  for (let cycle = 1; cycle <= 5; cycle += 1) await recoveryFor(escalated, cycle, false);
  const ready = transitionTask((await harness.tasks.get(independent.id))!, { type: 'TASK_READY' }, { actor, now: harness.clock.now(), evidenceIds: [], isDeployment: false });
  await harness.persistence.saveTaskAndAppend({ task: ready.task, expectedVersion: ready.task.version - 1, events: [ready.event], commands: [] });
  const started = transitionTask(ready.task, { type: 'TASK_STARTED', sessionId: importSessionId(independent.id) }, { actor, now: harness.clock.now(), evidenceIds: [], isDeployment: false });
  await harness.persistence.saveTaskAndAppend({ task: started.task, expectedVersion: ready.task.version, events: [started.event], commands: [] });
  const completed = transitionTask(started.task, { type: 'TASK_COMPLETED', evidenceIds: [`evidence:${independent.id}`] }, { actor, now: harness.clock.now(), evidenceIds: [], isDeployment: false });
  await harness.persistence.saveTaskAndAppend({ task: completed.task, expectedVersion: started.task.version, events: [completed.event], commands: [] });
  const taskList = await harness.tasks.listByWorkflow(workflow);
  const retryRecords = await harness.recoveryRecords.list(retry.id);
  const escalationRecords = await harness.recoveryRecords.list(escalated.id);
  return {
    successfulRecoveryCycles: retryRecords.filter(({ state }) => state === 'SUCCEEDED').length,
    retryRecoveryCycles: retryRecords.length,
    escalatedRecoveryCycles: escalationRecords.length,
    escalatedTaskCount: taskList.filter(({ state }) => state === 'ESCALATED_TO_CEO').length,
    independentBranchState: taskList.find(({ id }) => id === independent.id)!.state,
    dependentBranchState: taskList.find(({ id }) => id === dependent.id)!.state,
    recoveryAttempts,
    successfulStrategyName: successfulAttempt.usedStrategyName
  };
}

const importSessionId = (id: TaskId) => {
  return agentSessionId(`simulated:${id}`);
};
