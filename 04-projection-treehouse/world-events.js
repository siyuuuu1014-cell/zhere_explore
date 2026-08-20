// Extracted from prototype.js. Loaded as a classic script to share the game runtime.
// P2.4 区域事件牌库：每日每区保留一个事件，但地图只展示玩家当前区域的那一个，
// 避免相邻区域的同形标记同时进入视野。事件仍可忽略，次日轮换。

const {
  ZONE_EVENT_ORDER,
  zoneEventForDay,
  zoneEventSpot,
} = globalThis.ZhereWorldFoundation;

function activeZoneEvents() {
  const day = Number(state.worldClock?.day) || daySeed;
  const eventSeed = Number(state.worldClock?.eventSeed) || daySeed;
  const occurrenceDay = state.worldClock?.date || String(day);
  if (!state.zoneEventsOfDay || state.zoneEventsOfDay.occurrenceDay !== occurrenceDay) {
    const map = {};
    const profile = { openedVideos: state.growthStats.openedAssetIds.length, likedCount: state.likes.length, hasCopy: state.copies.length > 0 };
    ZONE_EVENT_ORDER.forEach((zoneId, index) => {
      const randForZone = mulberry32(eventSeed * 17 + day * 53 + index * 101);
      const event = zoneEventForDay(zoneId, day, state.homestead.season, state.homestead.weather, randForZone, profile);
      const spot = zoneEventSpot(zoneId, day);
      if (event && spot) map[zoneId] = { event, spot: { wx: spot[0], wy: spot[1] } };
    });
    state.zoneEventsOfDay = { day, occurrenceDay, map };
  }
  return Object.entries(state.zoneEventsOfDay.map).map(([zoneId, entry]) => ({ zoneId, ...entry }));
}

function renderZoneEventMarkers() {
  if (state.worldMode === 'cottage') return;
  const live = new Set();
  activeZoneEvents().forEach(({ zoneId, event, spot }) => {
    live.add(zoneId);
    let node = $(`[data-zone-event="${zoneId}"]`, decoLayer);
    if (!node) {
      node = document.createElement('button');
      node.type = 'button';
      node.className = 'deco zone-event-marker';
      node.dataset.zoneEvent = zoneId;
      node.innerHTML = '<span class="zone-event-art" aria-hidden="true"><i></i></span><small></small>';
      node.addEventListener('click', (event) => {
        event.stopPropagation();
        approachWorldInteraction(node, {
          wx: Number(node.dataset.wx),
          wy: Number(node.dataset.wy),
          offsetY: 58,
          arrivalDistance: 72,
          stopDistance: 6,
          source: `zone-event:${zoneId}`,
          label: `今日·${event.title}`,
          onArrival: () => showZoneEvent(zoneId),
        });
      });
      decoLayer.append(node);
    }
    node.dataset.wx = String(spot.wx);
    node.dataset.wy = String(spot.wy);
    const occurrenceDay = state.zoneEventsOfDay.occurrenceDay;
    const resolved = Boolean(state.zoneEventChoices[occurrenceDay]?.[zoneId]);
    node.classList.toggle('is-resolved', resolved);
    $('small', node).textContent = event.title;
    node.setAttribute('aria-label', `今日·${event.title}，可以回应也可以忽略`);
    placeContextWorldNode(node);
  });
  $$('[data-zone-event]', decoLayer).forEach((node) => { if (!live.has(node.dataset.zoneEvent)) node.remove(); });
}

function showZoneEvent(zoneId) {
  const entry = activeZoneEvents().find((item) => item.zoneId === zoneId);
  if (!entry) return showToast('今天这里没有特别的事');
  const { event, spot } = entry;
  const zoneName = (ZONE_DEFS.find((zone) => zone.id === zoneId) || {}).name || zoneId;
  const occurrenceDay = state.zoneEventsOfDay.occurrenceDay;
  const occurrenceId = `${occurrenceDay}:${zoneId}:${event.id}`;
  const previous = state.zoneEventChoices[occurrenceDay]?.[zoneId];
  const previousChoice = previous ? event.choices.find((choice) => choice.id === previous) : null;
  if (!state.seenZoneEventOccurrences.includes(occurrenceId)) {
    state.seenZoneEventOccurrences.push(occurrenceId);
    state.seenZoneEventOccurrences = state.seenZoneEventOccurrences.slice(-180);
    logEvent('zone_event_seen', { zone_event_id: event.id, zone_id: zoneId, occurrence_id: occurrenceId });
    persist();
  }
  openSheet(`
    <div class="sheet-inner zone-event-sheet">
      <p class="sheet-eyebrow">今日 · ${escapeHtml(zoneName)}</p>
      <h2 class="sheet-title" id="sheetTitle" tabindex="-1">${escapeHtml(event.title)}</h2>
      <p class="sheet-subtitle">${escapeHtml(event.summary)} 这不是限时任务，明天会换一种，也可以完全忽略。</p>
      ${previousChoice ? `<div class="status-banner">今天你已经回应过：${escapeHtml(previousChoice.label)}。世界记下了，不会再来催你。</div>` : ''}
      <div class="choice-grid">
        ${event.choices.map((choice) => `<button class="choice-button" type="button" data-zone-choice="${escapeHtml(choice.id)}" ${previousChoice ? 'disabled' : ''}><b>${escapeHtml(choice.label)}</b><span>${escapeHtml(choice.desc)}</span></button>`).join('')}
      </div>
    </div>
  `, () => {
    $$('[data-zone-choice]', sheet).forEach((button) => button.addEventListener('click', () => {
      const choice = event.choices.find((item) => item.id === button.dataset.zoneChoice);
      if (!choice || state.zoneEventChoices[occurrenceDay]?.[zoneId]) return;
      state.zoneEventChoices[occurrenceDay] ||= {};
      state.zoneEventChoices[occurrenceDay][zoneId] = choice.id;
      applyZoneEventEffect(choice);
      logEvent('world_event_response', { choice: choice.id, zone_event_id: event.id, zone_id: zoneId, occurrence_id: occurrenceId });
      persist();
      closeSheet();
      renderWorld();
    }));
  });
}

function applyZoneEventEffect(choice) {
  const effect = choice.effect || { kind: 'none' };
  if (effect.kind === 'resource' && effect.resource && Number.isFinite(Number(effect.amount))) {
    state.homestead.resources[effect.resource] = (state.homestead.resources[effect.resource] || 0) + Number(effect.amount);
    const labels = { wood: '木材', stone: '石料', fiber: '纤维', seeds: '种子' };
    showToast(`得到了 ${effect.amount} ${labels[effect.resource] || effect.resource}`);
  } else if (effect.kind === 'say' && effect.text) {
    say(effect.text);
  } else {
    showToast('你选择继续按自己的方式走，世界没有催促你。');
  }
}
