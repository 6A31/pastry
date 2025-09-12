'use client';
import React, { useEffect, useState } from 'react';

type FileMeta = { requiresPassword: boolean; originalName?: string; expiresAt?: string };

export default function DownloadClient({ id }: { id: string }) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);
  const [meta, setMeta] = useState<FileMeta | null>(null);
  const [statusCode, setStatusCode] = useState<number | null>(null);
  const [copiedLink, setCopiedLink] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const r = await fetch(`/api/file/${id}/meta`);
        if (!r.ok) {
          if (!cancelled) setStatusCode(r.status);
          return;
        }
        const j = await r.json();
        if (!cancelled) { setMeta(j); setStatusCode(200); }
      } catch (e: any) {
        if (!cancelled) setError(e.message);
      }
    })();
    return () => { cancelled = true; };
  }, [id]);

  function mapError(msg: string) {
    switch (msg) {
      case 'not found': return 'File not found or already removed.';
      case 'expired': return 'This file has expired and is no longer available.';
      case 'download limit reached': return 'This file has reached its maximum number of downloads.';
      case 'password required': return 'Password required.';
      case 'invalid password': return 'Incorrect password.';
      case 'file missing': return 'File data missing on server.';
      default: return 'Download failed.';
    }
  }

  async function handleDownload() {
    setError(null); setDownloading(true);
    try {
      const resp = await fetch(`/api/download/${id}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password: password || undefined }) });
      if (!resp.ok) {
        const text = await resp.text();
        try { const j = JSON.parse(text); setError(mapError(j.error || '')); } catch { setError('Download failed'); }
        return;
      }
      const blob = await resp.blob();
      const disposition = resp.headers.get('Content-Disposition');
      let filename = 'file';
      if (disposition) {
        const m = disposition.match(/filename="(.+)"/);
        if (m) filename = m[1];
      }
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = filename; a.click();
      setTimeout(() => URL.revokeObjectURL(url), 4000);
    } finally { setDownloading(false); }
  }

  if (statusCode === 404) {
    return (
      <div className="mx-auto max-w-md space-y-4 rounded-xl bg-neutral-900 p-6 ring-1 ring-neutral-800 text-sm">
        <h1 className="text-lg font-semibold text-neutral-200">File Not Found</h1>
  <p className="text-neutral-400">The file you are trying to access does not exist or has already been removed.</p>
        <div className="pt-2">
          <a href="/" className="inline-flex items-center rounded-md bg-brand-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-brand-500">Upload a file</a>
        </div>
      </div>
    );
  }
  if (statusCode === 410) {
    return (
      <div className="mx-auto max-w-md space-y-4 rounded-xl bg-neutral-900 p-6 ring-1 ring-neutral-800 text-sm">
        <h1 className="text-lg font-semibold text-neutral-200">File Expired</h1>
        <p className="text-neutral-400">This file has expired and is no longer available.</p>
        <div className="pt-2">
          <a href="/" className="inline-flex items-center rounded-md bg-brand-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-brand-500">Upload a file</a>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-md space-y-4">
      <div className="rounded-xl bg-neutral-900 p-6 ring-1 ring-neutral-800">
        <div className="flex items-start justify-between mb-3">
          <div>
            <h1 className="text-lg font-semibold text-neutral-200">Download File</h1>
            <p className="mt-1 text-[11px] text-neutral-500">{meta?.requiresPassword ? 'This file is protected.' : 'Click download to retrieve the file.'}</p>
          </div>
          <a href="/" className="rounded-md bg-neutral-800 px-2 py-1 text-[11px] font-medium text-neutral-200 ring-1 ring-neutral-700 hover:bg-neutral-700">Upload</a>
        </div>
        <div className="space-y-3 text-sm">
          {meta?.requiresPassword && (
            <label className="flex flex-col gap-1 text-xs">
              <span className="uppercase tracking-wide text-neutral-400">Password</span>
              <input value={password} onChange={(e) => setPassword(e.target.value)} className="rounded-md bg-neutral-800 px-2 py-1 text-neutral-100 ring-1 ring-neutral-700 focus:outline-none focus:ring-brand-500" />
            </label>
          )}
          {error && <p className="text-xs text-red-500">{error}</p>}
        </div>
      </div>
      <div>
        <button disabled={downloading || (meta?.requiresPassword && !password)} onClick={handleDownload} className="w-full rounded-md bg-brand-600 px-4 py-3 text-sm font-medium text-white shadow-sm hover:bg-brand-500 disabled:opacity-40 transition-colors">{downloading ? 'Preparing download…' : 'Download File'}</button>
      </div>
    </div>
  );
}
