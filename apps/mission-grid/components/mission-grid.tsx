'use client';

import { useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { Activity, AlertTriangle, CheckCircle2, ChevronRight, Clock3, Command, Cpu, GitBranch, LayoutGrid, MessageSquare, Search, ShieldCheck, Terminal, Workflow } from 'lucide-react';
import { KiboStatus } from '../ui/kibo-ui';

type Status = 'RUNNING' | 'QUEUED' | 'RECOVERING' | 'APPROVAL' | 'COMPLETED';
type Mission = { id: string; title: string; project: string; status: Status; progress: number; agents: number; tasks: number; cost: string; updated: string; lead: string; signal: string };
type ApiMission = { missionId: string; title: string; projectId: string; status: string; tasks: Array<{ state: string; ownerAgentDefinitionId: string | null }>; updatedAt: string };

const apiBaseUrl = process.env.NEXT_PUBLIC_CONTROL_PLANE_URL ?? 'http://127.0.0.1:4000';
const projectId = process.env.NEXT_PUBLIC_CONTROL_PLANE_PROJECT_ID ?? 'aicompany';

const toMission = (mission: ApiMission): Mission => {
  const total = mission.tasks.length;
  const completed = mission.tasks.filter((task) => task.state === 'COMPLETED').length;
  const hasApproval = mission.tasks.some((task) => task.state === 'WAITING_FOR_APPROVAL');
  const hasRecovery = mission.tasks.some((task) => ['BLOCKED', 'FAILED', 'RECOVERING', 'ESCALATED_TO_CEO'].includes(task.state));
  const running = mission.tasks.some((task) => task.state === 'RUNNING');
  const status: Status = hasApproval ? 'APPROVAL' : hasRecovery ? 'RECOVERING' : completed === total && total > 0 ? 'COMPLETED' : running ? 'RUNNING' : 'QUEUED';
  const signal = hasApproval ? 'CEO decision required' : hasRecovery ? 'Recovery requires attention' : status === 'COMPLETED' ? 'Evidence accepted' : status === 'RUNNING' ? 'Agents executing' : 'Waiting for capacity';
  return { id: mission.missionId, title: mission.title, project: mission.projectId, status, progress: total === 0 ? 0 : Math.round((completed / total) * 100), agents: new Set(mission.tasks.map((task) => task.ownerAgentDefinitionId).filter(Boolean)).size, tasks: total, cost: '$--', updated: new Date(mission.updatedAt).toLocaleTimeString(), lead: 'control-plane', signal };
};

const statusTone: Record<Status, 'lime' | 'cyan' | 'amber' | 'rose'> = { RUNNING: 'lime', QUEUED: 'cyan', RECOVERING: 'rose', APPROVAL: 'amber', COMPLETED: 'cyan' };
const statusLabel: Record<Status, string> = { RUNNING: 'Running', QUEUED: 'Queued', RECOVERING: 'Recovering', APPROVAL: 'Approval', COMPLETED: 'Completed' };

export function MissionGrid() {
  const [missions, setMissions] = useState<Mission[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [filter, setFilter] = useState<'ALL' | Status>('ALL');
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const response = await fetch(`${apiBaseUrl}/v1/missions?projectId=${encodeURIComponent(projectId)}`, { headers: { 'x-aicompany-actor': 'CEO' }, cache: 'no-store' });
        if (!response.ok) throw new Error(`Control Plane HTTP ${response.status}`);
        const data = await response.json() as ApiMission[];
        if (active) { const next = data.map(toMission); setMissions(next); setSelectedId((current) => next.some((mission) => mission.id === current) ? current : next[0]?.id ?? ''); setError(null); }
      } catch (cause) { if (active) setError(cause instanceof Error ? cause.message : 'Control Plane unavailable'); }
      finally { if (active) setLoading(false); }
    };
    void load(); const timer = setInterval(() => void load(), 2000);
    return () => { active = false; clearInterval(timer); };
  }, []);
  const selected = missions.find((mission) => mission.id === selectedId) ?? null;
  const visible = useMemo(() => missions.filter((mission) => (filter === 'ALL' || mission.status === filter) && `${mission.title} ${mission.project}`.toLowerCase().includes(query.toLowerCase())), [filter, query]);
  const counts = { active: missions.filter((mission) => mission.status === 'RUNNING').length, queued: missions.filter((mission) => mission.status === 'QUEUED').length, recovery: missions.filter((mission) => mission.status === 'RECOVERING').length, approval: missions.filter((mission) => mission.status === 'APPROVAL').length };

  return <main className="signal-grid min-h-screen overflow-hidden">
    <header className="border-b border-white/10 bg-graphite-950/90 px-5 py-4 backdrop-blur md:px-8">
      <div className="mx-auto flex max-w-[1680px] items-center justify-between gap-4">
        <div className="flex items-center gap-4"><div className="flex h-9 w-9 items-center justify-center rounded-md border border-signal-lime/40 bg-signal-lime/10 text-signal-lime"><Command size={18} /></div><div><div className="text-sm font-bold tracking-[.22em] text-white">MISSION GRID</div><div className="mt-1 text-[10px] uppercase tracking-[.16em] text-white/40">Graphite Signal / Control room</div></div></div>
        <div className="hidden items-center gap-5 text-[10px] uppercase tracking-[.16em] text-white/45 md:flex"><span className="flex items-center gap-2"><span className="h-2 w-2 rounded-full bg-signal-lime shadow-[0_0_12px_#b8ff5a]" />System nominal</span><span>09 Nov 2026 / 01:48 ICT</span><div className="h-5 w-px bg-white/10" /><span className="text-signal-lime">CEO / ONLINE</span></div>
      </div>
    </header>
    <section className="mx-auto max-w-[1680px] px-5 py-6 md:px-8">
      <div className="mb-7 flex flex-col justify-between gap-5 lg:flex-row lg:items-end"><div><div className="mb-3 flex items-center gap-2 text-[10px] uppercase tracking-[.2em] text-signal-lime"><Activity size={13} />Live telemetry</div><h1 className="text-3xl font-bold tracking-[-.04em] text-white md:text-5xl">Company missions</h1><p className="mt-3 max-w-xl text-sm leading-6 text-white/45">Read-only progress view. Mission commands stay in the CEO terminal.</p></div><div className="flex items-center gap-2 text-[10px] uppercase tracking-[.14em] text-white/35"><Terminal size={14} className="text-signal-lime" />CEO terminal is command center</div></div>
      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4"><Metric icon={<Activity size={15} />} label="Active missions" value={String(counts.active)} detail="+2 this hour" tone="lime" /><Metric icon={<Clock3 size={15} />} label="Queued tasks" value={String(counts.queued * 6)} detail="capacity 50 / 50" tone="cyan" /><Metric icon={<AlertTriangle size={15} />} label="Recovery" value={String(counts.recovery)} detail="1 needs watch" tone="rose" /><Metric icon={<ShieldCheck size={15} />} label="CEO approvals" value={String(counts.approval)} detail="1 decision pending" tone="amber" /></div>
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_390px]">
        <section className="overflow-hidden rounded-lg border border-white/10 bg-graphite-900/85 shadow-signal"><div className="signal-scan flex flex-col gap-4 border-b border-white/10 p-4 md:flex-row md:items-center md:justify-between"><div className="flex items-center gap-3 text-xs font-bold uppercase tracking-[.15em] text-white/70"><LayoutGrid size={15} className="text-signal-lime" /> Mission telemetry <span className="rounded bg-white/5 px-2 py-1 text-[10px] text-white/35">{visible.length} / {missions.length}</span></div><div className="flex flex-wrap items-center gap-2"><div className="flex items-center gap-2 rounded-md border border-white/10 bg-black/20 px-3 py-2"><Search size={14} className="text-white/35" /><input aria-label="Search missions" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search missions" className="w-36 bg-transparent text-xs text-white outline-none placeholder:text-white/25" /></div><select aria-label="Filter missions" value={filter} onChange={(event) => setFilter(event.target.value as 'ALL' | Status)} className="rounded-md border border-white/10 bg-graphite-800 px-3 py-2 text-xs text-white/70 outline-none"><option value="ALL">All states</option>{Object.keys(statusLabel).map((key) => <option key={key} value={key}>{statusLabel[key as Status]}</option>)}</select></div></div>{loading ? <div className="p-10 text-center text-xs uppercase tracking-[.14em] text-white/35">Loading Control Plane telemetry...</div> : error ? <div role="alert" className="p-10 text-center text-xs uppercase tracking-[.14em] text-signal-rose">{error}</div> : visible.length === 0 ? <div className="p-10 text-center text-xs uppercase tracking-[.14em] text-white/35">No missions for project `{projectId}`</div> : <div className="divide-y divide-white/[.06]">{visible.map((mission) => <button key={mission.id} onClick={() => setSelectedId(mission.id)} className={`grid w-full grid-cols-[1fr_auto] gap-4 px-4 py-4 text-left transition hover:bg-white/[.035] md:grid-cols-[minmax(0,1.5fr)_110px_110px_100px_24px] ${selectedId === mission.id ? 'bg-signal-lime/[.06]' : ''}`}><div className="min-w-0"><div className="mb-2 flex items-center gap-3"><span className="truncate text-sm font-semibold text-white">{mission.title}</span><span className="hidden text-[10px] uppercase tracking-[.12em] text-white/30 md:inline">{mission.id}</span></div><div className="flex items-center gap-3 text-[10px] uppercase tracking-[.12em] text-white/35"><span>{mission.project}</span><span className="text-white/15">/</span><span>{mission.lead}</span></div><div className="mt-3 h-1 max-w-[360px] overflow-hidden rounded-full bg-white/10"><div className={`h-full ${mission.status === 'RECOVERING' ? 'bg-signal-rose' : mission.status === 'APPROVAL' ? 'bg-signal-amber' : 'bg-signal-lime'}`} style={{ width: `${mission.progress}%` }} /></div></div><div className="hidden self-center md:block"><KiboStatus tone={statusTone[mission.status]}>{statusLabel[mission.status]}</KiboStatus></div><div className="hidden self-center text-xs text-white/55 md:block"><div className="flex items-center gap-2"><Cpu size={13} className="text-white/30" />{mission.agents} agents</div><div className="mt-1 text-[10px] text-white/25">{mission.tasks} tasks</div></div><div className="hidden self-center text-right text-xs text-white/55 md:block"><div>{mission.cost}</div><div className="mt-1 text-[10px] text-white/25">{mission.updated}</div></div><ChevronRight size={16} className="self-center text-white/20" /></button>)}</div>}</section>
        <MissionInspector mission={selected} />
      </div>
    </section>
  </main>;
}

function Metric({ icon, label, value, detail, tone }: { icon: ReactNode; label: string; value: string; detail: string; tone: 'lime' | 'cyan' | 'rose' | 'amber' }) {
  const color = { lime: 'text-signal-lime', cyan: 'text-signal-cyan', rose: 'text-signal-rose', amber: 'text-signal-amber' }[tone];
  return <div className="rounded-lg border border-white/10 bg-graphite-900/80 p-4"><div className={`mb-4 flex items-center gap-2 text-[10px] uppercase tracking-[.16em] ${color}`}>{icon}{label}</div><div className="text-2xl font-bold text-white">{value}</div><div className="mt-2 text-[10px] uppercase tracking-[.12em] text-white/30">{detail}</div></div>;
}

function MissionInspector({ mission }: { mission: Mission | null }) {
  if (!mission) return <aside className="rounded-lg border border-white/10 bg-graphite-900/85 p-6 text-xs uppercase tracking-[.14em] text-white/35">Select mission telemetry</aside>;
  return <aside className="rounded-lg border border-white/10 bg-graphite-900/85 shadow-signal"><div className="border-b border-white/10 p-5"><div className="mb-3 flex items-center justify-between"><KiboStatus tone={statusTone[mission.status]}>{statusLabel[mission.status]}</KiboStatus><span className="text-[10px] uppercase tracking-[.14em] text-white/25">{mission.id}</span></div><h2 className="text-lg font-bold leading-7 text-white">{mission.title}</h2><div className="mt-2 flex items-center gap-2 text-[10px] uppercase tracking-[.14em] text-white/35"><GitBranch size={13} />{mission.project}</div></div><div className="space-y-5 p-5"><div><div className="mb-2 flex justify-between text-[10px] uppercase tracking-[.14em] text-white/35"><span>Mission completion</span><span className="text-white/70">{mission.progress}%</span></div><div className="h-2 overflow-hidden rounded-full bg-white/10"><div className="h-full bg-signal-lime" style={{ width: `${mission.progress}%` }} /></div></div><div className="grid grid-cols-2 gap-3"><InspectorStat label="Agents" value={String(mission.agents)} /><InspectorStat label="Tasks" value={String(mission.tasks)} /><InspectorStat label="Cost" value={mission.cost} /><InspectorStat label="Updated" value={mission.updated} /></div><div className="rounded-md border border-signal-lime/15 bg-signal-lime/[.05] p-3"><div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[.14em] text-signal-lime"><CheckCircle2 size={13} />Signal</div><p className="mt-2 text-xs leading-5 text-white/60">{mission.signal}</p></div><div className="space-y-3 border-t border-white/[.08] pt-4"><div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[.14em] text-white/45"><Terminal size={13} className="text-signal-lime" />Terminal command center</div><div className="flex items-center gap-2 text-xs text-white/45"><Workflow size={14} />Task graph telemetry available</div><div className="flex items-center gap-2 text-xs text-white/45"><MessageSquare size={14} />Mission events read-only</div><div className="text-[10px] uppercase tracking-[.12em] text-white/25">Submit and control this mission from CEO terminal.</div></div></div></aside>;
}

function InspectorStat({ label, value }: { label: string; value: string }) { return <div className="rounded-md border border-white/[.08] bg-black/10 p-3"><div className="text-[10px] uppercase tracking-[.13em] text-white/30">{label}</div><div className="mt-2 text-sm font-bold text-white/80">{value}</div></div>; }
