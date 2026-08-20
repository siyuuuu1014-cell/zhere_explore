import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { after, before, test } from 'node:test';
import { createApp } from './app.mjs';
import { LocalRepository } from './repositories/local-repository.mjs';

let baseUrl;
let cookie;
let server;
let dataDir;
let repository;

function fakeMp4(payload) {
  return Buffer.concat([Buffer.from([0, 0, 0, 16]), Buffer.from('ftypisom'), Buffer.from(payload)]);
}

before(async () => {
  dataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'zhere-research-tables-'));
  repository = new LocalRepository(dataDir);
  await repository.init();
  const config = {
    isProduction: false, repository: 'local', appDir: path.resolve(import.meta.dirname, '..'), dataDir,
    sessionDays: 30, sessionCookieSecure: 'auto', maxJsonBytes: 2 * 1024 * 1024, maxVideoBytes: 1024 * 1024,
    publicWriteLimit: 60, publicWorldCacheTtlMs: 3000, slowRequestThresholdMs: 0,
    basePriceTransactionCount: 10, marketInsightMinSample: 5, researchConsentVersion: 'research-v1',
    adminIdentities: ['admin@example.com'],
  };
  server = createApp({ repository, config });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
  const registration = await fetch(`${baseUrl}/api/auth/register`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      identity: 'admin@example.com', username: 'admin', nickname: '研究管理员', spaceName: '研究小屋',
      password: 'correct-horse', confirmPassword: 'correct-horse', ageConfirmed: true, agreeTerms: true, research: true,
    }),
  });
  assert.equal(registration.status, 201);
  cookie = registration.headers.get('set-cookie').split(';')[0];
});

after(async () => {
  await new Promise((resolve) => server.close(resolve));
  await fs.rm(dataDir, { recursive: true, force: true });
});

test('recommendation request, candidates, and impressions are projected into fact tables', async () => {
  const requestId = 'rec-test-1';
  const batchId = 'batch-test-1';
  const events = [
    {
      event_id: 'evt-rec-1', raw_event: 'recommendation_request', created_at: new Date().toISOString(), research_consent: true,
      details: {
        request_id: requestId,
        candidates: [
          { asset_id: 'v-a', rank: 1, recommendation_score: 2.1, zone_id: 'town', spawn_source: '公共素材', chosen: true },
          { asset_id: 'v-b', rank: 2, recommendation_score: 1.6, zone_id: 'shore', spawn_source: '公共素材', chosen: true },
        ],
        zone_slots: 2,
      },
    },
    {
      event_id: 'evt-imp-1', raw_event: 'impression_batch', created_at: new Date().toISOString(), research_consent: true,
      details: {
        impression_batch_id: batchId,
        recommendation_request_id: requestId,
        impressions: [
          { impression_id: 'imp-a', impression_batch_id: batchId, recommendation_request_id: requestId, asset_id: 'v-a', rank: 1, recommendation_score: 2.1, visibility_duration_ms: 1200, distance_to_player: 30, zone_id: 'town', spawn_source: '公共素材', experiment_id: 'open-world-v1', experiment_group: 'mixed-biome' },
          { impression_id: 'imp-b', impression_batch_id: batchId, recommendation_request_id: requestId, asset_id: 'v-b', rank: 2, recommendation_score: 1.6, visibility_duration_ms: 800, distance_to_player: 45, zone_id: 'shore', spawn_source: '公共素材', experiment_id: 'open-world-v1', experiment_group: 'mixed-biome' },
        ],
      },
    },
  ];
  const response = await fetch(`${baseUrl}/api/events/batch`, {
    method: 'POST', headers: { 'content-type': 'application/json', cookie }, body: JSON.stringify({ events }),
  });
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.deepEqual([...body.accepted].sort(), ['evt-imp-1', 'evt-rec-1']);

  const store = JSON.parse(await fs.readFile(path.join(dataDir, 'store.json'), 'utf8'));
  assert.equal(store.researchRecommendationRequests.length, 1);
  assert.equal(store.researchRecommendationRequests[0].request_id, requestId);
  assert.equal(store.researchRecommendationRequests[0].candidate_count, 2);
  assert.equal(store.researchRecommendationRequests[0].zone_slots, 2);
  assert.equal(store.researchRecommendationCandidates.length, 2);
  assert.equal(store.researchRecommendationImpressions.length, 2);
  const impressions = store.researchRecommendationImpressions;
  assert.equal(impressions.every((item) => item.recommendation_request_id === requestId), true);
  assert.equal(impressions.every((item) => item.subject_id?.startsWith('rs-')), true);
  assert.deepEqual(impressions.map((item) => item.impression_id).sort(), ['imp-a', 'imp-b']);
});

test('bid attempt, abandon, and validation-failed events are projected one row each', async () => {
  const events = [
    { event_id: 'evt-bid-attempt', raw_event: 'bid_attempt', created_at: new Date().toISOString(), research_consent: true, details: { asset_id: 'v-a', bid_id: 'bid-1' } },
    { event_id: 'evt-bid-abandon', raw_event: 'bid_abandon', created_at: new Date().toISOString(), research_consent: true, details: { asset_id: 'v-a', open_duration_ms: 2500 } },
    { event_id: 'evt-bid-validation', raw_event: 'bid_validation_failed', created_at: new Date().toISOString(), research_consent: true, details: { asset_id: 'v-a', reason: 'invalid-price-format' } },
  ];
  const response = await fetch(`${baseUrl}/api/events/batch`, {
    method: 'POST', headers: { 'content-type': 'application/json', cookie }, body: JSON.stringify({ events }),
  });
  assert.equal(response.status, 200);
  const store = JSON.parse(await fs.readFile(path.join(dataDir, 'store.json'), 'utf8'));
  assert.equal(store.researchBidAttempts.length, 3);
  assert.deepEqual(store.researchBidAttempts.map((item) => item.attempt_kind).sort(), ['bid_abandon', 'bid_attempt', 'bid_validation_failed']);
  assert.equal(store.researchBidAttempts.find((item) => item.attempt_kind === 'bid_abandon').open_duration_ms, 2500);
  assert.equal(store.researchBidAttempts.find((item) => item.attempt_kind === 'bid_validation_failed').reason, 'invalid-price-format');
});

test('admin research CSV, health, and snapshot expose the recommendation fact tables', async () => {
  const csvResponse = await fetch(`${baseUrl}/api/admin/research/recommendations.csv`, { headers: { cookie } });
  assert.equal(csvResponse.status, 200);
  assert.match(csvResponse.headers.get('content-type'), /text\/csv/);
  const csvText = await csvResponse.text();
  assert.match(csvText, /request_id/);
  assert.match(csvText, /rec-test-1/);
  assert.match(csvText, /v-a/);

  const health = await fetch(`${baseUrl}/api/admin/research/health`, { headers: { cookie } }).then((response) => response.json());
  assert.equal(health.summary.recommendation_request_count, 1);
  assert.equal(health.summary.recommendation_candidate_count, 2);
  assert.equal(health.summary.recommendation_impression_count, 2);
  assert.equal(health.summary.impression_row_count, 2);
  assert.equal(health.summary.bid_attempt_count, 1);
  assert.equal(health.summary.bid_abandon_count, 1);
  assert.equal(health.summary.bid_validation_failed_count, 1);
  assert.equal(health.summary.events_last_24h >= 5, true);
  assert.equal(typeof health.summary.latest_event_age_h, 'number');
  assert.equal(health.issues.stale_events_alert, false);
  assert.equal(health.issues.impression_coverage_alert, 0);
  assert.equal(health.issues.impressions_without_request, 0);
  assert.deepEqual(health.issues.recommendation_requests_without_impressions, []);

  const snapshot = await fetch(`${baseUrl}/api/admin/research/snapshot`, { headers: { cookie } }).then((response) => response.json());
  assert.equal(snapshot.ok, true);
  assert.equal(snapshot.research_schema, 'v1');
  assert.match(snapshot.hash, /^[0-9a-f]{16}$/);
  assert.equal(snapshot.counts.recommendation_requests, 1);
  assert.equal(snapshot.counts.recommendation_candidates, 2);
  assert.equal(snapshot.counts.recommendation_impressions, 2);
  assert.equal(snapshot.counts.bid_attempts, 3);
  assert.equal(snapshot.recommendation.requests.length, 1);
  assert.equal(snapshot.recommendation.impressions.length, 2);
  assert.equal(snapshot.bid_attempts.length, 3);
});

test('media upload parses optional metadata and degrades to null without it', async () => {
  const form = new FormData();
  form.set('assetId', 'u-meta-video');
  form.set('title', '元数据视频');
  form.set('media_duration_sec', '12.5');
  form.set('media_width', '1920');
  form.set('media_height', '1080');
  form.set('media_bitrate_kbps', '4500');
  form.set('file', new File([fakeMp4('meta-video-data')], 'meta.mp4', { type: 'video/mp4' }));
  const uploaded = await fetch(`${baseUrl}/api/media`, { method: 'POST', headers: { cookie }, body: form });
  assert.equal(uploaded.status, 201);
  const asset = (await uploaded.json()).asset;
  assert.equal(asset.media_duration_sec, 12.5);
  assert.equal(asset.media_width, 1920);
  assert.equal(asset.media_height, 1080);
  assert.equal(asset.media_bitrate_kbps, 4500);

  const noMetaForm = new FormData();
  noMetaForm.set('assetId', 'u-nometa-video');
  noMetaForm.set('file', new File([fakeMp4('nometa-video-data')], 'nometa.mp4', { type: 'video/mp4' }));
  const noMeta = await fetch(`${baseUrl}/api/media`, { method: 'POST', headers: { cookie }, body: noMetaForm });
  assert.equal(noMeta.status, 201);
  const noMetaAsset = (await noMeta.json()).asset;
  assert.equal(noMetaAsset.media_duration_sec, null);
  assert.equal(noMetaAsset.media_width, null);
  assert.equal(noMetaAsset.media_height, null);
  assert.equal(noMetaAsset.media_bitrate_kbps, null);

  const health = await fetch(`${baseUrl}/api/admin/research/health`, { headers: { cookie } }).then((response) => response.json());
  assert.equal(health.summary.media_without_metadata_count, 1);
});
