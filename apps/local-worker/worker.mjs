import { Pool } from 'pg';
import { agentDefinitionId, agentSessionId } from '@aicompany/contracts';
import { DockerToolRunner, FilesystemWorkspace } from '@aicompany/execution-plane';
import { OpenAICompatibleGateway } from '@aicompany/model-gateway';
import { RecoveryCoordinatorService, InMemoryTraceSink, createDefaultRecoveryStrategies, SchedulerService, transitionTask } from '@aicompany/orchestration-core';
import { PostgresCostSink, PostgresMissionStore, PostgresModelEndpointStore, PostgresOutbox, PostgresRecoveryRecordStore, PostgresStore, PostgresTaskRepository } from '@aicompany/persistence-postgres';
import process from 'node:process';
import { env, stdout } from 'node:process';
import { mkdir } from 'node:fs/promises';

const required = (name) => {
  const value = env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
};

const databaseUrl = required('DATABASE_URL');
const workerId = env.WORKER_ID?.trim() || `local-worker-${process.pid}`;
const projectId = env.WORKER_PROJECT_ID?.trim() || 'aicompany';
const intervalMs = Number(env.WORKER_INTERVAL_MS ?? 1000);
const capacity = Number(env.WORKER_CAPACITY ?? 10);
const agentId = agentDefinitionId(env.WORKER_AGENT_ID?.trim() || 'agent:local-worker');
const workspaceRoot = env.WORKSPACE_ROOT?.trim() || './.local/workspaces';

if (!Number.isInteger(intervalMs) || intervalMs < 250) throw new Error('WORKER_INTERVAL_MS must be an integer >= 250');
if (!Number.isInteger(capacity) || capacity < 1) throw new Error('WORKER_CAPACITY must be a positive integer');

const pool = new Pool({ connectionString: databaseUrl });
const endpointStore = new PostgresModelEndpointStore(pool);
const configuredEndpoint = await endpointStore.get(env.MODEL_ENDPOINT_ID?.trim() || 'default');
const modelBaseUrl = env.MODEL_BASE_URL?.trim() || configuredEndpoint?.baseUrl;
const modelName = env.MODEL_NAME?.trim() || configuredEndpoint?.model;
const modelEndpointId = configuredEndpoint?.id || env.MODEL_ENDPOINT_ID?.trim() || 'default';
const modelCredentialRef = env.MODEL_CREDENTIAL_REF?.trim() || configuredEndpoint?.credentialRef || 'env:MODEL_API_KEY';
if (!modelBaseUrl) throw new Error('MODEL_BASE_URL or configured model endpoint is required');
if (!modelName) throw new Error('MODEL_NAME or configured model endpoint is required');
const store = new PostgresStore(pool);
const tasks = new PostgresTaskRepository(pool);
const outbox = new PostgresOutbox(pool, { leaseDurationMs: 60_000 });
const missions = new PostgresMissionStore(pool);
const recoveryRecords = new PostgresRecoveryRecordStore(pool);
const trace = new InMemoryTraceSink();
const costs = new PostgresCostSink(pool);
const workspace = new FilesystemWorkspace(workspaceRoot);
await mkdir(workspaceRoot, { recursive: true });
const workspaceDescriptors = new Map();
const dockerRunner = new DockerToolRunner(workspace, workspaceDescriptors, {
  maxConcurrentProcesses: capacity, maxOutputBytes: 64 * 1024, maxFileBytes: 2 * 1024 * 1024,
  timeoutMs: 120_000, allowNetwork: env.WORKER_ALLOW_NETWORK === 'true', maxMemoryMb: 1024, maxCpuCores: 1, maxPids: 128
});
const gateway = new OpenAICompatibleGateway({
  endpoints: [{ id: modelEndpointId, provider: configuredEndpoint?.provider || env.MODEL_PROVIDER?.trim() || 'openai-compatible', baseUrl: modelBaseUrl, model: modelName, credentialRef: modelCredentialRef, timeoutMs: configuredEndpoint?.timeoutMs || 120_000, maxRetries: configuredEndpoint?.maxRetries ?? 2, circuitFailureThreshold: configuredEndpoint?.circuitFailureThreshold || 3, circuitResetMs: configuredEndpoint?.circuitResetMs || 30_000, inputCostPerMillionTokens: configuredEndpoint?.inputCostPerMillionTokens, outputCostPerMillionTokens: configuredEndpoint?.outputCostPerMillionTokens, allowInsecureLocalHttp: configuredEndpoint?.allowInsecureLocalHttp ?? env.MODEL_ALLOW_INSECURE_LOCAL_HTTP === 'true' }],
  secrets: { async resolve(reference) { if (!reference.startsWith('env:')) throw new Error('Local worker only supports env: credential references'); return required(reference.slice(4)); } },
  usage: costs,
  audit: { async record(record) { stdout.write(`[gateway] ${JSON.stringify(record)}\n`); } }
});
const recovery = new RecoveryCoordinatorService({ taskRepository: tasks, transactionalPersistence: store, records: recoveryRecords, strategies: createDefaultRecoveryStrategies() });
const agents = [{ id: agentId, department: env.WORKER_DEPARTMENT?.trim() || 'Development', allowedCapabilities: ['repo.read', 'test.run'], budget: { maxTokens: 100_000, maxCostUsd: 100 }, maxConcurrency: capacity }];

const launcher = {
  persistsStart: false,
  async launch(input) {
    return { sessionId: input.sessionId, taskId: input.taskId, workflowId: input.workflowId, agentDefinitionId: input.agentDefinitionId, state: 'RUNNING', contextReference: `worker:${input.sessionId}`, checkpointReference: null, traceId: input.correlationId, usage: { inputTokens: 0, outputTokens: 0, costUsd: 0 }, toolCallHistory: [], attempt: 1, version: 0, createdAt: new Date(), updatedAt: new Date() };
  },
  async stop() {}
};

const scheduler = new SchedulerService({ taskRepository: tasks, transactionalPersistence: store, launcher, clock: { now: () => new Date() }, agentDefinitions: agents, providerHealthy: async () => (await gateway.health(modelEndpointId)).healthy, recoveryCoordinator: recovery });

const seedMission = async (mission) => {
  const descriptor = await workspace.create({ projectId: mission.projectId, canonicalSource: 'INTERNAL' });
  workspaceDescriptors.set(mission.projectId, descriptor);
  for (const task of mission.tasks) {
    if ((await tasks.get(task.id)) === null) await tasks.save(task, 0);
  }
};

const updateMission = async (mission) => {
  const refreshed = await Promise.all(mission.tasks.map((task) => tasks.get(task.id)));
  const currentTasks = refreshed.filter(Boolean);
  const status = currentTasks.some((task) => ['BLOCKED', 'FAILED', 'ESCALATED_TO_CEO'].includes(task.state)) ? 'BLOCKED' : currentTasks.length > 0 && currentTasks.every((task) => task.state === 'COMPLETED') ? 'COMPLETED' : currentTasks.some((task) => task.state === 'RUNNING') ? 'RUNNING' : 'PENDING';
  await missions.save({ ...mission, tasks: currentTasks, status, updatedAt: new Date() });
};

const processStartCommand = async (command) => {
  if (command.type !== 'START_AGENT_SESSION') return;
  const taskId = command.payload.taskId;
  const task = await tasks.get(taskId);
  if (!task || task.state !== 'RUNNING') return;
  const sessionId = agentSessionId(command.payload.idempotencyKey);
  const span = trace.startSpan({ name: 'worker.model-task', workflowId: task.workflowId, taskId: task.id, sessionId, correlationId: task.traceId, attributes: { workerId } });
  try {
    const response = await gateway.complete({ workflowId: task.workflowId, taskId: task.id, agentSessionId: sessionId, agentDefinitionId: agentId, department: agents[0].department, correlationId: task.traceId, messages: [{ role: 'system', content: `You are an execution agent. Output contract: ${task.outputContract}` }, { role: 'user', content: task.description ?? task.title ?? task.id }], maxTokens: Math.min(task.budget.maxTokens, 4_000) });
    const sandbox = await dockerRunner.run(task.projectId, { command: 'node', args: ['-e', 'process.stdout.write("sandbox-ready")'], network: false });
    if (sandbox.exitCode !== 0) throw new Error(`Docker sandbox validation failed: ${sandbox.stderr}`);
    const completed = transitionTask(task, { type: 'TASK_COMPLETED', evidenceIds: [`model:${response.requestId}`, `sandbox:${task.id}`] }, { actor: { kind: 'SYSTEM', name: workerId }, now: new Date(), evidenceIds: [`model:${response.requestId}`, `sandbox:${task.id}`], isDeployment: task.isDeployment ?? false });
    await store.saveTaskAndAppend({ task: completed.task, expectedVersion: task.version, events: [completed.event], commands: [] });
    span.end({ inputTokens: response.inputTokens, outputTokens: response.outputTokens });
  } catch (error) {
    span.fail(error instanceof Error ? error : new Error(String(error)));
    const failed = transitionTask(task, { type: 'TASK_FAILED', failureFingerprint: `worker:${task.id}:${error instanceof Error ? error.name : 'UnknownError'}` }, { actor: { kind: 'SYSTEM', name: workerId }, now: new Date(), evidenceIds: [], isDeployment: task.isDeployment ?? false });
    await store.saveTaskAndAppend({ task: failed.task, expectedVersion: task.version, events: [failed.event], commands: [] });
    await recovery.handleTaskEvent(failed.event);
  }
};

const tick = async () => {
  for (const mission of await missions.list(projectId)) {
    await seedMission(mission);
    await scheduler.tick({ workflowId: mission.workflowId, capacity, workerId });
    const commands = await outbox.claim(capacity, workerId);
    for (const command of commands) {
      try { await processStartCommand(command); if (command.type === 'START_AGENT_SESSION') await outbox.markCompleted(command.commandId); }
      catch (error) { stdout.write(`[worker-error] ${error instanceof Error ? error.message : String(error)}\n`); }
    }
    await updateMission(mission);
  }
};

let stopping = false;
const shutdown = async () => { if (stopping) return; stopping = true; await pool.end(); process.exit(0); };
process.once('SIGINT', shutdown);
process.once('SIGTERM', shutdown);
stdout.write(`[worker] ${workerId} watching project ${projectId}\n`);
while (!stopping) { try { await tick(); } catch (error) { stdout.write(`[worker-error] ${error instanceof Error ? error.message : String(error)}\n`); } await new Promise((resolve) => globalThis.setTimeout(resolve, intervalMs)); }
