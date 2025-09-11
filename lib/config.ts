import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const hasEnvLocal = fs.existsSync(path.join(root, '.env.local'));
const hasEnv = fs.existsSync(path.join(root, '.env'));
if (!hasEnvLocal && !hasEnv) {
  throw new Error('Pastry startup error: missing .env or .env.local file. Create one from .env.example.');
}

// Legacy env variable name support (PATRY_* -> PASTRY_*)
const legacyMap: Record<string, string> = {
  PATRY_ADMIN_UPLOAD_PASSWORD: 'PASTRY_ADMIN_PASSWORD',
  PATRY_STORAGE_DIR: 'PASTRY_STORAGE_DIR',
  PATRY_MAX_FILE_SIZE: 'PASTRY_MAX_FILE_SIZE',
  PATRY_ALLOWED_MIME_REGEX: 'PASTRY_ALLOWED_MIME_REGEX',
  PATRY_JWT_SECRET: 'PASTRY_JWT_SECRET'
};
for (const key in legacyMap) {
  const newKey = legacyMap[key];
  if (!process.env[newKey] && process.env[key]) {
    process.env[newKey] = process.env[key];
    // eslint-disable-next-line no-console
    console.warn(`[pastry] Deprecated env ${key} detected; please migrate to ${newKey}.`);
  }
}

if (process.env.PASTRY_ADMIN_ONLY_UPLOADS === 'true' && !process.env.PASTRY_ADMIN_PASSWORD) {
  throw new Error('Pastry misconfiguration: PASTRY_ADMIN_ONLY_UPLOADS=true but PASTRY_ADMIN_PASSWORD is not set.');
}

export {}; 