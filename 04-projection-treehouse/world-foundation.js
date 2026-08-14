(function exposeWorldFoundation(root) {
  const PLOT_COUNT = 16;

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
    { glyph: '风', color: '#6f9d94', label: '追风邮差' },
    { glyph: '木', color: '#6f8060', label: '林间木匠' },
    { glyph: '潮', color: '#b8654f', label: '潮线记录者' },
    { glyph: '岩', color: '#9a7f5e', label: '礁石看守' },
    { glyph: '雾', color: '#57684c', label: '晨雾旅人' },
    { glyph: '贝', color: '#8a9d7d', label: '贝壳收藏家' },
    { glyph: '灯', color: '#c4914f', label: '慢街点灯人' },
    { glyph: '芽', color: '#7f956b', label: '新芽园丁' },
    { glyph: '云', color: '#718d8a', label: '山云观察员' },
    { glyph: '猫', color: '#a87058', label: '窗台访客' },
  ];

  const ZONE_DEFS = [
    { id: 'sea', name: '海面', test: (x, y) => y > 900 },
    { id: 'shore', name: '海岸', test: (x, y) => y > 300 },
    { id: 'hill', name: '山坡', test: (x, y) => y < -1300 },
    { id: 'forest', name: '小树林', test: (x) => x <= -1800 },
    { id: 'street', name: '商业街', test: (x) => x >= 1400 },
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

  root.ZhereWorldFoundation = Object.freeze({
    PLOT_COUNT,
    RESOURCE_META,
    CREATOR_TIERS,
    CROP_META,
    CRAFT_RECIPES,
    DISCOVERY_META,
    WORLD_CYCLES,
    STARTER_GATHERABLES,
    BUILDING_META,
    HOMESTEAD_DEFAULT,
    AVATAR_SWATCHES,
    ZONE_DEFS,
    ZONE_SPAWN,
    freshPlots,
    mulberry32,
    zoneAt,
  });
})(globalThis);
