import { config } from '../server/config.mjs';
import { EVENT_TYPES, validateEventDetails } from '../server/event-schema.mjs';
import { createRepository } from '../server/repositories/index.mjs';

async function main() {
  const repository = await createRepository(config);
  const [events, pricing, requests, candidates, recommendationImpressions, bidAttempts, media] = await Promise.all([
    repository.listAllEvents(),
    repository.listAllPricing(),
    repository.listRecommendationRequests(),
    repository.listRecommendationCandidates(),
    repository.listRecommendationImpressions(),
    repository.listBidAttempts(),
    repository.listAllMedia(),
  ]);
  const impressions = events.flatMap((event) => event.raw_event === 'impression_batch' && Array.isArray(event.details?.impressions) ? event.details.impressions : []);
  const impressionIds = new Set(impressions.map((item) => item.impression_id).filter(Boolean));
  const attributed = events.filter((event) => event.details?.impression_id);
  const unknown = events.filter((event) => !EVENT_TYPES.has(event.raw_event));
  const malformed = events.filter((event) => EVENT_TYPES.has(event.raw_event) && validateEventDetails(event.raw_event, event.details || {}));
  const missingDerived = events.filter((event) => Number(event.derived_signals?.derived_schema_version || 0) < 1);
  const duplicateGroups = [...Map.groupBy((pricing.transactions || []).filter((item) => item.is_valid === true), (item) => `${item.user_id}\u0000${item.material_id}`).values()].filter((items) => items.length > 1);
  const counts = Object.fromEntries([...Map.groupBy(events, (event) => event.raw_event).entries()].map(([type, values]) => [type, values.length]));
  const lastEventAt = events.map((event) => event.created_at).filter(Boolean).sort().at(-1) || null;
  const latestEventAgeHours = lastEventAt ? Number(((Date.now() - Date.parse(lastEventAt)) / 3600000).toFixed(2)) : null;
  const requestIds = new Set(requests.map((item) => item.request_id));
  const impressionsByRequestId = Map.groupBy(recommendationImpressions, (item) => item.recommendation_request_id || '');
  const requestsWithoutImpressions = requests.filter((item) => !(impressionsByRequestId.get(item.request_id)?.length)).map((item) => item.request_id);
  console.log(JSON.stringify({
    checked_at: new Date().toISOString(), repository: config.repository,
    summary: {
      event_count: events.length, impression_count: impressions.length, attributed_event_count: attributed.length,
      orphan_attribution_count: attributed.filter((event) => !impressionIds.has(event.details.impression_id)).length,
      unknown_event_count: unknown.length, malformed_event_count: malformed.length, legacy_event_needing_export_derivation_count: missingDerived.length,
      bid_count: pricing.bids?.length || 0, transaction_count: pricing.transactions?.length || 0,
      valid_transaction_count: (pricing.transactions || []).filter((item) => item.is_valid === true).length,
      duplicate_valid_purchase_group_count: duplicateGroups.length,
      recommendation_request_count: requests.length,
      recommendation_candidate_count: candidates.length,
      recommendation_impression_count: recommendationImpressions.length,
      impression_row_count: recommendationImpressions.length,
      bid_attempt_count: bidAttempts.filter((item) => item.attempt_kind === 'bid_attempt').length,
      bid_abandon_count: bidAttempts.filter((item) => item.attempt_kind === 'bid_abandon').length,
      bid_validation_failed_count: bidAttempts.filter((item) => item.attempt_kind === 'bid_validation_failed').length,
      events_last_24h: events.filter((event) => event.created_at && Date.now() - Date.parse(event.created_at) <= 24 * 3600000).length,
      latest_event_age_h: latestEventAgeHours,
      media_without_metadata_count: media.filter((item) => Number(item.size) > 0 && item.media_duration_sec == null).length,
      last_event_at: lastEventAt,
    },
    event_type_counts: counts,
    issues: {
      unknown_event_types: [...new Set(unknown.map((event) => event.raw_event))],
      malformed_event_ids: malformed.slice(0, 100).map((event) => event.event_id),
      legacy_events_are_derived_during_export: missingDerived.length > 0,
      recommendation_requests_without_impressions: requestsWithoutImpressions.slice(0, 100),
      impressions_without_request: recommendationImpressions.filter((item) => !requestIds.has(item.recommendation_request_id)).length,
      stale_events_alert: latestEventAgeHours != null && latestEventAgeHours > 24,
      impression_coverage_alert: recommendationImpressions.length < requests.length ? requestsWithoutImpressions.length : 0,
    },
  }, null, 2));
}

main().catch((error) => { console.error(error.message); process.exitCode = 1; });
