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
  const purgeExceeded = process.env.CLEANUP_PURGE_DOWNLOADS_EXCEEDED === 'true';
  let blobsDeleted = 0;
  let recordsDeleted = 0;
  for (const r of victims) {
    const exceeded = r.maxDownloads != null && r.downloadCount >= r.maxDownloads;
    // Always remove blob if expired OR exceeded.
    try { await fs.unlink(path.join(storageDir, r.storedName)); blobsDeleted++; } catch {}
    if (!exceeded || purgeExceeded) {
      try { await deleteFileRecord(r.id); recordsDeleted++; } catch {}
      removed++;
    }
  }
  log.debug('Cleanup run complete', { removed: recordsDeleted, blobsDeleted, scanned: victims.length, purgedExceeded: purgeExceeded, ms: Date.now() - start });
  return NextResponse.json({ removed: recordsDeleted, blobsDeleted, scanned: victims.length, purgedExceeded: purgeExceeded });
}
