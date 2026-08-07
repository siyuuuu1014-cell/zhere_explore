const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

const worldStage = $('#worldStage');
const worldShell = $('#worldShell');
const worldArt = $('#worldArt');
const worldName = $('#worldName');
const terrainLayer = $('#terrainLayer');
const player = $('#player');
const nearby = $('#nearby');
const contextHint = $('#contextHint');
const zoneName = $('#zoneName');
const screenLayer = $('#screenLayer');
const placedLayer = $('#placedLayer');
const creationLayer = $('#creationLayer');
const cottageExit = $('#cottageExit');
const wayfinder = $('#wayfinder');
const dialogue = $('#dialogue');
const dialogueText = $('#dialogueText');
const dialogueActions = $('#dialogueActions');
const speaker = $('#speaker');
const shadowCount = $('#shadowCount');
const walletCount = $('#walletCount');
const favoritesButton = $('#favoritesButton');
const favoritesCount = $('#favoritesCount');
const ledgerButton = $('#ledgerButton');
const topAvatar = $('#topAvatar');
const drawerAvatar = $('#drawerAvatar');
const drawerName = $('#drawerName');
const drawerTitle = $('#drawerTitle');
const entry = $('#entry');
const sheet = $('#sheet');
const sheetContent = $('#sheetContent');
const scrim = $('#scrim');
const profileDrawer = $('#profileDrawer');
const toast = $('#toast');
const appBasePath = location.pathname.endsWith('/') ? location.pathname : location.pathname.replace(/[^/]+$/, '');

const SERVICE_FEE = 0.1;
const AVATAR_SWATCHES = [
  { glyph: '秋', color: '#4f8d83' },
  { glyph: '木', color: '#68783a' },
  { glyph: '叶', color: '#c95f43' },
  { glyph: '风', color: '#8f653d' },
  { glyph: '雨', color: '#4e5f2f' },
  { glyph: '露', color: '#d7ab65' },
];

const mediaItems = [
  { id: 'wind-line', wx: -1120, wy: -620, title: '风把晾衣绳吹成五线谱', source: '公共上传', tags: ['轻盈', '日常'], dur: '26秒', res: '1080p', license: '单次使用', price: 30, comments: [{ name: '灰瓦', text: '我听见了三次窗铃。' }] },
  { id: 'tree-nap', wx: -1940, wy: -1040, title: '一棵树记住的午睡', source: '世界推荐', tags: ['安静'], dur: '41秒', res: '1080p', license: '期限授权', price: 45, comments: [] },
  { id: 'breakfast-nine', wx: -2480, wy: 180, title: '早餐铺的第九分钟', source: '邻居分享', tags: ['食物', '等待'], dur: '18秒', res: '720p', license: '单次使用', price: 22, comments: [{ name: '小满', text: '最后那个杯子很像我家的。' }] },
  { id: 'unsent-summer', wx: -820, wy: 1120, title: '没有寄出的夏天录像', source: '公共上传', tags: ['夏天', '未完成'], dur: '55秒', res: '1080p', license: '永久授权', price: 68, comments: [] },
  { id: 'rain-stop', wx: 920, wy: -760, title: '陌生人一起等雨停', source: '规则推荐', tags: ['雨', '相遇'], dur: '33秒', res: '1080p', license: '单次使用', price: 36, comments: [] },
  { id: 'silent-ad', wx: 1580, wy: -1320, title: '一句话也没说的广告', source: '公共上传', tags: ['商业', '沉默'], dur: '21秒', res: '720p', license: '单次使用', price: 18, comments: [] },
  { id: 'night-bus', wx: 2560, wy: -280, title: '末班车经过空站台', source: '世界推荐', tags: ['夜晚'], dur: '47秒', res: '1080p', license: '期限授权', price: 52, comments: [] },
  { id: 'cat-meeting', wx: 1840, wy: 1040, title: '猫参加了一场公司会议', source: '邻居分享', tags: ['荒诞', '办公'], dur: '29秒', res: '1080p', license: '单次使用', price: 31, comments: [] },
  { id: 'paper-boat', wx: 340, wy: 1540, title: '纸船绕过一场争论', source: '公共上传', tags: ['绕行'], dur: '15秒', res: '720p', license: '单次使用', price: 16, comments: [] },
  { id: 'quiet-lift', wx: 3140, wy: 1180, title: '没有按楼层的电梯', source: '世界推荐', tags: ['等待'], dur: '38秒', res: '1080p', license: '永久授权', price: 60, comments: [] },
  { id: 'blue-hour', wx: -3260, wy: -460, title: '蓝色时刻的空座位', source: '邻居分享', tags: ['空白'], dur: '24秒', res: '720p', license: '单次使用', price: 20, comments: [] },
  { id: 'cup-shadow', wx: 520, wy: -1900, title: '杯沿留下的下午', source: '公共上传', tags: ['日常'], dur: '12秒', res: '720p', license: '单次使用', price: 14, comments: [] },
];

const objectTargets = {
  cottage: { wx: -610, wy: 220, label: '我的小屋', hint: 'E 推门进入自己的小屋' },
  board: { wx: 230, wy: 90, label: '需求纸树', hint: 'E 查看需求、委托与素材库' },
  workshop: { wx: 720, wy: 390, label: '共创工作台', hint: 'E 上传视频或发布需求' },
  sound: { wx: -1820, wy: -820, label: '听风码头', hint: 'E 听一段没有任务的环境声音' },
  auction: { wx: 2140, wy: -920, label: '枝头竞价集', hint: 'E 查看公开递增的虚拟竞价' },
  anomaly: { wx: -2380, wy: 1320, label: '回声水洼', hint: 'E 回应今日异象，或直接走开' },
  neighbor: { wx: 2860, wy: 920, label: '陌生人的长椅', hint: 'E 进入公开的邻居空间' },
};

const systemDemands = [
  { id: 'sys-d-1', title: '找最不像广告的广告素材', type: '个人', by: '灰瓦', budget: 0, responses: [{ name: '小满', text: '一段没有台词的清晨街道，可能符合。', at: '2 小时前' }] },
  { id: 'sys-d-2', title: '给一只猫配企业宣传片', type: '共创', by: '木叶来客', budget: 0, responses: [] },
  { id: 'sys-d-3', title: '为新品茶饮拍一支 15 秒竖屏短片', type: 'commerce', by: '北巷茶铺', budget: 80, responses: [] },
];

const systemTasks = [
  { id: 'sys-t-1', title: '末班车站台的三十秒', desc: '需要空站台的傍晚素材，用于回忆向短片。', requirement: '1080p，无人物正脸', reward: 40, by: '迟晚', status: 'open', responses: [] },
  { id: 'sys-t-2', title: '给早餐铺拍一次早高峰', desc: '热气、人声和揉面的节奏都可以。', requirement: '竖屏优先', reward: 55, by: '北巷', status: 'open', responses: [{ name: '灰瓦', text: '我有一段去年冬天的早餐铺素材。', at: '昨天' }] },
];

const defaultState = {
  wx: 0,
  wy: 0,
  cottageX: 50,
  cottageY: 62,
  worldMode: 'overworld',
  wallet: 76,
  shadows: [],
  placed: [],
  rug: 'teal',
  auctionPrice: 19,
  bids: [{ name: '慢半拍的鹿', amount: 19, type: 'npc' }],
  following: false,
  research: true,
  anonymized: false,
  eventChoice: 'none',
  uploads: [],
  demands: [],
  rawEvents: [],
  favorites: [],
  tasks: [],
  drafts: [],
  commerce: [],
  ratings: [],
  feedback: [],
  exhibitions: [],
  ledger: [],
  withdrawn: 0,
  exploreSteps: 0,
  neighborComments: [],
  profile: { nickname: '木叶来客', username: 'visitor', bio: '收集不太确定的影像', interests: '日常、荒诞、低饱和', spaceName: '左枝小屋', avatar: 0 },
  auth: { phone: false, email: false, realname: false, payment: false },
  devices: [
    { id: 'dev-1', name: '当前设备 · Chrome', current: true, lastAt: '刚刚' },
    { id: 'dev-2', name: '旧手机 Safari', current: false, lastAt: '7 天前' },
  ],
};

function loadState() {
  try {
    return { ...defaultState, ...JSON.parse(localStorage.getItem('zhere-v6-design-state') || '{}') };
  } catch {
    return { ...defaultState };
  }
}

const state = loadState();
state.keys = new Set();
state.nearest = null;
state.activeMedia = null;
state.lastTime = performance.now();

function persist() {
  const serializable = { ...state };
  delete serializable.keys;
  delete serializable.nearest;
  delete serializable.activeMedia;
  delete serializable.lastTime;
  localStorage.setItem('zhere-v6-design-state', JSON.stringify(serializable));
}

function logEvent(rawEvent, details = {}) {
  const event = {
    event_id: crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`,
    raw_event: rawEvent,
    details,
    created_at: new Date().toISOString(),
    experiment_id: 'map-unified-v1',
    experiment_group: 'flat-storybook',
    derived_signals: {},
  };
  state.rawEvents.push(event);
  state.rawEvents = state.rawEvents.slice(-120);
  persist();
}

function countEvent(name) {
  return state.rawEvents.filter((event) => event.raw_event === name).length;
}

function fmtNow() {
  return new Date().toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
}

function creatorScore() {
  const completed = state.commerce.filter((item) => item.status === 'completed').length;
  const income = state.ledger.filter((item) => item.amount > 0).reduce((sum, item) => sum + item.amount, 0);
  return completed * 3 + Math.floor(income / 20) + state.uploads.length + state.ratings.filter((item) => item.score === 'happy').length;
}

function creatorLevel() {
  const tiers = [['观客', 0], ['回音', 3], ['记录者', 8], ['聚落工匠', 15], ['树冠编织者', 24]];
  const score = creatorScore();
  let label = tiers[0][0];
  tiers.forEach(([name, need]) => { if (score >= need) label = name; });
  return { label, score };
}

function ratingAverage() {
  const map = { happy: 5, ok: 3, bad: 1 };
  if (!state.ratings.length) return null;
  const sum = state.ratings.reduce((total, item) => total + (map[item.score] || 0), 0);
  return (sum / state.ratings.length).toFixed(1);
}

function escapeHtml(value) {
  return String(value).replace(/[&<>'"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[char]);
}

function showToast(message) {
  toast.textContent = message;
  toast.hidden = false;
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => { toast.hidden = true; }, 2200);
}

function addDialogueAction(label, handler) {
  const button = document.createElement('button');
  button.className = 'small-action';
  button.textContent = label;
  button.addEventListener('click', handler);
  dialogueActions.append(button);
}

function say(text, who = '木秋', options = []) {
  speaker.textContent = who;
  dialogueText.textContent = text;
  dialogueActions.replaceChildren();
  options.forEach((option) => addDialogueAction(option.label, option.handler));
  dialogue.classList.remove('is-collapsed');
  $('#dialogueToggle').textContent = '收起';
}

function openSheet(markup, setup) {
  sheetContent.innerHTML = markup;
  sheet.hidden = false;
  scrim.hidden = false;
  profileDrawer.hidden = true;
  setup?.();
  requestAnimationFrame(() => $('.sheet-title', sheet)?.focus?.());
}

function closeSheet() {
  sheet.hidden = true;
  scrim.hidden = true;
  sheetContent.replaceChildren();
  state.activeMedia = null;
}

function openUploadDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('zhere-local-media', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('uploads');
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function saveUploadFile(id, file) {
  if (!file) return;
  const database = await openUploadDatabase();
  await new Promise((resolve, reject) => {
    const transaction = database.transaction('uploads', 'readwrite');
    transaction.objectStore('uploads').put(file, id);
    transaction.oncomplete = resolve;
    transaction.onerror = () => reject(transaction.error);
  });
  database.close();
}

async function getUploadFile(id) {
  if (!id) return null;
  const database = await openUploadDatabase();
  const result = await new Promise((resolve, reject) => {
    const request = database.transaction('uploads').objectStore('uploads').get(id);
    request.onsuccess = () => resolve(request.result || null);
    request.onerror = () => reject(request.error);
  });
  database.close();
  return result;
}

function screenMarkup(item, index) {
  const button = document.createElement('button');
  button.className = 'media-screen';
  button.dataset.screen = String(index);
  button.dataset.label = item.title;
  button.setAttribute('aria-label', item.title);
  if (state.shadows.includes(item.id)) button.classList.add('is-picked');
  button.addEventListener('click', (event) => {
    event.stopPropagation();
    if (state.worldMode === 'cottage') exitCottage();
    state.wx = item.wx;
    state.wy = item.wy + 90;
    renderWorld();
    setTimeout(() => showMedia(index), 80);
  });
  return button;
}

function renderScreens() {
  screenLayer.replaceChildren(...mediaItems.map(screenMarkup));
}

function creationPosition(kind, index) {
  const pair = Math.floor(index / 2);
  const alternate = index % 2;
  if (kind === 'upload') return { wx: 520 + pair * 280 + alternate * 430, wy: 40 + pair * 390 + alternate * 120 };
  return { wx: 80 - pair * 280 - alternate * 430, wy: -120 - pair * 390 + alternate * 110 };
}

function hash2d(x, y, salt = 0) {
  let value = Math.imul(x + 374761393 + salt, 668265263) ^ Math.imul(y + 1274126177, 2246822519);
  value = Math.imul(value ^ (value >>> 13), 1274126177);
  return ((value ^ (value >>> 16)) >>> 0) / 4294967295;
}

function renderTerrain() {
  if (state.worldMode === 'cottage') return;
  const chunkW = 720;
  const chunkH = 520;
  const minX = Math.floor((state.wx - worldShell.clientWidth / 2 - 220) / chunkW);
  const maxX = Math.floor((state.wx + worldShell.clientWidth / 2 + 220) / chunkW);
  const minY = Math.floor((state.wy - worldShell.clientHeight / 2 - 180) / chunkH);
  const maxY = Math.floor((state.wy + worldShell.clientHeight / 2 + 180) / chunkH);
  const fragment = document.createDocumentFragment();
  for (let cy = minY; cy <= maxY; cy += 1) {
    for (let cx = minX; cx <= maxX; cx += 1) {
      const count = hash2d(cx, cy, 9) > .62 ? 2 : 1;
      for (let i = 0; i < count; i += 1) {
        const mark = document.createElement('span');
        const kind = hash2d(cx, cy, 30 + i);
        mark.className = `terrain-mark${kind > .74 ? ' is-seam' : kind < .28 ? ' is-small' : ''}`;
        const wx = cx * chunkW + 80 + hash2d(cx, cy, 50 + i) * (chunkW - 160);
        const wy = cy * chunkH + 70 + hash2d(cx, cy, 70 + i) * (chunkH - 140);
        const sx = worldShell.clientWidth / 2 + wx - state.wx;
        const sy = worldShell.clientHeight * .52 + wy - state.wy;
        mark.style.left = `${Math.round(sx)}px`;
        mark.style.top = `${Math.round(sy)}px`;
        mark.style.transform = `translate(-50%, -50%) rotate(${Math.round(hash2d(cx, cy, 90 + i) * 18 - 9)}deg)`;
        fragment.append(mark);
      }
    }
  }
  terrainLayer.replaceChildren(fragment);
}

function screenPosition(wx, wy) {
  return {
    x: worldShell.clientWidth / 2 + wx - state.wx,
    y: worldShell.clientHeight * .52 + wy - state.wy,
  };
}

function placeWorldNode(node, wx, wy) {
  const point = screenPosition(wx, wy);
  node.style.transform = `translate(${Math.round(point.x - node.offsetWidth / 2)}px, ${Math.round(point.y - node.offsetHeight / 2)}px)`;
  const visible = point.x > -240 && point.x < worldShell.clientWidth + 240 && point.y > -180 && point.y < worldShell.clientHeight + 180;
  node.style.visibility = visible ? 'visible' : 'hidden';
  return point;
}

function renderCreations() {
  creationLayer.replaceChildren();
  const creations = [
    ...state.uploads.map((item, index) => ({ ...item, kind: 'upload', ...creationPosition('upload', index) })),
    ...state.demands.map((item, index) => ({ ...item, kind: 'demand', ...creationPosition('demand', index) })),
  ];
  creations.forEach((item) => {
    const button = document.createElement('button');
    button.className = `player-creation is-${item.kind}`;
    button.textContent = item.title;
    button.dataset.creationId = item.id || item.title;
    button.setAttribute('aria-label', `${item.kind === 'upload' ? '我的上传' : '我的需求'}：${item.title}`);
    button.addEventListener('click', (event) => {
      event.stopPropagation();
      showPublishedCreation(item);
    });
    creationLayer.append(button);
    placeWorldNode(button, item.wx, item.wy);
  });
}

function renderPlaced() {
  placedLayer.replaceChildren();
  const rug = document.createElement('span');
  rug.className = `rug-overlay rug-${state.rug}`;
  placedLayer.append(rug);
  state.placed.forEach((item, index) => {
    const film = document.createElement('span');
    film.className = item.type === 'combo' ? 'placed-film placed-combo' : 'placed-film';
    film.style.left = `${item.x}%`;
    film.style.top = `${item.y}%`;
    film.title = item.type === 'combo' ? `影像组合 ${index + 1}` : `影子 ${index + 1}`;
    placedLayer.append(film);
  });
}

function updateCounters() {
  shadowCount.textContent = state.shadows.length;
  walletCount.textContent = state.wallet;
}

function updateFavoritesBadge() {
  favoritesCount.textContent = state.favorites.length;
}

function refreshIdentity() {
  const profile = state.profile;
  const swatch = AVATAR_SWATCHES[profile.avatar] || AVATAR_SWATCHES[0];
  topAvatar.textContent = swatch.glyph;
  topAvatar.style.background = swatch.color;
  drawerAvatar.textContent = swatch.glyph;
  drawerAvatar.style.background = swatch.color;
  drawerName.textContent = profile.nickname || '木叶来客';
  drawerTitle.textContent = `${profile.spaceName || '左枝小屋'}的整理者 · ${creatorLevel().label}`;
}

function currentZone() {
  if (state.worldMode === 'cottage') return '我的小屋';
  const nearest = Object.values(objectTargets).map((item) => ({ ...item, distance: Math.hypot(state.wx - item.wx, state.wy - item.wy) })).sort((a, b) => a.distance - b.distance)[0];
  if (nearest && nearest.distance < 520) return `${nearest.label}附近`;
  const eastWest = state.wx >= 0 ? `东 ${Math.abs(Math.round(state.wx / 10))}` : `西 ${Math.abs(Math.round(state.wx / 10))}`;
  const northSouth = state.wy >= 0 ? `南 ${Math.abs(Math.round(state.wy / 10))}` : `北 ${Math.abs(Math.round(state.wy / 10))}`;
  return `未命名枝区 · ${eastWest} / ${northSouth}`;
}

function nearestTarget() {
  if (state.worldMode === 'cottage') return null;
  let result = null;
  mediaItems.forEach((item, index) => {
    const distance = Math.hypot(state.wx - item.wx, state.wy - item.wy);
    if (distance < 170 && (!result || distance < result.distance)) result = { type: 'screen', index, ...item, distance };
  });
  Object.entries(objectTargets).forEach(([id, item]) => {
    const distance = Math.hypot(state.wx - item.wx, state.wy - item.wy);
    if (distance < 180 && (!result || distance < result.distance)) result = { type: 'object', id, ...item, distance };
  });
  return result;
}

function updateNearby() {
  state.nearest = nearestTarget();
  $$('.media-screen').forEach((node, index) => node.classList.toggle('is-near', state.nearest?.type === 'screen' && state.nearest.index === index));
  $$('.world-object').forEach((node) => node.classList.toggle('is-near', state.nearest?.type === 'object' && state.nearest.id === node.dataset.object));
  nearby.hidden = !state.nearest;
  if (state.nearest) {
    contextHint.textContent = state.nearest.type === 'screen' ? `E 观看《${state.nearest.title}》，F 拾取影子` : state.nearest.hint;
  } else {
    contextHint.textContent = state.worldMode === 'cottage' ? 'F 摆放影子 · 点击“推门”回到公共世界' : 'WASD 向任意方向漫游 · 点击空地也能移动 · 世界没有边界';
  }
  zoneName.textContent = currentZone();
}

function updatePlayer() {
  if (state.worldMode === 'cottage') {
    player.style.setProperty('--x', state.cottageX);
    player.style.setProperty('--y', state.cottageY);
  }
}

function updateWayfinder() {
  if (state.worldMode === 'cottage') return;
  const signals = [
    ...Object.entries(objectTargets).map(([id, item]) => ({ id, ...item })),
    ...mediaItems.map((item) => ({ ...item, label: `影像《${item.title}》` })),
    ...state.uploads.map((item, index) => ({ ...item, ...creationPosition('upload', index), label: `我的上传《${item.title}》` })),
    ...state.demands.map((item, index) => ({ ...item, ...creationPosition('demand', index), label: `我的需求“${item.title}”` })),
  ].map((item) => ({ ...item, distance: Math.hypot(item.wx - state.wx, item.wy - state.wy) }))
    .sort((a, b) => a.distance - b.distance)
    .slice(0, 2);
  const direction = (item) => {
    const dx = item.wx - state.wx;
    const dy = item.wy - state.wy;
    if (Math.abs(dx) > Math.abs(dy)) return dx > 0 ? '→' : '←';
    return dy > 0 ? '↓' : '↑';
  };
  wayfinder.textContent = signals.map((item) => `${direction(item)} ${item.label} ${Math.round(item.distance / 10)}步`).join('　');
}

function renderWorld() {
  updatePlayer();
  renderTerrain();
  $$('.world-object').forEach((node) => {
    const target = objectTargets[node.dataset.object];
    if (target) placeWorldNode(node, target.wx, target.wy);
  });
  $$('.media-screen').forEach((node, index) => placeWorldNode(node, mediaItems[index].wx, mediaItems[index].wy));
  $$('.player-creation').forEach((node) => {
    const uploadIndex = state.uploads.findIndex((item) => (item.id || item.title) === node.dataset.creationId);
    const demandIndex = state.demands.findIndex((item) => (item.id || item.title) === node.dataset.creationId);
    if (uploadIndex >= 0) {
      const point = creationPosition('upload', uploadIndex);
      placeWorldNode(node, point.wx, point.wy);
    }
    if (demandIndex >= 0) {
      const point = creationPosition('demand', demandIndex);
      placeWorldNode(node, point.wx, point.wy);
    }
  });
  updateNearby();
  updateWayfinder();
}

function collectShadow(index) {
  const item = mediaItems[index];
  if (state.shadows.includes(item.id)) return showToast('你已经留过这枚影子');
  state.shadows.push(item.id);
  renderScreens();
  renderWorld();
  updateCounters();
  persist();
  logEvent('pick_up', { asset_id: item.id, source: item.source });
  say(`你带走了《${item.title}》的一枚影子。公共原片仍留在树心，其他人也能继续观看。`, '木秋');
  showToast('影子已放入口袋');
}

function placeShadow() {
  if (state.worldMode !== 'cottage') {
    say('公共世界里的素材保持公共。想自由摆放，请回到自己的小屋。');
    return;
  }
  if (!state.shadows.length) {
    say('口袋里还没有影子。去树心看一段影像，靠近后按 F 就能带回副本。');
    return;
  }
  const assetId = state.shadows.shift();
  state.placed.push({ type: 'shadow', assetId, x: Math.round(state.cottageX), y: Math.round(state.cottageY) });
  renderPlaced();
  updateCounters();
  persist();
  logEvent('place', { asset_id: assetId, x: state.cottageX, y: state.cottageY, space: 'personal' });
  say('影子被放在你的小屋里。刷新之后，它仍会留在这里。');
}

function combineShadows() {
  if (state.shadows.length < 2) return showToast('至少需要两枚影子');
  const parts = state.shadows.splice(0, 2);
  state.placed.push({ type: 'combo', parts, x: 18, y: 41 });
  renderPlaced();
  updateCounters();
  persist();
  logEvent('combine', { asset_ids: parts });
  showPersonalSpace();
  showToast('新的影像组合已经出现');
}

function showMedia(index) {
  const item = mediaItems[index];
  state.activeMedia = index;
  const favorite = state.favorites.some((entry) => entry.type === 'media' && entry.id === item.id);
  logEvent('asset_open', { asset_id: item.id, recommendation_source: item.source, rank: index + 1 });
  openSheet(`
    <div class="sheet-inner media-sheet">
      <h2 class="sheet-title" id="sheetTitle" tabindex="-1">${escapeHtml(item.title)}</h2>
      <p class="sheet-subtitle">来源：${escapeHtml(item.source)}。观看、绕开、暂停和拾取会分别记录，不会被直接解释成喜欢或不喜欢。</p>
      <div class="meta-chips">
        <span class="chip">时长 ${escapeHtml(item.dur)}</span>
        <span class="chip">${escapeHtml(item.res)}</span>
        <span class="chip">授权 · ${escapeHtml(item.license)}</span>
        <span class="chip">虚拟报价 ${item.price} 树果币</span>
      </div>
      <div class="media-layout">
        <div>
          <div class="video-frame" id="videoFrame"><span class="video-status" id="videoStatus">等待播放</span></div>
          <div class="media-actions">
            <button class="primary-button" id="playButton">播放</button>
            <button class="paper-button" id="collectButton">拾取影子</button>
            <button class="paper-button" id="favoriteButton">${favorite ? '已收藏' : '收藏'}</button>
            <button class="paper-button" id="respondButton">用我的素材回应</button>
          </div>
          <div class="note-section">
            <h3>给它贴一个可争论的标签</h3>
            <div class="tag-row" id="tagRow">
              ${['治愈', '古怪', '像广告', '适合凌晨', '不知道是什么'].map((tag) => `<button class="tag-button${item.tags.includes(tag) ? ' is-selected' : ''}" data-tag="${tag}">${tag}</button>`).join('')}
            </div>
          </div>
        </div>
        <div>
          <h3>树屋留言</h3>
          <div class="comment-list" id="commentList">${renderComments(item)}</div>
          <form class="inline-form" id="commentForm">
            <label>写下观察<input name="comment" maxlength="80" required placeholder="描述你看见的东西" /></label>
            <button class="primary-button" type="submit">留下</button>
          </form>
          <div class="note-section">
            <button class="paper-button" id="combineButton">和口袋里的影子组合</button>
          </div>
        </div>
      </div>
    </div>
  `, () => {
    $('#playButton').addEventListener('click', () => toggleModalPlayback(index));
    $('#collectButton').addEventListener('click', () => collectShadow(index));
    $('#favoriteButton').addEventListener('click', () => toggleFavoriteMedia(item));
    $('#respondButton').addEventListener('click', () => showWorkshop('response', item));
    $('#combineButton').addEventListener('click', combineShadows);
    bindReplyButtons(item);
    $$('.tag-button', sheet).forEach((button) => button.addEventListener('click', () => {
      button.classList.toggle('is-selected');
      const tag = button.dataset.tag;
      if (button.classList.contains('is-selected')) item.tags.push(tag);
      else item.tags = item.tags.filter((value) => value !== tag);
      logEvent('tag_toggle', { asset_id: item.id, tag, active: button.classList.contains('is-selected') });
    }));
    $('#commentForm').addEventListener('submit', (event) => {
      event.preventDefault();
      const input = event.currentTarget.elements.comment;
      const text = input.value.trim();
      if (!text) return;
      item.comments.push({ name: state.profile.nickname || '木叶来客', text });
      $('#commentList').innerHTML = renderComments(item);
      bindReplyButtons(item);
      input.value = '';
      logEvent('comment', { asset_id: item.id, length: text.length });
      showToast('留言已经留在公共影像旁');
    });
  });
}

function renderComments(item) {
  if (!item.comments.length) return '<div class="empty-state">还没有留言。你可以只观察，不必评价。</div>';
  return item.comments.map((comment) => `<div class="comment"><b>${escapeHtml(comment.name)}</b><span>${escapeHtml(comment.text)}</span><button class="text-button" type="button">回复</button></div>`).join('');
}

function bindReplyButtons(item) {
  $$('.comment .text-button', sheet).forEach((button, index) => button.addEventListener('click', () => {
    const input = $('#commentForm input[name="comment"]');
    input.placeholder = `回复 ${item.comments[index]?.name || '这条留言'}`;
    input.focus();
    logEvent('comment_reply_start', { asset_id: item.id, reply_to: item.comments[index]?.name || null });
  }));
}

function toggleModalPlayback(index) {
  const frame = $('#videoFrame');
  const button = $('#playButton');
  const playing = frame.classList.toggle('is-playing');
  button.textContent = playing ? '暂停' : '播放';
  $('#videoStatus').textContent = playing ? '正在播放素材占位片段' : '已暂停';
  const screen = $(`.media-screen[data-screen="${index}"]`);
  screen?.classList.toggle('is-playing', playing);
  logEvent(playing ? 'play' : 'pause', { asset_id: mediaItems[index].id, progress_node: playing ? 0 : 0.25 });
}

function toggleFavoriteMedia(item) {
  const existing = state.favorites.findIndex((entry) => entry.type === 'media' && entry.id === item.id);
  if (existing >= 0) {
    state.favorites.splice(existing, 1);
    showToast('已取消收藏');
    logEvent('favorite_remove', { asset_id: item.id });
  } else {
    state.favorites.push({ type: 'media', id: item.id, title: item.title, at: fmtNow() });
    showToast('已加入收藏');
    logEvent('favorite', { asset_id: item.id });
  }
  persist();
  updateFavoritesBadge();
  const button = $('#favoriteButton', sheet);
  if (button) button.textContent = state.favorites.some((entry) => entry.type === 'media' && entry.id === item.id) ? '已收藏' : '收藏';
}

function toggleFavorite(item, type) {
  const label = type === 'task' ? '委托' : '需求';
  const existing = state.favorites.findIndex((entry) => entry.type === type && entry.id === item.id);
  if (existing >= 0) {
    state.favorites.splice(existing, 1);
    showToast(`已取消收藏${label}`);
  } else {
    state.favorites.push({ type, id: item.id, title: item.title, at: fmtNow() });
    showToast(`已收藏${label}`);
  }
  persist();
  updateFavoritesBadge();
  const button = $('#taskFavoriteButton', sheet) || $('#demandFavoriteButton', sheet);
  if (button) button.textContent = state.favorites.some((entry) => entry.type === type && entry.id === item.id) ? '已收藏' : `收藏${label}`;
}

function showFavorites() {
  const rows = state.favorites.length
    ? state.favorites.map((entry, index) => {
      const label = { media: '公共影像', task: '委托', demand: '需求' }[entry.type] || '收藏';
      return `<div class="list-row"><div><b>${escapeHtml(entry.title)}</b><span>${label} · ${escapeHtml(entry.at || '')}</span></div><div class="row-actions"><button class="text-button" data-open-favorite="${index}">打开</button><button class="text-button" data-remove-favorite="${index}">取消收藏</button></div></div>`;
    }).join('')
    : '<div class="empty-state">还没有收藏。影像、委托和需求都可以收藏，方便以后回来。</div>';
  openSheet(`
    <div class="sheet-inner">
      <h2 class="sheet-title" id="sheetTitle" tabindex="-1">我的收藏</h2>
      <p class="sheet-subtitle">收藏只改变你自己的口袋清单，不会移动公共世界里的任何东西。</p>
      <div class="list-stack">${rows}</div>
    </div>
  `, () => {
    $$('[data-open-favorite]', sheet).forEach((button) => button.addEventListener('click', () => {
      const entry = state.favorites[Number(button.dataset.openFavorite)];
      if (!entry) return;
      closeSheet();
      openFavoriteEntry(entry);
    }));
    $$('[data-remove-favorite]', sheet).forEach((button) => button.addEventListener('click', () => {
      state.favorites.splice(Number(button.dataset.removeFavorite), 1);
      persist();
      updateFavoritesBadge();
      showFavorites();
    }));
  });
}

function openFavoriteEntry(entry) {
  if (entry.type === 'media') {
    const index = mediaItems.findIndex((item) => item.id === entry.id);
    if (index < 0) return showToast('这条影像已经不在世界里');
    state.wx = mediaItems[index].wx;
    state.wy = mediaItems[index].wy + 90;
    renderWorld();
    setTimeout(() => showMedia(index), 80);
  } else if (entry.type === 'task') {
    const task = [...systemTasks, ...state.tasks].find((item) => item.id === entry.id);
    if (task) showTaskDetail(task);
  } else if (entry.type === 'demand') {
    const demand = [...systemDemands, ...state.demands].find((item) => item.id === entry.id);
    if (demand) showDemandDetail(demand);
  }
}

function enterCottage() {
  state.worldMode = 'cottage';
  worldStage.classList.add('is-cottage');
  worldArt.hidden = false;
  cottageExit.hidden = false;
  worldName.textContent = state.profile.spaceName || '左枝小屋';
  renderPlaced();
  updatePlayer();
  updateNearby();
  persist();
  logEvent('space_enter', { space: 'personal' });
  say(`这里是你的私人小屋。只有这里能移动、组合和摆放从公共世界带回来的影子。`, '木秋', [{ label: '打开布置簿', handler: showPersonalSpace }]);
}

function exitCottage() {
  state.worldMode = 'overworld';
  worldStage.classList.remove('is-cottage');
  worldArt.hidden = true;
  cottageExit.hidden = true;
  worldName.textContent = '无界树冠公域';
  persist();
  renderWorld();
  logEvent('space_exit', { space: 'personal' });
  say('门外仍然向所有方向延伸。你可以沿着最近的信号走，也可以故意偏离它。');
}

function showSoundDock() {
  openSheet(`
    <div class="sheet-inner">
      <h2 class="sheet-title" id="sheetTitle" tabindex="-1">听风码头</h2>
      <p class="sheet-subtitle">这里没有任务，也没有完成状态。三段声音会随时停下，你也可以什么都不听。</p>
      <div class="choice-grid">
        <button class="choice-button sound-choice" data-sound="rope"><b>绳结晃动</b><span>短促、干燥、靠近左耳</span></button>
        <button class="choice-button sound-choice" data-sound="leaves"><b>两层树叶</b><span>远处更慢，近处更亮</span></button>
        <button class="choice-button sound-choice" data-sound="empty"><b>空码头</b><span>保留这一段安静</span></button>
      </div>
    </div>
  `, () => $$('.sound-choice', sheet).forEach((button) => button.addEventListener('click', () => {
    logEvent('sound_listen', { sound: button.dataset.sound });
    showToast(button.dataset.sound === 'empty' ? '你保留了安静' : `正在想象：${button.querySelector('b').textContent}`);
  })));
}

function showPublishedCreation(item) {
  const isUpload = item.kind === 'upload';
  openSheet(`
    <div class="sheet-inner">
      <h2 class="sheet-title" id="sheetTitle" tabindex="-1">${escapeHtml(item.title)}</h2>
      <p class="sheet-subtitle">${isUpload ? `我的公共上传 · ${escapeHtml(item.fileName || '未附文件')}` : `我的需求 · ${escapeHtml(item.type || '个人')}`}</p>
      <div id="publishedPreview" class="video-frame"><span class="video-status">${isUpload ? '正在读取你上传的文件…' : escapeHtml(item.description || '这张需求纸已经出现在公共世界。')}</span></div>
      <div class="status-banner">这个物件不是隐藏记录：它就位于共创营地，可以再次找到和打开。</div>
      <div class="media-actions"><button class="paper-button" id="locateCreation">回到地图继续漫游</button></div>
    </div>
  `, () => {
    $('#locateCreation').addEventListener('click', closeSheet);
    if (!isUpload) return;
    getUploadFile(item.id).then((file) => {
      const preview = $('#publishedPreview');
      if (!preview) return;
      if (!file) {
        preview.innerHTML = '<span class="video-status">视频位置已建立；当前条目没有可回放的本地文件。</span>';
        return;
      }
      const url = URL.createObjectURL(file);
      preview.innerHTML = file.type.startsWith('image/')
        ? `<img src="${url}" alt="${escapeHtml(item.title)}" style="width:100%;height:100%;object-fit:contain" />`
        : `<video src="${url}" controls playsinline style="width:100%;height:100%;object-fit:contain"></video>`;
    }).catch(() => {
      const preview = $('#publishedPreview');
      if (preview) preview.innerHTML = '<span class="video-status">本地文件读取失败，但地图物件仍然保留。</span>';
    });
  });
}

function showPersonalSpace() {
  const placedList = state.placed.length
    ? state.placed.map((item, index) => `<div class="bid-row"><span>${item.type === 'combo' ? '影像组合' : '公共影子'} ${index + 1}</span><b>${Math.round(item.x)}, ${Math.round(item.y)}</b></div>`).join('')
    : '<div class="empty-state">你的树屋还没有摆放内容。先从公共影像厅带回一枚影子。</div>';
  openSheet(`
    <div class="sheet-inner">
      <h2 class="sheet-title" id="sheetTitle" tabindex="-1">${state.profile.spaceName || '左枝小屋'}</h2>
      <p class="sheet-subtitle">这是唯一可以自由改造的区域。公共素材本身不会被移动，你摆放的是可追溯来源的影子。</p>
      <div class="choice-grid">
        <button class="choice-button" data-rug="teal"><b>青绿色地毯</b><span>保持当前树屋气质</span></button>
        <button class="choice-button" data-rug="brick"><b>砖红色地毯</b><span>只改变自己的空间</span></button>
      </div>
      <div class="note-section"><h3>当前摆放</h3>${placedList}</div>
      <div class="media-actions">
        <button class="primary-button" id="placeHereButton">把一枚影子放在脚边</button>
        <button class="paper-button" id="makeComboButton">组合两枚影子</button>
      </div>
    </div>
  `, () => {
    $$('[data-rug]', sheet).forEach((button) => button.addEventListener('click', () => {
      state.rug = button.dataset.rug;
      renderPlaced();
      persist();
      logEvent('space_customize', { property: 'rug', value: state.rug });
      showToast('只改变了你的树屋');
    }));
    $('#placeHereButton').addEventListener('click', placeShadow);
    $('#makeComboButton').addEventListener('click', combineShadows);
  });
}

function showAuction() {
  const next = state.auctionPrice + 5;
  openSheet(`
    <div class="sheet-inner">
      <h2 class="sheet-title" id="sheetTitle" tabindex="-1">雨停之后的十五秒</h2>
      <p class="sheet-subtitle">公开递增竞价。使用有限虚拟预算，不可提现，不可兑换，也不会产生真实购买或授权。</p>
      <div class="status-banner">每次出价消耗 5 树果币，公开价只是虚拟数字。NPC 可以参与，但会始终明确标记，不会伪装成真人。</div>
      <div class="auction-price">
        <div class="price-block"><span>当前公开价</span><strong>${state.auctionPrice}</strong> 树果币</div>
        <div class="price-block"><span>你的可用预算</span><strong>${state.wallet}</strong> 树果币</div>
      </div>
      <div class="bid-history">${state.bids.slice(-4).reverse().map((bid) => `<div class="bid-row"><span>${escapeHtml(bid.name)} ${bid.type === 'npc' ? '<em class="npc-mark">NPC</em>' : ''}</span><b>${bid.amount}</b></div>`).join('')}</div>
      <div class="media-actions">
        <button class="primary-button" id="bidButton">出价 ${next}</button>
        <button class="paper-button" id="walkAwayButton">暂时离开</button>
        <button class="text-button" id="fairPriceButton">留下我认为合理的价格</button>
      </div>
    </div>
  `, () => {
    $('#bidButton').addEventListener('click', () => placeBid(next));
    $('#walkAwayButton').addEventListener('click', () => { closeSheet(); say('你离开了竞价台。没有倒计时追着你，也不会失去探索资格。'); logEvent('auction_leave', { price: state.auctionPrice }); });
    $('#fairPriceButton').addEventListener('click', () => showFairPrice());
  });
}

function placeBid(amount) {
  if (state.wallet < 5) return showToast('本周期虚拟预算不足');
  state.wallet -= 5;
  state.auctionPrice = amount;
  state.bids.push({ name: state.profile.nickname || '木叶来客', amount, type: 'player' });
  updateCounters();
  persist();
  logEvent('auction_bid', { amount, mode: 'ascending', bidder_type: 'player', cost: 5 });
  showAuction();
  setTimeout(() => {
    if (sheet.hidden || state.auctionPrice >= 64) return;
    state.auctionPrice += 2;
    state.bids.push({ name: '慢半拍的鹿', amount: state.auctionPrice, type: 'npc' });
    persist();
    logEvent('auction_bid', { amount: state.auctionPrice, mode: 'ascending', bidder_type: 'npc' });
    if (!sheet.hidden) showAuction();
    showToast('NPC 慢半拍的鹿进行了跟价');
  }, 850);
}

function showFairPrice() {
  openSheet(`
    <div class="sheet-inner">
      <h2 class="sheet-title" id="sheetTitle" tabindex="-1">留下合理价格</h2>
      <p class="sheet-subtitle">这是研究中的感知价格，不会自动成为出价。</p>
      <form id="fairPriceForm">
        <label>你认为合理的树果币价格<input name="price" type="number" min="0" max="999" value="${state.auctionPrice}" required /></label>
        <button class="primary-button" type="submit">留下价格</button>
      </form>
    </div>
  `, () => $('#fairPriceForm').addEventListener('submit', (event) => {
    event.preventDefault();
    logEvent('fair_price_submit', { amount: Number(event.currentTarget.elements.price.value) });
    closeSheet();
    showToast('合理价格已记录，不会变成交易');
  }));
}

function showBoard() {
  const customDemands = state.demands.map((demand, index) => `<button class="comment locate-creation" data-kind="demand" data-index="${index}"><b>${escapeHtml(demand.title)}</b><span>地图需求纸 · ${escapeHtml(demand.type)} · 定位</span></button>`).join('');
  const customUploads = state.uploads.map((upload, index) => `<button class="comment locate-creation" data-kind="upload" data-index="${index}"><b>${escapeHtml(upload.title)}</b><span>共创营地放映物 · ${escapeHtml(upload.fileName || '未附文件')} · 定位</span></button>`).join('');
  const custom = `${customDemands}${customUploads}`;
  openSheet(`
    <div class="sheet-inner">
      <h2 class="sheet-title" id="sheetTitle" tabindex="-1">社区公告树</h2>
      <p class="sheet-subtitle">这些是可以忽略的邀请，不是任务。搜索素材、查看委托、回应需求都从这里展开。</p>
      <div class="tab-row">
        <button class="tab-button is-active" data-tab="search">素材库与搜索</button>
        <button class="tab-button" data-tab="tasks">委托</button>
        <button class="tab-button" data-tab="demands">需求</button>
      </div>
      <div class="tab-panel is-active" data-tab-panel="search">
        <label class="search-box">搜索标题、标签或来源
          <input id="boardSearch" placeholder="例如：雨、猫、广告" />
        </label>
        <div class="list-stack" id="searchResults"></div>
      </div>
      <div class="tab-panel" data-tab-panel="tasks">
        <div class="list-stack" id="taskList"></div>
      </div>
      <div class="tab-panel" data-tab-panel="demands">
        <div class="list-stack" id="demandList"></div>
      </div>
      <div class="media-actions board-actions">
        <button class="primary-button" id="publishDemand">发布需求</button>
        <button class="paper-button" id="publishTask">发布委托</button>
        <button class="paper-button" id="publishEvent">创建世界事件</button>
      </div>
      ${custom ? `<div class="note-section"><h3>我发布到地图的内容</h3>${custom}</div>` : ''}
    </div>
  `, () => {
    $$('.tab-button', sheet).forEach((button) => button.addEventListener('click', () => {
      $$('.tab-button', sheet).forEach((node) => node.classList.toggle('is-active', node === button));
      $$('.tab-panel', sheet).forEach((panel) => panel.classList.toggle('is-active', panel.dataset.tabPanel === button.dataset.tab));
    }));
    $('#boardSearch').addEventListener('input', renderBoardSearch);
    renderBoardSearch();
    renderTaskList();
    renderDemandList();
    $$('.locate-creation', sheet).forEach((button) => button.addEventListener('click', () => {
      const index = Number(button.dataset.index);
      const point = creationPosition(button.dataset.kind, index);
      state.wx = point.wx - 150;
      state.wy = point.wy + 80;
      closeSheet();
      renderWorld();
      persist();
      showToast('已回到这件发布物附近');
    }));
    $('#publishDemand').addEventListener('click', () => showWorkshop('demand'));
    $('#publishTask').addEventListener('click', () => showWorkshop('task'));
    $('#publishEvent').addEventListener('click', showCreateEvent);
  });
}

function renderBoardSearch() {
  const box = $('#searchResults', sheet);
  if (!box) return;
  const query = ($('#boardSearch', sheet)?.value || '').trim().toLowerCase();
  if (!query) {
    box.innerHTML = '<div class="empty-state">输入关键词搜索公共影像、委托和需求；结果会提供定位或直接打开。</div>';
    return;
  }
  const hits = [];
  mediaItems.forEach((item) => {
    if ([item.title, ...(item.tags || []), item.source].join(' ').toLowerCase().includes(query)) {
      hits.push({ type: 'media', id: item.id, title: item.title, sub: `公共影像 · ${escapeHtml(item.dur)} · ${item.price} 树果币` });
    }
  });
  [...systemTasks, ...state.tasks.filter((task) => task.status === 'open')].forEach((task) => {
    if (task.title.toLowerCase().includes(query)) hits.push({ type: 'task', id: task.id, title: task.title, sub: `委托 · ${escapeHtml(task.by || '我')}` });
  });
  [...systemDemands, ...state.demands.filter((demand) => !demand.closed)].forEach((demand) => {
    if (demand.title.toLowerCase().includes(query)) hits.push({ type: 'demand', id: demand.id, title: demand.title, sub: `需求 · ${escapeHtml(demand.by || '我')}` });
  });
  if (!hits.length) {
    box.innerHTML = '<div class="empty-state">没有匹配的结果，换一个词试试。</div>';
    return;
  }
  box.innerHTML = hits.map((hit, index) => `<div class="list-row"><div><b>${escapeHtml(hit.title)}</b><span>${hit.sub}</span></div><button class="text-button" data-hit="${index}">打开</button></div>`).join('');
  $$('[data-hit]', box).forEach((button) => button.addEventListener('click', () => {
    const hit = hits[Number(button.dataset.hit)];
    if (!hit) return;
    closeSheet();
    if (hit.type === 'media') {
      const index = mediaItems.findIndex((item) => item.id === hit.id);
      if (index < 0) return showToast('这条影像已经不在世界里');
      state.wx = mediaItems[index].wx;
      state.wy = mediaItems[index].wy + 90;
      renderWorld();
      setTimeout(() => showMedia(index), 80);
    } else if (hit.type === 'task') {
      const task = [...systemTasks, ...state.tasks].find((item) => item.id === hit.id);
      if (task) showTaskDetail(task);
    } else {
      const demand = [...systemDemands, ...state.demands].find((item) => item.id === hit.id);
      if (demand) showDemandDetail(demand);
    }
  }));
}

function renderTaskList() {
  const box = $('#taskList', sheet);
  if (!box) return;
  const list = [...systemTasks, ...state.tasks.filter((task) => task.status === 'open')];
  if (!list.length) {
    box.innerHTML = '<div class="empty-state">还没有委托。</div>';
    return;
  }
  box.innerHTML = list.map((task, index) => `<div class="list-row"><div><b>${escapeHtml(task.title)}</b><span>${escapeHtml(task.by || '我')} · ${task.reward} 树果币 · ${task.responses.length} 个回应</span></div><button class="text-button" data-task="${index}">查看</button></div>`).join('');
  $$('[data-task]', box).forEach((button) => button.addEventListener('click', () => showTaskDetail(list[Number(button.dataset.task)])));
}

function renderDemandList() {
  const box = $('#demandList', sheet);
  if (!box) return;
  const list = [...systemDemands, ...state.demands.filter((demand) => !demand.closed)];
  if (!list.length) {
    box.innerHTML = '<div class="empty-state">还没有需求。</div>';
    return;
  }
  box.innerHTML = list.map((demand, index) => `<div class="list-row"><div><b>${escapeHtml(demand.title)}</b><span>${escapeHtml(demand.type === 'commerce' ? '模拟商业需求' : demand.type)} · ${(demand.responses || []).length} 个回应</span></div><button class="text-button" data-demand="${index}">查看</button></div>`).join('');
  $$('[data-demand]', box).forEach((button) => button.addEventListener('click', () => showDemandDetail(list[Number(button.dataset.demand)])));
}

function showTaskDetail(task) {
  const isMine = state.tasks.some((item) => item.id === task.id);
  const favorite = state.favorites.some((entry) => entry.type === 'task' && entry.id === task.id);
  openSheet(`
    <div class="sheet-inner">
      <h2 class="sheet-title" id="sheetTitle" tabindex="-1">${escapeHtml(task.title)}</h2>
      <p class="sheet-subtitle">发布人 ${escapeHtml(task.by || '木叶来客')} · 虚拟预算 ${task.reward} 树果币${task.status === 'closed' ? ' · 已关闭' : ''}</p>
      ${task.desc ? `<div class="status-banner">${escapeHtml(task.desc)}</div>` : ''}
      ${task.requirement ? `<div class="note-section"><h3>要求</h3><p>${escapeHtml(task.requirement)}</p></div>` : ''}
      <div class="note-section"><h3>异步回应 ${task.responses.length}</h3>
        <div class="comment-list">${task.responses.length ? task.responses.map((response) => `<div class="comment"><b>${escapeHtml(response.name)}</b><span>${escapeHtml(response.text)}</span></div>`).join('') : '<div class="empty-state">还没有回应。你可以先看看，或直接回应。</div>'}</div>
      </div>
      <form class="note-section" id="taskResponseForm">
        <h3>回应委托</h3>
        <label>我的回应<textarea name="response" rows="3" required placeholder="说明你能提供什么素材，或描述你的方案"></textarea></label>
        <label>附素材（可选）<input name="file" type="file" accept="video/*,image/*" /></label>
        <div class="media-actions">
          <button class="primary-button" type="submit">回应委托</button>
          <button class="paper-button" id="taskFavoriteButton">${favorite ? '已收藏' : '收藏委托'}</button>
          ${isMine && task.status === 'open' ? '<button class="danger-button" id="closeTaskButton">关闭委托</button>' : ''}
        </div>
      </form>
    </div>
  `, () => {
    $('#taskResponseForm').addEventListener('submit', (event) => {
      event.preventDefault();
      const text = event.currentTarget.elements.response.value.trim();
      if (!text) return;
      task.responses.push({ name: state.profile.nickname || '木叶来客', text, at: fmtNow() });
      persist();
      logEvent('task_response', { task_id: task.id, length: text.length });
      closeSheet();
      showToast('回应已挂到委托上');
    });
    $('#taskFavoriteButton').addEventListener('click', () => toggleFavorite(task, 'task'));
    const closeButton = $('#closeTaskButton', sheet);
    if (closeButton) closeButton.addEventListener('click', () => {
      task.status = 'closed';
      persist();
      logEvent('task_close', { task_id: task.id });
      showTaskDetail(task);
    });
  });
}

function showDemandDetail(demand) {
  const isMine = state.demands.some((item) => item.id === demand.id);
  const isCommerce = demand.type === 'commerce';
  const favorite = state.favorites.some((entry) => entry.type === 'demand' && entry.id === demand.id);
  const responses = demand.responses || [];
  openSheet(`
    <div class="sheet-inner">
      <h2 class="sheet-title" id="sheetTitle" tabindex="-1">${escapeHtml(demand.title)}</h2>
      <p class="sheet-subtitle">${escapeHtml(demand.type === 'commerce' ? '模拟商业需求' : demand.type)} · 发布人 ${escapeHtml(demand.by || '木叶来客')}${demand.closed ? ' · 已关闭' : ''}</p>
      ${demand.description ? `<div class="status-banner">${escapeHtml(demand.description)}</div>` : ''}
      ${isCommerce ? '<div class="danger-zone"><b>模拟说明</b><p>此需求不形成真实合同、支付或授权。所有金额都是树果币。</p></div>' : ''}
      <div class="note-section"><h3>异步回应 ${responses.length}</h3>
        <div class="comment-list">${responses.length ? responses.map((response) => `<div class="comment"><b>${escapeHtml(response.name)}</b><span>${escapeHtml(response.text)}</span></div>`).join('') : '<div class="empty-state">还没有回应。你可以只看看，或直接回应。</div>'}</div>
      </div>
      <form class="note-section" id="demandResponseForm">
        <h3>我的回应</h3>
        <label>回应内容<textarea name="response" rows="3" required placeholder="描述你的素材、文字或组合"></textarea></label>
        <div class="media-actions">
          <button class="primary-button" type="submit">发布异步回应</button>
          ${isCommerce && !isMine ? `<button class="paper-button" id="acceptCommerceButton">接取合作（虚拟）</button>` : ''}
          ${isCommerce && isMine ? `<button class="paper-button" id="startCommerceButton">发起合作（虚拟）</button>` : ''}
          <button class="paper-button" id="demandFavoriteButton">${favorite ? '已收藏' : '收藏需求'}</button>
          ${isMine && !demand.closed ? '<button class="danger-button" id="closeDemandButton">关闭需求</button>' : ''}
          ${isMine && !demand.closed ? '<button class="paper-button" id="editDemandButton">修改需求</button>' : ''}
        </div>
      </form>
    </div>
  `, () => {
    $('#demandResponseForm').addEventListener('submit', (event) => {
      event.preventDefault();
      const text = event.currentTarget.elements.response.value.trim();
      if (!text) return;
      responses.push({ name: state.profile.nickname || '木叶来客', text, at: fmtNow() });
      persist();
      logEvent('demand_response', { demand_id: demand.id, length: text.length });
      closeSheet();
      showToast('回应已挂到公告树上');
    });
    $('#demandFavoriteButton').addEventListener('click', () => toggleFavorite(demand, 'demand'));
    const acceptButton = $('#acceptCommerceButton', sheet);
    if (acceptButton) acceptButton.addEventListener('click', () => startCommerce(demand, '创作者'));
    const startButton = $('#startCommerceButton', sheet);
    if (startButton) startButton.addEventListener('click', () => startCommerce(demand, '需求方'));
    const closeButton = $('#closeDemandButton', sheet);
    if (closeButton) closeButton.addEventListener('click', () => {
      demand.closed = true;
      persist();
      logEvent('demand_close', { demand_id: demand.id });
      showDemandDetail(demand);
    });
    const editButton = $('#editDemandButton', sheet);
    if (editButton) editButton.addEventListener('click', () => showWorkshop('editDemand', demand));
  });
}

function startCommerce(demand, side) {
  const amount = demand.budget || 40;
  const ongoing = state.commerce.some((record) => record.demandId === demand.id && record.status === 'ongoing');
  if (ongoing) return showToast('这个需求已有一份进行中的合作');
  state.commerce.push({ id: `c-${Date.now()}`, title: demand.title, side, status: 'ongoing', amount, createdAt: fmtNow(), demandId: demand.id });
  if (side === '需求方') {
    state.ledger.push({ id: `l-${Date.now()}`, label: `虚拟支出 · ${demand.title}`, amount: -Math.round(amount * (1 + SERVICE_FEE)), at: fmtNow() });
  }
  persist();
  logEvent('commerce_start', { demand_id: demand.id, side });
  closeSheet();
  showToast('合作已建立（虚拟），可在“我的发布 → 合作”查看');
}

function completeCommerce(record) {
  record.status = 'completed';
  record.completedAt = fmtNow();
  const income = Math.round(record.amount * (1 - SERVICE_FEE));
  state.ledger.push({ id: `l-${Date.now()}`, label: `虚拟收益 · ${record.title}`, amount: income, at: fmtNow() });
  persist();
  logEvent('commerce_complete', { commerce_id: record.id, income });
  showToast(`合作完成，虚拟收益 ${income} 树果币`);
  showMyPublications('commerce');
}

function showRating(record) {
  openSheet(`
    <div class="sheet-inner">
      <h2 class="sheet-title" id="sheetTitle" tabindex="-1">评价这次合作</h2>
      <p class="sheet-subtitle">评价只影响虚拟信誉，不产生真实处罚或奖励。</p>
      <form id="ratingForm">
        <div class="choice-grid">
          <button class="choice-button" type="button" data-score="happy"><b>满意</b><span>交付符合预期</span></button>
          <button class="choice-button" type="button" data-score="ok"><b>一般</b><span>基本可用，有改进空间</span></button>
          <button class="choice-button" type="button" data-score="bad"><b>不满意</b><span>与描述差异较大</span></button>
        </div>
        <label>评价内容<textarea name="text" rows="3" placeholder="一句话说明你的感受"></textarea></label>
        <button class="primary-button" type="submit">提交评价</button>
      </form>
    </div>
  `, () => {
    let score = 'ok';
    $$('[data-score]', sheet).forEach((button) => button.addEventListener('click', () => {
      score = button.dataset.score;
      $$('[data-score]', sheet).forEach((node) => node.classList.toggle('is-selected', node === button));
    }));
    $('#ratingForm').addEventListener('submit', (event) => {
      event.preventDefault();
      const text = event.currentTarget.elements.text.value.trim();
      state.ratings.push({ target: record.title, score, text, at: fmtNow() });
      record.rated = true;
      persist();
      logEvent('rating', { target: record.title, score });
      closeSheet();
      showToast('评价已记录，影响虚拟信誉');
    });
  });
}

function showMyPublications(tab = 'uploads') {
  const tabs = [
    ['uploads', '上传', state.uploads.length],
    ['demands', '需求', state.demands.length],
    ['tasks', '委托', state.tasks.length],
    ['drafts', '草稿', state.drafts.length],
    ['commerce', '合作', state.commerce.length],
  ];
  openSheet(`
    <div class="sheet-inner">
      <h2 class="sheet-title" id="sheetTitle" tabindex="-1">我的发布</h2>
      <p class="sheet-subtitle">你发布到公共世界的内容和合作记录都在这里，可以定位、修改或关闭。</p>
      <div class="tab-row">${tabs.map(([id, label, count]) => `<button class="tab-button${tab === id ? ' is-active' : ''}" data-tab="${id}">${label} ${count}</button>`).join('')}</div>
      <div class="tab-panel is-active">${renderPublicationTab(tab)}</div>
    </div>
  `, () => {
    $$('.tab-button', sheet).forEach((button) => button.addEventListener('click', () => showMyPublications(button.dataset.tab)));
    bindPublicationActions();
  });
}

function renderPublicationTab(tab) {
  if (tab === 'uploads') {
    if (!state.uploads.length) return '<div class="empty-state">还没有上传。到共创工作台上传视频，它会长成营地里的放映物。</div>';
    return state.uploads.map((item, index) => `<div class="list-row"><div><b>${escapeHtml(item.title)}</b><span>${escapeHtml(item.fileName || '未附文件')} · ${item.status === 'metadata-only' ? '仅元数据' : '本地可回放'}</span></div><div class="row-actions"><button class="text-button" data-open-upload="${index}">打开</button><button class="text-button" data-locate-upload="${index}">定位</button></div></div>`).join('');
  }
  if (tab === 'demands') {
    if (!state.demands.length) return '<div class="empty-state">还没有发布需求。</div>';
    return state.demands.map((item, index) => `<div class="list-row"><div><b>${escapeHtml(item.title)}</b><span>${escapeHtml(item.type === 'commerce' ? '模拟商业需求' : item.type)} · ${item.closed ? '已关闭' : '进行中'} · ${(item.responses || []).length} 个回应</span></div><button class="text-button" data-open-demand="${index}">查看</button></div>`).join('');
  }
  if (tab === 'tasks') {
    if (!state.tasks.length) return '<div class="empty-state">还没有发布委托。</div>';
    return state.tasks.map((item, index) => `<div class="list-row"><div><b>${escapeHtml(item.title)}</b><span>${item.status === 'closed' ? '已关闭' : '进行中'} · ${item.responses.length} 个回应</span></div><button class="text-button" data-open-task="${index}">查看</button></div>`).join('');
  }
  if (tab === 'drafts') {
    if (!state.drafts.length) return '<div class="empty-state">没有草稿。发布需求和委托时可以保存草稿。</div>';
    return state.drafts.map((item, index) => `<div class="list-row"><div><b>${escapeHtml(item.title)}</b><span>${escapeHtml(item.kind === 'task' ? '委托草稿' : '需求草稿')}</span></div><div class="row-actions"><button class="text-button" data-edit-draft="${index}">继续编辑</button><button class="text-button" data-delete-draft="${index}">删除</button></div></div>`).join('');
  }
  if (tab === 'commerce') {
    if (!state.commerce.length) return '<div class="empty-state">还没有合作记录。在模拟商业需求里发起或接取合作。</div>';
    return state.commerce.map((item, index) => `<div class="list-row"><div><b>${escapeHtml(item.title)}</b><span>${item.side === '需求方' ? '我发起' : '我接取'} · ${item.amount} 树果币 · ${escapeHtml(item.status === 'completed' ? item.completedAt : item.createdAt)}</span></div><div class="row-actions">${item.status === 'ongoing' ? `<span class="status-pill">进行中</span><button class="text-button" data-complete-commerce="${index}">确认完成</button>` : item.rated ? `<span class="status-pill is-completed">已完成</span><span class="status-pill">已评价</span>` : `<span class="status-pill is-completed">已完成</span><button class="text-button" data-rate-commerce="${index}">评价</button>`}</div></div>`).join('');
  }
  return '';
}

function bindPublicationActions() {
  $$('[data-open-upload]', sheet).forEach((button) => button.addEventListener('click', () => showPublishedCreation({ ...state.uploads[Number(button.dataset.openUpload)], kind: 'upload' })));
  $$('[data-locate-upload]', sheet).forEach((button) => button.addEventListener('click', () => {
    const index = Number(button.dataset.locateUpload);
    const point = creationPosition('upload', index);
    state.wx = point.wx - 150;
    state.wy = point.wy + 80;
    closeSheet();
    renderWorld();
    persist();
    showToast('已回到这件发布物附近');
  }));
  $$('[data-open-demand]', sheet).forEach((button) => button.addEventListener('click', () => showDemandDetail(state.demands[Number(button.dataset.openDemand)])));
  $$('[data-open-task]', sheet).forEach((button) => button.addEventListener('click', () => showTaskDetail(state.tasks[Number(button.dataset.openTask)])));
  $$('[data-edit-draft]', sheet).forEach((button) => button.addEventListener('click', () => showWorkshop('draft', state.drafts[Number(button.dataset.editDraft)])));
  $$('[data-delete-draft]', sheet).forEach((button) => button.addEventListener('click', () => {
    state.drafts.splice(Number(button.dataset.deleteDraft), 1);
    persist();
    showMyPublications('drafts');
  }));
  $$('[data-complete-commerce]', sheet).forEach((button) => button.addEventListener('click', () => completeCommerce(state.commerce[Number(button.dataset.completeCommerce)])));
  $$('[data-rate-commerce]', sheet).forEach((button) => button.addEventListener('click', () => showRating(state.commerce[Number(button.dataset.rateCommerce)])));
}

function showWorkshop(mode = 'upload', relatedItem = null) {
  const editing = mode === 'editDemand' && relatedItem;
  const fromDraft = mode === 'draft' && relatedItem;
  const kind = editing ? relatedItem.type : fromDraft ? relatedItem.kind : mode === 'demand' ? 'personal' : mode === 'response' ? 'upload' : mode;
  const initial = editing || fromDraft ? relatedItem : {};
  const responseNote = mode === 'response' && relatedItem ? `<div class="status-banner">正在回应《${escapeHtml(relatedItem.title)}》</div>` : '';
  openSheet(`
    <div class="sheet-inner">
      <h2 class="sheet-title" id="sheetTitle" tabindex="-1">${editing ? '修改需求' : fromDraft ? '继续编辑草稿' : '创作工坊'}</h2>
      <p class="sheet-subtitle">上传会变成共创营地里的可见放映物，需求会变成需求纸树旁的纸条，委托会挂上委托纸树。原型文件保存在当前浏览器；正式版由服务端写入飞书。</p>
      ${responseNote}
      <div class="choice-grid">
        <button class="choice-button" data-work="upload"><b>上传公共素材</b><span>视频、预览和封面将进入飞书云空间</span></button>
        <button class="choice-button" data-work="personal"><b>发布个人需求</b><span>邀请别人提供灵感或素材</span></button>
        <button class="choice-button" data-work="commerce"><b>发布模拟商业需求</b><span>不会形成真实合同或交易</span></button>
        <button class="choice-button" data-work="task"><b>发布委托</b><span>说明要求与虚拟预算，等待回应</span></button>
        <button class="choice-button" data-work="display"><b>发布我的展览</b><span>把个人空间的组合公开展示</span></button>
      </div>
      <form class="note-section" id="workForm">
        <label>标题<input name="title" required placeholder="给这次创作一个具体名称" value="${escapeHtml(initial.title || '')}" /></label>
        <label>说明<textarea name="description" rows="3" required placeholder="说明你希望别人如何理解或回应">${escapeHtml(initial.description || '')}</textarea></label>
        <label id="requirementLabel" hidden>要求<textarea name="requirement" rows="2" placeholder="例如：1080p，无人物正脸">${escapeHtml(initial.requirement || '')}</textarea></label>
        <label id="rewardLabel" hidden>虚拟预算（树果币）<input name="reward" type="number" min="0" max="999" value="${initial.reward ?? ''}" /></label>
        <label id="fileLabel" hidden>素材文件<input name="file" type="file" accept="video/*,image/*" /></label>
        <p class="form-error" id="workError" role="alert"></p>
        <div class="media-actions">
          <button class="primary-button" type="submit">发布到聚落</button>
          <button class="paper-button" id="saveDraftButton" hidden>保存草稿</button>
        </div>
      </form>
    </div>
  `, () => {
    let currentKind = kind;
    const buttonFor = (name) => $$('[data-work]', sheet).find((node) => node.dataset.work === name);
    const applyKind = (next) => {
      currentKind = next;
      $$('[data-work]', sheet).forEach((node) => node.classList.toggle('is-selected', node === buttonFor(next)));
      $('#fileLabel', sheet).hidden = next !== 'upload';
      $('#requirementLabel', sheet).hidden = next !== 'task';
      $('#rewardLabel', sheet).hidden = next !== 'task';
      $('#saveDraftButton', sheet).hidden = !['personal', 'commerce', 'task'].includes(next) || editing;
    };
    applyKind(currentKind);
    $$('[data-work]', sheet).forEach((button) => button.addEventListener('click', () => applyKind(button.dataset.work)));
    $('#saveDraftButton', sheet).addEventListener('click', () => {
      const form = $('#workForm', sheet);
      const title = form.elements.title.value.trim();
      if (!title) return $('#workError', sheet).textContent = '请先填写标题再保存草稿。';
      state.drafts.push({
        id: crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`,
        kind: currentKind,
        title,
        description: form.elements.description.value.trim(),
        requirement: form.elements.requirement?.value.trim() || '',
        reward: Number(form.elements.reward?.value || 0),
      });
      persist();
      logEvent('draft_save', { kind: currentKind });
      closeSheet();
      showToast('草稿已保存到“我的发布 → 草稿”');
    });
    $('#workForm', sheet).addEventListener('submit', async (event) => {
      event.preventDefault();
      const form = event.currentTarget;
      const title = form.elements.title.value.trim();
      const description = form.elements.description.value.trim();
      if (!title || !description) return $('#workError', sheet).textContent = '请填写标题和说明。';
      const id = crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`;
      if (editing) {
        relatedItem.title = title;
        relatedItem.description = description;
        persist();
        logEvent('demand_edit', { demand_id: relatedItem.id });
        closeSheet();
        showDemandDetail(relatedItem);
        showToast('需求已修改');
        return;
      }
      if (currentKind === 'upload') {
        const file = form.elements.file.files?.[0] || null;
        state.uploads.push({ id, title, description, fileName: file?.name || '', mime: file?.type || '', status: file ? 'stored-locally' : 'preview-slot' });
        try {
          await saveUploadFile(id, file);
        } catch {
          state.uploads[state.uploads.length - 1].status = 'metadata-only';
        }
        persist();
        logEvent('asset_upload_mock', { title, related_asset: relatedItem?.id || null });
        closeSheet();
        state.worldMode = 'overworld';
        state.wx = 350;
        state.wy = 130;
        renderCreations();
        renderWorld();
        say(`《${title}》已经成为共创营地里的可见放映物。靠近后点击它，可以重新打开你刚才上传的文件。`);
        showToast('上传已出现在共创营地');
      } else if (currentKind === 'task') {
        state.tasks.push({
          id, title, description,
          requirement: form.elements.requirement?.value.trim() || '',
          reward: Number(form.elements.reward?.value || 0),
          by: state.profile.nickname || '木叶来客',
          status: 'open',
          responses: [],
        });
        persist();
        logEvent('task_publish', { title, reward: state.tasks[state.tasks.length - 1].reward });
        closeSheet();
        say(`“${title}”已经挂上委托纸树。回应会异步出现，不会倒计时催促。`);
        showToast('委托已挂上委托纸树');
      } else if (currentKind === 'display') {
        state.exhibitions.push({ id, title, description, at: fmtNow() });
        persist();
        logEvent('exhibition_publish', { title });
        closeSheet();
        say(`“${title}”挂到了聚落的公告角落。路过的邻居可以看到它。`);
        showToast('展览已发布');
      } else {
        state.demands.push({ id, title, description, type: currentKind, by: state.profile.nickname || '木叶来客', responses: [], closed: false, createdAt: fmtNow() });
        persist();
        logEvent('publish_demand', { kind: currentKind, title, related_asset: relatedItem?.id || null });
        closeSheet();
        state.worldMode = 'overworld';
        state.wx = 170;
        state.wy = -80;
        renderCreations();
        renderWorld();
        say(`“${title}”已经成为需求纸树旁的一张可见纸条，不再藏在面板里。`);
        showToast('需求纸已出现在地图上');
      }
      if (fromDraft) {
        state.drafts = state.drafts.filter((draft) => draft.id !== relatedItem.id);
        persist();
      }
    });
  });
}

function showCreateEvent() {
  openSheet(`
    <div class="sheet-inner">
      <h2 class="sheet-title" id="sheetTitle" tabindex="-1">创建世界事件</h2>
      <p class="sheet-subtitle">事件不能进入任务列表，不能强制参与，也不能要求固定答案。</p>
      <form id="eventForm">
        <label>事件描述<input name="title" value="所有圆形素材开始寻找邻居" required /></label>
        <label>持续方式<select name="duration"><option>本次访问</option><option>直到多数玩家改变它</option></select></label>
        <button class="primary-button" type="submit">让事件出现</button>
      </form>
    </div>
  `, () => $('#eventForm').addEventListener('submit', (event) => {
    event.preventDefault();
    logEvent('world_event_create', { title: event.currentTarget.elements.title.value });
    closeSheet();
    showToast('世界事件出现了，所有人都可以忽略');
  }));
}

function showNeighbor() {
  const exhibitions = state.exhibitions.length
    ? `<div class="note-section"><h3>聚落展览</h3>${state.exhibitions.slice(-3).reverse().map((item) => `<div class="comment"><b>${escapeHtml(item.title)}</b><span>${escapeHtml(item.description)}</span></div>`).join('')}</div>`
    : '';
  openSheet(`
    <div class="sheet-inner">
      <h2 class="sheet-title" id="sheetTitle" tabindex="-1">晚枝修理所</h2>
      <p class="sheet-subtitle">一个其他玩家公开展示的空间。你只能观看和回应，不能移动对方的物件。</p>
      <div class="video-frame"><span class="video-status">邻居空间预览</span></div>
      ${exhibitions}
      <div class="note-section"><h3>邻居留言</h3>
        <div class="comment-list">${state.neighborComments.length ? state.neighborComments.map((comment) => `<div class="comment"><b>${escapeHtml(comment.name)}</b><span>${escapeHtml(comment.text)}</span></div>`).join('') : '<div class="empty-state">还没有留言。你可以留下一句，也可以什么都不说。</div>'}</div>
        <form id="neighborCommentForm">
          <label>留下一句回应<input name="comment" maxlength="80" required placeholder="想对空间主人说的话" /></label>
          <button class="primary-button" type="submit">留下</button>
        </form>
      </div>
      <div class="media-actions">
        <button class="primary-button" id="followButton">${state.following ? '取消关注' : '关注这个空间'}</button>
        <button class="paper-button" id="rateNeighborButton">评价空间主人</button>
      </div>
    </div>
  `, () => {
    $('#followButton').addEventListener('click', () => {
      state.following = !state.following;
      persist();
      logEvent(state.following ? 'follow' : 'unfollow', { space_id: 'late-branch-repair' });
      showNeighbor();
    });
    $('#neighborCommentForm').addEventListener('submit', (event) => {
      event.preventDefault();
      const text = event.currentTarget.elements.comment.value.trim();
      if (!text) return;
      state.neighborComments.push({ name: state.profile.nickname || '木叶来客', text });
      persist();
      logEvent('neighbor_comment', { length: text.length });
      showNeighbor();
    });
    $('#rateNeighborButton').addEventListener('click', () => showRating({ title: '晚枝修理所' }));
  });
}

function showAnomaly() {
  openSheet(`
    <div class="sheet-inner">
      <h2 class="sheet-title" id="sheetTitle" tabindex="-1">今日异象：世界正在失去红色</h2>
      <p class="sheet-subtitle">你可以恢复、替代、混合，或者完全忽略。没有倒计时，也不会留下未完成压力。</p>
      <div class="choice-grid">
        <button class="choice-button" data-event-choice="restore"><b>尝试恢复红色</b><span>把砖红色重新放回自己的物件</span></button>
        <button class="choice-button" data-event-choice="replace"><b>用青绿色替代</b><span>让世界接受一次新的颜色关系</span></button>
        <button class="choice-button" data-event-choice="ignore"><b>什么都不做</b><span>继续按自己的方式探索</span></button>
        <button class="choice-button" data-event-choice="mix"><b>把两种颜色混在一起</b><span>产生一个无法预先判断的结果</span></button>
      </div>
    </div>
  `, () => $$('[data-event-choice]', sheet).forEach((button) => button.addEventListener('click', () => {
    state.eventChoice = button.dataset.eventChoice;
    worldStage.classList.toggle('event-muted', state.eventChoice !== 'restore');
    persist();
    logEvent('world_event_response', { choice: state.eventChoice });
    closeSheet();
    const messages = { restore: '你把红色留在了自己的树屋。', replace: '青绿色暂时接管了部分世界。', ignore: '你选择继续散步，世界没有催促你。', mix: '两种颜色暂时达成了不稳定的和平。' };
    say(messages[state.eventChoice]);
  })));
}

function showAbout() {
  openSheet(`
    <div class="sheet-inner">
      <h2 class="sheet-title" id="sheetTitle" tabindex="-1">这个世界如何运作</h2>
      <p class="sheet-subtitle">公共素材属于公共世界。任何人都可以观看、收藏、上传、发布需求和委托、参与虚拟竞价与合作，但只能改造自己的空间。</p>
      <div class="choice-grid">
        <div class="choice-button"><b>没有身份限制</b><span>所有玩家拥有相同的基础能力</span></div>
        <div class="choice-button"><b>没有任务中心</b><span>事件和委托都是邀请，不会制造待办压力</span></div>
        <div class="choice-button"><b>原始事件保留</b><span>拾取不等于收藏，靠近不等于喜欢</span></div>
        <div class="choice-button"><b>竞价与结算完全虚拟</b><span>NPC 始终标记，不伪装成真人</span></div>
      </div>
    </div>
  `);
}

function showProfilePanel(type) {
  profileDrawer.hidden = true;
  scrim.hidden = false;
  const panels = {
    profile: showProfileForm,
    favorites: showFavorites,
    publications: showMyPublications,
    data: showData,
    balance: showBalance,
    security: showSecurity,
    help: showHelpFeedback,
    privacy: showPrivacy,
    admin: showAdmin,
  };
  panels[type]?.();
}

function showProfileForm() {
  const profile = state.profile;
  openSheet(`
    <div class="sheet-inner">
      <h2 class="sheet-title" id="sheetTitle" tabindex="-1">角色与空间</h2>
      <p class="sheet-subtitle">虚拟形象会逐步形成，不需要复杂捏脸。</p>
      <form id="profileForm">
        <label>头像
          <span class="avatar-row">${AVATAR_SWATCHES.map((swatch, index) => `<button type="button" class="avatar-swatch${profile.avatar === index ? ' is-selected' : ''}" data-avatar="${index}" style="--swatch:${swatch.color}" aria-label="头像 ${swatch.glyph}">${swatch.glyph}</button>`).join('')}</span>
        </label>
        <label>昵称<input name="nickname" value="${escapeHtml(profile.nickname)}" required /></label>
        <label>一句话介绍<input name="bio" value="${escapeHtml(profile.bio)}" /></label>
        <label>兴趣词<input name="interests" value="${escapeHtml(profile.interests)}" /></label>
        <label>个人空间名称<input name="spaceName" value="${escapeHtml(profile.spaceName)}" /></label>
        <button class="primary-button" type="submit">保存角色</button>
      </form>
    </div>
  `, () => {
    $$('[data-avatar]', sheet).forEach((button) => button.addEventListener('click', () => {
      profile.avatar = Number(button.dataset.avatar);
      $$('[data-avatar]', sheet).forEach((node) => node.classList.toggle('is-selected', node === button));
    }));
    $('#profileForm').addEventListener('submit', (event) => {
      event.preventDefault();
      const form = event.currentTarget;
      profile.nickname = form.elements.nickname.value.trim() || profile.nickname;
      profile.bio = form.elements.bio.value.trim();
      profile.interests = form.elements.interests.value.trim();
      profile.spaceName = form.elements.spaceName.value.trim() || '左枝小屋';
      persist();
      logEvent('profile_update');
      closeSheet();
      refreshIdentity();
      showToast('角色资料已保存');
    });
  });
}

function showData() {
  const stats = [
    ['探索步数', Math.round(state.exploreSteps), 8000],
    ['观看影像', countEvent('asset_open'), 60],
    ['播放次数', countEvent('play'), 60],
    ['拾取影子', countEvent('pick_up'), 40],
    ['留下评论', countEvent('comment'), 30],
    ['收藏数量', state.favorites.length, 30],
    ['出价次数', countEvent('auction_bid'), 30],
    ['发布内容', state.uploads.length + state.demands.length + state.tasks.length, 20],
    ['完成合作', state.commerce.filter((item) => item.status === 'completed').length, 10],
  ];
  const max = Math.max(1, ...stats.map(([, , cap]) => cap), ...stats.map(([, value]) => value));
  const level = creatorLevel();
  const avg = ratingAverage();
  openSheet(`
    <div class="sheet-inner">
      <h2 class="sheet-title" id="sheetTitle" tabindex="-1">数据与成长</h2>
      <p class="sheet-subtitle">原始行为不会被直接解释成喜欢或不喜欢；这里展示的是用于研究参考的派生信号。</p>
      <div class="auction-price">
        <div class="price-block"><span>创作者等级</span><strong>${level.label}</strong></div>
        <div class="price-block"><span>合作评价均分</span><strong>${avg || '—'}</strong></div>
      </div>
      <div class="note-section"><h3>行为统计</h3>
        ${stats.map(([label, value]) => `<div class="stat-row"><span>${label}</span><div class="stat-track"><i style="width:${Math.round(value / max * 100)}%"></i></div><b>${value}</b></div>`).join('')}
      </div>
      <div class="note-section"><h3>等级怎么来</h3>
        <p>等级综合完成合作次数、虚拟收益、上传数量和好评次数计算（当前 ${level.score} 分）。原型只展示计算规则，不做排行榜。</p>
      </div>
    </div>
  `);
}

function showBalance() {
  const income = state.ledger.filter((item) => item.amount > 0).reduce((sum, item) => sum + item.amount, 0);
  const balance = Math.max(0, income - state.withdrawn);
  const rows = state.ledger.length
    ? [...state.ledger].reverse().map((item) => `<div class="list-row"><div><b>${escapeHtml(item.label)}</b><span>${escapeHtml(item.at)}</span></div><b class="${item.amount >= 0 ? 'amount-in' : 'amount-out'}">${item.amount >= 0 ? '+' : ''}${item.amount}</b></div>`).join('')
    : '<div class="empty-state">还没有虚拟收支记录。</div>';
  openSheet(`
    <div class="sheet-inner">
      <h2 class="sheet-title" id="sheetTitle" tabindex="-1">虚拟账本</h2>
      <p class="sheet-subtitle">全部为树果币虚拟记录：不可提现、不可兑换、不产生真实购买或授权。</p>
      <div class="auction-price">
        <div class="price-block"><span>累计虚拟收益</span><strong>${income}</strong></div>
        <div class="price-block"><span>虚拟余额</span><strong>${balance}</strong></div>
      </div>
      <div class="status-banner">服务费：平台按 10% 收取。创作者收入 = 金额 × 90%，需求方支出 = 金额 × 110%。原型中预算固定为 76 树果币，正式版由服务端发放。</div>
      <div class="note-section"><h3>收支明细</h3>${rows}</div>
      <div class="media-actions">
        <button class="paper-button" id="withdrawButton">模拟提现</button>
        <button class="text-button" id="feeButton">服务费标准说明</button>
      </div>
    </div>
  `, () => {
    $('#withdrawButton').addEventListener('click', () => {
      if (balance <= 0) return showToast('当前没有可模拟提现的虚拟余额');
      state.withdrawn += balance;
      state.ledger.push({ id: `l-${Date.now()}`, label: '模拟提现（不产生真实到账）', amount: -balance, at: fmtNow() });
      persist();
      logEvent('withdraw_mock', { amount: balance });
      showBalance();
      showToast('提现已模拟记录，不产生真实到账');
    });
    $('#feeButton').addEventListener('click', showServiceFee);
  });
}

function showServiceFee() {
  openSheet(`
    <div class="sheet-inner">
      <h2 class="sheet-title" id="sheetTitle" tabindex="-1">服务费标准说明</h2>
      <p class="sheet-subtitle">这是原型中的模拟费率，只用于理解结算逻辑，不构成真实商业承诺。</p>
      <div class="choice-grid">
        <div class="choice-button"><b>创作者</b><span>收入 = 订单金额 × (1 − 10%)</span></div>
        <div class="choice-button"><b>需求方</b><span>支出 = 订单金额 × (1 + 10%)</span></div>
        <div class="choice-button"><b>结算周期</b><span>模拟为合作完成 24 小时后</span></div>
        <div class="choice-button"><b>提现方式</b><span>原型只记录，不执行真实到账</span></div>
      </div>
    </div>
  `);
}

function showSecurity() {
  const authRows = [
    ['手机认证', 'auth.phone', '绑定手机号，用于登录与验证'],
    ['邮箱认证', 'auth.email', '绑定邮箱，用于找回与通知'],
    ['实名认证', 'auth.realname', '模拟身份核验，不收集真实证件'],
    ['收款账号', 'auth.payment', '虚拟收款信息，不关联真实账户'],
  ];
  openSheet(`
    <div class="sheet-inner">
      <h2 class="sheet-title" id="sheetTitle" tabindex="-1">安全与认证</h2>
      <p class="sheet-subtitle">原型中的认证与安全流程全部为本地模拟，正式版由服务端核验。</p>
      <form class="note-section" id="passwordForm">
        <h3>修改密码</h3>
        <label>新密码<input name="password" type="password" minlength="8" required /></label>
        <label>确认新密码<input name="confirm" type="password" minlength="8" required /></label>
        <p class="form-error" id="passwordError"></p>
        <button class="primary-button" type="submit">更新密码</button>
      </form>
      <div class="note-section"><h3>认证状态</h3>
        <div class="list-stack">${authRows.map(([label, key, desc]) => {
          const done = state.auth[key.split('.')[1]];
          return `<div class="list-row"><div><b>${label}</b><span>${done ? '已完成' : desc}</span></div><button class="text-button" data-auth="${key}">${done ? '查看' : '去认证'}</button></div>`;
        }).join('')}</div>
      </div>
      <div class="note-section"><h3>登录设备</h3>
        <div class="list-stack">${state.devices.length ? state.devices.map((device) => `<div class="list-row"><div><b>${escapeHtml(device.name)}</b><span>${device.current ? '当前设备' : `最近活动 ${escapeHtml(device.lastAt)}`}</span></div>${device.current ? '' : `<button class="text-button" data-device="${device.id}">退出该设备</button>`}</div>`).join('') : '<div class="empty-state">没有其他登录设备。</div>'}</div>
      </div>
    </div>
  `, () => {
    $('#passwordForm').addEventListener('submit', (event) => {
      event.preventDefault();
      const form = event.currentTarget;
      if (form.elements.password.value !== form.elements.confirm.value) return $('#passwordError').textContent = '两次密码不一致。';
      persist();
      logEvent('password_change_mock');
      showToast('密码已更新（原型模拟）');
    });
    $$('[data-auth]', sheet).forEach((button) => button.addEventListener('click', () => {
      const key = button.dataset.auth;
      const field = key.split('.')[1];
      if (state.auth[field]) return showToast('已认证，原型为本地模拟');
      state.auth[field] = true;
      persist();
      logEvent('auth_mock', { field, active: true });
      showSecurity();
      showToast('认证已完成（本地模拟）');
    }));
    $$('[data-device]', sheet).forEach((button) => button.addEventListener('click', () => {
      state.devices = state.devices.filter((device) => device.id !== button.dataset.device);
      persist();
      logEvent('device_revoke', { device_id: button.dataset.device });
      showSecurity();
    }));
  });
}

const FAQ_ITEMS = [
  ['如何观看公共影像？', '走近影像窗，按 E 或点击打开。空格键播放或暂停。'],
  ['影子是什么？', '观看后可以按 F 带走一枚投影副本，公共原片不会被移动。'],
  ['树果币怎么用？', '虚拟预算用于竞价和模拟结算，不可提现、不可兑换。'],
  ['NPC 是谁？', '竞价和世界事件中的参与者如果标记为 NPC，就不是真人用户。'],
  ['我的数据会被用于训练吗？', '不会提供给第三方训练。你可以随时退出研究，账户仍然保留。'],
  ['如何发布需求、委托或合作？', '到共创工作台或公告树，选择发布需求、发布委托或模拟商业需求。'],
];

function showHelpFeedback() {
  openSheet(`
    <div class="sheet-inner">
      <h2 class="sheet-title" id="sheetTitle" tabindex="-1">帮助与反馈</h2>
      <p class="sheet-subtitle">常见问题与意见反馈。反馈会进入本地记录，正式版通过服务端收集。</p>
      <div class="note-section"><h3>常见问题</h3>
        ${FAQ_ITEMS.map(([question, answer]) => `<details class="faq-item"><summary>${escapeHtml(question)}</summary><p>${escapeHtml(answer)}</p></details>`).join('')}
      </div>
      <form class="note-section" id="feedbackForm">
        <h3>意见反馈</h3>
        <label>你的反馈<textarea name="feedback" rows="3" required placeholder="遇到的问题或建议"></textarea></label>
        <label>联系方式（可选）<input name="contact" placeholder="邮箱或昵称" /></label>
        <button class="primary-button" type="submit">提交反馈</button>
      </form>
    </div>
  `, () => $('#feedbackForm').addEventListener('submit', (event) => {
    event.preventDefault();
    const text = event.currentTarget.elements.feedback.value.trim();
    state.feedback.push({ text, contact: event.currentTarget.elements.contact.value.trim(), at: fmtNow() });
    persist();
    logEvent('feedback', { length: text.length });
    closeSheet();
    showToast('反馈已记录，感谢你的意见');
  }));
}

function showPrivacy() {
  openSheet(`
    <div class="sheet-inner">
      <h2 class="sheet-title" id="sheetTitle" tabindex="-1">数据与隐私</h2>
      <p class="sheet-subtitle">适用年龄为 16 岁及以上。浏览、移动、评论、组合与竞价会被记录，用于推荐优化和模型研究，不会提供给第三方训练。</p>
      <div class="status-banner">数据默认长期保留。退出研究不会删除账户。删除申请会匿名化行为记录，并保留公共世界的连续性。</div>
      <label class="check-label"><input type="checkbox" id="researchToggle" ${state.research ? 'checked' : ''} /> 参与推荐与模型研究</label>
      <div class="media-actions"><button class="paper-button" id="exportData">导出我的行为记录</button><button class="danger-button" id="deleteData">申请删除并匿名化</button></div>
      <div class="danger-zone"><b>竞价说明</b><p>树果币无现金价值，不可提现、不可兑换。所有 NPC 出价者都会明确标记。</p></div>
    </div>
  `, () => {
    $('#researchToggle').addEventListener('change', (event) => { state.research = event.target.checked; persist(); logEvent('research_consent_change', { active: state.research }); showToast(state.research ? '已加入研究' : '已退出研究，账户仍然保留'); });
    $('#exportData').addEventListener('click', () => showToast(`已准备 ${state.rawEvents.length} 条原始事件的导出设计`));
    $('#deleteData').addEventListener('click', () => { state.anonymized = true; state.research = false; persist(); logEvent('deletion_request'); showToast('删除申请已记录，行为数据将匿名化'); });
  });
}

function showAdmin() {
  openSheet(`
    <div class="sheet-inner">
      <h2 class="sheet-title" id="sheetTitle" tabindex="-1">树屋维护簿</h2>
      <p class="sheet-subtitle">管理员原型范围：用户冻结、人工密码重置、内容审核、实验分组和数据导出。它不改变普通玩家的世界能力。</p>
      <div class="auction-price">
        <div class="price-block"><span>本地原始事件</span><strong>${state.rawEvents.length}</strong> 条</div>
        <div class="price-block"><span>待接入飞书写入</span><strong>${state.rawEvents.length}</strong> 条</div>
      </div>
      <div class="choice-grid">
        <button class="choice-button admin-action" data-action="reset"><b>人工密码重置</b><span>核验后生成一次性重置指引</span></button>
        <button class="choice-button admin-action" data-action="freeze"><b>冻结异常账户</b><span>保留数据并停止新会话</span></button>
        <button class="choice-button admin-action" data-action="review"><b>审核公共素材</b><span>${state.uploads.length} 个原型上传位置</span></button>
        <button class="choice-button admin-action" data-action="experiment"><b>实验分组</b><span>map-unified-v1 / flat-storybook</span></button>
      </div>
      <div class="status-banner">正式实现时，所有持久化必须经过服务端 Feishu Repository，浏览器不得直接持有飞书凭证。</div>
    </div>
  `, () => $$('.admin-action', sheet).forEach((button) => button.addEventListener('click', () => showToast(`已模拟：${button.querySelector('b').textContent}`))));
}

function observe() {
  if (!state.nearest) return say('附近没有需要你处理的事情。你可以继续走，也可以停下来看看树冠。');
  if (state.nearest.type === 'screen') return showMedia(state.nearest.index);
  const actions = { cottage: enterCottage, sound: showSoundDock, auction: showAuction, board: showBoard, workshop: () => showWorkshop(), neighbor: showNeighbor, anomaly: showAnomaly };
  actions[state.nearest.id]?.();
}

function useSecondaryVerb() {
  if (state.nearest?.type === 'screen') return collectShadow(state.nearest.index);
  placeShadow();
}

function frame(now) {
  const dt = Math.min(32, now - state.lastTime);
  state.lastTime = now;
  if (sheet.hidden && profileDrawer.hidden && entry.classList.contains('is-gone')) {
    const speed = state.worldMode === 'cottage' ? .018 * dt : .24 * dt;
    let dx = 0;
    let dy = 0;
    if (state.keys.has('a') || state.keys.has('arrowleft')) dx -= speed;
    if (state.keys.has('d') || state.keys.has('arrowright')) dx += speed;
    if (state.keys.has('w') || state.keys.has('arrowup')) dy -= speed;
    if (state.keys.has('s') || state.keys.has('arrowdown')) dy += speed;
    if (state.worldMode === 'cottage') {
      state.cottageX = Math.max(6, Math.min(94, state.cottageX + dx));
      state.cottageY = Math.max(30, Math.min(88, state.cottageY + dy));
    } else {
      state.wx += dx;
      state.wy += dy;
    }
    player.classList.toggle('is-moving', Boolean(dx || dy));
    if (dx || dy) {
      if (state.worldMode !== 'cottage') state.exploreSteps += Math.abs(dx) + Math.abs(dy);
      renderWorld();
    }
  } else {
    player.classList.remove('is-moving');
  }
  requestAnimationFrame(frame);
}

function enterWorld(mode) {
  entry.classList.add('is-gone');
  history.replaceState({}, '', appBasePath);
  localStorage.setItem('zhere-prototype-session', mode);
  if (mode === 'register-mock') {
    const data = new FormData($('#registerForm'));
    state.profile.nickname = data.get('nickname') || state.profile.nickname;
    state.profile.username = data.get('username') || state.profile.username;
    state.profile.spaceName = data.get('spaceName') || state.profile.spaceName;
    persist();
  }
  refreshIdentity();
  logEvent('session_start', { mode, consent_research: state.research });
  setTimeout(() => { entry.hidden = true; }, 320);
  say('这里没有地图边框。地标彼此相隔很远，方向提示只告诉你最近的两个信号；你也可以一直朝没有信号的方向走。');
}

function showEntryPage(page) {
  $$('.entry-page').forEach((node) => node.classList.toggle('is-active', node.dataset.entryPage === page));
  $('#entryBack').hidden = page === 'welcome';
  const route = page === 'forgot' ? 'forgot-password' : page;
  const path = page === 'welcome' ? appBasePath : `${appBasePath}#/${route}`;
  history.replaceState({}, '', path);
}

$$('[data-entry-target]').forEach((button) => button.addEventListener('click', () => showEntryPage(button.dataset.entryTarget)));
$('#entryBack').addEventListener('click', () => showEntryPage('welcome'));
$('#guestButton').addEventListener('click', () => enterWorld('design-guest'));
$('#loginForm').addEventListener('submit', (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  if (!form.checkValidity()) return $('#loginError').textContent = '请填写有效账户和至少 8 位密码。';
  enterWorld('login-mock');
});
$('#registerForm').addEventListener('submit', (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const data = new FormData(form);
  if (!form.checkValidity()) return $('#registerError').textContent = '请完整填写字段，并确认年龄和条款。';
  if (data.get('password') !== data.get('confirmPassword')) return $('#registerError').textContent = '两次密码不一致。';
  state.research = data.get('research') === 'on';
  persist();
  enterWorld('register-mock');
});
$('#forgotForm').addEventListener('submit', (event) => { event.preventDefault(); showEntryPage('welcome'); showToast('人工重置申请已提交'); });

worldStage.addEventListener('click', (event) => {
  if (event.target.closest('button')) return;
  const rect = worldStage.getBoundingClientRect();
  if (state.worldMode === 'cottage') {
    state.cottageX = Math.max(6, Math.min(94, ((event.clientX - rect.left) / rect.width) * 100));
    state.cottageY = Math.max(30, Math.min(88, ((event.clientY - rect.top) / rect.height) * 100));
  } else {
    state.wx += event.clientX - rect.left - rect.width / 2;
    state.wy += event.clientY - rect.top - rect.height * .52;
  }
  renderWorld();
  logEvent('move_click', { wx: Math.round(state.wx), wy: Math.round(state.wy), mode: state.worldMode });
});

$$('.world-object').forEach((button) => button.addEventListener('click', (event) => {
  event.stopPropagation();
  const target = objectTargets[button.dataset.object];
  if (state.worldMode === 'cottage') exitCottage();
  state.wx = target.wx;
  state.wy = target.wy + 70;
  renderWorld();
  setTimeout(observe, 80);
}));

window.addEventListener('keydown', (event) => {
  if (event.target.matches('input, textarea, select')) return;
  const key = event.key.toLowerCase();
  if (key === 'escape') {
    if (!sheet.hidden) { closeSheet(); return; }
    if (!profileDrawer.hidden) { profileDrawer.hidden = true; scrim.hidden = true; return; }
    if (!entry.hidden && entry.classList.contains('is-gone') === false) {
      const activePage = $('.entry-page.is-active', entry);
      if (activePage && activePage.dataset.entryPage !== 'welcome') showEntryPage('welcome');
    }
    return;
  }
  if (!sheet.hidden) {
    if (key === ' ' && state.activeMedia !== null) {
      event.preventDefault();
      toggleModalPlayback(state.activeMedia);
    }
    return;
  }
  if (!profileDrawer.hidden) return;
  if (!entry.classList.contains('is-gone')) return;
  if (['a', 's', 'd', 'w', 'arrowleft', 'arrowright', 'arrowup', 'arrowdown', 'e', 'f', ' '].includes(key)) event.preventDefault();
  state.keys.add(key);
  if (event.repeat) return;
  if (key === 'e') observe();
  if (key === 'f') useSecondaryVerb();
});
window.addEventListener('keyup', (event) => {
  const key = event.key.toLowerCase();
  const wasPresent = state.keys.has(key);
  state.keys.delete(key);
  if (wasPresent && ['a', 's', 'd', 'w', 'arrowleft', 'arrowright', 'arrowup', 'arrowdown'].includes(key)) persist();
});

cottageExit.addEventListener('click', (event) => {
  event.stopPropagation();
  exitCottage();
});

window.addEventListener('resize', renderWorld);

$('#dialogueToggle').addEventListener('click', () => {
  const collapsed = dialogue.classList.toggle('is-collapsed');
  $('#dialogueToggle').textContent = collapsed ? '展开木秋的对话' : '收起';
});
$('#sheetClose').addEventListener('click', closeSheet);
scrim.addEventListener('click', () => { closeSheet(); profileDrawer.hidden = true; scrim.hidden = true; });
$('#profileButton').addEventListener('click', () => { profileDrawer.hidden = false; scrim.hidden = false; });
$('#profileClose').addEventListener('click', () => { profileDrawer.hidden = true; scrim.hidden = true; });
$$('[data-panel]').forEach((button) => button.addEventListener('click', () => showProfilePanel(button.dataset.panel)));
$('#logoutButton').addEventListener('click', () => { localStorage.removeItem('zhere-prototype-session'); location.reload(); });
$('#aboutButton').addEventListener('click', showAbout);
$('#eventButton').addEventListener('click', showAnomaly);
favoritesButton.addEventListener('click', showFavorites);
ledgerButton.addEventListener('click', showBalance);

const existingSession = localStorage.getItem('zhere-prototype-session');
if (existingSession) $('#guestButton').textContent = '继续上次漫游';
const initialEntryRoute = location.hash.replace('#/', '');
if (['login', 'register', 'forgot-password'].includes(initialEntryRoute)) showEntryPage(initialEntryRoute === 'forgot-password' ? 'forgot' : initialEntryRoute);

worldStage.classList.toggle('event-muted', state.eventChoice && state.eventChoice !== 'none' && state.eventChoice !== 'restore');
renderScreens();
renderPlaced();
renderCreations();
updateCounters();
updateFavoritesBadge();
refreshIdentity();
setInterval(persist, 15000);
if (state.worldMode === 'cottage') {
  worldStage.classList.add('is-cottage');
  worldArt.hidden = false;
  cottageExit.hidden = false;
  worldName.textContent = state.profile.spaceName || '左枝小屋';
}
renderWorld();
setTimeout(() => $('#loading').classList.add('is-gone'), 180);
setTimeout(() => { $('#loading').hidden = true; }, 900);
requestAnimationFrame(frame);
