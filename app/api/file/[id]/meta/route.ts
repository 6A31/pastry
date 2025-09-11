import { NextResponse } from 'next/server';
import { getFile } from '../../../../../lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const meta = await getFile(params.id);
  if (!meta) return NextResponse.json({ error: 'not found' }, { status: 404 });
  if (meta.expiresAt && new Date(meta.expiresAt) < new Date()) return NextResponse.json({ error: 'expired' }, { status: 410 });
  return NextResponse.json({ id: meta.id, originalName: meta.originalName, expiresAt: meta.expiresAt, requiresPassword: !!meta.passwordHash });
}