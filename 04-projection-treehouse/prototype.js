const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

const worldStage = $('#worldStage');
const worldShell = $('#worldShell');
const worldArt = $('#worldArt');
const zoneName = $('#zoneName');
const terrainLayer = $('#terrainLayer');
const decoLayer = $('#decoLayer');
const player = $('#player');
const nearby = $('#nearby');
const contextHint = $('#contextHint');
const screenLayer = $('#screenLayer');
const placedLayer = $('#placedLayer');
const creationLayer = $('#creationLayer');
const cottageExit = $('#cottageExit');
const wayfinder = $('#wayfinder');
const dialogue = $('#dialogue');
const dialogueText = $('#dialogueText');
const dialogueActions = $('#dialogueActions');
const speaker = $('#speaker');
const walletCount = $('#walletCount');
const copyCount = $('#copyCount');
const favoritesCount = $('#favoritesCount');
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

const HOME_CAPACITY = 12;
const RAW_EVENT_CAP = 300;
const daySeed = Math.floor(Date.now() / 86400000);

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const AVATAR_SWATCHES = [
  { glyph: '风', color: '#6f9d94' },
  { glyph: '木', color: '#6f8060' },
  { glyph: '潮', color: '#b8654f' },
  { glyph: '岩', color: '#9a7f5e' },
  { glyph: '雾', color: '#57684c' },
  { glyph: '贝', color: '#8a9d7d' },
];

const ZONE_DEFS = [
  { id: 'sea', name: '海面', test: (x, y) => y > 900 },
  { id: 'shore', name: '海岸', test: (x, y) => y > 300 },
  { id: 'hill', name: '山坡', test: (x, y) => y < -1300 },
  { id: 'forest', name: '小树林', test: (x, y) => x <= -1800 },
  { id: 'street', name: '商业街', test: (x, y) => x >= 1400 },
  { id: 'town', name: '镇中心', test: () => true },
];

function zoneAt(x, y) {
  for (const zone of ZONE_DEFS) if (zone.test(x, y)) return zone;
  return ZONE_DEFS[ZONE_DEFS.length - 1];
}

const ZONE_SPAWN = {
  forest: { x: [-3500, -1950], y: [-900, 220], slots: 8 },
  hill: { x: [-1500, 1500], y: [-2900, -1500], slots: 8 },
  town: { x: [-1500, 1250], y: [-1150, 220], slots: 12 },
  street: { x: [1520, 3300], y: [-1150, 250], slots: 10 },
  shore: { x: [-2500, 3100], y: [380, 850], slots: 10 },
  sea: { x: [-1700, 2500], y: [980, 1650], slots: 4 },
};

const VIDEO_POOL = [
  { id: 'v-tide-pause', title: '潮水停在半句', tags: ['海边', '慢镜头'], scene: '海岸', dur: '38秒', res: '1080p', license: '单次使用', price: 36 },
  { id: 'v-kite-wire', title: '风筝线缠住黄昏', tags: ['天空', '慢镜头'], scene: '海岸', dur: '21秒', res: '720p', license: '单次使用', price: 18 },
  { id: 'v-shell-wind', title: '贝壳里的风声', tags: ['海边', '声音'], scene: '海岸', dur: '26秒', res: '1080p', license: '期限授权', price: 40 },
  { id: 'v-pier-lamp', title: '栈桥尽头那盏灯', tags: ['夜晚', '海边'], scene: '海岸', dur: '44秒', res: '1080p', license: '期限授权', price: 52 },
  { id: 'v-fog-fish', title: '雾里的渔船排队', tags: ['海边', '清晨'], scene: '海岸', dur: '30秒', res: '1080p', license: '单次使用', price: 28 },
  { id: 'v-wave-fold', title: '浪折叠了一次', tags: ['海边', '慢镜头'], scene: '海岸', dur: '15秒', res: '720p', license: '单次使用', price: 14 },
  { id: 'v-sand-print', title: '脚印被慢慢收走', tags: ['海边', '时间'], scene: '海岸', dur: '33秒', res: '1080p', license: '永久授权', price: 62 },
  { id: 'v-buoy-song', title: '浮标哼了一晚上', tags: ['夜晚', '声音'], scene: '海岸', dur: '52秒', res: '1080p', license: '期限授权', price: 46 },
  { id: 'v-coffee-steam', title: '咖啡蒸汽的形状', tags: ['日常', '暖'], scene: '城镇', dur: '18秒', res: '1080p', license: '单次使用', price: 22 },
  { id: 'v-window-cat', title: '窗台上打盹的猫', tags: ['治愈', '日常'], scene: '城镇', dur: '24秒', res: '720p', license: '单次使用', price: 20 },
  { id: 'v-bike-bell', title: '单车铃穿过巷子', tags: ['城镇', '声音'], scene: '城镇', dur: '16秒', res: '720p', license: '单次使用', price: 15 },
  { id: 'v-laundry-wind', title: '晾衣绳上的合唱', tags: ['日常', '风'], scene: '城镇', dur: '29秒', res: '1080p', license: '单次使用', price: 30 },
  { id: 'v-umbrella-red', title: '一把红伞的路线', tags: ['雨天', '色彩'], scene: '城镇', dur: '22秒', res: '1080p', license: '单次使用', price: 24 },
  { id: 'v-bread-morning', title: '面包店的早晨六点', tags: ['食物', '清晨'], scene: '城镇', dur: '35秒', res: '1080p', license: '期限授权', price: 42 },
  { id: 'v-chess-quiet', title: '棋局安静了十步', tags: ['安静', '老人'], scene: '城镇', dur: '41秒', res: '1080p', license: '单次使用', price: 34 },
  { id: 'v-bus-stop-rain', title: '雨里的公交站台', tags: ['雨天', '等待'], scene: '城镇', dur: '27秒', res: '1080p', license: '单次使用', price: 26 },
  { id: 'v-shop-sign', title: '新店招牌的第一晚', tags: ['商业', '夜晚'], scene: '商业', dur: '19秒', res: '1080p', license: '单次使用', price: 25 },
  { id: 'v-brand-blue', title: '蓝色帆布包特写', tags: ['商业', '产品'], scene: '商业', dur: '12秒', res: '1080p', license: '单次使用', price: 16 },
  { id: 'v-night-market', title: '夜市灯箱与蒸汽', tags: ['商业', '夜晚'], scene: '商业', dur: '37秒', res: '1080p', license: '期限授权', price: 48 },
  { id: 'v-pet-window', title: '宠物店橱窗的凝视', tags: ['商业', '动物'], scene: '商业', dur: '23秒', res: '1080p', license: '单次使用', price: 27 },
  { id: 'v-coffee-brand', title: '手冲咖啡品牌片', tags: ['商业', '食物'], scene: '商业', dur: '30秒', res: '1080p', license: '期限授权', price: 55 },
  { id: 'v-sneaker-rain', title: '雨夜跑鞋广告', tags: ['商业', '运动'], scene: '商业', dur: '20秒', res: '1080p', license: '单次使用', price: 32 },
  { id: 'v-forest-light', title: '林间光斑的移动', tags: ['树林', '治愈'], scene: '山林', dur: '47秒', res: '1080p', license: '期限授权', price: 45 },
  { id: 'v-leaf-fall', title: '叶子落下的十种办法', tags: ['树林', '慢镜头'], scene: '山林', dur: '33秒', res: '1080p', license: '单次使用', price: 30 },
  { id: 'v-moss-rain', title: '苔藓喝饱了雨', tags: ['树林', '雨天'], scene: '山林', dur: '28秒', res: '1080p', license: '单次使用', price: 26 },
  { id: 'v-bird-hidden', title: '看不见的鸟在换班', tags: ['树林', '声音'], scene: '山林', dur: '55秒', res: '1080p', license: '永久授权', price: 70 },
  { id: 'v-hill-windgrass', title: '山坡上的风有形状', tags: ['山坡', '慢镜头'], scene: '山林', dur: '39秒', res: '1080p', license: '期限授权', price: 44 },
  { id: 'v-night-cabin', title: '山屋的灯亮了一夜', tags: ['夜晚', '山坡'], scene: '山林', dur: '60秒', res: '1080p', license: '永久授权', price: 78 },
  { id: 'v-city-delay', title: '城市延时到半夜', tags: ['城市', '夜晚'], scene: '城市', dur: '31秒', res: '1080p', license: '单次使用', price: 33 },
  { id: 'v-metro-door', title: '地铁门开了又关', tags: ['城市', '等待'], scene: '城市', dur: '17秒', res: '720p', license: '单次使用', price: 13 },
  { id: 'v-neon-reflection', title: '霓虹在水洼里碎掉', tags: ['城市', '夜晚'], scene: '城市', dur: '25秒', res: '1080p', license: '单次使用', price: 29 },
  { id: 'v-skyline-fade', title: '天际线慢慢褪色', tags: ['城市', '黄昏'], scene: '城市', dur: '42秒', res: '1080p', license: '期限授权', price: 50 },
  { id: 'v-autumn-cafe', title: '秋天咖啡店的开业', tags: ['食物', '秋天'], scene: '城镇', dur: '26秒', res: '1080p', license: '单次使用', price: 28 },
  { id: 'v-stray-route', title: '流浪猫的固定路线', tags: ['动物', '日常'], scene: '城镇', dur: '36秒', res: '1080p', license: '单次使用', price: 31 },
  { id: 'v-paper-plane', title: '纸飞机越过围墙', tags: ['童趣', '风'], scene: '城镇', dur: '14秒', res: '720p', license: '单次使用', price: 12 },
  { id: 'v-old-radio', title: '旧收音机的白噪音', tags: ['声音', '怀旧'], scene: '城镇', dur: '48秒', res: '1080p', license: '期限授权', price: 43 },
  { id: 'v-station-echo', title: '空站台的回声', tags: ['孤独', '声音'], scene: '城市', dur: '34秒', res: '1080p', license: '单次使用', price: 35 },
  { id: 'v-run-early', title: '五点半的河岸跑者', tags: ['运动', '清晨'], scene: '城镇', dur: '23秒', res: '1080p', license: '单次使用', price: 22 },
  { id: 'v-glass-rain', title: '玻璃上的雨在排队', tags: ['雨天', '安静'], scene: '城市', dur: '20秒', res: '720p', license: '单次使用', price: 17 },
  { id: 'v-festival-lantern', title: '灯笼节的最后一盏', tags: ['节日', '夜晚'], scene: '城镇', dur: '29秒', res: '1080p', license: '单次使用', price: 31 },
  { id: 'v-slow-train', title: '慢车穿过油菜花', tags: ['春天', '慢镜头'], scene: '山林', dur: '40秒', res: '1080p', license: '期限授权', price: 47 },
  { id: 'v-greenhouse-noon', title: '温室里的正午', tags: ['植物', '安静'], scene: '山林', dur: '32秒', res: '1080p', license: '单次使用', price: 27 },
  { id: 'v-ad-silent', title: '没说话的广告牌', tags: ['商业', '荒诞'], scene: '商业', dur: '11秒', res: '720p', license: '单次使用', price: 10 },
  { id: 'v-bookstore-ladder', title: '书店梯子吱呀一声', tags: ['日常', '声音'], scene: '城镇', dur: '21秒', res: '1080p', license: '单次使用', price: 23 },
  { id: 'v-rooftop-shirt', title: '天台晾着的白衬衫', tags: ['夏天', '风'], scene: '城镇', dur: '18秒', res: '720p', license: '单次使用', price: 15 },
  { id: 'v-dock-crane', title: '码头的吊臂很慢', tags: ['海边', '工业'], scene: '海岸', dur: '38秒', res: '1080p', license: '期限授权', price: 41 },
  { id: 'v-lighthouse-round', title: '灯塔转了三百圈', tags: ['海边', '夜晚'], scene: '海岸', dur: '57秒', res: '1080p', license: '永久授权', price: 75 },
  { id: 'v-market-scale', title: '菜市场的秤在点头', tags: ['食物', '日常'], scene: '城镇', dur: '26秒', res: '1080p', license: '单次使用', price: 25 },
  { id: 'v-tram-window', title: '电车窗外的季节', tags: ['城市', '时间'], scene: '城市', dur: '45秒', res: '1080p', license: '期限授权', price: 49 },
  { id: 'v-empty-pool', title: '空泳池的夏天记忆', tags: ['夏天', '孤独'], scene: '城市', dur: '30秒', res: '1080p', license: '单次使用', price: 28 },
  { id: 'v-camp-fire', title: '篝火星子往上走', tags: ['山坡', '夜晚'], scene: '山林', dur: '36秒', res: '1080p', license: '单次使用', price: 33 },
  { id: 'v-bamboo-shade', title: '竹林影子写字', tags: ['树林', '安静'], scene: '山林', dur: '43秒', res: '1080p', license: '期限授权', price: 46 },
  { id: 'v-shop-cat-boss', title: '看店猫的一天', tags: ['动物', '商业'], scene: '商业', dur: '41秒', res: '1080p', license: '单次使用', price: 38 },
  { id: 'v-rain-awning', title: '雨棚收摊的声音', tags: ['雨天', '商业'], scene: '商业', dur: '24秒', res: '1080p', license: '单次使用', price: 21 },
  { id: 'v-ferry-away', title: '渡船离岸的那一下', tags: ['海边', '离别'], scene: '海岸', dur: '28秒', res: '1080p', license: '单次使用', price: 30 },
  { id: 'v-windmill-idle', title: '风车闲了一下午', tags: ['山坡', '慢镜头'], scene: '山林', dur: '34秒', res: '1080p', license: '单次使用', price: 29 },
];

const SCENE_ZONE_PREF = { '海岸': ['shore', 'sea'], '城镇': ['town'], '商业': ['street', 'town'], '山林': ['forest', 'hill'], '城市': ['street', 'town', 'hill'] };
const SPAWN_SOURCES = ['公共上传', '世界推荐', '邻居分享', '低曝光补偿', '新发布'];

const objectTargets = {
  cottage: { wx: -620, wy: 160, label: '我的小屋', hint: 'E 推门进入自己的小屋' },
  board: { wx: 260, wy: -60, label: '公告树', hint: 'E 看大家留下的纸条' },
  workshop: { wx: 760, wy: 260, label: '共创台', hint: 'E 把素材放进背包' },
  telescope: { wx: 300, wy: -2200, label: '山坡望远镜', hint: 'E 看看世界另一头' },
  sound: { wx: -900, wy: -1700, label: '听风码头', hint: 'E 听一段没有任务的声音' },
  seabench: { wx: 400, wy: 860, label: '看海长椅', hint: 'E 坐下来看一会儿海' },
  neighbor: { wx: 1750, wy: 140, label: '陌生人的长椅', hint: 'E 拜访一个公开空间' },
  anomaly: { wx: -2400, wy: 240, label: '回声水洼', hint: 'E 回应今日异象，或直接走开' },
};

const TAG_PLANTS = [
  { tag: '治愈', wx: -1620, wy: -240 },
  { tag: '松弛', wx: 980, wy: -920 },
  { tag: '孤独', wx: 1280, wy: -260 },
  { tag: '夏天', wx: -620, wy: 560 },
  { tag: '广告感', wx: 2060, wy: 320 },
];

const SAMPLIES = [
  { id: 'sample-1', title: '我存的一段海', description: '夏天傍晚拍的，想换个地方看它。' },
  { id: 'sample-2', title: '楼下早餐摊的蒸汽', description: '六点半的光特别好。' },
  { id: 'sample-3', title: '雨天车窗练习', description: '隔着玻璃拍城市的练习。' },
];

function videoSourceAffinity() {
  const rand = mulberry32(daySeed * 7 + 13);
  return VIDEO_POOL.map((item) => ({ ...item, spawn_source: SPAWN_SOURCES[Math.floor(rand() * SPAWN_SOURCES.length)], exposureRoll: rand() }));
}

function generateWorldVideos() {
  const rand = mulberry32(daySeed * 31 + 7);
  const pool = videoSourceAffinity();
  const used = new Set();
  const items = [];
  Object.entries(ZONE_SPAWN).forEach(([zoneId, spec]) => {
    const preferred = pool.filter((item) => (SCENE_ZONE_PREF[item.scene] || []).includes(zoneId) && !used.has(item.id));
    const rest = pool.filter((item) => !used.has(item.id));
    for (let i = 0; i < spec.slots; i += 1) {
      const candidate = preferred.length ? preferred : rest;
      if (!candidate.length) break;
      const pick = candidate[Math.floor(rand() * candidate.length)];
      used.add(pick.id);
      items.push({
        ...pick,
        wx: spec.x[0] + rand() * (spec.x[1] - spec.x[0]),
        wy: spec.y[0] + rand() * (spec.y[1] - spec.y[0]),
        zone: zoneId,
        likes: Math.floor(rand() * 14),
      });
    }
  });
  return items;
}

const worldVideos = generateWorldVideos();

const systemNotes = [
  { id: 'sys-n-1', title: '想找适合秋天咖啡店开业的视频', description: '要有蒸汽、木质桌面和一点风铃声。', type: 'personal', by: '南枝', wx: 120, wy: -380, zone: 'town', refAsset: null, responses: [], createdAt: '昨天' },
  { id: 'sys-n-2', title: '给宠物粮品牌找一支竖屏短片', description: '模拟商业需求：猫狗出镜，节奏快一点。虚拟预算 90 灵感币。', type: 'commerce', by: '北巷宠物铺', wx: 1980, wy: -420, zone: 'street', refAsset: null, responses: [{ name: '迟野', text: '我有一段看店猫的素材，可能合适。', at: '今天' }], createdAt: '2 天前' },
  { id: 'sys-n-3', title: '缺一段安静的海浪当背景', description: '不要音乐，只要海。', type: 'personal', by: '木秋', wx: -880, wy: 620, zone: 'shore', refAsset: 'v-tide-pause', responses: [], createdAt: '今天' },
];

const defaultState = {
  wx: 0,
  wy: 0,
  cottageX: 50,
  cottageY: 62,
  worldMode: 'overworld',
  wallet: 500,
  rug: 'teal',
  favorites: [],
  likes: [],
  copies: [],
  placed: [],
  bids: {},
  published: [],
  notes: [],
  bag: [...SAMPLIES.map((item) => ({ ...item, fileName: '', mime: '', status: 'sample' }))],
  rawEvents: [],
  research: true,
  anonymized: false,
  eventChoice: 'none',
  exposureCounts: {},
  lastKeptDay: '',
  following: false,
  benchMessages: [{ name: '木秋', text: '海风把白天的声音都吹散了。' }],
  bottleState: null,
  pocketWords: [],
  exploreSteps: 0,
  profile: { nickname: '路过的风', username: 'visitor', bio: '收集不太确定的影像', interests: '海、树、慢节奏', spaceName: '礁石小窝', avatar: 0 },
};

function loadState() {
  try {
    const loaded = { ...defaultState, ...JSON.parse(localStorage.getItem('zhere-v7-design-state') || '{}') };
    if (!loaded.bag.length) loaded.bag = [...SAMPLIES.map((item) => ({ ...item, fileName: '', mime: '', status: 'sample' }))];
    if (!loaded.benchMessages.length) loaded.benchMessages = [{ name: '木秋', text: '海风把白天的声音都吹散了。' }];
    return loaded;
  } catch {
    return JSON.parse(JSON.stringify(defaultState));
  }
}

const state = loadState();
state.keys = new Set();
state.nearest = null;
state.activeVideo = null;
state.videoOpenedAt = 0;
state.lastTime = performance.now();
state.carryTag = null;
state.carryPlaced = null;
state.approached = new Set();
state.avoidLogged = new Set();
state.openedVideos = new Set();
state.impressionAccum = {};

function persist() {
  const serializable = { ...state };
  ['keys', 'nearest', 'activeVideo', 'videoOpenedAt', 'lastTime', 'carryTag', 'carryPlaced', 'approached', 'avoidLogged', 'openedVideos', 'impressionAccum'].forEach((field) => delete serializable[field]);
  localStorage.setItem('zhere-v7-design-state', JSON.stringify(serializable));
}

function logEvent(rawEvent, details = {}) {
  const event = {
    event_id: crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`,
    raw_event: rawEvent,
    details: { ...details, zone_id: zoneAt(state.wx, state.wy).id, wx: Math.round(state.wx), wy: Math.round(state.wy) },
    created_at: new Date().toISOString(),
    experiment_id: 'open-world-v1',
    experiment_group: 'mixed-biome',
    derived_signals: {},
  };
  state.rawEvents.push(event);
  if (state.rawEvents.length > RAW_EVENT_CAP) state.rawEvents = state.rawEvents.slice(-RAW_EVENT_CAP);
}

function countEvent(name) {
  return state.rawEvents.filter((event) => event.raw_event === name).length;
}

function fmtNow() {
  return new Date().toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
}

function escapeHtml(value) {
  return String(value).replace(/[&<>'"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[char]);
}

function showToast(message) {
  toast.textContent = message;
  toast.hidden = false;
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => { toast.hidden = true; }, 2400);
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
  if (state.activeVideo) {
    const duration = Math.round((performance.now() - state.videoOpenedAt) / 1000);
    logEvent('watch_time', { asset_id: state.activeVideo.id, duration });
  }
  sheet.hidden = true;
  scrim.hidden = true;
  sheetContent.replaceChildren();
  state.activeVideo = null;
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

function allVideos() {
  return [...worldVideos, ...state.published];
}

function scoreVideo(video) {
  const exposures = state.exposureCounts[video.id] || 0;
  const lowExposure = Math.max(0, 1 - exposures * 0.18);
  const fresh = video.spawn_source === '新发布' ? 0.5 : 0;
  const userBoost = video.source === 'user' ? 0.9 : 0;
  return 1 + lowExposure + fresh + userBoost + (video.exposureRoll || 0.3) * 0.4;
}

function hash2d(x, y, salt = 0) {
  let value = Math.imul(x + 374761393 + salt + daySeed, 668265263) ^ Math.imul(y + 1274126177, 2246822519);
  value = Math.imul(value ^ (value >>> 13), 1274126177);
  return ((value ^ (value >>> 16)) >>> 0) / 4294967295;
}

function worldToScreen(wx, wy) {
  return {
    x: worldShell.clientWidth / 2 + wx - state.wx,
    y: worldShell.clientHeight * .52 + wy - state.wy,
  };
}

function placeWorldNode(node, wx, wy) {
  const point = worldToScreen(wx, wy);
  node.style.transform = `translate(${Math.round(point.x - node.offsetWidth / 2)}px, ${Math.round(point.y - node.offsetHeight / 2)}px)`;
  const visible = point.x > -260 && point.x < worldShell.clientWidth + 260 && point.y > -200 && point.y < worldShell.clientHeight + 200;
  node.style.visibility = visible ? 'visible' : 'hidden';
  node.dataset.visible = visible ? '1' : '';
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
    if (b.x < 0 || a.x > worldShell.clientWidth || b.y < 0 || a.y > worldShell.clientHeight) return;
    const div = document.createElement('div');
    div.className = `terrain-band ${band.cls}`;
    div.style.left = `${Math.round(a.x)}px`;
    div.style.top = `${Math.round(a.y)}px`;
    div.style.width = `${Math.round(b.x - a.x)}px`;
    div.style.height = `${Math.round(b.y - a.y)}px`;
    fragment.append(div);
  });
}

function renderTerrain() {
  if (state.worldMode === 'cottage') { terrainLayer.replaceChildren(); return; }
  const fragment = document.createDocumentFragment();
  renderTerrainBands(fragment);
  const chunkW = 640;
  const chunkH = 480;
  const minX = Math.floor((state.wx - worldShell.clientWidth / 2 - 200) / chunkW);
  const maxX = Math.floor((state.wx + worldShell.clientWidth / 2 + 200) / chunkW);
  const minY = Math.floor((state.wy - worldShell.clientHeight / 2 - 160) / chunkH);
  const maxY = Math.floor((state.wy + worldShell.clientHeight / 2 + 160) / chunkH);
  for (let cy = minY; cy <= maxY; cy += 1) {
    for (let cx = minX; cx <= maxX; cx += 1) {
      const centerZone = zoneAt(cx * chunkW, cy * chunkH);
      if (centerZone.id === 'sea') continue;
      const count = hash2d(cx, cy, 9) > .6 ? 2 : 1;
      for (let i = 0; i < count; i += 1) {
        const mark = document.createElement('span');
        const roll = hash2d(cx, cy, 30 + i);
        if (centerZone.id === 'forest' || centerZone.id === 'hill') {
          mark.className = `terrain-mark is-bush${roll > .66 ? ' deep-green' : ''}`;
        } else if (centerZone.id === 'shore') {
          mark.className = `terrain-mark ${roll > .86 ? 'is-shell' : 'is-seam'}`;
        } else {
          mark.className = `terrain-mark ${roll < .22 ? 'is-small' : roll > .8 ? 'is-seam' : 'is-bush'}`;
        }
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
}

function renderScreens() {
  screenLayer.replaceChildren();
  allVideos().forEach((video) => {
    const button = document.createElement('button');
    button.className = 'media-screen';
    button.dataset.videoId = video.id;
    button.dataset.label = video.title;
    button.setAttribute('aria-label', video.title);
    const likeBadge = document.createElement('span');
    likeBadge.className = `like-badge${state.likes.includes(video.id) ? ' is-liked' : ''}`;
    likeBadge.textContent = state.likes.includes(video.id) ? `♥${video.likes + 1}` : `♥${video.likes}`;
    button.append(likeBadge);
    button.addEventListener('click', (event) => {
      event.stopPropagation();
      if (state.worldMode === 'cottage') exitCottage();
      state.wx = video.wx;
      state.wy = video.wy + 84;
      renderWorld();
      setTimeout(() => showVideo(video), 80);
    });
    screenLayer.append(button);
  });
}

function renderCreations() {
  creationLayer.replaceChildren();
  state.notes.forEach((note) => {
    const button = document.createElement('button');
    button.className = 'player-creation is-note';
    button.textContent = note.title;
    button.dataset.creationId = note.id;
    button.setAttribute('aria-label', `需求纸条：${note.title}`);
    button.addEventListener('click', (event) => {
      event.stopPropagation();
      if (state.worldMode === 'cottage') exitCottage();
      state.wx = note.wx;
      state.wy = note.wy + 84;
      renderWorld();
      setTimeout(() => showNoteDetail(note), 80);
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
  allVideos().forEach((video) => {
    const bid = state.bids[video.id];
    if (!bid) return;
    let node = $(`.bid-plant[data-bid="${video.id}"]`, decoLayer);
    if (!node) {
      node = document.createElement('span');
      node.className = 'bid-plant';
      node.dataset.bid = video.id;
      node.innerHTML = '<span class="pleaf l1"></span><span class="pleaf l2"></span><span class="pstem"></span><span class="pflower"></span>';
      decoLayer.append(node);
    }
    delete node.dataset.keep;
    const ratio = Math.min(1, bid.price / bid.reserve);
    $('.pstem', node).style.height = `${14 + ratio * 34}px`;
    node.classList.toggle('is-bloom', ratio >= 1);
    node.classList.toggle('is-won', bid.settled && bid.winner === 'player');
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
    const film = document.createElement('span');
    film.className = `placed-film${item.type === 'combo' ? ' placed-combo' : ''}${state.carryPlaced === index ? ' is-selected' : ''}`;
    film.style.left = `${item.x}%`;
    film.style.top = `${item.y}%`;
    const video = allVideos().find((candidate) => candidate.id === item.assetId);
    film.title = item.type === 'combo' ? `组合的副本 ${index + 1}` : `《${video ? video.title : '副本'}》的副本`;
    film.addEventListener('click', (event) => {
      event.stopPropagation();
      pickUpPlaced(index);
    });
    placedLayer.append(film);
  });
}

function updateCounters() {
  walletCount.textContent = state.wallet;
  copyCount.textContent = state.copies.length;
  favoritesCount.textContent = state.favorites.length;
}

function refreshIdentity() {
  const profile = state.profile;
  const swatch = AVATAR_SWATCHES[profile.avatar] || AVATAR_SWATCHES[0];
  topAvatar.textContent = swatch.glyph;
  topAvatar.style.background = swatch.color;
  drawerAvatar.textContent = swatch.glyph;
  drawerAvatar.style.background = swatch.color;
  drawerName.textContent = profile.nickname || '路过的风';
  drawerTitle.textContent = `${profile.spaceName || '礁石小窝'}的整理者 · ${creatorLevel().label}`;
}

function creatorScore() {
  return countEvent('bid_win') * 3 + countEvent('copy_placed_home') * 2 + countEvent('publish_asset') + countEvent('publish_demand') + countEvent('like') + Math.floor(countEvent('tag_add') / 2);
}

function creatorLevel() {
  const tiers = [['观客', 0], ['回音', 3], ['记录者', 8], ['聚落工匠', 15], ['树冠编织者', 24]];
  const score = creatorScore();
  let label = tiers[0][0];
  tiers.forEach(([name, need]) => { if (score >= need) label = name; });
  return { label, score };
}

function currentZoneName() {
  if (state.worldMode === 'cottage') return `${state.profile.spaceName || '小窝'}内`;
  return zoneAt(state.wx, state.wy).name;
}

function nearestTarget() {
  if (state.worldMode === 'cottage') return null;
  let result = null;
  const consider = (distance, payload) => {
    if (distance < 180 && (!result || distance < result.distance)) result = { ...payload, distance };
  };
  allVideos().forEach((video) => consider(Math.hypot(state.wx - video.wx, state.wy - video.wy), { type: 'video', video }));
  state.notes.forEach((note) => consider(Math.hypot(state.wx - note.wx, state.wy - note.wy), { type: 'note', note }));
  Object.entries(objectTargets).forEach(([id, item]) => consider(Math.hypot(state.wx - item.wx, state.wy - item.wy), { type: 'object', id, hint: item.hint }));
  TAG_PLANTS.forEach((plant, index) => consider(Math.hypot(state.wx - plant.wx, state.wy - plant.wy), { type: 'tagplant', index, tag: plant.tag }));
  if (state.bottleState?.open === false) consider(Math.hypot(state.wx - state.bottleState.wx, state.wy - state.bottleState.wy), { type: 'bottle' });
  return result;
}

function hintVideo() {
  const keys = [];
  keys.push('<kbd>E</kbd> 观看');
  if (state.carryTag) keys.push(`<kbd>F</kbd> 贴上「${state.carryTag}」`);
  else keys.push('<kbd>F</kbd> 点赞');
  keys.push('<kbd>G</kbd> 参与竞价');
  return keys.join(' · ');
}

function updateNearby() {
  const previousId = state.nearest?.type === 'video' ? state.nearest.video.id : state.nearest?.type === 'note' ? state.nearest.note.id : null;
  state.nearest = nearestTarget();
  $$('.media-screen').forEach((node) => node.classList.toggle('is-near', state.nearest?.type === 'video' && node.dataset.videoId === state.nearest.video.id));
  $$('.player-creation').forEach((node) => node.classList.toggle('is-near', state.nearest?.type === 'note' && node.dataset.creationId === state.nearest.note.id));
  $$('.world-object').forEach((node) => node.classList.toggle('is-near', state.nearest?.type === 'object' && state.nearest.id === node.dataset.object));
  nearby.hidden = !state.nearest;
  nearby.textContent = state.nearest?.type === 'video' && state.carryTag ? 'F' : 'E';
  if (state.nearest?.type === 'video') {
    contextHint.innerHTML = `《${escapeHtml(state.nearest.video.title)}》 · ${hintVideo()}`;
    if (!state.approached.has(state.nearest.video.id)) {
      state.approached.add(state.nearest.video.id);
      logEvent('approach', { asset_id: state.nearest.video.id });
    }
  } else if (state.nearest?.type === 'note') {
    contextHint.innerHTML = `一张纸条「${escapeHtml(state.nearest.note.title)}」 · <kbd>E</kbd> 展开看看`;
  } else if (state.nearest?.type === 'tagplant') {
    contextHint.innerHTML = `一株标签植物「${state.nearest.tag}」 · <kbd>E</kbd> 拔下来带走`;
  } else if (state.nearest?.type === 'bottle') {
    contextHint.innerHTML = '一只漂流瓶被冲到了这里 · <kbd>E</kbd> 打开';
  } else if (state.nearest?.type === 'object') {
    contextHint.innerHTML = state.nearest.hint.replace('E ', '<kbd>E</kbd> ');
  } else if (state.carryTag) {
    contextHint.innerHTML = `你带着标签「${state.carryTag}」 · 靠近视频按 <kbd>F</kbd> 贴上去`;
  } else {
    contextHint.innerHTML = state.worldMode === 'cottage'
      ? '点击地面移动 · 点击副本捡起来 · 再点地面放下 · 点同一枚副本收回口袋'
      : `<kbd>WASD</kbd> 任意方向行走 · <kbd>B</kbd> 背包 · <kbd>N</kbd> 留纸条 · 当前在${currentZoneName()}`;
  }
  if (previousId && (!state.nearest || (state.nearest.video?.id || state.nearest.note?.id) !== previousId) && !state.openedVideos.has(previousId) && !state.avoidLogged.has(previousId)) {
    state.avoidLogged.add(previousId);
    logEvent('avoid', { asset_id: previousId });
  }
  zoneName.textContent = currentZoneName();
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
    ...state.notes.map((note) => ({ ...note, label: `纸条「${note.title}」` })),
    ...state.published.map((video) => ({ ...video, label: `我的发布《${video.title}》` })),
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

function trackVisibility(video, visible, distance) {
  if (visible) {
    const acc = state.impressionAccum[video.id] || { time: 0, dist: distance, score: scoreVideo(video), spawn_source: video.spawn_source || '我的发布', zone: zoneAt(video.wx, video.wy).id };
    acc.time += 1;
    acc.dist = Math.min(acc.dist, distance);
    state.impressionAccum[video.id] = acc;
  }
}

function flushImpressions() {
  const ids = Object.keys(state.impressionAccum);
  if (!ids.length) return;
  const ranked = ids
    .map((id) => ({ id, ...state.impressionAccum[id] }))
    .sort((a, b) => b.score - a.score);
  const impressions = ranked.map((entry, index) => {
    state.exposureCounts[entry.id] = (state.exposureCounts[entry.id] || 0) + 1;
    return {
      asset_id: entry.id,
      zone_id: entry.zone,
      spawn_source: entry.spawn_source,
      rank: index + 1,
      recommendation_score: Number(entry.score.toFixed(2)),
      visible: true,
      visibility_duration: entry.time,
      distance_to_player: Math.round(entry.dist),
    };
  });
  logEvent('impression_batch', { impressions, count: impressions.length });
  state.impressionAccum = {};
  persist();
}

function renderWorld() {
  updatePlayer();
  renderTerrain();
  renderStaticDecos();
  $$('.world-object').forEach((node) => {
    const target = objectTargets[node.dataset.object];
    if (target) placeWorldNode(node, target.wx, target.wy);
  });
  $$('.media-screen').forEach((node) => {
    const video = allVideos().find((candidate) => candidate.id === node.dataset.videoId);
    if (!video) return;
    const { visible } = placeWorldNode(node, video.wx, video.wy);
    trackVisibility(video, visible, Math.hypot(state.wx - video.wx, state.wy - video.wy));
  });
  $$('.player-creation').forEach((node) => {
    const note = state.notes.find((candidate) => candidate.id === node.dataset.creationId);
    if (note) placeWorldNode(node, note.wx, note.wy);
  });
  renderTagPlants();
  renderBidPlants();
  renderDecos();
  updateNearby();
  updateWayfinder();
}

function toggleLike(video) {
  const liked = state.likes.includes(video.id);
  if (liked) {
    state.likes = state.likes.filter((id) => id !== video.id);
    video.likes = Math.max(0, video.likes - 1);
    logEvent('unlike', { asset_id: video.id });
    showToast('已取消点赞');
  } else {
    state.likes.push(video.id);
    video.likes += 1;
    logEvent('like', { asset_id: video.id });
    showToast('点赞了');
  }
  persist();
  renderScreens();
  renderWorld();
}

function toggleFavoriteVideo(video) {
  const existing = state.favorites.findIndex((entry) => entry.type === 'media' && entry.id === video.id);
  if (existing >= 0) {
    state.favorites.splice(existing, 1);
    logEvent('unfavorite', { asset_id: video.id });
    showToast('已取消收藏');
  } else {
    state.favorites.push({ type: 'media', id: video.id, title: video.title, at: fmtNow() });
    logEvent('favorite', { asset_id: video.id });
    showToast('收藏了。收藏不代表购买，副本要靠竞价获得');
  }
  persist();
  updateCounters();
}

function renderVideoComments(video) {
  const comments = video.comments || [];
  if (!comments.length) return '<div class="empty-state">还没有留言。你可以只观察，不必评价。</div>';
  return comments.map((comment) => `<div class="comment"><b>${escapeHtml(comment.name)}</b><span>${escapeHtml(comment.text)}</span><button class="text-button" type="button">回复</button></div>`).join('');
}

function bindVideoReplies(video) {
  $$('.comment .text-button', sheet).forEach((button, index) => button.addEventListener('click', () => {
    const input = $('#commentForm input[name="comment"]');
    input.placeholder = `回复 ${(video.comments || [])[index]?.name || '这条留言'}`;
    input.focus();
    logEvent('comment_reply_start', { asset_id: video.id, reply_to: (video.comments || [])[index]?.name || null });
  }));
}

function showVideo(video) {
  state.activeVideo = video;
  state.videoOpenedAt = performance.now();
  state.openedVideos.add(video.id);
  const zone = zoneAt(video.wx, video.wy);
  const favorite = state.favorites.some((entry) => entry.type === 'media' && entry.id === video.id);
  const liked = state.likes.includes(video.id);
  const hasCopy = state.copies.some((copy) => copy.assetId === video.id) || state.placed.some((placed) => placed.assetId === video.id || (placed.parts || []).includes(video.id));
  const bid = state.bids[video.id];
  const openNotes = [...systemNotes, ...state.notes];
  logEvent('asset_open', { asset_id: video.id, spawn_source: video.spawn_source || '我的发布', zone_id: zone.id });
  openSheet(`
    <div class="sheet-inner media-sheet">
      <h2 class="sheet-title" id="sheetTitle" tabindex="-1">${escapeHtml(video.title)}</h2>
      <p class="sheet-subtitle">这段公共视频留在${zone.name}。观看、点赞、收藏、评论会分别记录，不会被直接解释成喜欢或不喜欢。</p>
      <div class="meta-chips">
        <span class="chip">${zone.name}</span>
        <span class="chip">${escapeHtml(video.spawn_source || '我的发布')}</span>
        <span class="chip">时长 ${escapeHtml(video.dur || '—')}</span>
        <span class="chip">${escapeHtml(video.res || '—')}</span>
        <span class="chip">授权 · ${escapeHtml(video.license || '个人副本')}</span>
      </div>
      ${hasCopy ? '<div class="status-banner">你已经拥有这段视频的副本，它可以躺在你的小窝里。</div>' : ''}
      <div class="media-layout">
        <div>
          <div class="video-frame" id="videoFrame"><span class="video-status" id="videoStatus">等待播放</span></div>
          <div class="media-actions">
            <button class="primary-button" id="playButton">播放</button>
            <button class="paper-button" id="likeButton">${liked ? '♥ 已点赞' : '♡ 点赞'}</button>
            <button class="paper-button" id="favoriteButton">${favorite ? '已收藏' : '收藏'}</button>
            <button class="paper-button" id="bidButton">${bid?.settled ? '竞价已落幕' : '参与竞价 G'}</button>
          </div>
          <div class="note-section">
            <h3>标签</h3>
            <div class="tag-row" id="tagRow">
              ${(video.tags || []).map((tag) => `<button class="tag-button is-selected" data-tag="${escapeHtml(tag)}">${escapeHtml(tag)} ×</button>`).join('')}
              ${['治愈', '古怪', '像广告', '适合凌晨'].filter((tag) => !(video.tags || []).includes(tag)).map((tag) => `<button class="tag-button" data-tag="${tag}">${tag}</button>`).join('')}
            </div>
            ${state.carryTag ? `<p style="margin-top:8px;font-size:12px;color:var(--muted)">你口袋里有一株「${escapeHtml(state.carryTag)}」标签植物，<button class="text-button" id="plantTagButton" type="button">点这里贴到视频旁</button>，或退出后按 F</p>` : ''}
          </div>
        </div>
        <div>
          <h3>留言</h3>
          <div class="comment-list" id="commentList">${renderVideoComments(video)}</div>
          <form class="inline-form" id="commentForm">
            <label>写下观察<input name="comment" maxlength="80" required placeholder="描述你看见的东西" /></label>
            <button class="primary-button" type="submit">留下</button>
          </form>
          <div class="note-section">
            <button class="paper-button" id="linkNoteButton">把这段连接到一张纸条</button>
            ${openNotes.length ? '' : '<p style="margin:8px 0 0;font-size:12px;color:var(--muted)">公域里目前还没有展开的纸条。按 N 可以留下一张。</p>'}
          </div>
        </div>
      </div>
    </div>
  `, () => {
    $('#playButton').addEventListener('click', () => togglePlayback(video));
    $('#likeButton').addEventListener('click', () => {
      toggleLike(video);
      $('#likeButton').textContent = state.likes.includes(video.id) ? '♥ 已点赞' : '♡ 点赞';
    });
    $('#favoriteButton').addEventListener('click', () => {
      toggleFavoriteVideo(video);
      $('#favoriteButton').textContent = state.favorites.some((entry) => entry.type === 'media' && entry.id === video.id) ? '已收藏' : '收藏';
    });
    $('#bidButton').addEventListener('click', () => openBidPanel(video));
    $('#linkNoteButton').addEventListener('click', () => showLinkNote(video));
    const plantTagButton = $('#plantTagButton', sheet);
    if (plantTagButton) plantTagButton.addEventListener('click', () => plantCarriedTag(video));
    $$('.tag-button', sheet).forEach((button) => button.addEventListener('click', () => {
      const tag = button.dataset.tag;
      video.tags = video.tags || [];
      if (button.classList.contains('is-selected')) {
        video.tags = video.tags.filter((value) => value !== tag);
        button.remove();
        logEvent('tag_remove', { asset_id: video.id, tag });
        showToast(`摘掉了标签「${tag}」`);
      } else {
        video.tags.push(tag);
        button.classList.add('is-selected');
        button.textContent = `${tag} ×`;
        logEvent('tag_add', { asset_id: video.id, tag, source: 'sheet' });
      }
    }));
    bindVideoReplies(video);
    $('#commentForm').addEventListener('submit', (event) => {
      event.preventDefault();
      const input = event.currentTarget.elements.comment;
      const text = input.value.trim();
      if (!text) return;
      video.comments = video.comments || [];
      video.comments.push({ name: state.profile.nickname || '路过的风', text });
      $('#commentList').innerHTML = renderVideoComments(video);
      bindVideoReplies(video);
      input.value = '';
      logEvent('comment', { asset_id: video.id, length: text.length });
      showToast('留言留在了视频旁');
    });
  });
}

function togglePlayback(video) {
  const frame = $('#videoFrame');
  if (!frame) return;
  const button = $('#playButton');
  const playing = frame.classList.toggle('is-playing');
  button.textContent = playing ? '暂停' : '播放';
  $('#videoStatus').textContent = playing ? '正在播放占位片段' : '已暂停';
  const screen = $(`.media-screen[data-video-id="${video.id}"]`);
  if (screen) {
    let mark = $('.is-playing-mark', screen);
    if (playing && !mark) {
      mark = document.createElement('span');
      mark.className = 'is-playing-mark';
      screen.append(mark);
    }
    if (!playing && mark) mark.remove();
  }
  logEvent(playing ? 'play' : 'pause', { asset_id: video.id });
}

function plantCarriedTag(video) {
  if (!state.carryTag) return;
  video.tags = video.tags || [];
  if (!video.tags.includes(state.carryTag)) video.tags.push(state.carryTag);
  logEvent('tag_add', { asset_id: video.id, tag: state.carryTag, source: 'tag_plant' });
  const tag = state.carryTag;
  state.carryTag = null;
  persist();
  closeSheet();
  showToast(`「${tag}」插在了《${video.title}》旁`);
  renderWorld();
}

function ensureBid(video) {
  if (!state.bids[video.id]) {
    const seeded = mulberry32(daySeed * 17 + video.title.length * 3);
    state.bids[video.id] = {
      price: 8 + Math.floor(seeded() * 18),
      reserve: 60 + Math.floor(seeded() * 120),
      highest: seeded() > 0.6 ? 'npc' : null,
      settled: false,
      winner: null,
      bids: seeded() > 0.6 ? [{ name: '慢半拍的鹿', amount: 6, type: 'npc' }] : [],
      entered: false,
    };
  }
  return state.bids[video.id];
}

function openBidPanel(video) {
  const bid = ensureBid(video);
  if (!bid.entered) {
    bid.entered = true;
    logEvent('bid_enter', { asset_id: video.id, price: bid.price });
  }
  const ratio = Math.min(1, bid.price / bid.reserve);
  openSheet(`
    <div class="sheet-inner">
      <h2 class="sheet-title" id="sheetTitle" tabindex="-1">视频旁的植物正在长高</h2>
      <p class="sheet-subtitle">这是《${escapeHtml(video.title)}》的虚拟竞价。价格用一株植物的身高表达，长到开花就是落幕。虚拟竞价不产生真实购买，灵感币没有现金价值。</p>
      <div class="auction-price">
        <div class="price-block"><span>植物长势（竞价热度）</span><strong>${Math.round(ratio * 100)}%</strong></div>
        <div class="price-block"><span>你的灵感币</span><strong>${state.wallet}</strong></div>
      </div>
      <div class="status-banner">当前累计出价 ${bid.price} 灵感币 · 领先者：${bid.highest === 'player' ? '你' : bid.highest === 'npc' ? '慢半拍的鹿（NPC）' : '还没有人'}</div>
      <div class="bid-history">${bid.bids.slice(-5).reverse().map((item) => `<div class="bid-row"><span>${escapeHtml(item.name)} ${item.type === 'npc' ? '<em class="npc-mark">NPC</em>' : ''}</span><b>+${item.amount}</b></div>`).join('') || '<div class="bid-row"><span>还没有出价记录</span><b></b></div>'}</div>
      <div class="media-actions">
        ${bid.settled ? '' : '<button class="primary-button" id="raise5">提价 5</button><button class="primary-button" id="raise10">提价 10</button><button class="primary-button" id="raise20">提价 20</button><button class="paper-button" id="withdrawButton">放弃出价</button>'}
        <button class="text-button" id="bidClose">回到视频</button>
      </div>
      ${bid.settled ? `<div class="status-banner">${bid.winner === 'player' ? '你赢得了这段视频的一个副本。公共原片仍然留在原地。' : '竞价落幕了。副本被别人带走了，公共原片仍在。'}</div>` : ''}
    </div>
  `, () => {
    [5, 10, 20].forEach((amount) => {
      const button = $(`#raise${amount}`, sheet);
      if (button) button.addEventListener('click', () => raiseBid(video, amount));
    });
    const withdraw = $('#withdrawButton', sheet);
    if (withdraw) withdraw.addEventListener('click', () => {
      logEvent('bid_withdraw', { asset_id: video.id, price: bid.price });
      closeSheet();
      showToast('你放下了出价。世界不会追着任何人');
    });
    $('#bidClose').addEventListener('click', () => showVideo(video));
  });
}

function raiseBid(video, amount) {
  const bid = ensureBid(video);
  if (bid.settled) return;
  if (state.wallet < amount) return showToast('灵感币不够了。可以看很多视频，但预算是有限的');
  state.wallet -= amount;
  bid.price += amount;
  bid.highest = 'player';
  bid.bids.push({ name: state.profile.nickname || '路过的风', amount, type: 'player' });
  updateCounters();
  persist();
  logEvent('bid_raise', { asset_id: video.id, amount, price: bid.price, bidder_type: 'player' });
  renderBidPlants();
  openBidPanel(video);
  setTimeout(() => npcCounter(video), 900 + Math.random() * 900);
}

function npcCounter(video) {
  const bid = state.bids[video.id];
  if (!bid || bid.settled) return;
  const room = bid.reserve - bid.price - 1;
  if (bid.highest === 'player' && room >= 3 && Math.random() < 0.62) {
    const amount = 3 + Math.floor(Math.random() * Math.min(7, room - 2));
    bid.price += amount;
    bid.highest = 'npc';
    bid.bids.push({ name: '慢半拍的鹿', amount, type: 'npc' });
    persist();
    logEvent('bid_raise', { asset_id: video.id, amount, price: bid.price, bidder_type: 'npc' });
    if (!sheet.hidden) openBidPanel(video);
    showToast('NPC 慢半拍的鹿提了价');
  }
  settleOrContinue(video);
}

function settleOrContinue(video) {
  const bid = state.bids[video.id];
  if (!bid || bid.settled) return;
  if (bid.price < bid.reserve) {
    renderBidPlants();
    return;
  }
  bid.settled = true;
  bid.winner = bid.highest || 'npc';
  persist();
  renderBidPlants();
  if (bid.winner === 'player') {
    state.copies.push({ assetId: video.id, acquiredAt: Date.now() });
    updateCounters();
    persist();
    logEvent('bid_win', { asset_id: video.id, price: bid.price });
    logEvent('copy_acquired', { asset_id: video.id });
    if (!sheet.hidden) openBidPanel(video);
    say('植物开花了。这段视频的副本进了你的口袋，按 B 打开背包，回家按 F 摆放。公共原片不会消失。', '木秋');
  } else {
    logEvent('bid_lose', { asset_id: video.id, price: bid.price });
    if (!sheet.hidden) openBidPanel(video);
    showToast('竞价落幕，副本被带到了别的小窝');
  }
}

function showLinkNote(video) {
  const notes = [...systemNotes, ...state.notes];
  openSheet(`
    <div class="sheet-inner">
      <h2 class="sheet-title" id="sheetTitle" tabindex="-1">把《${escapeHtml(video.title)}》连到一张纸条</h2>
      <p class="sheet-subtitle">如果你发现某段视频回应了某个需求，就把它连过去。这会记录为一条需求—素材关系，不会通知任何人。</p>
      <div class="list-stack">
        ${notes.length ? notes.map((note, index) => `<div class="list-row"><div><b>${escapeHtml(note.title)}</b><span>${escapeHtml(note.type === 'commerce' ? '模拟商业需求' : '个人需求')} · ${escapeHtml(note.by || '我')}</span></div><button class="text-button" data-link="${index}">连接</button></div>`).join('') : '<div class="empty-state">公域里还没有展开的纸条。按 N 可以留下一张。</div>'}
      </div>
      <div class="media-actions"><button class="text-button" id="linkBack">回到视频</button></div>
    </div>
  `, () => {
    $$('[data-link]', sheet).forEach((button) => button.addEventListener('click', () => {
      const note = notes[Number(button.dataset.link)];
      logEvent('demand_asset_link', { demand_id: note.id, asset_id: video.id });
      closeSheet();
      showToast(`《${video.title}》已连到「${note.title}」`);
    }));
    $('#linkBack').addEventListener('click', () => showVideo(video));
  });
}

function showNoteDetail(note) {
  const favorite = state.favorites.some((entry) => entry.type === 'demand' && entry.id === note.id);
  const refVideo = note.refAsset ? allVideos().find((video) => video.id === note.refAsset) : null;
  openSheet(`
    <div class="sheet-inner">
      <h2 class="sheet-title" id="sheetTitle" tabindex="-1">${escapeHtml(note.title)}</h2>
      <p class="sheet-subtitle">${note.type === 'commerce' ? '模拟商业需求' : '个人需求'} · 发布人 ${escapeHtml(note.by || state.profile.nickname)} · ${escapeHtml(zoneAt(note.wx, note.wy).name)}${note.createdAt ? ' · ' + escapeHtml(note.createdAt) : ''}</p>
      ${note.description ? `<div class="status-banner">${escapeHtml(note.description)}</div>` : ''}
      ${note.type === 'commerce' ? '<div class="danger-zone"><b>模拟说明</b><p>此需求不形成真实合同、支付或授权。所有金额都是灵感币虚拟预算。</p></div>' : ''}
      ${refVideo ? `<div class="meta-chips"><span class="chip">参考视频 · ${escapeHtml(refVideo.title)}</span><button class="text-button" id="openRef">去看参考视频</button></div>` : ''}
      <div class="note-section"><h3>回应 ${note.responses.length}</h3>
        <div class="comment-list">${note.responses.length ? note.responses.map((response) => `<div class="comment"><b>${escapeHtml(response.name)}</b><span>${escapeHtml(response.text)}</span></div>`).join('') : '<div class="empty-state">还没有回应。你可以用素材回应，也可以当作没看见。</div>'}</div>
      </div>
      <form class="note-section" id="noteResponseForm">
        <h3>用你的素材回应</h3>
        <label>回应内容<textarea name="response" rows="3" required placeholder="描述你能提供什么，或你见过的哪段视频合适"></textarea></label>
        <div class="media-actions">
          <button class="primary-button" type="submit">留下回应</button>
          <button class="paper-button" id="noteFavoriteButton">${favorite ? '已收藏' : '收藏纸条'}</button>
        </div>
      </form>
    </div>
  `, () => {
    $('#noteResponseForm').addEventListener('submit', (event) => {
      event.preventDefault();
      const text = event.currentTarget.elements.response.value.trim();
      if (!text) return;
      note.responses.push({ name: state.profile.nickname || '路过的风', text, at: fmtNow() });
      persist();
      logEvent('demand_response', { demand_id: note.id, length: text.length });
      closeSheet();
      showToast('回应贴在了纸条上');
    });
    $('#noteFavoriteButton').addEventListener('click', () => {
      const index = state.favorites.findIndex((entry) => entry.type === 'demand' && entry.id === note.id);
      if (index >= 0) {
        state.favorites.splice(index, 1);
        showToast('已取消收藏纸条');
      } else {
        state.favorites.push({ type: 'demand', id: note.id, title: note.title, at: fmtNow() });
        showToast('已收藏纸条');
      }
      persist();
      updateCounters();
      const button = $('#noteFavoriteButton', sheet);
      if (button) button.textContent = state.favorites.some((entry) => entry.type === 'demand' && entry.id === note.id) ? '已收藏' : '收藏纸条';
    });
    const openRef = $('#openRef', sheet);
    if (openRef && refVideo) openRef.addEventListener('click', () => showVideo(refVideo));
  });
}

function showLeaveNote(referenceVideo = null) {
  openSheet(`
    <div class="sheet-inner">
      <h2 class="sheet-title" id="sheetTitle" tabindex="-1">在这里留一张纸条</h2>
      <p class="sheet-subtitle">你正站在${currentZoneName()}。纸条会出现在你脚下的位置，所有人都能看见，也都能忽略。${referenceVideo ? `这张纸条会自动钉在《${escapeHtml(referenceVideo.title)}》旁。` : '如果你站在某段视频旁按 N，纸条会自动引用它。'}</p>
      <form id="leaveNoteForm">
        <label>类型
          <span class="option-row">
            <label><input type="radio" name="noteType" value="personal" checked /> 个人需求</label>
            <label><input type="radio" name="noteType" value="commerce" /> 模拟商业需求（不形成真实交易）</label>
          </span>
        </label>
        <label>想说的话<input name="title" required maxlength="40" placeholder="想找一段……" /></label>
        <label>补充说明<textarea name="description" rows="3" placeholder="风格、用途、长度、预算（虚拟）都可以写"></textarea></label>
        <button class="primary-button" type="submit">把纸条钉在这里</button>
      </form>
    </div>
  `, () => $('#leaveNoteForm').addEventListener('submit', (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const title = form.elements.title.value.trim();
    if (!title) return;
    const type = form.elements.noteType.value;
    const note = {
      id: `n-${Date.now()}`,
      title,
      description: form.elements.description.value.trim(),
      type,
      by: state.profile.nickname || '路过的风',
      wx: state.wx + 40,
      wy: state.wy + 20,
      zone: zoneAt(state.wx, state.wy).id,
      refAsset: referenceVideo ? referenceVideo.id : null,
      responses: [],
      createdAt: '刚刚',
    };
    state.notes.push(note);
    persist();
    logEvent('publish_demand', { demand_id: note.id, demand_type: type, zone_id: note.zone });
    if (referenceVideo) logEvent('demand_asset_link', { demand_id: note.id, asset_id: referenceVideo.id, auto: true });
    closeSheet();
    renderCreations();
    renderWorld();
    say(`纸条钉在了${currentZoneName()}。想知道写了什么的人，自然会走过来。`);
    showToast('纸条已出现在你脚边');
  }));
}

function showBoard() {
  const allNotes = [...systemNotes, ...state.notes];
  openSheet(`
    <div class="sheet-inner">
      <h2 class="sheet-title" id="sheetTitle" tabindex="-1">公告树</h2>
      <p class="sheet-subtitle">所有留在世界里的纸条都挂在风的记忆里。你可以在这里找，也可以去它们所在的位置。想留新纸条，在世界任意地方按 N。</p>
      <label class="search-box">搜索纸条或视频
        <input id="boardSearch" placeholder="例如：海、猫、咖啡" />
      </label>
      <div class="list-stack" id="boardResults"></div>
    </div>
  `, () => {
    const render = () => {
      const box = $('#boardResults', sheet);
      const query = ($('#boardSearch', sheet).value || '').trim().toLowerCase();
      const rows = [];
      allNotes.forEach((note, index) => {
        if (query && !`${note.title}${note.description || ''}`.toLowerCase().includes(query)) return;
        rows.push(`<div class="list-row"><div><b>${escapeHtml(note.title)}</b><span>${note.type === 'commerce' ? '模拟商业需求' : '个人需求'} · ${escapeHtml(note.by || '我')} · ${escapeHtml(zoneAt(note.wx, note.wy).name)}</span></div><div class="row-actions"><button class="text-button" data-open-note="${index}">打开</button><button class="text-button" data-goto-note="${index}">定位</button></div></div>`);
      });
      worldVideos.concat(state.published).forEach((video) => {
        if (!query) return;
        if (!`${video.title}${(video.tags || []).join('')}`.toLowerCase().includes(query)) return;
        rows.push(`<div class="list-row"><div><b>${escapeHtml(video.title)}</b><span>公共视频 · ${escapeHtml(zoneAt(video.wx, video.wy).name)}</span></div><button class="text-button" data-goto-video="${video.id}">定位</button></div>`);
      });
      box.innerHTML = rows.length ? rows.join('') : '<div class="empty-state">没有匹配的纸条或视频。</div>';
      $$('[data-open-note]', box).forEach((button) => button.addEventListener('click', () => showNoteDetail(allNotes[Number(button.dataset.openNote)])));
      $$('[data-goto-note]', box).forEach((button) => button.addEventListener('click', () => {
        const note = allNotes[Number(button.dataset.gotoNote)];
        state.wx = note.wx;
        state.wy = note.wy + 84;
        closeSheet();
        renderWorld();
        showToast('已在纸条旁');
      }));
      $$('[data-goto-video]', box).forEach((button) => button.addEventListener('click', () => {
        const video = allVideos().find((candidate) => candidate.id === button.dataset.gotoVideo);
        if (!video) return;
        state.wx = video.wx;
        state.wy = video.wy + 84;
        closeSheet();
        renderWorld();
        setTimeout(() => showVideo(video), 80);
      }));
    };
    $('#boardSearch').addEventListener('input', render);
    render();
  });
}

function showWorkshop() {
  openSheet(`
    <div class="sheet-inner">
      <h2 class="sheet-title" id="sheetTitle" tabindex="-1">共创台</h2>
      <p class="sheet-subtitle">把素材放进背包（B），然后走到世界任何你喜欢的位置发布。这里不再是唯一的发布入口——世界所有空地都是。</p>
      <form id="uploadForm">
        <label>标题<input name="title" required placeholder="给这段素材一个名字" /></label>
        <label>一句话说明<input name="description" placeholder="希望别人怎么看它" /></label>
        <label>素材文件（可选）<input name="file" type="file" accept="video/*,image/*" /></label>
        <p class="form-error" id="uploadError"></p>
        <button class="primary-button" type="submit">放进背包</button>
      </form>
      <div class="note-section"><h3>背包里现有的素材</h3>
        <div class="list-stack">${state.bag.map((item, index) => `<div class="list-row"><div><b>${escapeHtml(item.title)}</b><span>${escapeHtml(item.fileName || '示例素材')}</span></div><button class="text-button" data-publish-at="${index}">在脚下发布</button></div>`).join('')}</div>
      </div>
    </div>
  `, () => {
    $('#uploadForm').addEventListener('submit', async (event) => {
      event.preventDefault();
      const form = event.currentTarget;
      const title = form.elements.title.value.trim();
      if (!title) return $('#uploadError').textContent = '请填写标题。';
      const file = form.elements.file.files?.[0] || null;
      const id = `u-${Date.now()}`;
      state.bag.push({ id, title, description: form.elements.description.value.trim(), fileName: file?.name || '', mime: file?.type || '', status: file ? 'stored-locally' : 'metadata-only' });
      try { await saveUploadFile(id, file); } catch { state.bag[state.bag.length - 1].status = 'metadata-only'; }
      persist();
      logEvent('upload_to_bag', { title });
      closeSheet();
      showToast('素材已放进背包，按 B 查看');
    });
    $$('[data-publish-at]', sheet).forEach((button) => button.addEventListener('click', () => {
      publishBagItem(Number(button.dataset.publishAt));
    }));
  });
}

function showBag() {
  openSheet(`
    <div class="sheet-inner">
      <h2 class="sheet-title" id="sheetTitle" tabindex="-1">背包</h2>
      <p class="sheet-subtitle">这里装着可以发布到世界的素材，和你的视频副本。走到哪里，就能在哪里发布。</p>
      <div class="note-section"><h3>待发布素材</h3>
        <div class="list-stack">${state.bag.length ? state.bag.map((item, index) => `<div class="list-row"><div><b>${escapeHtml(item.title)}</b><span>${escapeHtml(item.description || item.fileName || '示例素材')}</span></div><button class="text-button" data-bag-publish="${index}">在脚下发布</button></div>`).join('') : '<div class="empty-state">背包空着。到共创台上传，或用示例素材体验发布。</div>'}</div>
      </div>
      <div class="note-section"><h3>副本口袋（${state.copies.length}）</h3>
        <div class="list-stack">${state.copies.length ? state.copies.map((copy, index) => {
          const video = allVideos().find((candidate) => candidate.id === copy.assetId);
          return `<div class="list-row"><div><b>${escapeHtml(video ? video.title : '一段副本')}</b><span>竞价获得 · ${new Date(copy.acquiredAt).toLocaleDateString('zh-CN')}</span></div><button class="text-button" data-copy-goto="${index}">去小窝摆放</button></div>`;
        }).join('') : '<div class="empty-state">视频旁按 G 参与虚拟竞价，赢了才能获得副本。</div>'}</div>
      </div>
      ${state.pocketWords.length ? `<div class="note-section"><h3>口袋里捡的话</h3><div class="comment-list">${state.pocketWords.slice(-3).map((word) => `<div class="comment">${escapeHtml(word)}</div>`).join('')}</div></div>` : ''}
    </div>
  `, () => {
    $$('[data-bag-publish]', sheet).forEach((button) => button.addEventListener('click', () => publishBagItem(Number(button.dataset.bagPublish))));
    $$('[data-copy-goto]', sheet).forEach((button) => button.addEventListener('click', () => {
      closeSheet();
      showToast('走向你的小屋（西侧木门），在小窝里按 F 摆放副本');
    }));
  });
}

function publishBagItem(index) {
  const item = state.bag[index];
  if (!item) return;
  state.bag.splice(index, 1);
  const publishId = item.id && item.id.startsWith('u-') ? item.id : `p-${Date.now()}`;
  const zone = zoneAt(state.wx, state.wy);
  let context = zone.name;
  const nearVideo = allVideos().find((video) => Math.hypot(state.wx - video.wx, state.wy - video.wy) < 420);
  if (nearVideo) context = `靠近《${nearVideo.title}》`;
  state.published.push({
    id: publishId,
    title: item.title,
    description: item.description || '',
    fileName: item.fileName || '',
    mime: item.mime || '',
    source: 'user',
    spawn_source: '我的发布',
    wx: state.wx + 60,
    wy: state.wy - 40,
    zone: zone.id,
    likes: 0,
    dur: '—', res: '本地', license: '个人', price: 0,
    comments: [],
    exposureRoll: Math.random(),
    at: fmtNow(),
  });
  persist();
  logEvent('publish_asset', { asset_id: publishId, asset_world_position: { wx: Math.round(state.wx), wy: Math.round(state.wy) }, asset_zone: zone.id, publish_context: context, publish_timestamp: new Date().toISOString() });
  closeSheet();
  renderScreens();
  renderWorld();
  say(`《${item.title}》落在了${zone.name}，成了公共世界的一部分。`, '木秋');
  showToast('素材已发布到世界');
}

function enterCottage() {
  state.worldMode = 'cottage';
  worldStage.classList.add('is-cottage');
  worldArt.hidden = false;
  cottageExit.hidden = false;
  zoneName.textContent = currentZoneName();
  renderPlaced();
  persist();
  logEvent('space_enter', { space: 'personal' });
  say(`这里是${state.profile.spaceName || '你的小窝'}。世界上唯一可以随意摆放副本的地方。`, '木秋', [
    { label: '打开布置簿', handler: showPersonalSpace },
    { label: '放一枚副本', handler: placeCopy },
  ]);
}

function exitCottage() {
  state.worldMode = 'overworld';
  state.carryPlaced = null;
  worldStage.classList.remove('is-cottage');
  worldArt.hidden = true;
  cottageExit.hidden = true;
  persist();
  renderWorld();
  logEvent('space_exit', { space: 'personal' });
  say('门外还是那片公域。你可以继续走，或换个方向。');
}

function placeCopy() {
  if (state.worldMode !== 'cottage') return showToast('回到你的小屋才能摆放副本');
  if (!state.copies.length) return showToast('口袋里没有副本。视频旁按 G 参与竞价');
  if (state.placed.length >= HOME_CAPACITY) return showToast('小窝摆满了。先在布置簿里收起一些');
  const copy = state.copies.shift();
  state.placed.push({ type: 'copy', assetId: copy.assetId, x: Math.round(state.cottageX), y: Math.round(state.cottageY), since: copy.acquiredAt });
  renderPlaced();
  updateCounters();
  persist();
  logEvent('copy_placed_home', { asset_id: copy.assetId });
  say('副本放好了。它不会过期，也不会被任何人拿走。');
}

function pickUpPlaced(index) {
  if (state.carryPlaced === index) {
    const item = state.placed[index];
    state.placed.splice(index, 1);
    if (item.type === 'copy') state.copies.push({ assetId: item.assetId, acquiredAt: Date.now() });
    state.carryPlaced = null;
    updateCounters();
    persist();
    logEvent('copy_removed_home', { asset_id: item.assetId });
    renderScreens();
    showToast('副本收回了口袋');
  } else {
    state.carryPlaced = index;
    showToast('拿到了这枚副本。点击地面换个位置，再点它一下收回口袋');
  }
  renderPlaced();
}

function combineCopies() {
  if (state.copies.length < 2) return showToast('至少需要两枚副本');
  if (state.placed.length >= HOME_CAPACITY) return showToast('小窝摆满了。先在布置簿里收起一些');
  const parts = state.copies.splice(0, 2).map((copy) => copy.assetId);
  state.placed.push({ type: 'combo', parts, assetId: parts[0], x: 22, y: 42, since: Date.now() });
  renderPlaced();
  updateCounters();
  persist();
  logEvent('combine', { asset_ids: parts });
  showToast('两枚副本拼成了一段新的组合');
}

function showPersonalSpace() {
  const placedList = state.placed.length
    ? state.placed.map((item, index) => {
      const video = allVideos().find((candidate) => candidate.id === item.assetId);
      const kept = Math.max(0, Math.floor((Date.now() - (item.since || Date.now())) / 60000));
      return `<div class="bid-row"><span>${item.type === 'combo' ? '组合的副本' : '《' + escapeHtml(video ? video.title : '副本') + '》'} · ${Math.round(item.x)},${Math.round(item.y)}</span><b>已留 ${kept} 分钟</b></div>`;
    }).join('')
    : '<div class="empty-state">小窝里还没有副本。在世界里竞价成功后，副本会进入你的口袋。</div>';
  openSheet(`
    <div class="sheet-inner">
      <h2 class="sheet-title" id="sheetTitle" tabindex="-1">${escapeHtml(state.profile.spaceName || '我的小窝')}布置簿</h2>
      <p class="sheet-subtitle">小窝最多同时摆放 ${HOME_CAPACITY} 个对象。在小窝里点击副本拿起来，点击地面放下；长期保留的副本会被记录为稳定偏好。</p>
      <div class="choice-grid">
        <button class="choice-button" data-rug="teal"><b>灰绿毯</b><span>安静的底色</span></button>
        <button class="choice-button" data-rug="brick"><b>赭红毯</b><span>只改变自己的空间</span></button>
      </div>
      <div class="note-section"><h3>当前摆放</h3>${placedList}</div>
      <div class="media-actions">
        <button class="primary-button" id="placeCopyButton">放一枚副本在脚边</button>
        <button class="paper-button" id="combineButton">组合两枚副本</button>
      </div>
    </div>
  `, () => {
    $$('[data-rug]', sheet).forEach((button) => button.addEventListener('click', () => {
      state.rug = button.dataset.rug;
      renderPlaced();
      persist();
      logEvent('space_customize', { property: 'rug', value: state.rug });
      showToast('只改变了你的小窝');
    }));
    $('#placeCopyButton').addEventListener('click', placeCopy);
    $('#combineButton').addEventListener('click', combineCopies);
  });
}

function showTelescope() {
  logEvent('telescope_open');
  const far = worldVideos
    .map((video) => ({ video, distance: Math.hypot(video.wx - state.wx, video.wy - state.wy) }))
    .filter((entry) => entry.distance > 1000)
    .sort((a, b) => (state.exposureCounts[a.video.id] || 0) - (state.exposureCounts[b.video.id] || 0));
  let pick = far[Math.floor(Math.random() * Math.min(8, far.length))]?.video || worldVideos[0];
  const render = () => {
    const zone = zoneAt(pick.wx, pick.wy);
    openSheet(`
      <div class="sheet-inner">
        <h2 class="sheet-title" id="sheetTitle" tabindex="-1">你举起望远镜</h2>
        <p class="sheet-subtitle">远处的${zone.name}好像有什么在动。</p>
        <div class="status-banner">${escapeHtml(pick.title)} · ${escapeHtml(pick.spawn_source || '')} · 被看得很少的内容也会到这里来</div>
        <div class="media-actions">
          <button class="primary-button" id="telescopeGo">走过去看看</button>
          <button class="paper-button" id="telescopeNext">换一个方向</button>
          <button class="text-button" id="telescopeDown">放下望远镜</button>
        </div>
      </div>
    `, () => {
      logEvent('random_exposure', { asset_id: pick.id });
      $('#telescopeGo').addEventListener('click', () => {
        logEvent('telescope_follow', { asset_id: pick.id });
        const target = pick;
        state.wx = target.wx;
        state.wy = target.wy + 84;
        closeSheet();
        renderWorld();
        setTimeout(() => showVideo(target), 80);
      });
      $('#telescopeNext').addEventListener('click', () => {
        const candidates = far.filter((entry) => entry.video.id !== pick.id);
        const next = candidates[Math.floor(Math.random() * Math.min(8, candidates.length))];
        if (next) pick = next.video;
        render();
      });
      $('#telescopeDown').addEventListener('click', closeSheet);
    });
  };
  render();
}

function spawnBottle() {
  const rand = mulberry32((Date.now() % 100000) + daySeed);
  state.bottleState = { wx: -2200 + rand() * 5000, wy: 420 + rand() * 380, open: false };
}

function openBottle() {
  if (!state.bottleState || state.bottleState.open) return;
  logEvent('bottle_exposure', { wx: Math.round(state.bottleState.wx) });
  state.bottleState.open = true;
  persist();
  logEvent('bottle_open');
  const roll = Math.floor(Math.random() * 4);
  const candidateVideo = worldVideos[Math.floor(Math.random() * worldVideos.length)];
  const contents = [
    { kind: 'word', title: '瓶子里有一句被海水泡过的话', body: '“有些视频要放在能听见风的边上。”' },
    { kind: 'video', title: '瓶子里指向一段视频', body: `有人把《${candidateVideo.title}》折进了这张纸里。`, asset_id: candidateVideo.id },
    { kind: 'tag', title: '瓶子里蜷着一株标签植物', body: '一株还没长大的「夏天」标签，可以插到任何视频旁。', tag: '夏天' },
    { kind: 'note', title: '瓶子里有一卷小纸条', body: '“想找一段只有脚步声的城市早晨。”' },
  ];
  const content = contents[roll];
  openSheet(`
    <div class="sheet-inner">
      <h2 class="sheet-title" id="sheetTitle" tabindex="-1">${escapeHtml(content.title)}</h2>
      <p class="sheet-subtitle">${escapeHtml(content.body)}</p>
      <div class="media-actions">
        ${content.kind === 'video' ? '<button class="primary-button" id="bottleGo">去看这段视频</button>' : ''}
        ${content.kind === 'tag' ? '<button class="primary-button" id="bottleTake">带走这株标签</button>' : ''}
        ${content.kind === 'note' ? '<button class="primary-button" id="bottleNote">照这个方向留张纸条</button>' : ''}
        ${content.kind === 'word' ? '<button class="primary-button" id="bottleKeep">收进口袋</button>' : ''}
        <button class="paper-button" id="bottleReturn">扔回海里</button>
      </div>
      <form class="note-section" id="bottleReplyForm">
        <label>也可以回一句，再扔回去<input name="reply" maxlength="60" placeholder="给下一个捡到的人" /></label>
        <button class="text-button" type="submit">放回并漂流</button>
      </form>
    </div>
  `, () => {
    const go = $('#bottleGo', sheet);
    if (go) go.addEventListener('click', () => {
      const video = allVideos().find((candidate) => candidate.id === content.asset_id);
      if (!video) return closeSheet();
      state.wx = video.wx;
      state.wy = video.wy + 84;
      closeSheet();
      renderWorld();
      setTimeout(() => showVideo(video), 80);
    });
    const take = $('#bottleTake', sheet);
    if (take) take.addEventListener('click', () => {
      state.carryTag = content.tag;
      logEvent('bottle_keep', { content: 'tag' });
      persist();
      closeSheet();
      showToast(`你带着一株「${content.tag}」标签了`);
    });
    const noteBtn = $('#bottleNote', sheet);
    if (noteBtn) noteBtn.addEventListener('click', () => showLeaveNote());
    const keep = $('#bottleKeep', sheet);
    if (keep) keep.addEventListener('click', () => {
      state.pocketWords.push(content.body);
      logEvent('bottle_keep', { content: 'word' });
      persist();
      closeSheet();
      showToast('那句话收进了口袋');
    });
    $('#bottleReturn').addEventListener('click', () => {
      logEvent('bottle_return');
      spawnBottle();
      persist();
      renderDecos();
      closeSheet();
      showToast('瓶子顺着潮水漂远了');
    });
    $('#bottleReplyForm').addEventListener('submit', (event) => {
      event.preventDefault();
      const text = event.currentTarget.elements.reply.value.trim();
      logEvent('bottle_reply', { length: text.length });
      spawnBottle();
      persist();
      renderDecos();
      closeSheet();
      showToast('你的回信也一起漂流了');
    });
  });
}

function showSeabench() {
  logEvent('bench_sit');
  const recent = [...state.benchMessages].slice(-3).reverse();
  openSheet(`
    <div class="sheet-inner">
      <h2 class="sheet-title" id="sheetTitle" tabindex="-1">你坐下了</h2>
      <p class="sheet-subtitle">海面把光分成很多条。这不是聊天室，只是有人坐过，也留过一句话。</p>
      <div class="note-section"><h3>最近坐在这里的人说</h3>
        <div class="comment-list">${recent.map((message) => `<div class="comment"><b>${escapeHtml(message.name)}</b><span>${escapeHtml(message.text)}</span></div>`).join('')}</div>
      </div>
      <form id="benchForm">
        <label>也留一句吧<input name="line" maxlength="60" placeholder="关于海、风或刚才看到的视频" /></label>
        <div class="media-actions">
          <button class="primary-button" type="submit">留下</button>
          <button class="text-button" type="button" id="benchLeave">起身离开</button>
        </div>
      </form>
    </div>
  `, () => {
    $('#benchForm').addEventListener('submit', (event) => {
      event.preventDefault();
      const text = event.currentTarget.elements.line.value.trim();
      if (!text) return;
      state.benchMessages.push({ name: state.profile.nickname || '路过的风', text });
      if (state.benchMessages.length > 10) state.benchMessages = state.benchMessages.slice(-10);
      persist();
      logEvent('bench_reply', { length: text.length });
      closeSheet();
      showToast('这句话会等下一个坐下来的人');
    });
    $('#benchLeave').addEventListener('click', closeSheet);
  });
}

function showNeighbor() {
  openSheet(`
    <div class="sheet-inner">
      <h2 class="sheet-title" id="sheetTitle" tabindex="-1">晚枝修理所</h2>
      <p class="sheet-subtitle">一个玩家自愿公开的小窝。你只能看和回应，不能移动对方的副本。</p>
      <div class="video-frame"><span class="video-status">邻居空间预览</span></div>
      <div class="media-actions">
        <button class="primary-button" id="followButton">${state.following ? '取消关注' : '关注这个空间'}</button>
      </div>
    </div>
  `, () => {
    $('#followButton').addEventListener('click', () => {
      state.following = !state.following;
      persist();
      logEvent(state.following ? 'follow' : 'unfollow', { space_id: 'late-branch-repair' });
      showNeighbor();
    });
  });
}

function showSoundDock() {
  openSheet(`
    <div class="sheet-inner">
      <h2 class="sheet-title" id="sheetTitle" tabindex="-1">听风码头</h2>
      <p class="sheet-subtitle">这里没有任务，也没有完成状态。声音随时会停，你也可以什么都不听。</p>
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

function showAnomaly() {
  openSheet(`
    <div class="sheet-inner">
      <h2 class="sheet-title" id="sheetTitle" tabindex="-1">今日异象：世界正在失去颜色</h2>
      <p class="sheet-subtitle">你可以恢复、替代、混合，或者完全忽略。没有倒计时，也不会留下未完成压力。</p>
      <div class="choice-grid">
        <button class="choice-button" data-event-choice="restore"><b>尝试恢复颜色</b><span>把色彩放回自己的物件</span></button>
        <button class="choice-button" data-event-choice="replace"><b>接受灰一点</b><span>让世界安静一次</span></button>
        <button class="choice-button" data-event-choice="ignore"><b>什么都不做</b><span>继续按自己的方式探索</span></button>
        <button class="choice-button" data-event-choice="mix"><b>搅一搅</b><span>产生一个无法预先判断的结果</span></button>
      </div>
    </div>
  `, () => $$('[data-event-choice]', sheet).forEach((button) => button.addEventListener('click', () => {
    state.eventChoice = button.dataset.eventChoice;
    worldStage.classList.toggle('event-muted', state.eventChoice === 'replace' || state.eventChoice === 'mix');
    persist();
    logEvent('world_event_response', { choice: state.eventChoice });
    closeSheet();
    const messages = { restore: '你把颜色留在了自己的物件上。', replace: '世界安静了一点。', ignore: '你选择继续散步，世界没有催促你。', mix: '颜色们暂时达成了不稳定的和平。' };
    say(messages[state.eventChoice]);
  })));
}

function showAbout() {
  openSheet(`
    <div class="sheet-inner">
      <h2 class="sheet-title" id="sheetTitle" tabindex="-1">这个世界如何运作</h2>
      <p class="sheet-subtitle">公共视频是持续存在的共享对象，不会消失。副本只通过虚拟竞价产生；收藏不等于购买。你在任何地方都能发布视频和纸条。</p>
      <div class="choice-grid">
        <div class="choice-button"><b>随地发生</b><span>发布视频、留纸条、竞价，都发生在你站着的地方</span></div>
        <div class="choice-button"><b>没有大厅</b><span>世界用装置代替功能菜单：望远镜、漂流瓶、长椅、标签植物</span></div>
        <div class="choice-button"><b>曝光被完整记录</b><span>看到与没看到会被区分，原始事件保留、派生结论后算</span></div>
        <div class="choice-button"><b>一切都是虚拟</b><span>灵感币无现金价值；NPC 始终被标记</span></div>
      </div>
    </div>
  `);
}

function showFavorites() {
  const rows = state.favorites.length
    ? state.favorites.map((entry, index) => {
      const label = { media: '公共视频', demand: '需求纸条' }[entry.type] || '收藏';
      return `<div class="list-row"><div><b>${escapeHtml(entry.title)}</b><span>${label} · ${escapeHtml(entry.at || '')}</span></div><div class="row-actions"><button class="text-button" data-open-favorite="${index}">打开</button><button class="text-button" data-remove-favorite="${index}">取消收藏</button></div></div>`;
    }).join('')
    : '<div class="empty-state">还没有收藏。视频和纸条都可以收藏——收藏表示“以后还想找到它”，不表示购买。</div>';
  openSheet(`
    <div class="sheet-inner">
      <h2 class="sheet-title" id="sheetTitle" tabindex="-1">我的收藏</h2>
      <p class="sheet-subtitle">收藏只记录你的回访意图，不会移动公共世界里的任何东西。</p>
      <div class="list-stack">${rows}</div>
    </div>
  `, () => {
    $$('[data-open-favorite]', sheet).forEach((button) => button.addEventListener('click', () => {
      const fav = state.favorites[Number(button.dataset.openFavorite)];
      if (!fav) return;
      const found = fav.type === 'media'
        ? allVideos().find((video) => video.id === fav.id)
        : [...systemNotes, ...state.notes].find((note) => note.id === fav.id);
      if (!found) { closeSheet(); return showToast('它已经不在世界里了'); }
      if (fav.type === 'demand') { closeSheet(); showNoteDetail(found); return; }
      state.wx = found.wx;
      state.wy = found.wy + 84;
      closeSheet();
      renderWorld();
      logEvent('favorite_revisit', { asset_id: found.id });
      setTimeout(() => showVideo(found), 80);
    }));
    $$('[data-remove-favorite]', sheet).forEach((button) => button.addEventListener('click', () => {
      state.favorites.splice(Number(button.dataset.removeFavorite), 1);
      persist();
      updateCounters();
      showFavorites();
    }));
  });
}

function showData() {
  const stats = [
    ['探索步数', Math.round(state.exploreSteps), 12000],
    ['观看视频', countEvent('asset_open'), 60],
    ['播放次数', countEvent('play'), 60],
    ['点赞', countEvent('like'), 40],
    ['收藏', countEvent('favorite'), 30],
    ['评论', countEvent('comment'), 30],
    ['贴标签', countEvent('tag_add'), 30],
    ['出价', countEvent('bid_raise'), 40],
    ['竞得副本', countEvent('bid_win'), 10],
    ['副本带回家', countEvent('copy_placed_home'), 10],
    ['发布素材', countEvent('publish_asset'), 20],
    ['留纸条', countEvent('publish_demand'), 15],
    ['曝光记录批次', countEvent('impression_batch'), 60],
  ];
  const max = Math.max(1, ...stats.map(([, value]) => value), ...stats.map(([, , cap]) => cap));
  const level = creatorLevel();
  openSheet(`
    <div class="sheet-inner">
      <h2 class="sheet-title" id="sheetTitle" tabindex="-1">数据与成长</h2>
      <p class="sheet-subtitle">原始行为不会被直接解释成喜欢或不喜欢。这里展示的派生信号全部基于本地原始事件重算。</p>
      <div class="auction-price">
        <div class="price-block"><span>成长称谓</span><strong>${level.label}</strong></div>
        <div class="price-block"><span>曝光样本</span><strong>${Object.keys(state.exposureCounts).length}</strong> 段视频</div>
      </div>
      <div class="note-section"><h3>行为统计</h3>
        ${stats.map(([label, value]) => `<div class="stat-row"><span>${label}</span><div class="stat-track"><i style="width:${Math.min(100, Math.round(value / max * 100))}%"></i></div><b>${value}</b></div>`).join('')}
      </div>
      <div class="note-section"><h3>重要信号说明</h3>
        <div class="comment"><b>copy_long_term_kept</b><span>副本长期留在小窝，是最稳定的偏好信号</span></div>
        <div class="comment"><b>avoid</b><span>靠近后没有打开就离开，被记录为潜在负反馈</span></div>
        <div class="comment"><b>impression_batch</b><span>记录看到/没看到，才能区分不喜欢和没看到</span></div>
      </div>
    </div>
  `);
}

function showLedger() {
  const spends = state.rawEvents.filter((event) => event.raw_event === 'bid_raise' && event.details.bidder_type === 'player');
  const total = spends.reduce((sum, event) => sum + (event.details.amount || 0), 0);
  openSheet(`
    <div class="sheet-inner">
      <h2 class="sheet-title" id="sheetTitle" tabindex="-1">灵感币账本</h2>
      <p class="sheet-subtitle">灵感币是有限虚拟预算：可以看很多视频，但只能把有限副本带回家。不可提现、不可兑换、不产生真实购买。</p>
      <div class="auction-price">
        <div class="price-block"><span>当前余额</span><strong>${state.wallet}</strong></div>
        <div class="price-block"><span>累计出价</span><strong>${total}</strong></div>
      </div>
      <div class="note-section"><h3>最近出价</h3>
        <div class="list-stack">${spends.length ? spends.slice(-12).reverse().map((event) => `<div class="list-row"><div><b>提价 +${event.details.amount}</b><span>${escapeHtml(event.details.asset_id)} · ${event.created_at.slice(11, 16)}</span></div><b class="amount-out">-${event.details.amount}</b></div>`).join('') : '<div class="empty-state">还没有出价记录。视频旁按 G 参与竞价。</div>'}</div>
      </div>
      <div class="status-banner">竞价是探索的一部分：你可以出 0 次价。放弃会被记录为价格上限信号，不是失败。</div>
    </div>
  `);
}

function showHelpFeedback() {
  const faq = [
    ['怎么发布视频？', '共创台上传（或直接用背包里的示例素材），按 B 打开背包，在世界任意位置点“在脚下发布”。'],
    ['副本怎么获得？', '走近视频按 G 参与虚拟竞价，植物开花且你领先时，副本入口袋。回小窝按 F 摆放。'],
    ['收藏和购买有什么区别？', '收藏是“以后还想找到它”；只有竞价成功才获得可持有的副本。'],
    ['纸条是什么？', '在世界任意位置按 N 留下的需求；站在视频旁按 N 会自动引用那段视频。'],
    ['标签植物怎么用？', '按 E 拔下一株，走到视频旁按 F 贴上去。'],
    ['为什么内容会变化？', '每个区域的内容按推荐分与低曝光补偿动态选取；世界每天也会换一批。'],
  ];
  openSheet(`
    <div class="sheet-inner">
      <h2 class="sheet-title" id="sheetTitle" tabindex="-1">帮助与反馈</h2>
      <div class="note-section"><h3>常见问题</h3>
        ${faq.map(([question, answer]) => `<details class="faq-item"><summary>${escapeHtml(question)}</summary><p>${escapeHtml(answer)}</p></details>`).join('')}
      </div>
      <form class="note-section" id="feedbackForm">
        <h3>意见反馈</h3>
        <label>你的反馈<textarea name="feedback" rows="3" required placeholder="遇到的问题或建议"></textarea></label>
        <button class="primary-button" type="submit">提交反馈</button>
      </form>
    </div>
  `, () => $('#feedbackForm').addEventListener('submit', (event) => {
    event.preventDefault();
    const text = event.currentTarget.elements.feedback.value.trim();
    logEvent('feedback', { length: text.length });
    persist();
    closeSheet();
    showToast('反馈已记录');
  }));
}

function showPrivacy() {
  openSheet(`
    <div class="sheet-inner">
      <h2 class="sheet-title" id="sheetTitle" tabindex="-1">数据与隐私</h2>
      <p class="sheet-subtitle">适用年龄 16+。靠近、观看、点赞、收藏、评论、标签、竞价和副本去向都会被记录，用于推荐与模型研究，不提供给第三方训练。</p>
      <div class="status-banner">原始事件永久保存，派生结论后算。退出研究不会删除账户；删除申请会匿名化行为记录，并保留公共世界的连续性。</div>
      <label class="check-label"><input type="checkbox" id="researchToggle" ${state.research ? 'checked' : ''} /> 参与推荐与模型研究</label>
      <div class="media-actions"><button class="paper-button" id="exportData">导出我的行为记录</button><button class="danger-button" id="deleteData">申请删除并匿名化</button></div>
      <div class="danger-zone"><b>虚拟声明</b><p>灵感币无现金价值，不可提现、不可兑换。NPC（如慢半拍的鹿）始终被明确标记。</p></div>
    </div>
  `, () => {
    $('#researchToggle').addEventListener('change', (event) => { state.research = event.target.checked; persist(); logEvent('research_consent_change', { active: state.research }); showToast(state.research ? '已加入研究' : '已退出研究，账户仍保留'); });
    $('#exportData').addEventListener('click', () => showToast(`已准备 ${state.rawEvents.length} 条原始事件的导出设计`));
    $('#deleteData').addEventListener('click', () => { state.anonymized = true; state.research = false; persist(); logEvent('deletion_request'); showToast('删除申请已记录，行为数据将匿名化'); });
  });
}

function showAdmin() {
  openSheet(`
    <div class="sheet-inner">
      <h2 class="sheet-title" id="sheetTitle" tabindex="-1">公域维护簿</h2>
      <p class="sheet-subtitle">管理员原型范围：内容审核、曝光补偿参数、实验分组、数据导出。不改变普通玩家的世界能力。</p>
      <div class="auction-price">
        <div class="price-block"><span>本地原始事件</span><strong>${state.rawEvents.length}</strong> 条</div>
        <div class="price-block"><span>曝光批次</span><strong>${countEvent('impression_batch')}</strong> 批</div>
      </div>
      <div class="choice-grid">
        <button class="choice-button admin-action"><b>调整曝光补偿</b><span>给低曝光内容更多出现机会</span></button>
        <button class="choice-button admin-action"><b>审核公共世界</b><span>${state.published.length} 个玩家发布位置</span></button>
        <button class="choice-button admin-action"><b>实验分组</b><span>open-world-v1 / mixed-biome</span></button>
        <button class="choice-button admin-action"><b>导出原始事件</b><span>raw_event 与空衍生字段</span></button>
      </div>
      <div class="status-banner">正式实现时，所有持久化必须经过服务端 Feishu Repository，浏览器不持有飞书凭证。</div>
    </div>
  `, () => $$('.admin-action', sheet).forEach((button) => button.addEventListener('click', () => showToast(`已模拟：${button.querySelector('b').textContent}`))));
}

function showProfileForm() {
  const profile = state.profile;
  openSheet(`
    <div class="sheet-inner">
      <h2 class="sheet-title" id="sheetTitle" tabindex="-1">角色与小窝</h2>
      <form id="profileForm">
        <label>头像
          <span class="avatar-row">${AVATAR_SWATCHES.map((swatch, index) => `<button type="button" class="avatar-swatch${profile.avatar === index ? ' is-selected' : ''}" data-avatar="${index}" style="--swatch:${swatch.color}" aria-label="头像 ${swatch.glyph}">${swatch.glyph}</button>`).join('')}</span>
        </label>
        <label>昵称<input name="nickname" value="${escapeHtml(profile.nickname)}" required /></label>
        <label>一句话介绍<input name="bio" value="${escapeHtml(profile.bio)}" /></label>
        <label>小窝名称<input name="spaceName" value="${escapeHtml(profile.spaceName)}" /></label>
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
      profile.spaceName = form.elements.spaceName.value.trim() || '礁石小窝';
      persist();
      logEvent('profile_update');
      closeSheet();
      refreshIdentity();
      showToast('角色资料已保存');
    });
  });
}

function showProfilePanel(type) {
  profileDrawer.hidden = true;
  scrim.hidden = false;
  const panels = {
    profile: showProfileForm,
    favorites: showFavorites,
    data: showData,
    ledger: showLedger,
    help: showHelpFeedback,
    privacy: showPrivacy,
    admin: showAdmin,
  };
  panels[type]?.();
}

function observe() {
  if (!state.nearest) return say('附近没有特别的东西。海在更南边，林子在西边。');
  if (state.nearest.type === 'video') return showVideo(state.nearest.video);
  if (state.nearest.type === 'note') return showNoteDetail(state.nearest.note);
  if (state.nearest.type === 'tagplant') return pluckTagPlant(state.nearest.index);
  if (state.nearest.type === 'bottle') return openBottle();
  const actions = { cottage: enterCottage, board: showBoard, workshop: showWorkshop, telescope: showTelescope, sound: showSoundDock, seabench: showSeabench, neighbor: showNeighbor, anomaly: showAnomaly };
  actions[state.nearest.id]?.();
}

function pluckTagPlant(index) {
  const node = $(`[data-tag-plant="${index}"]`, decoLayer);
  if (state.carryTag) return showToast(`你手里已经拿着一株「${state.carryTag}」了`);
  if (node?.classList.contains('is-depleted')) return showToast('这一株还在重新生长');
  state.carryTag = TAG_PLANTS[index].tag;
  node?.classList.add('is-depleted');
  setTimeout(() => node?.classList.remove('is-depleted'), 90000);
  logEvent('tag_pluck', { tag: state.carryTag });
  showToast(`你拔起了一株「${state.carryTag}」标签植物。走近视频按 F 贴上去`);
  updateNearby();
}

function useSecondaryVerb() {
  if (state.worldMode === 'cottage') {
    if (state.carryPlaced !== null) {
      const item = state.placed[state.carryPlaced];
      if (item) {
        item.x = Math.round(state.cottageX);
        item.y = Math.round(state.cottageY);
        logEvent('copy_moved_home', { asset_id: item.assetId, x: item.x, y: item.y });
      }
      state.carryPlaced = null;
      renderPlaced();
      persist();
      showToast('副本放到了脚边');
      return;
    }
    placeCopy();
    return;
  }
  if (state.nearest?.type === 'video') {
    if (state.carryTag) return plantCarriedTag(state.nearest.video);
    return toggleLike(state.nearest.video);
  }
  showToast(state.carryTag ? '走到一段视频旁，按 F 把标签贴上去' : '这里没有可以互动的对象');
}

function frame(now) {
  const dt = Math.min(32, now - state.lastTime);
  state.lastTime = now;
  if (sheet.hidden && profileDrawer.hidden && entry.classList.contains('is-gone')) {
    const inSea = state.wy > 900 && state.worldMode !== 'cottage';
    const speedFactor = state.worldMode === 'cottage' ? .018 : inSea ? .14 : .24;
    let dx = 0;
    let dy = 0;
    if (state.keys.has('a') || state.keys.has('arrowleft')) dx -= speedFactor * dt;
    if (state.keys.has('d') || state.keys.has('arrowright')) dx += speedFactor * dt;
    if (state.keys.has('w') || state.keys.has('arrowup')) dy -= speedFactor * dt;
    if (state.keys.has('s') || state.keys.has('arrowdown')) dy += speedFactor * dt;
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
  if (state.worldMode !== 'cottage' && sheet.hidden) {
    updateCat();
    updateGulls();
  }
  requestAnimationFrame(frame);
}

setInterval(() => {
  if (!entry.classList.contains('is-gone')) return;
  flushImpressions();
}, 8000);

setInterval(() => {
  const today = new Date().toDateString();
  const longKept = state.placed.filter((item) => Date.now() - (item.since || 0) > 24 * 3600 * 1000);
  if (longKept.length && state.lastKeptDay !== today) {
    state.lastKeptDay = today;
    logEvent('copy_long_term_kept', { count: longKept.length, asset_ids: longKept.map((item) => item.assetId) });
    persist();
  }
}, 30000);

function enterWorld(mode) {
  entry.classList.add('is-gone');
  history.replaceState({}, '', appBasePath);
  localStorage.setItem('zhere-v7-prototype-session', mode);
  if (mode === 'register-mock') {
    const data = new FormData($('#registerForm'));
    state.profile.nickname = data.get('nickname') || state.profile.nickname;
    state.profile.username = data.get('username') || state.profile.username;
    state.profile.spaceName = data.get('spaceName') || state.profile.spaceName;
    persist();
  }
  refreshIdentity();
  logEvent('session_start', { mode, consent_research: state.research, day_seed: daySeed });
  setTimeout(() => { entry.hidden = true; }, 320);
  say('往南走是海，往西是树林。你想留下的东西，走到哪里都可以留下。');
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
    const cx = Math.max(6, Math.min(94, ((event.clientX - rect.left) / rect.width) * 100));
    const cy = Math.max(30, Math.min(88, ((event.clientY - rect.top) / rect.height) * 100));
    if (state.carryPlaced !== null) {
      const item = state.placed[state.carryPlaced];
      if (item) {
        item.x = Math.round(cx);
        item.y = Math.round(cy);
        logEvent('copy_moved_home', { asset_id: item.assetId, x: item.x, y: item.y });
      }
      state.carryPlaced = null;
      showToast('副本放到了新位置');
    } else {
      state.cottageX = cx;
      state.cottageY = cy;
    }
    renderPlaced();
    persist();
  } else {
    state.wx += event.clientX - rect.left - rect.width / 2;
    state.wy += event.clientY - rect.top - rect.height * .52;
    renderWorld();
    logEvent('move_click', { mode: state.worldMode });
  }
});

$$('.world-object').forEach((button) => button.addEventListener('click', (event) => {
  event.stopPropagation();
  const target = objectTargets[button.dataset.object];
  if (!target) return;
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
    if (key === ' ' && state.activeVideo) {
      event.preventDefault();
      togglePlayback(state.activeVideo);
    }
    return;
  }
  if (!profileDrawer.hidden) return;
  if (!entry.classList.contains('is-gone')) return;
  if (['a', 's', 'd', 'w', 'arrowleft', 'arrowright', 'arrowup', 'arrowdown', 'e', 'f', 'g', 'b', 'n', ' '].includes(key)) event.preventDefault();
  state.keys.add(key);
  if (event.repeat) return;
  if (key === 'e') observe();
  if (key === 'f') useSecondaryVerb();
  if (key === 'g' && state.nearest?.type === 'video' && state.worldMode === 'overworld') openBidPanel(state.nearest.video);
  if (key === 'b' && state.worldMode === 'overworld') showBag();
  if (key === 'n' && state.worldMode === 'overworld') showLeaveNote(state.nearest?.type === 'video' ? state.nearest.video : null);
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
$('#logoutButton').addEventListener('click', () => { localStorage.removeItem('zhere-v7-prototype-session'); location.reload(); });
$('#aboutButton').addEventListener('click', showAbout);
$('#eventButton').addEventListener('click', showAnomaly);
$('#bagButton').addEventListener('click', () => { if (state.worldMode === 'overworld') showBag(); });
$('#favoritesButton').addEventListener('click', showFavorites);

const existingSession = localStorage.getItem('zhere-v7-prototype-session');
if (existingSession) $('#guestButton').textContent = '继续上次漫游';
const initialEntryRoute = location.hash.replace('#/', '');
if (['login', 'register', 'forgot-password'].includes(initialEntryRoute)) showEntryPage(initialEntryRoute === 'forgot-password' ? 'forgot' : initialEntryRoute);

worldStage.classList.toggle('event-muted', state.eventChoice === 'replace' || state.eventChoice === 'mix');
if (!state.bottleState) spawnBottle();
renderScreens();
renderCreations();
if (state.worldMode === 'overworld') renderPlaced();
updateCounters();
refreshIdentity();
setInterval(persist, 15000);
if (state.worldMode === 'cottage') {
  worldStage.classList.add('is-cottage');
  worldArt.hidden = false;
  cottageExit.hidden = false;
  renderPlaced();
}
renderWorld();
setTimeout(() => $('#loading').classList.add('is-gone'), 180);
setTimeout(() => { $('#loading').hidden = true; }, 900);
requestAnimationFrame(frame);
