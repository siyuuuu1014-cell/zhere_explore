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
    birdhouse: { name: '木鸟屋', need: 0, cost: { wood: 4, fiber: 2 }, coinCost: 8 },
    projector: { name: '露天放映台', need: 3, cost: { wood: 6, stone: 3 }, coinCost: 18 },
    windchime: { name: '木风铃', need: 3, cost: { wood: 3, fiber: 4 }, coinCost: 12 },
    leaflamp: { name: '叶灯', need: 24, cost: { wood: 5, stone: 2, produce: 2 }, coinCost: 28 },
    seeds: { name: '压出一袋种子', need: 0, cost: { fiber: 3, produce: 1 }, coinCost: 6, reward: { seeds: 6 } },
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
    workbench: { name: '露天工作台', cost: { wood: 12, stone: 6 }, coinCost: 20, description: '解锁地块装饰和种子压制。' },
    well: { name: '石砌水井', cost: { wood: 4, stone: 14 }, coinCost: 35, description: '每天免费为所有作物浇水一次。' },
    greenhouse: { name: '玻璃温室', cost: { wood: 24, stone: 18, produce: 3 }, coinCost: 80, description: '作物即使没有浇水也会缓慢生长。' },
    cabin: { name: '扩建小屋', cost: { wood: 18, stone: 12 }, coinCost: 90, description: '体力上限提高到 120，视频副本摆放容量增加 8。' },
    archive: { name: '叶片标本屋', need: 8, cost: { wood: 14, stone: 8, fiber: 6 }, coinCost: 60, description: '把各区域找到的稀有物夹进长期收藏图鉴。' },
    composter: { name: '林地堆肥坊', need: 15, cost: { wood: 12, stone: 6, produce: 2 }, coinCost: 50, description: '每天休息时把 2 份纤维慢慢变成 1 颗种子。' },
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
    buildingPlacements: {},
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

  // ---- P2.4 长期可玩性（第一轮）----

  const VALID_SEASONS = ['初春', '盛夏', '深秋', '冬日'];
  const VALID_WEATHER = ['晴', '雨', '风'];
  const EVENT_CONDITION_KINDS = ['openedVideos', 'likedCount', 'hasCopy'];
  const NPC_PROFILE_KEYS = ['openedVideos', 'likedCount', 'hasCopy', 'publishedDemand', 'placedCount', 'discoveredZones'];
  const ZONE_EVENT_ORDER = ['forest', 'hill', 'town', 'street', 'shore'];

  function stringSeed(value) {
    let hash = 2166136261;
    for (let index = 0; index < String(value).length; index += 1) {
      hash ^= String(value).charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }
    return hash >>> 0;
  }

  // choices 必须包含 id 为 ignore 的「什么都不做」选项；effect 只允许 resource/none/say。
  const ZONE_EVENT_DECK = [
    // 小树林
    { id: 'fe-forest-mushroom', zone: 'forest', title: '蘑菇圈在早晨排好了', summary: '林间空地上多了一圈浅色蘑菇，像有人在夜里悄悄点名。', seasons: ['初春', '盛夏'], weather: [], condition: null,
      choices: [{ id: 'circle', label: '蹲下来数一圈', desc: '也许数到一半会忘了开头', effect: { kind: 'resource', resource: 'fiber', amount: 2 } }, { id: 'ignore', label: '什么都不做', desc: '让蘑菇圈继续自己开会', effect: { kind: 'none' } }] },
    { id: 'fe-forest-fog', zone: 'forest', title: '雾径今天开了门', summary: '平时走不通的小径今天浮着一层雾，尽头好像有光。', seasons: [], weather: [], condition: null,
      choices: [{ id: 'walk', label: '沿雾走一小段', desc: '不去想它通向哪里', effect: { kind: 'say', text: '雾在身后合拢。你没有走丢，只是换了一条回来的路。' } }, { id: 'ignore', label: '改天再说', desc: '雾不会记仇', effect: { kind: 'none' } }] },
    { id: 'fe-forest-moss', zone: 'forest', title: '苔藓喝饱了雨', summary: '雨后的苔藓绿得发亮，踩上去会有很轻的水声。', seasons: ['初春'], weather: ['雨'], condition: null,
      choices: [{ id: 'touch', label: '轻轻按一下', desc: '收集一点潮湿的纤维', effect: { kind: 'resource', resource: 'fiber', amount: 1 } }, { id: 'ignore', label: '只看不碰', desc: '让它们继续亮着', effect: { kind: 'none' } }] },
    { id: 'fe-forest-bird', zone: 'forest', title: '看不见的鸟在换班', summary: '树冠里传来两声交接的鸣叫，白班的鸟和夜班的鸟在互相交代。', seasons: [], weather: ['晴'], condition: { kind: 'openedVideos', min: 2 },
      choices: [{ id: 'listen', label: '站在树下听', desc: '想起你最近看过的那段影像', effect: { kind: 'say', text: '鸟鸣里有很短的沉默。你最近看过的影像，好像也有同样的停顿。' } }, { id: 'ignore', label: '不打扰它们', desc: '换班不需要观众', effect: { kind: 'none' } }] },
    { id: 'fe-forest-stone', zone: 'forest', title: '石头们围成一圈', summary: '几块青石今天坐得特别整齐，像在等谁先开口。', seasons: [], weather: ['晴'], condition: null,
      choices: [{ id: 'sit', label: '坐进空着的位置', desc: '分到一小块好石头', effect: { kind: 'resource', resource: 'stone', amount: 2 } }, { id: 'ignore', label: '路过就好', desc: '会议继续', effect: { kind: 'none' } }] },
    { id: 'fe-forest-night', zone: 'forest', title: '夜行灯点起来了', summary: '天黑得早的季节，林子里有人留下了几盏暖色的小灯。', seasons: ['深秋', '冬日'], weather: ['晴'], condition: null,
      choices: [{ id: 'follow', label: '跟着灯走一段', desc: '灯之间隔着刚刚好的距离', effect: { kind: 'say', text: '灯把你送到林边就停下了，像送你回家的熟人。' } }, { id: 'ignore', label: '远远看一眼', desc: '灯光不必属于谁', effect: { kind: 'none' } }] },
    { id: 'fe-forest-root', zone: 'forest', title: '树根临时摆渡', summary: '一条粗根横在小溪上，今天的水位刚好让根露出水面。', seasons: [], weather: ['雨'], condition: null,
      choices: [{ id: 'cross', label: '踩着根过溪', desc: '顺手捡一根湿木', effect: { kind: 'resource', resource: 'wood', amount: 1 } }, { id: 'ignore', label: '绕远路', desc: '不着急过溪', effect: { kind: 'none' } }] },
    { id: 'fe-forest-silence', zone: 'forest', title: '林子安静日', summary: '今天林子里几乎没有风，连叶子都放轻了脚步。', seasons: ['冬日'], weather: [], condition: null,
      choices: [{ id: 'stay', label: '站一会儿', desc: '安静也是一种收获', effect: { kind: 'say', text: '安静落下来，像一层很轻的雪。' } }, { id: 'ignore', label: '继续走', desc: '不打扰这一天的安静', effect: { kind: 'none' } }] },

    // 山坡
    { id: 'fe-hill-eagle', zone: 'hill', title: '鹰影在巡山', summary: '一只鹰的影子从坡顶慢慢滑过，像在检查今天的地形。', seasons: ['盛夏'], weather: ['晴', '风'], condition: null,
      choices: [{ id: 'watch', label: '抬头看它一圈', desc: '它也在看你', effect: { kind: 'say', text: '鹰没有叫。它把你当成山坡上会移动的一部分。' } }, { id: 'ignore', label: '继续赶路', desc: '巡山不查行人', effect: { kind: 'none' } }] },
    { id: 'fe-hill-stones', zone: 'hill', title: '石阵今天有回声', summary: '风穿过石阵时，石块之间传来很低的共鸣。', seasons: [], weather: ['风'], condition: null,
      choices: [{ id: 'knock', label: '敲一下旁边的石头', desc: '借走一小块会响的石头', effect: { kind: 'resource', resource: 'stone', amount: 2 } }, { id: 'ignore', label: '听它自己响', desc: '回声不需要回应', effect: { kind: 'none' } }] },
    { id: 'fe-hill-bell', zone: 'hill', title: '风铃草开成片了', summary: '坡上开出一片风铃草，风一来就轻轻点头。', seasons: ['初春', '盛夏'], weather: [], condition: null,
      choices: [{ id: 'gather', label: '收几粒种子', desc: '等它们落进口袋', effect: { kind: 'resource', resource: 'seeds', amount: 1 } }, { id: 'ignore', label: '让它们再开一会儿', desc: '花不急着结籽', effect: { kind: 'none' } }] },
    { id: 'fe-hill-cloud', zone: 'hill', title: '云从脚边过', summary: '今天云很低，站在坡上像踩着一层很慢的海。', seasons: ['深秋'], weather: [], condition: null,
      choices: [{ id: 'stand', label: '在云里站一会儿', desc: '什么都看不见，什么都听得见', effect: { kind: 'say', text: '云过去以后，远处多了一条你没走过的路。' } }, { id: 'ignore', label: '趁没起雾先走', desc: '云不会拦路', effect: { kind: 'none' } }] },
    { id: 'fe-hill-snow', zone: 'hill', title: '今年的初雪线', summary: '雪线停在半坡，像一条很轻的白边。', seasons: ['冬日'], weather: ['晴'], condition: null,
      choices: [{ id: 'trace', label: '沿着雪线走', desc: '把脚印留在雪线上面一点点', effect: { kind: 'say', text: '雪线没有因为你走过而改变。它只是多了一串很小的脚印。' } }, { id: 'ignore', label: '在山下看', desc: '远远的也很好', effect: { kind: 'none' } }] },
    { id: 'fe-hill-kite', zone: 'hill', title: '断线风筝挂在坡上', summary: '一只断了线的风筝挂在灌木上，尾巴还在风里动。', seasons: [], weather: ['风'], condition: { kind: 'likedCount', min: 1 },
      choices: [{ id: 'free', label: '帮它解开线结', desc: '收下一点结实的线', effect: { kind: 'resource', resource: 'fiber', amount: 1 } }, { id: 'ignore', label: '让它继续挂着', desc: '它可能还在等人', effect: { kind: 'none' } }] },
    { id: 'fe-hill-stars', zone: 'hill', title: '山坡的观星位空着', summary: '坡上最好的观星位置今天没有人，草都长顺了方向。', seasons: [], weather: ['晴'], condition: null,
      choices: [{ id: 'reserve', label: '记下这个位置', desc: '也许晚上会想回来', effect: { kind: 'say', text: '你把手账翻到空白页，画了一个只有自己看得懂的小标记。' } }, { id: 'ignore', label: '白天的星星不营业', desc: '位置会一直在', effect: { kind: 'none' } }] },
    { id: 'fe-hill-herd', zone: 'hill', title: '看不见的羊群', summary: '风把云压成一群慢慢移动的羊，从这坡走到那坡。', seasons: [], weather: ['风'], condition: null,
      choices: [{ id: 'count', label: '试着数一数', desc: '数到第七只就乱了', effect: { kind: 'say', text: '你数到第七只，羊群就散成了云。今天没有牧羊人。' } }, { id: 'ignore', label: '云不是羊', desc: '它们只是长得像', effect: { kind: 'none' } }] },

    // 镇中心
    { id: 'fe-town-tickets', zone: 'town', title: '旧票根堆在公告树下', summary: '风把一叠旧放映票根吹到树下，票面日期都模糊了。', seasons: [], weather: ['风'], condition: { kind: 'openedVideos', min: 2 },
      choices: [{ id: 'keep', label: '挑一张收进手账', desc: '留一枚不存在的场次', effect: { kind: 'resource', resource: 'seeds', amount: 1 } }, { id: 'ignore', label: '让风继续收着', desc: '票根属于街道', effect: { kind: 'none' } }] },
    { id: 'fe-town-paperflags', zone: 'town', title: '纸旗日', summary: '镇中心挂起了纸旗，风一过整条街都在轻轻地响。', seasons: [], weather: ['风'], condition: null,
      choices: [{ id: 'fix', label: '扶正一面歪掉的旗', desc: '收下替换下来的旧纸绳', effect: { kind: 'resource', resource: 'fiber', amount: 2 } }, { id: 'ignore', label: '听旗响', desc: '今天不用修任何东西', effect: { kind: 'none' } }] },
    { id: 'fe-town-bell', zone: 'town', title: '午后的钟慢了一拍', summary: '镇上的钟今天慢了半拍，所有人都没发现，除了你。', seasons: [], weather: ['晴'], condition: null,
      choices: [{ id: 'wait', label: '等下一声钟', desc: '看看它会不会追上', effect: { kind: 'say', text: '下一声钟赶上了。时间重新对齐，你的下午多出了半拍。' } }, { id: 'ignore', label: '慢就慢吧', desc: '钟有自己的节奏', effect: { kind: 'none' } }] },
    { id: 'fe-town-awning', zone: 'town', title: '雨棚在开小音乐会', summary: '雨打在街边的雨棚上，节奏偶尔会变。', seasons: [], weather: ['雨'], condition: null,
      choices: [{ id: 'listen', label: '站在棚下听完', desc: '不买什么，只躲雨', effect: { kind: 'say', text: '雨声换了一种拍子。等你走出去，它又变回去了。' } }, { id: 'ignore', label: '撑伞路过', desc: '音乐会在原地', effect: { kind: 'none' } }] },
    { id: 'fe-town-bench', zone: 'town', title: '长椅换了新漆', summary: '街心长椅刚刷了新漆，旁边立着「未干」的小牌子。', seasons: ['初春'], weather: ['晴'], condition: null,
      choices: [{ id: 'sign', label: '在牌子上补一句', desc: '提醒下一位旅人', effect: { kind: 'say', text: '你补了一句「慢慢来」。风把牌子吹得翻了个面，那句话朝向了街。' } }, { id: 'ignore', label: '不坐也不写', desc: '新漆值得被完整保留', effect: { kind: 'none' } }] },
    { id: 'fe-town-lantern', zone: 'town', title: '有人提前挂灯', summary: '离天黑还早，有人已经把灯笼挂上了檐角。', seasons: ['深秋', '冬日'], weather: [], condition: null,
      choices: [{ id: 'help', label: '帮递一盏灯', desc: '收下一小截灯绳', effect: { kind: 'resource', resource: 'fiber', amount: 1 } }, { id: 'ignore', label: '等天黑再看', desc: '灯会自己亮起来', effect: { kind: 'none' } }] },
    { id: 'fe-town-cart', zone: 'town', title: '手推车临时集市', summary: '一辆手推车停在街角，卖着不知道什么时候会卖完的小东西。', seasons: [], weather: ['晴'], condition: { kind: 'likedCount', min: 2 },
      choices: [{ id: 'browse', label: '看看有什么', desc: '用一枚喜欢换一包种子', effect: { kind: 'resource', resource: 'seeds', amount: 1 } }, { id: 'ignore', label: '今天不逛集市', desc: '车明天可能就不在', effect: { kind: 'none' } }] },
    { id: 'fe-town-dust', zone: 'town', title: '招牌擦亮日', summary: '沿街的招牌今天集体反光，像刚下过一场很细的雨。', seasons: [], weather: ['晴'], condition: null,
      choices: [{ id: 'polish', label: '帮擦一块够不着的', desc: '分到一小块磨石', effect: { kind: 'resource', resource: 'stone', amount: 1 } }, { id: 'ignore', label: '让它们亮着', desc: '反光会一直留到黄昏', effect: { kind: 'none' } }] },

    // 商业街
    { id: 'fe-street-window', zone: 'street', title: '橱窗在自己换季', summary: '沿街橱窗一夜之间换了布置，像这条街自己做了决定。', seasons: ['初春', '深秋'], weather: [], condition: null,
      choices: [{ id: 'look', label: '一家家看过去', desc: '记下最喜欢的搭配', effect: { kind: 'say', text: '你最喜欢的那扇橱窗留着一小片空白，像在等谁的作品。' } }, { id: 'ignore', label: '换季与我无关', desc: '橱窗会自己照顾自己', effect: { kind: 'none' } }] },
    { id: 'fe-street-sign', zone: 'street', title: '招牌灯在白天试亮', summary: '有家店的招牌灯忘了关，白天也亮着一小团暖光。', seasons: ['冬日'], weather: ['晴'], condition: null,
      choices: [{ id: 'stand', label: '在灯下站一会儿', desc: '白天借一点夜晚', effect: { kind: 'say', text: '灯在太阳底下也不尴尬。它像在练习晚上的自己。' } }, { id: 'ignore', label: '有人会来关的', desc: '或者不会', effect: { kind: 'none' } }] },
    { id: 'fe-street-cat', zone: 'street', title: '看店猫出来巡街', summary: '各家看店的猫轮流出门，沿着固定的路线检查这条街。', seasons: [], weather: ['晴'], condition: { kind: 'openedVideos', min: 3 },
      choices: [{ id: 'follow', label: '跟着走半条街', desc: '不打扰，只观察', effect: { kind: 'say', text: '猫在宠物店橱窗前停了一下，像在检查自己出现在影像里的样子。' } }, { id: 'ignore', label: '让猫自己巡', desc: '它们不需要随从', effect: { kind: 'none' } }] },
    { id: 'fe-street-bag', zone: 'street', title: '免费纸袋随雨派送', summary: '雨一来，各家门口挂出叠好的纸袋，谁都可以拿。', seasons: [], weather: ['雨'], condition: null,
      choices: [{ id: 'take', label: '拿一只空纸袋', desc: '拆开是很好的纤维', effect: { kind: 'resource', resource: 'fiber', amount: 2 } }, { id: 'ignore', label: '留给需要的人', desc: '袋子明天还会在', effect: { kind: 'none' } }] },
    { id: 'fe-street-chalk', zone: 'street', title: '粉笔菜单写到街边', summary: '有家店把今天的菜单用粉笔写到了门口的地面上。', seasons: [], weather: ['晴'], condition: null,
      choices: [{ id: 'read', label: '蹲下来读一遍', desc: '字比菜单本身好看', effect: { kind: 'say', text: '最后一行写着「不够可以再画」。你站起来，鞋底沾了一点粉笔灰。' } }, { id: 'ignore', label: '不踩过去', desc: '绕开那些字', effect: { kind: 'none' } }] },
    { id: 'fe-street-plant', zone: 'street', title: '盆栽在店门口列队', summary: '街边的盆栽今天排得特别齐，像在等一场雨或者一次检阅。', seasons: ['初春', '盛夏'], weather: [], condition: null,
      choices: [{ id: 'water', label: '给最渴的一盆浇水', desc: '收下几粒熟透的种子', effect: { kind: 'resource', resource: 'seeds', amount: 1 } }, { id: 'ignore', label: '让店主来', desc: '队伍已经很整齐', effect: { kind: 'none' } }] },
    { id: 'fe-street-night', zone: 'street', title: '夜市提前开门', summary: '今天的夜市开得特别早，摊位上的灯比路灯先亮。', seasons: ['深秋'], weather: ['晴'], condition: null,
      choices: [{ id: 'walk', label: '逛到第一家收摊', desc: '什么也不买', effect: { kind: 'say', text: '第一家收摊时，你帮他把一块篷布折好了。他说明天还来。' } }, { id: 'ignore', label: '等真正天黑', desc: '夜市不会跑', effect: { kind: 'none' } }] },
    { id: 'fe-street-sale', zone: 'street', title: '假装打折日', summary: '好几家店同时挂出「最后一天」，但明天它们还会在。', seasons: [], weather: [], condition: { kind: 'likedCount', min: 1 },
      choices: [{ id: 'smile', label: '配合地进去看看', desc: '最后一天每天都过', effect: { kind: 'say', text: '店主冲你眨眨眼。这个「最后一天」已经过了十七次。' } }, { id: 'ignore', label: '不上当', desc: '明天见', effect: { kind: 'none' } }] },

    // 海岸
    { id: 'fe-shore-tide', zone: 'shore', title: '今晚预告有夜光潮', summary: '海边的人说今晚的浪会带一点点蓝光，没有人保证。', seasons: ['盛夏'], weather: ['晴'], condition: null,
      choices: [{ id: 'remember', label: '记下涨潮时间', desc: '也许晚上会来看', effect: { kind: 'say', text: '你把涨潮时间写进手账。就算不来，海也照常发光。' } }, { id: 'ignore', label: '发光是海自己的事', desc: '不替它做保证', effect: { kind: 'none' } }] },
    { id: 'fe-shore-line', zone: 'shore', title: '潮线在换衣服', summary: '今天的潮水把旧潮线卷走，又画了一条新的。', seasons: [], weather: ['风'], condition: null,
      choices: [{ id: 'collect', label: '沿着新潮线走', desc: '捡走一点海留下的纤维', effect: { kind: 'resource', resource: 'fiber', amount: 2 } }, { id: 'ignore', label: '让潮线自己留白', desc: '明天又是新的', effect: { kind: 'none' } }] },
    { id: 'fe-shore-shells', zone: 'shore', title: '贝壳在沙滩上排队', summary: '退潮后贝壳排成一条很长的线，像谁的清单。', seasons: [], weather: ['晴'], condition: null,
      choices: [{ id: 'pick', label: '捡走最圆的一枚', desc: '清单少了一项', effect: { kind: 'resource', resource: 'stone', amount: 1 } }, { id: 'ignore', label: '不打断排队', desc: '它们等的是海', effect: { kind: 'none' } }] },
    { id: 'fe-shore-wind', zone: 'shore', title: '海风替人收伞', summary: '一阵风把沙滩上的遮阳伞收了好几把，动作很熟练。', seasons: [], weather: ['风'], condition: null,
      choices: [{ id: 'help', label: '帮一把收伞', desc: '收下被风递来的绳子', effect: { kind: 'resource', resource: 'fiber', amount: 1 } }, { id: 'ignore', label: '风自己可以的', desc: '它练过', effect: { kind: 'none' } }] },
    { id: 'fe-shore-fog', zone: 'shore', title: '海雾把远处擦掉了', summary: '海和天的分界线今天被雾擦掉，世界好像只剩这一小段岸。', seasons: ['初春', '深秋'], weather: [], condition: null,
      choices: [{ id: 'stand', label: '在雾里站一会儿', desc: '听雾里的船号', effect: { kind: 'say', text: '雾里传来一声很远的船号。你看不见它，但它知道你在这里。' } }, { id: 'ignore', label: '等雾散', desc: '海不会丢', effect: { kind: 'none' } }] },
    { id: 'fe-shore-bottle', zone: 'shore', title: '空瓶子整整齐齐地回岸', summary: '几只空瓶子被浪送回来，排成一排，像交作业。', seasons: [], weather: [], condition: { kind: 'openedVideos', min: 2 },
      choices: [{ id: 'read', label: '看看瓶子里有没有纸条', desc: '收下瓶口的一点细绳', effect: { kind: 'resource', resource: 'seeds', amount: 1 } }, { id: 'ignore', label: '让它们继续漂', desc: '也许有人正等回信', effect: { kind: 'none' } }] },
    { id: 'fe-shore-foot', zone: 'shore', title: '无人的脚印一路向海', summary: '一串脚印从岸上走进浪里，没有人从海里走回来。', seasons: [], weather: ['雨'], condition: null,
      choices: [{ id: 'follow', label: '走到脚印消失的地方', desc: '在浪边停下', effect: { kind: 'say', text: '脚印的主人大概是坐船走了。你在最后一枚脚印旁，放了一小块贝壳。' } }, { id: 'ignore', label: '不去猜', desc: '浪会替它收尾', effect: { kind: 'none' } }] },
    { id: 'fe-shore-cold', zone: 'shore', title: '冬海安静得出奇', summary: '冬天的海收起了声音，浪都放轻了。', seasons: ['冬日'], weather: [], condition: null,
      choices: [{ id: 'sit', label: '在岸边坐一会儿', desc: '和安静并排坐', effect: { kind: 'say', text: '冬天的海不用说话。你坐了一会儿，觉得自己的呼吸也变慢了。' } }, { id: 'ignore', label: '风太大了', desc: '改天再来听', effect: { kind: 'none' } }] },
  ];

  const ZONE_EVENT_SPOTS = {
    forest: [[-2600, -300], [-3000, 60], [-2200, -700], [-3400, -100]],
    hill: [[300, -2000], [-500, -2600], [900, -1600], [-900, -2200]],
    town: [[-1200, -600], [400, -200], [-900, 100], [1100, -900]],
    street: [[1900, -300], [2600, -800], [1600, 100], [3100, -100]],
    shore: [[400, 600], [-1500, 700], [2400, 450], [-800, 800]],
  };

  function eventConditionMet(condition, profile) {
    if (!condition) return true;
    if (condition.kind === 'openedVideos') return (profile.openedVideos || 0) >= condition.min;
    if (condition.kind === 'likedCount') return (profile.likedCount || 0) >= condition.min;
    if (condition.kind === 'hasCopy') return Boolean(profile.hasCopy);
    return false;
  }

  function zoneEventForDay(zoneId, day, season, weather, rand, profile = {}) {
    const candidates = ZONE_EVENT_DECK.filter((event) => event.zone === zoneId
      && (!event.seasons.length || event.seasons.includes(season))
      && (!event.weather.length || event.weather.includes(weather))
      && eventConditionMet(event.condition, profile));
    if (!candidates.length) return null;
    return candidates[Math.floor(rand() * candidates.length) % candidates.length];
  }

  function zoneEventSpot(zoneId, day) {
    const spots = ZONE_EVENT_SPOTS[zoneId] || [];
    if (!spots.length) return null;
    const index = ZONE_EVENT_ORDER.indexOf(zoneId);
    const rand = mulberry32(day * 31 + (index >= 0 ? index + 1 : 7));
    return spots[Math.floor(rand() * spots.length)];
  }

  const DYNAMIC_LOCATION_RULES = { themeMinAssets: 3, themeMaxPerDay: 2, hotMinLikes: 5, campMinDemands: 2, landmarkClearance: 380 };
  const DYNAMIC_ZONE_BOUNDS = {
    forest: { x: [-3300, -1950], y: [-900, 220] },
    hill: { x: [-1500, 1500], y: [-2900, -1500] },
    town: { x: [-1500, 1250], y: [-1150, 220] },
    street: { x: [1520, 3300], y: [-1150, 250] },
    shore: { x: [-2500, 3100], y: [380, 850] },
  };

  function dynamicLocationThemes(videos) {
    const byTag = new Map();
    for (const video of videos || []) {
      for (const tag of video.tags || []) {
        if (!byTag.has(tag)) byTag.set(tag, []);
        byTag.get(tag).push(video);
      }
    }
    return [...byTag.entries()]
      .map(([tag, items]) => ({ tag, count: items.length, videos: items }))
      .filter((entry) => entry.count >= DYNAMIC_LOCATION_RULES.themeMinAssets)
      .sort((a, b) => b.count - a.count);
  }

  function dynamicLocationPosition(seedKey, zoneId, clearanceFn) {
    const bounds = DYNAMIC_ZONE_BOUNDS[zoneId];
    if (!bounds) return null;
    const rand = mulberry32(stringSeed(seedKey));
    for (let attempt = 0; attempt < 8; attempt += 1) {
      const wx = Math.round(bounds.x[0] + rand() * (bounds.x[1] - bounds.x[0]));
      const wy = Math.round(bounds.y[0] + rand() * (bounds.y[1] - bounds.y[0]));
      if (!clearanceFn || clearanceFn(wx, wy)) return { wx, wy };
    }
    return null;
  }

  const NPC_STORY_DEFS = [
    {
      id: 'chiye', name: '迟野', glyph: '迟', color: '#6f9d94', title: '海边来的收集者',
      steps: [
        { step: 1, zone: 'shore', title: '潮线边的收集者', conditions: [{ kind: 'openedVideos', min: 2 }],
          text: '你在海岸边遇见一个背着旧布袋的人，她正在把冲上来的东西分类。「海每天交作业，」她说，「我负责检查。」她抬头看看你，像认出了什么：「你看过{lastAsset}，对不对？那段影像里海的颜色，和今天一模一样。」',
          choices: [{ label: '聊聊那段影像', reply: '「原来有人也记得它。」迟野笑了，从袋子里摸出一枚被海水磨圆的玻璃片送给你看。', advance: true }, { label: '先打个招呼就离开', reply: '迟野点点头：「海不会跑。下次涨潮时见。」', advance: false }] },
        { step: 2, zone: 'street', title: '商业街的橱窗评审', conditions: [{ kind: 'openedVideos', min: 4 }, { kind: 'likedCount', min: 1 }],
          text: '迟野站在商业街的橱窗前，像在给每一扇窗打分。「我把喜欢的都记下来了，」她看见你，把本子翻开一角，「你也点赞过一些东西。咱俩的清单，说不定有重合。」',
          choices: [{ label: '交换一下喜欢', reply: '你们对过清单，真的有两项重合。迟野在那一页画了个小海浪。', advance: true }, { label: '不交换清单', reply: '「也好，」迟野合上本子，「喜欢是很私人的事。」', advance: false }] },
        { step: 3, zone: 'hill', title: '山坡上的估值练习', conditions: [{ kind: 'hasCopy' }],
          text: '迟野坐在山坡上，脚边摊着几样小东西。「我听说你用报价买下过一段素材，」她头也不回，「值不值和喜不喜欢，你会怎么分？」',
          choices: [{ label: '说说你的答案', reply: '迟野听完，把一枚种子放在你手里：「这是我在山坡上找到的最好的答案。」', advance: true }, { label: '这个问题太难了', reply: '迟野笑了：「不急。海等了我三年，才等到我想明白。」', advance: false }] },
        { step: 4, zone: 'town', title: '镇中心的告别礼物', conditions: [],
          text: '迟野在镇中心等你，布袋比第一次见面时瘪了很多。「我要去更北边的海岸了，」她说，「但我不想让这段认识就这样漂走。」她递给你一只小布袋：「种子和纤维，是我从四个地方攒的。你带回家吧——让它们在你那里继续长。」',
          choices: [{ label: '收下并道别', reply: '你收下了袋子。迟野摆摆手，朝海的方向走去，没有再回头。', advance: true, reward: { resources: { seeds: 3, fiber: 2 }, text: '迟野的布袋进了你的背包。袋子上画着一道很小的海浪。' } }, { label: '再站一会儿', reply: '你们又站了一会儿，谁都没有说话。风替你们道了别。', advance: false }] },
      ],
      afterTexts: ['迟野回来了，只是路过。她问你的收集进展，像老朋友一样。', '迟野坐在老地方，说海最近交的作业都很漂亮。', '迟野说她又想起你们一起看过的{lastAsset}。'],
      reward: { resources: { seeds: 3, fiber: 2 } },
    },
    {
      id: 'nanzhi', name: '南枝', glyph: '南', color: '#b8654f', title: '爱贴标签的园丁',
      steps: [
        { step: 1, zone: 'town', title: '公告树下的标签匠', conditions: [{ kind: 'publishedDemand', min: 1 }],
          text: '南枝在公告树旁整理一堆小标签，每一张都写着很细的字。「我看到了你留下的纸条，」她头也不抬，「会提需求的人，说明真的想要点什么东西。这很好。」',
          choices: [{ label: '问她在写什么', reply: '「给树上的新纸条写推荐标签。」南枝把一张写着「值得细看」的标签递给你。', advance: true }, { label: '不打扰她工作', reply: '南枝点点头，继续写她的标签。', advance: false }] },
        { step: 2, zone: 'forest', title: '树林里的植物笔记', conditions: [{ kind: 'likedCount', min: 3 }],
          text: '南枝蹲在小树林里，给一株植物画速写。「你点赞过的东西，我都偷偷看过，」她有点不好意思，「我想知道别人眼里的好是什么样子。你比我会挑。」',
          choices: [{ label: '告诉她你的标准', reply: '南枝认真记了下来，画完速写后撕下半页送给你。', advance: true }, { label: '其实没有标准', reply: '「没有标准也是标准，」南枝想了想，「这更难，也更好。」', advance: false }] },
        { step: 3, zone: 'shore', title: '海岸边的布置课', conditions: [{ kind: 'placedCount', min: 2 }],
          text: '南枝在海边摆弄几块石头，排了又拆。「听说你的小窝里摆了自己的副本，」她说，「摆东西最难的不是放进去，是后来看着它的时候，还觉得对。」',
          choices: [{ label: '和她讨论摆放', reply: '南枝教你一个办法：先放最想每天看见的，别的围着它。', advance: true }, { label: '我的摆法全凭感觉', reply: '「凭感觉最好，」南枝说，「感觉是最早的那双眼睛。」', advance: false }] },
        { step: 4, zone: 'hill', title: '山坡上的种子约定', conditions: [{ kind: 'discoveredZones', min: 3 }],
          text: '南枝站在山坡上，风把她的标签吹得哗哗响。「你走过的地方比很多旅人都多了，」她说，「我要搬去更暖的地方了。这包种子是我按你点赞过的素材配的——喜欢的东西，应该能在自己的地里长出来。」',
          choices: [{ label: '收下种子约定', reply: '你收下种子。南枝说：「等第一株发芽，替我去看一次海。」', advance: true, reward: { resources: { seeds: 4, wood: 2 }, text: '南枝的种子包上贴着标签：「会长成你喜欢的样子」。' } }, { label: '约定明年回来看', reply: '南枝笑了：「那我每年都回来看看它。」', advance: false }] },
      ],
      afterTexts: ['南枝回来照看她的植物，顺便看了看你的背包。', '南枝说你的地如果缺标签，她随时可以写。', '南枝又想起你点赞过的素材，问你后来有没有再看。'],
      reward: { resources: { seeds: 4, wood: 2 } },
    },
  ];

  const NPC_SPOTS = {
    chiye: [[420, 700], [1900, -240], [300, -1800], [220, -60]],
    nanzhi: [[100, -120], [-2100, -260], [-300, 700], [500, -1700]],
  };

  function npcStoryConditionMet(conditions, profile) {
    const values = profile || {};
    return (conditions || []).every((condition) => {
      if (condition.kind === 'openedVideos') return (values.openedVideos || 0) >= condition.min;
      if (condition.kind === 'likedCount') return (values.likedCount || 0) >= condition.min;
      if (condition.kind === 'hasCopy') return Boolean(values.hasCopy);
      if (condition.kind === 'publishedDemand') return (values.publishedDemand || 0) >= condition.min;
      if (condition.kind === 'placedCount') return (values.placedCount || 0) >= condition.min;
      if (condition.kind === 'discoveredZones') return (values.discoveredZones || 0) >= condition.min;
      return false;
    });
  }

  function gameplayAchievementKey(rawEvent, details = {}, eventId = '') {
    const target = details.asset_id || details.demand_id || details.zone_id || details.discovery_id || '';
    if (rawEvent === 'tag_add') return `${rawEvent}:${target}:${String(details.tag || '').trim().toLowerCase()}`;
    if (rawEvent === 'homestead_crop_harvested') return `${rawEvent}:${details.day || 0}:${details.plot_index ?? ''}:${details.crop_id || ''}`;
    return target ? `${rawEvent}:${target}` : eventId ? `${rawEvent}:${eventId}` : '';
  }

  function applyWalletChange(wallet, economy, amount, meta = {}) {
    const balance = Math.max(0, Number(wallet) || 0);
    const normalized = Math.round(Number(amount) * 100) / 100;
    if (!Number.isFinite(normalized) || normalized === 0 || (normalized < 0 && balance + normalized < 0)) return null;
    const nextBalance = Math.max(0, Math.round((balance + normalized) * 100) / 100);
    const nextEconomy = {
      version: 1,
      earned: Math.max(0, Number(economy?.earned) || 0),
      spent: Math.max(0, Number(economy?.spent) || 0),
      transactions: Array.isArray(economy?.transactions) ? [...economy.transactions] : [],
    };
    if (normalized > 0) nextEconomy.earned = Math.round((nextEconomy.earned + normalized) * 100) / 100;
    else nextEconomy.spent = Math.round((nextEconomy.spent + Math.abs(normalized)) * 100) / 100;
    const transaction = {
      id: String(meta.id || ''), type: String(meta.type || 'gameplay'), amount: normalized, balance: nextBalance,
      sourceId: String(meta.sourceId || ''), label: String(meta.label || '灵感币变化'), createdAt: String(meta.createdAt || ''),
    };
    nextEconomy.transactions.push(transaction);
    nextEconomy.transactions = nextEconomy.transactions.slice(-240);
    return { wallet: nextBalance, economy: nextEconomy, transaction };
  }

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
    VALID_SEASONS,
    VALID_WEATHER,
    EVENT_CONDITION_KINDS,
    NPC_PROFILE_KEYS,
    ZONE_EVENT_ORDER,
    ZONE_EVENT_DECK,
    ZONE_EVENT_SPOTS,
    DYNAMIC_LOCATION_RULES,
    DYNAMIC_ZONE_BOUNDS,
    NPC_STORY_DEFS,
    NPC_SPOTS,
    freshPlots,
    mulberry32,
    zoneAt,
    stringSeed,
    zoneEventForDay,
    zoneEventSpot,
    dynamicLocationThemes,
    dynamicLocationPosition,
    npcStoryConditionMet,
    gameplayAchievementKey,
    applyWalletChange,
  });
})(globalThis);
