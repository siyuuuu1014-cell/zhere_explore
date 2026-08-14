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
