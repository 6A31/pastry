'use client';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowUpTrayIcon, LockClosedIcon } from '@heroicons/react/24/outline';
import cls from 'classnames';
import { FancySelect } from './FancySelect';

interface PendingUploadMeta {
  expiresIn: string; // e.g. '15m', '1h', '1d'
  maxDownloads: number | '';
  downloadPassword: string;
}

const defaultMeta: PendingUploadMeta = {
  expiresIn: '30d',
  maxDownloads: '',
  downloadPassword: ''
};

interface UploadPanelProps {
  adminOnly: boolean;
  requireFilePw: boolean;
  maxSize: number; // bytes
}

export default function UploadPanel({ adminOnly, requireFilePw, maxSize }: UploadPanelProps) {
  // Flags provided by server component to avoid hydration divergence
  const [dragging, setDragging] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [meta, setMeta] = useState<PendingUploadMeta>(defaultMeta);
  const [adminPass, setAdminPass] = useState('');
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [result, setResult] = useState<any>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const lastNumberRef = useRef<number>(1); // remember previous numeric value when toggling unlimited
  const [cardEntered, setCardEntered] = useState(false);

  const [sizeWarning, setSizeWarning] = useState<string | null>(null);
  const onFiles = useCallback((files: FileList | null) => {
    if (!files || !files.length) return;
    const file = files[0];
    setResult(null); setError(null); setSizeWarning(null);
    if (file.size > maxSize) {
      setSelectedFile(null);
      const over = file.size - maxSize;
      const pct = ((file.size / maxSize) * 100).toFixed(1);
  setSizeWarning(`File is too large (${formatBytes(file.size)} - ${pct}% of limit). Max allowed is ${formatBytes(maxSize)}.`);
      return;
    }
    setSelectedFile(file);
  }, [maxSize]);

  function formatBytes(bytes: number) {
    if (bytes < 1024) return `${bytes} B`;
    const units = ['KB','MB','GB','TB'];
    let v = bytes / 1024; let i = 0;
    while (v >= 1024 && i < units.length - 1) { v /= 1024; i++; }
    return `${v.toFixed(v >= 100 ? 0 : v >= 10 ? 1 : 2)} ${units[i]}`;
  }

  const performUpload = useCallback(async () => {
    if (!selectedFile) return;
  setBusy(true); setError(null); setResult(null); setCardEntered(false);
    try {
      if (requireFilePw && !meta.downloadPassword) throw new Error('Password required by server policy');
      const form = new FormData();
      form.append('file', selectedFile);
      form.append('expiresIn', meta.expiresIn);
      if (meta.maxDownloads !== '') form.append('maxDownloads', String(meta.maxDownloads));
      if (meta.downloadPassword) form.append('downloadPassword', meta.downloadPassword);
      if (adminPass) form.append('adminPassword', adminPass);
      const resp = await fetch('/api/upload', { method: 'POST', body: form });
      if (!resp.ok) {
        let msg = 'Upload failed';
        try { const j = await resp.json(); if (j.error) msg = j.error; } catch {}
        throw new Error(msg);
      }
  const json = await resp.json();
  setResult(json);
  // trigger enter animation on next frame
  requestAnimationFrame(() => setCardEntered(true));
  // Clear file selection so user cannot re-trigger accidentally
  setSelectedFile(null);
  if (inputRef.current) inputRef.current.value = '';
    } catch (e: any) {
      setError(e.message);
    } finally { setBusy(false); }
  }, [selectedFile, meta, adminPass, requireFilePw]);

  const onDrop = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragging(false);
    onFiles(e.dataTransfer.files);
  }, [onFiles]);

  return (
    <div className="space-y-6">
      <div
  onDragOver={(e: React.DragEvent<HTMLDivElement>) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        className={cls('relative rounded-xl border border-dashed p-10 text-center transition', dragging ? 'border-brand-500 bg-neutral-900' : 'border-neutral-700 bg-neutral-950')}
      >
      <input ref={inputRef} type="file" className="hidden" onChange={(e) => onFiles(e.target.files)} />
        {!selectedFile && (
          <button
            type="button"
            className="mx-auto flex flex-col items-center gap-3"
            onClick={() => inputRef.current?.click()}
            disabled={busy}
          >
            <span className="flex h-16 w-16 items-center justify-center rounded-full bg-neutral-800 ring-1 ring-neutral-700">
              <ArrowUpTrayIcon className="h-8 w-8 text-brand-400" />
            </span>
            <span className="text-sm text-neutral-300">Drag & drop or click to choose a file</span>
          </button>
        )}
        {selectedFile && (
          <div className="space-y-3">
            <p className="text-sm text-neutral-300 break-all">{selectedFile.name} <span className="text-neutral-500">({(selectedFile.size/1024).toFixed(1)} KB)</span></p>
            <div className="flex flex-wrap gap-3 justify-center">
              <button
                type="button"
                onClick={() => inputRef.current?.click()}
                className="rounded-md bg-neutral-800 px-3 py-1 text-xs text-neutral-200 ring-1 ring-neutral-700 hover:bg-neutral-700"
                disabled={busy}
              >Change</button>
              <button
                type="button"
                onClick={() => { setSelectedFile(null); setResult(null); setError(null); }}
                className="rounded-md bg-neutral-800 px-3 py-1 text-xs text-neutral-300 ring-1 ring-neutral-700 hover:bg-neutral-700"
                disabled={busy}
              >Clear</button>
              <button
                type="button"
                onClick={performUpload}
                disabled={busy || (requireFilePw && !meta.downloadPassword) || (adminOnly && !adminPass) || !!sizeWarning || !selectedFile}
                className="rounded-md bg-brand-600 px-4 py-1.5 text-xs font-medium text-white hover:bg-brand-500 disabled:opacity-40"
              >{busy ? 'Uploading...' : 'Upload'}</button>
            </div>
            <div className="space-y-1">
              {sizeWarning && <p className="text-xs text-red-400 flex items-center gap-2"><span className="inline-block h-1.5 w-1.5 rounded-full bg-red-500" />{sizeWarning}</p>}
              {requireFilePw && !meta.downloadPassword && <p className="text-xs text-red-500">Download password required.</p>}
              {adminOnly && !adminPass && <p className="text-xs text-amber-400">Admin password required to upload.</p>}
            </div>
          </div>
        )}
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <div className="flex flex-col gap-1 text-xs">
          <span className="uppercase tracking-wide text-neutral-400">Expires</span>
          <FancySelect
            value={meta.expiresIn}
            disabled={busy}
            onChange={(v) => setMeta(m => ({ ...m, expiresIn: v }))}
            options={[
              { value: '2m', label: '2 minutes' },
              { value: '15m', label: '15 minutes' },
              { value: '1h', label: '1 hour' },
              { value: '6h', label: '6 hours' },
              { value: '1d', label: '1 day' },
              { value: '3d', label: '3 days' },
              { value: '7d', label: '7 days' },
              { value: '30d', label: '30 days' }
            ]}
          />
        </div>
        <div className="flex flex-col gap-1 text-xs">
          <span className="uppercase tracking-wide text-neutral-400">Max Downloads</span>
          <div className="flex w-full h-9 rounded-md ring-1 ring-neutral-700 bg-neutral-900/80 backdrop-blur overflow-hidden text-[13px] shadow-sm" role="group" aria-label="Max downloads selector">
            {/* Counter Side */}
      <div
              onClick={() => {
                if (meta.maxDownloads === '') {
                  setMeta(m => ({ ...m, maxDownloads: lastNumberRef.current || 1 }));
                }
              }}
              className={cls(
        'group flex basis-1/2 h-full items-center justify-between gap-1 px-2 sm:px-3 transition relative',
                meta.maxDownloads === '' ? 'cursor-pointer text-neutral-500 hover:text-neutral-300' : 'bg-neutral-800/40 text-neutral-100 shadow-[inset_0_0_0_1px_var(--tw-ring-color)] ring-1 ring-neutral-700'
              )}
            >
              <button
                type="button"
                aria-label="Decrease"
                disabled={busy || (typeof meta.maxDownloads === 'number' && meta.maxDownloads <= 1)}
                onClick={(e) => {
                  e.stopPropagation();
                  setMeta(m => {
                    if (m.maxDownloads === '') {
                      lastNumberRef.current = 1;
                      return { ...m, maxDownloads: 1 };
                    }
                    const next = Math.max(1, (m.maxDownloads as number) - 1);
                    lastNumberRef.current = next;
                    return { ...m, maxDownloads: next };
                  });
                }}
                className={cls('h-8 w-8 rounded-md flex items-center justify-center transition outline-none relative group',
                  'focus-visible:ring-1 focus-visible:ring-brand-500')}
              >
                <span className="pointer-events-none absolute inset-1 rounded-md bg-neutral-800/60 opacity-0 transition group-hover:opacity-100 group-focus-visible:opacity-100" />
                <span className="block h-0.5 w-3 bg-neutral-300" />
              </button>
              <div className="flex-1 select-none text-center font-medium">
                {meta.maxDownloads === '' ? 'Custom' : meta.maxDownloads}
              </div>
              <button
                type="button"
                aria-label="Increase"
                disabled={busy}
                onClick={(e) => {
                  e.stopPropagation();
                  setMeta(m => {
                    if (m.maxDownloads === '') {
                      lastNumberRef.current = 2;
                      return { ...m, maxDownloads: 2 };
                    }
                    const next = (m.maxDownloads as number) + 1;
                    lastNumberRef.current = next;
                    return { ...m, maxDownloads: next };
                  });
                }}
                className={cls('h-8 w-8 rounded-md flex items-center justify-center transition outline-none relative group',
                  'focus-visible:ring-1 focus-visible:ring-brand-500')}
              >
                <span className="pointer-events-none absolute inset-1 rounded-md bg-neutral-800/60 opacity-0 transition group-hover:opacity-100 group-focus-visible:opacity-100" />
                <span className="relative block h-3 w-3">
                  <span className="absolute inset-0 h-0.5 w-3 bg-neutral-300 top-1/2 -translate-y-1/2" />
                  <span className="absolute inset-0 w-0.5 h-3 bg-neutral-300 left-1/2 -translate-x-1/2" />
                </span>
              </button>
            </div>
            <span className="w-px self-stretch bg-neutral-700" />
            {/* Unlimited Toggle */}
      <button
              type="button"
              aria-pressed={meta.maxDownloads === ''}
              onClick={() => setMeta(m => {
                if (m.maxDownloads === '') {
                  return { ...m, maxDownloads: lastNumberRef.current || 1 };
                }
                if (typeof m.maxDownloads === 'number') {
                  lastNumberRef.current = m.maxDownloads;
                }
                return { ...m, maxDownloads: '' };
              })}
              className={cls(
        'basis-1/2 h-full flex items-center justify-center gap-2 px-2 sm:px-3 font-medium transition relative ring-1 ring-neutral-700',
                meta.maxDownloads === ''
                  ? 'text-brand-300 bg-brand-600/15 hover:bg-brand-600/20 ring-brand-600/60'
                  : 'text-neutral-300 relative group'
              )}
            >
              {meta.maxDownloads !== '' && (
                <span className="pointer-events-none absolute inset-1 rounded-md bg-neutral-800/40 opacity-0 transition group-hover:opacity-100 group-focus-visible:opacity-100" />
              )}
              <span className="text-base leading-none relative z-10">∞</span>
              <span className="hidden sm:inline relative z-10">Unlimited</span>
            </button>
          </div>
        </div>
        <label className="flex flex-col gap-1 text-xs col-span-3 sm:col-span-1">
          <span className="flex items-center justify-between text-neutral-400">
            <span className="uppercase tracking-wide">Download Password{requireFilePw ? '' : ' (optional)'}</span>
            {requireFilePw && (
              <span className="group relative inline-flex items-center">
                <span
                  tabIndex={0}
                  aria-describedby="pw-policy-tip"
                  className="inline-flex select-none items-center rounded-full bg-red-600/15 px-2 py-0.5 text-[11px] font-medium text-red-300 ring-1 ring-red-600/40 backdrop-blur-sm outline-none transition focus:ring-red-500/60 hover:bg-red-600/25 cursor-default"
                >Required</span>
                <span
                  id="pw-policy-tip"
                  role="tooltip"
                  className="pointer-events-none absolute left-1/2 top-full z-20 mt-3 w-64 -translate-x-1/2 rounded-lg border border-neutral-700/60 bg-neutral-950/95 px-3.5 py-2.5 text-[11px] leading-snug text-neutral-200 shadow-[0_6px_28px_-6px_rgba(0,0,0,0.55)] backdrop-blur-xl opacity-0 translate-y-1 scale-95 will-change-transform transition duration-180 ease-out group-hover:opacity-100 group-hover:translate-y-0 group-hover:scale-100 group-focus-within:opacity-100 group-focus-within:translate-y-0 group-focus-within:scale-100">
                  The administrator of this system requires all uploads to be password protected.
                  <span className="absolute -top-1 left-1/2 -translate-x-1/2 h-2 w-2 rotate-45 border border-neutral-700/60 border-b-transparent border-r-transparent bg-neutral-950/95" />
                </span>
              </span>
            )}
          </span>
          <input
            type="password"
            value={meta.downloadPassword}
            placeholder={requireFilePw ? 'Password (required)' : 'Leave blank for none'}
            disabled={busy}
            maxLength={30}
            onChange={(e) => setMeta(m => ({ ...m, downloadPassword: e.target.value }))}
            className="w-full h-9 rounded-md bg-neutral-900/80 backdrop-blur px-2 text-neutral-100 ring-1 ring-neutral-700 placeholder:text-neutral-600 focus:outline-none focus:ring-2 focus:ring-brand-500 transition text-[13px]"
          />
        </label>
      </div>

      {adminOnly && (
        <div className="rounded-md bg-neutral-900/70 backdrop-blur px-4 py-3 text-xs text-neutral-300 ring-1 ring-neutral-800 flex flex-col gap-2">
          <p className="flex items-start gap-2 leading-snug"><LockClosedIcon className="h-4 w-4 text-brand-400 shrink-0 mt-0.5" /> <span>Uploads are restricted by the administrator. Enter the admin password to upload files.</span></p>
          <input
            type="password"
            value={adminPass}
            onChange={(e) => setAdminPass(e.target.value)}
            placeholder="Admin password"
            className="rounded-md bg-neutral-800 px-2 py-1 text-neutral-100 ring-1 ring-neutral-700 focus:outline-none focus:ring-brand-500 placeholder:text-neutral-500"
          />
        </div>
      )}

  {busy && <p className="text-sm text-neutral-400">Uploading...</p>}
      {error && <p className="text-sm text-red-400">{error}</p>}
      {!error && !busy && !result && selectedFile && !sizeWarning && (
        <p className="text-[11px] text-neutral-500">Max size: {formatBytes(maxSize)}</p>
      )}
      {result && (
        <div
          className={cls(
            'rounded-md bg-neutral-900 p-4 text-xs ring-1 ring-neutral-700 space-y-2 transition-all duration-300 ease-out will-change-transform',
            cardEntered ? 'opacity-100 translate-y-0 scale-100' : 'opacity-0 translate-y-2 scale-[0.98]'
          )}
        >
          <p className="font-semibold text-neutral-200">Uploaded</p>
          <div className="flex flex-col gap-1">
            <span className="text-neutral-500">Share Link</span>
            <div className="flex items-stretch gap-2">
              <input
                readOnly
                value={`${typeof window !== 'undefined' ? window.location.origin : ''}/file/${result.id}`}
                className="flex-1 truncate rounded-md bg-neutral-950/80 backdrop-blur px-2 py-1 text-neutral-100 ring-1 ring-neutral-700 focus:outline-none"
              />
              <button
                type="button"
                onClick={() => { navigator.clipboard.writeText(`${window.location.origin}/file/${result.id}`); setCopied(true); setTimeout(()=>setCopied(false), 1500); }}
                className={`rounded-md px-3 py-1 font-medium ring-1 transition text-neutral-200 ${copied ? 'bg-green-600 ring-green-500 scale-[1.03]' : 'bg-neutral-800 ring-neutral-600 hover:bg-neutral-700'}`}
              >{copied ? 'Copied!' : 'Copy'}</button>
              {typeof navigator !== 'undefined' && (navigator as any).share && /Mobi|Android/i.test(navigator.userAgent) && (
                <button
                  type="button"
                  onClick={() => (navigator as any).share({ url: `${window.location.origin}/file/${result.id}`, title: 'Pastry File' }).catch(()=>{})}
                  className="rounded-md bg-brand-600 px-3 py-1 font-medium text-white hover:bg-brand-500"
                >Share</button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
