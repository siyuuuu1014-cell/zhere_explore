// Extracted from prototype.js. Loaded as a classic script to share the game runtime.
// P2.4 素材驱动动态地点：公共内容每天自然聚集出临时地点，可忽略、次日轮换。

const {
  DYNAMIC_LOCATION_RULES,
  dynamicLocationThemes,
  dynamicLocationPosition,
} = globalThis.ZhereWorldFoundation;

const SCENE_TO_DYNAMIC_ZONE = { '海岸': 'shore', '城镇': 'town', '商业': 'street', '山林': 'forest', '城市': 'street' };

function dynamicAssets() {
  return [...worldVideos, ...state.publicAssets.filter((asset) => Number.isFinite(Number(asset.wx)) && Number.isFinite(Number(asset.wy)))];
}

function dynamicLandmarkClearance(wx, wy) {
  return Object.values(objectTargets).every((item) => Math.hypot(wx - item.wx, wy - item.wy) >= DYNAMIC_LOCATION_RULES.landmarkClearance);
}

function computeDynamicLocations() {
  const locations = [];
  const assets = dynamicAssets();
  const openDemands = allWorldNotes().filter((note) => note.status !== 'closed' && note.status !== 'archived' && Number.isFinite(Number(note.wx)));
  const themes = dynamicLocationThemes(assets).slice(0, DYNAMIC_LOCATION_RULES.themeMaxPerDay);
  themes.forEach((theme, index) => {
    const zoneCounts = new Map();
    theme.videos.forEach((video) => {
      const zone = SCENE_TO_DYNAMIC_ZONE[video.scene] || 'town';
      zoneCounts.set(zone, (zoneCounts.get(zone) || 0) + 1);
    });
    const zone = [...zoneCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || 'town';
    const spot = dynamicLocationPosition(`${daySeed}:theme:${theme.tag}:${index}`, zone, dynamicLandmarkClearance);
    if (spot) locations.push({ id: `dl-theme-${theme.tag}`, kind: 'theme', label: `「${theme.tag}」主题放映点`, zone, wx: spot.wx, wy: spot.wy, itemIds: theme.videos.map((video) => video.id) });
  });
  if (openDemands.length >= DYNAMIC_LOCATION_RULES.campMinDemands) {
    const zoneCounts = new Map();
    openDemands.forEach((note) => zoneCounts.set(note.zone, (zoneCounts.get(note.zone) || 0) + 1));
    const zone = [...zoneCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || 'town';
    const spot = dynamicLocationPosition(`${daySeed}:camp`, zone, dynamicLandmarkClearance);
    if (spot) locations.push({ id: 'dl-camp', kind: 'camp', label: '需求营地', zone, wx: spot.wx, wy: spot.wy, itemIds: openDemands.slice(0, 6).map((note) => note.id) });
  }
  const hot = assets.filter((video) => Number(video.likes) >= DYNAMIC_LOCATION_RULES.hotMinLikes)
    .sort((a, b) => Number(b.likes) - Number(a.likes))[0];
  if (hot && Number.isFinite(Number(hot.wx))) {
    locations.push({ id: `dl-hot-${hot.id}`, kind: 'hot', label: `热门放映·《${hot.title}》`, zone: zoneAt(hot.wx, hot.wy).id, wx: hot.wx + 72, wy: hot.wy + 40, itemIds: [hot.id] });
  }
  return locations;
}

function visibleDynamicLocations() {
  const version = `${state.homestead.day}:${state.publicContentVersion}`;
  if (!state.dynamicLocations || state.dynamicLocationsVersion !== version) {
    state.dynamicLocations = computeDynamicLocations();
    state.dynamicLocationsDay = state.homestead.day;
    state.dynamicLocationsVersion = version;
  }
  return state.dynamicLocations;
}

function refreshDynamicLocations() {
  state.dynamicLocations = computeDynamicLocations();
  state.dynamicLocationsDay = state.homestead.day;
  state.dynamicLocationsVersion = `${state.homestead.day}:${state.publicContentVersion}`;
}

function renderDynamicLocations() {
  if (state.worldMode === 'cottage') return;
  const live = new Set();
  visibleDynamicLocations().forEach((loc) => {
    live.add(loc.id);
    let node = $(`[data-dynamic-location="${CSS.escape(loc.id)}"]`, decoLayer);
    if (!node) {
      node = document.createElement('button');
      node.type = 'button';
      node.className = `deco dynamic-location dynamic-${loc.kind}`;
      node.dataset.dynamicLocation = loc.id;
      node.innerHTML = '<span class="dynamic-location-art" aria-hidden="true"><i></i></span><small></small>';
      node.addEventListener('click', (event) => {
        event.stopPropagation();
        approachWorldInteraction(node, {
          wx: Number(node.dataset.wx),
          wy: Number(node.dataset.wy),
          offsetY: 58,
          arrivalDistance: 72,
          stopDistance: 6,
          source: `dynamic:${loc.id}`,
          label: loc.label,
          onArrival: () => showDynamicLocation(visibleDynamicLocations().find((item) => item.id === loc.id)),
        });
      });
      decoLayer.append(node);
      if (!state.loggedDynamicSpawns) state.loggedDynamicSpawns = new Set();
      if (!state.loggedDynamicSpawns.has(loc.id)) {
        state.loggedDynamicSpawns.add(loc.id);
        logEvent('dynamic_location_spawn', { location_id: loc.id, kind: loc.kind, zone_id: loc.zone, item_count: loc.itemIds.length });
      }
    }
    node.dataset.wx = String(loc.wx);
    node.dataset.wy = String(loc.wy);
    $('small', node).textContent = loc.label;
    node.setAttribute('aria-label', `${loc.label}，是今天临时出现的地点，可以走过去看看也可以忽略`);
    placeWorldNode(node, loc.wx, loc.wy);
  });
  $$('[data-dynamic-location]', decoLayer).forEach((node) => { if (!live.has(node.dataset.dynamicLocation)) node.remove(); });
}

function showDynamicLocation(loc) {
  if (!loc) return showToast('这个临时地点已经散去了');
  const kindNote = { theme: '几段同主题的素材今天在这里聚到了一起', camp: '几张开放的需求纸条在这里扎了堆', hot: '很多人今天都在讨论这段素材' }[loc.kind] || '世界里的内容今天在这里聚集';
  const rows = loc.itemIds.slice(0, 6).map((id) => {
    const video = findVideoById(id);
    if (video) return `<button class="list-row dynamic-row" type="button" data-dl-open-video="${escapeHtml(id)}"><span class="dynamic-row-mark" aria-hidden="true"></span><span><b>《${escapeHtml(video.title)}》</b><small>${escapeHtml(video.scene || '')} · ${escapeHtml(video.spawn_source || '公共素材')}</small></span></button>`;
    const note = allWorldNotes().find((item) => item.id === id);
    if (note) return `<button class="list-row dynamic-row" type="button" data-dl-open-note="${escapeHtml(id)}"><span class="dynamic-row-mark" aria-hidden="true"></span><span><b>「${escapeHtml(note.title)}」</b><small>${note.type === 'commerce' ? '商业需求' : '个人需求'} · ${escapeHtml(note.by || '一位旅人')}</small></span></button>`;
    return '';
  }).filter(Boolean).join('');
  logEvent('dynamic_location_visit', { location_id: loc.id, kind: loc.kind, zone_id: loc.zone });
  openSheet(`
    <div class="sheet-inner dynamic-location-sheet">
      <p class="sheet-eyebrow">今日 · 临时出现</p>
      <h2 class="sheet-title" id="sheetTitle" tabindex="-1">${escapeHtml(loc.label)}</h2>
      <p class="sheet-subtitle">${escapeHtml(kindNote)}。这里明天可能就不在了，但它不是任务——想看看就看看。</p>
      <div class="list-stack">${rows || '<div class="empty-state"><b>这里暂时空了</b><p>聚集在这里的内容已经各自散去，继续往别处走走。</p></div>'}</div>
    </div>
  `, () => {
    $$('[data-dl-open-video]', sheet).forEach((button) => button.addEventListener('click', () => {
      const video = findVideoById(button.dataset.dlOpenVideo);
      if (video) { closeSheet(); showVideo(video); }
    }));
    $$('[data-dl-open-note]', sheet).forEach((button) => button.addEventListener('click', () => {
      const note = allWorldNotes().find((item) => item.id === button.dataset.dlOpenNote);
      if (note) { closeSheet(); showNoteDetail(note); }
    }));
  });
}
