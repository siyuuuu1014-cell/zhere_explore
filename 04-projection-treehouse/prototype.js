const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

const game = $('#game');
const worldStage = $('#worldStage');
const worldShell = $('#worldShell');
const worldArt = $('#worldArt');
const zoneName = $('#zoneName');
const terrainLayer = $('#terrainLayer');
const decoLayer = $('#decoLayer');
const resourceLayer = $('#resourceLayer');
const auraLayer = $('#auraLayer');
const walkTarget = $('#walkTarget');
const player = $('#player');
const contextHint = $('#contextHint');
const contextWheel = $('#contextWheel');
const contextWheelTitle = $('#contextWheelTitle');
const contextObserveHint = $('#contextObserveHint');
const screenLayer = $('#screenLayer');
const placedLayer = $('#placedLayer');
const creationLayer = $('#creationLayer');
const cottageExit = $('#cottageExit');
const homesteadLayer = $('#homesteadLayer');
const plotGrid = $('#plotGrid');
const homeBuildings = $('#homeBuildings');
const wayfinder = $('#wayfinder');
const dialogue = $('#dialogue');
const dialogueText = $('#dialogueText');
const dialogueActions = $('#dialogueActions');
const speaker = $('#speaker');
const walletCount = $('#walletCount');
const copyCount = $('#copyCount');
const favoritesCount = $('#favoritesCount');
const echoCount = $('#echoCount');
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
const energyBar = $('#energyBar');
const energyCount = $('#energyCount');
const dayCount = $('#dayCount');
const seasonName = $('#seasonName');
const weatherName = $('#weatherName');
const woodCount = $('#woodCount');
const stoneCount = $('#stoneCount');
const seedCount = $('#seedCount');
const produceCount = $('#produceCount');
const appBasePath = location.pathname.endsWith('/') ? location.pathname : location.pathname.replace(/[^/]+$/, '');
const STORAGE_KEY = 'zhere-v8-design-state';
const LEGACY_STORAGE_KEY = 'zhere-v7-design-state';
const SESSION_KEY = 'zhere-v8-prototype-session';
const LEGACY_SESSION_KEY = 'zhere-v7-prototype-session';

const HOME_CAPACITY = 12;
const RAW_EVENT_CAP = 600;
const TELEMETRY_SCHEMA_VERSION = 2;
const TELEMETRY_SESSION_ID = crypto.randomUUID ? crypto.randomUUID() : `session-${Date.now()}-${Math.random()}`;
const ESSENTIAL_EVENTS = new Set(['register', 'login', 'logout', 'research_consent_change', 'deletion_request', 'data_export', 'feedback']);
const daySeed = Math.floor(Date.now() / 86400000);
const RESOURCE_RESPAWN_DAYS = 1;
const PLOT_COUNT = 16;
const HOMESTEAD_EXIT = Object.freeze({ x: 8, y: 72, radius: 7 });
let cottageExitPending = false;
let pointerMoveTarget = null;
let publicSyncPromise = null;
let notificationSyncPromise = null;
let lastPublicSyncAt = 0;
let lastNotificationSyncAt = 0;
const PUBLIC_SYNC_INTERVAL_MS = 5000;
const NOTIFICATION_SYNC_INTERVAL_MS = 8000;

const RESOURCE_META = {
  branch: { label: '落枝', reward: { wood: 2 }, energy: 4 },
  stump: { label: '老树桩', reward: { wood: 4, seeds: 1 }, energy: 8 },
  stone: { label: '松动的石块', reward: { stone: 3 }, energy: 6 },
  grass: { label: '高草丛', reward: { fiber: 2, seeds: 1 }, energy: 4 },
  shell: { label: '海边漂流物', reward: { fiber: 2, stone: 1 }, energy: 3 },
};

const CREATOR_TIERS = [
  { id: 'visitor', label: '观客', need: 0, benefit: '基础采集、种植与公共回应' },
  { id: 'echo', label: '回音', need: 3, benefit: '收获额外 +1，并解锁露天放映台与木风铃' },
  { id: 'recorder', label: '记录者', need: 8, benefit: '稀有发现概率提高，并解锁潮光花与标本屋' },
  { id: 'builder', label: '聚落工匠', need: 15, benefit: '公域采集少消耗 1 体力，并解锁堆肥坊' },
  { id: 'weaver', label: '树冠编织者', need: 24, benefit: '小窝容量 +4，并解锁夜莓与叶灯' },
];

const CROP_META = {
  fieldbean: { name: '风铃豆', need: 0, seedCost: 1, days: 3, yield: 2, seasons: ['初春', '盛夏', '深秋', '冬日'], description: '生长快，适合整理刚清出的土地。' },
  tideflower: { name: '潮光花', need: 8, seedCost: 2, days: 4, yield: 3, seasons: ['初春', '盛夏'], description: '从海岸气息里长出的浅蓝花冠。' },
  nightberry: { name: '夜莓', need: 24, seedCost: 3, days: 5, yield: 5, seasons: ['深秋', '冬日'], description: '生长慢，但会结出更多收成。' },
};

const CRAFT_RECIPES = {
  birdhouse: { name: '木鸟屋', need: 0, cost: { wood: 4, fiber: 2 } },
  projector: { name: '露天放映台', need: 3, cost: { wood: 6, stone: 3 } },
  windchime: { name: '木风铃', need: 3, cost: { wood: 3, fiber: 4 } },
  leaflamp: { name: '叶灯', need: 24, cost: { wood: 5, stone: 2, produce: 2 } },
  seeds: { name: '压出一袋种子', need: 0, cost: { fiber: 3, produce: 1 }, reward: { seeds: 6 } },
};

const DISCOVERY_META = {
  forest: { id: 'fern-letter', name: '蕨叶暗纹', hint: '只在树林落枝背面出现的细线。' },
  hill: { id: 'wind-stone', name: '会响的薄石', hint: '山风穿过缺口时会发出很轻的音。' },
  town: { id: 'ticket-corner', name: '旧放映票角', hint: '背面还留着一小块手写时间。' },
  street: { id: 'sign-paint', name: '褪色招牌片', hint: '两层颜色叠在一起，像旧店留下的年轮。' },
  shore: { id: 'tide-glass', name: '潮线玻璃', hint: '被海水磨圆的一小片浅蓝玻璃。' },
  sea: { id: 'buoy-thread', name: '浮标红线', hint: '潮水退去后挂在礁石边的一截线。' },
};

const WORLD_CYCLES = [
  { id: 'seed-wind', title: '种子风', zone: 'forest', zoneName: '小树林', resource: 'seeds', bonus: 1, summary: '今天树林的落枝和草丛更容易捎回种子。' },
  { id: 'stone-song', title: '石缝回声', zone: 'hill', zoneName: '山坡', resource: 'stone', bonus: 1, summary: '山坡松动的石块比平时更容易辨认。' },
  { id: 'market-afterglow', title: '招牌余光', zone: 'street', zoneName: '商业街', resource: 'fiber', bonus: 1, summary: '旧布条与招牌边料被风吹到了街角。' },
  { id: 'low-tide', title: '潮线退去', zone: 'shore', zoneName: '海岸', resource: 'stone', bonus: 1, summary: '海岸露出了平时藏在水下的漂流物。' },
  { id: 'open-screen-night', title: '露天放映日', zone: 'town', zoneName: '镇中心', resource: 'seeds', bonus: 1, summary: '镇中心有人交换旧票根，也更愿意停下来看一段。' },
];

const STARTER_GATHERABLES = [
  { id: 'starter-branch', type: 'branch', wx: -470, wy: 250 },
  { id: 'starter-grass', type: 'grass', wx: -120, wy: 210 },
];

const BUILDING_META = {
  workbench: { name: '露天工作台', cost: { wood: 12, stone: 6 }, description: '解锁地块装饰和种子压制。' },
  well: { name: '石砌水井', cost: { wood: 4, stone: 14 }, description: '每天免费为所有作物浇水一次。' },
  greenhouse: { name: '玻璃温室', cost: { wood: 24, stone: 18, produce: 3 }, description: '作物即使没有浇水也会缓慢生长。' },
  cabin: { name: '扩建小屋', cost: { wood: 18, stone: 12 }, description: '体力上限提高到 120，视频副本摆放上限提高到 16。' },
  archive: { name: '叶片标本屋', need: 8, cost: { wood: 14, stone: 8, fiber: 6 }, description: '把各区域找到的稀有物夹进长期收藏图鉴。' },
  composter: { name: '林地堆肥坊', need: 15, cost: { wood: 12, stone: 6, produce: 2 }, description: '每天休息时把 2 份纤维慢慢变成 1 颗种子。' },
};

function freshPlots() {
  return Array.from({ length: PLOT_COUNT }, (_, index) => ({ state: index < 4 ? 'cleared' : 'wild', stage: 0, growth: 0, cropId: '', watered: false }));
}

const HOMESTEAD_DEFAULT = {
  day: 1,
  season: '初春',
  weather: '晴',
  energy: 100,
  resources: { wood: 10, stone: 6, fiber: 4, seeds: 4, produce: 0 },
  plots: freshPlots(),
  buildings: { workbench: 0, well: 0, greenhouse: 0, cabin: 0, archive: 0, composter: 0 },
  construction: {},
  decor: [],
  forageDays: {},
  wellUsedDay: 0,
};

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

const SYSTEM_DEMO_MEDIA = {
  'v-sneaker-rain': './assets/demo-media/rain.mp4',
  'v-rain-awning': './assets/demo-media/rain.mp4',
  'v-moss-rain': './assets/demo-media/rain.mp4',
};

function demoMediaFor(video) {
  if (SYSTEM_DEMO_MEDIA[video.id]) return SYSTEM_DEMO_MEDIA[video.id];
  const preferred = Array.isArray(SCENE_ZONE_PREF[video.scene]) ? SCENE_ZONE_PREF[video.scene][0] : '';
  const key = preferred === 'forest' || preferred === 'hill' ? 'forest'
    : preferred === 'shore' || preferred === 'sea' ? 'shore'
      : preferred === 'street' ? 'commerce'
        : video.scene === '城市' ? 'city' : 'town';
  return `./assets/demo-media/${key}.mp4`;
}

const SCENE_ZONE_PREF = { '海岸': ['shore', 'sea'], '城镇': ['town'], '商业': ['street', 'town'], '山林': ['forest', 'hill'], '城市': ['street', 'town', 'hill'] };
const SPAWN_SOURCES = ['公共上传', '世界推荐', '邻居分享', '低曝光补偿', '新发布'];

const objectTargets = {
  cottage: { wx: -620, wy: 160, label: '我的小屋', hint: 'E 沿小径进入自己的地块' },
  board: { wx: 260, wy: -60, label: '公告树', hint: 'E 看大家留下的纸条' },
  workshop: { wx: 760, wy: 260, label: '共创台', hint: 'E 把素材放进背包' },
  telescope: { wx: 300, wy: -2200, label: '山坡望远镜', hint: 'E 看看世界另一头' },
  sound: { wx: -900, wy: -1700, label: '听风码头', hint: 'E 听一段没有任务的声音' },
  seabench: { wx: 400, wy: 860, label: '看海长椅', hint: 'E 坐下来看一会儿海' },
  neighbor: { wx: 1750, wy: 140, label: '陌生人的长椅', hint: 'E 拜访一个公开空间' },
  anomaly: { wx: -2400, wy: 240, label: '回声水洼', hint: 'E 回应今日异象，或直接走开' },
  clothesline: { wx: -350, wy: -720, label: '胶片晾衣绳', hint: 'E 把口袋里的副本挂上去' },
  doublewall: { wx: 2200, wy: -650, label: '双面放映墙', hint: 'E 左右各放一段，一起看' },
  mixtable: { wx: -2050, wy: -60, label: '混剪桌', hint: 'E 把最多三段副本排成一段' },
  swapbox: { wx: -100, wy: 520, label: '交换箱', hint: 'E 留下一枚副本，带走一枚别人的' },
  shopcafe: { wx: 1700, wy: -500, label: '咖啡店橱窗', hint: 'E 给橱窗挑一段合适的' },
  shoppet: { wx: 2400, wy: -180, label: '宠物店橱窗', hint: 'E 给橱窗挑一段合适的' },
  frame: { wx: -2600, wy: -500, label: '空白画框', hint: 'E 这里好像缺了一段什么' },
};

const WORLD_GUIDE_ITEMS = [
  { id: 'walk', category: 'start', title: '走动与靠近', summary: '世界没有外圈边界，角色始终在画面中央，地图从脚下延伸。', how: '使用 WASD 或方向键行走；点击地图会自动绕过溪流和围墙，沿桥或缺口抵达。', key: 'WASD' },
  { id: 'obstacles', category: 'start', title: '桥、溪流与残墙', summary: '深水与完整墙段不能直接穿过，但它们只占世界的一小部分，不会围出地图边界。', how: '点击障碍另一侧自动寻路；键盘行走时沿墙移动，寻找木桥、浅滩或残墙缺口。' },
  { id: 'observe', category: 'start', title: '观察与身边行动', summary: '靠近物件后，左上方会说明它是什么以及当前能做什么。', how: '按 E 执行主要动作；点击角色或按 Q 查看身边的全部动作。', key: 'E / Q' },
  { id: 'publish', category: 'start', title: '随走随发布', summary: '公域里的素材和需求不用送到固定大厅，能直接留在你站着的位置。', how: '按 P 发布视频或需求；按 N 直接留需求纸条。', key: 'P / N', action: 'publish' },
  { id: 'journal', category: 'start', title: '探索手账', summary: '真正看过的素材、纸条、地点和素材关系会成为可回访的个人足迹。', how: '按 J 打开手账；可以置顶记录，或沿地点记录回到附近。', key: 'J', action: 'journal' },
  { id: 'home-loop', category: 'start', title: '探索与家园循环', summary: '公共世界负责发现和采集，只有自己的地块能被永久开荒、种植、建造和摆放。', how: '按 H 回地块；完成一天的劳动后按 R 进入明天。', key: 'H / R', action: 'home' },

  { id: 'cottage', category: 'landmarks', title: '我的小屋', summary: '你唯一能够永久改变的空间，包含农田、建筑、制作和副本摆放。', how: '靠近门口按 E，或随时按 H 回去。', target: 'cottage' },
  { id: 'board', category: 'landmarks', title: '公告树', summary: '世界里的需求与素材目录，也能管理自己的需求、草稿和已关闭纸条。', how: '靠近按 E；搜索结果可以直接打开，不受当天地图摆放限制。', target: 'board' },
  { id: 'workshop', category: 'landmarks', title: '共创台', summary: '把本地素材先放进背包的公共工作台；它不是唯一发布入口。', how: '靠近按 E 上传；之后走到喜欢的位置按 P 发布。', target: 'workshop' },
  { id: 'telescope', category: 'landmarks', title: '山坡望远镜', summary: '随机望见世界另一端的低曝光内容，帮助不常出现的素材被发现。', how: '靠近按 E；看到内容后可以直接打开。', target: 'telescope' },
  { id: 'sound', category: 'landmarks', title: '听风码头', summary: '一处没有任务、没有奖励的声音体验。', how: '靠近按 E，停下来听一段环境声音。', target: 'sound' },
  { id: 'seabench', category: 'landmarks', title: '看海长椅', summary: '坐下看海、阅读留下的话，也能为后来的人留一句。', how: '靠近按 E；离开不会产生未完成任务。', target: 'seabench' },
  { id: 'neighbor', category: 'landmarks', title: '陌生人的长椅', summary: '拜访一个公开的他人空间，看看别人怎样整理素材。', how: '靠近按 E；只能浏览，不能改动别人的空间。', target: 'neighbor' },
  { id: 'anomaly', category: 'landmarks', title: '回声水洼', summary: '偶尔出现的世界异象，可以回应，也可以完全忽略。', how: '靠近按 E 选择态度；没有倒计时或失败惩罚。', target: 'anomaly' },
  { id: 'clothesline', category: 'landmarks', title: '胶片晾衣绳', summary: '把最多三枚副本挂成一排，观察并置后的感觉。', how: '先获得副本，再靠近按 E 挂上、移动或取下。', target: 'clothesline' },
  { id: 'doublewall', category: 'landmarks', title: '双面放映墙', summary: '左右各放一段素材，让两段影像同时成为一个观察。', how: '带着副本靠近按 E；公共原片不会被改变。', target: 'doublewall' },
  { id: 'mixtable', category: 'landmarks', title: '混剪桌', summary: '把最多三段副本排成先后顺序，保存为自己的组合。', how: '靠近按 E 添加、排序和移除片段。', target: 'mixtable' },
  { id: 'swapbox', category: 'landmarks', title: '交换箱', summary: '留下一枚副本和一句话，再带走别人留下的一枚。', how: '带着副本靠近按 E；交换不会改变公共原片。', target: 'swapbox' },
  { id: 'shopcafe', category: 'landmarks', title: '咖啡店橱窗', summary: '模拟把视频放进商业场景，观察素材与空间是否合适。', how: '带着副本靠近按 E；没有真实交易。', target: 'shopcafe' },
  { id: 'shoppet', category: 'landmarks', title: '宠物店橱窗', summary: '另一种模拟商业语境，适合动物、动作和生活内容。', how: '带着副本靠近按 E；只记录你的匹配判断。', target: 'shoppet' },
  { id: 'frame', category: 'landmarks', title: '空白画框', summary: '把一段视频或一句话放进空白处，形成新的世界纸条。', how: '靠近按 E，选择副本或留下文字。', target: 'frame' },

  { id: 'video', category: 'discoveries', title: '公共视频放映物', summary: '视频会根据区域长成树冠放映架、街边灯箱、贝壳播放器或浮标银幕。', how: '靠近按 E 打开；F 点赞，G 参与虚拟竞价。公共原片始终留在世界中。', key: 'E / F / G' },
  { id: 'note', category: 'discoveries', title: '需求纸条', summary: '玩家留下的公开需求，可以用视频或文字回应，也能继续追问。', how: '靠近按 E 展开；站在视频旁发布需求会自动引用该素材。', key: 'E / N' },
  { id: 'resource', category: 'discoveries', title: '可再生资源', summary: '落枝、石块、高草和海边漂流物用于建设自己的地块。', how: '靠近按 E 收集并消耗体力；进入明天后重新生长。', key: 'E' },
  { id: 'tagplant', category: 'discoveries', title: '标签植物', summary: '世界里长出的标签，可以被拔下并贴到某段视频旁。', how: '靠近按 E 拔下，走到视频旁按 F 贴上。', key: 'E / F' },
  { id: 'bottle', category: 'discoveries', title: '漂流瓶', summary: '海岸随机出现的发现，可能装着一句话、视频线索或标签。', how: '靠近按 E 打开；它不是每日必做任务。', key: 'E' },
  { id: 'nameless', category: 'discoveries', title: '无名处', summary: '地图上尚未被命名的小区域，名字只记录在你的世界视角里。', how: '靠近问号区域按 E，为它起名或重新命名。', key: 'E' },
  { id: 'relation', category: 'discoveries', title: '素材之间的线', summary: '两段公共素材可以被并排观察，留下呼应、反差、顺序或暂未说清的关系。', how: '打开任意视频选择“对照另一段”；保存的关系会进入探索手账。', action: 'journal' },

  { id: 'plots', category: 'homestead', title: '开荒与种植', summary: '16 块土地会永久保留清理、翻土、播种、浇水、生长和收获状态。', how: '在地块上点击土地逐步劳动；每次行动消耗体力。', action: 'home' },
  { id: 'buildings', category: 'homestead', title: '设施建造', summary: '工作台、水井、温室和小屋扩建会解锁制作、批量浇水、稳定生长与容量。', how: '回地块按 H 打开建设簿，准备足够木材与石材。', key: 'H', action: 'home' },
  { id: 'copies', category: 'homestead', title: '副本与摆放', summary: '副本是通过虚拟竞价获得的个人持有版本，不等同于收藏。', how: '视频旁按 G 竞价；获得后回地块按 F 摆放或收回。', key: 'G / F', action: 'home' },
  { id: 'craft', category: 'homestead', title: '地块制作', summary: '探索资源可以制作木鸟屋、露天放映台和种子压制等生活物件。', how: '先建工作台，再在建设簿中选择制作项目。', action: 'home' },
  { id: 'day', category: 'homestead', title: '体力、天气与明天', summary: '劳动消耗体力；天气和季节会影响土地，进入明天推动作物成长并让资源再生。', how: '在个人地块按 R 休息；世界不会因为你不休息而惩罚你。', key: 'R', action: 'home' },
];

const NAMELESS_REGIONS = [
  { id: 'r-hill', x: 1100, y: -2300, r: 430 },
  { id: 'r-forest', x: -3200, y: 60, r: 420 },
];

const SHOP_META = {
  cafe: { name: '咖啡店', hint: '橱窗适合早餐、午后和蒸汽' },
  pet: { name: '宠物店', hint: '橱窗适合会跑会叫的东西' },
};

const AURA_CLASS = { '海岸': 'aura-coast', '城市': 'aura-night', '商业': 'aura-shop', '山林': 'aura-forest', '城镇': 'aura-warm' };

const TAG_PLANTS = [
  { tag: '治愈', wx: -1620, wy: -240 },
  { tag: '松弛', wx: 980, wy: -920 },
  { tag: '孤独', wx: 1280, wy: -260 },
  { tag: '夏天', wx: -620, wy: 560 },
  { tag: '广告感', wx: 2060, wy: 320 },
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
    for (let i = 0; i < spec.slots; i += 1) {
      const preferred = pool.filter((item) => (SCENE_ZONE_PREF[item.scene] || []).includes(zoneId) && !used.has(item.id));
      const rest = pool.filter((item) => !used.has(item.id));
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
  const starterVideo = items.find((item) => item.zone === 'town');
  if (starterVideo) {
    starterVideo.wx = -300;
    starterVideo.wy = 70;
    starterVideo.spawn_source = '小屋附近的公共放映';
  }
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
  demandDrafts: [],
  noteLinks: {},
  noteResponses: {},
  customTags: [],
  assetOverrides: {},
  assetRelations: [],
  journalEntries: [],
  discoveredZones: [],
  discoveries: [],
  bag: [],
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
  line: [null, null, null],
  wall: { a: null, b: null },
  mix: [],
  exchangeOffer: null,
  guidanceTarget: null,
  shops: { cafe: null, pet: null },
  frameSlot: null,
  namedZones: {},
  guideIntroSeen: false,
  onboarding: { status: 'new', step: 0, watchedAssetId: '', respondedDemandId: '', gathered: false, homeChanged: false },
  notificationReadAt: '',
  homestead: JSON.parse(JSON.stringify(HOMESTEAD_DEFAULT)),
  profile: { nickname: '路过的风', username: 'visitor', bio: '收集不太确定的影像', interests: '海、树、慢节奏', spaceName: '礁石小窝', avatar: 0 },
};

function normalizeState(source = {}) {
  try {
    const loaded = { ...defaultState, ...source };
    loaded.schemaVersion = 8;
    loaded.homestead = {
      ...JSON.parse(JSON.stringify(HOMESTEAD_DEFAULT)),
      ...(loaded.homestead || {}),
      resources: { ...HOMESTEAD_DEFAULT.resources, ...(loaded.homestead?.resources || {}) },
      buildings: { ...HOMESTEAD_DEFAULT.buildings, ...(loaded.homestead?.buildings || {}) },
      plots: Array.isArray(loaded.homestead?.plots) && loaded.homestead.plots.length === PLOT_COUNT
        ? loaded.homestead.plots.map((plot) => ({ state: 'wild', stage: 0, growth: Number(plot.stage || 0), cropId: plot.state === 'planted' ? 'fieldbean' : '', watered: false, ...plot }))
        : freshPlots(),
      decor: Array.isArray(loaded.homestead?.decor) ? loaded.homestead.decor : [],
      forageDays: loaded.homestead?.forageDays || {},
    };
    loaded.bag = Array.isArray(loaded.bag) ? loaded.bag : [];
    if (!loaded.benchMessages.length) loaded.benchMessages = [{ name: '木秋', text: '海风把白天的声音都吹散了。' }];
    loaded.demandDrafts = Array.isArray(loaded.demandDrafts) ? loaded.demandDrafts : [];
    const seenCopyAssets = new Set();
    loaded.copies = (Array.isArray(loaded.copies) ? loaded.copies : []).filter((copy) => {
      if (!copy?.assetId || seenCopyAssets.has(copy.assetId)) return false;
      seenCopyAssets.add(copy.assetId);
      return true;
    });
    loaded.customTags = Array.isArray(loaded.customTags) ? loaded.customTags : [];
    loaded.assetOverrides = loaded.assetOverrides || {};
    loaded.assetRelations = Array.isArray(loaded.assetRelations) ? loaded.assetRelations : [];
    loaded.journalEntries = Array.isArray(loaded.journalEntries) ? loaded.journalEntries : [];
    loaded.discoveredZones = Array.isArray(loaded.discoveredZones) ? loaded.discoveredZones : [];
    loaded.discoveries = Array.isArray(loaded.discoveries) ? loaded.discoveries : [];
    loaded.onboarding = { ...defaultState.onboarding, ...(loaded.onboarding || {}) };
    loaded.notificationReadAt = String(loaded.notificationReadAt || '');
    loaded.notes = (loaded.notes || []).map((note) => ({ status: 'open', owner: 'me', ...note }));
    return loaded;
  } catch {
    return JSON.parse(JSON.stringify(defaultState));
  }
}

const browserStateText = localStorage.getItem(STORAGE_KEY) || localStorage.getItem(LEGACY_STORAGE_KEY);
const hasBrowserStateToMigrate = Boolean(browserStateText);

function loadState() {
  try { return normalizeState(JSON.parse(browserStateText || '{}')); }
  catch { return normalizeState(); }
}

const state = loadState();
worldVideos.forEach((video) => Object.assign(video, state.assetOverrides[video.id] || {}));
const MOVEMENT_KEYS = new Set(['a', 's', 'd', 'w', 'arrowleft', 'arrowright', 'arrowup', 'arrowdown']);
state.keys = new Set();
state.nearest = null;
state.activeVideo = null;
state.videoOpenedAt = 0;
state.lastTime = performance.now();
state.carryTag = null;
state.carryPlaced = null;
state.pendingCopyPlacement = null;
state.approached = new Set();
state.avoidLogged = new Set();
state.openedVideos = new Set();
state.impressionAccum = {};
state.activeGatherables = [];
state.gatherRenderKey = '';
state.gathering = null;
state.commentReplyTo = null;
state.activeObjectUrl = null;
state.lastImpressions = new Map();
state.publicAssets = [];
state.publicDemands = [];
state.publicRecords = [];
state.publicWorldUpdatedAt = '';
state.pricingPurchases = [];
state.notifications = [];
let telemetrySequence = 0;
let telemetryWorldEntered = false;
let telemetrySessionEnded = false;
const telemetryStartedAt = Date.now();
let movementSample = { fromX: state.wx, fromY: state.wy, distance: 0, startedAt: Date.now() };

let sheetReturnFocus = null;
let profileReturnFocus = null;
let eventPersistQueued = false;
let serviceSessionAvailable = false;
let worldConflictOpen = false;

function serializableState() {
  const serializable = { ...state };
  ['keys', 'nearest', 'activeVideo', 'videoOpenedAt', 'lastTime', 'carryTag', 'carryPlaced', 'pendingCopyPlacement', 'approached', 'avoidLogged', 'openedVideos', 'impressionAccum', 'activeGatherables', 'gatherRenderKey', 'gathering', 'commentReplyTo', 'activeObjectUrl', 'lastImpressions', 'publicAssets', 'publicDemands', 'publicRecords', 'publicWorldUpdatedAt', 'pricingPurchases', 'notifications', 'rawEvents'].forEach((field) => delete serializable[field]);
  return serializable;
}

function persist() {
  window.ZhereService?.saveState(serializableState()).catch(() => {});
}

window.addEventListener('zhere:world-state-conflict', (event) => {
  if (worldConflictOpen) return;
  worldConflictOpen = true;
  const conflict = event.detail || {};
  const changedAt = conflict.updatedAt ? new Date(conflict.updatedAt).toLocaleString('zh-CN') : '刚刚';
  openSheet(`
    <div class="sheet-inner confirm-sheet">
      <p class="purchase-success-kicker">进度保护</p>
      <h2 class="sheet-title" id="sheetTitle" tabindex="-1">发现另一页的新进度</h2>
      <p class="sheet-subtitle">这份账号进度在 ${escapeHtml(changedAt)} 被另一个页面更新。请选择保留哪一份，系统不会静默覆盖。</p>
      <div class="status-banner">载入服务端进度最安全；保留本页进度会用当前画面覆盖另一页的改变。</div>
      <div class="media-actions">
        <button class="primary-button" id="loadServerProgress" type="button">载入服务端进度</button>
        <button class="paper-button" id="keepLocalProgress" type="button">保留本页进度</button>
      </div>
    </div>
  `, () => {
    $('#loadServerProgress').addEventListener('click', async () => {
      $('#loadServerProgress').disabled = true;
      await window.ZhereService.resolveWorldStateConflict('server');
      location.reload();
    });
    $('#keepLocalProgress').addEventListener('click', async () => {
      $('#keepLocalProgress').disabled = true;
      try {
        await window.ZhereService.resolveWorldStateConflict('local');
        worldConflictOpen = false;
        closeSheet();
        showToast('已保留本页进度');
      } catch (error) {
        worldConflictOpen = false;
        closeSheet();
        showToast(error.message || '进度保存失败，请重试');
      }
    });
  });
});

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

function fmtNow() {
  return new Date().toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
}

function escapeHtml(value) {
  return String(value).replace(/[&<>'"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[char]);
}

function downloadJson(filename, data) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function showToast(message) {
  toast.textContent = message;
  toast.hidden = false;
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => { toast.hidden = true; }, 2400);
}

function setPendingButton(button, pending, label) {
  if (!button) return;
  if (pending) {
    button.dataset.idleLabel ||= button.textContent;
    button.disabled = true;
    button.setAttribute('aria-busy', 'true');
    button.classList.add('is-pending');
    if (label) button.textContent = label;
    return;
  }
  button.disabled = false;
  button.removeAttribute('aria-busy');
  button.classList.remove('is-pending');
  if (button.dataset.idleLabel) button.textContent = button.dataset.idleLabel;
}

function unreadNotifications() {
  const seenAt = Date.parse(state.notificationReadAt || 0) || 0;
  return state.notifications.filter((item) => Date.parse(item.createdAt || 0) > seenAt);
}

function updateEchoCount() {
  const count = unreadNotifications().length;
  echoCount.textContent = count > 99 ? '99+' : String(count);
  $('#echoButton').classList.toggle('has-unread', count > 0);
  $('#echoButton').setAttribute('aria-label', count ? `打开回声盒，${count} 条未读` : '打开回声盒，没有未读');
}

async function refreshNotifications({ announce = false } = {}) {
  if (!window.ZhereService?.isAuthenticated()) return;
  if (notificationSyncPromise) return notificationSyncPromise;
  const before = unreadNotifications().length;
  notificationSyncPromise = (async () => { try {
    const result = await window.ZhereService.notifications.load();
    state.notifications = result.notifications || [];
    updateEchoCount();
    const after = unreadNotifications().length;
    if (announce && after > before) showToast(`回声盒里多了 ${after - before} 条新消息`);
    lastNotificationSyncAt = Date.now();
    return result;
  } catch (error) { console.warn('Notification refresh failed', error); return null; }
  finally { notificationSyncPromise = null; } })();
  return notificationSyncPromise;
}

function openNotificationTarget(item) {
  if (item.targetType === 'asset') return showVideo(findVideoById(item.targetId));
  if (item.targetType === 'demand') return showNoteDetail(allWorldNotes().find((note) => note.id === item.targetId));
  if (item.targetType === 'record') return showSwapBox();
  showToast('这条回声对应的内容已经离开公域');
}

function showEchoBox() {
  state.notificationReadAt = new Date().toISOString();
  persist();
  updateEchoCount();
  openSheet(`
    <div class="sheet-inner echo-sheet">
      <h2 class="sheet-title" id="sheetTitle" tabindex="-1">回声盒</h2>
      <p class="sheet-subtitle">你离开时，公共世界仍在生长。这里收好需求回应、素材留言、模拟报价与交换结果；它们不会变成必须完成的任务。</p>
      <div class="echo-list">${state.notifications.length ? state.notifications.map((item) => `<button class="echo-row" type="button" data-echo-id="${escapeHtml(item.id)}"><span class="echo-seed" aria-hidden="true"></span><span><b>${escapeHtml(item.title)}</b><small>${escapeHtml(item.summary)}</small><em>${escapeHtml(new Date(item.createdAt).toLocaleString('zh-CN'))}</em></span></button>`).join('') : '<div class="empty-state"><b>盒子里还没有回声</b><p>发布一张需求、公开视频或把副本放进交换箱；其他旅人的回应会出现在这里。</p></div>'}</div>
      <div class="media-actions"><button class="paper-button" id="echoRefresh" type="button">刷新回声</button><button class="text-button" id="echoClose" type="button">回到世界</button></div>
    </div>
  `, () => {
    $$('[data-echo-id]', sheet).forEach((button) => button.addEventListener('click', () => openNotificationTarget(state.notifications.find((item) => item.id === button.dataset.echoId))));
    $('#echoRefresh').addEventListener('click', async () => { await refreshNotifications(); showEchoBox(); });
    $('#echoClose').addEventListener('click', closeSheet);
  });
}

function onboardingActive() { return state.onboarding.status === 'active'; }

function beginOnboarding() {
  state.onboarding = { ...defaultState.onboarding, status: 'active', step: 1 };
  const firstVideo = worldVideos.find((video) => video.id === 'v-sneaker-rain') || worldVideos[0];
  if (firstVideo) {
    state.wx = firstVideo.wx;
    state.wy = firstVideo.wy + 80;
    state.guidanceTarget = { wx: firstVideo.wx, wy: firstVideo.wy, label: `先观看《${firstVideo.title}》` };
  }
  persist(); renderWorld(); renderOnboarding();
  say('先不用记按键。花三分钟完成一次真实循环：看一段素材、回应一张纸条，再带着收集到的材料回家。', '木秋', [{ label: '打开第一段素材', handler: () => showVideo(firstVideo) }, { label: '跳过引导', handler: skipOnboarding }]);
}

function skipOnboarding() {
  state.onboarding.status = 'skipped'; state.guideIntroSeen = true; state.guidanceTarget = null;
  persist(); renderOnboarding(); renderWorld(); say('好，世界没有必须完成的清单。需要说明时随时打开图鉴。');
}

function advanceOnboarding(kind, payload = {}) {
  if (!onboardingActive()) return;
  const flow = state.onboarding;
  if (kind === 'watch' && flow.step === 1) {
    flow.watchedAssetId = payload.assetId || ''; flow.step = 2;
    const note = systemNotes.find((item) => item.refAsset === payload.assetId) || systemNotes[0];
    state.guidanceTarget = { wx: note.wx, wy: note.wy, label: `回应「${note.title}」` };
    say('你已经看过这段影像。现在去看看一张真实需求：可以附上刚才的视频，也可以只写一句观察。', '木秋', [{ label: '打开这张需求', handler: () => showNoteDetail(note) }, { label: '跳过引导', handler: skipOnboarding }]);
  } else if (kind === 'response' && flow.step === 2) {
    flow.respondedDemandId = payload.demandId || ''; flow.step = 3;
    state.guidanceTarget = { wx: -470, wy: 250, label: '收集一份会再生的材料' };
    say('回应已经留在公域。最后收集一份会再生的材料，再按 H 回到自己的地块。', '木秋', [{ label: '跳过引导', handler: skipOnboarding }]);
  } else if (kind === 'gather' && flow.step === 3) {
    flow.gathered = true; flow.step = 4; state.guidanceTarget = { ...objectTargets.cottage, label: '回到地块，让远行留下改变' };
    say('材料进了资源袋。按 H 回到地块，再搭建已经备齐材料的露天工作台，让远行留下第一个改变。', '木秋', [{ label: '现在回地块', handler: goToHomestead }, { label: '跳过引导', handler: skipOnboarding }]);
  } else if (kind === 'home-change' && flow.step === 4) {
    flow.homeChanged = true; flow.step = 5; flow.status = 'completed'; state.guideIntroSeen = true; state.guidanceTarget = null;
    logEvent('onboarding_completed', { watched_asset_id: flow.watchedAssetId, responded_demand_id: flow.respondedDemandId });
    say('看见了吗？公共世界里的发现没有被你拿走，但这块地记住了你的远行。接下来往任何方向走都可以。', '木秋', [{ label: '继续自由探索', handler: () => { dialogueActions.replaceChildren(); dialogue.classList.add('is-collapsed'); } }]);
    showToast('第一次远行完成，地块记住了你的改变');
  }
  persist(); renderOnboarding(); renderWorld();
}

function renderOnboarding() {
  let node = $('#onboardingRibbon');
  if (!onboardingActive()) { node?.remove(); return; }
  if (!node) { node = document.createElement('aside'); node.id = 'onboardingRibbon'; node.className = 'onboarding-ribbon'; node.setAttribute('aria-live', 'polite'); worldStage.append(node); }
  const labels = ['观看一段素材', '回应一张需求', '收集会再生的材料', '回地块留下改变'];
  node.innerHTML = `<button class="onboarding-skip" type="button">跳过</button><b>第一次远行 · ${Math.min(state.onboarding.step, 4)}/4</b><span>${escapeHtml(labels[Math.max(0, state.onboarding.step - 1)] || labels[0])}</span>`;
  $('.onboarding-skip', node).addEventListener('click', skipOnboarding);
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
  $('#dialogueToggle').setAttribute('aria-expanded', 'true');
}

function openSheet(markup, setup) {
  stopMovement(true);
  closeContextWheel();
  if (sheet.hidden) sheetReturnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  sheetContent.innerHTML = markup;
  sheet.hidden = false;
  sheet.scrollTop = 0;
  scrim.hidden = false;
  document.body.classList.add('sheet-open');
  profileDrawer.hidden = true;
  game.inert = true;
  state.commentReplyTo = null;
  setup?.();
  requestAnimationFrame(() => $('.sheet-title', sheet)?.focus?.());
}

function closeSheet() {
  if (worldConflictOpen) return;
  const activeMedia = $('#videoFrame video', sheet);
  if (state.activeVideo && activeMedia) logEvent('watch_time', {
    asset_id: state.activeVideo.id,
    duration: Number((activeMedia.dataset.watchedSeconds || 0)),
    media_duration: Number.isFinite(activeMedia.duration) ? Number(activeMedia.duration.toFixed(2)) : null,
    source: activeMedia.dataset.source || null,
  });
  sheet.hidden = true;
  scrim.hidden = true;
  document.body.classList.remove('sheet-open');
  sheetContent.replaceChildren();
  state.activeVideo = null;
  state.commentReplyTo = null;
  game.inert = false;
  if (state.activeObjectUrl) {
    URL.revokeObjectURL(state.activeObjectUrl);
    state.activeObjectUrl = null;
  }
  const returnTarget = sheetReturnFocus;
  sheetReturnFocus = null;
  requestAnimationFrame(() => returnTarget?.isConnected && returnTarget.focus?.());
}

sheet.addEventListener('keydown', (event) => {
  if (event.key !== 'Tab') return;
  const controls = $$('button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [href], [tabindex]:not([tabindex="-1"])', sheet).filter((node) => !node.hidden && node.getClientRects().length);
  if (!controls.length) return;
  const first = controls[0];
  const last = controls[controls.length - 1];
  if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
  else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
});

function openUploadDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('zhere-local-media', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('uploads');
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function saveUploadFile(id, file, { title = '', description = '' } = {}) {
  if (!file) return null;
  return window.ZhereService.media.upload({ assetId: id, title, description, file });
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

function validateMediaFile(file) {
  if (!file) return '';
  if (!file.type.startsWith('video/')) return '目前只支持视频文件，请选择 MP4、WebM 等视频格式。';
  if (file.size > 20 * 1024 * 1024) return '当前正式存储单个视频不能超过 20MB，请压缩后重新选择。';
  return '';
}

function allVideos() {
  const videos = new Map();
  [...worldVideos, ...state.published, ...state.publicAssets].forEach((video) => videos.set(video.id, video));
  return [...videos.values()];
}

function worldVideosVisible() {
  return allVideos().filter((video) => !video.archived);
}

function allAssets() {
  const assets = new Map();
  VIDEO_POOL.forEach((base) => {
    const active = worldVideos.find((video) => video.id === base.id);
    assets.set(base.id, active || {
      ...base,
      ...(state.assetOverrides[base.id] || {}),
      wx: null,
      wy: null,
      zone: null,
      likes: state.assetOverrides[base.id]?.likes || 0,
      comments: state.assetOverrides[base.id]?.comments || [],
      catalogOnly: true,
      spawn_source: '世界素材档案',
    });
  });
  state.published.forEach((video) => assets.set(video.id, video));
  state.publicAssets.forEach((video) => assets.set(video.id, video));
  return [...assets.values()];
}

function findVideoById(id) {
  if (!id) return null;
  return allAssets().find((video) => video.id === id) || null;
}

function commitVideoState(video) {
  if (!video || video.source === 'user') return;
  state.assetOverrides[video.id] = {
    likes: Number(video.likes) || 0,
    tags: [...(video.tags || [])],
    comments: JSON.parse(JSON.stringify(video.comments || [])),
  };
}

function videoLocationLabel(video) {
  return video?.catalogOnly || !Number.isFinite(video?.wx) ? '世界素材档案' : zoneAt(video.wx, video.wy).name;
}

const RELATION_TYPES = {
  echo: { label: '像同一个下午', description: '气氛或动作彼此呼应' },
  contrast: { label: '放在一起有反差', description: '并置后差异变得清楚' },
  sequence: { label: '可以接在后面', description: '像前后相连的两个片段' },
  unresolved: { label: '说不清，但想留着', description: '先保存关系，以后再回来' },
};

function recordJournalEntry(type, id, title, details = {}) {
  if (!id) return;
  const existing = state.journalEntries.find((entry) => entry.type === type && entry.id === id);
  if (existing) {
    existing.lastVisitedAt = new Date().toISOString();
    existing.visits = (existing.visits || 1) + 1;
    Object.assign(existing, details);
  } else {
    state.journalEntries.unshift({ type, id, title, firstVisitedAt: new Date().toISOString(), lastVisitedAt: new Date().toISOString(), visits: 1, ...details });
    state.journalEntries = state.journalEntries.slice(0, 80);
  }
}

function relationsForAsset(assetId) {
  return allAssetRelations().filter((relation) => relation.aId === assetId || relation.bId === assetId);
}

function allAssetRelations() {
  const relations = new Map(state.assetRelations.map((relation) => [relation.id, relation]));
  state.publicRecords.filter((record) => record.kind === 'asset_relation').forEach((record) => relations.set(record.id, { id: record.id, owner: record.owner, ...(record.payload || {}) }));
  return [...relations.values()];
}

function discoverCurrentZone(zone = zoneAt(state.wx, state.wy)) {
  if (state.worldMode !== 'overworld' || state.discoveredZones.includes(zone.id)) return;
  state.discoveredZones.push(zone.id);
  recordJournalEntry('zone', zone.id, zone.name, { wx: Math.round(state.wx), wy: Math.round(state.wy) });
  logEvent('zone_discover', { zone_id: zone.id });
  persist();
  showToast(`第一次走进${zone.name}，探索手账记下了一页`);
}

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

repairCrowdedUserContent();

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

const WORLD_TRAILS = [
  { from: [-620, 160], to: [260, -60], type: 'town' },
  { from: [260, -60], to: [760, 260], type: 'town' },
  { from: [-620, 160], to: [-350, -720], type: 'forest' },
  { from: [260, -60], to: [-100, 520], type: 'shore' },
  { from: [260, -60], to: [1700, -500], type: 'street' },
  { from: [-350, -720], to: [-2050, -60], type: 'forest' },
];

const PLAYER_COLLISION_RADIUS = 15;
const PATH_GRID_SIZE = 48;
const WORLD_OBSTACLES = [
  { id: 'creek-north', kind: 'river', label: '林间溪流', from: [-980, -1800], to: [-900, -800], radius: 46 },
  { id: 'creek-middle', kind: 'river', label: '林间溪流', from: [-887, -640], to: [-810, 20], radius: 46 },
  { id: 'creek-south', kind: 'river', label: '林间溪流', from: [-793, 160], to: [-730, 760], radius: 46 },
  { id: 'wall-north', kind: 'wall', label: '旧石围墙', from: [1180, -1180], to: [1180, -690], radius: 18 },
  { id: 'wall-south', kind: 'wall', label: '旧石围墙', from: [1180, -520], to: [1180, -40], radius: 18 },
];

const WORLD_CROSSINGS = [
  { id: 'moss-bridge', kind: 'bridge', label: '苔桥', x: -896, y: -720, angle: -4 },
  { id: 'town-bridge', kind: 'bridge', label: '镇边木桥', x: -802, y: 90, angle: -5 },
  { id: 'old-wall-gate', kind: 'gate', label: '残墙缺口', x: 1180, y: -605, angle: 90 },
];

const WORLD_SCENERY = [
  { type: 'oldtree', wx: -980, wy: -210 },
  { type: 'garden', wx: 650, wy: -430 },
  { type: 'windmill', wx: 720, wy: -1780 },
  { type: 'dock', wx: -80, wy: 690 },
  { type: 'boat', wx: -820, wy: 1120 },
  { type: 'market', wx: 1550, wy: -210 },
  { type: 'forestgate', wx: -1820, wy: -350 },
  { type: 'orchard', wx: -2860, wy: -120 },
  { type: 'ruins', wx: -2680, wy: -820 },
  { type: 'fountain', wx: 180, wy: -650 },
  { type: 'bakery', wx: 980, wy: -160 },
  { type: 'tramstop', wx: 2800, wy: -720 },
  { type: 'lighthouse', wx: 1280, wy: 650 },
  { type: 'tidepools', wx: -1550, wy: 610 },
  { type: 'hillcamp', wx: -360, wy: -2380 },
];

const WORLD_REGION_MARKERS = [
  { zone: 'forest', wx: -2300, wy: -1060, eyebrow: '苔藓与旧木', title: '小树林', note: '落枝会在明天重新出现' },
  { zone: 'hill', wx: -420, wy: -2700, eyebrow: '风从北面来', title: '高风山坡', note: '石缝里偶尔藏着声音' },
  { zone: 'town', wx: 180, wy: -1030, eyebrow: '公域交汇处', title: '树冠镇', note: '看见、回应，也可以只是路过' },
  { zone: 'street', wx: 2670, wy: -1120, eyebrow: '旧招牌亮着', title: '慢半拍街', note: '橱窗与放映墙沿路展开' },
  { zone: 'shore', wx: 1380, wy: 560, eyebrow: '潮线每天变化', title: '南岸', note: '风会把新的漂流物送来' },
];

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

function renderWorldObstacles(fragment) {
  WORLD_OBSTACLES.forEach((obstacle) => {
    const a = worldToScreen(obstacle.from[0], obstacle.from[1]);
    const b = worldToScreen(obstacle.to[0], obstacle.to[1]);
    const minX = Math.min(a.x, b.x);
    const maxX = Math.max(a.x, b.x);
    const minY = Math.min(a.y, b.y);
    const maxY = Math.max(a.y, b.y);
    if (maxX < -160 || minX > worldShell.clientWidth + 160 || maxY < -160 || minY > worldShell.clientHeight + 160) return;
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
    if (point.x < -130 || point.x > worldShell.clientWidth + 130 || point.y < -130 || point.y > worldShell.clientHeight + 130) return;
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
    if (maxX < -120 || minX > worldShell.clientWidth + 120 || maxY < -120 || minY > worldShell.clientHeight + 120) return;
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
    if (point.x < -230 || point.x > worldShell.clientWidth + 230 || point.y < -190 || point.y > worldShell.clientHeight + 190) return;
    const node = document.createElement('span');
    node.className = `world-scenery scenery-${scenery.type}`;
    node.innerHTML = '<i></i><i></i><i></i>';
    node.style.left = `${Math.round(point.x)}px`;
    node.style.top = `${Math.round(point.y)}px`;
    fragment.append(node);
  });
  WORLD_REGION_MARKERS.forEach((marker) => {
    const point = worldToScreen(marker.wx, marker.wy);
    if (point.x < -260 || point.x > worldShell.clientWidth + 260 || point.y < -180 || point.y > worldShell.clientHeight + 180) return;
    const node = document.createElement('span');
    node.className = `world-region-marker region-${marker.zone}`;
    node.innerHTML = `<small>${marker.eyebrow}</small><b>${marker.title}</b><em>${marker.note}</em>`;
    node.style.left = `${Math.round(point.x)}px`;
    node.style.top = `${Math.round(point.y)}px`;
    fragment.append(node);
  });
}

function renderTerrain() {
  if (state.worldMode === 'cottage') { terrainLayer.replaceChildren(); return; }
  const fragment = document.createDocumentFragment();
  renderTerrainBands(fragment);
  renderWorldConnections(fragment);
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

function spendEnergy(amount) {
  if (state.homestead.energy < amount) {
    showToast('体力不够了。回地块休息，明天再来');
    return false;
  }
  state.homestead.energy -= amount;
  return true;
}

function flyGatherReward(node, item) {
  if (!node) return;
  const origin = node.getBoundingClientRect();
  const pouch = $('.resource-pouch');
  const visibleTarget = pouch && pouch.getBoundingClientRect().width > 0 ? pouch : ($('#dockBagButton') || $('#bagButton'));
  const target = visibleTarget?.getBoundingClientRect();
  if (!target) return;
  const reward = document.createElement('span');
  reward.className = 'gather-reward-flight';
  reward.textContent = Object.entries(item.reward).map(([key, amount]) => `${resourceLabel(key)} +${amount}`).join(' · ');
  reward.style.left = `${origin.left + origin.width / 2}px`;
  reward.style.top = `${origin.top + origin.height / 2}px`;
  document.body.append(reward);
  const dx = target.left + target.width / 2 - (origin.left + origin.width / 2);
  const dy = target.top + target.height / 2 - (origin.top + origin.height / 2);
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  reward.animate([
    { transform: 'translate(-50%, -50%) scale(.75)', opacity: 0 },
    { transform: 'translate(-50%, -80%) scale(1)', opacity: 1, offset: .18 },
    { transform: `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px)) scale(.55)`, opacity: .15 },
  ], { duration: reduced ? 60 : 720, easing: 'cubic-bezier(.2,.8,.2,1)' }).finished.finally(() => reward.remove());
}

function currentWorldCycle() {
  return WORLD_CYCLES[(state.homestead.day - 1) % WORLD_CYCLES.length];
}

function gatherEnergyCost(item) {
  return Math.max(1, item.energy - (creatorLevel().need >= 15 ? 1 : 0));
}

function gatherRewardFor(item) {
  const reward = { ...item.reward };
  const cycle = currentWorldCycle();
  if (item.zone === cycle.zone) reward[cycle.resource] = (reward[cycle.resource] || 0) + cycle.bonus;
  return reward;
}

function maybeDiscoverKeepsake(item) {
  const meta = DISCOVERY_META[item.zone];
  if (!meta || state.discoveries.some((entry) => entry.id === meta.id)) return null;
  const recorderBonus = creatorLevel().need >= 8 ? .16 : 0;
  const roll = hash2d(Math.round(item.wx), Math.round(item.wy), state.homestead.day + 1701);
  if (roll < .74 - recorderBonus) return null;
  const discovery = { ...meta, zone: item.zone, foundAt: new Date().toISOString(), day: state.homestead.day };
  state.discoveries.push(discovery);
  recordJournalEntry('discovery', discovery.id, discovery.name, { zone: discovery.zone });
  logEvent('rare_discovery_found', { discovery_id: discovery.id, zone_id: item.zone, day: state.homestead.day });
  return discovery;
}

function gatherResource(item) {
  if (!item || state.gathering || state.homestead.forageDays[item.id] === state.homestead.day) return;
  const energyCost = gatherEnergyCost(item);
  if (!spendEnergy(energyCost)) return;
  const rewardPayload = gatherRewardFor(item);
  state.gathering = item.id;
  const node = $(`.gatherable[data-resource-id="${CSS.escape(item.id)}"]`, resourceLayer);
  player.classList.add('is-gathering');
  node?.classList.add('is-harvesting');
  node?.setAttribute('aria-busy', 'true');
  updateLifeHud();
  setTimeout(() => {
    node?.classList.add('is-depleted');
    flyGatherReward(node, { ...item, reward: rewardPayload });
    Object.entries(rewardPayload).forEach(([resource, amount]) => {
      state.homestead.resources[resource] = (state.homestead.resources[resource] || 0) + amount;
    });
    updateLifeHud();
  }, 280);
  setTimeout(() => {
    state.homestead.forageDays[item.id] = state.homestead.day;
    state.gatherRenderKey = '';
    state.gathering = null;
    player.classList.remove('is-gathering');
    const discovery = maybeDiscoverKeepsake(item);
    logEvent('world_resource_gathered', { resource_id: item.id, resource_type: item.type, reward: rewardPayload, energy_cost: energyCost, world_cycle: currentWorldCycle().id });
    advanceOnboarding('gather', { resourceId: item.id });
    persist();
    renderWorld();
    const rewardText = Object.entries(rewardPayload).map(([key, amount]) => `${resourceLabel(key)} +${amount}`).join('、');
    const workbenchCost = BUILDING_META.workbench.cost;
    const missingWood = Math.max(0, workbenchCost.wood - state.homestead.resources.wood);
    const missingStone = Math.max(0, workbenchCost.stone - state.homestead.resources.stone);
    const missingParts = [missingWood ? `木料 ${missingWood}` : '', missingStone ? `石料 ${missingStone}` : ''].filter(Boolean);
    const homeHint = !state.homestead.buildings.workbench
      ? (missingParts.length ? `距离露天工作台还差${missingParts.join('、')}` : '露天工作台的材料已经齐了，按 H 回地块建设')
      : '';
    showToast(discovery ? `还发现了稀有收藏「${discovery.name}」，已夹进手账` : `收集了${item.label}：${rewardText}。${homeHint || '明天会重新出现'}`);
  }, 760);
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
      startPointerMove('overworld', video.wx, video.wy + 84, {
        source: 'video',
        label: video.title,
        stopDistance: 6,
        onArrival: () => showVideo(video),
      });
    });
    screenLayer.append(button);
  });
}

function renderCreations() {
  creationLayer.replaceChildren();
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
      startPointerMove('overworld', note.wx, note.wy + 84, {
        source: 'demand',
        onArrival: () => showNoteDetail(note),
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
    const film = document.createElement('span');
    film.className = `placed-film${item.type === 'combo' ? ' placed-combo' : ''}${state.carryPlaced === index ? ' is-selected' : ''}`;
    film.style.left = `${item.x}%`;
    film.style.top = `${item.y}%`;
    const video = findVideoById(item.assetId);
    film.title = item.type === 'combo' ? `组合的副本 ${index + 1}` : `《${video ? video.title : '副本'}》的副本`;
    film.addEventListener('click', (event) => {
      event.stopPropagation();
      pickUpPlaced(index);
    });
    placedLayer.append(film);
  });
}

function resourceLabel(key) {
  return { wood: '木料', stone: '石料', fiber: '纤维', seeds: '种子', produce: '收成' }[key] || key;
}

function energyCap() {
  return state.homestead.buildings.cabin ? 120 : 100;
}

function homeCapacity() {
  return HOME_CAPACITY + (state.homestead.buildings.cabin ? 4 : 0) + (creatorLevel().need >= 24 ? 4 : 0);
}

function seasonForDay(day) {
  return ['初春', '盛夏', '深秋', '冬日'][Math.floor((day - 1) / 7) % 4];
}

function updateLifeHud() {
  const home = state.homestead;
  const cap = energyCap();
  dayCount.textContent = home.day;
  seasonName.textContent = home.season;
  weatherName.textContent = home.weather;
  energyCount.textContent = `${Math.round(home.energy)}/${cap}`;
  energyBar.style.width = `${Math.max(0, Math.min(100, (home.energy / cap) * 100))}%`;
  woodCount.textContent = home.resources.wood;
  stoneCount.textContent = home.resources.stone;
  seedCount.textContent = home.resources.seeds;
  produceCount.textContent = home.resources.produce;
  worldStage.dataset.weather = home.weather;
  worldStage.dataset.season = home.season;
  worldStage.dataset.period = ['morning', 'day', 'evening', 'night'][(home.day - 1) % 4];
  const atHome = state.worldMode === 'cottage';
  $('#restButton').disabled = !atHome;
  $('#restButton').title = atHome ? '休息并让作物生长一天' : '回到自己的地块后才能休息';
  $('#dockHomeButton b').textContent = atHome ? '建设' : '回地块';
  $('#homesteadButton').classList.toggle('is-active', atHome);
  $('#homesteadButton').setAttribute('aria-pressed', String(atHome));
  $('#dockHomeButton').setAttribute('aria-pressed', String(atHome));
}

function plotActionLabel(plot) {
  if (plot.state === 'wild') return '清理杂草，消耗 8 体力';
  if (plot.state === 'cleared') return '翻土，消耗 6 体力';
  if (plot.state === 'tilled') return '选择一种作物播种';
  if (plot.state === 'planted' && plot.stage >= 3) return `收获成熟的${CROP_META[plot.cropId]?.name || '作物'}`;
  if (plot.state === 'planted' && !plot.watered) return '浇水，消耗 3 体力';
  return `正在生长，第 ${plot.stage + 1} 阶段`;
}

function renderHomestead() {
  if (state.worldMode !== 'cottage') return;
  const fragment = document.createDocumentFragment();
  state.homestead.plots.forEach((plot, index) => {
    const button = document.createElement('button');
    button.className = `farm-plot plot-${plot.state}${plot.watered ? ' is-watered' : ''}`;
    button.dataset.plot = index;
    button.dataset.stage = plot.stage || 0;
    button.dataset.crop = plot.cropId || '';
    button.setAttribute('aria-label', `第 ${index + 1} 块地：${plotActionLabel(plot)}`);
    button.innerHTML = '<span class="soil-lines"></span><span class="crop"><i></i><i></i><i></i></span><span class="plot-spark"></span>';
    button.addEventListener('click', (event) => {
      event.stopPropagation();
      interactPlot(index);
    });
    fragment.append(button);
  });
  plotGrid.replaceChildren(fragment);

  const built = state.homestead.buildings;
  const construction = state.homestead.construction || {};
  const structures = [];
  if (built.workbench) structures.push('<button class="home-structure structure-workbench" data-home-panel aria-label="露天工作台"><span></span><b>工作台</b></button>');
  if (built.well) structures.push('<button class="home-structure structure-well" data-water-all aria-label="石砌水井，为所有作物浇水"><span></span><b>水井</b></button>');
  if (built.greenhouse) structures.push('<button class="home-structure structure-greenhouse" data-home-panel aria-label="玻璃温室"><span></span><b>温室</b></button>');
  if (built.archive) structures.push('<button class="home-structure structure-archive" data-discovery-atlas aria-label="叶片标本屋，打开区域珍藏"><span></span><b>标本屋</b></button>');
  if (built.composter) structures.push('<button class="home-structure structure-composter" data-home-panel aria-label="林地堆肥坊"><span></span><b>堆肥坊</b></button>');
  Object.keys(construction).forEach((id) => {
    const meta = BUILDING_META[id];
    if (meta && !built[id]) {
      structures.push(`<span class="home-structure structure-${id} is-scaffolding" aria-label="${meta.name}正在搭建"><span></span><b>搭建中</b></span>`);
      setTimeout(() => completeConstruction(id), Math.max(60, 1500 - (Date.now() - (construction[id].startedAt || Date.now()))));
    }
  });
  state.homestead.decor.forEach((decor, index) => {
    if (decor === 'projector') structures.push(`<button class="home-decor decor-projector" style="--decor-index:${index}" data-video-deck aria-label="露天放映台，整理视频副本"></button>`);
    else structures.push(`<span class="home-decor decor-${decor}" style="--decor-index:${index}" aria-label="${escapeHtml(CRAFT_RECIPES[decor]?.name || '地块装饰')}"></span>`);
  });
  homeBuildings.innerHTML = structures.join('');
  $$('[data-home-panel]', homeBuildings).forEach((node) => node.addEventListener('click', (event) => { event.stopPropagation(); showHomesteadPanel(); }));
  const waterButton = $('[data-water-all]', homeBuildings);
  if (waterButton) waterButton.addEventListener('click', (event) => { event.stopPropagation(); waterAllPlots(); });
  const videoDeck = $('[data-video-deck]', homeBuildings);
  if (videoDeck) videoDeck.addEventListener('click', (event) => { event.stopPropagation(); showPersonalSpace(); });
  $('[data-discovery-atlas]', homeBuildings)?.addEventListener('click', (event) => { event.stopPropagation(); showJournal('discoveries'); });
  $('#homeCabin').classList.toggle('is-upgraded', !!built.cabin);
  updateLifeHud();
}

function sowCrop(index, cropId) {
  const plot = state.homestead.plots[index];
  const crop = CROP_META[cropId];
  if (!plot || plot.state !== 'tilled' || !crop) return;
  if (creatorLevel().score < crop.need) return showToast(`成长值达到 ${crop.need} 才能种下${crop.name}`);
  if (!crop.seasons.includes(state.homestead.season) && !state.homestead.buildings.greenhouse) return showToast(`${crop.name}不适合${state.homestead.season}，温室建成后可跨季种植`);
  if (state.homestead.resources.seeds < crop.seedCost) return showToast(`种下${crop.name}需要 ${crop.seedCost} 颗种子`);
  if (!spendEnergy(2)) return;
  state.homestead.resources.seeds -= crop.seedCost;
  Object.assign(plot, { state: 'planted', stage: 0, growth: 0, cropId, watered: state.homestead.weather === '雨' });
  logEvent('homestead_seed_planted', { plot_index: index, crop_id: cropId, seed_cost: crop.seedCost });
  persist();
  closeSheet();
  updateCounters();
  renderHomestead();
  showToast(plot.watered ? `${crop.name}落进湿润的土里` : `${crop.name}种好了，记得浇水`);
}

function showSeedPicker(index) {
  const level = creatorLevel();
  openSheet(`
    <div class="sheet-inner crop-picker-sheet">
      <h2 class="sheet-title" id="sheetTitle" tabindex="-1">这块地要种什么？</h2>
      <p class="sheet-subtitle">不同作物有自己的生长天数、季节和收成。选择只影响你的地块，不会改变公共世界。</p>
      <div class="crop-choice-list">${Object.entries(CROP_META).map(([id, crop]) => {
        const unlocked = level.score >= crop.need;
        const seasonal = crop.seasons.includes(state.homestead.season) || state.homestead.buildings.greenhouse;
        return `<button type="button" class="crop-choice crop-${id}" data-sow-crop="${id}" ${!unlocked || !seasonal ? 'disabled' : ''}><span class="crop-choice-art" aria-hidden="true"><i></i><i></i><i></i></span><span><b>${crop.name}</b><small>${crop.days} 天成熟 · 种子 ${crop.seedCost} · 收成 ${crop.yield}</small><em>${!unlocked ? `成长值 ${crop.need} 解锁` : !seasonal ? `不适合${state.homestead.season}` : crop.description}</em></span></button>`;
      }).join('')}</div>
      <button class="text-button" id="cropPickerBack" type="button">先不种</button>
    </div>
  `, () => {
    $$('[data-sow-crop]', sheet).forEach((button) => button.addEventListener('click', () => sowCrop(index, button.dataset.sowCrop)));
    $('#cropPickerBack').addEventListener('click', closeSheet);
  });
}

function interactPlot(index) {
  const plot = state.homestead.plots[index];
  if (!plot) return;
  if (plot.state === 'wild') {
    if (!spendEnergy(8)) return;
    plot.state = 'cleared';
    advanceOnboarding('home-change', { kind: 'plot-cleared', plot: index });
    state.homestead.resources.fiber += 2;
    if (index % 3 === 0) state.homestead.resources.wood += 1;
    showToast('清出了一块地，收下 2 份纤维');
    logEvent('homestead_plot_cleared', { plot_index: index });
  } else if (plot.state === 'cleared') {
    if (!spendEnergy(6)) return;
    plot.state = 'tilled';
    showToast('泥土松开了，可以播种');
    logEvent('homestead_plot_tilled', { plot_index: index });
  } else if (plot.state === 'tilled') {
    return showSeedPicker(index);
  } else if (plot.stage >= 3) {
    const crop = CROP_META[plot.cropId] || CROP_META.fieldbean;
    const harvestedCropId = plot.cropId || 'fieldbean';
    const produce = crop.yield + (creatorLevel().need >= 3 ? 1 : 0);
    plot.state = 'tilled';
    plot.stage = 0;
    plot.growth = 0;
    plot.cropId = '';
    plot.watered = false;
    state.homestead.resources.produce += produce;
    state.wallet += produce * 3;
    showToast(`收获 ${produce} 份${crop.name}，公域互助箱回赠 ${produce * 3} 灵感币`);
    logEvent('homestead_crop_harvested', { plot_index: index, crop_id: harvestedCropId, produce, virtual_reward: produce * 3 });
  } else if (!plot.watered) {
    if (!spendEnergy(3)) return;
    plot.watered = true;
    player.classList.add('is-watering');
    setTimeout(() => player.classList.remove('is-watering'), 760);
    showToast('浇过水了，休息后它会继续长');
    logEvent('homestead_plot_watered', { plot_index: index });
  } else {
    showToast('今天已经照料过了。休息后再来看');
  }
  persist();
  updateCounters();
  renderHomestead();
}

function weatherForDay(day) {
  const roll = hash2d(day, 29, 601);
  if (roll > .78) return '雨';
  if (roll < .18) return '风';
  return '晴';
}

function advanceDay() {
  if (state.worldMode !== 'cottage') return showToast('回到自己的地块才能休息');
  const greenhouse = !!state.homestead.buildings.greenhouse;
  state.homestead.plots.forEach((plot) => {
    if (plot.state === 'planted' && (plot.watered || greenhouse)) {
      const crop = CROP_META[plot.cropId] || CROP_META.fieldbean;
      plot.growth = Math.min(crop.days, (plot.growth || 0) + (plot.watered ? 1 : .5));
      plot.stage = Math.min(3, Math.floor((plot.growth / crop.days) * 3));
    }
    plot.watered = false;
  });
  state.homestead.day += 1;
  state.homestead.season = seasonForDay(state.homestead.day);
  state.homestead.weather = weatherForDay(state.homestead.day);
  state.homestead.energy = energyCap();
  state.homestead.wellUsedDay = 0;
  if (state.homestead.weather === '雨') state.homestead.plots.forEach((plot) => { if (plot.state === 'planted') plot.watered = true; });
  if (state.homestead.decor.includes('birdhouse') && hash2d(state.homestead.day, 77, 911) > .48) state.homestead.resources.seeds += 1;
  if (state.homestead.buildings.composter && state.homestead.resources.fiber >= 2) {
    state.homestead.resources.fiber -= 2;
    state.homestead.resources.seeds += 1;
  }
  state.homestead.forageDays = Object.fromEntries(Object.entries(state.homestead.forageDays).filter(([, gatheredDay]) => state.homestead.day - gatheredDay <= 2));
  logEvent('homestead_day_advanced', { day: state.homestead.day, weather: state.homestead.weather, greenhouse });
  persist();
  renderHomestead();
  say(`第 ${state.homestead.day} 天。${state.homestead.weather === '雨' ? '雨替你浇湿了地块。' : state.homestead.weather === '风' ? '风把远处的种子吹到了路边。' : '光落在刚清出的泥土上。'}`, '木秋');
  showToast('睡了一个好觉，体力恢复了');
}

function hasResources(cost) {
  return Object.entries(cost).every(([key, amount]) => (state.homestead.resources[key] || 0) >= amount);
}

function spendResources(cost) {
  Object.entries(cost).forEach(([key, amount]) => { state.homestead.resources[key] -= amount; });
}

function costText(cost) {
  return Object.entries(cost).map(([key, amount]) => `${resourceLabel(key)} ${amount}`).join(' · ');
}

function completeConstruction(id) {
  const project = state.homestead.construction?.[id];
  if (!project) return;
  delete state.homestead.construction[id];
  state.homestead.buildings[id] = 1;
  state.homestead.energy = Math.min(energyCap(), state.homestead.energy + (id === 'cabin' ? 20 : 0));
  logEvent('homestead_building_completed', { building_id: id, construction_ms: Date.now() - project.startedAt });
  advanceOnboarding('home-change', { kind: 'building', buildingId: id });
  persist();
  renderHomestead();
  showToast(`${BUILDING_META[id].name}建好了，地块有了新的轮廓`);
}

function buildStructure(id) {
  const meta = BUILDING_META[id];
  if (!meta || state.homestead.buildings[id] || state.homestead.construction?.[id]) return;
  if (creatorLevel().score < (meta.need || 0)) return showToast(`成长值达到 ${meta.need} 才能搭建${meta.name}`);
  if (!hasResources(meta.cost)) return showToast(`材料不足：${costText(meta.cost)}`);
  spendResources(meta.cost);
  state.homestead.construction = state.homestead.construction || {};
  state.homestead.construction[id] = { phase: 'scaffold', startedAt: Date.now(), cost: meta.cost };
  logEvent('homestead_building_started', { building_id: id, cost: meta.cost });
  persist();
  closeSheet();
  renderHomestead();
  showToast(`${meta.name}开始搭建，脚手架已经立起来了`);
  setTimeout(() => completeConstruction(id), 1500);
}

function craftHomesteadItem(id) {
  const recipe = CRAFT_RECIPES[id];
  if (recipe && creatorLevel().score < recipe.need) return showToast(`成长值达到 ${recipe.need} 才能制作${recipe.name}`);
  if (!recipe || !hasResources(recipe.cost)) return showToast(`材料不足：${costText(recipe?.cost || {})}`);
  if (!recipe.reward && state.homestead.decor.includes(id)) return showToast(`${recipe.name}已经放在地块上了`);
  spendResources(recipe.cost);
  if (recipe.reward) Object.entries(recipe.reward).forEach(([key, amount]) => { state.homestead.resources[key] += amount; });
  else state.homestead.decor.push(id);
  logEvent('homestead_item_crafted', { recipe_id: id, cost: recipe.cost });
  persist();
  closeSheet();
  renderHomestead();
  showToast(`${recipe.name}完成了`);
}

function waterAllPlots() {
  if (!state.homestead.buildings.well) return;
  if (state.homestead.wellUsedDay === state.homestead.day) return showToast('水井今天已经用过了');
  state.homestead.plots.forEach((plot) => { if (plot.state === 'planted') plot.watered = true; });
  state.homestead.wellUsedDay = state.homestead.day;
  logEvent('homestead_well_used', { day: state.homestead.day });
  persist();
  renderHomestead();
  showToast('水沿着浅沟流过了所有作物');
}

function showHomesteadPanel(initialTab = 'build') {
  const built = state.homestead.buildings;
  const level = creatorLevel();
  const plantedPlots = state.homestead.plots.filter((plot) => plot.state === 'planted');
  const maturePlots = plantedPlots.filter((plot) => plot.stage >= 3);
  const dryPlots = plantedPlots.filter((plot) => !plot.watered && plot.stage < 3);
  const cycle = currentWorldCycle();
  const buildingRows = Object.entries(BUILDING_META).map(([id, meta]) => {
    const complete = !!built[id];
    const building = !!state.homestead.construction?.[id];
    const unlocked = level.score >= (meta.need || 0);
    const ready = unlocked && !complete && !building && hasResources(meta.cost);
    const label = complete ? (id === 'cabin' ? '已扩建' : '已建成') : building ? '搭建中' : !unlocked ? `${meta.need} 成长值解锁` : ready ? '材料就绪' : '材料不足';
    return `<div class="build-row${ready ? ' is-ready' : ''}${building ? ' is-building' : ''}${complete ? ' is-complete' : ''}${!unlocked ? ' is-locked' : ''}"><div class="build-thumb build-${id}" aria-hidden="true"><i></i></div><div><b>${meta.name}</b><span>${meta.description}</span><small>${costText(meta.cost)}</small><em>${label}</em></div><button class="${ready ? 'primary-button' : 'paper-button'}" ${ready ? `data-build="${id}"` : unlocked && !complete && !building ? `data-gather-for="${id}"` : ''} ${complete || building || !unlocked ? 'disabled' : ''}>${complete ? '完成' : building ? '施工中' : !unlocked ? '尚未解锁' : ready ? '开始搭建' : '去采集'}</button></div>`;
  }).join('');
  const craftSection = built.workbench ? `
    <div class="note-section homestead-panel-section"><div class="section-kicker">制作台</div><h3>把一路带回来的材料，做成看得见的生活痕迹</h3><div class="craft-strip">
      ${Object.entries(CRAFT_RECIPES).map(([id, recipe]) => `<button data-craft="${id}" ${level.score < recipe.need ? 'disabled' : ''}><span class="craft-icon ${id}"></span><b>${recipe.name}</b><small>${level.score < recipe.need ? `${recipe.need} 成长值解锁` : costText(recipe.cost)}</small></button>`).join('')}
    </div></div>` : '<div class="homestead-empty-callout"><span aria-hidden="true">⌁</span><div><b>工作台还没搭起来</b><p>先在“建设”里完成露天工作台，就能制作装饰和更多种子。</p></div></div>';
  openSheet(`
    <div class="sheet-inner homestead-sheet">
      <div class="sheet-heading-row"><div><span class="sheet-eyebrow">我的永久空间</span><h2 class="sheet-title" id="sheetTitle" tabindex="-1">${escapeHtml(state.profile.spaceName || '我的地块')}</h2><p class="sheet-subtitle">公共世界里的发现会再生，只有这里会记住你的清理、播种、制作和建造。</p></div><span class="homestead-day-seal" aria-label="当前是第 ${state.homestead.day} 天"><small>${state.homestead.season}</small><b>${state.homestead.day}</b><em>DAY</em></span></div>
      <div class="home-summary"><div><span>今天</span><b>第 ${state.homestead.day} 天 · ${state.homestead.weather}</b></div><div><span>体力</span><b>${state.homestead.energy}/${energyCap()}</b></div><div><span>成熟作物</span><b>${state.homestead.plots.filter((plot) => plot.stage >= 3).length} 块</b></div></div>
      <nav class="sheet-tabs" aria-label="地块管理分类">
        <button type="button" data-home-tab="today">今日照料 <em>${maturePlots.length || dryPlots.length || ''}</em></button>
        <button type="button" data-home-tab="build">建设 <em>${Object.values(built).filter(Boolean).length}/${Object.keys(BUILDING_META).length}</em></button>
        <button type="button" data-home-tab="craft">制作 <em>${built.workbench ? Object.keys(CRAFT_RECIPES).length : '未开放'}</em></button>
      </nav>
      <div class="sheet-tab-panel" data-home-panel="today">
        <div class="homestead-today-grid">
          <article class="home-today-card crop-card"><span class="today-card-icon" aria-hidden="true">芽</span><div><small>田地近况</small><b>${plantedPlots.length ? `${plantedPlots.length} 块正在生长` : '田地正在等你'}</b><p>${maturePlots.length ? `${maturePlots.length} 块已经成熟，可以直接回到地里收获。` : dryPlots.length ? `${dryPlots.length} 块还需要浇水，照料后才会继续生长。` : '清理杂草、翻土并选择一种种子，让地块慢慢留下你的样子。'}</p></div></article>
          <article class="home-today-card cycle-card"><span class="today-card-icon" aria-hidden="true">风</span><div><small>今日公域</small><b>${cycle.title} · ${cycle.zoneName}</b><p>${cycle.summary}</p></div></article>
          <article class="home-today-card resource-card"><span class="today-card-icon" aria-hidden="true">袋</span><div><small>资源袋</small><b>木 ${state.homestead.resources.wood} · 石 ${state.homestead.resources.stone} · 纤维 ${state.homestead.resources.fiber}</b><p>种子 ${state.homestead.resources.seeds} · 收成 ${state.homestead.resources.produce}。缺材料时可从建设页直接标记采集方向。</p></div></article>
        </div>
        <div class="media-actions homestead-footer-actions"><button class="primary-button" id="returnToField" type="button">回到地块照料</button>${built.well ? `<button class="paper-button" id="waterFromPanel" type="button" ${state.homestead.wellUsedDay === state.homestead.day ? 'disabled' : ''}>${state.homestead.wellUsedDay === state.homestead.day ? '水井今日已用' : '让水井浇灌全部'}</button>` : ''}<button class="paper-button" id="restFromPanel" type="button">休息到明天</button></div>
      </div>
      <div class="sheet-tab-panel" data-home-panel="build"><div class="note-section homestead-panel-section"><div class="section-kicker">地块蓝图</div><h3>一处一处搭起来，而不是一次填满</h3><div class="build-list">${buildingRows}</div></div></div>
      <div class="sheet-tab-panel" data-home-panel="craft">${craftSection}<div class="media-actions homestead-footer-actions"><button class="text-button" id="spaceBookButton" type="button">查看副本布置簿</button></div></div>
    </div>
  `, () => {
    const selectTab = (tab) => {
      const safeTab = ['today', 'build', 'craft'].includes(tab) ? tab : 'build';
      $$('[data-home-tab]', sheet).forEach((button) => {
        const active = button.dataset.homeTab === safeTab;
        button.classList.toggle('is-active', active);
        button.setAttribute('aria-selected', String(active));
      });
      $$('[data-home-panel]', sheet).forEach((panel) => { panel.hidden = panel.dataset.homePanel !== safeTab; });
    };
    $$('[data-home-tab]', sheet).forEach((button) => button.addEventListener('click', () => selectTab(button.dataset.homeTab)));
    selectTab(initialTab);
    $$('[data-build]', sheet).forEach((button) => button.addEventListener('click', () => buildStructure(button.dataset.build)));
    $$('[data-gather-for]', sheet).forEach((button) => button.addEventListener('click', () => {
      const meta = BUILDING_META[button.dataset.gatherFor];
      const missing = Object.entries(meta.cost)
        .map(([key, amount]) => ({ key, amount: Math.max(0, amount - (state.homestead.resources[key] || 0)) }))
        .filter((item) => item.amount > 0)
        .sort((a, b) => b.amount - a.amount);
      const needsStoneMost = missing[0]?.key === 'stone';
      state.guidanceTarget = needsStoneMost
        ? { wx: 0, wy: -1750, label: `山坡采集点 · 为${meta.name}找石料` }
        : { wx: -2300, wy: -260, label: `林地采集点 · 为${meta.name}找木料与纤维` };
      closeSheet();
      if (state.worldMode === 'cottage') exitCottage();
      persist();
      renderWorld();
      say(`建造${meta.name}还需要${costText(meta.cost)}。我把更适合的采集方向标在右上方；公共资源明天会重新生长。`, '木秋');
      showToast('已返回公域并标记采集方向，靠近资源按 E');
    }));
    $$('[data-craft]', sheet).forEach((button) => button.addEventListener('click', () => craftHomesteadItem(button.dataset.craft)));
    $('#returnToField')?.addEventListener('click', closeSheet);
    $('#waterFromPanel')?.addEventListener('click', () => { waterAllPlots(); showHomesteadPanel('today'); });
    $('#restFromPanel')?.addEventListener('click', () => { closeSheet(); advanceDay(); });
    $('#spaceBookButton')?.addEventListener('click', showPersonalSpace);
  });
}

function updateCounters() {
  walletCount.textContent = state.wallet;
  copyCount.textContent = state.copies.length;
  favoritesCount.textContent = state.favorites.length;
  updateLifeHud();
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
  const adminButton = $('[data-panel="admin"]', profileDrawer);
  if (adminButton) adminButton.hidden = !window.ZhereService?.user()?.admin;
}

function creatorScore() {
  return countEvent('bid_accepted') * 3 + countEvent('copy_placed_home') * 2 + countEvent('publish_asset') + countEvent('publish_demand') + countEvent('like') + Math.floor(countEvent('tag_add') / 2) + state.discoveries.length * 2 + Math.floor(countEvent('homestead_crop_harvested') / 2);
}

function creatorLevel() {
  const score = creatorScore();
  let tier = CREATOR_TIERS[0];
  CREATOR_TIERS.forEach((candidate) => { if (score >= candidate.need) tier = candidate; });
  const next = CREATOR_TIERS.find((candidate) => candidate.need > score) || null;
  return { ...tier, score, next };
}

function currentZoneName() {
  if (state.worldMode === 'cottage') return `${state.profile.spaceName || '小窝'}内`;
  for (const region of NAMELESS_REGIONS) {
    if (Math.hypot(state.wx - region.x, state.wy - region.y) < region.r) {
      const name = state.namedZones[region.id];
      return name ? `「${name}」` : '无名处';
    }
  }
  return zoneAt(state.wx, state.wy).name;
}

function nearestTarget() {
  if (state.worldMode === 'cottage') return null;
  let result = null;
  const consider = (distance, payload) => {
    if (distance < 180 && (!result || distance < result.distance)) result = { ...payload, distance };
  };
  worldVideosVisible().forEach((video) => consider(Math.hypot(state.wx - video.wx, state.wy - video.wy), { type: 'video', video }));
  allUserWorldNotes().forEach((note) => consider(Math.hypot(state.wx - note.wx, state.wy - note.wy), { type: 'note', note }));
  Object.entries(objectTargets).forEach(([id, item]) => consider(Math.hypot(state.wx - item.wx, state.wy - item.wy), { type: 'object', id, hint: item.hint }));
  TAG_PLANTS.forEach((plant, index) => consider(Math.hypot(state.wx - plant.wx, state.wy - plant.wy), { type: 'tagplant', index, tag: plant.tag }));
  state.activeGatherables.forEach((item) => consider(Math.hypot(state.wx - item.wx, state.wy - item.wy), { type: 'resource', item }));
  NAMELESS_REGIONS.forEach((region) => consider(Math.hypot(state.wx - region.x, state.wy - region.y), { type: 'nameless', region }));
  if (state.bottleState?.open === false) consider(Math.hypot(state.wx - state.bottleState.wx, state.wy - state.bottleState.wy), { type: 'bottle' });
  return result;
}

function hintVideo() {
  const keys = [];
  keys.push('<kbd>E</kbd> 观看');
  if (state.carryTag) keys.push(`<kbd>F</kbd> 贴上「${state.carryTag}」`);
  else keys.push('<kbd>F</kbd> 点赞');
  keys.push('<kbd>G</kbd> 为素材报价');
  return keys.join(' · ');
}

function updateNearby() {
  const previousId = state.nearest?.type === 'video' ? state.nearest.video.id : state.nearest?.type === 'note' ? state.nearest.note.id : null;
  state.nearest = nearestTarget();
  $$('.media-screen').forEach((node) => node.classList.toggle('is-near', state.nearest?.type === 'video' && node.dataset.videoId === state.nearest.video.id));
  $$('.player-creation').forEach((node) => node.classList.toggle('is-near', state.nearest?.type === 'note' && node.dataset.creationId === state.nearest.note.id));
  $$('.world-object').forEach((node) => node.classList.toggle('is-near', state.nearest?.type === 'object' && state.nearest.id === node.dataset.object));
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
  } else if (state.nearest?.type === 'resource') {
    const item = state.nearest.item;
    contextHint.innerHTML = `${item.label} · <kbd>E</kbd> 收集 · 消耗 ${item.energy} 体力 · 明天再生`;
  } else if (state.nearest?.type === 'bottle') {
    contextHint.innerHTML = '一只漂流瓶被冲到了这里 · <kbd>E</kbd> 打开';
  } else if (state.nearest?.type === 'nameless') {
    const name = state.namedZones[state.nearest.region.id];
    contextHint.innerHTML = name ? `「${escapeHtml(name)}」 · <kbd>E</kbd> 改个名字` : '一处无名之地 · <kbd>E</kbd> 给它起个名字';
  } else if (state.nearest?.type === 'object') {
    contextHint.innerHTML = `${state.nearest.hint.replace('E ', '<kbd>E</kbd> ')} · <kbd>?</kbd> 这是什么`;
  } else if (state.worldMode === 'cottage' && cottageExitDistance() <= 14) {
    contextHint.innerHTML = '继续沿左侧小径行走即可回到公域 · 也可以点击路牌自动走过去';
  } else if (state.carryTag) {
    contextHint.innerHTML = `你带着标签「${state.carryTag}」 · 靠近视频按 <kbd>F</kbd> 贴上去`;
  } else {
    if (pointerMoveTarget) {
      const currentX = state.worldMode === 'cottage' ? state.cottageX : state.wx;
      const currentY = state.worldMode === 'cottage' ? state.cottageY : state.wy;
      const destination = pointerMoveTarget.destination || pointerMoveTarget;
      const remaining = Math.max(0, Math.round(Math.hypot(destination.x - currentX, destination.y - currentY)));
      const targetName = pointerMoveTarget.label ? `「${escapeHtml(pointerMoveTarget.label)}」` : '落点';
      contextHint.innerHTML = `正在前往${targetName} · 约 ${remaining} 步 · 再点地面可改道 · <kbd>Esc</kbd> 取消`;
    } else contextHint.innerHTML = state.worldMode === 'cottage'
      ? '点击地块开荒、翻土、播种和浇水 · <kbd>?</kbd> 图鉴 · <kbd>R</kbd> 休息到明天'
      : `<kbd>WASD</kbd> 行走 · 点击地面自动走到落点 · <kbd>?</kbd> 图鉴 · <kbd>J</kbd> 手账 · 当前在${currentZoneName()}`;
  }
  if (previousId && (!state.nearest || (state.nearest.video?.id || state.nearest.note?.id) !== previousId) && !state.openedVideos.has(previousId) && !state.avoidLogged.has(previousId)) {
    state.avoidLogged.add(previousId);
    logEvent('avoid', { asset_id: previousId });
  }
  const currentZone = zoneAt(state.wx, state.wy);
  zoneName.textContent = currentZoneName();
  worldStage.dataset.zone = state.worldMode === 'cottage' ? 'homestead' : currentZone.id;
  document.body.dataset.zone = state.worldMode === 'cottage' ? 'homestead' : currentZone.id;
  if (entry.classList.contains('is-gone')) discoverCurrentZone(currentZone);
}

function updatePlayer() {
  if (state.worldMode === 'cottage') {
    player.style.setProperty('--x', state.cottageX);
    player.style.setProperty('--y', state.cottageY);
    updateCottageExitState();
  }
}

function updateWayfinder() {
  if (state.worldMode === 'cottage') return;
  const guidance = state.guidanceTarget && Number.isFinite(state.guidanceTarget.wx) && Number.isFinite(state.guidanceTarget.wy)
    ? [{ ...state.guidanceTarget, id: 'guidance-target', priority: -1 }]
    : [];
  const signals = [
    ...guidance,
    ...Object.entries(objectTargets).map(([id, item]) => ({ id, ...item })),
    ...allUserWorldNotes().map((note) => ({ ...note, label: `${note.owner === 'me' ? '我的' : '公共'}纸条「${note.title}」` })),
    ...state.publicAssets.map((video) => ({ ...video, label: `${video.owner === 'me' ? '我的发布' : '公共素材'}《${video.title}》` })),
  ].map((item) => ({ ...item, distance: Math.hypot(item.wx - state.wx, item.wy - state.wy) }))
    .sort((a, b) => (a.priority ?? 0) - (b.priority ?? 0) || a.distance - b.distance)
    .slice(0, 2);
  const direction = (item) => {
    const dx = item.wx - state.wx;
    const dy = item.wy - state.wy;
    if (Math.abs(dx) > Math.abs(dy)) return dx > 0 ? '→' : '←';
    return dy > 0 ? '↓' : '↑';
  };
  wayfinder.textContent = signals.map((item) => `${direction(item)} ${item.label} ${Math.round(item.distance / 10)}步`).join('　');
  if (state.guidanceTarget && Math.hypot(state.guidanceTarget.wx - state.wx, state.guidanceTarget.wy - state.wy) < 220) {
    const arrived = state.guidanceTarget.label;
    state.guidanceTarget = null;
    persist();
    showToast(`已经到达${arrived}附近，留意地面的可再生资源`);
  }
}

function trackVisibility(video, visible, distance) {
  const now = performance.now();
  if (visible) {
    const acc = state.impressionAccum[video.id] || { durationMs: 0, visibleSince: now, dist: distance, score: scoreVideo(video), spawn_source: video.spawn_source || '我的发布', zone: zoneAt(video.wx, video.wy).id };
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
  logEvent('impression_batch', { impression_batch_id: batchId, impressions, count: impressions.length });
  state.impressionAccum = {};
  persist();
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
    if (!video) return;
    const { visible } = placeWorldNode(node, video.wx, video.wy);
    trackVisibility(video, visible, Math.hypot(state.wx - video.wx, state.wy - video.wy));
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
}

async function toggleLike(video) {
  const isPublicAsset = state.publicAssets.some((asset) => asset.id === video.id);
  const liked = isPublicAsset ? Boolean(video.liked) : state.likes.includes(video.id);
  if (isPublicAsset) {
    try {
      const result = await window.ZhereService.publicWorld.setAssetReaction(video.id, !liked);
      Object.assign(video, result.asset);
      state.publicAssets = state.publicAssets.map((asset) => asset.id === video.id ? video : asset);
    } catch (error) { showToast(error.message || '点赞保存失败'); return false; }
  }
  if (liked) {
    if (!isPublicAsset) { state.likes = state.likes.filter((id) => id !== video.id); video.likes = Math.max(0, video.likes - 1); }
    logEvent('unlike', { asset_id: video.id });
    showToast('已取消点赞');
  } else {
    if (!isPublicAsset) { state.likes.push(video.id); video.likes += 1; }
    logEvent('like', { asset_id: video.id });
    showToast('点赞了');
  }
  commitVideoState(video);
  persist();
  renderScreens();
  renderWorld();
  return true;
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
  comments.forEach((comment, index) => {
    if (!comment.id) comment.id = `comment-${video.id}-${index}-${Date.now()}`;
  });
  const roots = comments.filter((comment) => !comment.parentId || !comments.some((candidate) => candidate.id === comment.parentId));
  return roots.map((comment) => {
    const replies = comments.filter((candidate) => candidate.parentId === comment.id);
    const own = comment.owner === 'me' || (!comment.owner && comment.name === (state.profile.nickname || '路过的风'));
    return `<article class="comment-thread">
      <div class="comment${comment.reported ? ' is-reported' : ''}">
        <b>${escapeHtml(comment.name)}</b><span>${escapeHtml(comment.text)}</span>
        <div class="comment-actions">
          <button class="text-button" type="button" data-reply-comment="${escapeHtml(comment.id)}">回复</button>
          ${own ? `<button class="text-button" type="button" data-edit-comment="${escapeHtml(comment.id)}">修改</button><button class="text-button" type="button" data-delete-comment="${escapeHtml(comment.id)}">删除</button>` : `<button class="text-button" type="button" data-report-comment="${escapeHtml(comment.id)}" ${comment.reported ? 'disabled' : ''}>${comment.reported ? '已举报' : '举报'}</button>`}
        </div>
      </div>
      ${replies.map((reply) => {
        const ownReply = reply.owner === 'me' || (!reply.owner && reply.name === (state.profile.nickname || '路过的风'));
        return `<div class="comment is-reply"><b>${escapeHtml(reply.name)} <small>回复 ${escapeHtml(comment.name)}</small></b><span>${escapeHtml(reply.text)}</span><div class="comment-actions">${ownReply ? `<button class="text-button" type="button" data-edit-comment="${escapeHtml(reply.id)}">修改</button><button class="text-button" type="button" data-delete-comment="${escapeHtml(reply.id)}">删除</button>` : `<button class="text-button" type="button" data-report-comment="${escapeHtml(reply.id)}" ${reply.reported ? 'disabled' : ''}>${reply.reported ? '已举报' : '举报'}</button>`}</div></div>`;
      }).join('')}
    </article>`;
  }).join('');
}

function bindVideoReplies(video) {
  $$('[data-reply-comment]', sheet).forEach((button) => button.addEventListener('click', () => {
    const comment = (video.comments || []).find((candidate) => candidate.id === button.dataset.replyComment);
    if (!comment) return;
    state.commentReplyTo = { id: comment.id, name: comment.name };
    const input = $('#commentForm input[name="comment"]');
    input.placeholder = `回复 ${comment.name}`;
    $('#replyComposerText').textContent = `正在回复 ${comment.name}`;
    $('#replyComposer').hidden = false;
    input.focus();
    logEvent('comment_reply_start', { asset_id: video.id, reply_to: comment.name, parent_comment_id: comment.id });
  }));
  $$('[data-edit-comment]', sheet).forEach((button) => button.addEventListener('click', () => {
    const comment = (video.comments || []).find((candidate) => candidate.id === button.dataset.editComment);
    if (comment) showEditPublicComment(video, comment);
  }));
  $$('[data-delete-comment]', sheet).forEach((button) => button.addEventListener('click', async () => {
    const id = button.dataset.deleteComment;
    if (state.publicAssets.some((asset) => asset.id === video.id)) {
      try { await window.ZhereService.publicWorld.deleteAssetComment(video.id, id); }
      catch (error) { return showToast(error.message || '留言删除失败'); }
    }
    video.comments = (video.comments || []).filter((comment) => comment.id !== id && comment.parentId !== id);
    commitVideoState(video);
    persist();
    refreshVideoComments(video);
    logEvent('comment_delete', { asset_id: video.id, comment_id: id });
    showToast('留言已删除');
  }));
  $$('[data-report-comment]', sheet).forEach((button) => button.addEventListener('click', () => {
    const comment = (video.comments || []).find((candidate) => candidate.id === button.dataset.reportComment);
    if (!comment) return;
    showReportTarget('comment', comment.id, () => showVideo(video));
  }));
}

function showEditPublicComment(video, comment) {
  openSheet(`
    <div class="sheet-inner">
      <h2 class="sheet-title" id="sheetTitle" tabindex="-1">修改我的留言</h2>
      <form id="editCommentForm"><label>留言内容<textarea name="text" rows="4" maxlength="160" required>${escapeHtml(comment.text)}</textarea></label><p class="form-error" id="editCommentError" role="alert"></p><div class="media-actions"><button class="primary-button" type="submit">保存修改</button><button class="paper-button" id="editCommentBack" type="button">返回素材</button></div></form>
    </div>
  `, () => {
    $('#editCommentBack').addEventListener('click', () => showVideo(video));
    $('#editCommentForm').addEventListener('submit', async (event) => {
      event.preventDefault();
      const submit = event.currentTarget.querySelector('[type="submit"]');
      const text = event.currentTarget.elements.text.value.trim();
      setPendingButton(submit, true, '正在保存修改…');
      try {
        const result = await window.ZhereService.publicWorld.updateAssetComment(video.id, comment.id, text);
        Object.assign(comment, result.comment);
        logEvent('comment_update', { asset_id: video.id, comment_id: comment.id, length: text.length });
        showVideo(video); showToast('留言已更新');
      } catch (error) { setPendingButton(submit, false); $('#editCommentError').textContent = error.message || '留言修改失败。'; }
    });
  });
}

function showReportTarget(targetType, targetId, onBack) {
  openSheet(`
    <div class="sheet-inner">
      <h2 class="sheet-title" id="sheetTitle" tabindex="-1">向公域维护员报告</h2>
      <p class="sheet-subtitle">举报会进入服务端审核队列，不会立即公开显示，也不会自动判定对方违规。</p>
      <form id="reportTargetForm"><label>问题说明<textarea name="reason" rows="4" maxlength="300" required placeholder="请描述具体问题"></textarea></label><p class="form-error" id="reportTargetError" role="alert"></p><div class="media-actions"><button class="danger-button" type="submit">提交举报</button><button class="paper-button" id="reportTargetBack" type="button">返回</button></div></form>
    </div>
  `, () => {
    $('#reportTargetBack').addEventListener('click', () => onBack?.());
    $('#reportTargetForm').addEventListener('submit', async (event) => {
      event.preventDefault();
      const reason = event.currentTarget.elements.reason.value.trim();
      try {
        await window.ZhereService.publicWorld.report({ targetType, targetId, reason });
        logEvent('content_report', { target_type: targetType, target_id: targetId, reason_length: reason.length });
        onBack?.(); showToast('举报已进入审核队列');
      } catch (error) { $('#reportTargetError').textContent = error.message || '举报提交失败。'; }
    });
  });
}

function refreshVideoComments(video) {
  const list = $('#commentList', sheet);
  if (!list) return;
  list.innerHTML = renderVideoComments(video);
  bindVideoReplies(video);
}

function showVideo(video) {
  state.activeVideo = video;
  state.videoOpenedAt = performance.now();
  state.openedVideos.add(video.id);
  const zone = video.catalogOnly || !Number.isFinite(video.wx)
    ? { id: 'catalog', name: '世界素材档案' }
    : zoneAt(video.wx, video.wy);
  const favorite = state.favorites.some((entry) => entry.type === 'media' && entry.id === video.id);
  const liked = video.liked || state.likes.includes(video.id);
  const hasCopy = state.copies.some((copy) => copy.assetId === video.id) || state.placed.some((placed) => placed.assetId === video.id || (placed.parts || []).includes(video.id));
  const hasPurchased = hasPurchasedMaterial(video.id);
  const publicAsset = state.publicAssets.find((asset) => asset.id === video.id);
  const ownsPublicAsset = publicAsset?.owner === 'me';
  const demoMediaUrl = video.source === 'user' ? '' : demoMediaFor(video);
  const hasPlayableMedia = Boolean(demoMediaUrl || (video.source === 'user' && video.mime?.startsWith('video/')));
  const openNotes = allWorldNotes();
  const relatedNotes = relatedNotesForVideo(video.id);
  const assetRelations = relationsForAsset(video.id);
  recordJournalEntry('asset', video.id, video.title, { wx: video.wx, wy: video.wy, catalogOnly: !!video.catalogOnly });
  logEvent('asset_open', { asset_id: video.id, spawn_source: video.spawn_source || '我的发布', zone_id: zone.id });
  openSheet(`
    <div class="sheet-inner media-sheet">
      <h2 class="sheet-title" id="sheetTitle" tabindex="-1">${escapeHtml(video.title)}</h2>
      <p class="sheet-subtitle">${video.catalogOnly ? '这段素材今天没有出现在地图上，但它的详情、回应和历史关系仍然保留。' : `这段公共视频留在${zone.name}。`}观看、点赞、收藏、评论会分别记录，不会被直接解释成喜欢或不喜欢。</p>
      <div class="meta-chips">
        <span class="chip">${zone.name}</span>
        <span class="chip">${escapeHtml(video.spawn_source || '我的发布')}</span>
        <span class="chip">时长 ${escapeHtml(video.dur || '—')}</span>
        <span class="chip">${escapeHtml(video.res || '—')}</span>
        <span class="chip">授权 · ${escapeHtml(video.license || '个人副本')}</span>
      </div>
      ${video.catalogOnly ? '<div class="status-banner">素材暂未摆放在今日公域。你仍可观看档案、回应需求或等待它再次出现。</div>' : ''}
      ${hasPurchased || hasCopy ? '<div class="status-banner">这段素材已经购入；副本已收入背包，也可以带回你的小屋布置。</div>' : ''}
      ${demoMediaUrl ? '<div class="status-banner">系统演示素材 · 用于体验观看、回应与模拟报价，不冒充玩家上传。</div>' : ''}
      <div class="media-layout">
        <div>
          <div class="video-frame" id="videoFrame"><span class="video-status" id="videoStatus">${hasPlayableMedia ? '正在读取视频文件' : '视频文件暂时不可用'}</span></div>
          <div class="media-actions">
            <button class="${hasPlayableMedia ? 'primary-button' : 'paper-button'}" id="playButton" ${hasPlayableMedia ? '' : 'disabled'}>${hasPlayableMedia ? '加载视频' : '暂无可播放文件'}</button>
            <button class="paper-button" id="likeButton">${liked ? '♥ 已点赞' : '♡ 点赞'}</button>
            <button class="paper-button" id="favoriteButton">${favorite ? '已收藏' : '收藏'}</button>
            <button class="paper-button" id="compareButton">对照另一段</button>
            <button class="paper-button" id="bidButton" ${ownsPublicAsset || hasPurchased ? 'disabled' : ''}>${ownsPublicAsset ? '发布者不能报价' : hasPurchased ? '已购入 · 在背包中' : '为素材报价 G'}</button>
            ${ownsPublicAsset ? '<button class="paper-button" id="editPublicAssetButton">管理素材</button>' : publicAsset ? '<button class="text-button" id="reportPublicAssetButton">举报素材</button>' : ''}
          </div>
          <div class="note-section">
            <h3>标签</h3>
            <div class="tag-row" id="tagRow">
              ${(video.tags || []).map((tag) => `<button class="tag-button is-selected" data-tag="${escapeHtml(tag)}">${escapeHtml(tag)} ×</button>`).join('')}
              ${[...new Set(['治愈', '古怪', '像广告', '适合凌晨', ...state.customTags])].filter((tag) => !(video.tags || []).includes(tag)).map((tag) => `<button class="tag-button" data-tag="${escapeHtml(tag)}">${escapeHtml(tag)}</button>`).join('')}
            </div>
            <form class="inline-tag-form" id="customTagForm">
              <label>创建自己的标签<input name="customTag" maxlength="12" placeholder="2–12 个字" /></label>
              <button class="paper-button" type="submit">创建并贴上</button>
              <span class="form-error" id="customTagError" role="alert"></span>
            </form>
            ${state.carryTag ? `<p style="margin-top:8px;font-size:12px;color:var(--muted)">你口袋里有一株「${escapeHtml(state.carryTag)}」标签植物，<button class="text-button" id="plantTagButton" type="button">点这里贴到视频旁</button>，或退出后按 F</p>` : ''}
          </div>
        </div>
        <div>
          <h3>留言</h3>
          <div class="comment-list" id="commentList">${renderVideoComments(video)}</div>
          <div class="reply-composer" id="replyComposer" hidden><span id="replyComposerText"></span><button class="text-button" id="cancelReply" type="button">取消回复</button></div>
          <form class="inline-form" id="commentForm">
            <label>写下观察<input name="comment" maxlength="80" required placeholder="描述你看见的东西" /></label>
            <button class="primary-button" type="submit">留下</button>
          </form>
          <div class="note-section">
            <h3>素材之间的线 ${assetRelations.length}</h3>
            <div class="relation-list">
              ${assetRelations.length ? assetRelations.map((relation) => {
                const otherId = relation.aId === video.id ? relation.bId : relation.aId;
                const other = findVideoById(otherId);
                return `<button class="relation-row" type="button" data-asset-relation="${escapeHtml(relation.id)}"><span>对照</span><b>${escapeHtml(other?.title || '一段素材')}</b><small>${escapeHtml(RELATION_TYPES[relation.type]?.label || '保留的关系')}</small></button>`;
              }).join('') : '<div class="empty-state compact-empty">还没有和其他素材连线。对照不会改变公共素材，只会留下你的观察关系。</div>'}
            </div>
          </div>
          <div class="note-section">
            <h3>关联需求 ${relatedNotes.length}</h3>
            <div class="relation-list">
              ${relatedNotes.length ? relatedNotes.map((note, index) => `<button class="relation-row" type="button" data-related-note="${index}"><span>需求</span><b>${escapeHtml(note.title)}</b><small>打开纸条</small></button>`).join('') : '<div class="empty-state">这段视频还没有回应任何需求。</div>'}
            </div>
            <button class="paper-button" id="linkNoteButton">连接到其他需求</button>
            ${openNotes.length ? '' : '<p style="margin:8px 0 0;font-size:12px;color:var(--muted)">公域里目前还没有展开的纸条。按 N 可以留下一张。</p>'}
          </div>
        </div>
      </div>
    </div>
  `, () => {
    if (hasPlayableMedia) $('#playButton').addEventListener('click', () => togglePlayback(video));
    $('#likeButton').addEventListener('click', async (event) => {
      const button = event.currentTarget;
      setPendingButton(button, true, '正在保存…');
      const changed = await toggleLike(video);
      if (!changed) return setPendingButton(button, false);
      button.dataset.idleLabel = video.liked || state.likes.includes(video.id) ? '♥ 已点赞' : '♡ 点赞';
      setPendingButton(button, false);
    });
    $('#favoriteButton').addEventListener('click', () => {
      toggleFavoriteVideo(video);
      $('#favoriteButton').textContent = state.favorites.some((entry) => entry.type === 'media' && entry.id === video.id) ? '已收藏' : '收藏';
    });
    $('#compareButton').addEventListener('click', () => showComparePicker(video));
    $('#bidButton').addEventListener('click', () => openBidPanel(video));
    $('#editPublicAssetButton')?.addEventListener('click', () => showEditPublicAsset(video));
    $('#reportPublicAssetButton')?.addEventListener('click', () => showReportTarget('asset', video.id, () => showVideo(video)));
    $('#linkNoteButton').addEventListener('click', () => showLinkNote(video));
    $$('[data-related-note]', sheet).forEach((button) => button.addEventListener('click', () => showNoteDetail(relatedNotes[Number(button.dataset.relatedNote)])));
    $$('[data-asset-relation]', sheet).forEach((button) => button.addEventListener('click', () => {
      const relation = allAssetRelations().find((item) => item.id === button.dataset.assetRelation);
      if (!relation) return;
      const other = findVideoById(relation.aId === video.id ? relation.bId : relation.aId);
      if (other) showCompareWorkbench(video, other, relation);
    }));
    const plantTagButton = $('#plantTagButton', sheet);
    if (plantTagButton) plantTagButton.addEventListener('click', () => plantCarriedTag(video));
    $$('.tag-button', sheet).forEach((button) => button.addEventListener('click', async () => {
      const tag = button.dataset.tag;
      video.tags = video.tags || [];
      const active = !button.classList.contains('is-selected');
      if (state.publicAssets.some((asset) => asset.id === video.id)) {
        setPendingButton(button, true, '保存中…');
        try {
          const result = await window.ZhereService.publicWorld.setAssetTag(video.id, tag, active);
          Object.assign(video, result.asset);
        } catch (error) { setPendingButton(button, false); return showToast(error.message || '标签保存失败'); }
        commitVideoState(video);
        logEvent(active ? 'tag_add' : 'tag_remove', { asset_id: video.id, tag, ...(active ? { source: 'sheet' } : {}) });
        persist();
        showVideo(video);
        showToast(active ? `贴上了标签「${tag}」` : `已取消你贴的「${tag}」`);
        return;
      } else if (!active) {
        video.tags = video.tags.filter((value) => value !== tag);
      } else video.tags.push(tag);
      if (!active) {
        button.remove();
        logEvent('tag_remove', { asset_id: video.id, tag });
        showToast(`摘掉了标签「${tag}」`);
      } else {
        button.classList.add('is-selected');
        button.textContent = `${tag} ×`;
        logEvent('tag_add', { asset_id: video.id, tag, source: 'sheet' });
      }
      commitVideoState(video);
      persist();
    }));
    $('#customTagForm').addEventListener('submit', async (event) => {
      event.preventDefault();
      const input = event.currentTarget.elements.customTag;
      const tag = input.value.trim().replace(/\s+/g, ' ');
      const error = $('#customTagError');
      if (tag.length < 2) return error.textContent = '标签至少需要 2 个字。';
      if ((video.tags || []).includes(tag)) return error.textContent = '这段视频已经有这个标签。';
      state.customTags = [...new Set([...state.customTags, tag])].slice(-24);
      if (state.publicAssets.some((asset) => asset.id === video.id)) {
        try {
          const result = await window.ZhereService.publicWorld.setAssetTag(video.id, tag, true);
          Object.assign(video, result.asset);
        } catch (requestError) { return error.textContent = requestError.message || '标签保存失败。'; }
      } else video.tags = [...(video.tags || []), tag];
      commitVideoState(video);
      logEvent('custom_tag_create', { asset_id: video.id, tag });
      persist();
      showVideo(video);
      showToast(`已创建并贴上「${tag}」`);
    });
    bindVideoReplies(video);
    $('#cancelReply').addEventListener('click', () => {
      state.commentReplyTo = null;
      $('#replyComposer').hidden = true;
      const input = $('#commentForm input[name="comment"]');
      input.placeholder = '描述你看见的东西';
      input.focus();
    });
    $('#commentForm').addEventListener('submit', async (event) => {
      event.preventDefault();
      const input = event.currentTarget.elements.comment;
      const submit = event.currentTarget.querySelector('[type="submit"]');
      const text = input.value.trim();
      if (!text) return;
      const replyTo = state.commentReplyTo;
      let comment = { id: crypto.randomUUID ? crypto.randomUUID() : `comment-${Date.now()}`, name: state.profile.nickname || '路过的风', text, parentId: replyTo?.id || null, createdAt: new Date().toISOString() };
      if (state.publicAssets.some((asset) => asset.id === video.id)) {
        setPendingButton(submit, true, replyTo ? '正在回复…' : '正在留下…');
        input.readOnly = true;
        try {
          const result = await window.ZhereService.publicWorld.commentOnAsset(video.id, comment);
          comment = result.comment;
        } catch (error) {
          input.readOnly = false;
          setPendingButton(submit, false);
          return showToast(error.message || '留言提交失败');
        }
      }
      video.comments = video.comments || [];
      video.comments.push(comment);
      commitVideoState(video);
      persist();
      refreshVideoComments(video);
      input.value = '';
      state.commentReplyTo = null;
      $('#replyComposer').hidden = true;
      input.placeholder = '描述你看见的东西';
      logEvent(replyTo ? 'comment_reply' : 'comment', { asset_id: video.id, length: text.length, parent_comment_id: replyTo?.id || null });
      showToast(replyTo ? '回复留在了这条留言下面' : '留言留在了视频旁');
    });
    hydrateLocalMedia(video, demoMediaUrl);
  });
}

function showEditPublicAsset(video) {
  openSheet(`
    <div class="sheet-inner">
      <h2 class="sheet-title" id="sheetTitle" tabindex="-1">管理公共素材</h2>
      <p class="sheet-subtitle">可以修改说明、把素材移到当前位置，或先收进档案。归档只从地图收起，仍可在公告树素材库找到并恢复。</p>
      <form id="editPublicAssetForm">
        <label>素材标题<input name="title" maxlength="80" required value="${escapeHtml(video.title)}" /></label>
        <label>素材说明<textarea name="description" rows="4" maxlength="500">${escapeHtml(video.description || '')}</textarea></label>
        <label class="check-label"><input type="checkbox" name="relocate" /> 移到我现在站立的位置（${escapeHtml(currentZoneName())}）</label>
        <p class="form-error" id="editPublicAssetError" role="alert"></p>
        <div class="media-actions"><button class="primary-button" type="submit">保存修改</button><button class="paper-button" id="toggleAssetArchive" type="button">${video.archived ? '恢复到地图' : '收进档案'}</button><button class="paper-button" id="editPublicAssetBack" type="button">返回素材</button><button class="danger-button" id="withdrawPublicAsset" type="button">撤回公共素材</button></div>
      </form>
    </div>
  `, () => {
    $('#editPublicAssetBack').addEventListener('click', () => showVideo(video));
    $('#editPublicAssetForm').addEventListener('submit', async (event) => {
      event.preventDefault();
      const form = event.currentTarget;
      const payload = { title: form.elements.title.value.trim(), description: form.elements.description.value.trim() };
      if (form.elements.relocate.checked) Object.assign(payload, { wx: state.wx, wy: state.wy, zone: currentZoneName() });
      try {
        const result = await window.ZhereService.publicWorld.updateAsset(video.id, payload);
        Object.assign(video, result.asset);
        state.publicAssets = state.publicAssets.map((asset) => asset.id === video.id ? video : asset);
        renderScreens(); renderWorld(); showVideo(video); showToast('公共素材已更新');
      } catch (error) { $('#editPublicAssetError').textContent = error.message || '素材修改失败。'; }
    });
    $('#withdrawPublicAsset').addEventListener('click', () => confirmWithdrawPublicAsset(video));
    $('#toggleAssetArchive').addEventListener('click', async () => {
      try {
        const result = await window.ZhereService.publicWorld.updateAsset(video.id, { archived: !video.archived });
        Object.assign(video, result.asset); renderScreens(); renderWorld(); showVideo(video);
        showToast(video.archived ? '素材已收进档案，仍可搜索和打开' : '素材已经恢复到公共地图');
      } catch (error) { showToast(error.message || '归档状态保存失败'); }
    });
  });
}

function confirmWithdrawPublicAsset(video) {
  openSheet(`
    <div class="sheet-inner confirm-sheet"><h2 class="sheet-title" id="sheetTitle" tabindex="-1">撤回《${escapeHtml(video.title)}》？</h2><p class="sheet-subtitle">它会从其他玩家的地图和公共档案中消失，原始上传文件仍保留在你的账户数据中。</p><div class="media-actions"><button class="danger-button" id="confirmWithdrawAsset" type="button">确认撤回</button><button class="paper-button" id="cancelWithdrawAsset" type="button">返回</button></div></div>
  `, () => {
    $('#cancelWithdrawAsset').addEventListener('click', () => showEditPublicAsset(video));
    $('#confirmWithdrawAsset').addEventListener('click', async () => {
      try { await window.ZhereService.publicWorld.deleteAsset(video.id); }
      catch (error) { return showToast(error.message || '素材撤回失败'); }
      state.publicAssets = state.publicAssets.filter((asset) => asset.id !== video.id);
      state.favorites = state.favorites.filter((entry) => !(entry.type === 'media' && entry.id === video.id));
      closeSheet(); renderScreens(); renderWorld(); showToast('公共素材已撤回');
    });
  });
}

function showComparePicker(baseVideo) {
  openSheet(`
    <div class="sheet-inner compare-picker">
      <h2 class="sheet-title" id="sheetTitle" tabindex="-1">给《${escapeHtml(baseVideo.title)}》找一段对照</h2>
      <p class="sheet-subtitle">对照不是合成或购买。它只记录你为什么把两段公共素材放在一起看。</p>
      <label class="search-box">搜索另一段素材<input id="compareSearch" placeholder="标题、标签或场景" /></label>
      <div class="compare-candidate-list" id="compareCandidates"></div>
      <div class="media-actions"><button class="paper-button" id="compareBack" type="button">返回当前素材</button></div>
    </div>
  `, () => {
    const render = () => {
      const query = $('#compareSearch').value.trim().toLowerCase();
      const baseTags = new Set(baseVideo.tags || []);
      const candidates = allAssets().filter((video) => video.id !== baseVideo.id)
        .map((video) => ({ video, affinity: (video.tags || []).filter((tag) => baseTags.has(tag)).length * 3 + (video.scene === baseVideo.scene ? 1 : 0) }))
        .filter(({ video }) => !query || `${video.title}${video.scene || ''}${(video.tags || []).join('')}`.toLowerCase().includes(query))
        .sort((a, b) => b.affinity - a.affinity || a.video.title.localeCompare(b.video.title, 'zh-CN'))
        .slice(0, query ? 30 : 16);
      const list = $('#compareCandidates');
      list.innerHTML = candidates.length ? candidates.map(({ video, affinity }) => `<button class="compare-candidate" type="button" data-compare-candidate="${escapeHtml(video.id)}"><span class="compare-candidate-mark" aria-hidden="true"></span><span><b>${escapeHtml(video.title)}</b><small>${escapeHtml(videoLocationLabel(video))} · ${(video.tags || []).slice(0, 3).map(escapeHtml).join(' / ') || '暂无标签'}${affinity ? ` · ${affinity} 条相近线索` : ''}</small></span><em>放到旁边</em></button>`).join('') : '<div class="empty-state">没有找到匹配素材，换一个词试试。</div>';
      $$('[data-compare-candidate]', list).forEach((button) => button.addEventListener('click', () => showCompareWorkbench(baseVideo, findVideoById(button.dataset.compareCandidate))));
    };
    $('#compareSearch').addEventListener('input', render);
    $('#compareBack').addEventListener('click', () => showVideo(baseVideo));
    render();
  });
}

function showCompareWorkbench(a, b, existingRelation = null) {
  if (!a || !b) return showToast('其中一段素材暂时无法读取');
  const foreignRelation = existingRelation?.owner === 'other';
  let selectedType = foreignRelation ? '' : existingRelation?.type || '';
  openSheet(`
    <div class="sheet-inner compare-workbench">
      <h2 class="sheet-title" id="sheetTitle" tabindex="-1">两段素材，先并排看一会儿</h2>
      <p class="sheet-subtitle">不用找到标准答案。选择此刻最接近的关系，也可以留下以后才看得懂的话。</p>
      <div class="compare-stage">
        <article><div class="compare-art media-${escapeHtml(a.zone || 'town')}"><span></span></div><h3>${escapeHtml(a.title)}</h3><p>${escapeHtml(videoLocationLabel(a))} · ${(a.tags || []).slice(0, 4).map(escapeHtml).join(' / ') || '暂无标签'}</p><button class="text-button" type="button" data-open-compare="${escapeHtml(a.id)}">单独打开</button></article>
        <div class="relation-thread" aria-hidden="true"><i></i><i></i><i></i></div>
        <article><div class="compare-art media-${escapeHtml(b.zone || 'town')}"><span></span></div><h3>${escapeHtml(b.title)}</h3><p>${escapeHtml(videoLocationLabel(b))} · ${(b.tags || []).slice(0, 4).map(escapeHtml).join(' / ') || '暂无标签'}</p><button class="text-button" type="button" data-open-compare="${escapeHtml(b.id)}">单独打开</button></article>
      </div>
      <fieldset class="relation-choices">
        <legend>它们为什么应该放在一起？</legend>
        ${Object.entries(RELATION_TYPES).map(([key, meta]) => `<button type="button" data-relation-type="${key}" aria-pressed="${String(selectedType === key)}"><b>${meta.label}</b><span>${meta.description}</span></button>`).join('')}
      </fieldset>
      ${foreignRelation ? `<div class="status-banner">${escapeHtml(existingRelation.note || '另一位旅人留下了这条素材关系。')} 你可以在同两段素材之间留下自己的另一条线。</div>` : ''}
      <label>留一句只属于这条线的话<textarea id="relationNote" rows="2" maxlength="160" placeholder="可选；以后回来看时会出现在手账里">${escapeHtml(foreignRelation ? '' : existingRelation?.note || '')}</textarea></label>
      <p class="form-error" id="relationError" role="alert"></p>
      <div class="media-actions"><button class="primary-button" id="saveRelation" type="button">${existingRelation && !foreignRelation ? '保存关系变化' : '把我的线留在公共世界'}</button><button class="paper-button" id="changeCompare" type="button">换一段素材</button>${existingRelation && !foreignRelation ? '<button class="danger-button" id="deleteRelation" type="button">拆掉这条线</button>' : ''}</div>
    </div>
  `, () => {
    $$('[data-relation-type]', sheet).forEach((button) => button.addEventListener('click', () => {
      selectedType = button.dataset.relationType;
      $$('[data-relation-type]', sheet).forEach((item) => item.setAttribute('aria-pressed', String(item === button)));
      $('#relationError').textContent = '';
    }));
    $$('[data-open-compare]', sheet).forEach((button) => button.addEventListener('click', () => showVideo(findVideoById(button.dataset.openCompare))));
    $('#changeCompare').addEventListener('click', () => showComparePicker(a));
    $('#saveRelation').addEventListener('click', async () => {
      if (!selectedType) return $('#relationError').textContent = '先选择一种此刻最接近的关系。';
      const pairExisting = allAssetRelations().find((relation) => relation.owner !== 'other' && ((relation.aId === a.id && relation.bId === b.id) || (relation.aId === b.id && relation.bId === a.id)));
      const relation = (!foreignRelation && existingRelation) || pairExisting || { id: crypto.randomUUID ? crypto.randomUUID() : `relation-${Date.now()}`, aId: a.id, bId: b.id, createdAt: new Date().toISOString() };
      relation.type = selectedType;
      relation.note = $('#relationNote').value.trim();
      relation.updatedAt = new Date().toISOString();
      try {
        const result = await window.ZhereService.publicWorld.saveRecord({ id: relation.id, kind: 'asset_relation', payload: relation });
        state.publicRecords = [...state.publicRecords.filter((item) => item.id !== relation.id), result.record];
        state.assetRelations = state.assetRelations.filter((item) => item.id !== relation.id);
      } catch (error) { return $('#relationError').textContent = error.message || '关系保存失败。'; }
      recordJournalEntry('relation', relation.id, `${a.title} × ${b.title}`, { aId: a.id, bId: b.id, relationType: selectedType });
      logEvent('asset_relation_save', { relation_id: relation.id, asset_a: a.id, asset_b: b.id, relation_type: selectedType, note_length: relation.note.length });
      persist();
      showVideo(a);
      showToast('两段素材之间拉起了一根线，已经留在探索手账');
    });
    $('#deleteRelation')?.addEventListener('click', async () => {
      if (state.publicRecords.some((record) => record.id === existingRelation.id)) {
        try { await window.ZhereService.publicWorld.deleteRecord(existingRelation.id); }
        catch (error) { return showToast(error.message || '关系删除失败'); }
        state.publicRecords = state.publicRecords.filter((record) => record.id !== existingRelation.id);
      }
      state.assetRelations = state.assetRelations.filter((relation) => relation.id !== existingRelation.id);
      state.journalEntries = state.journalEntries.filter((entry) => !(entry.type === 'relation' && entry.id === existingRelation.id));
      logEvent('asset_relation_delete', { relation_id: existingRelation.id });
      persist();
      showVideo(a);
      showToast('这条线已经拆下，两段公共素材都还在原处');
    });
  });
}

function journalEntryLabel(entry) {
  const labels = { asset: '素材', demand: '需求', relation: '关系', zone: '地点', discovery: '珍藏' };
  return labels[entry.type] || '足迹';
}

function showJournal(initialTab = 'recent') {
  let activeTab = initialTab;
  openSheet(`
    <div class="sheet-inner journal-sheet">
      <div class="journal-heading">
        <div><span class="section-kicker">不是任务清单，是你走过的路</span><h2 class="sheet-title" id="sheetTitle" tabindex="-1">探索手账</h2></div>
        <p>看过的素材、展开过的纸条、发现的地方与亲手连起的关系都会留在这里。它们没有完成期限，随时可以回来。</p>
      </div>
      <nav class="journal-tabs" aria-label="手账分类">
        <button type="button" data-journal-tab="recent">最近翻过</button>
        <button type="button" data-journal-tab="relations">素材关系</button>
        <button type="button" data-journal-tab="places">发现地点</button>
        <button type="button" data-journal-tab="discoveries">区域珍藏</button>
      </nav>
      <div class="journal-memory" id="journalMemory"></div>
      <div class="journal-list" id="journalList"></div>
    </div>
  `, () => {
    const renderJournal = () => {
      $$('[data-journal-tab]', sheet).forEach((button) => {
        const selected = button.dataset.journalTab === activeTab;
        button.classList.toggle('is-active', selected);
        button.setAttribute('aria-current', selected ? 'page' : 'false');
      });
      const ordered = [...state.journalEntries].sort((a, b) => Number(Boolean(b.pinned)) - Number(Boolean(a.pinned)) || new Date(b.lastVisitedAt) - new Date(a.lastVisitedAt));
      const list = $('#journalList');
      const memory = $('#journalMemory');
      memory.innerHTML = `<p>你已经走进 <b>${state.discoveredZones.length}</b> 个地方，找到 <b>${state.discoveries.length}/${Object.keys(DISCOVERY_META).length}</b> 件区域珍藏，公共世界里有 <b>${allAssetRelations().length}</b> 条素材关系。</p>`;
      if (activeTab === 'relations') {
        const relations = allAssetRelations();
        list.innerHTML = relations.length ? relations.map((relation) => {
          const a = findVideoById(relation.aId);
          const b = findVideoById(relation.bId);
          const meta = RELATION_TYPES[relation.type] || RELATION_TYPES.unresolved;
          if (!a || !b) return '';
          return `<article class="journal-relation"><span class="relation-line-mark" aria-hidden="true"></span><div><small>素材之间的线</small><h3>${escapeHtml(a.title)} <i>与</i> ${escapeHtml(b.title)}</h3><p><b>${meta.label}</b>${relation.note ? ` · ${escapeHtml(relation.note)}` : ''}</p></div><button class="paper-button" type="button" data-journal-relation="${escapeHtml(relation.id)}">重新并排看</button></article>`;
        }).join('') : '<div class="journal-empty"><b>还没有拉起素材之间的线</b><p>打开任意素材，选择“对照另一段”，把两个发现放在一起看。</p></div>';
      } else if (activeTab === 'places') {
        const placeEntries = ordered.filter((entry) => entry.type === 'zone');
        list.innerHTML = placeEntries.length ? placeEntries.map((entry, index) => `<article class="journal-place"><span>${String(index + 1).padStart(2, '0')}</span><div><small>发现地点</small><h3>${escapeHtml(entry.title)}</h3><p>${entry.visits > 1 ? `已经回来过 ${entry.visits} 次` : '第一次经过时记下的位置'}</p></div><button class="paper-button" type="button" data-journal-place="${escapeHtml(entry.id)}">回到附近</button></article>`).join('') : '<div class="journal-empty"><b>地图还没有留下地名</b><p>离开原地向任意方向走，第一次进入区域时会自动夹进手账。</p></div>';
      } else if (activeTab === 'discoveries') {
        list.innerHTML = `<div class="discovery-atlas">${Object.entries(DISCOVERY_META).map(([zoneId, meta]) => {
          const found = state.discoveries.find((item) => item.id === meta.id);
          return `<article class="discovery-card${found ? ' is-found' : ''}"><span class="discovery-specimen specimen-${zoneId}" aria-hidden="true"><i></i></span><div><small>${escapeHtml(ZONE_DEFS.find((zone) => zone.id === zoneId)?.name || zoneId)}</small><h3>${found ? escapeHtml(meta.name) : '尚未辨认'}</h3><p>${found ? escapeHtml(meta.hint) : '在这片区域采集时偶尔会遇见；记录者更容易发现。'}</p></div>${found ? `<time>第 ${found.day} 天</time>` : '<em>未发现</em>'}</article>`;
        }).join('')}</div>`;
      } else {
        list.innerHTML = ordered.length ? ordered.map((entry) => `<article class="journal-entry ${entry.pinned ? 'is-pinned' : ''}"><button class="journal-open" type="button" data-journal-open="${escapeHtml(entry.type)}:${escapeHtml(entry.id)}"><span class="journal-stamp">${journalEntryLabel(entry)}</span><span><b>${escapeHtml(entry.title)}</b><small>${entry.visits > 1 ? `翻过 ${entry.visits} 次` : '刚刚夹进手账'}${entry.pinned ? ' · 压在最上面' : ''}</small></span></button><button class="journal-pin" type="button" data-journal-pin="${escapeHtml(entry.type)}:${escapeHtml(entry.id)}" aria-label="${entry.pinned ? '取消压在最上面' : '压在手账最上面'}" aria-pressed="${String(Boolean(entry.pinned))}">${entry.pinned ? '取下别针' : '别在上面'}</button></article>`).join('') : '<div class="journal-empty"><b>第一页还空着</b><p>走近素材或纸条按 E，手账会记住你真正看过的东西。</p></div>';
      }
      $$('[data-journal-tab]', sheet).forEach((button) => button.onclick = () => { activeTab = button.dataset.journalTab; renderJournal(); });
      $$('[data-journal-pin]', sheet).forEach((button) => button.onclick = () => {
        const [type, ...idParts] = button.dataset.journalPin.split(':');
        const entry = state.journalEntries.find((item) => item.type === type && item.id === idParts.join(':'));
        if (!entry) return;
        entry.pinned = !entry.pinned;
        persist();
        renderJournal();
        showToast(entry.pinned ? '这一页已经压在手账最上面' : '已经取下别针，足迹仍然保留');
      });
      $$('[data-journal-relation]', sheet).forEach((button) => button.onclick = () => {
        const relation = allAssetRelations().find((item) => item.id === button.dataset.journalRelation);
        if (relation) showCompareWorkbench(findVideoById(relation.aId), findVideoById(relation.bId), relation);
      });
      $$('[data-journal-place]', sheet).forEach((button) => button.onclick = () => revisitJournalPlace(button.dataset.journalPlace));
      $$('[data-journal-open]', sheet).forEach((button) => button.onclick = () => openJournalEntry(button.dataset.journalOpen));
    };
    renderJournal();
  });
}

function revisitJournalPlace(zoneId) {
  const entry = state.journalEntries.find((item) => item.type === 'zone' && item.id === zoneId);
  if (!entry) return showToast('这页地点记录已经褪色了');
  if (state.worldMode === 'cottage') exitCottage();
  state.wx = Number(entry.wx) || 0;
  state.wy = Number(entry.wy) || 0;
  recordJournalEntry('zone', entry.id, entry.title, { wx: state.wx, wy: state.wy });
  persist();
  closeSheet();
  renderWorld();
  showToast(`沿着手账的折痕，回到了「${entry.title}」附近`);
}

function openJournalEntry(key) {
  const [type, ...idParts] = key.split(':');
  const id = idParts.join(':');
  if (type === 'asset') return showVideo(findVideoById(id));
  if (type === 'demand') return showNoteDetail(allWorldNotes().find((note) => note.id === id));
  if (type === 'relation') {
  const relation = allAssetRelations().find((item) => item.id === id);
    if (relation) return showCompareWorkbench(findVideoById(relation.aId), findVideoById(relation.bId), relation);
  }
  if (type === 'zone') return revisitJournalPlace(id);
  if (type === 'discovery') return showJournal('discoveries');
  showToast('这页内容暂时无法重新打开');
}

async function hydrateLocalMedia(video, demoMediaUrl = '') {
  if (!demoMediaUrl && (video.source !== 'user' || !video.mime?.startsWith('video/'))) {
    if (video.source === 'user') {
      const status = $('#videoStatus');
      if (status) status.textContent = video.fileName ? '本地文件不可用，请重新上传' : '仅保存了素材说明';
      const button = $('#playButton');
      if (button) button.disabled = true;
    }
    return;
  }
  const frame = $('#videoFrame');
  const button = $('#playButton');
  try {
    let mediaUrl = demoMediaUrl || video.mediaUrl || '';
    if (!mediaUrl) {
      const file = await getUploadFile(video.id);
      if (!file) throw new Error('missing-media-file');
      if (state.activeObjectUrl) URL.revokeObjectURL(state.activeObjectUrl);
      state.activeObjectUrl = URL.createObjectURL(file);
      mediaUrl = state.activeObjectUrl;
    }
    if (state.activeVideo?.id !== video.id || !frame) throw new Error('inactive-video');
    frame.replaceChildren();
    const media = document.createElement('video');
    media.className = 'local-video';
    media.src = mediaUrl;
    media.controls = true;
    media.playsInline = true;
    media.preload = 'metadata';
    media.dataset.watchedSeconds = '0';
    media.setAttribute('aria-label', `播放《${video.title}》`);
    frame.append(media);
    button.disabled = false;
    button.textContent = demoMediaUrl ? '播放系统演示片' : video.mediaUrl ? '播放上传视频' : '播放迁移视频';
    const source = demoMediaUrl ? 'system-demo' : video.mediaUrl ? 'server-upload' : 'legacy-local-upload';
    media.dataset.source = source;
    const milestones = new Set();
    let seekFrom = 0;
    let lastPlaybackTime = 0;
    let lastTickAt = 0;
    media.addEventListener('play', () => {
      frame.classList.add('is-playing');
      lastTickAt = performance.now();
      button.textContent = '暂停';
      logEvent('play', { asset_id: video.id, source, current_time: Number(media.currentTime.toFixed(2)), duration: Number.isFinite(media.duration) ? Number(media.duration.toFixed(2)) : null });
      persist();
      advanceOnboarding('watch', { assetId: video.id });
    });
    media.addEventListener('pause', () => {
      if (lastTickAt) media.dataset.watchedSeconds = String(Number(media.dataset.watchedSeconds || 0) + Math.max(0, (performance.now() - lastTickAt) / 1000));
      lastTickAt = 0;
      frame.classList.remove('is-playing');
      button.textContent = '继续播放';
      if (!media.ended) logEvent('pause', { asset_id: video.id, source, current_time: Number(media.currentTime.toFixed(2)), duration: Number.isFinite(media.duration) ? Number(media.duration.toFixed(2)) : null });
      persist();
    });
    media.addEventListener('timeupdate', () => {
      if (!media.paused && lastTickAt) {
        const now = performance.now();
        media.dataset.watchedSeconds = String(Number(media.dataset.watchedSeconds || 0) + Math.max(0, (now - lastTickAt) / 1000));
        lastTickAt = now;
      }
      if (!Number.isFinite(media.duration) || media.duration <= 0) return;
      const progress = media.currentTime / media.duration;
      [25, 50, 75].forEach((milestone) => {
        if (progress < milestone / 100 || milestones.has(milestone)) return;
        milestones.add(milestone);
        logEvent('play_progress', { asset_id: video.id, source, milestone, current_time: Number(media.currentTime.toFixed(2)), duration: Number(media.duration.toFixed(2)) });
      });
      if (!media.seeking) lastPlaybackTime = media.currentTime;
    });
    media.addEventListener('seeking', () => { seekFrom = lastPlaybackTime; });
    media.addEventListener('seeked', () => logEvent('seek', { asset_id: video.id, source, from_time: Number(seekFrom.toFixed(2)), to_time: Number(media.currentTime.toFixed(2)), duration: Number.isFinite(media.duration) ? Number(media.duration.toFixed(2)) : null }));
    media.addEventListener('ended', () => {
      if (lastTickAt) media.dataset.watchedSeconds = String(Number(media.dataset.watchedSeconds || 0) + Math.max(0, (performance.now() - lastTickAt) / 1000));
      lastTickAt = 0;
      milestones.add(100);
      logEvent('play_complete', { asset_id: video.id, source, milestone: 100, duration: Number.isFinite(media.duration) ? Number(media.duration.toFixed(2)) : null });
      persist();
    });
    media.addEventListener('error', () => logEvent('play_error', { asset_id: video.id, source, media_error_code: media.error?.code || null }));
  } catch {
    const status = $('#videoStatus');
    if (status) status.textContent = '没有找到服务端视频文件，请重新上传';
    if (button) button.disabled = true;
  }
}

async function togglePlayback(video) {
  const frame = $('#videoFrame');
  if (!frame) return;
  const button = $('#playButton');
  const media = $('.local-video', frame);
  if (media) {
    if (media.paused) {
      try { await media.play(); } catch { showToast('浏览器阻止了播放，请使用播放器内的播放按钮'); }
    } else {
      media.pause();
    }
    return;
  }
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
  persist();
}

async function plantCarriedTag(video) {
  if (!state.carryTag) return;
  video.tags = video.tags || [];
  if (state.publicAssets.some((asset) => asset.id === video.id)) {
    try {
      const result = await window.ZhereService.publicWorld.setAssetTag(video.id, state.carryTag, true);
      Object.assign(video, result.asset);
    } catch (error) { return showToast(error.message || '标签保存失败'); }
  } else if (!video.tags.includes(state.carryTag)) video.tags.push(state.carryTag);
  commitVideoState(video);
  logEvent('tag_add', { asset_id: video.id, tag: state.carryTag, source: 'tag_plant' });
  const tag = state.carryTag;
  state.carryTag = null;
  persist();
  closeSheet();
  showToast(`「${tag}」插在了《${video.title}》旁`);
  renderWorld();
}

function applyPricingPurchases(purchases = []) {
  const seenMaterials = new Set();
  state.pricingPurchases = (Array.isArray(purchases) ? purchases : []).filter((purchase) => {
    if (purchase?.is_valid === false || !purchase?.material_id || seenMaterials.has(purchase.material_id)) return false;
    seenMaterials.add(purchase.material_id);
    return true;
  });
  state.pricingPurchases.forEach((purchase) => {
    state.bids[purchase.material_id] = {
      bidId: purchase.bid_id,
      transactionId: purchase.transaction_id,
      lastPrice: purchase.transaction_price,
      validTransactionCount: purchase.valid_transaction_count,
      basePrice: purchase.base_price,
      requiredCount: purchase.base_price_transaction_count,
      submittedAt: purchase.transaction_time,
    };
  });
}

async function hydrateSessionExtras() {
  if (!window.ZhereService?.isAuthenticated()) return;
  try {
    const extras = await window.ZhereService.loadSessionExtras();
    applyPublicWorld(extras.publicWorld, { render: false });
    if (extras.purchases) applyPricingPurchases(extras.purchases);
    if (extras.notifications) state.notifications = extras.notifications;
    updateEchoCount();
    renderScreens();
    renderCreations();
    renderWorld();
    if (extras.degraded?.length) showToast('已进入公域，部分公共内容正在后台重连');
  } catch (error) {
    console.warn('Session extras failed to load', error);
    showToast('已进入公域，公共内容正在重新连接');
  }
}

function purchaseForMaterial(materialId) {
  return state.pricingPurchases.find((purchase) => purchase.material_id === materialId && purchase.is_valid !== false) || null;
}

function hasPurchasedMaterial(materialId) {
  return Boolean(purchaseForMaterial(materialId));
}

async function showOwnedPurchase(video, purchase) {
  try {
    const result = await window.ZhereService.pricing.insight(video.id);
    showPurchaseSuccess(video, { ...purchase, insight: result.insight }, { alreadyOwned: true });
  } catch {
    showPurchaseSuccess(video, purchase, { alreadyOwned: true });
  }
}

function showPurchaseSuccess(video, result, { alreadyOwned = false } = {}) {
  const transaction = result?.transaction || result || {};
  const pricing = result?.pricing || {};
  const price = transaction.transaction_price ?? transaction.bid_price ?? state.bids[video.id]?.lastPrice ?? '—';
  const transactionTime = transaction.transaction_time
    ? new Date(transaction.transaction_time).toLocaleString('zh-CN', { hour12: false })
    : '已记录';
  const insight = result?.insight || null;
  const history = state.pricingPurchases.slice(-5).reverse();
  const insightMarkup = insight?.eligible ? `
    <section class="market-insight" aria-label="成交后的匿名市场反馈">
      <h3>成交后的匿名回看</h3>
      ${insight.cohort ? `<div class="market-range"><div><span>匿名报价范围</span><strong>${insight.cohort.minimum}–${insight.cohort.maximum}</strong></div><div><span>中位数</span><strong>${insight.cohort.median}</strong></div><div><span>匿名样本</span><strong>${insight.sample_count}</strong></div></div><p>这些信息只在你完成独立报价、且有效样本达到 ${insight.minimum_sample} 笔后显示，不含任何用户身份。</p>` : `<div class="status-banner">目前有 ${insight.sample_count}/${insight.minimum_sample} 笔有效匿名样本。为避免少量样本暴露他人判断，暂不显示区间；你的报价已经完整保存。</div>`}
    </section>` : '';
  openSheet(`
    <div class="sheet-inner purchase-success-sheet">
      <div class="purchase-success-mark" aria-hidden="true"><span></span></div>
      <p class="purchase-success-kicker">${alreadyOwned ? '购买记录' : '报价已直接成交'}</p>
      <h2 class="sheet-title" id="sheetTitle" tabindex="-1">${alreadyOwned ? '这段素材已经购入' : '已成功购入'}</h2>
      <p class="purchase-success-lead">《${escapeHtml(video.title)}》${alreadyOwned ? '已在你的购买记录中。' : '已经收入背包，可以立即使用。'}</p>
      <section class="purchase-receipt" aria-label="购买结果">
        <div><span>你的报价</span><strong>${escapeHtml(String(price))}</strong><small>模拟价格单位</small></div>
        <div><span>成交结果</span><strong>已接受</strong><small>${escapeHtml(transactionTime)}</small></div>
        <p>每个账户对同一素材只能购买一次。公共原素材仍保留在世界中，其他用户也可以各自报价购买。</p>
      </section>
      ${insightMarkup}
      <section class="valuation-history"><h3>我的估值足迹</h3><div>${history.map((purchase) => `<span><b>${escapeHtml(findVideoById(purchase.material_id)?.title || purchase.material_id)}</b><small>${escapeHtml(String(purchase.bid_price ?? purchase.transaction_price))} · ${new Date(purchase.transaction_time).toLocaleDateString('zh-CN')}</small></span>`).join('') || '<p>这会是第一条估值记录。</p>'}</div></section>
      <div class="purchase-success-actions">
        <button class="primary-button" id="openPurchasedBag" type="button">打开背包</button>
        <button class="paper-button" id="purchaseBack" type="button">回到视频</button>
      </div>
      <p class="purchase-success-footnote">这是模拟成交，不发生真实支付。研究用基础价格不会作为下一位用户报价前的提示。</p>
    </div>
  `, () => {
    $('#openPurchasedBag').addEventListener('click', showBag);
    $('#purchaseBack').addEventListener('click', () => showVideo(video));
  });
}

function openBidPanel(video) {
  const publicAsset = state.publicAssets.find((asset) => asset.id === video.id);
  if (publicAsset?.owner === 'me') return showToast('发布者不能为自己发布的素材报价');
  const existingPurchase = purchaseForMaterial(video.id);
  if (existingPurchase) return showOwnedPurchase(video, existingPurchase);
  logEvent('bid_enter', { asset_id: video.id });
  openSheet(`
    <div class="sheet-inner bid-sheet">
      <h2 class="sheet-title" id="sheetTitle" tabindex="-1">给《${escapeHtml(video.title)}》一个你自己的价格</h2>
      <p class="sheet-subtitle">没有发布者定价，也没有 NPC 跟价。你提交的完整报价会被系统直接接受，并形成一笔模拟成交；不产生真实支付，也不会扣除现有灵感币。</p>
      <form class="bid-form" id="bidForm" novalidate>
        <label for="bidPrice">你认为这段素材值多少？</label>
        <div class="bid-input-row">
          <input id="bidPrice" name="bidPrice" type="number" min="0.01" step="0.01" inputmode="decimal" autocomplete="off" required aria-describedby="bidPriceHint bidError" placeholder="输入完整报价" />
          <span>模拟价格单位</span>
        </div>
        <p id="bidPriceHint">提交前不会展示其他人的报价或基础价格，避免影响你的独立判断。</p>
        <div class="form-error" id="bidError" role="alert"></div>
        <div class="media-actions">
          <button class="primary-button" id="submitBid" type="submit">确认报价并获得副本</button>
          <button class="text-button" id="bidClose" type="button">回到视频</button>
        </div>
      </form>
      <div class="bid-rule-note">每个账户对同一素材只能报价并购买一次。确认后系统会直接接受，发布者无权干预，也不能重复购买。</div>
    </div>
  `, () => {
    const idempotencyKey = typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : `bid-${Date.now()}-${Math.floor(Math.random() * Number.MAX_SAFE_INTEGER).toString(36)}`;
    $('#bidForm').addEventListener('submit', async (event) => {
      event.preventDefault();
      const input = $('#bidPrice');
      const errorNode = $('#bidError');
      const submit = $('#submitBid');
      const raw = input.value.trim();
      const price = Number(raw);
      if (!/^\d+(?:\.\d{1,2})?$/.test(raw) || !Number.isFinite(price) || price <= 0) {
        errorNode.textContent = '请输入大于 0、最多保留两位小数的完整报价。';
        input.focus();
        return;
      }
      errorNode.textContent = '';
      submit.disabled = true;
      submit.textContent = '正在记录报价…';
      try {
        const result = await window.ZhereService.pricing.submitBid(video.id, price, idempotencyKey);
        const transactionId = result.transaction.transaction_id;
        state.bids[video.id] = {
          bidId: result.bid.bid_id,
          transactionId,
          lastPrice: result.transaction.transaction_price,
          validTransactionCount: result.pricing.valid_transaction_count,
          basePrice: result.pricing.base_price,
          requiredCount: result.base_price_transaction_count,
          submittedAt: result.transaction.transaction_time,
        };
        if (!hasPurchasedMaterial(video.id)) {
          state.pricingPurchases.push({
            ...result.transaction,
            bid_status: result.bid.bid_status,
            base_price: result.pricing.base_price,
            valid_transaction_count: result.pricing.valid_transaction_count,
            base_price_transaction_count: result.base_price_transaction_count,
          });
        }
        if (!state.copies.some((copy) => copy.transactionId === transactionId)) {
          state.copies.push({ assetId: video.id, transactionId, acquiredAt: Date.now() });
        }
        updateCounters();
        await window.ZhereService.saveState(serializableState(), { immediate: true });
        renderBidPlants();
        logEvent('bid_submit', { asset_id: video.id, bid_id: result.bid.bid_id, bid_price: result.bid.bid_price });
        logEvent('bid_accepted', { asset_id: video.id, bid_id: result.bid.bid_id, transaction_id: transactionId, transaction_price: result.transaction.transaction_price });
        logEvent('copy_acquired', { asset_id: video.id, transaction_id: transactionId });
        showPurchaseSuccess(video, result);
        say('报价已经直接成交，副本进了你的口袋。公共原素材仍然留在原地。', '木秋');
      } catch (error) {
        if (error.code === 'material-already-acquired') {
          try {
            const purchases = await window.ZhereService.pricing.purchases();
            applyPricingPurchases(purchases.purchases);
            const purchase = purchaseForMaterial(video.id);
            if (purchase) return showOwnedPurchase(video, purchase);
          } catch {}
          errorNode.textContent = '这段素材已经购入，不能再次报价。请在背包中查看。';
          submit.textContent = '已经购入';
          return;
        }
        errorNode.textContent = `${error.message || '报价暂时没有保存。'} 请保留当前价格并重试。`;
        submit.disabled = false;
        submit.textContent = '重试保存这次报价';
      }
    });
    $('#bidClose').addEventListener('click', () => showVideo(video));
  });
}

function showLinkNote(video) {
  const notes = allWorldNotes();
  openSheet(`
    <div class="sheet-inner">
      <h2 class="sheet-title" id="sheetTitle" tabindex="-1">把《${escapeHtml(video.title)}》连到一张纸条</h2>
      <p class="sheet-subtitle">如果你发现某段视频回应了某个需求，就把它连过去。这会记录为一条需求—素材关系，不会通知任何人。</p>
      <div class="list-stack">
        ${notes.length ? notes.map((note, index) => {
          const linked = linkedVideoIdsForNote(note).includes(video.id);
          return `<div class="list-row"><div><b>${escapeHtml(note.title)}</b><span>${escapeHtml(note.type === 'commerce' ? '模拟商业需求' : '个人需求')} · ${escapeHtml(note.by || '我')}</span></div><button class="${linked ? 'paper-button' : 'text-button'}" data-link="${index}" ${linked ? 'disabled' : ''}>${linked ? '已连接' : '连接'}</button></div>`;
        }).join('') : '<div class="empty-state">公域里还没有展开的纸条。按 N 可以留下一张。</div>'}
      </div>
      <div class="media-actions"><button class="text-button" id="linkBack">回到视频</button></div>
    </div>
  `, () => {
    $$('[data-link]', sheet).forEach((button) => button.addEventListener('click', async () => {
      const note = notes[Number(button.dataset.link)];
      if (state.publicDemands.some((item) => item.id === note.id)) {
        try {
          const result = await window.ZhereService.publicWorld.setDemandLink(note.id, video.id, true);
          Object.assign(note, result.demand);
        } catch (error) { return showToast(error.message || '需求关联保存失败'); }
      }
      linkNoteToVideo(note, video.id);
      persist();
      logEvent('demand_asset_link', { demand_id: note.id, asset_id: video.id });
      closeSheet();
      showToast(`《${video.title}》已连到「${note.title}」`);
    }));
    $('#linkBack').addEventListener('click', () => showVideo(video));
  });
}

function showNoteDetail(note) {
  if (!note) return showToast('这张纸条已经不存在');
  recordJournalEntry('demand', note.id, note.title, { wx: note.wx, wy: note.wy });
  persist();
  const favorite = state.favorites.some((entry) => entry.type === 'demand' && entry.id === note.id);
  const own = note.owner === 'me' || state.notes.some((item) => item.id === note.id);
  const closed = note.status === 'closed';
  const refVideo = findVideoById(note.refAsset);
  const linkedVideos = linkedVideoIdsForNote(note).map(findVideoById).filter(Boolean);
  const responseCandidates = responseVideoCandidates(note);
  const noteResponses = responsesForNote(note);
  openSheet(`
    <div class="sheet-inner">
      <h2 class="sheet-title" id="sheetTitle" tabindex="-1">${escapeHtml(note.title)}</h2>
      <p class="sheet-subtitle">${note.type === 'commerce' ? '模拟商业需求' : '个人需求'} · 发布人 ${escapeHtml(note.by || state.profile.nickname)} · ${escapeHtml(zoneAt(note.wx, note.wy).name)}${note.createdAt ? ' · ' + escapeHtml(note.createdAt) : ''} · ${closed ? '已关闭' : '开放回应'}</p>
      ${own ? `<div class="demand-owner-actions"><button class="paper-button" id="editDemand" type="button">修改纸条</button><button class="paper-button" id="toggleDemandStatus" type="button">${closed ? '重新开放' : '关闭需求'}</button>${state.publicDemands.some((item) => item.id === note.id) ? `<button class="paper-button" id="toggleDemandArchive" type="button">${note.archived ? '恢复到地图' : '收进档案'}</button>` : ''}<button class="danger-button" id="deleteDemand" type="button">删除</button></div>` : state.publicDemands.some((item) => item.id === note.id) ? '<div class="demand-owner-actions"><button class="text-button" id="reportDemand" type="button">举报这张需求</button></div>' : ''}
      ${note.description ? `<div class="status-banner">${escapeHtml(note.description)}</div>` : ''}
      ${note.type === 'commerce' ? `<div class="commerce-summary"><div><span>项目</span><b>${escapeHtml(note.projectName || '未填写')}</b></div><div><span>受众</span><b>${escapeHtml(note.audience || '未填写')}</b></div><div><span>规格</span><b>${escapeHtml(note.format || '未填写')}</b></div><div><span>数量</span><b>${escapeHtml(note.quantity || 1)} 段</b></div><div><span>虚拟预算</span><b>${escapeHtml(note.budget || 0)} 灵感币</b></div><div><span>截止</span><b>${escapeHtml(note.deadline || '开放')}</b></div></div><div class="danger-zone"><b>模拟说明</b><p>此需求不形成真实合同、支付或授权。所有金额都是灵感币虚拟预算。</p></div>` : ''}
      ${refVideo ? `<div class="meta-chips"><span class="chip">参考视频 · ${escapeHtml(refVideo.title)}</span><button class="text-button" id="openRef">去看参考视频</button></div>` : ''}
      <div class="note-section relation-section"><h3>关联视频 ${linkedVideos.length}</h3>
        <div class="relation-list">${linkedVideos.length ? linkedVideos.map((video) => `<button class="relation-row" type="button" data-linked-video="${escapeHtml(video.id)}"><span>视频</span><b>${escapeHtml(video.title)}</b><small>打开播放</small></button>`).join('') : '<div class="empty-state">还没有视频与这张需求相连。回应时可以直接选择一段。</div>'}</div>
      </div>
      <div class="note-section"><h3>回应 ${noteResponses.length}</h3>
        <div class="comment-list">${noteResponses.length ? noteResponses.map((response) => `<div class="comment relation-comment"><b>${escapeHtml(response.name)}</b>${response.text ? `<span>${escapeHtml(response.text)}</span>` : '<span>用一段视频作出了回应</span>'}${response.assetId ? `<button class="relation-inline" type="button" data-response-video="${escapeHtml(response.assetId)}">▶ ${escapeHtml(response.assetTitle || '打开回应视频')}</button>` : ''}<div class="comment-actions">${response.owner === 'me' ? `<button class="text-button" type="button" data-edit-response="${escapeHtml(response.id)}">修改</button><button class="text-button" type="button" data-delete-response="${escapeHtml(response.id)}">删除</button>` : response.id ? `<button class="text-button" type="button" data-report-response="${escapeHtml(response.id)}">举报</button>` : ''}</div></div>`).join('') : '<div class="empty-state">还没有回应。你可以选择视频回应，也可以只留下文字。</div>'}</div>
      </div>
      ${closed ? '<div class="note-section"><div class="empty-state">这张需求已经关闭，历史回应和素材关系仍然可查看。</div></div>' : `<form class="note-section" id="noteResponseForm">
        <h3>用你的素材回应</h3>
        <label>选择回应视频
          <select name="responseAsset">
            <option value="">不附视频，只写文字</option>
            ${responseCandidates.map((video) => `<option value="${escapeHtml(video.id)}">${state.published.some((item) => item.id === video.id) || video.owner === 'me' ? '我发布的 · ' : state.copies.some((copy) => copy.assetId === video.id) ? '我的副本 · ' : '公共视频 · '}${escapeHtml(video.title)}</option>`).join('')}
          </select>
        </label>
        <p class="field-help">优先显示你发布、拥有、看过或离需求较近的视频。关联后双方页面都能互相打开。</p>
        <label>补充说明<textarea name="response" rows="3" placeholder="为什么这段视频合适，或你还能提供什么"></textarea></label>
        <p class="form-error" id="noteResponseError" role="alert"></p>
        <div class="media-actions">
          <button class="primary-button" type="submit">提交视频回应</button>
          <button class="paper-button" id="noteFavoriteButton" type="button">${favorite ? '已收藏' : '收藏纸条'}</button>
        </div>
      </form>`}
    </div>
  `, () => {
    $('#noteResponseForm')?.addEventListener('submit', async (event) => {
      event.preventDefault();
      const form = event.currentTarget;
      const submit = form.querySelector('[type="submit"]');
      const text = event.currentTarget.elements.response.value.trim();
      const assetId = event.currentTarget.elements.responseAsset.value;
      const responseVideo = findVideoById(assetId);
      if (!text && !responseVideo) return $('#noteResponseError').textContent = '请选择一段视频，或写下回应内容。';
      const isPublicDemand = state.publicDemands.some((item) => item.id === note.id);
      if (isPublicDemand) {
        setPendingButton(submit, true, '正在贴上回应…');
        form.elements.response.readOnly = true;
        form.elements.responseAsset.disabled = true;
        try {
          const result = await window.ZhereService.publicWorld.respondToDemand(note.id, {
            text, assetId: responseVideo?.id || null, assetTitle: responseVideo?.title || '',
          });
          note.responses = [...(note.responses || []), result.response];
        } catch (error) {
          form.elements.response.readOnly = false;
          form.elements.responseAsset.disabled = false;
          setPendingButton(submit, false);
          return $('#noteResponseError').textContent = error.message || '回应提交失败，请稍后重试。';
        }
      } else {
        state.noteResponses = state.noteResponses || {};
        state.noteResponses[note.id] = [...(state.noteResponses[note.id] || []), { name: state.profile.nickname || '路过的风', text, assetId: responseVideo?.id || null, assetTitle: responseVideo?.title || '', at: fmtNow() }];
        if (responseVideo) linkNoteToVideo(note, responseVideo.id);
        persist();
      }
      logEvent('demand_response', { demand_id: note.id, asset_id: responseVideo?.id || null, length: text.length });
      advanceOnboarding('response', { demandId: note.id, assetId: responseVideo?.id || null });
      showNoteDetail(note);
      showToast(responseVideo ? `《${responseVideo.title}》已作为回应贴在纸条上` : '文字回应贴在了纸条上');
    });
    $('#noteFavoriteButton')?.addEventListener('click', () => {
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
    $('#editDemand')?.addEventListener('click', () => showLeaveNote(refVideo, note));
    $('#reportDemand')?.addEventListener('click', () => showReportTarget('demand', note.id, () => showNoteDetail(note)));
    $('#toggleDemandStatus')?.addEventListener('click', async () => {
      const nextStatus = closed ? 'open' : 'closed';
      if (state.publicDemands.some((item) => item.id === note.id)) {
        try {
          const result = await window.ZhereService.publicWorld.updateDemand(note.id, { status: nextStatus });
          Object.assign(note, result.demand);
        } catch (error) { return showToast(error.message || '需求状态保存失败'); }
      } else note.status = nextStatus;
      logEvent(note.status === 'closed' ? 'demand_close' : 'demand_reopen', { demand_id: note.id });
      persist();
      renderCreations();
      showNoteDetail(note);
      showToast(note.status === 'closed' ? '需求已关闭，历史关系仍保留' : '需求已重新开放');
    });
    $('#toggleDemandArchive')?.addEventListener('click', async () => {
      try {
        const result = await window.ZhereService.publicWorld.updateDemand(note.id, { archived: !note.archived });
        Object.assign(note, result.demand); renderCreations(); renderWorld(); showNoteDetail(note);
        showToast(note.archived ? '需求已收进档案，已有回应仍保留' : '需求已经恢复到公共地图');
      } catch (error) { showToast(error.message || '归档状态保存失败'); }
    });
    $('#deleteDemand')?.addEventListener('click', () => confirmDemandDelete(note));
    $$('[data-edit-response]', sheet).forEach((button) => button.addEventListener('click', () => {
      const response = noteResponses.find((item) => item.id === button.dataset.editResponse);
      if (response) showEditDemandResponse(note, response);
    }));
    $$('[data-delete-response]', sheet).forEach((button) => button.addEventListener('click', async () => {
      try { await window.ZhereService.publicWorld.deleteDemandResponse(note.id, button.dataset.deleteResponse); }
      catch (error) { return showToast(error.message || '回应删除失败'); }
      note.responses = (note.responses || []).filter((item) => item.id !== button.dataset.deleteResponse);
      showNoteDetail(note); showToast('回应已删除');
    }));
    $$('[data-report-response]', sheet).forEach((button) => button.addEventListener('click', () => showReportTarget('response', button.dataset.reportResponse, () => showNoteDetail(note))));
    $$('[data-linked-video], [data-response-video]', sheet).forEach((button) => button.addEventListener('click', () => {
      const videoId = button.dataset.linkedVideo || button.dataset.responseVideo;
      const video = findVideoById(videoId);
      if (video) showVideo(video);
    }));
  });
}

function showEditDemandResponse(note, response) {
  openSheet(`
    <div class="sheet-inner"><h2 class="sheet-title" id="sheetTitle" tabindex="-1">修改我的回应</h2><form id="editDemandResponseForm"><label>回应内容<textarea name="text" rows="4" maxlength="500">${escapeHtml(response.text || '')}</textarea></label><p class="form-error" id="editDemandResponseError" role="alert"></p><div class="media-actions"><button class="primary-button" type="submit">保存回应</button><button class="paper-button" id="editDemandResponseBack" type="button">返回需求</button></div></form></div>
  `, () => {
    $('#editDemandResponseBack').addEventListener('click', () => showNoteDetail(note));
    $('#editDemandResponseForm').addEventListener('submit', async (event) => {
      event.preventDefault();
      const submit = event.currentTarget.querySelector('[type="submit"]');
      const text = event.currentTarget.elements.text.value.trim();
      setPendingButton(submit, true, '正在保存回应…');
      try {
        const result = await window.ZhereService.publicWorld.updateDemandResponse(note.id, response.id, { text });
        Object.assign(response, result.response); showNoteDetail(note); showToast('回应已更新');
      } catch (error) { setPendingButton(submit, false); $('#editDemandResponseError').textContent = error.message || '回应修改失败。'; }
    });
  });
}

function confirmDemandDelete(note) {
  openSheet(`
    <div class="sheet-inner confirm-sheet">
      <h2 class="sheet-title" id="sheetTitle" tabindex="-1">删除这张需求？</h2>
      <p class="sheet-subtitle">《${escapeHtml(note.title)}》会从地图和公告树消失。已有素材本身不会删除，但这张纸条上的回应与关联会一并移除。</p>
      <div class="danger-zone"><b>此操作无法在当前原型中撤销</b><p>如果只是暂时不再接收回应，建议返回并选择“关闭需求”。</p></div>
      <div class="media-actions"><button class="danger-button" id="confirmDeleteDemand" type="button">确认删除</button><button class="paper-button" id="cancelDeleteDemand" type="button">返回纸条</button></div>
    </div>
  `, () => {
    $('#cancelDeleteDemand').addEventListener('click', () => showNoteDetail(note));
    $('#confirmDeleteDemand').addEventListener('click', async () => {
      if (state.publicDemands.some((item) => item.id === note.id)) {
        try { await window.ZhereService.publicWorld.deleteDemand(note.id); }
        catch (error) { return showToast(error.message || '需求删除失败'); }
        state.publicDemands = state.publicDemands.filter((item) => item.id !== note.id);
      }
      state.notes = state.notes.filter((item) => item.id !== note.id);
      delete state.noteLinks[note.id];
      delete state.noteResponses[note.id];
      state.favorites = state.favorites.filter((entry) => !(entry.type === 'demand' && entry.id === note.id));
      logEvent('demand_delete', { demand_id: note.id });
      persist();
      closeSheet();
      renderCreations();
      renderWorld();
      updateCounters();
      showToast('需求已删除');
    });
  });
}

function showLeaveNote(referenceVideo = null, record = null) {
  const isPublished = !!record && (state.notes.some((note) => note.id === record.id) || state.publicDemands.some((note) => note.id === record.id && note.owner === 'me'));
  const isPublicRecord = !!record && state.publicDemands.some((note) => note.id === record.id);
  const initialType = record?.type || 'personal';
  openSheet(`
    <div class="sheet-inner">
      <h2 class="sheet-title" id="sheetTitle" tabindex="-1">${isPublished ? '修改需求纸条' : record ? '继续编辑草稿' : '在这里留一张纸条'}</h2>
      <p class="sheet-subtitle">${isPublished ? '修改后纸条仍留在原来的位置，已有回应和素材关联不会消失。' : `你正站在${currentZoneName()}。发布后纸条会出现在当前位置附近；保存草稿则不会出现在公共世界。`}${referenceVideo ? ` 这张纸条会引用《${escapeHtml(referenceVideo.title)}》。` : ''}</p>
      <form id="leaveNoteForm">
        <label>类型
          <span class="option-row">
            <label><input type="radio" name="noteType" value="personal" ${initialType === 'personal' ? 'checked' : ''} /> 个人需求</label>
            <label><input type="radio" name="noteType" value="commerce" ${initialType === 'commerce' ? 'checked' : ''} /> 模拟商业需求</label>
          </span>
        </label>
        <label>需求标题<input name="title" required maxlength="48" value="${escapeHtml(record?.title || '')}" placeholder="想找一段……" /></label>
        <label>补充说明<textarea name="description" rows="3" maxlength="360" placeholder="希望看到什么、会如何使用、哪些内容不要出现">${escapeHtml(record?.description || '')}</textarea></label>
        <fieldset class="commerce-fields" id="commerceFields" ${initialType === 'commerce' ? '' : 'hidden'}>
          <legend>模拟商业需求信息</legend>
          <div class="field-grid">
            <label>项目或品牌<input name="projectName" maxlength="48" value="${escapeHtml(record?.projectName || '')}" placeholder="例如：北巷宠物铺春季短片" /></label>
            <label>目标受众<input name="audience" maxlength="48" value="${escapeHtml(record?.audience || '')}" placeholder="例如：养猫的新手家庭" /></label>
            <label>视频规格<input name="format" maxlength="48" value="${escapeHtml(record?.format || '')}" placeholder="例如：9:16，15–30 秒" /></label>
            <label>需要数量<input name="quantity" type="number" min="1" max="99" value="${escapeHtml(record?.quantity || 1)}" /></label>
            <label>虚拟预算<input name="budget" type="number" min="0" max="9999" value="${escapeHtml(record?.budget || '')}" placeholder="灵感币" /></label>
            <label>截止日期<input name="deadline" type="date" value="${escapeHtml(record?.deadline || '')}" /></label>
          </div>
          <p class="field-help">这里不产生真实合同、支付或授权；预算仅用于原型中的灵感币协作。</p>
        </fieldset>
        <p class="form-error" id="leaveNoteError" role="alert"></p>
        <div class="media-actions">
          <button class="primary-button" type="submit">${isPublished ? '保存修改' : '发布到当前位置'}</button>
          ${isPublished ? '' : '<button class="paper-button" id="saveDemandDraft" type="button">保存草稿</button>'}
        </div>
      </form>
    </div>
  `, () => {
    const form = $('#leaveNoteForm');
    const fields = $('#commerceFields');
    const error = $('#leaveNoteError');
    const toggleCommerce = () => { fields.hidden = form.elements.noteType.value !== 'commerce'; error.textContent = ''; };
    $$('input[name="noteType"]', form).forEach((input) => input.addEventListener('change', toggleCommerce));
    const collect = () => ({
      id: record?.id || `n-${Date.now()}`,
      title: form.elements.title.value.trim(),
      description: form.elements.description.value.trim(),
      type: form.elements.noteType.value,
      projectName: form.elements.projectName.value.trim(),
      audience: form.elements.audience.value.trim(),
      format: form.elements.format.value.trim(),
      quantity: Math.max(1, Number(form.elements.quantity.value) || 1),
      budget: Math.max(0, Number(form.elements.budget.value) || 0),
      deadline: form.elements.deadline.value,
    });
    const validate = (payload) => {
      if (!payload.title) return '请填写需求标题。';
      if (payload.type === 'commerce' && !payload.projectName) return '模拟商业需求需要填写项目或品牌。';
      if (payload.type === 'commerce' && payload.budget <= 0) return '请填写大于 0 的虚拟预算。';
      return '';
    };
    $('#saveDemandDraft')?.addEventListener('click', () => {
      const payload = collect();
      if (!payload.title) return error.textContent = '至少填写标题后才能保存草稿。';
      const draft = { ...payload, id: record?.id || `draft-${Date.now()}`, refAsset: referenceVideo?.id || record?.refAsset || null, updatedAt: fmtNow() };
      const existing = state.demandDrafts.findIndex((item) => item.id === draft.id);
      if (existing >= 0) state.demandDrafts[existing] = draft; else state.demandDrafts.push(draft);
      logEvent('demand_draft_save', { draft_id: draft.id, demand_type: draft.type });
      persist();
      closeSheet();
      showToast('需求草稿已保存，可在公告树继续编辑');
    });
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      const payload = collect();
      const message = validate(payload);
      if (message) return error.textContent = message;
      const noteSpot = isPublished ? { wx: record.wx, wy: record.wy } : findOpenWorldSpot(state.wx, state.wy);
      const note = {
        ...(isPublished ? record : {}),
        ...payload,
        id: isPublished ? record.id : `n-${Date.now()}`,
        by: state.profile.nickname || '路过的风',
        owner: 'me',
        status: record?.status || 'open',
        wx: noteSpot.wx,
        wy: noteSpot.wy,
        zone: isPublished ? record.zone : zoneAt(state.wx, state.wy).id,
        refAsset: referenceVideo?.id || record?.refAsset || null,
        responses: record?.responses || [],
        createdAt: record?.createdAt || '刚刚',
        updatedAt: fmtNow(),
      };
      let publicDemand;
      try {
        const result = isPublicRecord
          ? await window.ZhereService.publicWorld.updateDemand(note.id, note)
          : await window.ZhereService.publicWorld.createDemand(note);
        publicDemand = result.demand;
      } catch (serviceError) {
        return error.textContent = serviceError.message || '公共需求发布失败，请稍后重试。';
      }
      state.publicDemands = [...state.publicDemands.filter((item) => item.id !== publicDemand.id), publicDemand];
      state.notes = state.notes.filter((item) => item.id !== publicDemand.id);
      state.demandDrafts = state.demandDrafts.filter((draft) => draft.id !== record?.id);
      logEvent(isPublished ? 'demand_update' : 'publish_demand', { demand_id: publicDemand.id, demand_type: publicDemand.type, zone_id: publicDemand.zone });
      if (referenceVideo && !isPublished) logEvent('demand_asset_link', { demand_id: note.id, asset_id: referenceVideo.id, auto: true });
      persist();
      closeSheet();
      renderCreations();
      renderWorld();
      say(isPublished ? '纸条上的内容已经更新，原来的回应仍在。' : `纸条钉在了${currentZoneName()}。想知道写了什么的人，自然会走过来。`);
      showToast(isPublished ? '需求已更新' : '纸条已出现在当前位置附近');
    });
  });
}

function showBoard() {
  const allNotes = allWorldNotes().map((note) => note.id.startsWith('sys-') ? { status: 'open', owner: 'system', ...note } : note);
  let activeTab = 'all';
  openSheet(`
    <div class="sheet-inner">
      <h2 class="sheet-title" id="sheetTitle" tabindex="-1">公告树</h2>
      <p class="sheet-subtitle">寻找公开需求，也管理自己的纸条与草稿。关闭需求不会删除已有回应，素材关系会继续保留。</p>
      <div class="board-tabs" role="tablist" aria-label="公告树分类">
        <button class="board-tab is-active" role="tab" aria-selected="true" data-board-tab="all">开放需求</button>
        <button class="board-tab" role="tab" aria-selected="false" data-board-tab="mine">我的需求</button>
        <button class="board-tab" role="tab" aria-selected="false" data-board-tab="drafts">草稿 ${state.demandDrafts.length}</button>
        <button class="board-tab" role="tab" aria-selected="false" data-board-tab="closed">已关闭</button>
        <button class="board-tab" role="tab" aria-selected="false" data-board-tab="archive">旧档案</button>
        <button class="board-tab" role="tab" aria-selected="false" data-board-tab="media">素材库</button>
      </div>
      <label class="search-box">搜索纸条或视频
        <input id="boardSearch" placeholder="例如：海、猫、咖啡" />
      </label>
      <div class="board-summary" id="boardSummary"></div>
      <div class="list-stack" id="boardResults"></div>
      <div class="media-actions"><button class="primary-button" id="boardNewDemand">在当前位置发布需求</button></div>
    </div>
  `, () => {
    const render = () => {
      const box = $('#boardResults', sheet);
      const query = ($('#boardSearch', sheet).value || '').trim().toLowerCase();
      const rows = [];
      if (activeTab === 'drafts') {
        state.demandDrafts.forEach((draft) => {
          if (query && !`${draft.title}${draft.description || ''}`.toLowerCase().includes(query)) return;
          rows.push(`<div class="list-row"><div><b>${escapeHtml(draft.title)}</b><span>草稿 · ${draft.type === 'commerce' ? '模拟商业需求' : '个人需求'} · ${escapeHtml(draft.updatedAt || '')}</span></div><div class="row-actions"><button class="text-button" data-edit-draft="${escapeHtml(draft.id)}">继续编辑</button><button class="text-button" data-delete-draft="${escapeHtml(draft.id)}">删除</button></div></div>`);
        });
      } else if (activeTab === 'media') {
        allAssets().forEach((video) => {
          if (query && !`${video.title}${(video.tags || []).join('')}`.toLowerCase().includes(query)) return;
          rows.push(`<div class="list-row"><div><b>${escapeHtml(video.title)}</b><span>公共素材 · ${escapeHtml(video.freshnessLabel || '世界档案')}${video.archived ? ' · 已从地图收起' : ` · ${escapeHtml(videoLocationLabel(video))}${video.catalogOnly ? ' · 今日未摆放' : ''}`}</span></div><div class="row-actions"><button class="text-button" data-open-video="${escapeHtml(video.id)}">打开</button>${video.catalogOnly || video.archived ? '' : `<button class="text-button" data-goto-video="${escapeHtml(video.id)}">定位</button>`}</div></div>`);
        });
      } else {
        allNotes.filter((note) => {
          if (activeTab === 'all') return note.status !== 'closed' && !note.archived;
          if (activeTab === 'mine') return note.owner === 'me' && note.status !== 'closed' && !note.archived;
          if (activeTab === 'archive') return note.archived;
          return note.owner === 'me' && note.status === 'closed' && !note.archived;
        }).forEach((note) => {
          if (query && !`${note.title}${note.description || ''}${note.projectName || ''}`.toLowerCase().includes(query)) return;
          rows.push(`<div class="list-row"><div><b>${escapeHtml(note.title)}</b><span>${note.type === 'commerce' ? '模拟商业需求' : '个人需求'} · ${escapeHtml(note.by || '我')} · ${escapeHtml(note.freshnessLabel || zoneAt(note.wx, note.wy).name)} · ${note.archived ? '已归档' : note.status === 'closed' ? '已关闭' : `${responsesForNote(note).length} 个回应`}</span></div><div class="row-actions"><button class="text-button" data-open-note="${escapeHtml(note.id)}">打开</button>${note.archived ? '' : `<button class="text-button" data-goto-note="${escapeHtml(note.id)}">定位</button>`}</div></div>`);
        });
      }
      $('#boardSummary').textContent = `${rows.length} 条结果 · ${activeTab === 'drafts' ? '草稿不会公开' : activeTab === 'media' ? '素材关系不会随每日地图轮换消失' : '任何公开需求都可以忽略'}`;
      box.innerHTML = rows.length ? rows.join('') : '<div class="empty-state">没有匹配的纸条或视频。</div>';
      $$('[data-open-note]', box).forEach((button) => button.addEventListener('click', () => showNoteDetail(allNotes.find((note) => note.id === button.dataset.openNote))));
      $$('[data-goto-note]', box).forEach((button) => button.addEventListener('click', () => {
        const note = allNotes.find((candidate) => candidate.id === button.dataset.gotoNote);
        state.wx = note.wx;
        state.wy = note.wy + 84;
        closeSheet();
        renderWorld();
        showToast('已在纸条旁');
      }));
      $$('[data-open-video]', box).forEach((button) => button.addEventListener('click', () => showVideo(findVideoById(button.dataset.openVideo))));
      $$('[data-goto-video]', box).forEach((button) => button.addEventListener('click', () => {
        const video = findVideoById(button.dataset.gotoVideo);
        if (!video) return;
        state.wx = video.wx;
        state.wy = video.wy + 84;
        closeSheet();
        renderWorld();
        setTimeout(() => showVideo(video), 80);
      }));
      $$('[data-edit-draft]', box).forEach((button) => button.addEventListener('click', () => {
        const draft = state.demandDrafts.find((item) => item.id === button.dataset.editDraft);
        showLeaveNote(findVideoById(draft?.refAsset), draft);
      }));
      $$('[data-delete-draft]', box).forEach((button) => button.addEventListener('click', () => {
        state.demandDrafts = state.demandDrafts.filter((item) => item.id !== button.dataset.deleteDraft);
        persist();
        render();
        showToast('草稿已删除');
      }));
    };
    $$('[data-board-tab]', sheet).forEach((button) => button.addEventListener('click', () => {
      activeTab = button.dataset.boardTab;
      $$('[data-board-tab]', sheet).forEach((tab) => { const active = tab === button; tab.classList.toggle('is-active', active); tab.setAttribute('aria-selected', String(active)); });
      render();
    }));
    $('#boardSearch').addEventListener('input', render);
    $('#boardNewDemand').addEventListener('click', () => showLeaveNote());
    render();
  });
}

function showPublishAnywhere() {
  if (state.worldMode === 'cottage') {
    openSheet(`
      <div class="sheet-inner publish-sheet">
        <h2 class="sheet-title" id="sheetTitle" tabindex="-1">公共内容要留在公域</h2>
        <p class="sheet-subtitle">这里是你的私人地块。沿左侧小径回到公域后，走到任何位置都能发布视频或需求。</p>
        <div class="media-actions"><button class="primary-button" id="publishExitHome">沿小径回公域发布</button></div>
      </div>
    `, () => $('#publishExitHome').addEventListener('click', () => { closeSheet(); exitCottage(); setTimeout(showPublishAnywhere, 120); }));
    return;
  }
  const referenceVideo = state.nearest?.type === 'video' ? state.nearest.video : null;
  openSheet(`
    <div class="sheet-inner publish-sheet">
      <h2 class="sheet-title" id="sheetTitle" tabindex="-1">随地发布</h2>
      <p class="sheet-subtitle">你正站在${escapeHtml(currentZoneName())}。发布内容会落在当前位置附近的空位，不需要先去固定建筑。${referenceVideo ? `这里靠近《${escapeHtml(referenceVideo.title)}》，新需求会自动引用它。` : ''}</p>
      <div class="publish-choice-row">
        <button class="publish-choice is-active" type="button" aria-pressed="true"><span class="publish-choice-icon video-choice-icon" aria-hidden="true"></span><b>发布视频</b><small>上传新素材，或从背包选择</small></button>
        <button class="publish-choice" id="publishDemandHere" type="button" aria-pressed="false"><span class="publish-choice-icon note-choice-icon" aria-hidden="true"></span><b>发布需求</b><small>在当前位置留下一张公开纸条</small></button>
      </div>
      <form class="quick-upload-form" id="quickUploadForm">
        <h3>上传并直接发布</h3>
        <div class="field-grid">
          <label>视频标题<input name="title" required maxlength="48" placeholder="给这段素材一个名字" /></label>
          <label>视频文件（必需）<input name="file" type="file" accept="video/*" required /><span class="field-help">公开视频必须包含可播放文件，单个文件不超过 20MB。</span></label>
        </div>
        <label>一句话说明<input name="description" maxlength="80" placeholder="希望别人从什么角度看它" /></label>
        <p class="form-error" id="quickUploadError" role="alert"></p>
        <button class="primary-button" type="submit">上传并发布到当前位置</button>
      </form>
      <div class="note-section"><h3>从背包发布</h3>
        <div class="list-stack">${state.bag.length ? state.bag.map((item, index) => `<div class="list-row"><div><b>${escapeHtml(item.title)}</b><span>${escapeHtml(item.description || item.fileName || '视频素材')}</span></div><button class="paper-button" type="button" data-quick-publish="${index}">发布在这里</button></div>`).join('') : '<div class="empty-state">背包里没有待发布视频。可以直接用上面的表单上传并发布。</div>'}</div>
      </div>
    </div>
  `, () => {
    $('#publishDemandHere').addEventListener('click', () => showLeaveNote(referenceVideo));
    $$('[data-quick-publish]', sheet).forEach((button) => button.addEventListener('click', () => publishBagItem(Number(button.dataset.quickPublish))));
    $('#quickUploadForm').addEventListener('submit', async (event) => {
      event.preventDefault();
      const form = event.currentTarget;
      const title = form.elements.title.value.trim();
      if (!title) return $('#quickUploadError').textContent = '请填写视频标题。';
      const file = form.elements.file.files?.[0] || null;
      if (!file) return $('#quickUploadError').textContent = '请选择要发布的视频文件。没有文件的想法可以改为发布需求纸条。';
      const fileError = validateMediaFile(file);
      if (fileError) return $('#quickUploadError').textContent = fileError;
      const submit = form.querySelector('[type="submit"]');
      submit.disabled = true;
      submit.textContent = '正在保存素材…';
      const id = `u-${Date.now()}`;
      const description = form.elements.description.value.trim();
      let uploaded = null;
      try { uploaded = await saveUploadFile(id, file, { title, description }); }
      catch (error) {
        submit.disabled = false;
        submit.textContent = '上传并发布到当前位置';
        return $('#quickUploadError').textContent = error.message || '视频上传失败，请稍后重试。';
      }
      state.bag.push({ id, title, description, fileName: file.name, mime: file.type, status: 'stored-server', mediaUrl: uploaded?.asset?.mediaUrl || '' });
      const index = state.bag.length - 1;
      persist();
      logEvent('upload_to_bag', { title, source: 'publish_anywhere' });
      publishBagItem(index);
    });
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
        <label>视频文件（必需）<input name="file" type="file" accept="video/*" required /><span class="field-help">支持浏览器可播放的视频格式，单个文件不超过 20MB。</span></label>
        <p class="form-error" id="uploadError"></p>
        <button class="primary-button" type="submit">放进背包</button>
      </form>
      <div class="note-section"><h3>背包里现有的素材</h3>
        <div class="list-stack">${state.bag.length ? state.bag.map((item, index) => `<div class="list-row"><div><b>${escapeHtml(item.title)}</b><span>${escapeHtml(item.fileName || '视频素材')}</span></div><button class="text-button" data-publish-at="${index}">发布到当前位置</button></div>`).join('') : '<div class="empty-state">还没有上传视频文件。</div>'}</div>
      </div>
    </div>
  `, () => {
    $('#uploadForm').addEventListener('submit', async (event) => {
      event.preventDefault();
      const form = event.currentTarget;
      const title = form.elements.title.value.trim();
      if (!title) return $('#uploadError').textContent = '请填写标题。';
      const file = form.elements.file.files?.[0] || null;
      if (!file) return $('#uploadError').textContent = '请选择视频文件后再放进背包。';
      const fileError = validateMediaFile(file);
      if (fileError) return $('#uploadError').textContent = fileError;
      const submit = form.querySelector('[type="submit"]');
      submit.disabled = true;
      submit.textContent = '正在放进背包…';
      const id = `u-${Date.now()}`;
      const description = form.elements.description.value.trim();
      let uploaded = null;
      try { uploaded = await saveUploadFile(id, file, { title, description }); }
      catch (error) {
        submit.disabled = false;
        submit.textContent = '放进背包';
        return $('#uploadError').textContent = error.message || '视频上传失败，请稍后重试。';
      }
      state.bag.push({ id, title, description, fileName: file.name, mime: file.type, status: 'stored-server', mediaUrl: uploaded?.asset?.mediaUrl || '' });
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
        <div class="list-stack">${state.bag.length ? state.bag.map((item, index) => `<div class="list-row"><div><b>${escapeHtml(item.title)}</b><span>${escapeHtml(item.description || item.fileName || '视频素材')}</span></div><button class="text-button" data-bag-publish="${index}">发布到当前位置</button></div>`).join('') : '<div class="empty-state">背包空着。到共创台或在公域中按 P 上传真实视频文件。</div>'}</div>
      </div>
      <div class="note-section"><h3>副本口袋（${state.copies.length}）</h3>
        <div class="list-stack">${state.copies.length ? state.copies.map((copy, index) => {
          const video = findVideoById(copy.assetId);
          return `<div class="list-row"><div><b>${escapeHtml(video ? video.title : '一段副本')}</b><span>竞价获得 · ${new Date(copy.acquiredAt).toLocaleDateString('zh-CN')}</span></div><button class="text-button" data-copy-goto="${index}">去小窝摆放</button></div>`;
        }).join('') : '<div class="empty-state">视频旁按 G 参与虚拟竞价，赢了才能获得副本。</div>'}</div>
      </div>
      ${state.pocketWords.length ? `<div class="note-section"><h3>口袋里捡的话</h3><div class="comment-list">${state.pocketWords.slice(-3).map((word) => `<div class="comment">${escapeHtml(word)}</div>`).join('')}</div></div>` : ''}
    </div>
  `, () => {
    $$('[data-bag-publish]', sheet).forEach((button) => button.addEventListener('click', () => publishBagItem(Number(button.dataset.bagPublish))));
    $$('[data-copy-goto]', sheet).forEach((button) => button.addEventListener('click', () => {
      const copy = state.copies[Number(button.dataset.copyGoto)];
      if (!copy) return showToast('这枚副本已经不在口袋里了');
      state.pendingCopyPlacement = {
        assetId: copy.assetId,
        transactionId: copy.transactionId || '',
        acquiredAt: copy.acquiredAt || 0,
      };
      closeSheet();
      goToHomestead({ openPlacement: true });
    }));
  });
}

async function publishBagItem(index) {
  const item = state.bag[index];
  if (!item) return;
  if (item.status !== 'stored-server' || !item.mime?.startsWith('video/')) return showToast('这条背包记录没有可播放文件，不能作为公开视频发布');
  const publishId = item.id && item.id.startsWith('u-') ? item.id : `p-${Date.now()}`;
  const zone = zoneAt(state.wx, state.wy);
  let context = zone.name;
  const nearVideo = allVideos().find((video) => Math.hypot(state.wx - video.wx, state.wy - video.wy) < 420);
  if (nearVideo) context = `靠近《${nearVideo.title}》`;
  const publishSpot = findOpenWorldSpot(state.wx, state.wy);
  let result;
  try {
    result = await window.ZhereService.publicWorld.publishAsset({
      id: publishId, title: item.title, description: item.description || '', mime: item.mime || '',
      wx: publishSpot.wx, wy: publishSpot.wy, zone: zone.id,
    });
  } catch (error) {
    return showToast(error.message || '公共素材发布失败，请稍后重试');
  }
  state.bag.splice(index, 1);
  state.publicAssets = [...state.publicAssets.filter((asset) => asset.id !== result.asset.id), result.asset];
  state.published = state.published.filter((asset) => asset.id !== result.asset.id);
  persist();
  logEvent('publish_asset', { asset_id: publishId, asset_world_position: { wx: Math.round(publishSpot.wx), wy: Math.round(publishSpot.wy) }, asset_zone: zone.id, publish_context: context, publish_timestamp: new Date().toISOString() });
  closeSheet();
  renderScreens();
  renderWorld();
  say(`《${item.title}》落在了${zone.name}，成了公共世界的一部分。`, '木秋');
  showToast('素材已发布到世界');
}

function enterCottage() {
  cancelPointerMove('space_enter');
  cottageExitPending = false;
  state.worldMode = 'cottage';
  worldStage.classList.add('is-cottage');
  worldArt.hidden = true;
  homesteadLayer.hidden = false;
  cottageExit.hidden = false;
  zoneName.textContent = currentZoneName();
  renderPlaced();
  renderHomestead();
  state.nearest = null;
  updateNearby();
  persist();
  logEvent('space_enter', { space: 'personal' });
  say(`这里是${state.profile.spaceName || '你的小窝'}。清地、种植和建造都会留在这里；公共世界不会因为采集而被你占有。`, '木秋', [
    { label: onboardingActive() && state.onboarding.step === 4 ? '搭建露天工作台' : '打开建设簿', handler: showHomesteadPanel },
    { label: '布置视频副本', handler: showPersonalSpace },
  ]);
}

function goToHomestead(options = {}) {
  const openPlacement = options?.openPlacement === true;
  if (state.worldMode === 'cottage') return openPlacement ? showPersonalSpace() : showHomesteadPanel();
  state.wx = objectTargets.cottage.wx;
  state.wy = objectTargets.cottage.wy + 70;
  renderWorld();
  setTimeout(() => {
    enterCottage();
    if (openPlacement) showPersonalSpace();
  }, 70);
}

function exitCottage() {
  if (state.worldMode !== 'cottage') return;
  cancelPointerMove('space_exit');
  cottageExitPending = false;
  state.worldMode = 'overworld';
  state.carryPlaced = null;
  state.pendingCopyPlacement = null;
  worldStage.classList.remove('is-cottage');
  worldArt.hidden = true;
  homesteadLayer.hidden = true;
  cottageExit.hidden = true;
  persist();
  renderWorld();
  logEvent('space_exit', { space: 'personal' });
  say('沿小径回到了公域。你可以继续走，或换个方向。');
}

function cottageExitDistance() {
  return Math.hypot(state.cottageX - HOMESTEAD_EXIT.x, state.cottageY - HOMESTEAD_EXIT.y);
}

function updateCottageExitState() {
  const near = state.worldMode === 'cottage' && cottageExitDistance() <= 14;
  cottageExit.classList.toggle('is-near', near);
  cottageExit.setAttribute('aria-label', near ? '继续沿左侧小径返回开放公域' : '沿左侧小径返回开放公域');
}

function tryExitCottageByWalking() {
  if (state.worldMode !== 'cottage' || cottageExitPending || cottageExitDistance() > HOMESTEAD_EXIT.radius) return false;
  cottageExitPending = true;
  cottageExit.classList.add('is-entering');
  cancelPointerMove('cottage_exit_reached');
  state.keys.clear();
  player.classList.remove('is-moving');
  persist();
  setTimeout(() => {
    cottageExit.classList.remove('is-entering');
    exitCottage();
    showToast('已沿小径回到开放公域');
  }, matchMedia('(prefers-reduced-motion: reduce)').matches ? 40 : 260);
  return true;
}

function walkToCottageExit() {
  if (state.worldMode !== 'cottage' || cottageExitPending) return;
  cottageExit.classList.add('is-entering');
  startPointerMove('cottage', HOMESTEAD_EXIT.x, HOMESTEAD_EXIT.y, { source: 'cottage_exit' });
}

function placeCopy() {
  if (state.worldMode !== 'cottage') { showToast('回到你的小屋才能摆放副本'); return null; }
  if (!state.copies.length) { state.pendingCopyPlacement = null; showToast('口袋里没有副本。视频旁按 G 提交模拟报价'); return null; }
  if (state.placed.length >= homeCapacity()) { showToast('小窝摆满了。先在布置簿里收起一些'); return null; }
  let copyIndex = 0;
  if (state.pendingCopyPlacement) {
    const selectedIndex = state.copies.findIndex((copy) => (
      (state.pendingCopyPlacement.transactionId && copy.transactionId === state.pendingCopyPlacement.transactionId)
      || (!state.pendingCopyPlacement.transactionId && copy.assetId === state.pendingCopyPlacement.assetId && (copy.acquiredAt || 0) === state.pendingCopyPlacement.acquiredAt)
    ));
    if (selectedIndex >= 0) copyIndex = selectedIndex;
  }
  const [copy] = state.copies.splice(copyIndex, 1);
  state.pendingCopyPlacement = null;
  state.placed.push({ type: 'copy', assetId: copy.assetId, transactionId: copy.transactionId || '', x: Math.round(state.cottageX), y: Math.round(state.cottageY), since: copy.acquiredAt });
  renderPlaced();
  updateCounters();
  persist();
  logEvent('copy_placed_home', { asset_id: copy.assetId });
  say('副本放好了。它不会过期，也不会被任何人拿走。');
  return copy;
}

function pickUpPlaced(index) {
  if (state.carryPlaced === index) {
    const item = state.placed[index];
    state.placed.splice(index, 1);
    if (item.type === 'copy') state.copies.push({ assetId: item.assetId, transactionId: item.transactionId || '', acquiredAt: Date.now() });
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
  if (state.placed.length >= homeCapacity()) return showToast('小窝摆满了。先在布置簿里收起一些');
  const parts = state.copies.splice(0, 2).map((copy) => copy.assetId);
  state.placed.push({ type: 'combo', parts, assetId: parts[0], x: 22, y: 42, since: Date.now() });
  renderPlaced();
  updateCounters();
  persist();
  logEvent('combine', { asset_ids: parts });
  showToast('两枚副本拼成了一段新的组合');
}

function showPersonalSpace(options = {}) {
  const pendingCopy = state.pendingCopyPlacement
    ? state.copies.find((copy) => (
      (state.pendingCopyPlacement.transactionId && copy.transactionId === state.pendingCopyPlacement.transactionId)
      || (!state.pendingCopyPlacement.transactionId && copy.assetId === state.pendingCopyPlacement.assetId && (copy.acquiredAt || 0) === state.pendingCopyPlacement.acquiredAt)
    ))
    : null;
  if (state.pendingCopyPlacement && !pendingCopy) state.pendingCopyPlacement = null;
  const justPlacedTitle = options?.placedAssetId ? copyTitle(options.placedAssetId) : '';
  const placedList = state.placed.length
    ? state.placed.map((item, index) => {
      const video = findVideoById(item.assetId);
      const kept = Math.max(0, Math.floor((Date.now() - (item.since || Date.now())) / 60000));
      return `<div class="bid-row"><span>${item.type === 'combo' ? '组合的副本' : '《' + escapeHtml(video ? video.title : '副本') + '》'} · ${Math.round(item.x)},${Math.round(item.y)}</span><b>已留 ${kept} 分钟</b></div>`;
    }).join('')
    : '<div class="empty-state">小窝里还没有副本。在世界里竞价成功后，副本会进入你的口袋。</div>';
  openSheet(`
    <div class="sheet-inner">
      <h2 class="sheet-title" id="sheetTitle" tabindex="-1">${escapeHtml(state.profile.spaceName || '我的小窝')}布置簿</h2>
      <p class="sheet-subtitle">小窝目前可以摆放 ${homeCapacity()} 个对象。在小窝里点击副本拿起来，点击地面放下；扩建小屋还能增加容量。</p>
      ${justPlacedTitle ? `<div class="status-banner" role="status">《${escapeHtml(justPlacedTitle)}》已经摆在脚边。关闭布置簿后可以点击它移动或收回。</div>` : pendingCopy ? `<div class="status-banner" role="status">已从背包选中《${escapeHtml(copyTitle(pendingCopy.assetId))}》。确认后会摆在角色脚边。</div>` : ''}
      <div class="choice-grid">
        <button class="choice-button" data-rug="teal"><b>灰绿毯</b><span>安静的底色</span></button>
        <button class="choice-button" data-rug="brick"><b>赭红毯</b><span>只改变自己的空间</span></button>
      </div>
      <div class="note-section"><h3>当前摆放</h3>${placedList}</div>
      <div class="media-actions">
        <button class="primary-button" id="placeCopyButton">${pendingCopy ? `摆放《${escapeHtml(copyTitle(pendingCopy.assetId))}》` : '放一枚副本在脚边'}</button>
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
    $('#placeCopyButton').addEventListener('click', () => {
      const placedCopy = placeCopy();
      if (placedCopy) showPersonalSpace({ placedAssetId: placedCopy.assetId });
    });
    $('#combineButton').addEventListener('click', combineCopies);
  });
}

function copyTitle(assetId) {
  const video = findVideoById(assetId);
  return video ? video.title : '一段副本';
}

function usedAssetIds() {
  const ids = new Set();
  state.line.forEach((id) => id && ids.add(id));
  if (state.wall.a) ids.add(state.wall.a);
  if (state.wall.b) ids.add(state.wall.b);
  state.mix.forEach((id) => ids.add(id));
  Object.values(state.shops).forEach((id) => id && ids.add(id));
  if (state.frameSlot) ids.add(state.frameSlot);
  return ids;
}

function availableCopies() {
  const used = usedAssetIds();
  return state.copies.filter((copy) => !used.has(copy.assetId));
}

function openCopyPicker(titleText, subtitle, onPick, onCancel) {
  const copies = availableCopies();
  openSheet(`
    <div class="sheet-inner">
      <h2 class="sheet-title" id="sheetTitle" tabindex="-1">${escapeHtml(titleText)}</h2>
      <p class="sheet-subtitle">${escapeHtml(subtitle)}</p>
      <div class="list-stack">
        ${copies.length ? copies.map((copy, index) => `<div class="list-row"><div><b>${escapeHtml(copyTitle(copy.assetId))}</b><span>报价成交 · ${new Date(copy.acquiredAt).toLocaleDateString('zh-CN')}</span></div><button class="text-button" data-pick="${index}">选这枚</button></div>`).join('') : '<div class="empty-state">口袋里没有可用的副本。到视频旁按 G 提交报价，成交后就会获得一枚。</div>'}
      </div>
      <div class="media-actions"><button class="text-button" id="pickerCancel">返回</button></div>
    </div>
  `, () => {
    $$('[data-pick]', sheet).forEach((button) => button.addEventListener('click', () => {
      const copy = copies[Number(button.dataset.pick)];
      closeSheet();
      onPick(copy.assetId);
    }));
    $('#pickerCancel').addEventListener('click', () => {
      closeSheet();
      onCancel?.();
    });
  });
}

function showClothesline() {
  const slotRow = (assetId, index) => {
    if (!assetId) return `<div class="list-row"><div><b>空的位置 ${index + 1}</b><span>风把这里吹得很响</span></div><button class="text-button" data-line-hang="${index}">挂一枚副本</button></div>`;
    return `<div class="list-row"><div><b>${escapeHtml(copyTitle(assetId))}</b><span>位置 ${index + 1}</span></div><div class="row-actions">${index > 0 ? `<button class="text-button" data-line-left="${index}">◀</button>` : ''}${index < 2 ? `<button class="text-button" data-line-right="${index}">▶</button>` : ''}<button class="text-button" data-line-down="${index}">取下</button></div></div>`;
  };
  openSheet(`
    <div class="sheet-inner">
      <h2 class="sheet-title" id="sheetTitle" tabindex="-1">胶片晾衣绳</h2>
      <p class="sheet-subtitle">把副本挂上去，左右挪、交换、并在一起。你如何安排它们，会被记录为内容之间的关系——但不会有人问你为什么。</p>
      <div class="list-stack">${[0, 1, 2].map((index) => slotRow(state.line[index], index)).join('')}</div>
      <div class="status-banner">绳上的副本仍属于你，随时可以取回小窝。原视频和世界都没有被改动。</div>
    </div>
  `, () => {
    const changed = () => {
      logEvent('line_change', { order: state.line });
      persist();
      renderWorld();
      showClothesline();
    };
    $$('[data-line-hang]', sheet).forEach((button) => button.addEventListener('click', () => {
      const index = Number(button.dataset.lineHang);
      openCopyPicker('挑一枚挂上去', '绳上有三个位置。挂上去之后可以左右挪动。', (assetId) => {
        state.line[index] = assetId;
        showToast('挂好了');
        changed();
      }, showClothesline);
    }));
    $$('[data-line-left]', sheet).forEach((button) => button.addEventListener('click', () => {
      const index = Number(button.dataset.lineLeft);
      [state.line[index - 1], state.line[index]] = [state.line[index], state.line[index - 1]];
      changed();
    }));
    $$('[data-line-right]', sheet).forEach((button) => button.addEventListener('click', () => {
      const index = Number(button.dataset.lineRight);
      [state.line[index + 1], state.line[index]] = [state.line[index], state.line[index + 1]];
      changed();
    }));
    $$('[data-line-down]', sheet).forEach((button) => button.addEventListener('click', () => {
      const index = Number(button.dataset.lineDown);
      state.line[index] = null;
      showToast('取下来了，回到你的口袋');
      changed();
    }));
  });
}

function showDoubleWall() {
  const slot = (key) => {
    const id = state.wall[key];
    const label = key === 'a' ? '左边' : '右边';
    return `<div class="list-row"><div><b>${label}</b><span>${id ? escapeHtml(copyTitle(id)) : '空着'}</span></div><div class="row-actions">${id ? `<button class="text-button" data-wall-clear="${key}">取下</button>` : ''}<button class="text-button" data-wall-pick="${key}">${id ? '换一段' : '放一段'}</button></div></div>`;
  };
  openSheet(`
    <div class="sheet-inner">
      <h2 class="sheet-title" id="sheetTitle" tabindex="-1">双面放映墙</h2>
      <p class="sheet-subtitle">左右各放一段。这里不出现“哪个更好”——只是把它们放在一起看，顺序和并置本身就是答案。</p>
      <div class="list-stack">${slot('a')}${slot('b')}</div>
      <div class="media-actions">
        ${state.wall.a && state.wall.b ? '<button class="primary-button" id="wallPlayBoth">一起播放</button><button class="paper-button" id="wallSwap">左右互换</button>' : ''}
      </div>
    </div>
  `, () => {
    $$('[data-wall-pick]', sheet).forEach((button) => button.addEventListener('click', () => {
      const key = button.dataset.wallPick;
      openCopyPicker(`挑一枚放到${key === 'a' ? '左边' : '右边'}`, '墙的两面各自放一段。', (assetId) => {
        state.wall[key] = assetId;
        persist();
        renderWorld();
        showDoubleWall();
      }, showDoubleWall);
    }));
    $$('[data-wall-clear]', sheet).forEach((button) => button.addEventListener('click', () => {
      state.wall[button.dataset.wallClear] = null;
      persist();
      renderWorld();
      showDoubleWall();
    }));
    const swap = $('#wallSwap', sheet);
    if (swap) swap.addEventListener('click', () => {
      [state.wall.a, state.wall.b] = [state.wall.b, state.wall.a];
      logEvent('wall_swap', { a: state.wall.a, b: state.wall.b });
      persist();
      showDoubleWall();
    });
    const playBoth = $('#wallPlayBoth', sheet);
    if (playBoth) playBoth.addEventListener('click', () => {
      const a = state.wall.a;
      const b = state.wall.b;
      openSheet(`
        <div class="sheet-inner">
          <h2 class="sheet-title" id="sheetTitle" tabindex="-1">两面一起亮起来</h2>
          <p class="sheet-subtitle">左边是《${escapeHtml(copyTitle(a))}》，右边是《${escapeHtml(copyTitle(b))}》。不评判，只是并置。</p>
          <div class="wall-duo">
            <div><div class="video-frame is-playing"><span class="video-status">${escapeHtml(copyTitle(a))}</span></div></div>
            <div><div class="video-frame is-playing"><span class="video-status">${escapeHtml(copyTitle(b))}</span></div></div>
          </div>
          <div class="media-actions"><button class="text-button" id="wallPairBack">回到放映墙</button></div>
        </div>
      `, () => {
        logEvent('wall_pair_view', { a, b });
        $('#wallPairBack').addEventListener('click', () => showDoubleWall());
      });
    });
  });
}

function showMixTable() {
  const rows = state.mix.length
    ? state.mix.map((id, index) => `<div class="list-row"><div><b>${index + 1}. ${escapeHtml(copyTitle(id))}</b></div><div class="row-actions">${index > 0 ? `<button class="text-button" data-mix-up="${index}">▲</button>` : ''}${index < state.mix.length - 1 ? `<button class="text-button" data-mix-down="${index}">▼</button>` : ''}<button class="text-button" data-mix-remove="${index}">删掉</button></div></div>`).join('')
    : '<div class="empty-state">桌上还什么都没有。最多可以放三段。</div>';
  openSheet(`
    <div class="sheet-inner">
      <h2 class="sheet-title" id="sheetTitle" tabindex="-1">混剪桌</h2>
      <p class="sheet-subtitle">把最多三段副本排成一段：A → B → C。系统只记录顺序和衔接关系，不会替你剪。</p>
      <div class="note-section"><h3>桌上的顺序</h3>${rows}</div>
      <div class="media-actions">
        ${state.mix.length < 3 ? '<button class="primary-button" id="mixAdd">加一枚进来</button>' : ''}
        ${state.mix.length >= 2 ? '<button class="paper-button" id="mixSave">保存成组合，放进小窝</button>' : ''}
      </div>
    </div>
  `, () => {
    const changed = () => {
      logEvent('mix_change', { order: state.mix });
      persist();
      showMixTable();
    };
    $$('[data-mix-up]', sheet).forEach((button) => button.addEventListener('click', () => {
      const index = Number(button.dataset.mixUp);
      [state.mix[index - 1], state.mix[index]] = [state.mix[index], state.mix[index - 1]];
      changed();
    }));
    $$('[data-mix-down]', sheet).forEach((button) => button.addEventListener('click', () => {
      const index = Number(button.dataset.mixDown);
      [state.mix[index + 1], state.mix[index]] = [state.mix[index], state.mix[index + 1]];
      changed();
    }));
    $$('[data-mix-remove]', sheet).forEach((button) => button.addEventListener('click', () => {
      state.mix.splice(Number(button.dataset.mixRemove), 1);
      changed();
    }));
    const add = $('#mixAdd', sheet);
    if (add) add.addEventListener('click', () => {
      openCopyPicker('挑一枚放到桌上', '顺序可以随时调。', (assetId) => {
        state.mix.push(assetId);
        changed();
      }, showMixTable);
    });
    const save = $('#mixSave', sheet);
    if (save) save.addEventListener('click', () => {
      if (state.placed.length >= homeCapacity()) return showToast('小窝摆满了，先收起一些');
      const parts = [...state.mix];
      parts.forEach((assetId) => {
        const idx = state.copies.findIndex((copy) => copy.assetId === assetId);
        if (idx >= 0) state.copies.splice(idx, 1);
      });
      state.placed.push({ type: 'combo', parts, assetId: parts[0], x: 26, y: 40, since: Date.now() });
      state.mix = [];
      persist();
      logEvent('mix_save', { order: parts });
      renderWorld();
      closeSheet();
      showToast('组合已保存，去小窝就能看到');
    });
  });
}

function activeSwapOffer() {
  return state.publicRecords
    .filter((record) => record.kind === 'swap_offer' && record.status !== 'deleted')
    .sort((a, b) => String(b.updatedAt || b.createdAt || '').localeCompare(String(a.updatedAt || a.createdAt || '')))[0] || null;
}

async function showSwapBox() {
  let offer = activeSwapOffer();
  if (!offer) {
    try {
      await syncPublicWorld({ render: false });
      offer = activeSwapOffer();
    } catch (error) {
      openSheet(`<div class="sheet-inner"><h2 class="sheet-title" id="sheetTitle" tabindex="-1">交换箱暂时打不开</h2><p class="sheet-subtitle">${escapeHtml(error.message || '公共交换记录读取失败。')}</p><button class="primary-button" id="swapRetry">重新读取</button></div>`, () => $('#swapRetry').addEventListener('click', showSwapBox));
      return;
    }
  }
  if (!offer?.payload?.assetId) {
    openSheet('<div class="sheet-inner"><h2 class="sheet-title" id="sheetTitle" tabindex="-1">交换箱空着</h2><p class="sheet-subtitle">目前没有可领取的公共副本。稍后回来，或先去世界里获得一枚自己的副本。</p><button class="paper-button" id="swapRetry">刷新交换箱</button></div>', () => $('#swapRetry').addEventListener('click', showSwapBox));
    return;
  }
  const offerData = offer.payload;
  const ownsOffer = offer.owner === 'me';
  const alreadyHasOfferedCopy = state.copies.some((copy) => copy.assetId === offerData.assetId)
    || state.placed.some((item) => item.assetId === offerData.assetId || (item.parts || []).includes(offerData.assetId));
  openSheet(`
    <div class="sheet-inner">
      <h2 class="sheet-title" id="sheetTitle" tabindex="-1">交换箱</h2>
      <p class="sheet-subtitle">箱子里现在有《${escapeHtml(copyTitle(offerData.assetId))}》。这枚副本来自公共交换记录，下一位玩家看到的会是你留下的内容。</p>
      <div class="status-banner">“${escapeHtml(offerData.note || '没有留话，但心意在。')}” —— ${escapeHtml(offerData.by || offer.name || '匿名旅人')}${offerData.npc ? ' · NPC' : ''}</div>
      ${ownsOffer ? '<div class="status-banner">这是你放进交换箱的副本。需要等待另一位玩家回应，不能自己取回。</div>' : ''}
      ${alreadyHasOfferedCopy ? '<div class="status-banner">你已经拥有这段素材的副本，不需要重复领取。</div>' : ''}
      <div class="media-actions">
        <button class="primary-button" id="swapTake" ${ownsOffer || alreadyHasOfferedCopy || !state.copies.length ? 'disabled' : ''}>${state.copies.length ? '留下一枚，带走它' : '背包里没有可交换副本'}</button>
        <button class="paper-button" id="swapRefresh">刷新交换箱</button>
        <button class="text-button" id="swapLeave">只是看看</button>
      </div>
    </div>
  `, () => {
    $('#swapTake').addEventListener('click', () => {
      openCopyPicker('留下哪一枚？', '想带走箱子里的东西，要放一枚自己的进来。也可以给下一个人写句话。', (assetId) => {
        openSwapNote(assetId, offer);
      }, showSwapBox);
    });
    $('#swapRefresh').addEventListener('click', async () => { await syncPublicWorld({ render: false }); showSwapBox(); });
    $('#swapLeave').addEventListener('click', closeSheet);
  });
}

function openSwapNote(assetId, offer) {
  openSheet(`
    <div class="sheet-inner">
      <h2 class="sheet-title" id="sheetTitle" tabindex="-1">给下一个人留一句话</h2>
      <p class="sheet-subtitle">确认后会从公共交换箱取走《${escapeHtml(copyTitle(offer.payload.assetId))}》，并把《${escapeHtml(copyTitle(assetId))}》留给下一位玩家。</p>
      <form id="swapNoteForm">
        <label>一句话<input name="note" maxlength="100" placeholder="换一个你觉得……" /></label>
        <p class="form-error" id="swapError" role="alert"></p>
        <button class="primary-button" type="submit">放进箱子</button>
      </form>
    </div>
  `, () => $('#swapNoteForm').addEventListener('submit', async (event) => {
    event.preventDefault();
    const submit = event.currentTarget.querySelector('[type="submit"]');
    const text = event.currentTarget.elements.note.value.trim();
    const leftIndex = state.copies.findIndex((copy) => copy.assetId === assetId);
    if (leftIndex < 0) return $('#swapError').textContent = '这枚副本已经不在背包里，请重新选择。';
    submit.disabled = true;
    submit.textContent = '正在交换…';
    let result;
    try {
      result = await window.ZhereService.publicWorld.claimSwap(offer.id, { replacementAssetId: assetId, note: text });
    } catch (error) {
      submit.disabled = false;
      submit.textContent = '放进箱子';
      $('#swapError').textContent = error.message || '交换失败，请刷新交换箱后重试。';
      return;
    }
    const gained = result.gainedAssetId;
    if (leftIndex >= 0) state.copies.splice(leftIndex, 1);
    state.copies.push({ assetId: gained, transactionId: `swap:${offer.id}`, acquiredAt: Date.now() });
    state.publicRecords = [...state.publicRecords.filter((record) => record.id !== offer.id && record.id !== result.offer.id), result.offer];
    updateCounters();
    persist();
    logEvent('exchange_take', { gained, left: assetId, note: text, substitution: true });
    closeSheet();
    renderWorld();
    say(`你带走了《${copyTitle(gained)}》，箱子里换成了《${copyTitle(assetId)}》。`, '木秋');
  }));
}

function showShop(shopId) {
  const meta = SHOP_META[shopId];
  const current = state.shops[shopId];
  openSheet(`
    <div class="sheet-inner">
      <h2 class="sheet-title" id="sheetTitle" tabindex="-1">${escapeHtml(meta.name)}橱窗</h2>
      <p class="sheet-subtitle">${escapeHtml(meta.hint)}。放进橱窗会记录一段「视频 → 商业场景」的匹配，用于商业适配研究；不产生真实交易。</p>
      ${current
        ? `<div class="status-banner">橱窗里现在是《${escapeHtml(copyTitle(current))}》</div>
          <div class="media-actions">
            <button class="primary-button" id="shopReplace">换一段</button>
            <button class="text-button" id="shopRemove">取下</button>
          </div>`
        : '<div class="media-actions"><button class="primary-button" id="shopPick">挑一枚副本放进橱窗</button></div>'}
    </div>
  `, () => {
    const pick = (afterEmpty) => openCopyPicker('挑一枚放进橱窗', meta.hint + '。', (assetId) => {
      state.shops[shopId] = assetId;
      persist();
      logEvent('business_scene_place', { shop_id: shopId, asset_id: assetId });
      renderWorld();
      closeSheet();
      showToast(`《${copyTitle(assetId)}》进了${meta.name}橱窗`);
    }, afterEmpty);
    const pickButton = $('#shopPick', sheet);
    if (pickButton) pickButton.addEventListener('click', () => pick(showShop.bind(null, shopId)));
    const replace = $('#shopReplace', sheet);
    if (replace) replace.addEventListener('click', () => {
      openCopyPicker('换哪一枚进橱窗？', '原来那段会回到你的口袋。', (assetId) => {
        const old = state.shops[shopId];
        state.shops[shopId] = assetId;
        persist();
        logEvent('business_scene_place', { shop_id: shopId, asset_id: assetId, replaced: old });
        renderWorld();
        showShop(shopId);
      }, showShop.bind(null, shopId));
    });
    const remove = $('#shopRemove', sheet);
    if (remove) remove.addEventListener('click', () => {
      const old = state.shops[shopId];
      state.shops[shopId] = null;
      persist();
      logEvent('business_scene_remove', { shop_id: shopId, asset_id: old });
      renderWorld();
      showShop(shopId);
    });
  });
}

function showFrame() {
  const current = state.frameSlot;
  const target = objectTargets.frame;
  openSheet(`
    <div class="sheet-inner">
      <h2 class="sheet-title" id="sheetTitle" tabindex="-1">空白画框</h2>
      <p class="sheet-subtitle">框上只刻着一行小字：“这里好像缺了一段什么。”你可以放进去一段，也可以留下一句话。</p>
      ${current
        ? `<div class="status-banner">框里现在是《${escapeHtml(copyTitle(current))}》</div>
          <div class="media-actions"><button class="text-button" id="frameRemove">取下来</button></div>`
        : `<div class="media-actions">
            <button class="primary-button" id="framePick">放一枚副本进去</button>
            <button class="paper-button" id="frameWord">留一句话</button>
          </div>`}
    </div>
  `, () => {
    const pick = $('#framePick', sheet);
    if (pick) pick.addEventListener('click', () => {
      openCopyPicker('放哪一枚进画框？', '放进画框代表：你觉得这段属于这里。', (assetId) => {
        state.frameSlot = assetId;
        persist();
        logEvent('environment_match', { asset_id: assetId });
        renderWorld();
        showFrame();
      }, showFrame);
    });
    const word = $('#frameWord', sheet);
    if (word) word.addEventListener('click', () => {
      openSheet(`
        <div class="sheet-inner">
          <h2 class="sheet-title" id="sheetTitle" tabindex="-1">在画框下留一句话</h2>
          <p class="sheet-subtitle">它会变成一张世界里的纸条，别人路过能看到。</p>
          <form id="frameWordForm">
            <label>一句话<input name="text" maxlength="40" required placeholder="这里缺的也许是……" /></label>
            <button class="primary-button" type="submit">留下</button>
          </form>
        </div>
      `, () => $('#frameWordForm').addEventListener('submit', async (event) => {
        event.preventDefault();
        const text = event.currentTarget.elements.text.value.trim();
        if (!text) return;
        const note = {
          id: `n-frame-${Date.now()}`,
          title: text,
          description: '',
          type: 'personal',
          by: state.profile.nickname || '路过的风',
          wx: target.wx + 30,
          wy: target.wy + 40,
          zone: zoneAt(target.wx, target.wy).id,
          refAsset: null,
          responses: [],
          createdAt: '刚刚',
        };
        try {
          const result = await window.ZhereService.publicWorld.createDemand(note);
          state.publicDemands = [...state.publicDemands.filter((item) => item.id !== result.demand.id), result.demand];
        } catch (error) { return showToast(error.message || '纸条发布失败'); }
        persist();
        logEvent('publish_demand', { demand_id: note.id, demand_type: 'personal', source: 'blank_frame' });
        closeSheet();
        renderCreations();
        renderWorld();
        showToast('这句话钉在了画框下');
      }));
    });
    const remove = $('#frameRemove', sheet);
    if (remove) remove.addEventListener('click', () => {
      const old = state.frameSlot;
      state.frameSlot = null;
      persist();
      logEvent('environment_unmatch', { asset_id: old });
      renderWorld();
      showFrame();
    });
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

function showNameless(region) {
  const current = state.namedZones[region.id];
  openSheet(`
    <div class="sheet-inner">
      <h2 class="sheet-title" id="sheetTitle" tabindex="-1">一处没有名字的地方</h2>
      <p class="sheet-subtitle">风、路和光线在这里交汇，但还没有人叫出它的名字。${current ? `你曾叫它「${escapeHtml(current)}」。` : '你可以给它起个名字，以后这里会慢慢长出内容。'}</p>
      <form id="namelessForm">
        <label>它的名字<input name="name" maxlength="12" required placeholder="凌晨三点 / 想跑路 / 安静得危险" value="${escapeHtml(current || '')}" /></label>
        <div class="media-actions">
          <button class="primary-button" type="submit">${current ? '改个名字' : '就叫这个'}</button>
          ${current ? '<button class="text-button" id="namelessClear" type="button">忘掉这个名字</button>' : ''}
        </div>
      </form>
    </div>
  `, () => {
    $('#namelessForm').addEventListener('submit', (event) => {
      event.preventDefault();
      const name = event.currentTarget.elements.name.value.trim();
      if (!name) return;
      state.namedZones[region.id] = name;
      persist();
      logEvent('free_semantic_cluster', { region_id: region.id, name });
      closeSheet();
      renderNameless();
      updateNearby();
      showToast(`从现在开始，这里叫「${name}」`);
    });
    const clear = $('#namelessClear', sheet);
    if (clear) clear.addEventListener('click', () => {
      delete state.namedZones[region.id];
      persist();
      logEvent('free_semantic_cluster_clear', { region_id: region.id });
      closeSheet();
      renderNameless();
    });
  });
}

function renderAuras() {
  auraLayer.replaceChildren();
  worldVideosVisible().forEach((video) => {
    const cls = AURA_CLASS[video.scene];
    if (!cls) return;
    const div = document.createElement('span');
    div.className = `aura ${cls}`;
    auraLayer.append(div);
    placeWorldNode(div, video.wx, video.wy + 10);
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
      const video = findVideoById(content.asset_id);
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
    $('#bottleReplyForm').addEventListener('submit', async (event) => {
      event.preventDefault();
      const text = event.currentTarget.elements.reply.value.trim();
      if (text) {
        try { await window.ZhereService.publicWorld.saveRecord({ kind: 'bottle_reply', payload: { text } }); }
        catch (error) { return showToast(error.message || '回信保存失败'); }
      }
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
  const shared = state.publicRecords.filter((record) => record.kind === 'bench_message').map((record) => ({ id: record.id, owner: record.owner, name: record.name, text: record.payload?.text, createdAt: record.createdAt }));
  const recent = [...state.benchMessages, ...shared].sort((a, b) => String(a.createdAt || '').localeCompare(String(b.createdAt || ''))).slice(-3).reverse();
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
    $('#benchForm').addEventListener('submit', async (event) => {
      event.preventDefault();
      const text = event.currentTarget.elements.line.value.trim();
      if (!text) return;
      try {
        const result = await window.ZhereService.publicWorld.saveRecord({ kind: 'bench_message', payload: { text } });
        state.publicRecords.push(result.record);
      } catch (error) { return showToast(error.message || '留言保存失败'); }
      persist();
      logEvent('bench_reply', { length: text.length });
      closeSheet();
      showToast('这句话会等下一个坐下来的人');
    });
    $('#benchLeave').addEventListener('click', closeSheet);
  });
}

function showNeighbor() {
  const followRecord = state.publicRecords.find((record) => record.kind === 'follow' && record.owner === 'me' && record.payload?.targetSpaceId === 'late-branch-repair');
  openSheet(`
    <div class="sheet-inner">
      <h2 class="sheet-title" id="sheetTitle" tabindex="-1">晚枝修理所</h2>
      <p class="sheet-subtitle">一个玩家自愿公开的小窝。你只能看和回应，不能移动对方的副本。</p>
      <div class="video-frame"><span class="video-status">邻居空间预览</span></div>
      <div class="media-actions">
        <button class="primary-button" id="followButton">${followRecord ? '取消关注' : '关注这个空间'}</button>
      </div>
    </div>
  `, () => {
    $('#followButton').addEventListener('click', async () => {
      try {
        if (followRecord) {
          await window.ZhereService.publicWorld.deleteRecord(followRecord.id);
          state.publicRecords = state.publicRecords.filter((record) => record.id !== followRecord.id);
        } else {
          const result = await window.ZhereService.publicWorld.saveRecord({ kind: 'follow', payload: { targetSpaceId: 'late-branch-repair' } });
          state.publicRecords.push(result.record);
        }
      } catch (error) { return showToast(error.message || '关注状态保存失败'); }
      logEvent(followRecord ? 'unfollow' : 'follow', { space_id: 'late-branch-repair' });
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
  const cycle = currentWorldCycle();
  openSheet(`
    <div class="sheet-inner">
      <h2 class="sheet-title" id="sheetTitle" tabindex="-1">今日潮讯：${cycle.title}</h2>
      <p class="sheet-subtitle">${cycle.summary} 这是世界当天的自然变化，不是限时任务；明天会换一种，也可以完全忽略。</p>
      <div class="world-cycle-strip"><span class="cycle-mark cycle-${cycle.zone}" aria-hidden="true"><i></i></span><div><b>${cycle.zoneName}</b><small>在这里采集时，${resourceLabel(cycle.resource)}额外 +${cycle.bonus}</small></div><button class="paper-button" id="goToCycle" type="button">沿风去看看</button></div>
      <h3>也可以回应今天的颜色异象</h3>
      <div class="choice-grid">
        <button class="choice-button" data-event-choice="restore"><b>尝试恢复颜色</b><span>把色彩放回自己的物件</span></button>
        <button class="choice-button" data-event-choice="replace"><b>接受灰一点</b><span>让世界安静一次</span></button>
        <button class="choice-button" data-event-choice="ignore"><b>什么都不做</b><span>继续按自己的方式探索</span></button>
        <button class="choice-button" data-event-choice="mix"><b>搅一搅</b><span>产生一个无法预先判断的结果</span></button>
      </div>
    </div>
  `, () => {
    $('#goToCycle').addEventListener('click', () => {
      const target = { forest: [-2350, -260], hill: [0, -1800], street: [1850, -260], shore: [400, 580], town: [120, -160] }[cycle.zone];
      state.guidanceTarget = { wx: target[0], wy: target[1], label: `${cycle.zoneName} · ${cycle.title}` };
      closeSheet(); persist(); renderWorld(); showToast(`右上方已标记${cycle.zoneName}方向`);
    });
    $$('[data-event-choice]', sheet).forEach((button) => button.addEventListener('click', () => {
    state.eventChoice = button.dataset.eventChoice;
    worldStage.classList.toggle('event-muted', state.eventChoice === 'replace' || state.eventChoice === 'mix');
    persist();
    logEvent('world_event_response', { choice: state.eventChoice });
    closeSheet();
    const messages = { restore: '你把颜色留在了自己的物件上。', replace: '世界安静了一点。', ignore: '你选择继续散步，世界没有催促你。', mix: '颜色们暂时达成了不稳定的和平。' };
    say(messages[state.eventChoice]);
    }));
  });
}

const GUIDE_CATEGORIES = {
  start: '先学会这五件事',
  landmarks: '世界地标',
  discoveries: '路上会遇见',
  homestead: '个人地块',
};

function guideIdForNearest() {
  if (state.worldMode === 'cottage') return 'plots';
  if (!state.nearest) return null;
  if (state.nearest.type === 'object') return state.nearest.id;
  const ids = { video: 'video', note: 'note', resource: 'resource', tagplant: 'tagplant', bottle: 'bottle', nameless: 'nameless' };
  return ids[state.nearest.type] || null;
}

function guideStatus(item) {
  if (!item.target) return item.key ? `快捷键 ${item.key}` : '随时可以了解';
  const target = objectTargets[item.target];
  const distance = Math.round(Math.hypot(target.wx - state.wx, target.wy - state.wy) / 10);
  const visited = state.discoveredZones.includes(zoneAt(target.wx, target.wy).id);
  return `${visited ? '到过这片区域' : '尚未走到附近'} · 约 ${distance} 步`;
}

function showWorldGuide(initialCategory = 'start', focusId = null) {
  if (!state.guideIntroSeen) {
    state.guideIntroSeen = true;
    persist();
  }
  const focused = WORLD_GUIDE_ITEMS.find((item) => item.id === focusId);
  let activeCategory = focused?.category || initialCategory;
  openSheet(`
    <div class="sheet-inner world-guide">
      <header class="guide-heading">
        <div><h2 class="sheet-title" id="sheetTitle" tabindex="-1">世界图鉴</h2><p>这里不是开发设计稿，而是玩家随身携带的说明书。看到什么不明白，就查它能做什么、怎么操作，再决定要不要过去。</p></div>
        <div class="guide-compass" aria-hidden="true"><i></i><span></span></div>
      </header>
      <section class="guide-now" id="guideNow"></section>
      <div class="guide-workspace">
        <nav class="guide-categories" aria-label="图鉴分类">
          ${Object.entries(GUIDE_CATEGORIES).map(([id, label]) => `<button type="button" data-guide-category="${id}">${label}</button>`).join('')}
          <button type="button" data-guide-rules>世界基本规则</button>
        </nav>
        <div class="guide-content">
          <label class="guide-search">搜索图鉴<input id="guideSearch" type="search" placeholder="例如：竞价、纸条、交换箱、种植" autocomplete="off" /></label>
          <div class="guide-result-note" id="guideResultNote"></div>
          <div class="guide-entries" id="guideEntries"></div>
        </div>
      </div>
    </div>
  `, () => {
    const nearestGuideId = guideIdForNearest();
    const nearestItem = WORLD_GUIDE_ITEMS.find((item) => item.id === nearestGuideId);
    $('#guideNow').innerHTML = nearestItem
      ? `<div><span class="guide-symbol guide-${nearestItem.category}" aria-hidden="true"><i></i></span><p><small>你现在靠近</small><b>${escapeHtml(nearestItem.title)}</b><span>${escapeHtml(nearestItem.summary)}</span></p></div><button class="paper-button" type="button" data-guide-focus="${nearestItem.id}">查看这一项</button>`
      : `<div><span class="guide-symbol guide-start" aria-hidden="true"><i></i></span><p><small>你现在位于</small><b>${escapeHtml(currentZoneName())}</b><span>附近没有必须互动的对象。可以继续走，或先从五件基本动作开始。</span></p></div><button class="paper-button" type="button" data-guide-focus="walk">从行走开始</button>`;
    const renderGuide = () => {
      const query = $('#guideSearch').value.trim().toLowerCase();
      const items = WORLD_GUIDE_ITEMS.filter((item) => {
        const inCategory = query || item.category === activeCategory;
        return inCategory && (!query || `${item.title}${item.summary}${item.how}${item.key || ''}`.toLowerCase().includes(query));
      });
      $$('[data-guide-category]', sheet).forEach((button) => {
        const selected = button.dataset.guideCategory === activeCategory && !query;
        button.classList.toggle('is-active', selected);
        button.setAttribute('aria-current', selected ? 'page' : 'false');
      });
      $('#guideResultNote').textContent = query ? `在全部图鉴中找到 ${items.length} 项` : `${GUIDE_CATEGORIES[activeCategory]} · ${items.length} 项`;
      $('#guideEntries').innerHTML = items.length ? items.map((item) => `
        <article class="guide-entry ${item.id === focusId ? 'is-focused' : ''}" data-guide-entry="${item.id}">
          <span class="guide-symbol guide-${item.category}" aria-hidden="true"><i></i></span>
          <div class="guide-entry-copy"><h3>${escapeHtml(item.title)}</h3><p>${escapeHtml(item.summary)}</p><dl><div><dt>怎么做</dt><dd>${escapeHtml(item.how)}</dd></div><div><dt>当前状态</dt><dd>${escapeHtml(guideStatus(item))}</dd></div></dl></div>
          <div class="guide-entry-actions">${item.target ? `<button class="primary-button" type="button" data-guide-target="${item.target}">带我去</button>` : ''}${item.action ? `<button class="paper-button" type="button" data-guide-action="${item.action}">现在试试</button>` : ''}</div>
        </article>
      `).join('') : '<div class="guide-empty"><b>没有找到这件东西</b><p>可以换一个更短的词，例如“视频”“地块”或“交换”。</p><button class="text-button" id="guideClearSearch" type="button">清空搜索</button></div>';
      $$('[data-guide-target]', sheet).forEach((button) => button.onclick = () => travelFromGuide(button.dataset.guideTarget));
      $$('[data-guide-action]', sheet).forEach((button) => button.onclick = () => runGuideAction(button.dataset.guideAction));
      $('#guideClearSearch')?.addEventListener('click', () => { $('#guideSearch').value = ''; renderGuide(); $('#guideSearch').focus(); });
      if (focusId) requestAnimationFrame(() => $(`[data-guide-entry="${focusId}"]`, sheet)?.scrollIntoView({ block: 'center' }));
    };
    $$('[data-guide-category]', sheet).forEach((button) => button.addEventListener('click', () => { activeCategory = button.dataset.guideCategory; $('#guideSearch').value = ''; focusId = null; renderGuide(); }));
    $('[data-guide-rules]', sheet).addEventListener('click', showAbout);
    $('[data-guide-focus]', sheet).addEventListener('click', (event) => {
      focusId = event.currentTarget.dataset.guideFocus;
      activeCategory = WORLD_GUIDE_ITEMS.find((item) => item.id === focusId)?.category || 'start';
      $('#guideSearch').value = '';
      renderGuide();
    });
    $('#guideSearch').addEventListener('input', renderGuide);
    renderGuide();
  });
}

function travelFromGuide(targetId) {
  const target = objectTargets[targetId];
  if (!target) return showToast('这处地点暂时无法导航');
  closeSheet();
  if (targetId === 'cottage') return goToHomestead();
  if (state.worldMode === 'cottage') exitCottage();
  state.wx = target.wx;
  state.wy = target.wy + 72;
  persist();
  renderWorld();
  logEvent('guide_travel', { target_id: targetId });
  showToast(`沿着图鉴的路线，来到了「${target.label}」附近`);
}

function runGuideAction(action) {
  if (action === 'journal') return showJournal();
  if (action === 'publish') return showPublishAnywhere();
  if (action === 'home') { closeSheet(); return goToHomestead(); }
}

function showAbout() {
  openSheet(`
    <div class="sheet-inner">
      <h2 class="sheet-title" id="sheetTitle" tabindex="-1">这个世界如何运作</h2>
      <p class="sheet-subtitle">公共视频是持续存在的共享对象，不会消失。副本只通过虚拟竞价产生；收藏不等于购买。你在任何地方都能发布视频和纸条。</p>
      <div class="choice-grid">
        <div class="choice-button"><b>随地发生</b><span>发布视频、留纸条、竞价，都发生在你站着的地方</span></div>
        <div class="choice-button"><b>没有大厅</b><span>望远镜、漂流瓶、晾衣绳、放映墙、混剪桌、交换箱、橱窗、画框、无名处——都是世界里的东西，不是菜单</span></div>
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
        ? findVideoById(fav.id)
        : allWorldNotes().find((note) => note.id === fav.id);
      if (!found) { closeSheet(); return showToast('它已经不在世界里了'); }
      if (fav.type === 'demand') { closeSheet(); showNoteDetail(found); return; }
      if (found.catalogOnly || !Number.isFinite(found.wx)) { showVideo(found); return; }
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

function showData(initialTab = 'growth') {
  const stats = [
    ['探索步数', Math.round(state.exploreSteps), 12000],
    ['观看视频', countEvent('asset_open'), 60],
    ['播放次数', countEvent('play'), 60],
    ['点赞', countEvent('like'), 40],
    ['收藏', countEvent('favorite'), 30],
    ['评论', countEvent('comment'), 30],
    ['贴标签', countEvent('tag_add'), 30],
    ['提交报价', countEvent('bid_submit'), 40],
    ['报价成交', countEvent('bid_accepted'), 10],
    ['副本带回家', countEvent('copy_placed_home'), 10],
    ['发布素材', countEvent('publish_asset'), 20],
    ['留纸条', countEvent('publish_demand'), 15],
    ['曝光记录批次', countEvent('impression_batch'), 60],
  ];
  const max = Math.max(1, ...stats.map(([, value]) => value), ...stats.map(([, , cap]) => cap));
  const level = creatorLevel();
  const nextProgress = level.next ? Math.min(100, Math.round((level.score / level.next.need) * 100)) : 100;
  openSheet(`
    <div class="sheet-inner data-growth-sheet">
      <span class="sheet-eyebrow">个人成长与研究透明度</span>
      <h2 class="sheet-title" id="sheetTitle" tabindex="-1">数据与成长</h2>
      <p class="sheet-subtitle">先看能力如何展开；需要时再查看行为记录与研究字段，避免把个人成长和数据说明挤在同一页。</p>
      <div class="auction-price">
        <div class="price-block"><span>成长称谓</span><strong>${level.label}</strong></div>
        <div class="price-block"><span>成长值</span><strong>${level.score}</strong>${level.next ? ` / ${level.next.need}` : ' · 已展开全部能力'}</div>
        <div class="price-block"><span>曝光样本</span><strong>${Object.keys(state.exposureCounts).length}</strong> 段视频</div>
      </div>
      <div class="growth-track" aria-label="成长进度"><i style="width:${nextProgress}%"></i></div>
      <nav class="sheet-tabs" aria-label="数据与成长分类"><button type="button" data-data-tab="growth">成长路径</button><button type="button" data-data-tab="activity">行为记录</button><button type="button" data-data-tab="signals">字段说明</button></nav>
      <div class="sheet-tab-panel" data-data-panel="growth"><div class="note-section"><div class="section-kicker">能力展开</div><h3>成长会真正改变什么</h3><div class="growth-tier-list">${CREATOR_TIERS.map((tier) => `<div class="growth-tier${level.score >= tier.need ? ' is-unlocked' : ''}"><span>${level.score >= tier.need ? '已展开' : `${tier.need} 成长值`}</span><div><b>${tier.label}</b><small>${tier.benefit}</small></div></div>`).join('')}</div><button class="paper-button" id="openGrowthAtlas" type="button">打开区域珍藏图鉴</button></div></div>
      <div class="sheet-tab-panel" data-data-panel="activity"><div class="note-section"><div class="section-kicker">只读统计</div><h3>行为记录</h3>
        ${stats.map(([label, value]) => `<div class="stat-row"><span>${label}</span><div class="stat-track"><i style="width:${Math.min(100, Math.round(value / max * 100))}%"></i></div><b>${value}</b></div>`).join('')}
      </div></div>
      <div class="sheet-tab-panel" data-data-panel="signals"><div class="note-section"><div class="section-kicker">研究透明度</div><h3>重要信号说明</h3>
        <p class="section-intro">原始行为不会被直接解释成喜欢或不喜欢。以下派生信号全部基于原始事件重算。</p>
        <div class="comment"><b>copy_long_term_kept</b><span>副本长期留在小窝，是最稳定的偏好信号</span></div>
        <div class="comment"><b>avoid</b><span>靠近后没有打开就离开，被记录为潜在负反馈</span></div>
        <div class="comment"><b>impression_batch</b><span>记录实际进入视野的素材；未进入视野的候选不会被误判为不喜欢</span></div>
      </div></div>
    </div>
  `, () => {
    const selectTab = (tab) => {
      const safeTab = ['growth', 'activity', 'signals'].includes(tab) ? tab : 'growth';
      $$('[data-data-tab]', sheet).forEach((button) => {
        const active = button.dataset.dataTab === safeTab;
        button.classList.toggle('is-active', active);
        button.setAttribute('aria-selected', String(active));
      });
      $$('[data-data-panel]', sheet).forEach((panel) => { panel.hidden = panel.dataset.dataPanel !== safeTab; });
    };
    $$('[data-data-tab]', sheet).forEach((button) => button.addEventListener('click', () => selectTab(button.dataset.dataTab)));
    selectTab(initialTab);
    $('#openGrowthAtlas')?.addEventListener('click', () => showJournal('discoveries'));
  });
}

function showLedger() {
  const quotes = state.rawEvents.filter((event) => event.raw_event === 'bid_accepted');
  const total = quotes.reduce((sum, event) => sum + (event.details.transaction_price || 0), 0);
  openSheet(`
    <div class="sheet-inner">
      <h2 class="sheet-title" id="sheetTitle" tabindex="-1">灵感币账本</h2>
      <p class="sheet-subtitle">素材报价是独立的模拟价格表达，不扣除灵感币，不可提现、不可兑换，也不产生真实购买。灵感币继续用于原有游戏玩法。</p>
      <div class="auction-price">
        <div class="price-block"><span>当前余额</span><strong>${state.wallet}</strong></div>
        <div class="price-block"><span>累计模拟报价</span><strong>${Number(total.toFixed(2))}</strong></div>
      </div>
      <div class="note-section"><h3>最近出价</h3>
        <div class="list-stack">${quotes.length ? quotes.slice(-12).reverse().map((event) => `<div class="list-row"><div><b>报价 ${event.details.transaction_price}</b><span>${escapeHtml(event.details.asset_id)} · ${event.created_at.slice(11, 16)}</span></div><b class="amount-in">已记录</b></div>`).join('') : '<div class="empty-state">还没有报价记录。视频旁按 G 表达你认为合适的价格。</div>'}</div>
      </div>
      <div class="status-banner">报价是可忽略的探索行为。每次有效报价都会直接成交，发布者不能接受、拒绝或修改价格。</div>
    </div>
  `);
}

function showHelpFeedback() {
  const faq = [
    ['怎么发布视频或需求？', '走到世界任意位置按 P，或点击右下角“发布”，再选择发布视频或发布需求。'],
    ['探索手账会记录什么？', '按 J 打开手账。真正打开过的素材、纸条、首次到达的地点和你建立的素材关系会自动留下足迹；它不是任务清单，也没有完成期限。'],
    ['怎么把两段素材联系起来？', '打开任意素材，选择“对照另一段”，并排观察后选择此刻最接近的关系。保存的线会出现在素材页与探索手账里。'],
    ['角色身边还能做什么？', '点击角色或按 Q 打开身边行动盘。它会根据附近素材、纸条、资源或设施改变提示。'],
    ['副本怎么获得？', '走近视频按 G 参与虚拟竞价，植物开花且你领先时，副本入口袋。回小窝按 F 摆放。'],
    ['收藏和购买有什么区别？', '收藏是“以后还想找到它”；只有竞价成功才获得可持有的副本。'],
    ['纸条是什么？', '在世界任意位置按 N 留下的需求；站在视频旁按 N 会自动引用那段视频。'],
    ['标签植物怎么用？', '按 E 拔下一株，走到视频旁按 F 贴上去。'],
    ['为什么内容会变化？', '每个区域的内容按推荐分与低曝光补偿动态选取；世界每天也会换一批。'],
    ['晾衣绳、放映墙、混剪桌做什么？', '把口袋里的副本挂上、并排或排成顺序。记录的是你如何安排内容之间的关系，不会有人问你为什么。'],
    ['交换箱怎么用？', '留下一枚副本和一句话，带走别人留下的一枚。交换关系会被记录。'],
    ['橱窗和画框是什么？', '商业街的橱窗记录「视频→商业场景」的匹配；林子里的画框可以放一段视频或留一句话。'],
    ['无名处怎么命名？', '走到标着「？无名处」的地方按 E，给它起个名字。'],
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
    logEvent('feedback', { text: text.slice(0, 1000), length: text.length });
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
      <div class="status-banner" id="researchCollectionStatus" role="status">正在检查服务端采集状态……</div>
      <div class="media-actions"><button class="paper-button" id="exportData">导出我的行为记录</button><button class="danger-button" id="deleteData">申请删除并匿名化</button></div>
      <div class="danger-zone"><b>虚拟声明</b><p>灵感币无现金价值，不可提现、不可兑换。NPC（如慢半拍的鹿）始终被明确标记。</p></div>
    </div>
  `, () => {
    const refreshResearchStatus = async () => {
      const banner = $('#researchCollectionStatus');
      if (!banner) return;
      try {
        const result = await window.ZhereService.privacy.researchStatus();
        if (!result.collecting) banner.textContent = `研究采集已暂停 · 授权版本 ${result.consent_version}`;
        else if (result.status === 'ready') banner.textContent = `研究采集已开启 · 等待第一条事件写入 · 授权版本 ${result.consent_version}`;
        else banner.textContent = `研究采集正常 · 服务端已保存 ${result.event_count} 条事件${result.last_event_at ? ` · 最近写入 ${new Date(result.last_event_at).toLocaleString('zh-CN')}` : ''}`;
      } catch (error) {
        banner.textContent = '暂时无法确认服务端采集状态，请稍后重试。';
      }
    };
    refreshResearchStatus();
    $('#researchToggle').addEventListener('change', async (event) => {
      const input = event.currentTarget;
      const previous = state.research;
      const next = input.checked;
      input.disabled = true;
      try {
        await window.ZhereService.privacy.updateConsent(next);
        state.research = next;
        persist();
        logEvent('research_consent_change', { active: next, previous });
        await window.ZhereService.events.flush().catch(() => {});
        await refreshResearchStatus();
        showToast(next ? '已加入研究' : '已退出研究，账户仍保留');
      } catch (error) {
        input.checked = previous;
        showToast(error.message || '研究设置保存失败，请稍后重试');
      } finally {
        input.disabled = false;
      }
    });
    $('#exportData').addEventListener('click', async (event) => {
      const button = event.currentTarget;
      button.disabled = true;
      try {
        const result = await window.ZhereService.privacy.exportData();
        downloadJson(`zhere-account-data-${new Date().toISOString().slice(0, 10)}.json`, result.export);
        logEvent('data_export', { count: result.export.raw_events?.length || 0, scope: 'server-account' });
        showToast(`已导出 ${result.export.raw_events?.length || 0} 条服务端原始事件`);
      } catch (error) {
        showToast(error.message || '服务端数据导出失败');
      } finally {
        button.disabled = false;
      }
    });
    $('#deleteData').addEventListener('click', showDataDeletionConfirm);
  });
}

function showDataDeletionConfirm() {
  openSheet(`
    <div class="sheet-inner confirm-sheet">
      <h2 class="sheet-title" id="sheetTitle" tabindex="-1">申请删除并匿名化？</h2>
      <p class="sheet-subtitle">确认后会在服务端退出研究、移除账户标识并注销现有会话；不再能关联到你的公共世界行为会继续保留。</p>
      <label class="check-label"><input type="checkbox" id="confirmAnonymize" /> 我理解公共世界中的匿名痕迹会保留，以维持素材关系和世界连续性</label>
      <p class="form-error" id="deleteDataError" role="alert"></p>
      <div class="media-actions"><button class="danger-button" id="confirmDeleteData" type="button">确认匿名化账户数据</button><button class="paper-button" id="cancelDeleteData" type="button">返回隐私设置</button></div>
    </div>
  `, () => {
    $('#cancelDeleteData').addEventListener('click', showPrivacy);
    $('#confirmDeleteData').addEventListener('click', async () => {
      if (!$('#confirmAnonymize').checked) return $('#deleteDataError').textContent = '请先确认你理解匿名化后的保留范围。';
      const button = $('#confirmDeleteData');
      button.disabled = true;
      $('#deleteDataError').textContent = '';
      try {
        logEvent('deletion_request', { scope: 'server-account', anonymized: true });
        await window.ZhereService.events.flush({ keepalive: true });
        await window.ZhereService.privacy.anonymize();
        localStorage.removeItem(STORAGE_KEY);
        localStorage.removeItem(LEGACY_STORAGE_KEY);
        localStorage.removeItem(SESSION_KEY);
        localStorage.removeItem(LEGACY_SESSION_KEY);
        location.reload();
      } catch (error) {
        button.disabled = false;
        $('#deleteDataError').textContent = error.message || '服务端匿名化失败，请稍后重试。';
      }
    });
  });
}

async function showAdmin() {
  if (!window.ZhereService?.user()?.admin) return showToast('当前账户没有公域维护权限');
  openSheet(`<div class="sheet-inner"><h2 class="sheet-title" id="sheetTitle" tabindex="-1">公域维护簿</h2><div class="empty-state">正在读取服务端审核队列……</div></div>`);
  let reports;
  try { reports = (await window.ZhereService.admin.reports()).reports || []; }
  catch (error) { return openSheet(`<div class="sheet-inner"><h2 class="sheet-title" id="sheetTitle" tabindex="-1">公域维护簿</h2><div class="danger-zone"><b>审核队列读取失败</b><p>${escapeHtml(error.message || '服务暂时不可用')}</p></div></div>`); }
  openSheet(`
    <div class="sheet-inner">
      <h2 class="sheet-title" id="sheetTitle" tabindex="-1">公域维护簿</h2>
      <p class="sheet-subtitle">这里读取真实服务端举报队列。隐藏内容与处理举报分开执行，所有操作都经过管理员权限检查。</p>
      <div class="auction-price">
        <div class="price-block"><span>待处理举报</span><strong>${reports.filter((item) => item.status === 'open').length}</strong> 条</div>
        <div class="price-block"><span>公共内容</span><strong>${state.publicAssets.length + state.publicDemands.length}</strong> 项</div>
      </div>
      <div class="media-actions"><button class="paper-button" id="exportPricingData" type="button">导出素材报价与成交 CSV</button><button class="paper-button" id="exportResearchData" type="button">导出推荐研究事件 CSV</button></div>
      <div class="list-stack">${reports.length ? reports.map((report) => `<div class="list-row"><div><b>${escapeHtml(report.targetType)} · ${escapeHtml(report.targetId)}</b><span>${escapeHtml(report.reason)} · ${escapeHtml(report.reporterName || '匿名举报')} · ${escapeHtml(report.status)}</span></div><div class="row-actions">${report.status === 'open' ? `<button class="danger-button" data-admin-hide="${escapeHtml(report.id)}" data-target-type="${escapeHtml(report.targetType)}" data-target-id="${escapeHtml(report.targetId)}">隐藏并处理</button><button class="paper-button" data-admin-dismiss="${escapeHtml(report.id)}">驳回</button>` : ''}</div></div>`).join('') : '<div class="empty-state">当前没有举报记录。</div>'}</div>
    </div>
  `, () => {
    $('#exportPricingData').addEventListener('click', () => {
      window.location.assign(window.ZhereService.admin.pricingExportUrl);
    });
    $('#exportResearchData').addEventListener('click', () => {
      window.location.assign(window.ZhereService.admin.researchExportUrl);
    });
    $$('[data-admin-hide]', sheet).forEach((button) => button.addEventListener('click', async () => {
      button.disabled = true;
      try {
        await window.ZhereService.admin.moderate(button.dataset.targetType, button.dataset.targetId, true);
        await window.ZhereService.admin.updateReport(button.dataset.adminHide, 'resolved');
        await syncPublicWorld({ render: true });
        showAdmin();
      } catch (error) { button.disabled = false; showToast(error.message || '审核操作失败'); }
    }));
    $$('[data-admin-dismiss]', sheet).forEach((button) => button.addEventListener('click', async () => {
      button.disabled = true;
      try { await window.ZhereService.admin.updateReport(button.dataset.adminDismiss, 'dismissed'); showAdmin(); }
      catch (error) { button.disabled = false; showToast(error.message || '审核操作失败'); }
    }));
  });
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
        <p class="form-error" id="profileError" role="alert"></p>
        <button class="primary-button" type="submit">保存角色</button>
      </form>
    </div>
  `, () => {
    $$('[data-avatar]', sheet).forEach((button) => button.addEventListener('click', () => {
      profile.avatar = Number(button.dataset.avatar);
      $$('[data-avatar]', sheet).forEach((node) => node.classList.toggle('is-selected', node === button));
    }));
    $('#profileForm').addEventListener('submit', async (event) => {
      event.preventDefault();
      const form = event.currentTarget;
      const submit = form.querySelector('[type="submit"]');
      const nickname = form.elements.nickname.value.trim();
      const spaceName = form.elements.spaceName.value.trim() || '礁石小窝';
      $('#profileError').textContent = '';
      submit.disabled = true;
      submit.textContent = '正在保存…';
      try {
        await window.ZhereService.updateProfile({ nickname, spaceName });
      } catch (error) {
        submit.disabled = false;
        submit.textContent = '保存角色';
        $('#profileError').textContent = error.message || '角色资料保存失败，请稍后重试。';
        return;
      }
      profile.nickname = nickname;
      profile.bio = form.elements.bio.value.trim();
      profile.spaceName = spaceName;
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
    board: showBoard,
    journal: showJournal,
    guide: showWorldGuide,
    favorites: showFavorites,
    data: showData,
    ledger: showLedger,
    help: showHelpFeedback,
    privacy: showPrivacy,
    admin: showAdmin,
  };
  panels[type]?.();
}

function updateContextWheel() {
  if (!contextWheel) return;
  contextWheel.style.setProperty('--context-x', state.worldMode === 'cottage' ? state.cottageX : 50);
  contextWheel.style.setProperty('--context-y', state.worldMode === 'cottage' ? state.cottageY : 52);
  let title = state.worldMode === 'cottage' ? '在自己的地块上' : `站在${currentZoneName()}`;
  let hint = state.worldMode === 'cottage' ? '查看土地、建筑与今天能做的事' : '看看脚边与视线里有什么';
  if (state.nearest?.type === 'video') {
    title = `靠近《${state.nearest.video.title}》`;
    hint = '打开素材，回应、收藏或与另一段对照';
  } else if (state.nearest?.type === 'note') {
    title = `靠近纸条「${state.nearest.note.title}」`;
    hint = '展开需求，回应或追问细节';
  } else if (state.nearest?.type === 'resource') {
    title = `脚边有${state.nearest.item.label}`;
    hint = `收集会消耗 ${state.nearest.item.energy} 点体力`;
  } else if (state.nearest?.type === 'object') {
    title = state.nearest.label || '靠近一处公共设施';
    hint = state.nearest.hint?.replace(/^E\s*/, '') || '打开这里的互动';
  }
  contextWheelTitle.textContent = title;
  contextObserveHint.textContent = hint;
}

function closeContextWheel() {
  if (!contextWheel || contextWheel.hidden) return;
  contextWheel.hidden = true;
  player.setAttribute('aria-expanded', 'false');
}

function toggleContextWheel(force) {
  if (!contextWheel || !sheet.hidden || !profileDrawer.hidden || !entry.classList.contains('is-gone')) return;
  const shouldOpen = typeof force === 'boolean' ? force : contextWheel.hidden;
  if (!shouldOpen) return closeContextWheel();
  stopMovement(true);
  updateContextWheel();
  contextWheel.hidden = false;
  player.setAttribute('aria-expanded', 'true');
  requestAnimationFrame(() => $('[data-context-action]', contextWheel)?.focus());
}

function runContextAction(action) {
  closeContextWheel();
  if (action === 'observe') return state.worldMode === 'cottage' ? showHomesteadPanel() : observe();
  if (action === 'note') return state.worldMode === 'cottage' ? showPublishAnywhere() : showLeaveNote(state.nearest?.type === 'video' ? state.nearest.video : null);
  if (action === 'publish') return showPublishAnywhere();
  if (action === 'journal') return showJournal();
}

function observe() {
  if (!state.nearest) return say('附近没有特别的东西。海在更南边，林子在西边。');
  if (state.nearest.type === 'video') return showVideo(state.nearest.video);
  if (state.nearest.type === 'note') return showNoteDetail(state.nearest.note);
  if (state.nearest.type === 'tagplant') return pluckTagPlant(state.nearest.index);
  if (state.nearest.type === 'resource') return gatherResource(state.nearest.item);
  if (state.nearest.type === 'nameless') return showNameless(state.nearest.region);
  if (state.nearest.type === 'bottle') return openBottle();
  const actions = {
    cottage: enterCottage, board: showBoard, workshop: showWorkshop, telescope: showTelescope,
    sound: showSoundDock, seabench: showSeabench, neighbor: showNeighbor, anomaly: showAnomaly,
    clothesline: showClothesline, doublewall: showDoubleWall, mixtable: showMixTable,
    swapbox: showSwapBox, shopcafe: () => showShop('cafe'), shoppet: () => showShop('pet'), frame: showFrame,
  };
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
  walkTarget.hidden = true;
  player.classList.remove('is-moving');
  if (previous.mode === 'overworld') flushMovementSample(reason);
  if (savePosition) persist();
  updateNearby();
  return true;
}

function startPointerMove(mode, x, y, options = {}) {
  if (!Number.isFinite(x) || !Number.isFinite(y) || mode !== state.worldMode) return false;
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
  const firstWaypoint = path[0];
  pointerMoveTarget = {
    mode,
    x: mode === 'cottage' ? Math.max(6, Math.min(94, destination.x)) : destination.x,
    y: mode === 'cottage' ? Math.max(30, Math.min(88, destination.y)) : destination.y,
    destination,
    waypoints: mode === 'overworld' ? path.slice(1, -1) : [],
    source: options.source || 'ground',
    label: String(options.label || '').slice(0, 80),
    onArrival: typeof options.onArrival === 'function' ? options.onArrival : null,
    stopDistance: Math.max(0, Number(options.stopDistance) || 0),
    startedAt: Date.now(),
  };
  if (pointerMoveTarget.waypoints.length) advancePointerWaypoint(pointerMoveTarget);
  cottageExit.classList.remove('is-entering');
  closeContextWheel();
  updateWalkTargetMarker();
  updateNearby();
  logEvent('move_click', {
    mode,
    source: pointerMoveTarget.source,
    target_x: Math.round(destination.x),
    target_y: Math.round(destination.y),
    waypoint_count: path.length,
  });
  return true;
}

function advancePointerWaypoint(target) {
  if (!target.waypoints.length) return false;
  const next = target.waypoints.shift();
  target.x = next.x;
  target.y = next.y;
  return true;
}

function finishPointerMove(target) {
  if (!pointerMoveTarget || pointerMoveTarget !== target) return;
  const onArrival = target.onArrival;
  pointerMoveTarget = null;
  walkTarget.hidden = true;
  player.classList.remove('is-moving');
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

function endTelemetrySession(reason) {
  if (!telemetryWorldEntered || telemetrySessionEnded) return;
  flushMovementSample(reason);
  telemetrySessionEnded = true;
  logEvent('session_end', { reason, duration_ms: Date.now() - telemetryStartedAt });
}

function frame(now) {
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
      state.cottageX = Math.max(6, Math.min(94, state.cottageX + dx));
      state.cottageY = Math.max(30, Math.min(88, state.cottageY + dy));
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
            cancelPointerMove('path_blocked');
            showToast('路线被挡住了，请重新选择落点');
          }
        }
      }
    }
    player.classList.toggle('is-moving', Boolean(dx || dy));
    if (dx || dy) {
      if (Math.abs(dx) >= Math.abs(dy) && dx) player.dataset.facing = dx < 0 ? 'left' : 'right';
      else if (dy) player.dataset.facing = dy < 0 ? 'up' : 'down';
      closeContextWheel();
      if (state.worldMode !== 'cottage') state.exploreSteps += Math.abs(dx) + Math.abs(dy);
      renderWorld();
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
  if (!entry.classList.contains('is-gone')) return;
  flushMovementSample('interval');
}, 2000);

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
  entry.inert = true;
  entry.setAttribute('aria-hidden', 'true');
  history.replaceState({}, '', appBasePath);
  refreshIdentity();
  telemetryWorldEntered = true;
  telemetrySessionEnded = false;
  resetMovementSample();
  logEvent('session_start', { mode, consent_research: state.research, day_seed: daySeed });
  syncPublicWorld({ render: true });
  refreshNotifications({ announce: true });
  setTimeout(() => { entry.hidden = true; }, 320);
  if (!state.guideIntroSeen && state.onboarding.status === 'new') {
    say('欢迎来到公域。可以直接自由走，也可以用大约三分钟完成第一次远行：看素材、回应需求，再让自己的地块发生一次变化。', '木秋', [
      { label: '开始第一次远行', handler: beginOnboarding },
      { label: '我先自由探索', handler: skipOnboarding },
    ]);
  } else if (onboardingActive()) {
    renderOnboarding();
  } else {
    say('小屋旁有会再生的落枝和高草。收集材料能建设自己的地块；看到不认识的东西，按“？”查世界图鉴。');
  }
  if (matchMedia('(max-width: 820px)').matches && state.guideIntroSeen) {
    dialogue.classList.add('is-collapsed');
    $('#dialogueToggle').textContent = '展开木秋的对话';
    $('#dialogueToggle').setAttribute('aria-expanded', 'false');
  }
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
$('#guestButton').addEventListener('click', async () => {
  const button = $('#guestButton');
  setPendingButton(button, true, '正在准备公域…');
  try {
    if (!serviceSessionAvailable) {
      const result = await window.ZhereService.guest();
      if (result.state) Object.assign(state, normalizeState(result.state));
      state.rawEvents = Array.isArray(result.events) ? result.events.slice(-RAW_EVENT_CAP) : [];
      applyPublicWorld(result.publicWorld, { render: false });
      applyPricingPurchases(result.purchases);
      state.notifications = result.notifications || [];
    }
    serviceSessionAvailable = true;
    persist();
    enterWorld('server-guest');
    hydrateSessionExtras().then(() => migrateLegacyPublicContent());
  } catch (error) {
    showToast(error.message || '服务端暂时不可用');
    setPendingButton(button, false);
  }
});
$('#loginForm').addEventListener('submit', async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  if (!form.checkValidity()) return $('#loginError').textContent = '请填写有效账户和至少 8 位密码。';
  const submit = form.querySelector('[type="submit"]');
  setPendingButton(submit, true, '正在验证并载入进度…');
  $('#loginError').textContent = '';
  try {
    const data = new FormData(form);
    const result = await window.ZhereService.login({ identity: data.get('identity'), password: data.get('password') });
    serviceSessionAvailable = true;
    if (result.state) Object.assign(state, normalizeState(result.state));
    state.rawEvents = Array.isArray(result.events) ? result.events.slice(-RAW_EVENT_CAP) : [];
    if (result.user) {
      state.profile.nickname = result.user.nickname || state.profile.nickname;
      state.profile.username = result.user.username || state.profile.username;
      state.profile.spaceName = result.user.spaceName || state.profile.spaceName;
      state.research = Boolean(result.user.research);
    }
    persist();
    logEvent('login', { method: 'password' });
    enterWorld('server-login');
    hydrateSessionExtras().then(() => migrateLegacyPublicContent());
  } catch (error) {
    $('#loginError').textContent = error.message || '登录失败，请稍后重试。';
    setPendingButton(submit, false);
  }
});
$('#registerForm').addEventListener('submit', async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const data = new FormData(form);
  if (!form.checkValidity()) return $('#registerError').textContent = '请完整填写字段，并确认年龄和条款。';
  if (data.get('password') !== data.get('confirmPassword')) return $('#registerError').textContent = '两次密码不一致。';
  const submit = form.querySelector('[type="submit"]');
  setPendingButton(submit, true, '正在创建角色并准备公域…');
  $('#registerError').textContent = '';
  try {
    const result = await window.ZhereService.register({
      identity: data.get('identity'), username: data.get('username'), nickname: data.get('nickname'), spaceName: data.get('spaceName'),
      password: data.get('password'), confirmPassword: data.get('confirmPassword'), ageConfirmed: data.get('age') === 'on',
      agreeTerms: data.get('terms') === 'on', research: data.get('research') === 'on',
    });
    serviceSessionAvailable = true;
    if (result.state) Object.assign(state, normalizeState(result.state));
    state.rawEvents = Array.isArray(result.events) ? result.events.slice(-RAW_EVENT_CAP) : [];
    applyPublicWorld(result.publicWorld, { render: false });
    applyPricingPurchases(result.purchases);
    state.notifications = result.notifications || [];
    state.profile.nickname = data.get('nickname') || state.profile.nickname;
    state.profile.username = data.get('username') || state.profile.username;
    state.profile.spaceName = data.get('spaceName') || state.profile.spaceName;
    state.research = data.get('research') === 'on';
    persist();
    logEvent('register', { consent_research: state.research });
    enterWorld('server-register');
    hydrateSessionExtras().then(() => migrateLegacyPublicContent());
  } catch (error) {
    $('#registerError').textContent = error.message || '注册失败，请稍后重试。';
    setPendingButton(submit, false);
  }
});
$('#forgotForm').addEventListener('submit', async (event) => {
  event.preventDefault();
  const data = new FormData(event.currentTarget);
  try {
    await window.ZhereService.forgotPassword({ identity: data.get('identity'), note: data.get('note') });
    showEntryPage('welcome');
    showToast('人工重置申请已提交；当前不会自动发送邮件或短信');
  } catch (error) { showToast(error.message || '提交失败，请稍后重试'); }
});

worldStage.addEventListener('click', (event) => {
  if (event.target.closest('button')) return;
  closeContextWheel();
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
      renderPlaced();
      persist();
    } else {
      startPointerMove('cottage', cx, cy, { source: 'ground' });
    }
  } else {
    const targetX = state.wx + event.clientX - rect.left - rect.width / 2;
    const targetY = state.wy + event.clientY - rect.top - rect.height * .52;
    startPointerMove('overworld', targetX, targetY, { source: 'ground' });
  }
});

$$('.world-object').forEach((button) => button.addEventListener('click', (event) => {
  event.stopPropagation();
  const target = objectTargets[button.dataset.object];
  if (!target) return;
  if (state.worldMode === 'cottage') exitCottage();
  startPointerMove('overworld', target.wx, target.wy + 70, {
    source: `landmark:${button.dataset.object}`,
    label: target.label || button.getAttribute('aria-label') || '地标',
    stopDistance: 6,
    onArrival: observe,
  });
}));

window.addEventListener('keydown', (event) => {
  const key = event.key.toLowerCase();
  if (key === 'escape') {
    if (!contextWheel.hidden) { closeContextWheel(); player.focus(); return; }
    if (!sheet.hidden) { closeSheet(); return; }
    if (!profileDrawer.hidden) { profileDrawer.hidden = true; scrim.hidden = true; game.inert = false; profileReturnFocus?.focus?.(); profileReturnFocus = null; return; }
    if (pointerMoveTarget) { cancelPointerMove('escape_cancelled', true); showToast('已经停下'); return; }
    if (!entry.hidden && entry.classList.contains('is-gone') === false) {
      const activePage = $('.entry-page.is-active', entry);
      if (activePage && activePage.dataset.entryPage !== 'welcome') showEntryPage('welcome');
    }
    return;
  }
  if (event.target.matches('input, textarea, select')) return;
  if (!sheet.hidden) {
    if (key === ' ' && state.activeVideo) {
      event.preventDefault();
      togglePlayback(state.activeVideo);
    }
    return;
  }
  if (!profileDrawer.hidden) return;
  if (!entry.classList.contains('is-gone')) return;
  if (MOVEMENT_KEYS.has(key) || ['e', 'f', 'g', 'b', 'n', 'p', 'q', 'j', 'h', 'r', '?', ' '].includes(key)) event.preventDefault();
  if (MOVEMENT_KEYS.has(key)) {
    cancelPointerMove('keyboard_takeover');
    cottageExit.classList.remove('is-entering');
    state.keys.add(key);
  }
  if (event.repeat) return;
  if (key === 'q') toggleContextWheel();
  if (key === 'j') showJournal();
  if (key === '?') {
    const guideId = guideIdForNearest();
    const item = WORLD_GUIDE_ITEMS.find((entry) => entry.id === guideId);
    showWorldGuide(item?.category || 'start', guideId);
  }
  if (key === 'e') observe();
  if (key === 'f') useSecondaryVerb();
  if (key === 'g' && state.nearest?.type === 'video' && state.worldMode === 'overworld') openBidPanel(state.nearest.video);
  if (key === 'b' && state.worldMode === 'overworld') showBag();
  if (key === 'n' && state.worldMode === 'overworld') showLeaveNote(state.nearest?.type === 'video' ? state.nearest.video : null);
  if (key === 'p') showPublishAnywhere();
  if (key === 'h') goToHomestead();
  if (key === 'r') advanceDay();
});
window.addEventListener('keyup', (event) => {
  const key = event.key.toLowerCase();
  const wasPresent = state.keys.has(key);
  state.keys.delete(key);
  if (wasPresent && MOVEMENT_KEYS.has(key)) persist();
});

function stopMovement(savePosition = false) {
  const keyboardWasMoving = state.keys.size > 0;
  const pointerWasMoving = Boolean(pointerMoveTarget);
  state.keys.clear();
  cancelPointerMove('input_stopped', savePosition);
  player.classList.remove('is-moving');
  if (keyboardWasMoving && !pointerWasMoving) flushMovementSample('input_stopped');
  if (savePosition && keyboardWasMoving) persist();
}

window.addEventListener('blur', () => stopMovement(true));
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState !== 'visible') {
    stopMovement(true);
    if (telemetryWorldEntered && !telemetrySessionEnded) logEvent('session_pause', { duration_ms: Date.now() - telemetryStartedAt });
  } else if (telemetryWorldEntered && !telemetrySessionEnded) {
    resetMovementSample();
    logEvent('session_resume', { duration_ms: Date.now() - telemetryStartedAt });
  }
});
window.addEventListener('pagehide', () => endTelemetrySession('pagehide'));

cottageExit.addEventListener('click', (event) => {
  event.stopPropagation();
  walkToCottageExit();
});

window.addEventListener('resize', renderWorld);

$('#dialogueToggle').addEventListener('click', () => {
  const collapsed = dialogue.classList.toggle('is-collapsed');
  $('#dialogueToggle').textContent = collapsed ? '展开木秋的对话' : '收起';
  $('#dialogueToggle').setAttribute('aria-expanded', String(!collapsed));
});
$('#sheetClose').addEventListener('click', closeSheet);
scrim.addEventListener('click', () => {
  if (!sheet.hidden) closeSheet();
  if (!profileDrawer.hidden) {
    profileDrawer.hidden = true;
    game.inert = false;
    profileReturnFocus?.focus?.();
    profileReturnFocus = null;
  }
  scrim.hidden = true;
});
$('#profileButton').addEventListener('click', () => {
  stopMovement(true);
  closeContextWheel();
  profileReturnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  profileDrawer.hidden = false;
  scrim.hidden = false;
  game.inert = true;
  requestAnimationFrame(() => $('#profileClose').focus());
});
$('#profileClose').addEventListener('click', () => {
  profileDrawer.hidden = true;
  scrim.hidden = true;
  game.inert = false;
  profileReturnFocus?.focus?.();
  profileReturnFocus = null;
});
$$('[data-panel]').forEach((button) => button.addEventListener('click', () => showProfilePanel(button.dataset.panel)));
$('#logoutButton').addEventListener('click', async () => {
  $('#logoutButton').disabled = true;
  endTelemetrySession('logout');
  logEvent('logout');
  await window.ZhereService.logout().catch(() => {});
  localStorage.removeItem(STORAGE_KEY);
  localStorage.removeItem(LEGACY_STORAGE_KEY);
  localStorage.removeItem(SESSION_KEY);
  localStorage.removeItem(LEGACY_SESSION_KEY);
  location.reload();
});
$('#aboutButton').addEventListener('click', () => showWorldGuide('start', guideIdForNearest()));
$('#guideButton').addEventListener('click', () => showWorldGuide('start', guideIdForNearest()));
$('#eventButton').addEventListener('click', showAnomaly);
$('#bagButton').addEventListener('click', () => { if (state.worldMode === 'overworld') showBag(); });
$('#favoritesButton').addEventListener('click', showFavorites);
$('#echoButton').addEventListener('click', showEchoBox);
$('#homesteadButton').addEventListener('click', goToHomestead);
$('#dockHomeButton').addEventListener('click', goToHomestead);
$('#dockBagButton').addEventListener('click', () => state.worldMode === 'cottage' ? showPersonalSpace() : showBag());
$('#publishButton').addEventListener('click', showPublishAnywhere);
$('#actionButton').addEventListener('click', () => state.worldMode === 'cottage' ? showHomesteadPanel() : observe());
$('#journalButton').addEventListener('click', () => showJournal());
player.addEventListener('click', (event) => { event.stopPropagation(); toggleContextWheel(); });
$('#contextWheelClose').addEventListener('click', (event) => { event.stopPropagation(); closeContextWheel(); player.focus(); });
$$('[data-context-action]', contextWheel).forEach((button) => button.addEventListener('click', (event) => { event.stopPropagation(); runContextAction(button.dataset.contextAction); }));
$('#restButton').addEventListener('click', advanceDay);
$('#homeCabin').addEventListener('click', (event) => { event.stopPropagation(); showHomesteadPanel(); });
$('#dayStone').addEventListener('click', (event) => { event.stopPropagation(); advanceDay(); });

const initialEntryRoute = location.hash.replace('#/', '');
if (['login', 'register', 'forgot-password'].includes(initialEntryRoute)) showEntryPage(initialEntryRoute === 'forgot-password' ? 'forgot' : initialEntryRoute);

async function startApp() {
  try {
    const boot = await window.ZhereService.bootstrap();
    serviceSessionAvailable = boot.authenticated;
    if (boot.authenticated) {
      if (boot.state) Object.assign(state, normalizeState(boot.state));
      state.rawEvents = Array.isArray(boot.events) ? boot.events.slice(-RAW_EVENT_CAP) : [];
      if (boot.user) {
        state.profile.nickname = boot.user.nickname || state.profile.nickname;
        state.profile.username = boot.user.username || state.profile.username;
        state.profile.spaceName = boot.user.spaceName || state.profile.spaceName;
        state.research = Boolean(boot.user.research);
      }
      $('#guestButton').textContent = '继续上次漫游';
      // Browser storage is only a one-time seed for accounts without a server
      // world. Existing server progress must never be overwritten on startup.
      if (!boot.state) {
        await window.ZhereService.saveState(serializableState(), { immediate: true });
        await window.ZhereService.flushState();
      }
      localStorage.removeItem(STORAGE_KEY);
      localStorage.removeItem(LEGACY_STORAGE_KEY);
      localStorage.removeItem(SESSION_KEY);
      localStorage.removeItem(LEGACY_SESSION_KEY);
      hydrateSessionExtras().then(() => migrateLegacyPublicContent());
    } else {
      localStorage.removeItem(SESSION_KEY);
      localStorage.removeItem(LEGACY_SESSION_KEY);
    }
  } catch (error) {
    console.error(error);
    $('#guestButton').textContent = '服务暂不可用，请稍后重试';
  }

  worldVideos.forEach((video) => Object.assign(video, state.assetOverrides[video.id] || {}));
  worldStage.classList.toggle('event-muted', state.eventChoice === 'replace' || state.eventChoice === 'mix');
  if (!state.bottleState) spawnBottle();
  renderScreens();
  renderCreations();
  if (state.worldMode === 'overworld') renderPlaced();
  updateCounters();
  updateEchoCount();
  refreshIdentity();
  setInterval(persist, 15000);
  setInterval(() => {
    if (!entry.classList.contains('is-gone') || document.visibilityState !== 'visible') return;
    const now = Date.now();
    if (now - lastPublicSyncAt >= PUBLIC_SYNC_INTERVAL_MS) syncPublicWorld({ render: true });
    if (now - lastNotificationSyncAt >= NOTIFICATION_SYNC_INTERVAL_MS) refreshNotifications({ announce: true });
  }, 2000);
  if (state.worldMode === 'cottage') {
    worldStage.classList.add('is-cottage');
    worldArt.hidden = true;
    homesteadLayer.hidden = false;
    cottageExit.hidden = false;
    renderPlaced();
    renderHomestead();
  }
  renderWorld();
  setTimeout(() => $('#loading').classList.add('is-gone'), 180);
  setTimeout(() => { $('#loading').hidden = true; }, 900);
  requestAnimationFrame(frame);
}

startApp();
