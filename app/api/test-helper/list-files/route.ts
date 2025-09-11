import { NextResponse } from 'next/server';
import { listStoredNames } from '../../../../lib/db';
import fs from 'node:fs/promises';
import path from 'node:path';
import { storageDir } from '../../../../lib/db';

export const runtime = 'nodejs';

export async function GET() {
  if (process.env.VITEST !== '1') return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  const meta = await listStoredNames();
  const disk = await fs.readdir(storageDir).catch(()=>[] as string[]);
  return NextResponse.json({ meta, disk });
}
