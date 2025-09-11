import { NextRequest, NextResponse } from 'next/server';
import { getFile, incrementDownload, storageDir } from '../../../../lib/db';
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
  const body = await req.json().catch(() => ({}));
  const providedPassword = typeof body.password === 'string' ? body.password : null;

  const meta = await getFile(id);
  if (!meta) return NextResponse.json({ error: 'not found' }, { status: 404 });
  if (meta.expiresAt && new Date(meta.expiresAt) < new Date()) return NextResponse.json({ error: 'expired' }, { status: 410 });
  if (meta.maxDownloads != null && meta.downloadCount >= meta.maxDownloads) return NextResponse.json({ error: 'download limit reached' }, { status: 410 });

  if (meta.passwordHash) {
    if (!providedPassword) return NextResponse.json({ error: 'password required' }, { status: 401 });
    const ok = await bcrypt.compare(providedPassword, meta.passwordHash);
    if (!ok) return NextResponse.json({ error: 'invalid password' }, { status: 403 });
  }

  const diskPath = path.join(storageDir, meta.storedName);
  try { await fs.access(diskPath); } catch { return NextResponse.json({ error: 'file missing' }, { status: 500 }); }

  await incrementDownload(id);

  const stat = await fs.stat(diskPath);
  const stream = fsSync.createReadStream(diskPath);
  const headers = new Headers();
  headers.set('Content-Type', 'application/octet-stream');
  headers.set('Content-Length', String(stat.size));
  headers.set('Content-Disposition', `attachment; filename="${sanitizeFilename(meta.originalName)}"`);
  headers.set('X-Content-Type-Options', 'nosniff');
  headers.set('Cache-Control', 'private, max-age=0, no-store');
  headers.set('Content-Security-Policy', "default-src 'none'");
  return new NextResponse(stream as any, { status: 200, headers });
}
