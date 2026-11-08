import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Mission Grid | AIcompany',
  description: 'Graphite Signal control room for AIcompany orchestration'
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
