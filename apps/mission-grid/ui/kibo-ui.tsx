import type { PropsWithChildren } from 'react';

export function KiboStatus({ tone, children }: PropsWithChildren<{ tone: 'lime' | 'cyan' | 'amber' | 'rose' }>) {
  const colors = { lime: 'bg-signal-lime', cyan: 'bg-signal-cyan', amber: 'bg-signal-amber', rose: 'bg-signal-rose' };
  return <span className="inline-flex items-center gap-2 text-[10px] font-bold uppercase tracking-[.18em] text-white/65"><span className={`h-1.5 w-1.5 rounded-full ${colors[tone]}`} />{children}</span>;
}
