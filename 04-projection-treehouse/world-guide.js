// Extracted from prototype.js. Loaded as a classic script to share the game runtime.
// Pure guide data and the world-guide sheet; references openSheet/closeSheet/objectTargets
// and other runtime globals defined by the surrounding scripts.

const WORLD_GUIDE_ITEMS = [
  { id: 'walk', category: 'start', title: '走动与靠近', summary: '世界没有外圈边界，角色始终在画面中央，地图从脚下延伸。', how: '使用 WASD 或方向键行走；点击地图会自动绕过溪流和围墙，沿桥或缺口抵达。', key: 'WASD' },
  { id: 'obstacles', category: 'start', title: '桥、溪流与残墙', summary: '深水与完整墙段不能直接穿过，但它们只占世界的一小部分，不会围出地图边界。', how: '点击障碍另一侧自动寻路；键盘行走时沿墙移动，寻找木桥、浅滩或残墙缺口。' },
  { id: 'observe', category: 'start', title: '观察与身边行动', summary: '靠近物件后，左上方会说明它是什么以及当前能做什么。', how: '按 E 执行主要动作；点击角色或按 Q 查看身边的全部动作。', key: 'E / Q' },
  { id: 'publish', category: 'start', title: '随走随发布', summary: '公域里的素材和需求不用送到固定大厅，能直接留在你站着的位置。', how: '按 P 发布视频或需求；按 N 直接留需求纸条。', key: 'P / N', action: 'publish' },
  { id: 'journal', category: 'start', title: '探索手账', summary: '真正看过的素材、纸条、地点和素材关系会成为可回访的个人足迹。', how: '按 J 打开手账；可以置顶记录，或沿地点记录回到附近。', key: 'J', action: 'journal' },
  { id: 'home-loop', category: 'start', title: '探索与家园循环', summary: '公共世界负责发现和采集，只有自己的地块能被永久开荒、种植、建造和摆放。', how: '按 H 回地块；完成一天的劳动后按 R 进入明天。', key: 'H / R', action: 'home' },

  { id: 'cottage', category: 'landmarks', title: '我的小屋', summary: '你唯一能够永久改变的空间，包含农田、建筑、制作和副本摆放。', how: '在公域靠近小屋按 E，或随时按 H 回到私域；离开时走到左侧“公域”路牌旁按 E，或直接点击路牌。', key: 'E / H', target: 'cottage' },
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
  { id: 'loosetag', category: 'discoveries', title: '旅人留下的标签', summary: '玩家可以随地插下一枚公共标签，其他旅人能捡走自己的副本。', how: '漫游时按 T 或打开身边行动盘；捡到后靠近视频按 F 贴上。', key: 'T / E / F' },
  { id: 'sticker', category: 'discoveries', title: '地图贴纸', summary: '散落在不同区域的小贴纸会进入个人贴纸册，不会因为别人收集而消失。', how: '靠近按 E 收集；在探索手账的“贴纸册”中贴进手账或放进小屋。', key: 'E / J' },
  { id: 'bottle', category: 'discoveries', title: '漂流瓶', summary: '海岸随机出现的发现，可能装着一句话、视频线索或标签。', how: '靠近按 E 打开；它不是每日必做任务。', key: 'E' },
  { id: 'nameless', category: 'discoveries', title: '无名处', summary: '地图上尚未被命名的小区域，名字只记录在你的世界视角里。', how: '靠近问号区域按 E，为它起名或重新命名。', key: 'E' },
  { id: 'relation', category: 'discoveries', title: '素材之间的线', summary: '两段公共素材可以被并排观察，留下呼应、反差、顺序或暂未说清的关系。', how: '打开任意视频选择“对照另一段”；保存的关系会进入探索手账。', action: 'journal' },

  { id: 'plots', category: 'homestead', title: '开荒与种植', summary: '16 块土地会永久保留清理、翻土、播种、浇水、生长和收获状态。', how: '在地块上点击土地逐步劳动；每次行动消耗体力。', action: 'home' },
  { id: 'buildings', category: 'homestead', title: '设施建造', summary: '工作台、水井、温室和小屋扩建会解锁制作、批量浇水、稳定生长与容量。', how: '回地块按 H 打开建设簿，准备足够木材与石材。', key: 'H', action: 'home' },
  { id: 'copies', category: 'homestead', title: '副本与摆放', summary: '副本是通过虚拟竞价获得的个人持有版本，不等同于收藏。', how: '视频旁按 G 竞价；获得后回地块按 F 摆放或收回。', key: 'G / F', action: 'home' },
  { id: 'craft', category: 'homestead', title: '地块制作', summary: '探索资源可以制作木鸟屋、露天放映台和种子压制等生活物件。', how: '先建工作台，再在建设簿中选择制作项目。', action: 'home' },
  { id: 'day', category: 'homestead', title: '体力、天气与明天', summary: '劳动消耗体力；天气和季节会影响土地，进入明天推动作物成长并让资源再生。', how: '在个人地块按 R 休息；世界不会因为你不休息而惩罚你。', key: 'R', action: 'home' },
];

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
  const ids = { video: 'video', note: 'note', resource: 'resource', tagplant: 'tagplant', loosetag: 'loosetag', sticker: 'sticker', bottle: 'bottle', nameless: 'nameless' };
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
          <div class="guide-entry-actions">${item.target ? `<button class="primary-button" type="button" data-guide-target="${item.target}">标记路线</button>` : ''}${item.action ? `<button class="paper-button" type="button" data-guide-action="${item.action}">现在试试</button>` : ''}</div>
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
    enhanceTabKeyboard($('.guide-categories', sheet), '[data-guide-category]', () => $('#guideEntries'));
  });
}

function travelFromGuide(targetId) {
  const target = objectTargets[targetId];
  if (!target) return showToast('这处地点暂时无法导航');
  if (targetId === 'cottage') return goToHomestead();
  if (state.worldMode === 'cottage') exitCottage();
  state.guidanceTarget = { wx: target.wx, wy: target.wy, label: target.label };
  closeSheet();
  persist();
  renderWorld();
  logEvent('guide_travel', { target_id: targetId });
  showToast(`已在右上方标记「${target.label}」，可以自己走过去`);
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
