import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { createApp } from './app.mjs';
import { LocalRepository } from './repositories/local-repository.mjs';

function fakeMp4(payload = 'video') {
  return Buffer.concat([Buffer.from([0, 0, 0, 16]), Buffer.from('ftypisom'), Buffer.from(payload)]);
}

async function withServer(overrides, operation) {
  const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'zhere-security-upload-'));
  const repository = new LocalRepository(dataDir);
  await repository.init();
  const config = {
    isProduction: false, repository: 'local', appDir: path.resolve(import.meta.dirname, '..'), dataDir,
    sessionDays: 30, sessionCookieSecure: 'false', maxJsonBytes: 2 * 1024 * 1024,
    maxVideoBytes: 1024 * 1024, maxConcurrentVideoUploads: 1, publicWriteLimit: 60,
    publicWorldCacheTtlMs: 0, slowRequestThresholdMs: 0, basePriceTransactionCount: 10,
    adminIdentities: [], ...overrides,
  };
  const server = createApp({ repository, config });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  try { await operation({ baseUrl, repository, dataDir }); }
  finally {
    await new Promise((resolve) => server.close(resolve));
    await fs.rm(dataDir, { recursive: true, force: true });
  }
}

async function register(baseUrl, identity = 'stream@example.com') {
  return fetch(`${baseUrl}/api/auth/register`, {
    method: 'POST', headers: { 'content-type': 'application/json', 'user-agent': 'zhere-test-device' },
    body: JSON.stringify({
      identity, username: 'stream-user', nickname: '流式测试', spaceName: '测试小屋',
      password: 'correct-horse', confirmPassword: 'correct-horse', ageConfirmed: true, agreeTerms: true,
    }),
  });
}

test('streamed upload validates the real signature and removes temporary files', async () => {
  await withServer({}, async ({ baseUrl, dataDir }) => {
    const registration = await register(baseUrl);
    assert.equal(registration.status, 201);
    const cookie = registration.headers.get('set-cookie').split(';')[0];

    const invalid = new FormData();
    invalid.set('assetId', 'invalid-signature');
    invalid.set('file', new File([Buffer.from('not really a video')], 'fake.mp4', { type: 'video/mp4' }));
    const rejected = await fetch(`${baseUrl}/api/media`, { method: 'POST', headers: { cookie }, body: invalid });
    assert.equal(rejected.status, 400);
    assert.equal((await rejected.json()).error.code, 'invalid-media-signature');

    const valid = new FormData();
    valid.set('assetId', 'streamed-video');
    valid.set('file', new File([fakeMp4('streamed')], 'real.mp4', { type: 'video/mp4' }));
    const accepted = await fetch(`${baseUrl}/api/media`, { method: 'POST', headers: { cookie }, body: valid });
    assert.equal(accepted.status, 201);
    let leftovers = [];
    for (let retry = 0; retry < 50; retry += 1) {
      leftovers = await fs.readdir(path.join(dataDir, 'upload-tmp')).catch(() => []);
      if (!leftovers.length) break;
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    assert.deepEqual(leftovers, []);
  });
});

test('production auth limiter blocks repeated registration attempts by IP and device', async () => {
  await withServer({ isProduction: true, authRateLimitEnabled: true }, async ({ baseUrl }) => {
    for (let attempt = 0; attempt < 8; attempt += 1) {
      const response = await fetch(`${baseUrl}/api/auth/register`, {
        method: 'POST', headers: { 'content-type': 'application/json', 'user-agent': 'same-browser' },
        body: JSON.stringify({ identity: 'invalid', password: '' }),
      });
      assert.equal(response.status, 400);
    }
    const blocked = await fetch(`${baseUrl}/api/auth/register`, {
      method: 'POST', headers: { 'content-type': 'application/json', 'user-agent': 'same-browser' },
      body: JSON.stringify({ identity: 'invalid', password: '' }),
    });
    assert.equal(blocked.status, 429);
    assert.equal(blocked.headers.get('retry-after'), '3600');
  });
});

test('expired guests lose access while retained research identity is anonymized', async () => {
  await withServer({ guestCleanupIntervalMs: 60_000 }, async ({ baseUrl, repository }) => {
    const user = {
      id: 'expired-guest-user', identity: 'guest-expired@local', username: 'visitor-old', nickname: '旧访客',
      spaceName: '旧小屋', passwordHash: '', research: true, guest: true,
      guestExpiresAt: '2025-01-01T00:00:00.000Z', createdAt: '2024-01-01T00:00:00.000Z', updatedAt: '2024-01-01T00:00:00.000Z',
    };
    await repository.createUser(user);
    await repository.createSession({ id: 'expired-session', userId: user.id, tokenHash: 'expired-token', createdAt: user.createdAt, expiresAt: '2030-01-01T00:00:00.000Z' });
    await fetch(`${baseUrl}/api/health`);

    let cleaned = null;
    for (let retry = 0; retry < 50; retry += 1) {
      cleaned = (await repository.listAllUsers()).find((entry) => entry.id === user.id);
      if (cleaned?.guestExpired) break;
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    assert.equal(cleaned.guestExpired, true);
    assert.equal(cleaned.guest, false);
    assert.match(cleaned.identity, /^anonymous-.*@expired\.local$/);
    assert.equal(await repository.findUserByIdentity('guest-expired@local'), null);
    assert.equal(await repository.getSession('expired-token'), null);
  });
});
