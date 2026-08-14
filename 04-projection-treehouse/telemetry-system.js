// Extracted from prototype.js. Loaded as a classic script to share the game runtime.

function logEvent(rawEvent, details = {}) {
  if (!state.research && !ESSENTIAL_EVENTS.has(rawEvent)) return null;
  const impression = details.asset_id ? state.lastImpressions.get(details.asset_id) : null;
  const attribution = impression && Date.now() - impression.at <= 30 * 60 * 1000 ? impression : null;
  if (impression && !attribution) state.lastImpressions.delete(details.asset_id);
  const event = {
    event_id: crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`,
    raw_event: rawEvent,
    details: {
      ...details,
      ...(attribution && !details.impression_id ? { impression_id: attribution.impressionId, impression_batch_id: attribution.batchId } : {}),
      zone_id: zoneAt(state.wx, state.wy).id,
      wx: Math.round(state.wx),
      wy: Math.round(state.wy),
    },
    created_at: new Date().toISOString(),
    schema_version: TELEMETRY_SCHEMA_VERSION,
    session_id: TELEMETRY_SESSION_ID,
    session_sequence: ++telemetrySequence,
    research_consent: Boolean(state.research),
    experiment_id: 'open-world-v1',
    experiment_group: 'mixed-biome',
    derived_signals: {},
  };
  state.rawEvents.push(event);
  if (state.rawEvents.length > RAW_EVENT_CAP) state.rawEvents = state.rawEvents.slice(-RAW_EVENT_CAP);
  window.ZhereService?.events.enqueue(event);
  if (!eventPersistQueued) {
    eventPersistQueued = true;
    queueMicrotask(() => {
      eventPersistQueued = false;
      persist();
    });
  }
  return event;
}

function countEvent(name) {
  return state.rawEvents.filter((event) => event.raw_event === name).length;
}

// 每个会话/日期种子只发一次 recommendation_request：request_id 与当日 seed 绑定。
// 该函数在运行时才会被调用（prototype.js 在本文件之后加载），因此这里只能引用运行时
// 已经存在的全局（worldVideos / scoreVideo / zoneAt / daySeed / TELEMETRY_SESSION_ID）。
let recommendationRequestId = null;
let recommendationRequestSent = false;

function ensureRecommendationRequest() {
  if (recommendationRequestSent) return recommendationRequestId;
  recommendationRequestSent = true;
  recommendationRequestId = `rec-${daySeed}-${String(TELEMETRY_SESSION_ID || 'session').slice(0, 8)}`;
  const candidateVideos = Array.isArray(worldVideos) ? worldVideos.slice(0, 200) : [];
  const candidates = candidateVideos.map((video, index) => ({
    asset_id: video.id,
    rank: index + 1,
    // scoreVideo 定义在 prototype.js（后加载）；不可用时用 1.0 占位。
    recommendation_score: Number((typeof scoreVideo === 'function' ? scoreVideo(video) : 1.0).toFixed(2)),
    zone_id: video.zone || (typeof zoneAt === 'function' && Number.isFinite(video.wx) ? zoneAt(video.wx, video.wy).id : 'town'),
    spawn_source: video.spawn_source || '我的发布',
    chosen: true,
  }));
  logEvent('recommendation_request', { request_id: recommendationRequestId, candidates, zone_slots: candidates.length });
  return recommendationRequestId;
}

function trackVisibility(video, visible, distance) {
  const now = performance.now();
  if (visible) {
    const acc = state.impressionAccum[video.id] || {
      durationMs: 0,
      visibleSince: now,
      dist: distance,
      score: scoreVideo(video),
      spawn_source: video.spawn_source || '我的发布',
      zone: zoneAt(video.wx, video.wy).id,
    };
    if (acc.visibleSince == null) acc.visibleSince = now;
    acc.dist = Math.min(acc.dist, distance);
    state.impressionAccum[video.id] = acc;
  } else {
    const acc = state.impressionAccum[video.id];
    if (acc?.visibleSince != null) {
      acc.durationMs += now - acc.visibleSince;
      acc.visibleSince = null;
    }
  }
}

function flushImpressions() {
  const ids = Object.keys(state.impressionAccum);
  if (!ids.length) return;
  const requestId = ensureRecommendationRequest();
  const now = performance.now();
  const batchId = crypto.randomUUID ? crypto.randomUUID() : `impression-${Date.now()}-${Math.random()}`;
  const ranked = ids
    .map((id) => {
      const acc = state.impressionAccum[id];
      const durationMs = acc.durationMs + (acc.visibleSince != null ? now - acc.visibleSince : 0);
      return { id, ...acc, durationMs };
    })
    .sort((a, b) => b.score - a.score);
  const impressions = ranked.map((entry, index) => {
    const impressionId = crypto.randomUUID ? crypto.randomUUID() : `${batchId}-${index}`;
    state.exposureCounts[entry.id] = (state.exposureCounts[entry.id] || 0) + 1;
    state.lastImpressions.set(entry.id, { impressionId, batchId, at: Date.now() });
    return {
      impression_id: impressionId,
      impression_batch_id: batchId,
      recommendation_request_id: requestId,
      asset_id: entry.id,
      zone_id: entry.zone,
      spawn_source: entry.spawn_source,
      rank: index + 1,
      recommendation_score: Number(entry.score.toFixed(2)),
      visible: true,
      visibility_duration_ms: Math.round(entry.durationMs),
      distance_to_player: Math.round(entry.dist),
      experiment_id: 'open-world-v1',
      experiment_group: 'mixed-biome',
    };
  });
  logEvent('impression_batch', { impression_batch_id: batchId, recommendation_request_id: requestId, impressions, count: impressions.length });
  state.impressionAccum = {};
  persist();
}

function resetMovementSample() {
  movementSample = { fromX: state.wx, fromY: state.wy, distance: 0, startedAt: Date.now(), mode: state.worldMode };
}

function flushMovementSample(reason = 'interval') {
  if (movementSample.distance < 0.5) return;
  logEvent('move_sample', {
    from_wx: Math.round(movementSample.fromX),
    from_wy: Math.round(movementSample.fromY),
    to_wx: Math.round(state.wx),
    to_wy: Math.round(state.wy),
    distance: Number(movementSample.distance.toFixed(2)),
    duration_ms: Date.now() - movementSample.startedAt,
    movement_kind: 'continuous',
    world_mode: movementSample.mode,
    reason,
  });
  resetMovementSample();
}

function endTelemetrySession(reason) {
  if (!telemetryWorldEntered || telemetrySessionEnded) return;
  flushMovementSample(reason);
  telemetrySessionEnded = true;
  logEvent('session_end', { reason, duration_ms: Date.now() - telemetryStartedAt });
}
