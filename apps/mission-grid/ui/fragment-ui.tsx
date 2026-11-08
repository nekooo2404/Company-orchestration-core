import type { ButtonHTMLAttributes, PropsWithChildren } from 'react';

export function FragmentButton({ children, className = '', ...props }: PropsWithChildren<ButtonHTMLAttributes<HTMLButtonElement>>) {
  return <button className={`inline-flex items-center justify-center gap-2 rounded-md border border-white/10 px-3 py-2 text-xs font-semibold tracking-wide transition hover:border-signal-lime/60 hover:bg-white/[.06] disabled:cursor-not-allowed disabled:opacity-40 ${className}`} {...props}>{children}</button>;
}
