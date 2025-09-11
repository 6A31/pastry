import { NextRequest, NextResponse } from 'next/server';
import { insertFile, storageDir } from '../../../lib/db';
import { consume, rateHeaders } from '../../../lib/rateLimit';
import { cookies } from 'next/headers';
import { nanoid } from 'nanoid';
import fs from 'node:fs/promises';
import fssync from 'node:fs';
import path from 'node:path';
import Busboy from 'busboy';

const MAX_EXPIRY_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
const MAX_PASSWORD_LENGTH = 30;

function parseExpires(expiresIn: string | undefined): string | null {
  if (!expiresIn) return null; // handled later (default)
  const m = expiresIn.match(/^(\d+)([mhd])$/);
  if (!m) return null;
  const value = parseInt(m[1], 10);
  const unit = m[2];
  const now = Date.now();
  let ms = value * 60_000; // minutes
  if (unit === 'h') ms = value * 3_600_000;
  if (unit === 'd') ms = value * 86_400_000;
  // Clamp to max 30d even if user supplies a huge number (defensive)
  if (ms > MAX_EXPIRY_MS) ms = MAX_EXPIRY_MS;
  return new Date(now + ms).toISOString();
}

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const maxSize = Number(process.env.PASTRY_MAX_FILE_SIZE || 50 * 1024 * 1024);
  const requireFilePw = process.env.PASTRY_REQUIRE_FILE_PASSWORDS === 'true';
  const adminOnly = process.env.PASTRY_ADMIN_ONLY_UPLOADS === 'true';
  const adminPw = process.env.PASTRY_ADMIN_PASSWORD;
  const rlLimit = Number(process.env.PASTRY_UPLOAD_RATE_LIMIT || 30); // max uploads per window
  const rlWindow = Number(process.env.PASTRY_UPLOAD_RATE_WINDOW_MS || 60_000); // 1 minute

  return new Promise<NextResponse>(async (resolve) => {
    let fields: Record<string,string> = {};
    let fileMeta: { originalName: string; mime: string | null; size: number; storedPath: string } | null = null;
    let aborted = false;

    const cookieStore = cookies();
    let sessionId = cookieStore.get('psid')?.value;
    if (!sessionId) {
      sessionId = nanoid(24);
      cookieStore.set('psid', sessionId, { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', path: '/', maxAge: 60 * 60 * 24 * 30 });
    }

    // Rate limiting (key by IP; fallback to session)
    const ip = req.headers.get('x-forwarded-for')?.split(',')[0].trim() || req.ip || 'unknown';
    const key = `upl:${ip}`;
    const rate = consume(key, rlLimit, rlWindow);
    if (!rate.allowed) {
      return resolve(new NextResponse(JSON.stringify({ error: 'rate limit exceeded' }), { status: 429, headers: { 'Content-Type': 'application/json', ...rateHeaders(rate) } }));
    }
    const bb = Busboy({ headers: Object.fromEntries(req.headers), limits: { fileSize: maxSize, files: 1 } });

  bb.on('file', (_name: string, fileStream: any, info: { filename: string; mimeType: string }) => {
      if (aborted) { fileStream.resume(); return; }
      const { filename, mimeType } = info;
      const storedName = nanoid(32);
      const diskPath = path.join(storageDir, storedName);
      fileMeta = { originalName: filename, mime: mimeType || null, size: 0, storedPath: diskPath };
      const ws = fssync.createWriteStream(diskPath, { flags: 'w', mode: 0o600 });
  fileStream.on('data', (chunk: Buffer) => {
        if (!fileMeta) return;
        fileMeta.size += chunk.length;
      });
      fileStream.on('limit', () => {
        aborted = true;
        fileStream.unpipe();
        ws.destroy();
      });
      fileStream.pipe(ws);
      ws.on('error', () => { aborted = true; });
    });

    bb.on('field', (name: string, val: string) => {
      fields[name] = val;
    });

    bb.on('error', () => {
      aborted = true;
    });

    bb.on('close', async () => {
      try {
        if (aborted || !fileMeta) {
          if (fileMeta) { try { await fs.unlink(fileMeta.storedPath); } catch {} }
          return resolve(NextResponse.json({ error: 'file too large' }, { status: 413 }));
        }
        if (fileMeta.size === 0) {
          try { await fs.unlink(fileMeta.storedPath); } catch {}
          return resolve(NextResponse.json({ error: 'empty file' }, { status: 400 }));
        }
        if (adminOnly) {
          if (!adminPw) return resolve(NextResponse.json({ error: 'server misconfig: admin password not set' }, { status: 500 }));
          if (!fields.adminPassword || fields.adminPassword !== adminPw) {
            try { await fs.unlink(fileMeta.storedPath); } catch {}
            return resolve(NextResponse.json({ error: 'admin password required' }, { status: 401 }));
          }
        }
        const expiresIn = fields.expiresIn;
        let expiresAt = typeof expiresIn === 'string' ? parseExpires(expiresIn) : null;
        if (!expiresAt) expiresAt = new Date(Date.now() + MAX_EXPIRY_MS).toISOString();
        let maxDownloads: number | null = null;
        if (fields.maxDownloads) {
          const parsed = parseInt(fields.maxDownloads, 10);
            if (isNaN(parsed) || parsed <= 0) {
              try { await fs.unlink(fileMeta.storedPath); } catch {}
              return resolve(NextResponse.json({ error: 'maxDownloads must be a positive integer' }, { status: 400 }));
            }
          maxDownloads = parsed;
        }
        const passwordRaw = fields.downloadPassword?.trim();
        if (requireFilePw && !passwordRaw) {
          try { await fs.unlink(fileMeta.storedPath); } catch {}
          return resolve(NextResponse.json({ error: 'password required' }, { status: 400 }));
        }
        if (passwordRaw && passwordRaw.length > MAX_PASSWORD_LENGTH) {
          try { await fs.unlink(fileMeta.storedPath); } catch {}
          return resolve(NextResponse.json({ error: `password too long (max ${MAX_PASSWORD_LENGTH})` }, { status: 400 }));
        }
        // Allowed MIME (best-effort; MIME can be spoofed)
        const allowedRegex = process.env.PASTRY_ALLOWED_MIME_REGEX ? new RegExp(process.env.PASTRY_ALLOWED_MIME_REGEX) : null;
        if (allowedRegex && fileMeta.mime && !allowedRegex.test(fileMeta.mime)) {
          try { await fs.unlink(fileMeta.storedPath); } catch {}
          return resolve(NextResponse.json({ error: 'mime not allowed' }, { status: 400 }));
        }
  const record = await insertFile({ originalName: fileMeta.originalName, size: fileMeta.size, mime: fileMeta.mime, expiresAt, maxDownloads, password: passwordRaw || null, ownerId: sessionId, storedName: path.basename(fileMeta.storedPath) });
        // Move file path already finalized; just return id
  return resolve(NextResponse.json({ id: record.id, url: `/api/download/${record.id}` }, { headers: rateHeaders(rate) }));
      } catch (e) {
        if (fileMeta) { try { await fs.unlink(fileMeta.storedPath); } catch {} }
        return resolve(NextResponse.json({ error: 'internal error' }, { status: 500 }));
      }
    });

    const bodyReadable = req.body;
    if (!bodyReadable) {
      return resolve(NextResponse.json({ error: 'no body' }, { status: 400 }));
    }
  const nodeStream = (bodyReadable as any).getReader ? ReadableStreamToNodeStream(bodyReadable as any) : (bodyReadable as any);
    nodeStream.pipe(bb);
  });
}

// Helper: convert Web ReadableStream to Node stream if necessary
function ReadableStreamToNodeStream(stream: ReadableStream<Uint8Array>) {
  const reader = stream.getReader();
  const nodeStream = new (require('stream').Readable)({
    read() { /* pull below */ }
  });
  function pump() {
    reader.read().then(({ done, value }: any) => {
      if (done) { nodeStream.push(null); return; }
      nodeStream.push(Buffer.from(value));
      pump();
    }).catch(() => nodeStream.push(null));
  }
  pump();
  return nodeStream;
}
