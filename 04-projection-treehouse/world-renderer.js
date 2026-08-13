function worldToScreen(wx, wy) {
  return {
    x: worldShell.clientWidth / 2 + wx - state.wx,
    y: worldShell.clientHeight * .52 + wy - state.wy,
  };
}

function placeWorldNode(node, wx, wy) {
  const point = worldToScreen(wx, wy);
  const visible = point.x > -260 && point.x < worldShell.clientWidth + 260 && point.y > -200 && point.y < worldShell.clientHeight + 200;
  if (!visible) {
    node.style.visibility = 'hidden';
    node.dataset.visible = '';
    return { point, visible };
  }
  let size = worldNodeSizeCache.get(node);
  if (!size) {
    const rect = node.getBoundingClientRect();
    size = { width: rect.width || node.offsetWidth || 0, height: rect.height || node.offsetHeight || 0 };
    worldNodeSizeCache.set(node, size);
  }
  node.style.transform = `translate3d(${(point.x - size.width / 2).toFixed(2)}px, ${(point.y - size.height / 2).toFixed(2)}px, 0)`;
  node.style.visibility = 'visible';
  node.dataset.visible = '1';
  return { point, visible };
}

function renderTerrainBands(fragment) {
  const bands = [
    { cls: 'is-hill', x: -6000, y: -6000, w: 12000, h: 4700 },
    { cls: 'is-forest', x: -6000, y: -1300, w: 4200, h: 1600 },
    { cls: 'is-street', x: 1400, y: -1300, w: 4600, h: 1600 },
    { cls: 'is-shore', x: -6000, y: 300, w: 12000, h: 600 },
    { cls: 'is-sea', x: -6000, y: 900, w: 12000, h: 5100 },
  ];
  bands.forEach((band) => {
    const a = worldToScreen(band.x, band.y);
    const b = worldToScreen(band.x + band.w, band.y + band.h);
    if (b.x < -TERRAIN_OVERSCAN_X || a.x > worldShell.clientWidth + TERRAIN_OVERSCAN_X || b.y < -TERRAIN_OVERSCAN_Y || a.y > worldShell.clientHeight + TERRAIN_OVERSCAN_Y) return;
    const div = document.createElement('div');
    div.className = `terrain-band ${band.cls}`;
    div.style.left = `${Math.round(a.x)}px`;
    div.style.top = `${Math.round(a.y)}px`;
    div.style.width = `${Math.round(b.x - a.x)}px`;
    div.style.height = `${Math.round(b.y - a.y)}px`;
    fragment.append(div);
  });
}

function renderWorldObstacles(fragment) {
  WORLD_OBSTACLES.forEach((obstacle) => {
    const a = worldToScreen(obstacle.from[0], obstacle.from[1]);
    const b = worldToScreen(obstacle.to[0], obstacle.to[1]);
    const minX = Math.min(a.x, b.x);
    const maxX = Math.max(a.x, b.x);
    const minY = Math.min(a.y, b.y);
    const maxY = Math.max(a.y, b.y);
    if (maxX < -TERRAIN_OVERSCAN_X || minX > worldShell.clientWidth + TERRAIN_OVERSCAN_X || maxY < -TERRAIN_OVERSCAN_Y || minY > worldShell.clientHeight + TERRAIN_OVERSCAN_Y) return;
    const node = document.createElement('span');
    node.className = `world-obstacle obstacle-${obstacle.kind}`;
    node.dataset.obstacle = obstacle.id;
    node.setAttribute('aria-label', obstacle.label);
    node.style.left = `${Math.round(a.x)}px`;
    node.style.top = `${Math.round(a.y)}px`;
    node.style.width = `${Math.round(Math.hypot(b.x - a.x, b.y - a.y))}px`;
    node.style.setProperty('--obstacle-width', `${obstacle.radius * 2}px`);
    node.style.transform = `translateY(-50%) rotate(${Math.atan2(b.y - a.y, b.x - a.x)}rad)`;
    node.innerHTML = '<i></i><i></i><i></i>';
    fragment.append(node);
  });
  WORLD_CROSSINGS.forEach((crossing) => {
    const point = worldToScreen(crossing.x, crossing.y);
    if (point.x < -TERRAIN_OVERSCAN_X || point.x > worldShell.clientWidth + TERRAIN_OVERSCAN_X || point.y < -TERRAIN_OVERSCAN_Y || point.y > worldShell.clientHeight + TERRAIN_OVERSCAN_Y) return;
    const node = document.createElement('span');
    node.className = `world-crossing crossing-${crossing.kind}`;
    node.setAttribute('aria-label', crossing.label);
    node.style.left = `${Math.round(point.x)}px`;
    node.style.top = `${Math.round(point.y)}px`;
    node.style.transform = `translate(-50%, -50%) rotate(${crossing.angle}deg)`;
    node.innerHTML = '<i></i><i></i><i></i>';
    fragment.append(node);
  });
}

function renderWorldConnections(fragment) {
  WORLD_TRAILS.forEach((trail) => {
    const a = worldToScreen(trail.from[0], trail.from[1]);
    const b = worldToScreen(trail.to[0], trail.to[1]);
    const minX = Math.min(a.x, b.x);
    const maxX = Math.max(a.x, b.x);
    const minY = Math.min(a.y, b.y);
    const maxY = Math.max(a.y, b.y);
    if (maxX < -TERRAIN_OVERSCAN_X || minX > worldShell.clientWidth + TERRAIN_OVERSCAN_X || maxY < -TERRAIN_OVERSCAN_Y || minY > worldShell.clientHeight + TERRAIN_OVERSCAN_Y) return;
    const path = document.createElement('span');
    path.className = `world-trail trail-${trail.type}`;
    path.style.left = `${Math.round(a.x)}px`;
    path.style.top = `${Math.round(a.y)}px`;
    path.style.width = `${Math.round(Math.hypot(b.x - a.x, b.y - a.y))}px`;
    path.style.transform = `translateY(-50%) rotate(${Math.atan2(b.y - a.y, b.x - a.x)}rad)`;
    fragment.append(path);
  });
  renderWorldObstacles(fragment);
  WORLD_SCENERY.forEach((scenery) => {
    const point = worldToScreen(scenery.wx, scenery.wy);
    if (point.x < -TERRAIN_OVERSCAN_X || point.x > worldShell.clientWidth + TERRAIN_OVERSCAN_X || point.y < -TERRAIN_OVERSCAN_Y || point.y > worldShell.clientHeight + TERRAIN_OVERSCAN_Y) return;
    const node = document.createElement('span');
    node.className = `world-scenery scenery-${scenery.type}`;
    node.innerHTML = '<i></i><i></i><i></i>';
    node.style.left = `${Math.round(point.x)}px`;
    node.style.top = `${Math.round(point.y)}px`;
    fragment.append(node);
  });
  WORLD_REGION_MARKERS.forEach((marker) => {
    const point = worldToScreen(marker.wx, marker.wy);
    if (point.x < -TERRAIN_OVERSCAN_X || point.x > worldShell.clientWidth + TERRAIN_OVERSCAN_X || point.y < -TERRAIN_OVERSCAN_Y || point.y > worldShell.clientHeight + TERRAIN_OVERSCAN_Y) return;
    const node = document.createElement('span');
    node.className = `world-region-marker region-${marker.zone}`;
    node.innerHTML = `<small>${marker.eyebrow}</small><b>${marker.title}</b><em>${marker.note}</em>`;
    node.style.left = `${Math.round(point.x)}px`;
    node.style.top = `${Math.round(point.y)}px`;
    fragment.append(node);
  });
}

function renderTerrain() {
  if (state.worldMode === 'cottage') {
    if (terrainLayer.childElementCount) terrainLayer.replaceChildren();
    terrainLayer.style.transform = '';
    terrainRenderOrigin = null;
    return;
  }
  const viewportWidth = worldShell.clientWidth;
  const viewportHeight = worldShell.clientHeight;
  if (terrainRenderOrigin
    && terrainRenderOrigin.width === viewportWidth
    && terrainRenderOrigin.height === viewportHeight
    && Math.abs(state.wx - terrainRenderOrigin.wx) < TERRAIN_OVERSCAN_X * .58
    && Math.abs(state.wy - terrainRenderOrigin.wy) < TERRAIN_OVERSCAN_Y * .58) {
    terrainLayer.style.transform = `translate3d(${(terrainRenderOrigin.wx - state.wx).toFixed(2)}px, ${(terrainRenderOrigin.wy - state.wy).toFixed(2)}px, 0)`;
    return;
  }
  const fragment = document.createDocumentFragment();
  renderTerrainBands(fragment);
  renderWorldConnections(fragment);
  const chunkW = 640;
  const chunkH = 480;
  const minX = Math.floor((state.wx - viewportWidth / 2 - TERRAIN_OVERSCAN_X) / chunkW);
  const maxX = Math.floor((state.wx + viewportWidth / 2 + TERRAIN_OVERSCAN_X) / chunkW);
  const minY = Math.floor((state.wy - viewportHeight / 2 - TERRAIN_OVERSCAN_Y) / chunkH);
  const maxY = Math.floor((state.wy + viewportHeight / 2 + TERRAIN_OVERSCAN_Y) / chunkH);
  for (let cy = minY; cy <= maxY; cy += 1) {
    for (let cx = minX; cx <= maxX; cx += 1) {
      const centerZone = zoneAt(cx * chunkW, cy * chunkH);
      if (centerZone.id === 'sea') continue;
      const count = hash2d(cx, cy, 9) > .6 ? 2 : 1;
      for (let i = 0; i < count; i += 1) {
        const mark = document.createElement('span');
        const roll = hash2d(cx, cy, 30 + i);
        mark.dataset.zone = centerZone.id;
        if (centerZone.id === 'forest') mark.className = `terrain-mark ${roll > .72 ? 'is-tree-cluster' : roll < .24 ? 'is-forest-rock' : 'is-bush'}`;
        else if (centerZone.id === 'hill') mark.className = `terrain-mark ${roll > .68 ? 'is-pine' : roll < .25 ? 'is-forest-rock' : 'is-windgrass'}`;
        else if (centerZone.id === 'shore') mark.className = `terrain-mark ${roll > .76 ? 'is-reed' : roll < .22 ? 'is-shell' : 'is-dune'}`;
        else if (centerZone.id === 'street') mark.className = `terrain-mark ${roll > .68 ? 'is-planter' : 'is-cobble'}`;
        else mark.className = `terrain-mark ${roll < .2 ? 'is-flower-patch' : roll > .78 ? 'is-footpath' : 'is-bush is-small'}`;
        const wx = cx * chunkW + 70 + hash2d(cx, cy, 50 + i) * (chunkW - 140);
        const wy = cy * chunkH + 60 + hash2d(cx, cy, 70 + i) * (chunkH - 120);
        const sx = worldShell.clientWidth / 2 + wx - state.wx;
        const sy = worldShell.clientHeight * .52 + wy - state.wy;
        mark.style.left = `${Math.round(sx)}px`;
        mark.style.top = `${Math.round(sy)}px`;
        if (!mark.classList.contains('is-shell')) mark.style.transform = `translate(-50%, -50%) rotate(${Math.round(hash2d(cx, cy, 90 + i) * 14 - 7)}deg)`;
        fragment.append(mark);
      }
    }
  }
  terrainLayer.replaceChildren(fragment);
  terrainLayer.style.transform = 'translate3d(0, 0, 0)';
  terrainLayer.dataset.renderVersion = String(++terrainRenderVersion);
  terrainRenderOrigin = { wx: state.wx, wy: state.wy, width: viewportWidth, height: viewportHeight };
}

function resourceTypeFor(zoneId, roll) {
  if (zoneId === 'forest') return roll > .7 ? 'stump' : roll > .28 ? 'branch' : 'grass';
  if (zoneId === 'hill') return roll > .42 ? 'stone' : 'grass';
  if (zoneId === 'shore' || zoneId === 'sea') return 'shell';
  if (zoneId === 'street') return roll > .65 ? 'stone' : 'grass';
  return roll > .72 ? 'branch' : roll > .35 ? 'grass' : 'stone';
}

function generateNearbyGatherables() {
  const chunkW = 520;
  const chunkH = 400;
  const minX = Math.floor((state.wx - worldShell.clientWidth / 2 - 180) / chunkW);
  const maxX = Math.floor((state.wx + worldShell.clientWidth / 2 + 180) / chunkW);
  const minY = Math.floor((state.wy - worldShell.clientHeight / 2 - 140) / chunkH);
  const maxY = Math.floor((state.wy + worldShell.clientHeight / 2 + 140) / chunkH);
  const resources = [];
  for (let cy = minY; cy <= maxY; cy += 1) {
    for (let cx = minX; cx <= maxX; cx += 1) {
      if (hash2d(cx, cy, 119) < .44) continue;
      const count = hash2d(cx, cy, 121) > .88 ? 2 : 1;
      for (let i = 0; i < count; i += 1) {
        const wx = cx * chunkW + 70 + hash2d(cx, cy, 130 + i) * (chunkW - 140);
        const wy = cy * chunkH + 60 + hash2d(cx, cy, 150 + i) * (chunkH - 120);
        const zone = zoneAt(wx, wy);
        if (zone.id === 'sea' && hash2d(cx, cy, 178 + i) < .58) continue;
        if (Object.values(objectTargets).some((object) => Math.hypot(wx - object.wx, wy - object.wy) < 155)) continue;
        const type = resourceTypeFor(zone.id, hash2d(cx, cy, 170 + i));
        const id = `${cx}:${cy}:${i}:${type}`;
        const gatheredDay = state.homestead.forageDays[id] || 0;
        if (state.homestead.day - gatheredDay < RESOURCE_RESPAWN_DAYS) continue;
        resources.push({ id, type, wx, wy, zone: zone.id, ...RESOURCE_META[type] });
      }
    }
  }
  STARTER_GATHERABLES.forEach((starter) => {
    const gatheredDay = state.homestead.forageDays[starter.id] || 0;
    const nearViewport = Math.abs(starter.wx - state.wx) < worldShell.clientWidth / 2 + 180
      && Math.abs(starter.wy - state.wy) < worldShell.clientHeight / 2 + 140;
    if (nearViewport && state.homestead.day - gatheredDay >= RESOURCE_RESPAWN_DAYS) resources.push({ ...starter, zone: zoneAt(starter.wx, starter.wy).id, ...RESOURCE_META[starter.type] });
  });
  return resources;
}

function renderGatherables() {
  if (state.worldMode === 'cottage') {
    state.activeGatherables = [];
    state.gatherRenderKey = '';
    resourceLayer.replaceChildren();
    return;
  }
  const renderKey = `${Math.floor(state.wx / 520)}:${Math.floor(state.wy / 400)}:${state.homestead.day}`;
  if (state.gatherRenderKey !== renderKey) {
    state.gatherRenderKey = renderKey;
    state.activeGatherables = generateNearbyGatherables();
    const fragment = document.createDocumentFragment();
    state.activeGatherables.forEach((item) => {
      const button = document.createElement('button');
      button.className = `gatherable gather-${item.type}`;
      button.dataset.resourceId = item.id;
      button.dataset.label = item.label;
      button.setAttribute('aria-label', `${item.label}，采集后明天重新生长`);
      button.innerHTML = `<span class="gather-shape"><i></i><i></i><i></i></span><small>${item.label}</small>`;
      button.addEventListener('click', (event) => {
        event.stopPropagation();
        startPointerMove('overworld', item.wx, item.wy + 58, {
          source: 'resource',
          onArrival: () => gatherResource(item),
        });
      });
      fragment.append(button);
    });
    resourceLayer.replaceChildren(fragment);
  }
  $$('.gatherable', resourceLayer).forEach((node) => {
    const item = state.activeGatherables.find((candidate) => candidate.id === node.dataset.resourceId);
    if (item) placeWorldNode(node, item.wx, item.wy);
  });
}

function videoVisualKind(video) {
  const words = `${video?.title || ''} ${(video?.tags || []).join(' ')} ${video?.scene || ''}`;
  if (/海|潮|浪|船|码头|灯塔|贝壳/.test(words)) return 'tide';
  if (/猫|狗|宠物|动物|鸟/.test(words)) return 'animal';
  if (/食物|咖啡|面包|菜市场/.test(words)) return 'food';
  if (/雨|伞|水洼/.test(words)) return 'rain';
  if (/夜|灯|霓虹|黄昏|星/.test(words)) return 'night';
  if (/树林|山|竹|叶|苔藓|植物/.test(words)) return 'forest';
  if (/城市|地铁|电车|车站|商业|招牌/.test(words)) return 'city';
  if (/运动|跑|单车|风筝|火/.test(words)) return 'motion';
  return 'daylife';
}

function mediaFrameMarkup(video) {
  const kind = videoVisualKind(video);
  return `<span class="media-frame"><i class="media-preview preview-${kind}" aria-hidden="true"><b></b><em></em></i><i class="media-play" aria-hidden="true"></i></span>`;
}

function mediaObjectMarkup(zoneId, video) {
  const frameMarkup = mediaFrameMarkup(video);
  const pieces = {
    forest: `<span class="media-crown"></span>${frameMarkup}<span class="media-feet"></span>`,
    hill: `<span class="media-kite"></span>${frameMarkup}<span class="media-feet"></span>`,
    town: `<span class="media-awning"></span>${frameMarkup}<span class="media-planter"></span>`,
    street: `<span class="media-marquee"></span>${frameMarkup}<span class="media-stand"></span>`,
    shore: `<span class="media-shell"></span>${frameMarkup}<span class="media-reed"></span>`,
    sea: `<span class="media-flag"></span>${frameMarkup}<span class="media-buoy"></span>`,
  };
  return `<span class="media-artifact">${pieces[zoneId] || pieces.town}</span>`;
}

function renderScreens() {
  screenLayer.replaceChildren();
  worldNodeSizeCache = new WeakMap();
  worldVideosVisible().forEach((video) => {
    const button = document.createElement('button');
    const zoneId = video.zone || zoneAt(video.wx, video.wy).id;
    button.className = `media-screen media-${zoneId}`;
    button.dataset.videoId = video.id;
    button.dataset.label = video.title;
    button.dataset.visual = videoVisualKind(video);
    button.setAttribute('aria-label', video.title);
    button.innerHTML = mediaObjectMarkup(zoneId, video);
    const likeBadge = document.createElement('span');
    likeBadge.className = `like-badge${video.liked || state.likes.includes(video.id) ? ' is-liked' : ''}`;
    likeBadge.textContent = `♥${video.likes}`;
    button.append(likeBadge);
    button.addEventListener('click', (event) => {
      event.stopPropagation();
      if (state.worldMode === 'cottage') exitCottage();
      stopMovement(true);
      showVideo(video);
    });
    screenLayer.append(button);
  });
  state.pendingUploads.forEach((upload) => {
    const button = document.createElement('button');
    const zoneId = upload.zone || zoneAt(upload.wx, upload.wy).id;
    const failed = upload.status === 'failed';
    button.className = `media-screen media-${zoneId} pending-media ${failed ? 'is-upload-failed' : 'is-uploading'}`;
    button.dataset.pendingUploadId = upload.id;
    button.dataset.label = failed ? `${upload.title} · 上传失败` : `${upload.title} · 正在挂片`;
    button.setAttribute('aria-label', failed ? `${upload.title}上传失败，点击重试` : `${upload.title}正在上传并发布`);
    button.setAttribute('aria-busy', String(!failed));
    button.innerHTML = `${mediaObjectMarkup(zoneId, upload)}<span class="upload-state-mark"><i aria-hidden="true"></i>${failed ? '上传失败 · 点击重试' : '正在上传并挂到世界'}</span>`;
    button.addEventListener('click', (event) => {
      event.stopPropagation();
      if (failed) showPendingUpload(upload);
      else showToast(`《${upload.title}》正在上传，完成后会自动变成可观看素材`);
    });
    screenLayer.append(button);
  });
}

function renderCreations() {
  creationLayer.replaceChildren();
  worldNodeSizeCache = new WeakMap();
  allUserWorldNotes().forEach((note) => {
    const button = document.createElement('button');
    const responseCount = responsesForNote(note).length;
    button.className = `player-creation is-note is-${note.type === 'commerce' ? 'commerce' : 'personal'}${responseCount ? ' has-responses' : ''}${note.status === 'closed' ? ' is-closed' : ''}`;
    const label = document.createElement('span');
    label.textContent = `${note.title}${note.status === 'closed' ? ' · 已关闭' : ''}`;
    button.append(label);
    const meta = document.createElement('small');
    meta.className = 'creation-meta';
    meta.textContent = `${note.type === 'commerce' ? '商' : '愿'}${responseCount ? ` · ${responseCount} 回应` : ''}`;
    button.append(meta);
    button.dataset.creationId = note.id;
    button.setAttribute('aria-label', `需求纸条：${note.title}`);
    button.addEventListener('click', (event) => {
      event.stopPropagation();
      if (state.worldMode === 'cottage') exitCottage();
      stopMovement(true);
      showNoteDetail(note);
    });
    creationLayer.append(button);
  });
}

function renderTagPlants() {
  TAG_PLANTS.forEach((plant, index) => {
    let node = $(`[data-tag-plant="${index}"]`, decoLayer);
    if (!node) {
      node = document.createElement('button');
      node.className = 'tag-plant';
      node.dataset.tagPlant = index;
      node.dataset.tag = plant.tag;
      node.addEventListener('click', (event) => {
        event.stopPropagation();
        pluckTagPlant(index);
      });
      decoLayer.append(node);
    }
    placeWorldNode(node, plant.wx, plant.wy);
  });
}

function renderBidPlants() {
  $$('.bid-plant', decoLayer).forEach((node) => node.dataset.keep = '1');
  worldVideosVisible().forEach((video) => {
    const bid = state.bids[video.id];
    if (!bid || !Number.isFinite(Number(bid.validTransactionCount)) || !Number.isInteger(Number(bid.requiredCount)) || Number(bid.requiredCount) < 1) return;
    let node = $(`.bid-plant[data-bid="${video.id}"]`, decoLayer);
    if (!node) {
      node = document.createElement('span');
      node.className = 'bid-plant';
      node.dataset.bid = video.id;
      node.innerHTML = '<span class="pleaf l1"></span><span class="pleaf l2"></span><span class="pstem"></span><span class="pflower"></span>';
      decoLayer.append(node);
    }
    delete node.dataset.keep;
    const ratio = Math.min(1, Number(bid.validTransactionCount) / Number(bid.requiredCount));
    $('.pstem', node).style.height = `${14 + ratio * 34}px`;
    node.classList.toggle('is-bloom', ratio >= 1);
    node.classList.toggle('is-won', Boolean(bid.transactionId));
    placeWorldNode(node, video.wx + 74, video.wy + 34);
  });
  $$('[data-keep="1"]', decoLayer).forEach((node) => node.remove());
}

function renderDecos() {
  if (state.bottleState?.open === false) {
    let bottle = $('.bottle', decoLayer);
    if (!bottle) {
      bottle = document.createElement('span');
      bottle.className = 'deco bottle';
      bottle.title = '漂流瓶';
      bottle.addEventListener('click', (event) => {
        event.stopPropagation();
        openBottle();
      });
      decoLayer.append(bottle);
    }
    placeWorldNode(bottle, state.bottleState.wx, state.bottleState.wy);
  }
}

function lampMarkup(id, wx, wy) {
  const lamp = document.createElement('span');
  lamp.className = 'deco lamp is-clickable';
  lamp.dataset.lamp = id;
  lamp.innerHTML = '<span class="lamp-head"></span><span class="lamp-post"></span>';
  lamp.title = '可以开关的灯';
  lamp.addEventListener('click', (event) => {
    event.stopPropagation();
    lamp.classList.toggle('is-on');
    logEvent('play_only_lamp', { lamp_id: id, on: lamp.classList.contains('is-on') });
    showToast(lamp.classList.contains('is-on') ? '灯亮了，附近亮了一点' : '灯熄了，影子又回来了');
  });
  decoLayer.append(lamp);
  placeWorldNode(lamp, wx, wy);
}

function renderStaticDecos() {
  if (decoLayer.dataset.built) return;
  decoLayer.dataset.built = '1';
  lampMarkup('lamp-1', -220, -320);
  lampMarkup('lamp-2', 640, -620);
  lampMarkup('lamp-3', 1900, -320);
  [1, 2].forEach((index) => {
    const gull = document.createElement('span');
    gull.className = `deco seagull gull-${index}`;
    gull.style.left = '0';
    gull.style.top = '0';
    gull.dataset.gull = String(index);
    decoLayer.append(gull);
  });
  const cat = document.createElement('span');
  cat.className = 'deco cat';
  cat.id = 'worldCat';
  cat.title = '镇上的猫';
  cat.addEventListener('click', (event) => {
    event.stopPropagation();
    logEvent('play_only_cat');
    showToast('猫叫了一小声，然后继续散步');
  });
  decoLayer.append(cat);
}

function updateCat() {
  const cat = $('#worldCat');
  if (!cat) return;
  const now = performance.now();
  if (!updateCat.target || now > updateCat.until) {
    updateCat.target = { wx: 140 + Math.random() * 720, wy: -420 + Math.random() * 480 };
    updateCat.until = now + 5000 + Math.random() * 4000;
  }
  updateCat.pos = updateCat.pos || { wx: 300, wy: -100 };
  updateCat.pos.wx += (updateCat.target.wx - updateCat.pos.wx) * 0.004;
  updateCat.pos.wy += (updateCat.target.wy - updateCat.pos.wy) * 0.004;
  placeWorldNode(cat, updateCat.pos.wx, updateCat.pos.wy);
}

function updateGulls() {
  $$('.seagull', decoLayer).forEach((gull, index) => {
    const base = index === 0 ? { wx: -300, wy: 1120 } : { wx: 900, wy: 1250 };
    const drift = Math.sin(performance.now() / 4000 + index * 2) * 60;
    placeWorldNode(gull, base.wx + drift, base.wy + index * 40);
  });
}

function renderPlaced() {
  placedLayer.replaceChildren();
  const rug = document.createElement('span');
  rug.className = `rug-overlay rug-${state.rug}`;
  placedLayer.append(rug);
  state.placed.forEach((item, index) => {
    const film = document.createElement('button');
    film.type = 'button';
    film.className = `placed-film${item.type === 'combo' ? ' placed-combo' : ''}${state.carryPlaced === index ? ' is-selected' : ''}`;
    film.style.left = `${item.x}%`;
    film.style.top = `${item.y}%`;
    const video = findVideoById(item.assetId);
    film.title = item.type === 'combo' ? `组合的副本 ${index + 1}` : `《${video ? video.title : '副本'}》的副本`;
    film.setAttribute('aria-label', `${film.title}；点击拿起，再点击一次收回口袋`);
    film.dataset.shortTitle = item.type === 'combo' ? `组合 ${index + 1}` : (video?.title || '副本').slice(0, 8);
    film.style.setProperty('--film-color', ['#8fbcb3', '#e0ab4f', '#b8654f', '#a9bf83'][index % 4]);
    film.addEventListener('click', (event) => {
      event.stopPropagation();
      pickUpPlaced(index);
    });
    placedLayer.append(film);
  });
}

function renderNameless() {
  NAMELESS_REGIONS.forEach((region) => {
    let node = $(`[data-nameless="${region.id}"]`, decoLayer);
    if (!node) {
      node = document.createElement('button');
      node.className = 'nameless-marker';
      node.dataset.nameless = region.id;
      node.addEventListener('click', (event) => {
        event.stopPropagation();
        showNameless(region);
      });
      decoLayer.append(node);
    }
    const name = state.namedZones[region.id];
    node.textContent = name ? `「${name}」` : '？无名处';
    node.classList.toggle('is-named', !!name);
    placeWorldNode(node, region.x, region.y);
  });
}

function renderAuras() {
  const videos = worldVideosVisible().filter((video) => AURA_CLASS[video.scene]);
  const signature = videos.map((video) => `${video.id}:${video.scene}`).join('|');
  if (signature === auraRenderSignature && auraLayer.childElementCount === videos.length) {
    $$('.aura', auraLayer).forEach((node) => {
      const video = videos.find((candidate) => candidate.id === node.dataset.videoId);
      if (video) placeWorldNode(node, video.wx, video.wy + 10);
    });
    return;
  }
  auraRenderSignature = signature;
  auraLayer.replaceChildren();
  worldNodeSizeCache = new WeakMap();
  videos.forEach((video) => {
    const cls = AURA_CLASS[video.scene];
    const div = document.createElement('span');
    div.className = `aura ${cls}`;
    div.dataset.videoId = video.id;
    auraLayer.append(div);
    placeWorldNode(div, video.wx, video.wy + 10);
  });
}

function renderWorld() {
  worldStage.scrollTop = 0;
  worldStage.scrollLeft = 0;
  updatePlayer();
  if (state.worldMode === 'cottage') renderHomestead();
  renderTerrain();
  renderAuras();
  renderStaticDecos();
  $$('.world-object').forEach((node) => {
    const target = objectTargets[node.dataset.object];
    if (target) placeWorldNode(node, target.wx, target.wy);
    const id = node.dataset.object;
    const filled = {
      shopcafe: !!state.shops.cafe,
      shoppet: !!state.shops.pet,
      frame: !!state.frameSlot,
      clothesline: state.line.some(Boolean),
      doublewall: !!(state.wall.a || state.wall.b),
      mixtable: state.mix.length > 0,
    }[id];
    node.classList.toggle('is-filled', !!filled);
    let stateMark = $('.object-state-mark', node);
    if (filled && !stateMark) {
      stateMark = document.createElement('span');
      stateMark.className = 'object-state-mark';
      stateMark.setAttribute('aria-hidden', 'true');
      stateMark.textContent = '已布置';
      node.append(stateMark);
    }
    if (stateMark) stateMark.hidden = !filled;
  });
  $$('.media-screen').forEach((node) => {
    const video = worldVideosVisible().find((candidate) => candidate.id === node.dataset.videoId);
    const upload = state.pendingUploads.find((candidate) => candidate.id === node.dataset.pendingUploadId);
    const item = video || upload;
    if (!item) return;
    const { visible } = placeWorldNode(node, item.wx, item.wy);
    if (video) trackVisibility(video, visible, Math.hypot(state.wx - video.wx, state.wy - video.wy));
  });
  $$('.player-creation').forEach((node) => {
    const note = allUserWorldNotes().find((candidate) => candidate.id === node.dataset.creationId);
    if (note) placeWorldNode(node, note.wx, note.wy);
  });
  renderTagPlants();
  renderGatherables();
  renderBidPlants();
  renderDecos();
  renderNameless();
  updateWalkTargetMarker();
  updateNearby();
  updateWayfinder();
  refreshWorldFrameRegistry();
}

function refreshWorldFrameRegistry() {
  const videos = worldVideosVisible();
  worldFrameRegistry = {
    videos,
    videosById: new Map(videos.map((video) => [video.id, video])),
    uploadsById: new Map(state.pendingUploads.map((upload) => [upload.id, upload])),
    notesById: new Map(allUserWorldNotes().map((note) => [note.id, note])),
    gatherablesById: new Map(state.activeGatherables.map((item) => [item.id, item])),
    worldObjects: $$('.world-object'),
    mediaScreens: $$('.media-screen'),
    creations: $$('.player-creation'),
    gatherables: $$('.gatherable', resourceLayer),
    tagPlants: TAG_PLANTS.map((plant, index) => ({ plant, node: $(`[data-tag-plant="${index}"]`, decoLayer) })).filter((entry) => entry.node),
    bidPlants: $$('.bid-plant', decoLayer),
    lamps: $$('.deco.lamp', decoLayer),
    nameless: NAMELESS_REGIONS.map((region) => ({ region, node: $(`[data-nameless="${region.id}"]`, decoLayer) })).filter((entry) => entry.node),
    auras: $$('.aura', auraLayer),
    bottle: $('.bottle', decoLayer),
  };
  return worldFrameRegistry;
}

function updateWorldMovementFrame(now = performance.now()) {
  worldStage.scrollTop = 0;
  worldStage.scrollLeft = 0;
  updatePlayer();
  if (state.worldMode === 'cottage') {
    updateNearby();
    return;
  }
  renderTerrain();
  const registry = worldFrameRegistry || refreshWorldFrameRegistry();
  registry.worldObjects.forEach((node) => {
    const target = objectTargets[node.dataset.object];
    if (target) placeWorldNode(node, target.wx, target.wy);
  });
  registry.mediaScreens.forEach((node) => {
    const video = registry.videosById.get(node.dataset.videoId);
    const upload = registry.uploadsById.get(node.dataset.pendingUploadId);
    const item = video || upload;
    if (!item) return;
    const { visible } = placeWorldNode(node, item.wx, item.wy);
    if (video) trackVisibility(video, visible, Math.hypot(state.wx - video.wx, state.wy - video.wy));
  });
  registry.creations.forEach((node) => {
    const note = registry.notesById.get(node.dataset.creationId);
    if (note) placeWorldNode(node, note.wx, note.wy);
  });
  registry.gatherables.forEach((node) => {
    const item = registry.gatherablesById.get(node.dataset.resourceId);
    if (item) placeWorldNode(node, item.wx, item.wy);
  });
  registry.tagPlants.forEach(({ plant, node }) => {
    if (node) placeWorldNode(node, plant.wx, plant.wy);
  });
  registry.bidPlants.forEach((node) => {
    const video = registry.videosById.get(node.dataset.bid);
    if (video) placeWorldNode(node, video.wx + 74, video.wy + 34);
  });
  const bottle = registry.bottle;
  if (bottle && state.bottleState?.open === false) placeWorldNode(bottle, state.bottleState.wx, state.bottleState.wy);
  registry.lamps.forEach((node) => {
    const lamp = { 'lamp-1': [-220, -320], 'lamp-2': [640, -620], 'lamp-3': [1900, -320] }[node.dataset.lamp];
    if (lamp) placeWorldNode(node, lamp[0], lamp[1]);
  });
  registry.nameless.forEach(({ region, node }) => {
    if (node) placeWorldNode(node, region.x, region.y);
  });
  registry.auras.forEach((node) => {
    const video = registry.videosById.get(node.dataset.videoId);
    if (video) placeWorldNode(node, video.wx, video.wy + 10);
  });
  updateWalkTargetMarker();
  if (now - lastWorldContextUpdateAt >= WORLD_CONTEXT_INTERVAL_MS) {
    lastWorldContextUpdateAt = now;
    updateNearby();
    updateWayfinder();
  }
}
