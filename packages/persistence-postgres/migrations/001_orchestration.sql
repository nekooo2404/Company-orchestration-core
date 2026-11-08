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
  is_deployment boolean
);

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
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL
);

CREATE TABLE IF NOT EXISTS task_dispatch_claims (
  task_id text PRIMARY KEY REFERENCES tasks(task_id) ON DELETE CASCADE,
  worker_id text NOT NULL,
  agent_definition_id text NOT NULL,
  task_version integer NOT NULL,
  task_state text NOT NULL CHECK (task_state = 'READY'),
  lease_id text NOT NULL UNIQUE,
  session_id text NOT NULL,
  expires_at timestamptz NOT NULL
);

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
  decided_by jsonb,
  decided_at timestamptz,
  version integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL
);
