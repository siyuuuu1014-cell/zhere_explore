import test from 'node:test';
import assert from 'node:assert/strict';
import { validateTelemetryEvent } from './event-schema.mjs';

const base = { event_id: 'event-1', created_at: '2026-08-13T00:00:00.000Z', session_id: 'session-1', session_sequence: 1, research_consent: true };

test('event schema rejects unknown names and malformed research payloads', () => {
  assert.equal(validateTelemetryEvent({ ...base, raw_event: 'future_typo', details: {} }).error, 'unknown-event-type');
  assert.equal(validateTelemetryEvent({ ...base, raw_event: 'watch_time', details: { asset_id: 'asset-1', duration: -1 } }).error, 'invalid-watch-duration');
  assert.equal(validateTelemetryEvent({ ...base, raw_event: 'impression_batch', details: { impression_batch_id: 'batch-1', impressions: [{ impression_id: 'imp-1', asset_id: 'asset-1', rank: 1 }] } }).error, 'invalid-impression-fields');
});

test('event schema creates versioned recommendation labels', () => {
  const result = validateTelemetryEvent({ ...base, raw_event: 'watch_time', details: { asset_id: 'asset-1', duration: 30, media_duration: 60 } });
  assert.equal(result.error, null);
  assert.equal(result.event.derived_signals.watch_seconds, 30);
  assert.equal(result.event.derived_signals.watch_ratio, 0.5);
  assert.equal(result.event.derived_signals.derived_schema_version, 1);
  const conversion = validateTelemetryEvent({ ...base, raw_event: 'bid_accepted', details: { asset_id: 'asset-1', bid_id: 'bid-1', transaction_id: 'transaction-1', transaction_price: 12 } });
  assert.equal(conversion.event.derived_signals.conversion, true);
});

test('event schema validates recommendation request candidates and bid attempt events', () => {
  const candidate = { asset_id: 'asset-1', rank: 1, recommendation_score: 1.5, zone_id: 'town' };
  const validRequest = validateTelemetryEvent({
    ...base, raw_event: 'recommendation_request',
    details: { request_id: 'rec-1', candidates: [candidate, { ...candidate, rank: 2, asset_id: 'asset-2' }], zone_slots: 2 },
  });
  assert.equal(validRequest.error, null);
  assert.equal(validRequest.event.derived_signals.is_asset_interaction, false);

  assert.equal(validateTelemetryEvent({ ...base, raw_event: 'recommendation_request', details: {} }).error, 'invalid-recommendation-request');
  assert.equal(validateTelemetryEvent({ ...base, raw_event: 'recommendation_request', details: { request_id: 'rec-1', candidates: [{ asset_id: 'asset-1', rank: 0, recommendation_score: 'bad', zone_id: 'town' }] } }).error, 'invalid-recommendation-candidate');
  assert.equal(validateTelemetryEvent({ ...base, raw_event: 'recommendation_request', details: { request_id: 'rec-1', candidates: [candidate], zone_slots: -1 } }).error, 'invalid-zone-slots');

  const validAttempt = validateTelemetryEvent({ ...base, raw_event: 'bid_attempt', details: { asset_id: 'asset-1', bid_id: 'bid-1' } });
  assert.equal(validAttempt.error, null);
  assert.equal(validateTelemetryEvent({ ...base, raw_event: 'bid_attempt', details: {} }).error, 'asset-id-required');

  const validAbandon = validateTelemetryEvent({ ...base, raw_event: 'bid_abandon', details: { asset_id: 'asset-1', open_duration_ms: 1200 } });
  assert.equal(validAbandon.error, null);
  assert.equal(validateTelemetryEvent({ ...base, raw_event: 'bid_abandon', details: { asset_id: 'asset-1', open_duration_ms: -1 } }).error, 'invalid-bid-abandon');

  const validValidationFailed = validateTelemetryEvent({ ...base, raw_event: 'bid_validation_failed', details: { asset_id: 'asset-1', reason: 'invalid-price-format' } });
  assert.equal(validValidationFailed.error, null);
  assert.equal(validateTelemetryEvent({ ...base, raw_event: 'bid_validation_failed', details: { asset_id: 'asset-1', reason: 'x'.repeat(81) } }).error, 'invalid-bid-validation-failed');
});

test('event schema validates dynamic location, zone event and npc story events', () => {
  const validSpawn = validateTelemetryEvent({ ...base, raw_event: 'dynamic_location_spawn', details: { location_id: 'dl-theme-海边', kind: 'theme', zone_id: 'shore', item_count: 4 } });
  assert.equal(validSpawn.error, null);
  assert.equal(validateTelemetryEvent({ ...base, raw_event: 'dynamic_location_spawn', details: { kind: 'theme' } }).error, 'invalid-dynamic-location-id');
  assert.equal(validateTelemetryEvent({ ...base, raw_event: 'dynamic_location_visit', details: { location_id: 'dl-camp', kind: '' } }).error, 'invalid-dynamic-location-kind');

  const validSeen = validateTelemetryEvent({ ...base, raw_event: 'zone_event_seen', details: { zone_event_id: 'fe-forest-fog', zone_id: 'forest' } });
  assert.equal(validSeen.error, null);
  assert.equal(validateTelemetryEvent({ ...base, raw_event: 'zone_event_seen', details: { zone_event_id: 'fe-forest-fog' } }).error, 'invalid-zone-event-seen');

  const validEncounter = validateTelemetryEvent({ ...base, raw_event: 'npc_encounter', details: { npc_id: 'chiye', step: 1 } });
  assert.equal(validEncounter.error, null);
  assert.equal(validateTelemetryEvent({ ...base, raw_event: 'npc_encounter', details: { npc_id: 'chiye', step: -1 } }).error, 'invalid-npc-event');
  assert.equal(validateTelemetryEvent({ ...base, raw_event: 'npc_encounter', details: {} }).error, 'invalid-npc-event');

  const validStep = validateTelemetryEvent({ ...base, raw_event: 'npc_story_step', details: { npc_id: 'nanzhi', step: 2, choice: '交换一下喜欢' } });
  assert.equal(validStep.error, null);
  assert.equal(validateTelemetryEvent({ ...base, raw_event: 'npc_story_step', details: { npc_id: 'nanzhi', step: 2, choice: '' } }).error, 'invalid-npc-choice');

  const validCompleted = validateTelemetryEvent({ ...base, raw_event: 'npc_story_completed', details: { npc_id: 'chiye', step: 4 } });
  assert.equal(validCompleted.error, null);
  assert.equal(validCompleted.event.derived_signals.positive_feedback, true);
});

test('event schema accepts bounded content ratings and internal shares', () => {
  assert.equal(validateTelemetryEvent({ event_id: 'rate-asset-1', raw_event: 'asset_rate', created_at: new Date().toISOString(), details: { asset_id: 'asset-1', rate: 5 } }).error, null);
  assert.equal(validateTelemetryEvent({ event_id: 'rate-demand-1', raw_event: 'demand_rate', created_at: new Date().toISOString(), details: { demand_id: 'demand-1', rate: 1 } }).error, null);
  assert.equal(validateTelemetryEvent({ event_id: 'share-asset-1', raw_event: 'asset_share', created_at: new Date().toISOString(), details: { asset_id: 'asset-1', target_space_id: 'space-1' } }).error, null);
  assert.equal(validateTelemetryEvent({ event_id: 'share-demand-1', raw_event: 'demand_share', created_at: new Date().toISOString(), details: { demand_id: 'demand-1', target_space_id: 'space-1' } }).error, null);
  assert.equal(validateTelemetryEvent({ event_id: 'rate-invalid-1', raw_event: 'asset_rate', created_at: new Date().toISOString(), details: { asset_id: 'asset-1', rate: 6 } }).error, 'invalid-content-rating');
});
