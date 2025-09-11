import { NextRequest, NextResponse } from 'next/server';
import { getFile, incrementDownload, storageDir } from '../../../../lib/db';
import { consume, rateHeaders } from '../../../../lib/rateLimit';
import path from 'node:path';
import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import * as bcrypt from 'bcryptjs';

export const runtime = 'nodejs';

function sanitizeFilename(name: string) {
  return name.replace(/[^a-zA-Z0-9_.-]+/g, '_').slice(0, 200) || 'file';
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const { id } = params;
  const hideEnum = process.env.PASTRY_DOWNLOAD_ENUM_HIDE === 'true';
  const rlLimit = Number(process.env.PASTRY_DOWNLOAD_RATE_LIMIT || 120); // downloads per window
  const rlWindow = Number(process.env.PASTRY_DOWNLOAD_RATE_WINDOW_MS || 60_000);
  // Basic IP key (same strategy as upload)
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0].trim() || req.ip || 'unknown';
  const key = `dl:${ip}`;
  const rate = consume(key, rlLimit, rlWindow);
  if (!rate.allowed) {
    return NextResponse.json({ error: hideEnum ? 'not found' : 'rate limit exceeded' }, { status: hideEnum ? 404 : 429, headers: rateHeaders(rate) });
  }

  const body = await req.json().catch(() => ({}));
  const providedPassword = typeof body.password === 'string' ? body.password : null;

  const meta = await getFile(id);
  if (!meta) return NextResponse.json({ error: 'not found' }, { status: 404, headers: rateHeaders(rate) });
  if (meta.expiresAt && new Date(meta.expiresAt) < new Date()) {
    return NextResponse.json({ error: hideEnum ? 'not found' : 'expired' }, { status: hideEnum ? 404 : 410, headers: rateHeaders(rate) });
  }
  if (meta.maxDownloads != null && meta.downloadCount >= meta.maxDownloads) {
    return NextResponse.json({ error: hideEnum ? 'not found' : 'download limit reached' }, { status: hideEnum ? 404 : 410, headers: rateHeaders(rate) });
  }

  if (meta.passwordHash) {
    if (!providedPassword) return NextResponse.json({ error: hideEnum ? 'not found' : 'password required' }, { status: hideEnum ? 404 : 401, headers: rateHeaders(rate) });
    const ok = await bcrypt.compare(providedPassword, meta.passwordHash);
    if (!ok) return NextResponse.json({ error: hideEnum ? 'not found' : 'invalid password' }, { status: hideEnum ? 404 : 403, headers: rateHeaders(rate) });
  }

  const diskPath = path.join(storageDir, meta.storedName);
  try { await fs.access(diskPath); } catch { return NextResponse.json({ error: hideEnum ? 'not found' : 'file missing' }, { status: hideEnum ? 404 : 500, headers: rateHeaders(rate) }); }

  await incrementDownload(id);

  const stat = await fs.stat(diskPath);
  const stream = fsSync.createReadStream(diskPath);
  const headers = new Headers(rateHeaders(rate));
  headers.set('Content-Type', 'application/octet-stream');
  headers.set('Content-Length', String(stat.size));
  headers.set('Content-Disposition', `attachment; filename="${sanitizeFilename(meta.originalName)}"`);
  headers.set('X-Content-Type-Options', 'nosniff');
  headers.set('Cache-Control', 'private, max-age=0, no-store');
  headers.set('Content-Security-Policy', "default-src 'none'");
  return new NextResponse(stream as any, { status: 200, headers });
}
