// Simple endpoint to trigger manual cleanup (expired or over-limit files)
// In production you'd schedule this.
import { NextResponse } from 'next/server';
import { ensureDB, storageDir, findExpiredOrOverLimit, deleteFileRecord } from '../../../lib/db';
import { log } from '../../../lib/log';
import fs from 'node:fs/promises';
import path from 'node:path';

export async function POST(req: Request) {
  // Optional bearer token protection
  const token = process.env.PASTRY_CLEANUP_TOKEN;
  if (token) {
    const hdr = req.headers.get('authorization') || '';
    if (hdr !== `Bearer ${token}`) {
      return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
    }
  }
  await ensureDB();
  let removed = 0;
  const start = Date.now();
  const victims = await findExpiredOrOverLimit(5000);
  for (const r of victims) {
    try { await fs.unlink(path.join(storageDir, r.storedName)); } catch {}
    try { await deleteFileRecord(r.id); } catch {}
    removed++;
  }
  log.debug('Cleanup run complete', { removed, scanned: victims.length, ms: Date.now() - start });
  return NextResponse.json({ removed, scanned: victims.length });
}
