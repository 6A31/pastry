import { NextRequest, NextResponse } from 'next/server';
import { listStoredNames, storageDir } from '../../../../lib/db';
import fs from 'node:fs/promises';
import path from 'node:path';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  if (process.env.VITEST !== '1') return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  const body = await req.json().catch(()=>({}));
  const keep: string[] = Array.isArray(body.keep) ? body.keep : [];
  const meta = await listStoredNames();
  const referenced = new Set(meta.map(m => m.storedName));
  const keepSet = new Set(keep);
  const disk = await fs.readdir(storageDir).catch(()=>[] as string[]);
  const orphans = disk.filter(f => !referenced.has(f) && !keepSet.has(f));
  let removed = 0;
  for (const f of orphans) {
    try { await fs.unlink(path.join(storageDir, f)); removed++; } catch {}
  }
  return NextResponse.json({ removed, orphans });
}