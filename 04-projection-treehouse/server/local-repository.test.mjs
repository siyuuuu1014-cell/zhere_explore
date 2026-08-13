import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { LocalRepository } from './repositories/local-repository.mjs';

test('one local repository serializes concurrent mutations without losing records', async (context) => {
  const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'zhere-local-repository-'));
  context.after(() => fs.rm(dataDir, { recursive: true, force: true }));
  const repository = new LocalRepository(dataDir);
  await repository.init();

  const users = Array.from({ length: 24 }, (_, index) => ({
    id: `user-${index}`,
    identity: `user-${index}@example.com`,
    nickname: `旅人${index}`,
  }));
  await Promise.all(users.map((user) => repository.createUser(user)));

  const stored = JSON.parse(await fs.readFile(path.join(dataDir, 'store.json'), 'utf8'));
  assert.equal(stored.users.length, users.length);
  assert.deepEqual(new Set(stored.users.map((user) => user.id)), new Set(users.map((user) => user.id)));
  assert.equal((await fs.readdir(dataDir)).some((name) => name.endsWith('.tmp')), false);
});

test('corrupted local store is reported instead of silently replaced with an empty database', async (context) => {
  const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'zhere-local-corrupt-'));
  context.after(() => fs.rm(dataDir, { recursive: true, force: true }));
  await fs.mkdir(path.join(dataDir, 'media'), { recursive: true });
  await fs.writeFile(path.join(dataDir, 'store.json'), '{broken-json', 'utf8');
  const repository = new LocalRepository(dataDir);
  await assert.rejects(() => repository.healthCheck(), SyntaxError);
});

test('local world state rejects a stale version and preserves the newer state', async (context) => {
  const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'zhere-world-version-'));
  context.after(() => fs.rm(dataDir, { recursive: true, force: true }));
  const repository = new LocalRepository(dataDir);
  await repository.init();
  const first = await repository.saveWorldState('user-1', { wx: 1 }, 0);
  const second = await repository.saveWorldState('user-1', { wx: 2 }, first.version);
  await assert.rejects(
    () => repository.saveWorldState('user-1', { wx: -1 }, first.version),
    (error) => error.code === 'world-state-conflict' && error.current.version === second.version,
  );
  assert.deepEqual((await repository.getWorldState('user-1')).state, { wx: 2 });
});

test('local repository keeps one opaque research subject and append-only consent history', async (context) => {
  const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'zhere-research-identity-'));
  context.after(() => fs.rm(dataDir, { recursive: true, force: true }));
  const repository = new LocalRepository(dataDir);
  await repository.init();
  const first = await repository.ensureResearchSubject('user-1');
  const second = await repository.ensureResearchSubject('user-1');
  assert.equal(first.subject_id, second.subject_id);
  assert.match(first.subject_id, /^rs-/);
  await repository.recordResearchConsent({ consent_id: 'consent-1', user_id: 'user-1', subject_id: first.subject_id, research_allowed: true, effective_at: new Date().toISOString() });
  await repository.recordResearchConsent({ consent_id: 'consent-2', user_id: 'user-1', subject_id: first.subject_id, research_allowed: false, effective_at: new Date().toISOString() });
  assert.equal((await repository.listResearchConsents('user-1')).length, 2);
});
