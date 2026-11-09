import { Pool } from 'pg';
import { TaskSchema } from '@aicompany/contracts';
import type { Mission, MissionStore } from '@aicompany/control-plane';

interface MissionRow {
  mission_id: string;
  project_id: string;
  title: string;
  brief: string;
  workflow_id: string;
  status: Mission['status'];
  tasks: unknown;
  idempotency_key: string | null;
  request_fingerprint: string | null;
  created_at: Date;
  updated_at: Date;
}

const missionSelect = `SELECT mission_id, project_id, title, brief, workflow_id, status, tasks,
  idempotency_key, request_fingerprint, created_at, updated_at FROM missions`;

const hydrate = (row: MissionRow): Mission => ({
  missionId: row.mission_id,
  projectId: row.project_id,
  title: row.title,
  brief: row.brief,
  workflowId: row.workflow_id as Mission['workflowId'],
  status: row.status,
  tasks: (row.tasks as unknown[]).map((task) => {
    const value = task as Record<string, unknown>;
    return TaskSchema.parse({ ...value, createdAt: new Date(String(value.createdAt)), updatedAt: new Date(String(value.updatedAt)) });
  }),
  createdAt: row.created_at,
  updatedAt: row.updated_at
});

export class PostgresMissionStore implements MissionStore {
  public constructor(private readonly pool: Pool) {}

  public static connect(connectionString: string): PostgresMissionStore {
    return new PostgresMissionStore(new Pool({ connectionString }));
  }

  public async migrate(sql: string): Promise<void> { await this.pool.query(sql); }
  public async close(): Promise<void> { await this.pool.end(); }

  public async save(mission: Mission, metadata?: { idempotencyKey?: string; requestFingerprint?: string }): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      if (metadata?.idempotencyKey && metadata.requestFingerprint) {
        const existing = await client.query<MissionRow>(`${missionSelect} WHERE idempotency_key = $1 FOR UPDATE`, [metadata.idempotencyKey]);
        const row = existing.rows[0];
        if (row) {
          if (row.request_fingerprint !== metadata.requestFingerprint) throw new Error('Mission idempotency key was reused with different input');
          await client.query('COMMIT');
          return;
        }
      }
      await client.query(`INSERT INTO missions (mission_id, project_id, title, brief, workflow_id, status, tasks, idempotency_key, request_fingerprint, created_at, updated_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
        ON CONFLICT (mission_id) DO UPDATE SET project_id=EXCLUDED.project_id, title=EXCLUDED.title,
          brief=EXCLUDED.brief, workflow_id=EXCLUDED.workflow_id, status=EXCLUDED.status,
          tasks=EXCLUDED.tasks, updated_at=EXCLUDED.updated_at`, [mission.missionId, mission.projectId, mission.title, mission.brief, mission.workflowId, mission.status, JSON.stringify(mission.tasks), metadata?.idempotencyKey ?? null, metadata?.requestFingerprint ?? null, mission.createdAt, mission.updatedAt]);
      await client.query('COMMIT');
    } catch (error) { await client.query('ROLLBACK').catch(() => undefined); throw error; }
    finally { client.release(); }
  }

  public async findByIdempotencyKey(idempotencyKey: string): Promise<{ fingerprint: string; mission: Mission } | null> {
    const result = await this.pool.query<MissionRow>(`${missionSelect} WHERE idempotency_key = $1`, [idempotencyKey]);
    const row = result.rows[0];
    return row?.request_fingerprint ? { fingerprint: row.request_fingerprint, mission: hydrate(row) } : null;
  }

  public async get(missionId: string): Promise<Mission | null> {
    const result = await this.pool.query<MissionRow>(`${missionSelect} WHERE mission_id = $1`, [missionId]);
    return result.rows[0] ? hydrate(result.rows[0]) : null;
  }

  public async list(projectId: string): Promise<Mission[]> {
    const result = await this.pool.query<MissionRow>(`${missionSelect} WHERE project_id = $1 ORDER BY updated_at DESC`, [projectId]);
    return result.rows.map(hydrate);
  }
}
