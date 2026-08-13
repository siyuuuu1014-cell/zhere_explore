export const EVENT_TYPES = new Set(`
approach asset_open asset_relation_delete asset_relation_save avoid bench_reply bench_sit
bid_accepted bid_enter bid_submit bottle_exposure bottle_keep bottle_open bottle_reply bottle_return
business_scene_place business_scene_remove combine comment comment_delete comment_reply comment_reply_start comment_update
content_report copy_acquired copy_long_term_kept copy_moved_home copy_placed_home copy_removed_home
custom_tag_create data_export deletion_request demand_asset_link demand_close demand_delete demand_draft_save demand_reopen demand_response demand_update
environment_match environment_unmatch exchange_take favorite favorite_revisit feedback follow free_semantic_cluster free_semantic_cluster_clear
guide_travel homestead_building_completed homestead_building_started homestead_crop_harvested homestead_day_advanced homestead_item_crafted
homestead_plot_cleared homestead_plot_tilled homestead_plot_watered homestead_seed_planted homestead_well_used
impression_batch like line_change login logout mix_change mix_save move_click move_click_arrived move_click_blocked move_sample
onboarding_completed pause play play_complete play_error play_only_cat play_only_lamp play_progress profile_update publish_asset publish_demand
random_exposure rare_discovery_found register research_consent_change seek session_end session_pause session_resume session_start
sound_listen space_customize space_enter space_exit tag_add tag_pluck tag_remove telescope_follow telescope_open unfavorite unfollow unlike
upload_to_bag wall_pair_view wall_swap watch_time world_event_response world_resource_gathered zone_discover
`.trim().split(/\s+/));

const ASSET_EVENTS = new Set(`
approach asset_open avoid bid_accepted bid_enter bid_submit business_scene_place business_scene_remove copy_acquired
copy_long_term_kept copy_moved_home copy_placed_home copy_removed_home environment_match environment_unmatch favorite favorite_revisit
like pause play play_complete play_error play_progress seek tag_add tag_remove unfavorite unlike watch_time
`.trim().split(/\s+/));
const DEMAND_EVENTS = new Set('demand_asset_link demand_close demand_delete demand_draft_save demand_reopen demand_response demand_update publish_demand'.split(' '));
const POSITIVE_EVENTS = new Set('like favorite favorite_revisit tag_add comment comment_reply demand_response bid_submit bid_accepted copy_acquired copy_placed_home play_complete'.split(' '));
const NEGATIVE_EVENTS = new Set('unlike unfavorite tag_remove avoid play_error'.split(' '));

function finite(value) { return Number.isFinite(Number(value)); }
function nonNegative(value) { return finite(value) && Number(value) >= 0; }
function validId(value, max = 120) { return typeof value === 'string' && value.length > 0 && value.length <= max; }

export function validateEventDetails(rawEvent, details) {
  if (!details || typeof details !== 'object' || Array.isArray(details)) return 'details-not-object';
  if (JSON.stringify(details).length > 64 * 1024) return 'details-too-large';
  if (ASSET_EVENTS.has(rawEvent) && rawEvent !== 'copy_long_term_kept' && !validId(details.asset_id, 80)) return 'asset-id-required';
  if (rawEvent === 'copy_long_term_kept' && !Array.isArray(details.asset_ids)) return 'asset-ids-required';
  if (DEMAND_EVENTS.has(rawEvent) && rawEvent !== 'demand_draft_save' && !validId(details.demand_id, 80)) return 'demand-id-required';
  if (rawEvent === 'demand_draft_save' && !validId(details.draft_id, 80)) return 'draft-id-required';
  if (rawEvent === 'impression_batch') {
    if (!validId(details.impression_batch_id) || !Array.isArray(details.impressions) || details.impressions.length > 200) return 'invalid-impression-batch';
    const seen = new Set();
    for (const impression of details.impressions) {
      if (!impression || typeof impression !== 'object' || !validId(impression.impression_id) || seen.has(impression.impression_id)) return 'invalid-impression-id';
      seen.add(impression.impression_id);
      if (!validId(impression.asset_id, 80) || !nonNegative(impression.visibility_duration_ms) || !finite(impression.rank)) return 'invalid-impression-fields';
    }
  }
  if (rawEvent === 'watch_time' && !nonNegative(details.duration)) return 'invalid-watch-duration';
  if (rawEvent === 'play_progress' && (!nonNegative(details.current_time) || !nonNegative(details.duration))) return 'invalid-play-progress';
  if (rawEvent === 'seek' && (!nonNegative(details.from_time) || !nonNegative(details.to_time))) return 'invalid-seek';
  if (rawEvent === 'bid_submit' && (!validId(details.bid_id) || !finite(details.bid_price) || Number(details.bid_price) <= 0)) return 'invalid-bid-submit';
  if (rawEvent === 'bid_accepted' && (!validId(details.bid_id) || !validId(details.transaction_id) || !finite(details.transaction_price))) return 'invalid-bid-accepted';
  return null;
}

export function deriveSignals(rawEvent, details) {
  const mediaDuration = Number(details.media_duration ?? details.duration);
  const watchSeconds = rawEvent === 'watch_time' ? Number(details.duration) : null;
  const watchRatio = Number.isFinite(watchSeconds) && Number.isFinite(mediaDuration) && mediaDuration > 0
    ? Math.min(1, Math.max(0, watchSeconds / mediaDuration)) : null;
  const milestone = Number(details.milestone);
  return {
    derived_schema_version: 1,
    is_impression: rawEvent === 'impression_batch',
    is_asset_interaction: ASSET_EVENTS.has(rawEvent),
    positive_feedback: POSITIVE_EVENTS.has(rawEvent),
    negative_feedback: NEGATIVE_EVENTS.has(rawEvent),
    conversion: rawEvent === 'bid_accepted' || rawEvent === 'copy_acquired',
    watch_seconds: Number.isFinite(watchSeconds) ? watchSeconds : null,
    watch_ratio: watchRatio == null ? null : Number(watchRatio.toFixed(6)),
    completion_milestone: Number.isFinite(milestone) ? milestone : (rawEvent === 'play_complete' ? 100 : null),
  };
}

export function validateTelemetryEvent(event) {
  if (!event || typeof event !== 'object' || Array.isArray(event)) return { event: null, error: 'event-not-object' };
  if (!/^[a-z0-9_:-]{2,80}$/i.test(String(event.event_id || ''))) return { event: null, error: 'invalid-event-id' };
  const rawEvent = String(event.raw_event || '');
  if (!EVENT_TYPES.has(rawEvent)) return { event: null, error: 'unknown-event-type' };
  const detailsError = validateEventDetails(rawEvent, event.details || {});
  if (detailsError) return { event: null, error: detailsError };
  const createdAt = Number.isNaN(Date.parse(event.created_at)) ? new Date().toISOString() : event.created_at;
  const details = event.details || {};
  return {
    error: null,
    event: {
      event_id: String(event.event_id), raw_event: rawEvent, details, created_at: createdAt,
      schema_version: Math.max(1, Math.min(100, Number(event.schema_version) || 1)),
      session_id: String(event.session_id || '').slice(0, 100),
      session_sequence: Math.max(0, Number(event.session_sequence) || 0),
      research_consent: Boolean(event.research_consent),
      experiment_id: String(event.experiment_id || '').slice(0, 100),
      experiment_group: String(event.experiment_group || '').slice(0, 100),
      derived_signals: deriveSignals(rawEvent, details),
    },
  };
}
