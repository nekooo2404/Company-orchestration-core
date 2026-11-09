# CEO Terminal

CEO owns mission commands in the terminal. Mission Grid is read-only telemetry.

## Start local control plane

```powershell
corepack pnpm control-plane:dev
```

Without `DATABASE_URL`, Control Plane uses memory storage for development.
Mission data disappears when server restarts.

For restart-safe local production, set PostgreSQL mode first:

```powershell
$env:CONTROL_PLANE_STORAGE="postgres"
$env:DATABASE_URL="postgresql://aicompany:aicompany_local_only@127.0.0.1:5432/aicompany"
corepack pnpm control-plane:dev
```

The server applies `packages/persistence-postgres/migrations/001_orchestration.sql`
before listening. Control Plane listens on `http://127.0.0.1:4000`.

## Submit mission

```powershell
corepack pnpm ceo mission submit `
  --project aicompany `
  --title "Terminal-first control plane" `
  --brief-file .\solution.md
```

Or pass inline text:

```powershell
corepack pnpm ceo mission submit `
  --project aicompany `
  --title "Build API" `
  --brief "Build API and test coverage"
```

The command returns `missionId`, workflow ID, and generated tasks. Reusing the
same `--idempotency-key` with the same input is safe; reusing it with changed
input fails.

## Observe progress

```powershell
corepack pnpm ceo mission status mission:aicompany:<key>
corepack pnpm ceo mission list --project aicompany
corepack pnpm ceo mission watch mission:aicompany:<key>
```

Mission Grid runs separately:

```powershell
corepack pnpm --filter @aicompany/mission-grid dev
```

Set `NEXT_PUBLIC_CONTROL_PLANE_URL` and `NEXT_PUBLIC_CONTROL_PLANE_PROJECT_ID`
when the dashboard needs a non-default Control Plane or project. The dashboard
does not submit, pause, cancel, or approve missions.
