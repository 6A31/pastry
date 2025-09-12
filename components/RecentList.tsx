'use client';
import useSWR from 'swr';
import React, { useEffect, useState } from 'react';

interface FileMetaItem {
  id: string;
  filename: string;
  size: number;
  expiresAt: string | null;
  remainingDownloads: number | null;
}

const fetcher = (url: string) => fetch(url).then(r => r.json());

export default function RecentList() {
  const { data, error, isLoading } = useSWR<{ items: FileMetaItem[] }>('/api/recent', fetcher, { refreshInterval: 15000 });
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [canMobileShare, setCanMobileShare] = useState(false);
  useEffect(() => {
    if (typeof navigator !== 'undefined') {
      const mobile = /Mobi|Android/i.test(navigator.userAgent) || window.matchMedia('(max-width: 768px)').matches;
      setCanMobileShare(!!(navigator as any).share && mobile);
    }
  }, []);
  return (
    <div className="space-y-4">
      <h2 className="text-sm font-semibold tracking-wide text-neutral-300">Recent Files</h2>
  {isLoading && <p className="text-xs text-neutral-500">Loading...</p>}
      {error && <p className="text-xs text-red-500">Failed to load</p>}
      <ul className="divide-y divide-neutral-800 rounded-md ring-1 ring-neutral-800">
        {data?.items?.length ? data.items.map(item => {
          const share = () => {
            const url = `${window.location.origin}/file/${item.id}`;
            if ((navigator as any).share) {
              (navigator as any).share({ url, title: item.filename }).catch(()=>{});
            }
          };
          const copy = () => {
            navigator.clipboard.writeText(`${window.location.origin}/file/${item.id}`);
            setCopiedId(item.id); setTimeout(()=> setCopiedId(null), 1500);
          };
          return (
            <li key={item.id} className="flex flex-col gap-1 px-3 py-2 text-xs sm:flex-row sm:items-center sm:justify-between">
              <span className="truncate" title={item.filename}>{item.filename}</span>
              <div className="flex items-center gap-3">
                <span className="text-neutral-500 whitespace-nowrap">{item.remainingDownloads ?? '∞'} dl · {item.expiresAt ? new Date(item.expiresAt).toLocaleDateString() : 'No expiry'}</span>
                <div className="flex gap-1">
                  <button onClick={copy} className={`rounded px-2 py-0.5 text-[10px] font-medium ring-1 transition ${copiedId === item.id ? 'bg-green-600 text-white ring-green-500 scale-105' : 'bg-neutral-800 text-neutral-200 ring-neutral-700 hover:bg-neutral-700'}`}>{copiedId === item.id ? 'Copied!' : 'Copy'}</button>
                  {canMobileShare && <button onClick={share} className="rounded bg-brand-600 px-2 py-0.5 text-[10px] font-medium text-white hover:bg-brand-500">Share</button>}
                </div>
              </div>
            </li>
          );
        }) : !isLoading && <li className="px-3 py-2 text-xs text-neutral-500">No files yet.</li>}
      </ul>
    </div>
  );
}
