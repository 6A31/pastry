import './globals.css';
import type { Metadata } from 'next';
import { ReactNode } from 'react';
import { log } from '../lib/log';
import Footer from '../components/Footer';

declare global {
  // eslint-disable-next-line no-var
  var __pastryCleanupScheduler: NodeJS.Timer | undefined;
}
// Lightweight server-side minute cleanup scheduler (best-effort, not guaranteed on serverless platforms)
if (typeof process !== 'undefined' && !globalThis.__pastryCleanupScheduler) {
  // Always enable by default; allow explicit opt-out with PASTRY_DISABLE_SCHEDULER=true
  const inTest = process.env.VITEST || process.env.JEST_WORKER_ID || process.env.NODE_ENV === 'test';
  const forceScheduler = process.env.PASTRY_FORCE_SCHEDULER === 'true';
  if (process.env.PASTRY_DISABLE_SCHEDULER !== 'true' && (!inTest || forceScheduler)) {
    const intervalMs = Number(process.env.PASTRY_SCHEDULER_INTERVAL_MS || 60_000);
    log.info('Initializing cleanup scheduler interval =', intervalMs, 'ms');
    (globalThis as any).__pastryCleanupScheduler = setInterval(async () => {
      const started = Date.now();
      try {
        const token = process.env.PASTRY_CLEANUP_TOKEN;
        const headers: Record<string,string> = {};
        if (token) headers['authorization'] = `Bearer ${token}`;
        const base = process.env.PASTRY_PUBLIC_BASE || 'http://127.0.0.1:' + (process.env.PORT || '3000');
        log.debug('Scheduler tick: calling /api/cleanup');
        const resp = await fetch(base + '/api/cleanup', { method: 'POST', headers });
        log.debug('Scheduler cleanup result status=', resp.status, 'durationMs=', Date.now() - started);
      } catch (e:any) {
        log.warn('Scheduler tick failed', e?.message);
      }
    }, intervalMs);
  }
}

export const metadata: Metadata = {
  title: 'Pastry - Fast minimalist file drop',
  description: 'A minimalist, drag & drop pastebin for quick, secure file sharing with expirations, passwords & download limits.'
};

export default function RootLayout({ children }: { children: ReactNode }) {
  const adminOnly = process.env.PASTRY_ADMIN_ONLY_UPLOADS === 'true';
  return (
    <html lang="en" className="h-full" data-admin-only={adminOnly ? 'true' : 'false'}>
      <body className="min-h-full bg-neutral-950 text-neutral-100 antialiased">
        <div className="mx-auto max-w-5xl px-4 py-8">
          <header className="mb-10 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h1 className="text-2xl font-semibold tracking-tight">Pastry</h1>
              <p className="text-sm text-neutral-400">Minimal drag & drop file sharing. Fast. Temporary. Protected.</p>
            </div>
          </header>
          {children}
          <Footer />
        </div>
      </body>
    </html>
  );
}
