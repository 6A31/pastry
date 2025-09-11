import { listRecent } from '../../../lib/db';
import { log } from '../../../lib/log';
import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { nanoid } from 'nanoid';

export async function GET() {
  const store = cookies();
  let sessionId = store.get('psid')?.value;
  if (!sessionId) {
    sessionId = nanoid(24);
    store.set('psid', sessionId, { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', path: '/', maxAge: 60 * 60 * 24 * 30 });
  }
  log.debug('recent request', { sessionId });
  const items = await listRecent(sessionId, 25);
  log.debug('recent response count', items.length);
  return NextResponse.json({ items: items.map(i => ({ id: i.id, filename: i.originalName, size: i.size, expiresAt: i.expiresAt, remainingDownloads: i.maxDownloads != null ? i.maxDownloads - i.downloadCount : null })) });
}
