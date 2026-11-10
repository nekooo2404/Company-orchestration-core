'use client';

import { useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { Activity, AlertTriangle, ArrowLeft, Bot, CheckCircle2, ChevronRight, CircleDot, Clock3, Command, Cpu, FolderKey, GitBranch, LayoutGrid, MessageCircle, MessageSquare, Radio, Save, Search, Send, Settings, ShieldCheck, Terminal, Users, Workflow } from 'lucide-react';
import { KiboStatus } from '../ui/kibo-ui';

type Status = 'RUNNING' | 'QUEUED' | 'RECOVERING' | 'APPROVAL' | 'COMPLETED';
type Mission = { id: string; title: string; project: string; status: Status; progress: number; agents: number; tasks: number; cost: string; updated: string; lead: string; signal: string };
type ApiMission = { missionId: string; title: string; projectId: string; status: string; tasks: Array<{ state: string; ownerAgentDefinitionId: string | null }>; updatedAt: string };
type ModelEndpoint = { id: string; provider: string; baseUrl: string; model: string; credentialRef: string; apiKey?: string; timeoutMs: number; maxRetries: number; circuitFailureThreshold: number; circuitResetMs: number; allowInsecureLocalHttp?: boolean; active?: boolean; status?: 'ACTIVE' | 'OFFLINE' };
type ConnectionStatus = 'idle' | 'testing' | 'active' | 'failed';
type AgentProfile = { id: string; name: string; role: 'CEO' | 'Dev' | 'QA' | 'Reviewer' | 'Analyst'; department: string; endpointId: string; accessRoots: string[]; terminal: 'READY' | 'RUNNING' | 'OFFLINE' };
type ChatMessage = { id: string; workflowId: string; agentId: string; role: 'CEO' | 'AGENT' | 'SYSTEM'; content: string; createdAt: string };
type AccessRoot = { id: string; label: string; path: string; exists: boolean; granted: boolean };
type TerminalSession = { id: string; agentId: string; status: 'RUNNING' | 'CLOSED'; cwd: string; startedAt: string };
type TerminalEvent = { type: 'data' | 'status'; session: TerminalSession; data?: string };
declare global { interface Window { aicompany?: { terminals: { list: () => Promise<TerminalSession[]>; start: (input: { agentId: string }) => Promise<TerminalSession>; write: (id: string, data: string) => Promise<void>; resize: (id: string, cols: number, rows: number) => Promise<void>; close: (id: string) => Promise<void>; onEvent: (listener: (event: TerminalEvent) => void) => () => void } } } }

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
  const [view, setView] = useState<'missions' | 'models' | 'chat'>('missions');
  const [modelEndpoints, setModelEndpoints] = useState<ModelEndpoint[]>([]);
  const [modelForm, setModelForm] = useState<ModelEndpoint>({ id: 'default', provider: 'openai-compatible', baseUrl: '', model: '', credentialRef: 'env:MODEL_API_KEY', apiKey: '', timeoutMs: 120000, maxRetries: 2, circuitFailureThreshold: 3, circuitResetMs: 30000, allowInsecureLocalHttp: false });
  const [modelSaving, setModelSaving] = useState(false);
  const [modelError, setModelError] = useState<string | null>(null);
  const [modelConnection, setModelConnection] = useState<ConnectionStatus>('idle');
  const [modelTesting, setModelTesting] = useState(false);
  const [agents, setAgents] = useState<AgentProfile[]>([]);
  const [accessRoots, setAccessRoots] = useState<AccessRoot[]>([]);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [chatWorkflowId, setChatWorkflowId] = useState('local');
  const [chatAgentId, setChatAgentId] = useState('agent:local-worker');
  const [chatError, setChatError] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const response = await fetch(`${apiBaseUrl}/v1/missions?projectId=${encodeURIComponent(projectId)}`, { headers: { 'x-aicompany-actor': 'CEO' }, cache: 'no-store' });
        if (!response.ok) { const detail = await response.text(); throw new Error(`Control Plane HTTP ${response.status}: ${detail}`); }
        const data = await response.json() as ApiMission[];
        if (active) { const next = data.map(toMission); setMissions(next); setSelectedId((current) => next.some((mission) => mission.id === current) ? current : next[0]?.id ?? ''); setError(null); }
      } catch (cause) { if (active) setError(cause instanceof Error ? cause.message : 'Control Plane unavailable'); }
      finally { if (active) setLoading(false); }
    };
    void load(); const timer = setInterval(() => void load(), 2000);
    return () => { active = false; clearInterval(timer); };
  }, []);
  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const response = await fetch(`${apiBaseUrl}/v1/model-endpoints`, { headers: { 'x-aicompany-actor': 'CEO' }, cache: 'no-store' });
        if (!response.ok) throw new Error(`Control Plane HTTP ${response.status}`);
        const data = await response.json() as ModelEndpoint[];
        if (active && data.length > 0) { setModelEndpoints(data); setModelForm({ ...data[0], apiKey: '' }); setModelConnection(data[0].active ? 'active' : 'idle'); }
      } catch (cause) { if (active) setModelError(cause instanceof Error ? cause.message : 'Model endpoint unavailable'); }
    };
    void load();
    return () => { active = false; };
  }, []);
  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const [agentResponse, rootResponse] = await Promise.all([
          fetch(`${apiBaseUrl}/v1/agents`, { headers: { 'x-aicompany-actor': 'CEO' }, cache: 'no-store' }),
          fetch(`${apiBaseUrl}/v1/access-roots`, { headers: { 'x-aicompany-actor': 'CEO' }, cache: 'no-store' })
        ]);
        if (!agentResponse.ok || !rootResponse.ok) throw new Error('Agent control plane unavailable');
        const nextAgents = await agentResponse.json() as AgentProfile[];
        const nextRoots = await rootResponse.json() as AccessRoot[];
        if (active) { setAgents(nextAgents); setAccessRoots(nextRoots); setChatAgentId((current) => nextAgents.some((agent) => agent.id === current) ? current : nextAgents[0]?.id ?? current); }
      } catch (cause) { if (active) setChatError(cause instanceof Error ? cause.message : 'Agent control plane unavailable'); }
    };
    void load();
    const timer = setInterval(() => void load(), 2000);
    return () => { active = false; clearInterval(timer); };
  }, []);
  const updateModelForm = (value: ModelEndpoint) => { setModelForm(value); setModelConnection('idle'); };
  const testModelConnection = async () => {
    setModelTesting(true); setModelError(null); setModelConnection('testing');
    try {
      const response = await fetch(`${apiBaseUrl}/v1/model-endpoints/test`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-aicompany-actor': 'CEO' }, body: JSON.stringify(modelForm) });
      if (!response.ok) { const detail = await response.text(); throw new Error(`Connection test failed (${response.status}): ${detail}`); }
      setModelConnection('active');
    } catch (cause) { setModelConnection('failed'); setModelError(cause instanceof Error ? cause.message : 'Model endpoint connection failed'); }
    finally { setModelTesting(false); }
  };
  const saveModel = async () => {
    if (modelConnection !== 'active') { setModelError('Test connection successfully before saving this endpoint.'); return; }
    setModelSaving(true); setModelError(null);
    try {
      const response = await fetch(`${apiBaseUrl}/v1/model-endpoints/${encodeURIComponent(modelForm.id)}`, { method: 'PUT', headers: { 'content-type': 'application/json', 'x-aicompany-actor': 'CEO' }, body: JSON.stringify(modelForm) });
      if (!response.ok) { const detail = await response.text(); throw new Error(`Control Plane HTTP ${response.status}: ${detail}`); }
      const saved = await response.json() as ModelEndpoint;
      const activeSaved = { ...saved, active: true, status: 'ACTIVE' as const };
      setModelEndpoints((current) => [...current.filter((item) => item.id !== activeSaved.id), activeSaved]); setModelForm({ ...activeSaved, apiKey: '' });
    } catch (cause) { setModelError(cause instanceof Error ? cause.message : 'Model endpoint save failed'); }
    finally { setModelSaving(false); }
  };
  const saveAgent = async (profile: AgentProfile) => {
    const response = await fetch(`${apiBaseUrl}/v1/agents/${encodeURIComponent(profile.id)}`, { method: 'PUT', headers: { 'content-type': 'application/json', 'x-aicompany-actor': 'CEO' }, body: JSON.stringify(profile) });
    if (!response.ok) throw new Error(`Agent save failed (${response.status})`);
    const saved = await response.json() as AgentProfile;
    setAgents((current) => [...current.filter((item) => item.id !== saved.id), saved]);
  };
  const grantAccessRoot = async (id: string) => {
    const response = await fetch(`${apiBaseUrl}/v1/access-roots`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-aicompany-actor': 'CEO' }, body: JSON.stringify({ id }) });
    if (!response.ok) throw new Error(`Access grant failed (${response.status})`);
    setAccessRoots(await response.json() as AccessRoot[]);
  };
  const loadChat = async (workflowId: string) => {
    const response = await fetch(`${apiBaseUrl}/v1/chat?workflowId=${encodeURIComponent(workflowId)}`, { headers: { 'x-aicompany-actor': 'CEO' }, cache: 'no-store' });
    if (!response.ok) throw new Error(`Chat HTTP ${response.status}`);
    setChatMessages(await response.json() as ChatMessage[]);
  };
  const sendChat = async () => {
    const content = chatInput.trim();
    if (!content) return;
    setChatError(null);
    try {
      const response = await fetch(`${apiBaseUrl}/v1/chat`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-aicompany-actor': 'CEO' }, body: JSON.stringify({ workflowId: chatWorkflowId, agentId: chatAgentId, content }) });
      if (!response.ok) throw new Error(`Chat HTTP ${response.status}`);
      const message = await response.json() as ChatMessage;
      setChatMessages((current) => [...current, message]);
      setChatInput('');
    } catch (cause) { setChatError(cause instanceof Error ? cause.message : 'Chat unavailable'); }
  };
  useEffect(() => {
    if (view !== 'chat') return;
    let active = true;
    const load = async () => {
      try {
        const response = await fetch(`${apiBaseUrl}/v1/chat?workflowId=${encodeURIComponent(chatWorkflowId)}`, { headers: { 'x-aicompany-actor': 'CEO' }, cache: 'no-store' });
        if (!response.ok) return;
        const messages = await response.json() as ChatMessage[];
        if (active) setChatMessages(messages);
      } catch { /* Keep current workflow visible during transient Control Plane restarts. */ }
    };
    void load();
    const timer = setInterval(() => void load(), 1500);
    return () => { active = false; clearInterval(timer); };
  }, [view, chatWorkflowId]);
  const selected = missions.find((mission) => mission.id === selectedId) ?? null;
  const visible = useMemo(() => missions.filter((mission) => (filter === 'ALL' || mission.status === filter) && `${mission.title} ${mission.project}`.toLowerCase().includes(query.toLowerCase())), [filter, query]);
  const counts = { active: missions.filter((mission) => mission.status === 'RUNNING').length, queued: missions.filter((mission) => mission.status === 'QUEUED').length, recovery: missions.filter((mission) => mission.status === 'RECOVERING').length, approval: missions.filter((mission) => mission.status === 'APPROVAL').length };

  if (view === 'models') return <ModelSettingsScreen form={modelForm} endpoints={modelEndpoints} agents={agents} error={modelError} saving={modelSaving} connection={modelConnection} testing={modelTesting} onBack={() => setView('missions')} onChat={() => setView('chat')} onChange={updateModelForm} onSelect={(id) => { const selected = modelEndpoints.find((item) => item.id === id); if (selected) { setModelForm({ ...selected, apiKey: '' }); setModelConnection(selected.active ? 'active' : 'idle'); } }} onTest={testModelConnection} onSave={saveModel} onSaveAgent={saveAgent} />;
  if (view === 'chat') return <ChatBotScreen agents={agents} endpoints={modelEndpoints} roots={accessRoots} messages={chatMessages} input={chatInput} workflowId={chatWorkflowId} agentId={chatAgentId} error={chatError} onBack={() => setView('missions')} onModels={() => setView('models')} onInput={setChatInput} onWorkflow={setChatWorkflowId} onAgent={setChatAgentId} onSend={sendChat} onLoad={loadChat} onGrantRoot={grantAccessRoot} />;

  return <main className="signal-grid min-h-screen overflow-hidden">
    <header className="border-b border-white/10 bg-graphite-950/90 px-5 py-4 backdrop-blur md:px-8">
      <div className="mx-auto flex max-w-[1680px] items-center justify-between gap-4">
        <div className="flex items-center gap-4"><div className="flex h-9 w-9 items-center justify-center rounded-md border border-signal-lime/40 bg-signal-lime/10 text-signal-lime"><Command size={18} /></div><div><div className="text-sm font-bold tracking-[.22em] text-white">MISSION GRID</div><div className="mt-1 text-[10px] uppercase tracking-[.16em] text-white/40">Graphite Signal / Control room</div></div></div>
        <div className="flex items-center gap-2 text-[10px] uppercase tracking-[.16em] text-white/45"><span className="hidden items-center gap-2 md:flex"><span className="h-2 w-2 rounded-full bg-signal-lime shadow-[0_0_12px_#b8ff5a]" />System nominal</span><button aria-label="Open agent chat" onClick={() => setView('chat')} className="inline-flex items-center gap-2 rounded-md border border-white/10 px-3 py-2 text-[10px] text-white/60 transition hover:border-signal-cyan/50 hover:text-signal-cyan"><MessageCircle size={14} />AI Chat Bot</button><button aria-label="Open model routing" onClick={() => setView('models')} className="inline-flex items-center gap-2 rounded-md border border-white/10 px-3 py-2 text-[10px] text-white/60 transition hover:border-signal-lime/50 hover:text-signal-lime"><Settings size={14} />Model routing</button><span className="hidden text-signal-lime md:inline">CEO / ONLINE</span></div>
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

function ChatBotScreen({ agents, endpoints, roots, messages, input, workflowId, agentId, error, onBack, onModels, onInput, onWorkflow, onAgent, onSend, onLoad, onGrantRoot }: { agents: AgentProfile[]; endpoints: ModelEndpoint[]; roots: AccessRoot[]; messages: ChatMessage[]; input: string; workflowId: string; agentId: string; error: string | null; onBack: () => void; onModels: () => void; onInput: (value: string) => void; onWorkflow: (value: string) => void; onAgent: (value: string) => void; onSend: () => Promise<void>; onLoad: (value: string) => Promise<void>; onGrantRoot: (id: string) => Promise<void> }) {
  return <main className="signal-grid min-h-screen overflow-hidden"><header className="border-b border-white/10 bg-graphite-950/90 px-5 py-4 backdrop-blur md:px-8"><div className="mx-auto flex max-w-[1680px] items-center justify-between gap-4"><div className="flex items-center gap-4"><button aria-label="Back to mission telemetry" onClick={onBack} className="rounded-md border border-white/10 p-2 text-white/60 hover:border-signal-lime/50 hover:text-signal-lime"><ArrowLeft size={16} /></button><div><div className="text-sm font-bold tracking-[.22em] text-white">AI CHAT BOT</div><div className="mt-1 text-[10px] uppercase tracking-[.16em] text-white/40">Agent terminals / workflow channel</div></div></div><button type="button" onClick={onModels} className="inline-flex items-center gap-2 rounded-md border border-white/10 px-3 py-2 text-[10px] uppercase tracking-[.12em] text-white/60 hover:border-signal-lime/50 hover:text-signal-lime"><Settings size={14} />Model routing</button></div></header><section className="mx-auto grid max-w-[1680px] gap-4 px-5 py-6 md:px-8 xl:grid-cols-[300px_minmax(0,1fr)_330px]"><aside className="space-y-4"><section className="rounded-lg border border-white/10 bg-graphite-900/85 p-4"><div className="mb-3 flex items-center gap-2 text-[10px] uppercase tracking-[.16em] text-signal-cyan"><Users size={14} />Agent terminals</div><div className="space-y-2">{agents.map((agent) => <button type="button" key={agent.id} onClick={() => onAgent(agent.id)} className={`w-full rounded-md border p-3 text-left ${agent.id === agentId ? 'border-signal-cyan/50 bg-signal-cyan/10' : 'border-white/[.08] bg-black/10'}`}><div className="flex items-center justify-between text-xs text-white"><span className="flex items-center gap-2"><Bot size={14} className="text-signal-cyan" />{agent.name}</span><CircleDot size={12} className={agent.terminal === 'RUNNING' ? 'text-signal-lime' : 'text-white/25'} /></div><div className="mt-2 text-[10px] uppercase tracking-[.12em] text-white/35">{agent.role} / {agent.endpointId}</div></button>)}</div></section><section className="rounded-lg border border-white/10 bg-graphite-900/85 p-4"><div className="mb-3 flex items-center gap-2 text-[10px] uppercase tracking-[.16em] text-signal-amber"><FolderKey size={14} />Approved local roots</div><div className="space-y-2">{roots.map((root) => <div key={root.id} className="flex items-center justify-between gap-2 rounded-md border border-white/[.08] p-2"><div className="min-w-0"><div className="text-xs text-white/70">{root.label}</div><div className="truncate text-[9px] text-white/25">{root.path}</div></div><button type="button" disabled={!root.exists || root.granted} onClick={() => void onGrantRoot(root.id)} className="shrink-0 rounded border border-white/10 px-2 py-1 text-[9px] uppercase text-white/50 disabled:opacity-30">{root.granted ? 'Granted' : root.exists ? 'Grant' : 'Missing'}</button></div>)}</div><div className="mt-3 text-[10px] leading-4 text-white/25">Only approved skill/config roots. Secrets and session stores remain denied.</div></section></aside><section className="flex min-h-[620px] flex-col rounded-lg border border-white/10 bg-graphite-900/85"><div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 p-4"><div className="flex items-center gap-2 text-xs font-bold uppercase tracking-[.15em] text-white/70"><Workflow size={15} className="text-signal-lime" />Workflow communication</div><div className="flex items-center gap-2"><input value={workflowId} onChange={(event) => onWorkflow(event.target.value)} onBlur={() => void onLoad(workflowId)} placeholder="workflow id" className="w-40 rounded-md border border-white/10 bg-black/20 px-2 py-2 text-xs text-white outline-none" /><button type="button" onClick={() => void onLoad(workflowId)} className="rounded-md border border-white/10 p-2 text-white/50 hover:text-signal-cyan" aria-label="Refresh workflow"><Radio size={14} /></button></div></div><div className="flex-1 space-y-3 overflow-y-auto p-4">{messages.length === 0 && <div className="flex h-full min-h-80 items-center justify-center text-center text-xs uppercase tracking-[.14em] text-white/25">No workflow messages yet</div>}{messages.map((message) => <div key={message.id} className={`max-w-[82%] rounded-md border p-3 ${message.role === 'CEO' ? 'ml-auto border-signal-lime/20 bg-signal-lime/[.06]' : 'border-white/[.08] bg-black/15'}`}><div className="mb-2 flex items-center justify-between gap-4 text-[10px] uppercase tracking-[.12em] text-white/35"><span>{message.role} / {message.agentId}</span><span>{new Date(message.createdAt).toLocaleTimeString()}</span></div><div className="text-sm leading-6 text-white/75">{message.content}</div></div>)}</div><form className="flex gap-2 border-t border-white/10 p-4" onSubmit={(event) => { event.preventDefault(); void onSend(); }}><input value={input} onChange={(event) => onInput(event.target.value)} placeholder="Send instruction to selected agent..." className="min-w-0 flex-1 rounded-md border border-white/10 bg-black/20 px-3 py-3 text-sm text-white outline-none" /><button type="submit" className="rounded-md border border-signal-cyan/40 bg-signal-cyan/10 p-3 text-signal-cyan hover:bg-signal-cyan/20" aria-label="Send message"><Send size={16} /></button></form></section><aside className="space-y-4"><section className="rounded-lg border border-white/10 bg-graphite-900/85 p-4"><div className="mb-3 flex items-center gap-2 text-[10px] uppercase tracking-[.16em] text-signal-lime"><Terminal size={14} />Selected terminal</div>{agents.filter((agent) => agent.id === agentId).map((agent) => <div key={agent.id} className="space-y-3"><div className="rounded-md border border-signal-lime/20 bg-signal-lime/[.05] p-3"><div className="text-sm font-bold text-white">{agent.name}</div><div className="mt-2 text-xs text-white/45">Role: {agent.role}</div><div className="mt-1 text-xs text-white/45">Department: {agent.department}</div><div className="mt-1 text-xs text-white/45">Model: {endpoints.find((endpoint) => endpoint.id === agent.endpointId)?.model ?? 'Unassigned'}</div></div><TerminalSurface agentId={agent.id} /></div>)}</section>{error && <div role="alert" className="rounded-md border border-signal-rose/30 bg-signal-rose/10 p-3 text-xs leading-5 text-signal-rose">{error}</div>}</aside></section></main>;
}

function TerminalSurface({ agentId }: { agentId: string }) {
  const [sessions, setSessions] = useState<TerminalSession[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [outputs, setOutputs] = useState<Record<string, string>>({});
  const [input, setInput] = useState('');
  useEffect(() => {
    const bridge = window.aicompany?.terminals;
    if (!bridge) return;
    void bridge.list().then((items) => { setSessions(items); const existing = items.find((item) => item.agentId === agentId); if (existing) setSelectedId(existing.id); });
    return bridge.onEvent((event) => {
      setSessions((current) => { const next = current.filter((item) => item.id !== event.session.id); return [...next, event.session]; });
      if (event.session.agentId === agentId) { setSelectedId((current) => current || event.session.id); if (event.type === 'data' && event.data) setOutputs((current) => ({ ...current, [event.session.id]: `${current[event.session.id] ?? ''}${event.data}`.slice(-16000) })); }
    });
  }, [agentId]);
  const ownSessions = sessions.filter((session) => session.agentId === agentId);
  const active = ownSessions.find((session) => session.id === selectedId && session.status === 'RUNNING');
  const open = async () => { const bridge = window.aicompany?.terminals; if (!bridge) return; const session = await bridge.start({ agentId }); setSessions((current) => [...current, session]); setSelectedId(session.id); setOutputs((current) => ({ ...current, [session.id]: '' })); };
  const close = async () => { if (!active) return; await window.aicompany?.terminals.close(active.id); setSelectedId(ownSessions.find((session) => session.id !== active.id && session.status === 'RUNNING')?.id ?? ''); };
  const write = async () => { if (!active || !input) return; await window.aicompany?.terminals.write(active.id, `${input}\r`); setInput(''); };
  return <div className="space-y-2 rounded-md border border-white/[.08] bg-black/25 p-3"><div className="flex items-center justify-between gap-2"><div className="flex items-center gap-2 text-[10px] uppercase tracking-[.12em] text-white/40"><Terminal size={13} className="text-signal-lime" />PTY terminals {ownSessions.filter((session) => session.status === 'RUNNING').length}</div>{active ? <button type="button" onClick={() => void close()} className="rounded border border-signal-rose/30 px-2 py-1 text-[9px] uppercase text-signal-rose">Close</button> : <button type="button" onClick={() => void open()} className="rounded border border-signal-lime/30 px-2 py-1 text-[9px] uppercase text-signal-lime">New terminal</button>}</div>{ownSessions.length > 0 && <div className="flex gap-1 overflow-x-auto border-b border-white/[.08] pb-2">{ownSessions.map((session, index) => <button type="button" key={session.id} onClick={() => setSelectedId(session.id)} className={`shrink-0 rounded px-2 py-1 text-[9px] uppercase ${session.id === selectedId ? 'bg-signal-cyan/15 text-signal-cyan' : 'text-white/35 hover:text-white/70'}`}>Terminal {index + 1} {session.status === 'RUNNING' ? '*' : ''}</button>)}</div>}<pre className="h-44 overflow-y-auto whitespace-pre-wrap rounded bg-black/40 p-3 font-mono text-[11px] leading-5 text-white/65">{outputs[selectedId] || (active ? 'PTY connected.' : 'PTY ready. Open terminal to start shell.')}</pre><form className="flex gap-2" onSubmit={(event) => { event.preventDefault(); void write(); }}><span className="rounded bg-black/40 px-2 py-2 text-xs text-signal-lime">$</span><input disabled={!active} value={input} onChange={(event) => setInput(event.target.value)} placeholder={active ? 'command' : 'open terminal first'} className="min-w-0 flex-1 rounded bg-black/40 px-2 py-2 text-xs text-white outline-none disabled:opacity-40" /></form></div>;
}

function ModelSettingsScreen({ form, endpoints, agents, error, saving, connection, testing, onBack, onChat, onChange, onSelect, onTest, onSave, onSaveAgent }: { form: ModelEndpoint; endpoints: ModelEndpoint[]; agents: AgentProfile[]; error: string | null; saving: boolean; connection: ConnectionStatus; testing: boolean; onBack: () => void; onChat: () => void; onChange: (value: ModelEndpoint) => void; onSelect: (id: string) => void; onTest: () => Promise<void>; onSave: () => Promise<void>; onSaveAgent: (profile: AgentProfile) => Promise<void> }) {
  const update = <K extends keyof ModelEndpoint>(key: K, value: ModelEndpoint[K]) => onChange({ ...form, [key]: value });
  return <main className="signal-grid min-h-screen overflow-hidden"><header className="border-b border-white/10 bg-graphite-950/90 px-5 py-4 backdrop-blur md:px-8"><div className="mx-auto flex max-w-[1680px] items-center justify-between gap-4"><div className="flex items-center gap-4"><button aria-label="Back to mission telemetry" onClick={onBack} className="rounded-md border border-white/10 p-2 text-white/60 hover:border-signal-lime/50 hover:text-signal-lime"><ArrowLeft size={16} /></button><div><div className="text-sm font-bold tracking-[.22em] text-white">MODEL ROUTING</div><div className="mt-1 text-[10px] uppercase tracking-[.16em] text-white/40">CEO configuration / local runtime</div></div></div><div className="flex items-center gap-2 text-[10px] uppercase tracking-[.14em] text-white/35"><Settings size={14} className="text-signal-lime" />Changes affect next worker start</div></div></header><section className="mx-auto max-w-[1100px] px-5 py-8 md:px-8"><div className="mb-8"><div className="mb-3 text-[10px] uppercase tracking-[.2em] text-signal-lime">Provider connection</div><h1 className="text-3xl font-bold tracking-[-.04em] text-white">Assign base URL and model</h1><p className="mt-3 max-w-2xl text-sm leading-6 text-white/45">Save provider settings and an API key for the local worker. The key is write-only in the dashboard.</p></div><div className="grid gap-5 lg:grid-cols-[260px_1fr]"><aside className="rounded-lg border border-white/10 bg-graphite-900/85 p-4"><div className="mb-3 text-[10px] uppercase tracking-[.16em] text-white/35">Endpoints</div><div className="space-y-2">{endpoints.map((endpoint) => <button key={endpoint.id} onClick={() => onSelect(endpoint.id)} className={`flex w-full items-center justify-between rounded-md border px-3 py-3 text-left text-xs ${form.id === endpoint.id ? 'border-signal-lime/50 bg-signal-lime/10 text-signal-lime' : 'border-white/10 text-white/55 hover:bg-white/[.04]'}`}><span className="flex items-center gap-2"><span className={`h-1.5 w-1.5 rounded-full ${endpoint.active ? 'bg-signal-lime' : 'bg-signal-rose'}`} />{endpoint.id}</span><span className="text-[10px]">{endpoint.model}</span></button>)}{endpoints.length === 0 && <div className="text-xs leading-5 text-white/35">No saved endpoint. Fill form to create `default`.</div>}</div></aside><section className="space-y-4 rounded-lg border border-white/10 bg-graphite-900/85 p-5 lg:col-start-2"><div className="flex items-center justify-between"><div><div className="text-[10px] uppercase tracking-[.16em] text-signal-lime">Agent model assignment</div><div className="mt-2 text-xs text-white/40">Each terminal uses selected active endpoint.</div></div><button type="button" onClick={onChat} className="inline-flex items-center gap-2 rounded-md border border-white/10 px-3 py-2 text-[10px] uppercase tracking-[.12em] text-white/60 hover:border-signal-cyan/50 hover:text-signal-cyan"><MessageCircle size={14} />Open AI Chat Bot</button></div><div className="space-y-2">{agents.length === 0 && <div className="text-xs text-white/35">No agent terminal registered.</div>}{agents.map((agent) => <div key={agent.id} className="grid gap-3 rounded-md border border-white/[.08] bg-black/15 p-3 md:grid-cols-[1fr_150px_190px]"><div><div className="flex items-center gap-2 text-sm text-white"><Bot size={14} className="text-signal-cyan" />{agent.name}<span className="text-[10px] uppercase text-white/30">{agent.id}</span></div><div className="mt-1 text-[10px] uppercase tracking-[.12em] text-white/35">{agent.terminal} / {agent.department}</div></div><select value={agent.role} onChange={(event) => void onSaveAgent({ ...agent, role: event.target.value as AgentProfile['role'] })} className="rounded-md border border-white/10 bg-graphite-800 px-2 py-2 text-xs text-white"><option>CEO</option><option>Dev</option><option>QA</option><option>Reviewer</option><option>Analyst</option></select><select value={agent.endpointId} onChange={(event) => void onSaveAgent({ ...agent, endpointId: event.target.value })} className="rounded-md border border-white/10 bg-graphite-800 px-2 py-2 text-xs text-white">{endpoints.map((endpoint) => <option key={endpoint.id} value={endpoint.id}>{endpoint.id} / {endpoint.model}</option>)}</select></div>)}</div></section><form className="rounded-lg border border-white/10 bg-graphite-900/85 p-5 lg:col-start-2" onSubmit={(event) => { event.preventDefault(); void onSave(); }}><div className="grid gap-5 md:grid-cols-2"><Field label="Endpoint ID"><input value={form.id} onChange={(event) => update('id', event.target.value)} placeholder="default" /></Field><Field label="Provider"><input value={form.provider} onChange={(event) => update('provider', event.target.value)} placeholder="openai-compatible or anthropic" /></Field><Field label="Base URL" wide><input value={form.baseUrl} onChange={(event) => update('baseUrl', event.target.value)} placeholder="https://api.openai.com/v1 or https://api.anthropic.com/v1" /></Field><Field label="Model" wide><input value={form.model} onChange={(event) => update('model', event.target.value)} placeholder="gpt-4.1-mini or claude-sonnet-4-5" /></Field><Field label="API key" wide><input type="password" value={form.apiKey ?? ''} onChange={(event) => update('apiKey', event.target.value)} placeholder="Paste API key; leave blank to keep current" autoComplete="new-password" /></Field><Field label="Credential reference" wide><input value={form.credentialRef} onChange={(event) => update('credentialRef', event.target.value)} placeholder="env:MODEL_API_KEY" /><span className="mt-2 block text-[10px] text-white/30">API key is stored write-only for the local worker. Leave blank to use the credential reference.</span></Field><Field label="Timeout (ms)"><input type="number" min={1000} value={form.timeoutMs} onChange={(event) => update('timeoutMs', Number(event.target.value))} /></Field><Field label="Max retries"><input type="number" min={0} max={10} value={form.maxRetries} onChange={(event) => update('maxRetries', Number(event.target.value))} /></Field></div>{error && <div role="alert" className="mt-5 rounded-md border border-signal-rose/30 bg-signal-rose/10 p-3 text-xs text-signal-rose">{error}</div>}<div className="mt-6 flex flex-wrap items-center justify-between gap-3"><div className={`text-xs ${connection === 'active' ? 'text-signal-lime' : connection === 'failed' ? 'text-signal-rose' : 'text-white/35'}`}>{connection === 'active' ? 'Connection active' : connection === 'testing' ? 'Testing connection...' : connection === 'failed' ? 'Connection failed' : 'Test connection before saving'}</div><div className="flex items-center gap-2"><button type="button" onClick={() => void onTest()} disabled={testing || saving} className="inline-flex items-center gap-2 rounded-md border border-white/15 px-4 py-2 text-xs font-bold uppercase tracking-[.12em] text-white/70 hover:border-signal-cyan/50 hover:text-signal-cyan disabled:opacity-40">Test connection</button><button type="submit" disabled={saving || testing || connection !== 'active'} className="inline-flex items-center gap-2 rounded-md border border-signal-lime/40 bg-signal-lime/10 px-4 py-2 text-xs font-bold uppercase tracking-[.12em] text-signal-lime hover:bg-signal-lime/20 disabled:opacity-40"><Save size={14} />{saving ? 'Saving...' : 'Save endpoint'}</button></div></div></form></div></section></main>;
}

function Field({ label, wide, children }: { label: string; wide?: boolean; children: ReactNode }) { return <label className={`flex flex-col text-[10px] uppercase tracking-[.14em] text-white/40 ${wide ? 'md:col-span-2' : ''}`}>{label}<div className="mt-2">{children}</div></label>; }
