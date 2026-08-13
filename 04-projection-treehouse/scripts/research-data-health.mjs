import { config } from '../server/config.mjs';
import { EVENT_TYPES, validateEventDetails } from '../server/event-schema.mjs';
import { createRepository } from '../server/repositories/index.mjs';

async function main() {
  const repository = await createRepository(config);
  const [events, pricing] = await Promise.all([repository.listAllEvents(), repository.listAllPricing()]);
  const impressions = events.flatMap((event) => event.raw_event === 'impression_batch' && Array.isArray(event.details?.impressions) ? event.details.impressions : []);
  const impressionIds = new Set(impressions.map((item) => item.impression_id).filter(Boolean));
  const attributed = events.filter((event) => event.details?.impression_id);
  const unknown = events.filter((event) => !EVENT_TYPES.has(event.raw_event));
  const malformed = events.filter((event) => EVENT_TYPES.has(event.raw_event) && validateEventDetails(event.raw_event, event.details || {}));
  const missingDerived = events.filter((event) => Number(event.derived_signals?.derived_schema_version || 0) < 1);
  const duplicateGroups = [...Map.groupBy((pricing.transactions || []).filter((item) => item.is_valid === true), (item) => `${item.user_id}\u0000${item.material_id}`).values()].filter((items) => items.length > 1);
  const counts = Object.fromEntries([...Map.groupBy(events, (event) => event.raw_event).entries()].map(([type, values]) => [type, values.length]));
  console.log(JSON.stringify({
    checked_at: new Date().toISOString(), repository: config.repository,
    summary: {
      event_count: events.length, impression_count: impressions.length, attributed_event_count: attributed.length,
      orphan_attribution_count: attributed.filter((event) => !impressionIds.has(event.details.impression_id)).length,
      unknown_event_count: unknown.length, malformed_event_count: malformed.length, legacy_event_needing_export_derivation_count: missingDerived.length,
      bid_count: pricing.bids?.length || 0, transaction_count: pricing.transactions?.length || 0,
      valid_transaction_count: (pricing.transactions || []).filter((item) => item.is_valid === true).length,
      duplicate_valid_purchase_group_count: duplicateGroups.length,
      last_event_at: events.map((event) => event.created_at).filter(Boolean).sort().at(-1) || null,
    },
    event_type_counts: counts,
    issues: {
      unknown_event_types: [...new Set(unknown.map((event) => event.raw_event))],
      malformed_event_ids: malformed.slice(0, 100).map((event) => event.event_id),
      legacy_events_are_derived_during_export: missingDerived.length > 0,
    },
  }, null, 2));
}

main().catch((error) => { console.error(error.message); process.exitCode = 1; });
