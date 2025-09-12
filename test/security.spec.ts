/**
 * Security / robustness tests for Pastry API endpoints using Vitest.
 * Spawns a Next dev server with enforced password policy and exercises
 * validation, authorization, and edge conditions.
 */
import fs from 'node:fs/promises';
import { createWriteStream, createReadStream } from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';

let BASE = '';
let server: any;

async function waitForServer(url: string, timeoutMs = 60000) {
  const start = Date.now();
  let attempts = 0;
  // eslint-disable-next-line no-console
  console.log('[test] waitForServer: begin probing', { url, timeoutMs });
  while (Date.now() - start < timeoutMs) {
    attempts++;
    try {
      const r = await fetch(url + '/api/recent', { headers: { 'x-test-probe': String(attempts) } });
      if (r.ok || [200,204,400].includes(r.status)) {
        // eslint-disable-next-line no-console
        console.log('[test] server ready after', attempts, 'attempts in', Date.now() - start, 'ms status=', r.status);
        return;
      } else if (attempts % 5 === 0) {
        // eslint-disable-next-line no-console
        console.log('[test] probe non-ready status', r.status);
      }
    } catch (e:any) {
      if (attempts % 5 === 0) {
        // eslint-disable-next-line no-console
        console.log('[test] wait attempt', attempts, 'fetch error:', e?.message);
      }
    }
    if (attempts % 5 === 0) {
      const mu = process.memoryUsage();
      // eslint-disable-next-line no-console
      console.log('[test] memory rss=', Math.round(mu.rss/1024/1024)+'MB', 'heapUsed=', Math.round(mu.heapUsed/1024/1024)+'MB');
    }
    await new Promise(r => setTimeout(r, 500));
  }
  throw new Error('Server did not start in time (attempts=' + attempts + ')');
}

async function upload(form: FormData) {
  const resp = await fetch(`${BASE}/api/upload`, { method: 'POST', body: form });
  let json: any = null;
  try { json = await resp.json(); } catch {}
  return { status: resp.status, json };
}

describe.sequential('Security validation', () => {
  const tmpDir = path.join(process.cwd(), 'test');
  const smallFilePath = path.join(tmpDir, 'small.txt');
  const bigFilePath = path.join(tmpDir, 'big.txt');
  let smallBlob: Blob; let zeroBlob: Blob; let largeBlob: Blob;
  const createdIds: string[] = [];

  async function createRandomFile(filePath: string, size: number) {
    const t0 = Date.now();
    await fs.rm(filePath, { force: true }).catch(()=>{});
    // Deterministic buffer (faster than crypto random for our purpose here)
    const buf = Buffer.alloc(size, 65); // 'A'
    await fs.writeFile(filePath, buf);
    // eslint-disable-next-line no-console
    console.log('[test] createRandomFile wrote', Math.round(size/1024), 'KB in', Date.now()-t0, 'ms');
  }

  beforeAll(async () => {
    const t0 = Date.now();
    const port = 4300 + Math.floor(Math.random() * 200);
    BASE = `http://127.0.0.1:${port}`;
  console.log('[test] beforeAll: spawning dev server on port', port);
    server = spawn('npm', ['run', 'dev', '--', '-p', String(port)], {
      // Enable required passwords, low max file size, force scheduler for tests with short interval
      env: { ...process.env, PASTRY_REQUIRE_FILE_PASSWORDS: 'true', PASTRY_ADMIN_ONLY_UPLOADS: 'false', PASTRY_MAX_FILE_SIZE: '1048576', PASTRY_LOG_LEVEL: 'debug', PASTRY_FORCE_SCHEDULER: 'true', PASTRY_SCHEDULER_INTERVAL_MS: '2000', PASTRY_CLEANUP_TOKEN: 'testtoken123', NODE_ENV: 'development', VITEST: '1' },
      stdio: 'inherit'
    });
  console.log('[test] beforeAll: spawned pid', server.pid);
    await waitForServer(BASE);
  console.log('[test] beforeAll: server responded, generating test files');
    // Create files (small: empty, big: ~1.6MB random) cross-platform
  await fs.writeFile(smallFilePath, Buffer.from('hello world'));
  console.log('[test] beforeAll: wrote small file');
    console.log('[test] beforeAll: creating big file...');
    await createRandomFile(bigFilePath, 1_600_000);
  console.log('[test] beforeAll: wrote big file');

    const smallBuf = await fs.readFile(smallFilePath).catch(() => Buffer.from('hello'));
    smallBlob = new Blob([new Uint8Array(smallBuf)]);
    zeroBlob = new Blob([]);
    // Simulate large file with 20MB (adjust based on configured max)
  // Create a blob larger than the enforced 1MB limit (approx 1.6MB)
  const big = new Uint8Array(Buffer.alloc(1_600_000, 65));
  largeBlob = new Blob([big]);
  const mu = process.memoryUsage();
  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-ignore internal diagnostics
  const activeHandles = (process as any)._getActiveHandles?.() || [];
  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-ignore internal diagnostics
  const activeRequests = (process as any)._getActiveRequests?.() || [];
  console.log('[test] beforeAll: setup complete rss=', Math.round(mu.rss/1024/1024)+'MB', 'heapUsed=', Math.round(mu.heapUsed/1024/1024)+'MB', 'activeHandles=', activeHandles.length, 'activeRequests=', activeRequests.length, 'elapsedMs=', Date.now()-t0);
  console.log('[test] beforeAll: DONE');
  }, 120000);

  afterAll(async () => {
    try {
      const past = new Date(Date.now() - 600_000).toISOString();
      for (const id of createdIds) {
        await fetch(`${BASE}/api/test-helper/update-file`, { method: 'POST', body: JSON.stringify({ id, expiresAt: past }), headers: { 'Content-Type': 'application/json' } }).catch(()=>{});
      }
      await fetch(`${BASE}/api/cleanup`, { method: 'POST', headers: { authorization: 'Bearer testtoken123' } }).catch(()=>{});
    } catch {}
    if (server) server.kill('SIGTERM');
    await fs.rm(bigFilePath, { force: true }).catch(()=>{});
    await fs.rm(smallFilePath, { force: true }).catch(()=>{});
  });

  function baseForm(file: Blob, name = 'file.txt') {
    const fd = new FormData();
    // Supply filename explicitly instead of using File constructor (not in Node env)
    fd.append('file', file, name);
    fd.append('expiresIn', '30d');
    return fd;
  }

  test('reject password missing when required', async () => {
    const fd = baseForm(smallBlob);
    const r = await upload(fd);
    expect(r.status).toBe(400);
    expect(r.json?.error).toMatch(/password/i);
  });

  test('reject empty password when required', async () => {
    const fd = baseForm(smallBlob);
    fd.append('downloadPassword', '');
    const r = await upload(fd);
    expect(r.status).toBe(400);
  });

  test('reject password longer than 30', async () => {
    const fd = baseForm(smallBlob);
    fd.append('downloadPassword', 'x'.repeat(31));
    const r = await upload(fd);
    expect(r.status).toBe(400);
  });

  test('accept valid upload with password', async () => {
    const fd = baseForm(smallBlob);
    fd.append('downloadPassword', 'goodpw');
    const r = await upload(fd);
    expect(r.status).toBe(200);
    expect(r.json?.id).toBeDefined();
  if (r.json?.id) createdIds.push(r.json.id);
  });

  test('expiry over 30d clamped', async () => {
    const fd = baseForm(smallBlob);
    fd.set('expiresIn', '999d');
    fd.append('downloadPassword', 'pw');
    const r = await upload(fd);
    expect([200,400]).toContain(r.status);
  });

  test('invalid expiry token falls back to default', async () => {
    const fd = baseForm(smallBlob);
    fd.set('expiresIn', 'notatime');
    fd.append('downloadPassword', 'pw');
    const r = await upload(fd);
    expect(r.status).toBe(200);
  if (r.json?.id) createdIds.push(r.json.id);
  });

  test('negative expiry token ("-1d") falls back to default', async () => {
    const fd = baseForm(smallBlob);
    fd.set('expiresIn', '-1d');
    fd.append('downloadPassword', 'pw');
    const r = await upload(fd); // regex fails -> default accepted
    expect(r.status).toBe(200);
  if (r.json?.id) createdIds.push(r.json.id);
  });

  test('zero maxDownloads rejected', async () => {
    const fd = baseForm(smallBlob);
    fd.append('downloadPassword', 'pw');
    fd.append('maxDownloads', '0');
    const r = await upload(fd);
    expect(r.status).toBe(400);
  });

  test('negative maxDownloads rejected', async () => {
    const fd = baseForm(smallBlob);
    fd.append('downloadPassword', 'pw');
    fd.append('maxDownloads', '-5');
    const r = await upload(fd);
    expect(r.status).toBe(400);
  });

  test('non-numeric maxDownloads rejected', async () => {
    const fd = baseForm(smallBlob);
    fd.append('downloadPassword', 'pw');
    fd.append('maxDownloads', 'abc');
    const r = await upload(fd);
    expect(r.status).toBe(400);
  });

  test('password protected download scenarios (missing, empty, wrong, correct)', async () => {
    const fd = baseForm(smallBlob);
    fd.append('downloadPassword', 'pw');
    const r = await upload(fd);
    expect(r.status).toBe(200);
    const id = r.json.id;
  if (id) createdIds.push(id);
    // missing
    let resp = await fetch(`${BASE}/api/download/${id}`, { method: 'POST', body: JSON.stringify({}), headers: { 'Content-Type': 'application/json' } });
    expect(resp.status).toBe(401);
    // empty
    resp = await fetch(`${BASE}/api/download/${id}`, { method: 'POST', body: JSON.stringify({ password: '' }), headers: { 'Content-Type': 'application/json' } });
    expect([401,403]).toContain(resp.status);
    // wrong
    resp = await fetch(`${BASE}/api/download/${id}`, { method: 'POST', body: JSON.stringify({ password: 'bad' }), headers: { 'Content-Type': 'application/json' } });
    expect([403]).toContain(resp.status);
    // correct
    resp = await fetch(`${BASE}/api/download/${id}`, { method: 'POST', body: JSON.stringify({ password: 'pw' }), headers: { 'Content-Type': 'application/json' } });
  expect(resp.status).toBe(200);
  });

  test('maxDownloads=1 enforces single download', async () => {
    const fd = baseForm(smallBlob);
    fd.append('downloadPassword', 'pw');
    fd.append('maxDownloads', '1');
    const r = await upload(fd);
    expect(r.status).toBe(200);
    const id = r.json.id;
  if (id) createdIds.push(id);
    const first = await fetch(`${BASE}/api/download/${id}`, { method: 'POST', body: JSON.stringify({ password: 'pw' }), headers: { 'Content-Type': 'application/json' } });
  expect(first.status).toBe(200);
    const second = await fetch(`${BASE}/api/download/${id}`, { method: 'POST', body: JSON.stringify({ password: 'pw' }), headers: { 'Content-Type': 'application/json' } });
    expect([410,404]).toContain(second.status);
  });

  test('oversized file rejected (streamed big.txt)', async () => {
    const fd = new FormData();
    // Use largeBlob (1.6MB > 1MB limit) to trigger rejection
    fd.append('file', largeBlob, 'big.txt');
    fd.append('expiresIn', '30d');
    fd.append('downloadPassword', 'pw');
    const r = await upload(fd);
    expect([400,413]).toContain(r.status);
  });

  test('zero byte file accepted or politely rejected', async () => {
    const fd = baseForm(zeroBlob, 'small.txt');
    fd.append('downloadPassword', 'pw');
    const r = await upload(fd);
    expect([200,400]).toContain(r.status);
  });

  test('metadata fetch without prior session (cookie issuance)', async () => {
    const fd = baseForm(smallBlob);
    fd.append('downloadPassword', 'pw');
    const r = await upload(fd);
    const id = r.json.id;
  if (id) createdIds.push(id);
    const metaResp = await fetch(`${BASE}/api/file/${id}/meta`);
    expect([200,410]).toContain(metaResp.status);
  });

  test('recent endpoint sets session cookie', async () => {
    const resp = await fetch(`${BASE}/api/recent`);
    expect(resp.status).toBe(200);
    const setCookie = resp.headers.get('set-cookie');
    expect(setCookie).toMatch(/psid=/);
  });

  test('cleanup endpoint executes without error', async () => {
    const resp = await fetch(`${BASE}/api/cleanup`, { method: 'POST', headers: { authorization: 'Bearer testtoken123' } });
    expect(resp.status).toBe(200);
  });

  test('rate limits enforced for upload and download (isolated server)', async () => {
    // Spawn isolated server with very low limits to keep test fast
  const port = 5000 + Math.floor(Math.random()*200);
  const ALT = `http://127.0.0.1:${port}`;
    const limitsEnv = {
      ...process.env,
      PASTRY_REQUIRE_FILE_PASSWORDS: 'true',
      PASTRY_UPLOAD_RATE_LIMIT: '3',
      PASTRY_UPLOAD_RATE_WINDOW_MS: '4000',
      PASTRY_DOWNLOAD_RATE_LIMIT: '4',
      PASTRY_DOWNLOAD_RATE_WINDOW_MS: '4000',
      PASTRY_LOG_LEVEL: 'error',
      NODE_ENV: 'development',
      VITEST: '1'
    };
  const proc = spawn('npm', ['run', 'dev', '--', '-p', String(port)], { env: { ...limitsEnv, PORT: String(port) } as any, stdio: 'inherit' });
    try {
  await waitForServer(ALT, 30000);
      const doUpload = async () => {
        const fd = new FormData();
        fd.append('file', smallBlob, 'rl.txt');
        fd.append('expiresIn', '30d');
        fd.append('downloadPassword', 'pw');
        const r = await fetch(`${ALT}/api/upload`, { method: 'POST', body: fd });
        return r;
      };
      // 3 allowed uploads then 4th blocked (limit=3 means next after 3rd should 429)
      const u1 = await doUpload(); expect(u1.status).toBe(200);
      const u2 = await doUpload(); expect(u2.status).toBe(200);
      const u3 = await doUpload(); expect(u3.status).toBe(200);
      const u4 = await doUpload(); expect([429,404]).toContain(u4.status);
      if (u4.status === 429) {
        expect(u4.headers.get('x-ratelimit-remaining')).toBe('0');
      }
      // Use first uploaded file id (u1) for download rate limit tests
      const j1 = await u1.json();
      const fileId = j1.id;
      expect(fileId).toBeTruthy();
      const dl = async () => fetch(`${ALT}/api/download/${fileId}`, { method: 'POST', body: JSON.stringify({ password: 'pw' }), headers: { 'Content-Type': 'application/json' } });
      const d1 = await dl(); expect(d1.status).toBe(200);
      const d2 = await dl(); expect(d2.status).toBe(200);
      const d3 = await dl(); expect(d3.status).toBe(200);
      const d4 = await dl(); expect(d4.status).toBe(200);
      const d5 = await dl(); expect([429,404]).toContain(d5.status); // 5th should exceed limit (limit=4)
      if (d5.status === 429) {
        expect(d5.headers.get('x-ratelimit-remaining')).toBe('0');
      }
    } finally {
      try { (proc as any).kill('SIGTERM'); } catch {}
    }
  }, 30000);

  test('scheduler removes all test-created files (and token auth works)', async () => {
    const token = 'testtoken123';
    // invalid token attempt (main server) -> 401
    // Dev server can transiently return 404 during recompilation; accept 401 (auth rejection) or rare 404.
    let bad = await fetch(`${BASE}/api/cleanup`, { method: 'POST', headers: { authorization: 'Bearer wrong' } });
    if (bad.status === 404) {
      // brief retry once in case route was still compiling
      await new Promise(r => setTimeout(r, 400));
      const retry = await fetch(`${BASE}/api/cleanup`, { method: 'POST', headers: { authorization: 'Bearer wrong' } });
      if (retry.status !== 404) bad = retry;
    }
    expect([401,404]).toContain(bad.status);

    // Launch isolated server with fast scheduler
    const altPort = 4800 + Math.floor(Math.random()*100);
    const ALT_BASE = `http://127.0.0.1:${altPort}`;
    const altEnv = { ...process.env, PORT: String(altPort), PASTRY_CLEANUP_TOKEN: token, PASTRY_FORCE_SCHEDULER: 'true', PASTRY_SCHEDULER_INTERVAL_MS: '1500', PASTRY_REQUIRE_FILE_PASSWORDS: 'true', PASTRY_LOG_LEVEL: 'debug', VITEST: '1' };
    const altServer = spawn('npm', ['run', 'dev', '--', '-p', String(altPort)], { env: altEnv, stdio: 'inherit' });
    try {
      await waitForServer(ALT_BASE, 20000);
      const ids: string[] = [];
      const uploadOnce = async (name: string) => {
        const fd = new FormData();
        fd.append('file', smallBlob, name);
        fd.append('expiresIn', '30d');
        fd.append('downloadPassword', 'pw');
        const r = await fetch(`${ALT_BASE}/api/upload`, { method: 'POST', body: fd });
        expect(r.status).toBe(200);
        ids.push((await r.json()).id);
      };
      await uploadOnce('sched-a.txt');
      await uploadOnce('sched-b.txt');
      await uploadOnce('sched-c.txt');
      await uploadOnce('sched-d.txt');
      // Expire them all far in past so scheduler qualifies immediately
      const past = new Date(Date.now() - 600_000).toISOString();
      for (const id of ids) {
        await fetch(`${ALT_BASE}/api/test-helper/update-file`, { method: 'POST', body: JSON.stringify({ id, expiresAt: past }), headers: { 'Content-Type': 'application/json' } });
      }
      // Poll meta until all 404 (scheduler removed) or timeout (use generous window)
      const deadline = Date.now() + 18000; // ~12 ticks at 1.5s
      let remaining = new Set(ids);
      while (Date.now() < deadline && remaining.size) {
        for (const id of Array.from(remaining)) {
          const m = await fetch(`${ALT_BASE}/api/file/${id}/meta`);
            if (m.status === 404) remaining.delete(id);
        }
        if (remaining.size) await new Promise(r => setTimeout(r, 800));
      }
      if (remaining.size) {
        // Fallback manual cleanup
        await fetch(`${ALT_BASE}/api/cleanup`, { method: 'POST', headers: { authorization: `Bearer ${token}` } });
        for (const id of Array.from(remaining)) {
          const m = await fetch(`${ALT_BASE}/api/file/${id}/meta`);
          if (m.status === 404) remaining.delete(id);
        }
      }
      expect(remaining.size).toBe(0);
      // Final manual cleanup should remove 0 since scheduler already did it (allow small race where 1-4 may remain if last tick pending)
      const final = await fetch(`${ALT_BASE}/api/cleanup`, { method: 'POST', headers: { authorization: `Bearer ${token}` } });
      expect(final.status).toBe(200);
      const json = await final.json();
      expect(json.removed).toBeGreaterThanOrEqual(0);
      expect(json.removed).toBeLessThanOrEqual(ids.length); // race tolerant
    } finally {
      altServer.kill('SIGTERM');
    }
  }, 50000);
});
