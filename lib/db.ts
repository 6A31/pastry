import './config';
import { log } from './log';
// better-sqlite3 types expose a function export; use require to avoid TS construct signature complaints.
// eslint-disable-next-line @typescript-eslint/no-var-requires
// dynamic require to keep types loose
// eslint-disable-next-line @typescript-eslint/no-var-requires
const BetterSqlite3 = require('better-sqlite3') as unknown as typeof import('better-sqlite3');
import { MongoClient, Collection } from 'mongodb';
import { nanoid } from 'nanoid';
import fs from 'node:fs';
import path from 'node:path';
import * as bcrypt from 'bcryptjs';

export interface FileRecord {
  id: string;
  originalName: string;
  storedName: string;
  size: number;
  mime: string | null;
  createdAt: string; // ISO
  expiresAt: string | null;
  maxDownloads: number | null;
  downloadCount: number;
  passwordHash: string | null;
  ownerId: string; // session owner
}

let sqlite: import('better-sqlite3').Database | null = null;
let mongo: MongoClient | null = null;
let mongoCol: Collection<FileRecord> | null = null;

const storageDir = process.env.PASTRY_STORAGE_DIR || path.join(process.cwd(), 'storage');
if (!fs.existsSync(storageDir)) fs.mkdirSync(storageDir, { recursive: true });

function initSqlite() {
  if (sqlite) return;
  sqlite = new BetterSqlite3(path.join(process.cwd(), 'pastry.db'));
  sqlite.pragma('journal_mode = WAL');
  sqlite.exec(`CREATE TABLE IF NOT EXISTS files (
    id TEXT PRIMARY KEY,
    original_name TEXT NOT NULL,
    stored_name TEXT NOT NULL,
    size INTEGER NOT NULL,
    mime TEXT,
    created_at TEXT NOT NULL,
    expires_at TEXT,
    max_downloads INTEGER,
    download_count INTEGER NOT NULL DEFAULT 0,
    password_hash TEXT,
    owner_id TEXT NOT NULL
  );`);
  // Lightweight migration if existing table lacks owner_id
  const cols = sqlite.prepare("PRAGMA table_info(files)").all() as { name: string }[];
  if (!cols.find(c => c.name === 'owner_id')) {
    try { sqlite.prepare('ALTER TABLE files ADD COLUMN owner_id TEXT NOT NULL DEFAULT "public"').run(); } catch {}
  }
}

async function initMongo() {
  if (mongoCol) return;
  const uri = process.env.MONGODB_URI;
  if (!uri) return;
  mongo = new MongoClient(uri);
  await mongo.connect();
  mongoCol = mongo.db().collection<FileRecord>('pastry_files');
  await mongoCol.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0, partialFilterExpression: { expiresAt: { $type: 'string' } } });
}

export async function ensureDB() {
  if (process.env.MONGODB_URI) {
    log.debug('ensureDB: using Mongo');
    await initMongo();
  } else {
    if (!sqlite) log.debug('ensureDB: initializing sqlite');
    initSqlite();
  }
}

function toRecord(row: any): FileRecord {
  return {
    id: row.id,
    originalName: row.original_name,
    storedName: row.stored_name,
    size: row.size,
    mime: row.mime,
    createdAt: row.created_at,
    expiresAt: row.expires_at,
    maxDownloads: row.max_downloads,
    downloadCount: row.download_count,
    passwordHash: row.password_hash,
    ownerId: row.owner_id
  };
}

export async function insertFile(meta: { originalName: string; size: number; mime: string | null; expiresAt: string | null; maxDownloads: number | null; password: string | null; ownerId: string; storedName?: string; }): Promise<FileRecord> {
  await ensureDB();
  const id = nanoid(10);
  const storedName = meta.storedName || nanoid(32);
  const now = new Date().toISOString();
  const passwordHash = meta.password ? await bcrypt.hash(meta.password, 10) : null;
  const rec: FileRecord = { id, originalName: meta.originalName, storedName, size: meta.size, mime: meta.mime, createdAt: now, expiresAt: meta.expiresAt, maxDownloads: meta.maxDownloads, downloadCount: 0, passwordHash, ownerId: meta.ownerId };
  if (mongoCol) {
    await mongoCol.insertOne(rec);
  } else if (sqlite) {
    sqlite.prepare(`INSERT INTO files (id, original_name, stored_name, size, mime, created_at, expires_at, max_downloads, download_count, password_hash, owner_id) VALUES (@id,@originalName,@storedName,@size,@mime,@createdAt,@expiresAt,@maxDownloads,@downloadCount,@passwordHash,@ownerId)`).run(rec);
  }
  return rec;
}

export async function listRecent(ownerId: string, limit = 20): Promise<FileRecord[]> {
  await ensureDB();
  if (mongoCol) {
    const now = new Date();
    return mongoCol.find({ ownerId, $or: [ { expiresAt: null }, { expiresAt: { $gt: now.toISOString() } } ] }, { projection: { passwordHash: 0 } }).sort({ createdAt: -1 }).limit(limit).toArray();
  } else if (sqlite) {
    const rows = sqlite.prepare(`SELECT * FROM files WHERE owner_id = ? AND (expires_at IS NULL OR expires_at > ?) ORDER BY created_at DESC LIMIT ?`).all(ownerId, new Date().toISOString(), limit);
    return rows.map(toRecord);
  }
  return [];
}

export async function getFile(id: string): Promise<FileRecord | null> {
  await ensureDB();
  if (mongoCol) {
    return await mongoCol.findOne({ id });
  } else if (sqlite) {
    const row = sqlite.prepare(`SELECT * FROM files WHERE id = ?`).get(id);
    return row ? toRecord(row) : null;
  }
  return null;
}

export async function incrementDownload(id: string) {
  await ensureDB();
  if (mongoCol) {
    await mongoCol.updateOne({ id }, { $inc: { downloadCount: 1 } });
  } else if (sqlite) {
    sqlite.prepare(`UPDATE files SET download_count = download_count + 1 WHERE id = ?`).run(id);
  }
}

// Test helper: update arbitrary fields (limited to expiresAt, downloadCount) for a record
export async function __testUpdateFile(id: string, fields: { expiresAt?: string | null; downloadCount?: number }) {
  await ensureDB();
  if (mongoCol) {
    const update: any = {};
    if (fields.expiresAt !== undefined) update.expiresAt = fields.expiresAt;
    if (fields.downloadCount !== undefined) update.downloadCount = fields.downloadCount;
    await mongoCol.updateOne({ id }, { $set: update });
  } else if (sqlite) {
    if (fields.expiresAt !== undefined) {
      sqlite.prepare('UPDATE files SET expires_at = ? WHERE id = ?').run(fields.expiresAt, id);
    }
    if (fields.downloadCount !== undefined) {
      sqlite.prepare('UPDATE files SET download_count = ? WHERE id = ?').run(fields.downloadCount, id);
    }
  }
}

export { storageDir };

// Find expired or over-limit records (internal use for cleanup)
export async function findExpiredOrOverLimit(limit = 1000): Promise<FileRecord[]> {
  await ensureDB();
  const nowIso = new Date().toISOString();
  if (mongoCol) {
    return mongoCol.find({ $or: [ { expiresAt: { $lt: nowIso } }, { $and: [ { maxDownloads: { $ne: null } }, { $expr: { $gte: ['$downloadCount', '$maxDownloads'] } } ] } ] }).limit(limit).toArray();
  } else if (sqlite) {
    const rows = sqlite.prepare(`SELECT * FROM files WHERE (expires_at IS NOT NULL AND expires_at < ?) OR (max_downloads IS NOT NULL AND download_count >= max_downloads) LIMIT ?`).all(nowIso, limit);
    return rows.map(toRecord);
  }
  return [];
}

export async function deleteFileRecord(id: string) {
  await ensureDB();
  if (mongoCol) {
    await mongoCol.deleteOne({ id });
  } else if (sqlite) {
    sqlite.prepare('DELETE FROM files WHERE id = ?').run(id);
  }
}
