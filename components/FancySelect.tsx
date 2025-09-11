'use client';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import cls from 'classnames';

export interface FancyOption { value: string; label: string; }

interface FancySelectProps {
  value: string;
  options: FancyOption[];
  disabled?: boolean;
  onChange: (value: string) => void;
  className?: string;
}

// Lightweight custom select (accessible-ish) without external deps.
export function FancySelect({ value, options, disabled, onChange, className }: FancySelectProps) {
  const [open, setOpen] = useState(false);
  const btnRef = useRef<HTMLButtonElement | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);
  const selectedIndex = options.findIndex(o => o.value === value);

  const close = useCallback(() => setOpen(false), []);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => {
      if (!btnRef.current || !listRef.current) return;
      if (btnRef.current.contains(e.target as Node) || listRef.current.contains(e.target as Node)) return;
      close();
    };
    window.addEventListener('mousedown', h);
    return () => window.removeEventListener('mousedown', h);
  }, [open, close]);

  const onKey = (e: React.KeyboardEvent) => {
    if (disabled) return;
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setOpen(o => !o); return; }
    if (!open && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) { e.preventDefault(); setOpen(true); return; }
    if (open) {
      if (e.key === 'Escape') { e.preventDefault(); close(); return; }
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        let next = selectedIndex;
        if (e.key === 'ArrowDown') next = (selectedIndex + 1) % options.length;
        else next = (selectedIndex - 1 + options.length) % options.length;
        onChange(options[next].value);
      }
    }
  };

  return (
    <div className={cls('relative text-[13px]', className)}>
      <button
        ref={btnRef}
        type="button"
        disabled={disabled}
        onClick={() => !disabled && setOpen(o => !o)}
        onKeyDown={onKey}
        className={cls(
          'group flex w-full items-center justify-between rounded-md px-3 py-2 text-left transition ring-1',
          'bg-neutral-900/80 backdrop-blur shadow-sm',
          open ? 'ring-brand-500 shadow-brand-500/20 shadow-[0_0_0_1px] text-neutral-100' : 'ring-neutral-700 hover:ring-neutral-500',
          disabled && 'opacity-40 cursor-not-allowed'
        )}
      >
        <span className="truncate text-neutral-200">{options.find(o => o.value === value)?.label ?? 'Select'}</span>
        <span className={cls('ml-2 inline-flex h-5 w-5 items-center justify-center rounded transition', open ? 'rotate-180 text-brand-400' : 'text-neutral-500 group-hover:text-neutral-300')}>
          <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor"><path d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.24 4.5a.75.75 0 01-1.08 0l-4.24-4.5a.75.75 0 01.02-1.06z"/></svg>
        </span>
      </button>
      {open && (
        <div
          ref={listRef}
          role="listbox"
          tabIndex={-1}
          className="absolute z-30 mt-1 w-full overflow-hidden rounded-md border border-neutral-700 bg-neutral-950/95 backdrop-blur shadow-lg ring-1 ring-neutral-800"
        >
          <ul className="max-h-60 overflow-y-auto py-1 text-[13px]">
            {options.map(o => {
              const active = o.value === value;
              return (
                <li key={o.value}>
                  <button
                    type="button"
                    onClick={() => { onChange(o.value); close(); }}
                    className={cls(
                      'flex w-full items-center gap-2 px-3 py-1.5 text-left transition',
                      active ? 'bg-brand-600/20 text-brand-300' : 'text-neutral-300 hover:bg-neutral-800'
                    )}
                  >
                    {active && <span className="h-1.5 w-1.5 rounded-full bg-brand-400" />}
                    <span className="truncate">{o.label}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
