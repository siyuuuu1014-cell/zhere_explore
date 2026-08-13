// Extracted from prototype.js. Loaded as a classic script to share the game runtime.

function allWorldNotes() {
  const notes = new Map();
  [...systemNotes, ...state.notes, ...state.publicDemands].forEach((note) => notes.set(note.id, note));
  return [...notes.values()];
}

function allUserWorldNotes() {
  const notes = new Map();
  [...state.notes, ...state.publicDemands].forEach((note) => notes.set(note.id, note));
  return [...notes.values()].filter((note) => !note.archived);
}

function applyPublicWorld(publicWorld, { render = false } = {}) {
  if (!publicWorld) return;
  const normalizeAsset = (asset) => ({
    likes: 0, comments: [], tags: [], source: 'user', spawn_source: '玩家发布', dur: '—', res: asset.hasMedia ? '已上传' : '示例', license: '个人', price: 0,
    ...asset,
  });
  const normalizeDemand = (demand) => ({ status: 'open', responses: [], ...demand });
  if (publicWorld.mode === 'delta') {
    const assets = new Map(state.publicAssets.map((item) => [item.id, item]));
    const demands = new Map(state.publicDemands.map((item) => [item.id, item]));
    const records = new Map(state.publicRecords.map((item) => [item.id, item]));
    (publicWorld.deletedAssetIds || []).forEach((id) => assets.delete(id));
    (publicWorld.deletedDemandIds || []).forEach((id) => demands.delete(id));
    (publicWorld.deletedRecordIds || []).forEach((id) => records.delete(id));
    (publicWorld.assets || []).forEach((item) => assets.set(item.id, normalizeAsset(item)));
    (publicWorld.demands || []).forEach((item) => demands.set(item.id, normalizeDemand(item)));
    (publicWorld.records || []).forEach((item) => records.set(item.id, item));
    state.publicAssets = [...assets.values()]; state.publicDemands = [...demands.values()]; state.publicRecords = [...records.values()];
  } else {
    state.publicAssets = (publicWorld.assets || []).map(normalizeAsset);
    state.publicDemands = (publicWorld.demands || []).map(normalizeDemand);
    state.publicRecords = publicWorld.records || [];
  }
  state.publicWorldUpdatedAt = publicWorld.refreshedAt || state.publicWorldUpdatedAt;
  if (render) {
    renderScreens();
    renderCreations();
    renderWorld();
  }
}

async function syncPublicWorld({ render = true } = {}) {
  if (!window.ZhereService?.isAuthenticated()) return null;
  if (publicSyncPromise) return publicSyncPromise;
  publicSyncPromise = (async () => { try {
    const publicWorld = await window.ZhereService.publicWorld.load({ since: state.publicWorldUpdatedAt });
    applyPublicWorld(publicWorld, { render });
    lastPublicSyncAt = Date.now();
    return publicWorld;
  } catch (error) {
    console.warn('Public world refresh failed', error);
    return null;
  } finally { publicSyncPromise = null; } })();
  return publicSyncPromise;
}

async function migrateLegacyPublicContent() {
  if (!window.ZhereService?.isAuthenticated() || (!state.published.length && !state.notes.length)) return;
  let migrated = false;
  for (const asset of [...state.published]) {
    try {
      await window.ZhereService.publicWorld.publishAsset(asset);
      migrated = true;
    } catch (error) { console.warn('Legacy public asset migration failed', asset.id, error); }
  }
  for (const note of [...state.notes]) {
    try {
      await window.ZhereService.publicWorld.createDemand(note);
      for (const [index, response] of (state.noteResponses?.[note.id] || []).entries()) {
        await window.ZhereService.publicWorld.respondToDemand(note.id, { ...response, id: response.id || `legacy-${note.id}-${index}` });
      }
      migrated = true;
    } catch (error) { console.warn('Legacy public demand migration failed', note.id, error); }
  }
  if (!migrated) return;
  state.published = [];
  state.notes = [];
  state.noteResponses = {};
  await syncPublicWorld({ render: false });
  await window.ZhereService.saveState(serializableState(), { immediate: true });
}

function responsesForNote(note) {
  const responses = [
    ...(note.responses || []),
    ...(state.noteResponses?.[note.id] || []),
  ];
  const seen = new Set();
  return responses.filter((response) => {
    const key = response.id || `${response.name}:${response.text}:${response.assetId || ''}:${response.at || ''}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function linkedVideoIdsForNote(note) {
  return [...new Set([
    note.refAsset,
    ...(state.noteLinks?.[note.id] || []),
    ...(note.assetLinks || []),
    ...responsesForNote(note).map((response) => response.assetId),
  ].filter(Boolean))];
}

function linkNoteToVideo(note, videoId) {
  if (!note || !videoId) return;
  state.noteLinks = state.noteLinks || {};
  state.noteLinks[note.id] = [...new Set([...(state.noteLinks[note.id] || []), videoId])];
  note.assetLinks = [...new Set([...(note.assetLinks || []), videoId])];
}

function relatedNotesForVideo(videoId) {
  return allWorldNotes().filter((note) => linkedVideoIdsForNote(note).includes(videoId));
}

function responseVideoCandidates(note) {
  const owned = new Set([
    ...state.published.map((video) => video.id),
    ...state.publicAssets.filter((video) => video.owner === 'me').map((video) => video.id),
    ...state.copies.map((copy) => copy.assetId),
    ...state.openedVideos,
    ...linkedVideoIdsForNote(note),
  ]);
  const ranked = allAssets()
    .map((video) => ({
      video,
      priority: owned.has(video.id) ? 0 : (state.exposureCounts[video.id] || 0) > 0 ? 1 : 2,
      distance: Number.isFinite(video.wx) ? Math.hypot(video.wx - note.wx, video.wy - note.wy) : Number.POSITIVE_INFINITY,
    }))
    .sort((a, b) => a.priority - b.priority || a.distance - b.distance)
    .slice(0, 16)
    .map((entry) => entry.video);
  return ranked;
}

function findOpenWorldSpot(originWx, originWy, excludeId = null) {
  const occupied = [
    ...Object.values(objectTargets),
    ...allVideos(),
    ...allUserWorldNotes(),
  ].filter((item) => !excludeId || item.id !== excludeId);
  const offsets = [
    [110, 70], [-110, 70], [120, -90], [-120, -90],
    [190, 30], [-190, 30], [20, 190], [20, -190],
    [230, 130], [-230, 130], [230, -130], [-230, -130],
    [0, 280], [0, -280], [300, 0], [-300, 0],
  ];
  let best = { wx: originWx + offsets[0][0], wy: originWy + offsets[0][1], clearance: -Infinity };
  for (const [dx, dy] of offsets) {
    const candidate = { wx: originWx + dx, wy: originWy + dy };
    const clearance = occupied.length
      ? Math.min(...occupied.map((item) => Math.hypot(candidate.wx - item.wx, candidate.wy - item.wy)))
      : Infinity;
    if (clearance >= 185) return candidate;
    if (clearance > best.clearance) best = { ...candidate, clearance };
  }
  return { wx: best.wx, wy: best.wy };
}

function repairCrowdedUserContent() {
  let changed = false;
  [...state.notes, ...state.published].forEach((item) => {
    const occupied = [
      ...Object.values(objectTargets),
      ...allVideos(),
      ...allUserWorldNotes(),
    ].filter((candidate) => candidate.id !== item.id);
    const nearestDistance = occupied.length
      ? Math.min(...occupied.map((candidate) => Math.hypot(item.wx - candidate.wx, item.wy - candidate.wy)))
      : Infinity;
    if (nearestDistance >= 145) return;
    const openSpot = findOpenWorldSpot(item.wx, item.wy, item.id);
    item.wx = openSpot.wx;
    item.wy = openSpot.wy;
    item.zone = zoneAt(item.wx, item.wy).id;
    changed = true;
  });
  if (changed) persist();
}
