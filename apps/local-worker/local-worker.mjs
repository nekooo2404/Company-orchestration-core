import { agentDefinitionId, agentSessionId } from '../../packages/contracts/dist/index.js';
import { ProcessToolRunner, FilesystemWorkspace } from '../../packages/execution-plane/dist/index.js';
import { FileAgentProfileStore, FileModelEndpointStore, FileMissionStore } from '../../packages/control-plane/dist/index.js';
import { OpenAICompatibleGateway } from '../../packages/model-gateway/dist/index.js';
import {
  InMemoryApprovalStore,
  InMemoryApprovalTransactionalPersistence,
  InMemoryEventStore,
  InMemoryOutbox,
  InMemoryRecoveryRecordStore,
  InMemoryTaskRepository,
  InMemoryTraceSink,
  RecoveryCoordinatorService,
  SchedulerService,
  createDefaultRecoveryStrategies,
  transitionTask
} from '../../packages/orchestration-core/dist/index.js';
import process from 'node:process';
import { env, stdout } from 'node:process';
import { mkdir } from 'node:fs/promises';

const required = (name) => {
  const value = env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
};

const dataRoot = env.LOCAL_DATA_DIR?.trim() || './.local/data';
const projectId = env.WORKER_PROJECT_ID?.trim() || 'aicompany';
const workerId = env.WORKER_ID?.trim() || `local-worker-${process.pid}`;
const intervalMs = Number(env.WORKER_INTERVAL_MS ?? 1000);
const capacity = Number(env.WORKER_CAPACITY ?? 4);
const agentId = agentDefinitionId(env.WORKER_AGENT_ID?.trim() || 'agent:local-worker');
const workspaceRoot = env.WORKSPACE_ROOT?.trim() || `${dataRoot}/workspaces`;
if (!Number.isInteger(intervalMs) || intervalMs < 250) throw new Error('WORKER_INTERVAL_MS must be an integer >= 250');
if (!Number.isInteger(capacity) || capacity < 1) throw new Error('WORKER_CAPACITY must be a positive integer');

await mkdir(workspaceRoot, { recursive: true });
const missions = new FileMissionStore(`${dataRoot}/missions.json`);
const endpointStore = new FileModelEndpointStore(`${dataRoot}/model-endpoints.json`);
const agentProfiles = new FileAgentProfileStore(`${dataRoot}/agents.json`);
const agentProfile = await agentProfiles.get(agentId);
let endpoint = await endpointStore.get(agentProfile?.endpointId || env.MODEL_ENDPOINT_ID?.trim() || 'default');
while (!endpoint) {
  stdout.write('[local-worker] waiting for model endpoint configuration\\n');
  await new Promise((resolve) => globalThis.setTimeout(resolve, 2000));
  endpoint = await endpointStore.get(env.MODEL_ENDPOINT_ID?.trim() || 'default');
}
const modelBaseUrl = endpoint.baseUrl;
const modelName = endpoint.model;
const modelCredentialRef = endpoint.credentialRef;
const tasks = new InMemoryTaskRepository();
const events = new InMemoryEventStore();
const outbox = new InMemoryOutbox({ leaseDurationMs: 60_000 });
const approvals = new InMemoryApprovalStore();
const records = new InMemoryRecoveryRecordStore();
const persistence = new InMemoryApprovalTransactionalPersistence({ tasks, events, outbox, approvals, records });
const recovery = new RecoveryCoordinatorService({ taskRepository: tasks, transactionalPersistence: persistence, records, strategies: createDefaultRecoveryStrategies() });
const trace = new InMemoryTraceSink();
const workspace = new FilesystemWorkspace(workspaceRoot);
const descriptors = new Map();
const runner = new ProcessToolRunner(workspace, descriptors, {
  maxConcurrentProcesses: capacity, maxOutputBytes: 64 * 1024, maxFileBytes: 2 * 1024 * 1024,
  timeoutMs: 120_000, allowNetwork: false, maxMemoryMb: 1024, maxCpuCores: 1, maxPids: 128
}, new Set(['node', process.execPath]));
const gateway = new OpenAICompatibleGateway({
  endpoints: [{ id: endpoint.id, provider: endpoint.provider, baseUrl: modelBaseUrl, model: modelName, credentialRef: modelCredentialRef, timeoutMs: endpoint.timeoutMs, maxRetries: endpoint.maxRetries, circuitFailureThreshold: endpoint.circuitFailureThreshold, circuitResetMs: endpoint.circuitResetMs, inputCostPerMillionTokens: endpoint.inputCostPerMillionTokens, outputCostPerMillionTokens: endpoint.outputCostPerMillionTokens, allowInsecureLocalHttp: endpoint.allowInsecureLocalHttp }],
  secrets: { async resolve(reference) { if (endpoint.apiKey) return endpoint.apiKey; if (!reference.startsWith('env:')) throw new Error('Local worker only supports env: credential references'); return required(reference.slice(4)); } },
  audit: { async record(record) { stdout.write(`[gateway] ${JSON.stringify(record)}\n`); } }
});
const agents = [{ id: agentId, department: agentProfile?.department || env.WORKER_DEPARTMENT?.trim() || 'Development', allowedCapabilities: ['repo.read', 'test.run'], budget: { maxTokens: 100_000, maxCostUsd: 100 }, maxConcurrency: capacity }];
const launcher = {
  persistsStart: false,
  async launch(input) { return { sessionId: input.sessionId, taskId: input.taskId, workflowId: input.workflowId, agentDefinitionId: input.agentDefinitionId, state: 'RUNNING', contextReference: `worker:${input.sessionId}`, checkpointReference: null, traceId: input.correlationId, usage: { inputTokens: 0, outputTokens: 0, costUsd: 0 }, toolCallHistory: [], attempt: 1, version: 0, createdAt: new Date(), updatedAt: new Date() }; },
  async stop() {}
};
const scheduler = new SchedulerService({ taskRepository: tasks, transactionalPersistence: persistence, launcher, clock: { now: () => new Date() }, agentDefinitions: agents, providerHealthy: async () => (await gateway.health(endpoint.id)).healthy, recoveryCoordinator: recovery });

const seedMission = async (mission) => {
  descriptors.set(mission.projectId, await workspace.create({ projectId: mission.projectId, canonicalSource: 'INTERNAL' }));
  for (const task of mission.tasks) if ((await tasks.get(task.id)) === null) await tasks.save(task, 0);
};

const updateMission = async (mission) => {
  const currentTasks = (await Promise.all(mission.tasks.map((task) => tasks.get(task.id)))).filter(Boolean);
  const status = currentTasks.some((task) => ['BLOCKED', 'FAILED', 'ESCALATED_TO_CEO'].includes(task.state)) ? 'BLOCKED' : currentTasks.length > 0 && currentTasks.every((task) => task.state === 'COMPLETED') ? 'COMPLETED' : currentTasks.some((task) => task.state === 'RUNNING') ? 'RUNNING' : 'PENDING';
  await missions.save({ ...mission, tasks: currentTasks, status, updatedAt: new Date() });
};

const processStartCommand = async (command) => {
  if (command.type !== 'START_AGENT_SESSION') return;
  const task = await tasks.get(command.payload.taskId);
  if (!task || task.state !== 'RUNNING') return;
  const sessionId = agentSessionId(command.payload.idempotencyKey);
  const span = trace.startSpan({ name: 'local-worker.model-task', workflowId: task.workflowId, taskId: task.id, sessionId, correlationId: task.traceId, attributes: { workerId } });
  try {
    const response = await gateway.complete({ workflowId: task.workflowId, taskId: task.id, agentSessionId: sessionId, agentDefinitionId: agentId, department: agents[0].department, correlationId: task.traceId, messages: [{ role: 'system', content: `You are an execution agent. Output contract: ${task.outputContract}` }, { role: 'user', content: task.description ?? task.title ?? task.id }], maxTokens: Math.min(task.budget.maxTokens, 4_000) });
    const executable = process.execPath;
    const sandbox = await runner.run(task.projectId, { command: executable, args: ['-e', 'process.stdout.write("sandbox-ready")'], env: { ELECTRON_RUN_AS_NODE: '1' }, network: false });
    if (sandbox.exitCode !== 0) throw new Error(`Local sandbox validation failed: ${sandbox.stderr}`);
    const completed = transitionTask(task, { type: 'TASK_COMPLETED', evidenceIds: [`model:${response.requestId}`, `sandbox:${task.id}`] }, { actor: { kind: 'SYSTEM', name: workerId }, now: new Date(), evidenceIds: [`model:${response.requestId}`, `sandbox:${task.id}`], isDeployment: task.isDeployment ?? false });
    await persistence.saveTaskAndAppend({ task: completed.task, expectedVersion: task.version, events: [completed.event], commands: [] });
    span.end({ inputTokens: response.inputTokens, outputTokens: response.outputTokens });
  } catch (error) {
    span.fail(error instanceof Error ? error : new Error(String(error)));
    const failed = transitionTask(task, { type: 'TASK_FAILED', failureFingerprint: `worker:${task.id}:${error instanceof Error ? error.name : 'UnknownError'}` }, { actor: { kind: 'SYSTEM', name: workerId }, now: new Date(), evidenceIds: [], isDeployment: task.isDeployment ?? false });
    await persistence.saveTaskAndAppend({ task: failed.task, expectedVersion: task.version, events: [failed.event], commands: [] });
    await recovery.handleTaskEvent(failed.event);
  }
};

const tick = async () => {
  for (const mission of await missions.list(projectId)) {
    await seedMission(mission);
    await scheduler.tick({ workflowId: mission.workflowId, capacity, workerId });
    for (const command of await outbox.claim(capacity, workerId)) { await processStartCommand(command); if (command.type === 'START_AGENT_SESSION') await outbox.markCompleted(command.commandId); }
    await updateMission(mission);
  }
};

let stopping = false;
process.once('SIGINT', () => { stopping = true; });
process.once('SIGTERM', () => { stopping = true; });
stdout.write(`[local-worker] ${workerId} watching project ${projectId}\n`);
while (!stopping) { try { await tick(); } catch (error) { stdout.write(`[worker-error] ${error instanceof Error ? error.message : String(error)}\n`); } await new Promise((resolve) => globalThis.setTimeout(resolve, intervalMs)); }
