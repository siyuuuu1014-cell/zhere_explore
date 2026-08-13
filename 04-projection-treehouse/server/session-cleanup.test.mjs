import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { LocalRepository } from './repositories/local-repository.mjs';

test('expired login sessions are removed and research sessions are closed', async (context) => {
  const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'zhere-session-cleanup-'));
  context.after(() => fs.rm(dataDir, { recursive: true, force: true }));
  const repository = new LocalRepository(dataDir);
  await repository.init();
  const expiredAt = '2026-01-01T00:00:00.000Z';
  await repository.createSession({ id: 'expired-session', userId: 'user-1', tokenHash: 'expired', createdAt: '2025-01-01T00:00:00.000Z', expiresAt: expiredAt });
  await repository.createSession({ id: 'active-session', userId: 'user-1', tokenHash: 'active', createdAt: '2026-01-01T00:00:00.000Z', expiresAt: '2027-01-01T00:00:00.000Z' });
  await repository.createResearchSession({ session_id: 'expired-session', user_id: 'user-1', started_at: '2025-01-01T00:00:00.000Z' });
  await repository.createResearchSession({ session_id: 'active-session', user_id: 'user-1', started_at: '2026-01-01T00:00:00.000Z' });

  assert.equal(await repository.cleanupExpiredSessions('2026-08-01T00:00:00.000Z'), 1);
  assert.equal(await repository.getSession('expired'), null);
  assert.equal((await repository.getSession('active')).id, 'active-session');
  const store = JSON.parse(await fs.readFile(path.join(dataDir, 'store.json'), 'utf8'));
  const expiredResearch = store.researchSessions.find((session) => session.session_id === 'expired-session');
  assert.equal(expiredResearch.ended_at, expiredAt);
  assert.equal(expiredResearch.end_reason, 'session-expired');
  assert.equal(store.researchSessions.find((session) => session.session_id === 'active-session').ended_at, undefined);
});
