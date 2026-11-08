CREATE TABLE IF NOT EXISTS workflows (
  workflow_id text PRIMARY KEY,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL
);

CREATE TABLE IF NOT EXISTS tasks (
  task_id text PRIMARY KEY,
  workflow_id text NOT NULL,
  state text NOT NULL,
  dependency_ids jsonb NOT NULL,
  recovery_cycles integer NOT NULL DEFAULT 0,
  version integer NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL,
  required_capabilities jsonb NOT NULL,
  output_contract text NOT NULL,
  budget jsonb NOT NULL,
  project_id text NOT NULL,
  parent_task_id text,
  owner_agent_definition_id text,
  deadline timestamptz,
  trace_id text NOT NULL,
  created_at timestamptz NOT NULL,
  priority integer,
  title text,
  description text,
  is_deployment boolean,
  deployment_approval_id text,
  deployment_attempt_id text
);

ALTER TABLE tasks ADD COLUMN IF NOT EXISTS deployment_approval_id text;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS deployment_attempt_id text;

CREATE TABLE IF NOT EXISTS recovery_records (
  recovery_id text PRIMARY KEY,
  task_id text NOT NULL REFERENCES tasks(task_id) ON DELETE CASCADE,
  cycle integer NOT NULL CHECK (cycle > 0 AND cycle <= 5),
  fingerprint text NOT NULL,
  plan jsonb NOT NULL,
  state text NOT NULL CHECK (state IN ('STARTED', 'SUCCEEDED', 'FAILED', 'ESCALATED')),
  created_at timestamptz NOT NULL,
  evidence_ids jsonb NOT NULL,
  start_fingerprint text,
  completion_fingerprint text,
  start_idempotency_key text,
  start_request_fingerprint text,
  completion_idempotency_key text,
  completion_request_fingerprint text,
  idempotency_key text,
  request_fingerprint text
);

ALTER TABLE recovery_records ADD COLUMN IF NOT EXISTS start_idempotency_key text;
ALTER TABLE recovery_records ADD COLUMN IF NOT EXISTS start_request_fingerprint text;
ALTER TABLE recovery_records ADD COLUMN IF NOT EXISTS completion_idempotency_key text;
ALTER TABLE recovery_records ADD COLUMN IF NOT EXISTS completion_request_fingerprint text;

CREATE UNIQUE INDEX IF NOT EXISTS recovery_records_idempotency_key
  ON recovery_records (idempotency_key)
  WHERE idempotency_key IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS recovery_records_start_idempotency_key
  ON recovery_records (start_idempotency_key)
  WHERE start_idempotency_key IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS recovery_records_completion_idempotency_key
  ON recovery_records (completion_idempotency_key)
  WHERE completion_idempotency_key IS NOT NULL;

CREATE TABLE IF NOT EXISTS agent_sessions (
  session_id text PRIMARY KEY,
  task_id text NOT NULL,
  workflow_id text NOT NULL,
  agent_definition_id text NOT NULL,
  state text NOT NULL,
  context_reference text NOT NULL,
  checkpoint_reference text,
  trace_id text NOT NULL,
  usage jsonb NOT NULL,
  tool_call_history jsonb NOT NULL,
  attempt integer,
  version integer NOT NULL DEFAULT 0,
  start_idempotency_key text,
  start_fingerprint text,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL
);

ALTER TABLE agent_sessions ADD COLUMN IF NOT EXISTS start_idempotency_key text;
ALTER TABLE agent_sessions ADD COLUMN IF NOT EXISTS start_fingerprint text;
CREATE UNIQUE INDEX IF NOT EXISTS agent_sessions_start_idempotency_key
  ON agent_sessions (task_id, start_idempotency_key)
  WHERE start_idempotency_key IS NOT NULL;

CREATE TABLE IF NOT EXISTS agent_checkpoints (
  session_id text NOT NULL REFERENCES agent_sessions(session_id) ON DELETE CASCADE,
  sequence integer NOT NULL CHECK (sequence > 0),
  task_id text NOT NULL REFERENCES tasks(task_id) ON DELETE CASCADE,
  state text NOT NULL,
  context_reference text NOT NULL,
  last_event_id text NOT NULL,
  completed_operation_keys jsonb NOT NULL,
  created_at timestamptz NOT NULL,
  PRIMARY KEY (session_id, sequence)
);

CREATE TABLE IF NOT EXISTS messages (
  message_id text PRIMARY KEY,
  idempotency_key text NOT NULL UNIQUE,
  actor jsonb NOT NULL,
  scope jsonb NOT NULL,
  message_type text NOT NULL,
  content_reference text NOT NULL,
  correlation_id text NOT NULL,
  causation_id text NOT NULL,
  created_at timestamptz NOT NULL
);

CREATE TABLE IF NOT EXISTS usage_records (
  usage_id text PRIMARY KEY,
  workflow_id text NOT NULL,
  task_id text NOT NULL,
  agent_session_id text NOT NULL,
  agent_definition_id text NOT NULL,
  department text NOT NULL,
  provider text NOT NULL,
  base_url_identifier text NOT NULL,
  model text NOT NULL,
  input_tokens integer NOT NULL CHECK (input_tokens >= 0),
  output_tokens integer NOT NULL CHECK (output_tokens >= 0),
  estimated_cost_usd double precision NOT NULL CHECK (estimated_cost_usd >= 0),
  created_at timestamptz NOT NULL
);

CREATE TABLE IF NOT EXISTS task_dispatch_claims (
  task_id text PRIMARY KEY REFERENCES tasks(task_id) ON DELETE CASCADE,
  worker_id text NOT NULL,
  agent_definition_id text NOT NULL,
  task_version integer NOT NULL,
  task_state text NOT NULL CHECK (task_state = 'READY'),
  lease_id text NOT NULL UNIQUE,
  session_id text NOT NULL,
  generation integer NOT NULL DEFAULT 1,
  cleanup_in_progress boolean NOT NULL DEFAULT false,
  expires_at timestamptz NOT NULL
);

ALTER TABLE task_dispatch_claims ADD COLUMN IF NOT EXISTS generation integer NOT NULL DEFAULT 1;
ALTER TABLE task_dispatch_claims ADD COLUMN IF NOT EXISTS cleanup_in_progress boolean NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS domain_events (
  event_id text PRIMARY KEY,
  aggregate_type text NOT NULL,
  aggregate_id text NOT NULL,
  aggregate_version integer NOT NULL,
  event_type text NOT NULL,
  payload jsonb NOT NULL,
  actor jsonb NOT NULL,
  correlation_id text NOT NULL,
  causation_id text NOT NULL,
  occurred_at timestamptz NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS domain_events_aggregate_version
  ON domain_events (aggregate_id, aggregate_version);

DROP INDEX IF EXISTS domain_events_aggregate_stream;

CREATE TABLE IF NOT EXISTS outbox_commands (
  command_id text PRIMARY KEY,
  command_type text NOT NULL,
  payload jsonb NOT NULL,
  available_at timestamptz NOT NULL,
  claimed_by text,
  claimed_at timestamptz,
  completed_at timestamptz,
  actor jsonb NOT NULL,
  issued_at timestamptz NOT NULL,
  correlation_id text NOT NULL,
  causation_id text NOT NULL,
  CONSTRAINT outbox_commands_claimed_lease_complete
    CHECK ((claimed_by IS NULL) = (claimed_at IS NULL))
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'outbox_commands'::regclass
      AND conname = 'outbox_commands_claimed_lease_complete'
  ) THEN
    ALTER TABLE outbox_commands
      ADD CONSTRAINT outbox_commands_claimed_lease_complete
      CHECK ((claimed_by IS NULL) = (claimed_at IS NULL));
  END IF;
END
$$;

CREATE INDEX IF NOT EXISTS outbox_commands_claimable
  ON outbox_commands (available_at, command_id)
  WHERE completed_at IS NULL;

CREATE TABLE IF NOT EXISTS approvals (
  approval_id text PRIMARY KEY,
  subject_type text NOT NULL,
  subject_id text NOT NULL,
  reason text NOT NULL,
  requested_by jsonb NOT NULL,
  correlation_id text NOT NULL,
  causation_id text NOT NULL,
  state text NOT NULL,
  decision text,
  decision_reason text,
  decided_by jsonb,
  decided_at timestamptz,
  version integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  request_idempotency_key text,
  request_fingerprint text,
  decision_idempotency_key text,
  decision_fingerprint text
);

ALTER TABLE approvals
  ADD COLUMN IF NOT EXISTS decision_reason text;
ALTER TABLE approvals
  ADD COLUMN IF NOT EXISTS request_idempotency_key text;
ALTER TABLE approvals
  ADD COLUMN IF NOT EXISTS request_fingerprint text;
ALTER TABLE approvals
  ADD COLUMN IF NOT EXISTS decision_idempotency_key text;
ALTER TABLE approvals
  ADD COLUMN IF NOT EXISTS decision_fingerprint text;
CREATE UNIQUE INDEX IF NOT EXISTS approvals_decision_idempotency_key
  ON approvals (decision_idempotency_key)
  WHERE decision_idempotency_key IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS approvals_request_idempotency_key
  ON approvals (request_idempotency_key)
  WHERE request_idempotency_key IS NOT NULL;
