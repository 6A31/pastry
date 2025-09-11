import { NextRequest, NextResponse } from 'next/server';
import { __testUpdateFile, getFile } from '../../../../lib/db';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  if (process.env.VITEST !== '1') {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }
  const body = await req.json().catch(()=> ({}));
  const { id, expiresAt, downloadCount } = body || {};
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });
  await __testUpdateFile(id, { expiresAt, downloadCount });
  const updated = await getFile(id);
  return NextResponse.json({ ok: true, record: updated });
}
