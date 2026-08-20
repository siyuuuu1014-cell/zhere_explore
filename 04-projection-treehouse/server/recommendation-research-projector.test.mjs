import test from 'node:test';
import assert from 'node:assert/strict';
import { buildRecommendationResearchProjections } from './recommendation-research-projector.mjs';

test('materializes anonymized recommendation tables without login identity', () => {
  const output = buildRecommendationResearchProjections({
    users: [{ id: 'user-1', identity: 'secret@example.com', nickname: '小风', createdAt: '2026-01-01T00:00:00Z' }],
    researchSubjects: [{ user_id: 'user-1', subject_id: 'subject-1', created_at: '2026-01-01T00:00:00Z' }],
    worldStates: [{ userId: 'user-1', state: { customTags: ['雨夜'] } }],
    publicAssets: [{ id: 'asset-1', ownerId: 'user-1', status: 'published', title: '雨', tags: ['雨夜'], createdAt: '2026-01-01T00:00:00Z', likes: 1, comments: [] }],
    publicDemands: [], publicRecords: [],
    events: [{ actor_id: 'user-1', research_subject_id: 'subject-1', raw_event: 'asset_open', created_at: '2026-01-02T00:00:00Z', details: { asset_id: 'asset-1' } }],
    pricing: { transactions: [{ user_id: 'user-1', material_id: 'asset-1', transaction_price: 12, is_valid: true, transaction_time: '2026-01-03T00:00:00Z' }] },
  }, { snapshotAt: '2026-01-04T00:00:00Z' });
  assert.match(output.hybridUserProfile[0].user_id, /^[0-9a-f-]{36}$/);
  assert.equal(JSON.stringify(output).includes('secret@example.com'), false);
  assert.equal(output.publishedAsset[0].amount, 1);
  assert.equal(output.u2aBehavior[0].buy, true);
  assert.equal(output.contentFeatures[0].purchase_rate, 1 / 6);
});

test('separates personal prompts and commerce demands', () => {
  const base = { ownerId: 'u', status: 'open', createdAt: '2026-01-01T00:00:00Z', responses: [] };
  const output = buildRecommendationResearchProjections({
    users: [{ id: 'u' }], researchSubjects: [{ user_id: 'u', subject_id: 's' }], worldStates: [], publicAssets: [],
    publicDemands: [{ ...base, id: 'p', type: 'personal', title: '个人' }, { ...base, id: 'c', type: 'commerce', title: '商业', budget: 100 }],
    publicRecords: [], events: [], pricing: { transactions: [] },
  });
  assert.match(output.publishedPrompt[0].prompt_id, /^[0-9a-f-]{36}$/);
  assert.match(output.publishedCommerce[0].commerce_id, /^[0-9a-f-]{36}$/);
  assert.notEqual(output.publishedPrompt[0].prompt_id, output.publishedCommerce[0].commerce_id);
});

test('keeps interacted built-in assets even when absent from public assets', () => {
  const output = buildRecommendationResearchProjections({
    users: [{ id: 'u' }], researchSubjects: [{ user_id: 'u', subject_id: 's' }], worldStates: [], publicAssets: [], publicDemands: [], publicRecords: [],
    events: [{ actor_id: 'u', raw_event: 'asset_open', created_at: '2026-01-01T00:00:00Z', details: { asset_id: 'v-built-in', asset_title: '内置素材' } }],
    pricing: { transactions: [] },
  });
  assert.match(output.publishedAsset[0].asset_id, /^[0-9a-f-]{36}$/);
  assert.equal(output.u2aBehavior[0].view, true);
});

test('projects durable ratings, internal shares, player relations, and community tags without double-counting', () => {
  const output = buildRecommendationResearchProjections({
    users: [{ id: 'u1' }, { id: 'u2' }],
    researchSubjects: [{ user_id: 'u1', subject_id: 's1' }, { user_id: 'u2', subject_id: 's2' }],
    worldStates: [],
    publicAssets: [{ id: 'a1', ownerId: 'u2', status: 'published', title: '雨后', tags: [], createdAt: '2026-01-01T00:00:00Z', comments: [] }],
    publicDemands: [{ id: 'p1', ownerId: 'u2', type: 'personal', status: 'open', title: '找雨声', createdAt: '2026-01-01T00:00:00Z', responses: [] }],
    publicRecords: [
      { id: 'r1', kind: 'content_rating', ownerId: 'u1', status: 'published', payload: { targetType: 'asset', targetId: 'a1', rate: 5 }, createdAt: '2026-01-02T00:00:00Z', updatedAt: '2026-01-03T00:00:00Z' },
      { id: 'r2', kind: 'content_rating', ownerId: 'u1', status: 'published', payload: { targetType: 'demand', targetId: 'p1', rate: 4 }, createdAt: '2026-01-02T00:00:00Z' },
      { id: 's1', kind: 'content_share', ownerId: 'u1', status: 'published', payload: { targetType: 'asset', targetId: 'a1', targetUserId: 'u2' }, createdAt: '2026-01-02T01:00:00Z' },
      { id: 'f1', kind: 'follow', ownerId: 'u1', status: 'published', payload: { targetUserId: 'u2' }, createdAt: '2026-01-02T02:00:00Z' },
      { id: 'm1', kind: 'space_message', ownerId: 'u1', status: 'published', payload: { targetUserId: 'u2', text: '你好' }, createdAt: '2026-01-02T03:00:00Z' },
      { id: 't1', kind: 'content_tag', ownerId: 'u1', status: 'published', payload: { targetType: 'asset', targetId: 'a1', tag: '雨后散步' }, createdAt: '2026-01-02T04:00:00Z' },
    ],
    events: [
      { actor_id: 'u1', raw_event: 'asset_rate', created_at: '2026-01-02T00:00:00Z', details: { asset_id: 'a1', rate: 3 } },
      { actor_id: 'u1', raw_event: 'asset_share', created_at: '2026-01-02T01:00:00Z', details: { asset_id: 'a1' } },
    ],
    pricing: { transactions: [] },
  }, { snapshotAt: '2026-01-04T00:00:00Z' });
  const assetBehavior = output.u2aBehavior.find((row) => row.rate === 5);
  assert.ok(assetBehavior);
  assert.equal(assetBehavior.share, true);
  assert.equal(output.u2pBehavior.find((row) => row.rate === 4) != null, true);
  assert.equal(output.publishedPrompt[0].rate, 4);
  assert.equal(JSON.parse(output.publishedAsset[0].theme).includes('雨后散步'), true);
  assert.equal(output.u2uBehavior.length, 1);
  assert.equal(output.u2uBehavior[0].follow, true);
  assert.deepEqual(JSON.parse(output.u2uBehavior[0].message).sort(), ['m1', 's1']);
});
