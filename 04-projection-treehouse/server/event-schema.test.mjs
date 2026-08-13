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
