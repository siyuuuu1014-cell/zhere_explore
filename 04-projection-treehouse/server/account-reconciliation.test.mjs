import test from 'node:test';
import assert from 'node:assert/strict';
import { mergeWorldStates, remapUserReferences, stableUnion } from './account-reconciliation.mjs';

test('stableUnion keeps primary records and adds only missing secondary records', () => {
  assert.deepEqual(stableUnion([{ id: 'a', value: 2 }], [{ id: 'a', value: 1 }, { id: 'b', value: 3 }]), [
    { id: 'a', value: 2 }, { id: 'b', value: 3 },
  ]);
});

test('mergeWorldStates preserves current progress and restores legacy collections', () => {
  const merged = mergeWorldStates({
    wallet: 10, exploreSteps: 90, copies: [], journalEntries: [{ id: 'new' }], exposureCounts: { a: 8 },
    profile: { nickname: 'current' }, homestead: { structures: [{ id: 'bench' }], resources: { wood: 2 } }, schemaVersion: 4,
  }, {
    wallet: 20, exploreSteps: 30, copies: [{ id: 'copy-old' }], journalEntries: [{ id: 'old' }], exposureCounts: { a: 3, b: 5 },
    profile: { nickname: 'legacy' }, homestead: { structures: [{ id: 'shed' }], resources: { wood: 5, stone: 1 } }, schemaVersion: 3,
  }, { nickname: 'restored' });
  assert.equal(merged.wallet, 20);
  assert.equal(merged.exploreSteps, 90);
  assert.deepEqual(merged.copies.map((item) => item.id), ['copy-old']);
  assert.deepEqual(merged.journalEntries.map((item) => item.id), ['new', 'old']);
  assert.deepEqual(merged.exposureCounts, { a: 8, b: 5 });
  assert.deepEqual(merged.homestead.structures.map((item) => item.id), ['bench', 'shed']);
  assert.deepEqual(merged.homestead.resources, { wood: 5, stone: 1 });
  assert.equal(merged.profile.nickname, 'restored');
  assert.equal(merged.schemaVersion, 4);
});

test('remapUserReferences rewrites exact nested IDs without changing unrelated text', () => {
  assert.deepEqual(remapUserReferences({ user_id: 'old', note: 'old account', nested: ['old', 'other'] }, 'old', 'new'), {
    user_id: 'new', note: 'old account', nested: ['new', 'other'],
  });
});

