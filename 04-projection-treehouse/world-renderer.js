function refreshWorldViewportMetrics() {
  const width = worldShell.clientWidth;
  const height = worldShell.clientHeight;
  if (width !== worldViewportMetrics.width || height !== worldViewportMetrics.height) {
    worldViewportMetrics = { width, height, centerX: width / 2, anchorY: height * .52 };
  }
  return worldViewportMetrics;
}

function worldToScreen(wx, wy) {
  const viewport = worldViewportMetrics.width ? worldViewportMetrics : refreshWorldViewportMetrics();
  return {
    x: viewport.centerX + wx - state.wx,
    y: viewport.anchorY + wy - state.wy,
  };
}

function placeWorldNode(node, wx, wy) {
  const layoutDx = Number(node.dataset.layoutDx || 0);
  const layoutDy = Number(node.dataset.layoutDy || 0);
  const point = worldToScreen(wx + layoutDx, wy + layoutDy);
  const viewport = worldViewportMetrics;
  const visible = point.x > -WORLD_NODE_OVERSCAN_X
    && point.x < viewport.width + WORLD_NODE_OVERSCAN_X
    && point.y > -WORLD_NODE_OVERSCAN_Y
    && point.y < viewport.height + WORLD_NODE_OVERSCAN_Y;
  if (!visible) {
    if (node.dataset.visible !== '') {
      node.style.visibility = 'hidden';
      node.dataset.visible = '';
    }
    return { point, visible };
  }
  let size = worldNodeSizeCache.get(node);
  if (!size) {
    const rect = node.getBoundingClientRect();
    size = { width: rect.width || node.offsetWidth || 0, height: rect.height || node.offsetHeight || 0 };
    worldNodeSizeCache.set(node, size);
  }
  const transform = `translate3d(${(point.x - size.width / 2).toFixed(2)}px, ${(point.y - size.height / 2).toFixed(2)}px, 0)`;
  if (node.dataset.worldTransform !== transform) {
    node.style.transform = transform;
    node.dataset.worldTransform = transform;
  }
  if (node.dataset.visible !== '1') {
    node.style.visibility = 'visible';
    node.dataset.visible = '1';
  }
  return { point, visible };
}

function hideWorldNode(node) {
  if (node.dataset.visible !== '') {
    node.style.visibility = 'hidden';
    node.dataset.visible = '';
  }
}

// 区域事件只在玩家当前区域出现；动态地点和 NPC 仍按普通世界坐标显示。
// 三类节点共用这一条逐帧定位链，避免角色移动时节点停在屏幕上、随后突然跳位。
function placeContextWorldNode(node) {
  const wx = Number(node.dataset.wx);
  const wy = Number(node.dataset.wy);
  if (!Number.isFinite(wx) || !Number.isFinite(wy)) {
    hideWorldNode(node);
    return { point: null, visible: false };
  }
  if (node.matches('[data-zone-event]') && node.dataset.zoneEvent !== zoneAt(state.wx, state.wy).id) {
    hideWorldNode(node);
    return { point: worldToScreen(wx, wy), visible: false };
  }
  return placeWorldNode(node, wx, wy);
}

function renderTerrainBands(fragment) {
  const viewport = worldViewportMetrics;
  const padX = viewport.centerX + TERRAIN_OVERSCAN_X;
  const padY = viewport.height / 2 + TERRAIN_OVERSCAN_Y;
  const minX = state.wx - padX;
  const maxX = state.wx + padX;
  const minY = state.wy - padY;
  const maxY = state.wy + padY;
  const bands = [];
  const addBand = (cls, x1, y1, x2, y2) => {
    if (x2 <= x1 || y2 <= y1) return;
    bands.push({ cls, x: x1, y: y1, w: x2 - x1, h: y2 - y1 });
  };
  addBand('is-hill', minX, minY, maxX, Math.min(maxY, -1300));
  const inlandTop = Math.max(minY, -1300);
  const inlandBottom = Math.min(maxY, 300);
  addBand('is-forest', minX, inlandTop, Math.min(maxX, -1800), inlandBottom);
  addBand('is-street', Math.max(minX, 1400), inlandTop, maxX, inlandBottom);
  addBand('is-shore', minX, Math.max(minY, 300), maxX, Math.min(maxY, 900));
  addBand('is-sea', minX, Math.max(minY, 900), maxX, maxY);
  bands.forEach((band) => {
    const a = worldToScreen(band.x, band.y);
    const b = worldToScreen(band.x + band.w, band.y + band.h);
    if (b.x < -TERRAIN_OVERSCAN_X || a.x > viewport.width + TERRAIN_OVERSCAN_X || b.y < -TERRAIN_OVERSCAN_Y || a.y > viewport.height + TERRAIN_OVERSCAN_Y) return;
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
  const viewport = worldViewportMetrics;
  WORLD_OBSTACLES.forEach((obstacle) => {
    const a = worldToScreen(obstacle.from[0], obstacle.from[1]);
    const b = worldToScreen(obstacle.to[0], obstacle.to[1]);
    const minX = Math.min(a.x, b.x);
    const maxX = Math.max(a.x, b.x);
    const minY = Math.min(a.y, b.y);
    const maxY = Math.max(a.y, b.y);
    if (maxX < -TERRAIN_OVERSCAN_X || minX > viewport.width + TERRAIN_OVERSCAN_X || maxY < -TERRAIN_OVERSCAN_Y || minY > viewport.height + TERRAIN_OVERSCAN_Y) return;
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
    if (point.x < -TERRAIN_OVERSCAN_X || point.x > viewport.width + TERRAIN_OVERSCAN_X || point.y < -TERRAIN_OVERSCAN_Y || point.y > viewport.height + TERRAIN_OVERSCAN_Y) return;
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
  const viewport = worldViewportMetrics;
  WORLD_TRAILS.forEach((trail) => {
    const a = worldToScreen(trail.from[0], trail.from[1]);
    const b = worldToScreen(trail.to[0], trail.to[1]);
    const minX = Math.min(a.x, b.x);
    const maxX = Math.max(a.x, b.x);
    const minY = Math.min(a.y, b.y);
    const maxY = Math.max(a.y, b.y);
    if (maxX < -TERRAIN_OVERSCAN_X || minX > viewport.width + TERRAIN_OVERSCAN_X || maxY < -TERRAIN_OVERSCAN_Y || minY > viewport.height + TERRAIN_OVERSCAN_Y) return;
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
    if (point.x < -TERRAIN_OVERSCAN_X || point.x > viewport.width + TERRAIN_OVERSCAN_X || point.y < -TERRAIN_OVERSCAN_Y || point.y > viewport.height + TERRAIN_OVERSCAN_Y) return;
    const node = document.createElement('span');
    node.className = `world-scenery scenery-${scenery.type}`;
    node.innerHTML = '<i></i><i></i><i></i>';
    node.style.left = `${Math.round(point.x)}px`;
    node.style.top = `${Math.round(point.y)}px`;
    fragment.append(node);
  });
  WORLD_REGION_MARKERS.forEach((marker) => {
    const point = worldToScreen(marker.wx, marker.wy);
    if (point.x < -TERRAIN_OVERSCAN_X || point.x > viewport.width + TERRAIN_OVERSCAN_X || point.y < -TERRAIN_OVERSCAN_Y || point.y > viewport.height + TERRAIN_OVERSCAN_Y) return;
    const node = document.createElement('span');
    node.className = `world-region-marker region-${marker.zone}`;
    node.innerHTML = `<small>${marker.eyebrow}</small><b>${marker.title}</b><em>${marker.note}</em>`;
    node.style.left = `${Math.round(point.x)}px`;
    node.style.top = `${Math.round(point.y)}px`;
    fragment.append(node);
  });
}

function ensureTerrainLayers() {
  if (terrainLayers?.staticLayer.isConnected && terrainLayers.chunkLayer.isConnected) return terrainLayers;
  const staticLayer = document.createElement('div');
  staticLayer.className = 'terrain-static-layer';
  const chunkLayer = document.createElement('div');
  chunkLayer.className = 'terrain-chunk-layer';
  terrainLayer.replaceChildren(staticLayer, chunkLayer);
  terrainLayers = { staticLayer, chunkLayer };
  return terrainLayers;
}

function createTerrainChunk(cx, cy, chunkW, chunkH) {
  const node = document.createElement('span');
  node.className = 'terrain-chunk';
  node.dataset.chunkKey = `${cx}:${cy}`;
  node.style.width = `${chunkW}px`;
  node.style.height = `${chunkH}px`;
  const centerZone = zoneAt(cx * chunkW, cy * chunkH);
  if (centerZone.id === 'sea') return node;
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
    const localX = 70 + hash2d(cx, cy, 50 + i) * (chunkW - 140);
    const localY = 60 + hash2d(cx, cy, 70 + i) * (chunkH - 120);
    mark.style.left = `${Math.round(localX)}px`;
    mark.style.top = `${Math.round(localY)}px`;
    if (!mark.classList.contains('is-shell')) mark.style.transform = `translate(-50%, -50%) rotate(${Math.round(hash2d(cx, cy, 90 + i) * 14 - 7)}deg)`;
    node.append(mark);
  }
  return node;
}

function pruneTerrainChunkCache(activeKeys) {
  if (terrainChunkCache.size <= TERRAIN_CHUNK_CACHE_LIMIT) return;
  const disposable = [...terrainChunkCache.entries()]
    .filter(([key]) => !activeKeys.has(key))
    .sort((a, b) => a[1].lastUsed - b[1].lastUsed);
  while (terrainChunkCache.size > TERRAIN_CHUNK_CACHE_LIMIT && disposable.length) {
    const [key, entry] = disposable.shift();
    entry.node.remove();
    terrainChunkCache.delete(key);
  }
}

function rebuildTerrain() {
  const startedAt = performance.now();
  terrainRenderPending = false;
  terrainRenderHandle = null;
  if (state.worldMode === 'cottage') return;
  const viewport = refreshWorldViewportMetrics();
  const { staticLayer, chunkLayer } = ensureTerrainLayers();
  const staticFragment = document.createDocumentFragment();
  renderTerrainBands(staticFragment);
  renderWorldConnections(staticFragment);
  staticLayer.replaceChildren(staticFragment);
  const chunkW = 640;
  const chunkH = 480;
  const minX = Math.floor((state.wx - viewport.width / 2 - TERRAIN_OVERSCAN_X) / chunkW);
  const maxX = Math.floor((state.wx + viewport.width / 2 + TERRAIN_OVERSCAN_X) / chunkW);
  const minY = Math.floor((state.wy - viewport.height / 2 - TERRAIN_OVERSCAN_Y) / chunkH);
  const maxY = Math.floor((state.wy + viewport.height / 2 + TERRAIN_OVERSCAN_Y) / chunkH);
  const activeKeys = new Set();
  let created = 0;
  let reused = 0;
  for (let cy = minY; cy <= maxY; cy += 1) {
    for (let cx = minX; cx <= maxX; cx += 1) {
      const key = `${cx}:${cy}`;
      activeKeys.add(key);
      let entry = terrainChunkCache.get(key);
      if (!entry) {
        entry = { node: createTerrainChunk(cx, cy, chunkW, chunkH), lastUsed: 0 };
        terrainChunkCache.set(key, entry);
        created += 1;
      } else {
        reused += 1;
      }
      entry.lastUsed = ++terrainChunkUseClock;
      const point = worldToScreen(cx * chunkW, cy * chunkH);
      entry.node.style.left = `${Math.round(point.x)}px`;
      entry.node.style.top = `${Math.round(point.y)}px`;
      if (entry.node.parentNode !== chunkLayer) chunkLayer.append(entry.node);
    }
  }
  [...chunkLayer.children].forEach((node) => {
    if (!activeKeys.has(node.dataset.chunkKey)) node.remove();
  });
  pruneTerrainChunkCache(activeKeys);
  terrainLayer.style.transform = 'translate3d(0, 0, 0)';
  terrainLayer.dataset.renderVersion = String(++terrainRenderVersion);
  terrainLayer.dataset.activeChunks = String(activeKeys.size);
  terrainLayer.dataset.cachedChunks = String(terrainChunkCache.size);
  terrainLayer.dataset.createdChunks = String(created);
  terrainLayer.dataset.reusedChunks = String(reused);
  terrainLayer.dataset.rebuildMs = (performance.now() - startedAt).toFixed(2);
  terrainRenderOrigin = { wx: state.wx, wy: state.wy, width: viewport.width, height: viewport.height };
}

function cancelTerrainRebuild() {
  if (terrainRenderHandle == null) return;
  cancelAnimationFrame(terrainRenderHandle);
  terrainRenderHandle = null;
  terrainRenderPending = false;
}

function scheduleTerrainRebuild() {
  if (terrainRenderPending) return;
  terrainRenderPending = true;
  terrainRenderHandle = requestAnimationFrame(() => rebuildTerrain());
}

function renderTerrain() {
  if (state.worldMode === 'cottage') {
    cancelTerrainRebuild();
    if (terrainLayer.childElementCount) terrainLayer.replaceChildren();
    terrainLayers = null;
    terrainLayer.style.transform = '';
    terrainRenderOrigin = null;
    return;
  }
  const viewport = refreshWorldViewportMetrics();
  if (!terrainRenderOrigin) {
    rebuildTerrain();
    return;
  }
  const sameViewport = terrainRenderOrigin.width === viewport.width && terrainRenderOrigin.height === viewport.height;
  const withinBuffer = sameViewport
    && Math.abs(state.wx - terrainRenderOrigin.wx) < TERRAIN_OVERSCAN_X * .5
    && Math.abs(state.wy - terrainRenderOrigin.wy) < TERRAIN_OVERSCAN_Y * .5;
  terrainLayer.style.transform = `translate3d(${(terrainRenderOrigin.wx - state.wx).toFixed(2)}px, ${(terrainRenderOrigin.wy - state.wy).toFixed(2)}px, 0)`;
  if (!withinBuffer) scheduleTerrainRebuild();
}

function resourceTypeFor(zoneId, roll) {
  if (zoneId === 'forest') return roll > .7 ? 'stump' : roll > .28 ? 'branch' : 'grass';
  if (zoneId === 'hill') return roll > .42 ? 'stone' : 'grass';
  if (zoneId === 'shore' || zoneId === 'sea') return 'shell';
  if (zoneId === 'street') return roll > .65 ? 'stone' : 'grass';
  return roll > .72 ? 'branch' : roll > .35 ? 'grass' : 'stone';
}

function generateNearbyGatherables() {
  const viewport = refreshWorldViewportMetrics();
  const chunkW = 520;
  const chunkH = 400;
  const minX = Math.floor((state.wx - viewport.width / 2 - WORLD_NODE_OVERSCAN_X) / chunkW);
  const maxX = Math.floor((state.wx + viewport.width / 2 + WORLD_NODE_OVERSCAN_X) / chunkW);
  const minY = Math.floor((state.wy - viewport.height / 2 - WORLD_NODE_OVERSCAN_Y) / chunkH);
  const maxY = Math.floor((state.wy + viewport.height / 2 + WORLD_NODE_OVERSCAN_Y) / chunkH);
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
    const nearViewport = Math.abs(starter.wx - state.wx) < viewport.width / 2 + WORLD_NODE_OVERSCAN_X
      && Math.abs(starter.wy - state.wy) < viewport.height / 2 + WORLD_NODE_OVERSCAN_Y;
    if (nearViewport && state.homestead.day - gatheredDay >= RESOURCE_RESPAWN_DAYS) resources.push({ ...starter, zone: zoneAt(starter.wx, starter.wy).id, ...RESOURCE_META[starter.type] });
  });
  return resources;
}

function gatherRenderKeyForPosition() {
  return `${Math.floor(state.wx / 520)}:${Math.floor(state.wy / 400)}:${state.homestead.day}`;
}

function renderGatherables({ positionNodes = true } = {}) {
  if (state.worldMode === 'cottage') {
    state.activeGatherables = [];
    state.gatherRenderKey = '';
    resourceLayer.replaceChildren();
    return;
  }
  const renderKey = gatherRenderKeyForPosition();
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
          label: item.label,
          onArrival: () => gatherResource(item),
        });
      });
      fragment.append(button);
    });
    resourceLayer.replaceChildren(fragment);
    worldFrameRegistry = null;
  }
  if (!positionNodes) return;
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
      approachWorldInteraction(button, {
        wx: video.wx,
        wy: video.wy,
        offsetY: 68,
        source: `video:${video.id}`,
        label: video.title,
        onArrival: () => {
          state.nearest = { type: 'video', id: video.id, video, distance: 0 };
          showVideo(video);
        },
      });
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
    const isCommerce = note.type === 'commerce';
    button.className = `player-creation is-note is-${isCommerce ? 'commerce' : 'personal'}${responseCount ? ' has-responses' : ''}${note.status === 'closed' ? ' is-closed' : ''}`;
    const art = document.createElement('span');
    art.className = 'demand-art';
    art.setAttribute('aria-hidden', 'true');
    art.innerHTML = '<i class="demand-thread"></i><i class="demand-paper"></i><i class="demand-glyph"></i><i class="demand-post"></i>';
    button.append(art);
    const label = document.createElement('span');
    label.className = 'creation-label';
    label.textContent = `${note.title}${note.status === 'closed' ? ' · 已关闭' : ''}`;
    button.append(label);
    const meta = document.createElement('small');
    meta.className = 'creation-meta';
    meta.textContent = `${isCommerce ? '商业需求' : '个人需求'}${responseCount ? ` · ${responseCount} 回应` : ''}`;
    button.append(meta);
    button.dataset.creationId = note.id;
    button.setAttribute('aria-label', `${isCommerce ? '商业' : '个人'}需求：${note.title}${responseCount ? `，已有 ${responseCount} 条回应` : ''}`);
    button.addEventListener('click', (event) => {
      event.stopPropagation();
      approachWorldInteraction(button, {
        wx: note.wx,
        wy: note.wy,
        offsetY: 72,
        source: `demand:${note.id}`,
        label: note.title,
        onArrival: () => {
          state.nearest = { type: 'note', id: note.id, note, distance: 0 };
          showNoteDetail(note);
        },
      });
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
      node.type = 'button';
      node.dataset.tagPlant = index;
      node.dataset.tag = plant.tag;
      node.setAttribute('aria-label', `采下标签：${plant.tag}`);
      node.addEventListener('click', (event) => {
        event.stopPropagation();
        approachWorldInteraction(node, {
          wx: plant.wx,
          wy: plant.wy,
          offsetY: 58,
          arrivalDistance: 72,
          stopDistance: 6,
          source: `tag-plant:${plant.tag}`,
          label: `标签植物：${plant.tag}`,
          onArrival: () => pluckTagPlant(index),
        });
      });
      decoLayer.append(node);
    }
    placeWorldNode(node, plant.wx, plant.wy);
  });
  const liveLooseTagIds = new Set();
  publicLooseTags().forEach((tag) => {
    liveLooseTagIds.add(tag.id);
    let node = $(`[data-loose-tag="${CSS.escape(tag.id)}"]`, decoLayer);
    if (!node) {
      node = document.createElement('button');
      node.type = 'button';
      node.className = 'loose-tag-marker';
      node.dataset.looseTag = tag.id;
      node.addEventListener('click', (event) => {
        event.stopPropagation();
        const current = publicLooseTags().find((item) => item.id === node.dataset.looseTag);
        if (!current) return;
        approachWorldInteraction(node, {
          wx: current.wx,
          wy: current.wy,
          arrivalDistance: 72,
          stopDistance: 6,
          source: `loose-tag:${current.id}`,
          label: `旅人标签：${current.tag}`,
          onArrival: () => collectLooseTag(publicLooseTags().find((item) => item.id === node.dataset.looseTag)),
        });
      });
      decoLayer.append(node);
    }
    node.dataset.tag = tag.tag;
    node.setAttribute('aria-label', `捡一枚标签副本：${tag.tag}`);
    node.innerHTML = `<span aria-hidden="true"><i></i></span><small>${escapeHtml(tag.tag)}</small>`;
    placeWorldNode(node, tag.wx, tag.wy);
  });
  $$('[data-loose-tag]', decoLayer).forEach((node) => { if (!liveLooseTagIds.has(node.dataset.looseTag)) node.remove(); });

  WORLD_STICKERS.forEach((sticker) => {
    const existing = $(`[data-world-sticker="${sticker.id}"]`, decoLayer);
    if (state.stickers.includes(sticker.id)) return existing?.remove();
    let node = existing;
    if (!node) {
      node = document.createElement('button');
      node.type = 'button';
      node.className = `world-sticker sticker-${sticker.kind}`;
      node.dataset.worldSticker = sticker.id;
      node.innerHTML = '<span aria-hidden="true"><i></i></span>';
      node.addEventListener('click', (event) => {
        event.stopPropagation();
        approachWorldInteraction(node, {
          wx: sticker.wx,
          wy: sticker.wy,
          arrivalDistance: 72,
          stopDistance: 6,
          source: `sticker:${sticker.id}`,
          label: `贴纸：${sticker.label}`,
          onArrival: () => collectWorldSticker(sticker),
        });
      });
      decoLayer.append(node);
    }
    node.setAttribute('aria-label', `收集贴纸：${sticker.label}`);
    placeWorldNode(node, sticker.wx, sticker.wy);
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
      bottle = document.createElement('button');
      bottle.type = 'button';
      bottle.className = 'deco bottle';
      bottle.title = '漂流瓶';
      bottle.setAttribute('aria-label', '捞起漂流瓶');
      bottle.addEventListener('click', (event) => {
        event.stopPropagation();
        approachWorldInteraction(bottle, {
          wx: state.bottleState.wx,
          wy: state.bottleState.wy,
          offsetY: 58,
          arrivalDistance: 72,
          stopDistance: 6,
          source: 'bottle',
          label: '漂流瓶',
          onArrival: () => openBottle(),
        });
      });
      decoLayer.append(bottle);
    }
    placeWorldNode(bottle, state.bottleState.wx, state.bottleState.wy);
  }
}

function lampMarkup(id, wx, wy) {
  const lamp = document.createElement('button');
  lamp.type = 'button';
  lamp.className = 'deco lamp is-clickable';
  lamp.dataset.lamp = id;
  lamp.innerHTML = '<span class="lamp-head"></span><span class="lamp-post"></span>';
  lamp.title = '可以开关的灯';
  lamp.setAttribute('aria-label', '开关路灯');
  lamp.addEventListener('click', (event) => {
    event.stopPropagation();
    lamp.classList.toggle('is-on');
    logEvent('play_only_lamp', { lamp_id: id, on: lamp.classList.contains('is-on') });
    showToast(lamp.classList.contains('is-on') ? '灯亮了，附近亮了一点' : '灯熄了，影子又回来了');
  });
  decoLayer.append(lamp);
  placeWorldNode(lamp, wx, wy);
}

const AMBIENT_CRITTERS = [
  { id: 'squirrel', kind: 'squirrel', label: '搬松果的小松鼠', from: [-1260, -460], to: [-520, -330], period: 11500, phase: .2 },
  { id: 'duck', kind: 'duck', label: '沿潮线散步的小鸭', from: [-520, 650], to: [340, 760], period: 14800, phase: 1.7 },
  { id: 'hedgehog', kind: 'hedgehog', label: '夜里巡路的小刺猬', from: [520, -980], to: [1280, -820], period: 17200, phase: 3.1 },
];

const ambientLifeNodes = {
  critters: new Map(),
  devices: [],
  gulls: [],
  cat: null,
  catLastUpdateAt: 0,
};

function ambientCritterMarkup(spec) {
  return `<span class="critter-shape" aria-hidden="true"><i></i><i></i><i></i></span><small>${spec.label}</small>`;
}

function renderAmbientLife() {
  AMBIENT_CRITTERS.forEach((spec) => {
    if ($(`[data-critter="${spec.id}"]`, decoLayer)) return;
    const critter = document.createElement('button');
    critter.type = 'button';
    critter.className = `deco is-clickable ambient-critter critter-${spec.kind}`;
    critter.dataset.critter = spec.id;
    critter.style.transition = 'transform 110ms linear';
    critter.setAttribute('aria-label', `${spec.label}，点击打招呼`);
    critter.innerHTML = ambientCritterMarkup(spec);
    critter.addEventListener('click', (event) => {
      event.stopPropagation();
      critter.classList.remove('is-greeted');
      requestAnimationFrame(() => critter.classList.add('is-greeted'));
      logEvent('ambient_critter_greet', { critter_id: spec.id, zone_id: currentZoneName() });
      const messages = {
        squirrel: '松鼠把松果抱紧了一点，停下来朝你看。',
        duck: '小鸭绕着你走了半圈，留下一串轻轻的脚印。',
        hedgehog: '小刺猬抬起鼻尖，确认你不是一块会动的石头。',
      };
      showToast(messages[spec.id]);
    });
    decoLayer.append(critter);
    ambientLifeNodes.critters.set(spec.id, critter);
  });
  if (!$('#echoSpinner')) {
    const spinner = document.createElement('button');
    spinner.type = 'button';
    spinner.id = 'echoSpinner';
    spinner.className = 'deco is-clickable ambient-device echo-spinner is-playing';
    spinner.dataset.wx = '1120';
    spinner.dataset.wy = '-1120';
    spinner.setAttribute('aria-label', '回声风轮，点击可以让它停下或转动');
    spinner.innerHTML = '<span class="spinner-wheel" aria-hidden="true"><i></i><i></i><i></i><i></i></span><span class="spinner-post" aria-hidden="true"></span><small>回声风轮</small>';
    spinner.addEventListener('click', (event) => {
      event.stopPropagation();
      spinner.classList.toggle('is-playing');
      logEvent('ambient_device_toggle', { device_id: 'echo-spinner', active: spinner.classList.contains('is-playing') });
      showToast(spinner.classList.contains('is-playing') ? '风轮重新接住了山坡上的风。' : '风轮慢慢停下，四周安静了一点。');
    });
    decoLayer.append(spinner);
    ambientLifeNodes.devices.push(spinner);
  }
}

function renderStaticDecos() {
  if (decoLayer.dataset.built) return;
  decoLayer.dataset.built = '1';
  startAmbientLifeLoop();
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
    ambientLifeNodes.gulls.push(gull);
  });
  const cat = document.createElement('button');
  cat.type = 'button';
  cat.className = 'deco cat';
  cat.id = 'worldCat';
  cat.title = '镇上的猫';
  cat.setAttribute('aria-label', '摸摸镇上的猫');
  cat.addEventListener('click', (event) => {
    event.stopPropagation();
    logEvent('play_only_cat');
    showToast('猫叫了一小声，然后继续散步');
  });
  decoLayer.append(cat);
  ambientLifeNodes.cat = cat;
  renderAmbientLife();
}

function updateCat(now = performance.now()) {
  const cat = ambientLifeNodes.cat;
  if (!cat) return;
  if (!updateCat.target || now > updateCat.until) {
    updateCat.target = { wx: 140 + Math.random() * 720, wy: -420 + Math.random() * 480 };
    updateCat.until = now + 5000 + Math.random() * 4000;
  }
  updateCat.pos = updateCat.pos || { wx: 300, wy: -100 };
  const elapsed = ambientLifeNodes.catLastUpdateAt ? Math.min(50, now - ambientLifeNodes.catLastUpdateAt) : 16.67;
  ambientLifeNodes.catLastUpdateAt = now;
  const blend = 1 - Math.exp(-elapsed / 2200);
  updateCat.pos.wx += (updateCat.target.wx - updateCat.pos.wx) * blend;
  updateCat.pos.wy += (updateCat.target.wy - updateCat.pos.wy) * blend;
  placeWorldNode(cat, updateCat.pos.wx, updateCat.pos.wy);
}

function updateGulls(now = performance.now()) {
  ambientLifeNodes.gulls.forEach((gull, index) => {
    const base = index === 0 ? { wx: -300, wy: 1120 } : { wx: 900, wy: 1250 };
    const drift = Math.sin(now / 4000 + index * 2) * 60;
    placeWorldNode(gull, base.wx + drift, base.wy + index * 40);
  });
}

function updateAmbientCritters(now = performance.now()) {
  AMBIENT_CRITTERS.forEach((spec) => {
    const node = ambientLifeNodes.critters.get(spec.id);
    if (!node) return;
    const angle = (now / spec.period) * Math.PI * 2 + spec.phase;
    const progress = (Math.sin(angle) + 1) / 2;
    const wx = spec.from[0] + (spec.to[0] - spec.from[0]) * progress;
    const wy = spec.from[1] + (spec.to[1] - spec.from[1]) * progress + Math.sin(angle * 2) * 8;
    const facingLeft = Math.cos(angle) < 0;
    if ((node.dataset.facingLeft === '1') !== facingLeft) {
      node.dataset.facingLeft = facingLeft ? '1' : '0';
      node.classList.toggle('is-facing-left', facingLeft);
    }
    placeWorldNode(node, wx, wy);
  });
  ambientLifeNodes.devices.forEach((node) => placeWorldNode(node, Number(node.dataset.wx), Number(node.dataset.wy)));
}

function updateAmbientLife(now = performance.now(), force = false) {
  if (!force && now - lastAmbientUpdateAt < AMBIENT_UPDATE_INTERVAL_MS) return;
  lastAmbientUpdateAt = now;
  refreshWorldViewportMetrics();
  updateCat(now);
  updateGulls(now);
  updateAmbientCritters(now);
}

const ambientLifeLoop = { started: false, handle: null };

function startAmbientLifeLoop() {
  if (ambientLifeLoop.started) return;
  ambientLifeLoop.started = true;
  ambientLifeLoop.handle = setInterval(() => {
    if (state.worldMode === 'cottage' || !entry.classList.contains('is-gone') || !sheet.hidden) return;
    updateAmbientLife();
  }, 100);
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
        approachWorldInteraction(node, {
          wx: region.x,
          wy: region.y,
          offsetY: 58,
          arrivalDistance: 72,
          stopDistance: 6,
          source: `nameless:${region.id}`,
          label: state.namedZones[region.id] || '无名处',
          onArrival: () => showNameless(region),
        });
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
  refreshWorldViewportMetrics();
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
  if (typeof renderZoneEventMarkers === 'function') renderZoneEventMarkers();
  if (typeof renderDynamicLocations === 'function') renderDynamicLocations();
  if (typeof renderNpcStoryNodes === 'function') renderNpcStoryNodes();
  updateWalkTargetMarker();
  updateNearby();
  updateWayfinder();
  refreshWorldFrameRegistry();
}

const WORLD_LAYOUT_OFFSETS = [
  [0, 0], [0, -86], [92, -32], [-92, -32], [98, 58], [-98, 58], [0, 94], [132, -78], [-132, -78],
];

function worldLayoutOverlapScore(rect, placed) {
  return placed.reduce((score, other) => {
    const overlapX = Math.max(0, Math.min(rect.right, other.right) - Math.max(rect.left, other.left));
    const overlapY = Math.max(0, Math.min(rect.bottom, other.bottom) - Math.max(rect.top, other.top));
    return score + overlapX * overlapY;
  }, 0);
}

function updateWorldDeclutterLayout(registry) {
  const reserved = [
    ...WORLD_SCENERY.map((item) => ({ wx: item.wx, wy: item.wy, width: 176, height: 118 })),
    ...WORLD_REGION_MARKERS.map((item) => ({ wx: item.wx, wy: item.wy, width: 200, height: 92 })),
  ];
  const candidates = [
    ...registry.worldObjects.map((node) => {
      const item = objectTargets[node.dataset.object];
      return item && { node, wx: item.wx, wy: item.wy, width: 198, height: 150, fixed: true };
    }),
    ...registry.creations.map((node) => {
      const item = registry.notesById.get(node.dataset.creationId);
      return item && { node, wx: item.wx, wy: item.wy, width: 176, height: 136 };
    }),
    ...registry.mediaScreens.map((node) => {
      const item = registry.videosById.get(node.dataset.videoId) || registry.uploadsById.get(node.dataset.pendingUploadId);
      return item && { node, wx: item.wx, wy: item.wy, width: 178, height: 142 };
    }),
    ...registry.gatherables.map((node) => {
      const item = registry.gatherablesById.get(node.dataset.resourceId);
      return item && { node, wx: item.wx, wy: item.wy, width: 82, height: 88 };
    }),
    ...$$('[data-dynamic-location], [data-zone-event], [data-npc]', decoLayer).map((node) => ({
      node,
      wx: Number(node.dataset.wx),
      wy: Number(node.dataset.wy),
      width: node.matches('[data-dynamic-location]') ? 176 : 112,
      height: node.matches('[data-dynamic-location]') ? 132 : 112,
      context: true,
    })),
  ].filter(Boolean);
  const placed = reserved.map((item) => ({
    left: item.wx - item.width / 2 - 14,
    right: item.wx + item.width / 2 + 14,
    top: item.wy - item.height / 2 - 12,
    bottom: item.wy + item.height / 2 + 12,
  }));
  candidates.forEach((item) => {
    const offsets = item.fixed ? [[0, 0]] : WORLD_LAYOUT_OFFSETS;
    let selected = offsets[0];
    let selectedScore = Number.POSITIVE_INFINITY;
    offsets.some(([dx, dy]) => {
      const rect = {
        left: item.wx + dx - item.width / 2 - 12,
        right: item.wx + dx + item.width / 2 + 12,
        top: item.wy + dy - item.height / 2 - 10,
        bottom: item.wy + dy + item.height / 2 + 10,
      };
      const score = worldLayoutOverlapScore(rect, placed);
      if (score < selectedScore) {
        selected = [dx, dy];
        selectedScore = score;
      }
      if (score > 0) return false;
      placed.push(rect);
      return true;
    });
    if (selectedScore > 0) {
      const [dx, dy] = selected;
      placed.push({
        left: item.wx + dx - item.width / 2 - 12,
        right: item.wx + dx + item.width / 2 + 12,
        top: item.wy + dy - item.height / 2 - 10,
        bottom: item.wy + dy + item.height / 2 + 10,
      });
    }
    item.node.dataset.layoutDx = String(selected[0]);
    item.node.dataset.layoutDy = String(selected[1]);
    item.node.classList.toggle('is-decluttered', selected[0] !== 0 || selected[1] !== 0);
    if (item.context) placeContextWorldNode(item.node);
    else placeWorldNode(item.node, item.wx, item.wy);
  });
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
    tagPlants: [
      ...TAG_PLANTS.map((plant, index) => ({ plant, node: $(`[data-tag-plant="${index}"]`, decoLayer) })),
      ...publicLooseTags().map((plant) => ({ plant, node: $(`[data-loose-tag="${CSS.escape(plant.id)}"]`, decoLayer) })),
      ...WORLD_STICKERS.filter((plant) => !state.stickers.includes(plant.id)).map((plant) => ({ plant, node: $(`[data-world-sticker="${plant.id}"]`, decoLayer) })),
    ].filter((entry) => entry.node),
    bidPlants: $$('.bid-plant', decoLayer),
    lamps: $$('.deco.lamp', decoLayer),
    nameless: NAMELESS_REGIONS.map((region) => ({ region, node: $(`[data-nameless="${region.id}"]`, decoLayer) })).filter((entry) => entry.node),
    auras: $$('.aura', auraLayer),
    bottle: $('.bottle', decoLayer),
    contextNodes: $$('[data-dynamic-location], [data-zone-event], [data-npc]', decoLayer),
  };
  updateWorldDeclutterLayout(worldFrameRegistry);
  return worldFrameRegistry;
}

function updateWorldMovementFrame(now = performance.now()) {
  worldStage.scrollTop = 0;
  worldStage.scrollLeft = 0;
  refreshWorldViewportMetrics();
  updatePlayer();
  if (state.worldMode === 'cottage') {
    updateNearby();
    return;
  }
  renderTerrain();
  if (state.gatherRenderKey !== gatherRenderKeyForPosition()) renderGatherables({ positionNodes: false });
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
  registry.contextNodes.forEach((node) => placeContextWorldNode(node));
  updateWalkTargetMarker();
  if (now - lastWorldContextUpdateAt >= WORLD_CONTEXT_INTERVAL_MS) {
    lastWorldContextUpdateAt = now;
    updateNearby();
    updateWayfinder();
  }
}
