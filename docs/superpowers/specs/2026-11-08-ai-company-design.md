# AI Company SaaS Design

**Date:** 2026-11-08
**Status:** Ready for user review

## 1. Product Definition

AI Company is a cloud SaaS for one CEO/Manager who submits a software solution brief as chat or uploaded documents. The system converts the brief into a durable software-delivery workflow and coordinates 50+ independent LLM agents as a virtual software company.

The CEO provides direction and controls exceptions. Agents perform planning, implementation, review, testing, security checks, merge and staging preparation automatically. Production or real-environment deployment always stops for CEO approval.

The first proof is one end-to-end project run:

```text
Brief -> plan -> parallel agents -> review/test -> merge -> staging -> CEO deploy approval
```

## 2. Decisions

- Deployment model: cloud SaaS.
- Initial human user: one CEO account; no team accounts in the MVP.
- Organization model: default software-company hierarchy with editable departments, roles, agents and supervisors.
- Agent autonomy: agents run the workflow without routine CEO approval; permission escalation, security risk and deployment require approval.
- Concurrency target: 50+ LLM agents active at the same time for a project workflow.
- Agent runtime: every active agent is an independent LLM session with its own persona, memory scope, tools and task state.
- Project execution: one persistent VM/workspace per project.
- Source modes: external GitHub/GitLab repository, internal SaaS workspace, or hybrid mode with one canonical source and one execution mirror.
- Model access: platform-managed keys and BYOK; model selection can vary by agent or project.
- Model endpoint: CEO configures `base_url`, model name, credential reference, headers, timeout and retry policy. Endpoints are public HTTPS URLs or tunnels supplied by the CEO.
- Communication: hierarchy for assignments and reporting; scoped peer-to-peer channels inside a task/project; all messages and decisions are auditable.
- Memory: private agent memory, project knowledge and company knowledge.
- Failure handling: `BLOCKED` and `FAILED` start automatic recovery; each task gets at most five recovery cycles before escalation.
- Merge/deploy: merge is automatic after required quality gates; deployment requires CEO approval.
- UI: Mission Grid control room with Graphite Signal visual direction and contextual chat.
- Initial toolchain profiles: JavaScript/TypeScript, Python, .NET and Java. The JavaScript/TypeScript profile includes Next.js, React, TailwindCSS, Fragment UI and Kibo UI.

## 3. Scope and Non-Goals

### In scope

- Brief intake from chat and uploaded documents.
- Brief normalization into project goals, constraints, acceptance criteria and risk level.
- Default and configurable software-company organization.
- Durable task graph and dependency scheduling.
- 50+ concurrent LLM agent sessions.
- Agent-to-agent communication with scoped channels and typed events.
- Persistent project VM/workspace.
- GitHub/GitLab and internal workspace adapters.
- Model Gateway with custom `base_url`, platform keys and BYOK.
- Three memory scopes with access control and promotion rules.
- Automatic recovery, retries, alternative strategies and rollback.
- Build, review, test, security and merge gates.
- Platform preview/staging and external cloud deployment integrations.
- CEO approval for deployment.
- Mission Grid, contextual chat, audit, tracing and cost visibility.

### Out of scope for the MVP

- Multi-tenant public SaaS and customer billing.
- Multiple human users and team permissions.
- Mobile application.
- Agent marketplace.
- Private network connector for endpoints that are not reachable through a public URL or tunnel.
- Unapproved production deployment.
- Model training or fine-tuning.
- A full visual workflow-builder. Organization and role configuration are supported through the initial configuration surface.

## 4. Architecture

### 4.1 Control plane

The control plane is the source of truth for workflow state and policy. It contains these logical components:

1. **Intake service**: accepts chat/documents and produces a normalized project brief.
2. **Organization registry**: stores departments, roles, agent definitions, supervisors and capability policies.
3. **Workflow orchestrator**: owns durable workflow state, task graph transitions, dependencies, retries, timeouts, cancellation and approval states.
4. **Scheduler**: selects ready tasks, applies priority/fairness/quota rules and starts agent sessions.
5. **Agent session manager**: creates, checkpoints, resumes and terminates independent LLM sessions.
6. **Communication service**: publishes typed events and enforces scoped project/task channels.
7. **Model Gateway**: routes calls to configured `base_url` endpoints, applies auth, limits, retries, circuit breaking and audit.
8. **Memory service**: indexes private, project and company knowledge under ACLs.
9. **Policy and approval service**: evaluates capabilities, risk, secrets, deployment and CEO commands.
10. **Audit and observability service**: records state changes, traces, metrics, logs, cost and recovery evidence.
11. **Control Room API/UI**: exposes Mission Grid, contextual chat and CEO commands.

The Manager agent is a planner and coordinator, not the authoritative workflow state store. LLM output can propose a transition, but the orchestrator validates and commits it.

### 4.2 Execution plane

Each project has a persistent VM/workspace containing source code, dependencies, build cache, test tools and Git operations. Agent sessions invoke project tools through a capability-controlled tool runner. The VM has CPU, memory, process and network egress quotas.

The persistent VM is the durable project workspace. High-load operations may be queued or assigned to separate execution workers without changing the project source-of-truth model.

Secrets are referenced through scoped secret references. Raw API keys, Git tokens and cloud credentials are never placed in agent prompts, source files or ordinary logs.

### 4.3 Data stores

- **Transactional state store**: projects, workflows, tasks, agents, sessions, permissions and approvals.
- **Append-only event log**: messages, state transitions, tool calls, recovery records and CEO commands.
- **Object storage**: documents, logs, snapshots, test reports, build artifacts and deployment evidence.
- **Knowledge index**: memory retrieval filtered by project, scope, role and ACL.
- **Project VM storage**: code, dependencies, caches and workspace state.

Specific infrastructure vendors are implementation-plan decisions, but the interfaces must preserve transactional workflow state, durable events, immutable artifact references and scoped retrieval.

## 5. Organization and Agent Runtime

### 5.1 Agent Definition

An Agent Definition is a durable configuration containing:

- role, department and supervisor;
- mission, persona and system policy;
- preferred model/provider;
- allowed tool capabilities;
- readable and writable memory scopes;
- budget, timeout and concurrency limits;
- recovery policy and output contract.

### 5.2 Agent Session

An Agent Session is one runtime instance for one task/project. It contains its own context, checkpoint, trace ID, token/cost usage, state and tool-call history. It can be paused, resumed, retried, terminated or reassigned.

The session is hydrated from the Agent Definition, project knowledge, task context and the latest valid checkpoint. A session may communicate directly only through channels allowed by its task and capability policy.

### 5.3 Default organization

The default hierarchy is:

```text
CEO
  -> Manager
      -> Product
      -> Architecture
      -> Development
      -> Code Review
      -> QA
      -> Security
      -> DevOps
      -> Documentation
```

The CEO can add, remove or edit departments, roles, supervisors and agent definitions without changing the orchestration core.

## 6. Workflow and Communication

### 6.1 Task model

Every task has a task ID, project ID, parent task, owner, dependencies, deadline, budget, required capabilities, output contract and trace ID.

The normal state path is:

```text
PENDING -> READY -> RUNNING -> REVIEW -> COMPLETED
```

Additional states are:

- `BLOCKED`: a dependency, input, capability or environment is unavailable.
- `RECOVERING`: an automatic diagnosis and repair cycle is active.
- `FAILED`: a current attempt failed; this immediately starts recovery.
- `ESCALATED_TO_CEO`: five recovery cycles were exhausted or a risk policy required immediate escalation.
- `CANCELLED`: stopped by CEO or orchestrator policy.
- `WAITING_FOR_APPROVAL`: an allowed human approval gate is open.

Independent tasks continue when one task is recovering or escalated. Only dependent tasks are held.

### 6.2 Communication model

- Manager and department leads assign tasks through hierarchy.
- Agents may use direct peer channels within a task or project scope.
- Typed events record meaningful state, such as `TASK_PROGRESS`, `ARTIFACT_CREATED`, `REVIEW_REQUESTED`, `BLOCKED`, `RECOVERY_STARTED`, `TASK_COMPLETED` and `DEPLOYMENT_APPROVAL_REQUESTED`.
- Architectural and requirement decisions are stored as decision records, not only as chat messages.
- Every event has an event ID, actor, correlation ID, causation ID, version and timestamp.
- Global broadcast is disabled by default to limit noise, leakage and uncontrolled loops.

## 7. Recovery and Failure Handling

`BLOCKED` and `FAILED` do not stop a workflow immediately. They start a recovery loop:

1. Diagnose logs, tool calls, diffs, test output, dependencies and environment state.
2. Create a repair task with an explicit failure fingerprint.
3. Retry or change strategy using another agent, model, tool or plan.
4. Roll back to a safe snapshot when the workspace is inconsistent.
5. Re-run verification and record evidence.

Each task has a maximum of five recovery cycles. An attempt with the same failure fingerprint cannot repeat without a changed strategy. After the fifth cycle, the task becomes `ESCALATED_TO_CEO`; independent branches continue.

Permission, secret, security-policy and high-risk failures may escalate immediately. Deploy failures roll back before recovery begins.

Recovery records include root-cause hypothesis, strategy, diff, test result, cost, actor and next action. The UI exposes the complete recovery chain.

## 8. Model Gateway and Endpoint Configuration

Each model configuration contains:

- custom `base_url`;
- model name;
- credential reference;
- optional custom headers;
- timeout and retry policy;
- per-project and per-agent access policy;
- concurrency and budget limits.

The gateway supports platform-managed credentials and BYOK. Agents never receive raw provider credentials. The gateway enforces HTTPS, valid port policy, SSRF protection, provider health checks, backoff, circuit breaker, rate limits and optional fallback routing.

The initial endpoint contract supports public HTTPS endpoints and CEO-provided tunnels. Direct inbound access from a model provider into the SaaS or project VM is not required.

## 9. Memory and Knowledge

### 9.1 Scopes

1. **Private agent memory**: accessible only to the owning agent and permitted supervisors.
2. **Project knowledge**: accessible to agents assigned to the project under role ACLs.
3. **Company knowledge**: shared across projects only after explicit promotion or policy approval.

Every memory item has source, timestamp, author, confidence, version, scope and ACL. Chat is not automatically promoted to company knowledge. Decisions, validated artifacts and approved facts are eligible for promotion.

### 9.2 Retrieval and writes

Memory retrieval is filtered before the agent sees results. Writes are attributed to an agent session and can be superseded or revoked. Project and company knowledge must retain provenance so a later agent can distinguish a source artifact from an inference.

## 10. Source, Workspace and Deployment

### 10.1 Source modes

- **External repository**: GitHub/GitLab is canonical; the project VM is an execution mirror.
- **Internal workspace**: the SaaS workspace is canonical and maintains Git history internally.
- **Hybrid**: the external repository is canonical and the internal workspace is an execution mirror.

There is never uncontrolled bidirectional sync between two writable sources.

### 10.2 Git flow

```text
Task -> task branch/changeset -> tests/review -> merge queue -> auto merge
```

Each branch, commit and merge result is linked to the originating task, agent session, prompt version, tool calls and evidence. Merge conflicts use the five-cycle recovery policy.

### 10.3 Deployment flow

```text
Merged commit -> build artifact -> preview/staging -> deployment plan -> CEO approval -> target cloud
```

The deployment approval package contains commit and artifact hashes, test/security results, environment, cloud target, migrations/config changes and rollback plan. After approval, deployment failures trigger rollback and recovery.

## 11. Scale, Resilience and Observability

The scheduler supports 50+ active sessions with project, department and priority fairness. Backpressure applies when model providers, VMs or execution workers are saturated.

Agent sessions checkpoint after model calls, tool calls and state transitions. Tool operations are idempotent or carry operation keys so retries cannot create duplicate commits or deployments.

Required resilience behavior:

- provider outage: circuit breaker, backoff, fallback or wait;
- VM crash: restart from snapshot/checkpoint;
- duplicate event: idempotency key and event version;
- network partition: no completion without state/artifact confirmation;
- audit outage: block dangerous actions until evidence can be recorded.

The control room exposes active, queued, recovering and escalated sessions; queue depth, latency, throughput and provider health; token/cost by project, department, agent, model and task; recovery rate, error fingerprints, test pass rate, merge rate and deployment status.

Budgets exist at workflow, task and agent levels. Cost anomalies can pause a branch and create a CEO escalation.

## 12. Testing and Quality Gates

The intake workflow creates a Definition of Done containing acceptance criteria, constraints, risk level and artifact requirements.

The default pipeline is:

```text
Plan -> Implement -> Review -> Test -> Security Check -> Merge -> Staging Smoke Test -> Deploy Approval
```

Roles are separated:

- Developer writes code and tests.
- Reviewer checks diff, design and maintainability.
- QA creates a test matrix, fills missing coverage and executes tests.
- Security checks secrets, dependencies, permissions and attack surface.
- DevOps verifies build artifact, config, migration and rollback.

Auto-merge requires:

- acceptance criteria evidence;
- appropriate unit/integration/e2e tests;
- lint, typecheck and build when defined by the project;
- independent reviewer and QA with no blocker;
- no critical security finding;
- traceable commit, artifact and test report.

If a repository has no tests, QA creates appropriate tests. Missing tests are not a passing result. Unsafe commands require project policy permission.

## 13. Toolchain Profiles

The orchestration core is stack-neutral. Toolchain adapters provide detection, install, build, test, lint, security and deployment recipes.

Initial profiles:

- JavaScript/TypeScript: Next.js, React, TailwindCSS, Fragment UI and Kibo UI.
- Python.
- .NET.
- Java.

Fragment UI references:

- https://www.fragmentui.com/
- https://github.com/blazejrzepa/fragment-ui-public

Kibo UI references:

- https://www.kibo-ui.com/
- https://github.com/shadcnblocks/kibo

The adapter must inspect the project lockfile, package metadata and existing imports before installing or replacing UI dependencies. It must not add both Fragment UI and Kibo UI merely because both are supported profiles.

## 14. Control Room UX

### 14.1 Layout

The primary view is Mission Grid:

- top command bar: project, workflow health, active/recovering counts, cost and global pause;
- left org rail: CEO, Manager, departments and agent statuses;
- center mission grid: stages Brief, Plan, Build, Review, QA, Merge and Deploy;
- right action rail: approvals, escalations, recoveries and decisions;
- contextual chat panel: task conversation, decisions, logs, artifacts and CEO commands.

### 14.2 Visual direction

Graphite Signal is the visual contract:

- graphite surfaces and crisp borders;
- acid-lime active/success accent;
- cobalt running/info accent;
- amber approval/warning accent;
- coral error/escalation accent;
- modern grotesk headings and readable operational text;
- compact panels with radius no greater than 8px;
- no gradients, decorative blobs, nested cards or marketing-style hero content;
- every status color also has a label/icon for accessibility.

## 15. MVP Acceptance Scenario

The MVP is accepted when the following scenario succeeds on a supported repository/project:

1. CEO submits a chat brief or document.
2. Intake creates a normalized brief and acceptance criteria.
3. Planner creates a dependency-aware task graph.
4. Scheduler starts 50+ independent LLM sessions and maintains checkpoints.
5. Agents communicate within allowed scopes and use the correct memory scopes.
6. At least one intentional failure is automatically repaired within five recovery cycles.
7. Code is reviewed, tested, security-checked and auto-merged with traceable evidence.
8. A staging artifact and deployment plan are created.
9. Workflow pauses at CEO deploy approval.
10. CEO approves through Mission Grid; deployment succeeds or rolls back and starts recovery.
11. The final report links the original brief to tasks, agent sessions, decisions, commits, tests, artifacts and deployment.

## 16. Implementation Decomposition

The product is decomposed into these implementation tracks, in order:

1. **Orchestration core**: durable workflow state, task graph, agent sessions, events, recovery and approvals.
2. **Execution plane**: persistent project VM, tool runner, snapshots, resource quotas and supported command execution.
3. **Model Gateway**: custom endpoints, platform/BYOK credentials, routing, limits, health and cost accounting.
4. **Source and deployment adapters**: internal workspace, GitHub/GitLab, preview/staging and cloud deployment approval.
5. **Memory and knowledge**: three scopes, ACLs, provenance, retrieval and promotion.
6. **Mission Grid**: Graphite Signal control room, contextual chat and CEO commands.
7. **Toolchain profiles and end-to-end verification**: JavaScript/TypeScript, Python, .NET and Java.

The first implementation plan must preserve the end-to-end acceptance scenario while landing these tracks incrementally. Multi-tenant SaaS, team accounts and billing remain separate follow-up projects.
