function pointSegmentDistance(x, y, obstacle) {
  const [ax, ay] = obstacle.from;
  const [bx, by] = obstacle.to;
  const abx = bx - ax;
  const aby = by - ay;
  const lengthSquared = abx * abx + aby * aby;
  const t = lengthSquared ? Math.max(0, Math.min(1, ((x - ax) * abx + (y - ay) * aby) / lengthSquared)) : 0;
  return Math.hypot(x - (ax + abx * t), y - (ay + aby * t));
}

function obstacleAt(x, y, padding = PLAYER_COLLISION_RADIUS) {
  return WORLD_OBSTACLES.find((obstacle) => pointSegmentDistance(x, y, obstacle) < obstacle.radius + padding) || null;
}

function walkSegmentIsClear(fromX, fromY, toX, toY) {
  const distance = Math.hypot(toX - fromX, toY - fromY);
  const samples = Math.max(2, Math.ceil(distance / 18));
  for (let sample = 1; sample <= samples; sample += 1) {
    const ratio = sample / samples;
    if (obstacleAt(fromX + (toX - fromX) * ratio, fromY + (toY - fromY) * ratio)) return false;
  }
  return true;
}

function nearestWalkablePoint(x, y) {
  if (!obstacleAt(x, y)) return { x, y };
  for (let ring = 1; ring <= 6; ring += 1) {
    const radius = ring * PATH_GRID_SIZE;
    for (let index = 0; index < 16; index += 1) {
      const angle = index / 16 * Math.PI * 2;
      const candidate = { x: x + Math.cos(angle) * radius, y: y + Math.sin(angle) * radius };
      if (!obstacleAt(candidate.x, candidate.y)) return candidate;
    }
  }
  return null;
}

function simplifyPath(points) {
  if (points.length < 3) return points;
  const result = [points[0]];
  let anchorIndex = 0;
  for (let index = 2; index < points.length; index += 1) {
    const anchor = points[anchorIndex];
    const candidate = points[index];
    if (!walkSegmentIsClear(anchor.x, anchor.y, candidate.x, candidate.y)) {
      result.push(points[index - 1]);
      anchorIndex = index - 1;
    }
  }
  result.push(points.at(-1));
  return result;
}

function findWalkPath(startX, startY, destinationX, destinationY) {
  const destination = nearestWalkablePoint(destinationX, destinationY);
  if (!destination) return null;
  const margin = 640;
  const minX = Math.floor((Math.min(startX, destination.x) - margin) / PATH_GRID_SIZE) * PATH_GRID_SIZE;
  const maxX = Math.ceil((Math.max(startX, destination.x) + margin) / PATH_GRID_SIZE) * PATH_GRID_SIZE;
  const minY = Math.floor((Math.min(startY, destination.y) - margin) / PATH_GRID_SIZE) * PATH_GRID_SIZE;
  const maxY = Math.ceil((Math.max(startY, destination.y) + margin) / PATH_GRID_SIZE) * PATH_GRID_SIZE;
  const cols = Math.round((maxX - minX) / PATH_GRID_SIZE) + 1;
  const rows = Math.round((maxY - minY) / PATH_GRID_SIZE) + 1;
  const cell = (x, y) => ({
    col: Math.max(0, Math.min(cols - 1, Math.round((x - minX) / PATH_GRID_SIZE))),
    row: Math.max(0, Math.min(rows - 1, Math.round((y - minY) / PATH_GRID_SIZE))),
  });
  const start = cell(startX, startY);
  const goal = cell(destination.x, destination.y);
  const key = (col, row) => `${col}:${row}`;
  const point = (col, row) => ({ x: minX + col * PATH_GRID_SIZE, y: minY + row * PATH_GRID_SIZE });
  const open = [{ ...start, score: 0 }];
  const openKeys = new Set([key(start.col, start.row)]);
  const cameFrom = new Map();
  const gScore = new Map([[key(start.col, start.row), 0]]);
  const directions = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];
  let visited = 0;
  while (open.length && visited < 12000) {
    open.sort((a, b) => a.score - b.score);
    const current = open.shift();
    const currentKey = key(current.col, current.row);
    openKeys.delete(currentKey);
    visited += 1;
    if (current.col === goal.col && current.row === goal.row) {
      const cells = [current];
      let trace = currentKey;
      while (cameFrom.has(trace)) {
        const previous = cameFrom.get(trace);
        cells.push(previous);
        trace = key(previous.col, previous.row);
      }
      cells.reverse();
      return simplifyPath([{ x: startX, y: startY }, ...cells.slice(1, -1).map((entry) => point(entry.col, entry.row)), destination]);
    }
    directions.forEach(([dc, dr]) => {
      const col = current.col + dc;
      const row = current.row + dr;
      if (col < 0 || col >= cols || row < 0 || row >= rows) return;
      const candidate = point(col, row);
      if (obstacleAt(candidate.x, candidate.y)) return;
      const currentPoint = point(current.col, current.row);
      if (!walkSegmentIsClear(currentPoint.x, currentPoint.y, candidate.x, candidate.y)) return;
      const neighborKey = key(col, row);
      const tentative = (gScore.get(currentKey) || 0) + (dc && dr ? 1.414 : 1);
      if (tentative >= (gScore.get(neighborKey) ?? Infinity)) return;
      cameFrom.set(neighborKey, current);
      gScore.set(neighborKey, tentative);
      const heuristic = Math.hypot(goal.col - col, goal.row - row);
      const entry = { col, row, score: tentative + heuristic };
      if (!openKeys.has(neighborKey)) {
        open.push(entry);
        openKeys.add(neighborKey);
      } else {
        const existing = open.find((item) => item.col === col && item.row === row);
        if (existing) existing.score = entry.score;
      }
    });
  }
  return null;
}

function updateWalkTargetMarker() {
  if (!pointerMoveTarget) {
    walkTarget.hidden = true;
    return;
  }
  const destination = pointerMoveTarget.destination || pointerMoveTarget;
  const point = pointerMoveTarget.mode === 'cottage'
    ? { x: worldStage.clientWidth * destination.x / 100, y: worldStage.clientHeight * destination.y / 100 }
    : worldToScreen(destination.x, destination.y);
  walkTarget.style.left = `${Math.round(point.x)}px`;
  walkTarget.style.top = `${Math.round(point.y)}px`;
  walkTarget.hidden = false;
}

function cancelPointerMove(reason = 'cancelled', savePosition = false) {
  if (!pointerMoveTarget) return false;
  const previous = pointerMoveTarget;
  pointerMoveTarget = null;
  delete worldStage.dataset.pointerMoveTarget;
  walkTarget.hidden = true;
  player.classList.remove('is-moving');
  hideContextHint('interaction');
  if (previous.mode === 'overworld') flushMovementSample(reason);
  if (savePosition) persist();
  updateNearby();
  return true;
}

function startPointerMove(mode, x, y, options = {}) {
  if (!Number.isFinite(x) || !Number.isFinite(y) || mode !== state.worldMode) return false;
  startFrameLoop();
  cancelPointerMove('pointer_retarget');
  state.keys.clear();
  if (mode === 'overworld') resetMovementSample();
  const path = mode === 'overworld' ? findWalkPath(state.wx, state.wy, x, y) : [{ x, y }];
  if (!path?.length) {
    showToast('这里暂时走不过去，换个落点试试');
    logEvent('move_click_blocked', { mode, source: options.source || 'ground', target_x: Math.round(x), target_y: Math.round(y) });
    return false;
  }
  const destination = path.at(-1);
  pointerMoveTarget = {
    mode,
    x: mode === 'cottage' ? Math.max(6, Math.min(94, destination.x)) : destination.x,
    y: mode === 'cottage' ? Math.max(30, Math.min(88, destination.y)) : destination.y,
    destination,
    waypoints: mode === 'overworld' ? path.slice(1) : [],
    source: options.source || 'ground',
    label: options.label || '',
    onArrival: typeof options.onArrival === 'function' ? options.onArrival : null,
    stopDistance: Math.max(0, Number(options.stopDistance) || 0),
    startedAt: Date.now(),
    replans: 0,
  };
  if (pointerMoveTarget.source === 'ground') hideContextHint();
  else if (pointerMoveTarget.label) {
    showContextHint(`正在前往「${escapeHtml(pointerMoveTarget.label)}」`, { mode: 'interaction', duration: 2600, userInitiated: true });
  }
  if (pointerMoveTarget.waypoints.length) advancePointerWaypoint(pointerMoveTarget);
  cottageExit.classList.remove('is-entering');
  closeContextWheel();
  updateWalkTargetMarker();
  logEvent('move_click', {
    mode,
    source: pointerMoveTarget.source,
    target_x: Math.round(destination.x),
    target_y: Math.round(destination.y),
    waypoint_count: path.length,
  });
  return true;
}

function approachWorldInteraction(node, options = {}) {
  if (!node) return false;
  if (state.worldMode === 'cottage') exitCottage();
  const baseWx = Number(options.wx ?? node.dataset.wx);
  const baseWy = Number(options.wy ?? node.dataset.wy);
  if (!Number.isFinite(baseWx) || !Number.isFinite(baseWy)) return false;
  const targetX = baseWx + Number(options.offsetX || 0);
  const targetY = baseWy + Number(options.offsetY || 0);
  const arrivalDistance = Math.max(64, Number(options.arrivalDistance) || 116);
  const onArrival = typeof options.onArrival === 'function' ? options.onArrival : null;
  const label = options.label || node.dataset.label || node.getAttribute('aria-label') || '可互动地点';
  showContextHint(`已选择「${escapeHtml(label)}」`, { mode: 'interaction', duration: 2400, userInitiated: true });
  if (Math.hypot(state.wx - targetX, state.wy - targetY) <= arrivalDistance) {
    stopMovement(true);
    requestAnimationFrame(() => onArrival?.());
    return true;
  }
  return startPointerMove('overworld', targetX, targetY, {
    source: options.source || 'world-interaction',
    label,
    stopDistance: Math.max(4, Number(options.stopDistance) || 8),
    onArrival,
  });
}

function advancePointerWaypoint(target) {
  if (!target.waypoints.length) return false;
  const next = target.waypoints.shift();
  target.x = next.x;
  target.y = next.y;
  return true;
}

function replanPointerMove(target) {
  if (target.mode !== 'overworld' || target.replans >= 2) return false;
  const destination = target.destination;
  const path = findWalkPath(state.wx, state.wy, destination.x, destination.y);
  if (!path?.length) return false;
  target.replans += 1;
  target.waypoints = path.slice(1);
  target.x = destination.x;
  target.y = destination.y;
  if (target.waypoints.length) advancePointerWaypoint(target);
  return true;
}

function finishPointerMove(target) {
  if (!pointerMoveTarget || pointerMoveTarget !== target) return;
  const onArrival = target.onArrival;
  pointerMoveTarget = null;
  delete worldStage.dataset.pointerMoveTarget;
  walkTarget.hidden = true;
  player.classList.remove('is-moving');
  hideContextHint('interaction');
  if (target.mode === 'overworld') flushMovementSample('click_arrived');
  persist();
  logEvent('move_click_arrived', {
    mode: target.mode,
    source: target.source,
    duration_ms: Date.now() - target.startedAt,
  });
  if (onArrival) requestAnimationFrame(onArrival);
  else updateNearby();
}

let frameLoopRunning = false;
let frameHandle = null;

function frameLoopActive() {
  return state.keys.size > 0 || Boolean(pointerMoveTarget)
    || !sheet.hidden || !profileDrawer.hidden || !entry.classList.contains('is-gone')
    || Boolean(state.gathering);
}

function startFrameLoop() {
  if (frameLoopRunning) return;
  frameLoopRunning = true;
  performanceWindowStartedAt = performance.now();
  performanceLastFrameAt = performanceWindowStartedAt;
  frameHandle = requestAnimationFrame(frame);
}

function frame(now) {
  recordRuntimeFrame(now);
  const dt = Math.min(32, now - state.lastTime);
  state.lastTime = now;
  if (sheet.hidden && profileDrawer.hidden && entry.classList.contains('is-gone')) {
    const inSea = state.wy > 900 && state.worldMode !== 'cottage';
    const speedFactor = state.worldMode === 'cottage' ? .018 : inSea ? .14 : .24;
    let dx = 0;
    let dy = 0;
    const keyboardMoving = [...state.keys].some((key) => MOVEMENT_KEYS.has(key));
    if (state.keys.has('a') || state.keys.has('arrowleft')) dx -= speedFactor * dt;
    if (state.keys.has('d') || state.keys.has('arrowright')) dx += speedFactor * dt;
    if (state.keys.has('w') || state.keys.has('arrowup')) dy -= speedFactor * dt;
    if (state.keys.has('s') || state.keys.has('arrowdown')) dy += speedFactor * dt;
    const activePointerTarget = !keyboardMoving && pointerMoveTarget?.mode === state.worldMode ? pointerMoveTarget : null;
    if (activePointerTarget) {
      const currentX = state.worldMode === 'cottage' ? state.cottageX : state.wx;
      const currentY = state.worldMode === 'cottage' ? state.cottageY : state.wy;
      const targetDx = activePointerTarget.x - currentX;
      const targetDy = activePointerTarget.y - currentY;
      const distance = Math.hypot(targetDx, targetDy);
      const remaining = Math.max(0, distance - activePointerTarget.stopDistance);
      if (remaining <= .08) {
        if (!advancePointerWaypoint(activePointerTarget)) finishPointerMove(activePointerTarget);
      } else {
        const step = Math.min(speedFactor * dt, remaining);
        dx = (targetDx / distance) * step;
        dy = (targetDy / distance) * step;
      }
    }
    if (state.worldMode === 'cottage') {
      state.cottageX = Math.max(3, Math.min(97, state.cottageX + dx));
      state.cottageY = Math.max(20, Math.min(92, state.cottageY + dy));
    } else {
      const nextX = state.wx + dx;
      const nextY = state.wy + dy;
      if (walkSegmentIsClear(state.wx, state.wy, nextX, nextY)) {
        state.wx = nextX;
        state.wy = nextY;
        movementSample.distance += Math.hypot(dx, dy);
      } else {
        const canSlideX = dx && walkSegmentIsClear(state.wx, state.wy, nextX, state.wy);
        const canSlideY = dy && walkSegmentIsClear(state.wx, state.wy, state.wx, nextY);
        if (canSlideX) { state.wx = nextX; movementSample.distance += Math.abs(dx); dy = 0; }
        else if (canSlideY) { state.wy = nextY; movementSample.distance += Math.abs(dy); dx = 0; }
        else {
          dx = 0;
          dy = 0;
          if (activePointerTarget) {
            if (!replanPointerMove(activePointerTarget)) {
              cancelPointerMove('path_blocked');
              showToast('路线被挡住了，请重新选择落点');
            }
          }
        }
      }
    }
    player.classList.toggle('is-moving', Boolean(dx || dy));
    if (dx || dy) {
      hideContextHint('intro');
      if (Math.abs(dx) >= Math.abs(dy) && dx) player.dataset.facing = dx < 0 ? 'left' : 'right';
      else if (dy) player.dataset.facing = dy < 0 ? 'up' : 'down';
      closeContextWheel();
      if (state.worldMode !== 'cottage') state.exploreSteps += Math.abs(dx) + Math.abs(dy);
      updateWorldMovementFrame(now);
      if (state.worldMode === 'cottage') tryExitCottageByWalking();
      if (activePointerTarget && pointerMoveTarget === activePointerTarget) {
        const currentX = state.worldMode === 'cottage' ? state.cottageX : state.wx;
        const currentY = state.worldMode === 'cottage' ? state.cottageY : state.wy;
        const remaining = Math.hypot(activePointerTarget.x - currentX, activePointerTarget.y - currentY) - activePointerTarget.stopDistance;
        if (remaining <= .08 && !advancePointerWaypoint(activePointerTarget)) finishPointerMove(activePointerTarget);
      }
    }
  } else {
    player.classList.remove('is-moving');
    updateHudState();
  }
  if (frameLoopActive()) {
    frameHandle = requestAnimationFrame(frame);
  } else {
    frameLoopRunning = false;
    frameHandle = null;
    worldStage.dataset.runtimeFps = 'idle';
  }
}

window.addEventListener('keydown', (event) => {
  const key = event.key.toLowerCase();
  if (MOVEMENT_KEYS.has(key)) startFrameLoop();
  if (['e', 'f', 'g'].includes(key)) {
    startFrameLoop();
    updateNearby();
  }
});

setInterval(() => {
  if (frameLoopRunning || state.worldMode === 'cottage') return;
  if (!entry.classList.contains('is-gone') || !sheet.hidden || !profileDrawer.hidden) return;
  updateNearby();
}, 1000);

function stopMovement(savePosition = false) {
  const keyboardWasMoving = state.keys.size > 0;
  const pointerWasMoving = Boolean(pointerMoveTarget);
  state.keys.clear();
  cancelPointerMove('input_stopped', savePosition);
  player.classList.remove('is-moving');
  if (keyboardWasMoving && !pointerWasMoving) flushMovementSample('input_stopped');
  if (savePosition && keyboardWasMoving) persist();
}
