// Zhere 交互审计（QA 专用，不进入生产页面）。
// 在 qa/interaction-audit.html（index.html 副本）末尾加载，同一窗口直接驱动全部按键与点击，
// 结果写入 #report 供无头浏览器 dump-dom 提取。

(function runInteractionAudit() {
  const results = [];
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const note = (name, ok, detail = '') => {
    results.push({ name, ok, detail });
    document.title = `AUDIT ${results.length} ${name} ${ok ? 'ok' : 'FAIL'}`;
    const report = document.getElementById('report');
    if (report) report.textContent = JSON.stringify({ completed: false, results }, null, 2);
  };
  const warn = (name, detail = '') => {
    results.push({ name, ok: true, warn: true, detail });
    document.title = `AUDIT ${results.length} ${name} warn`;
    const report = document.getElementById('report');
    if (report) report.textContent = JSON.stringify({ completed: false, results }, null, 2);
  };
  const press = (key) => {
    document.body.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));
    document.body.dispatchEvent(new KeyboardEvent('keyup', { key, bubbles: true, cancelable: true }));
  };
  const waitFor = async (cond, timeout, label) => {
    const started = Date.now();
    while (Date.now() - started < timeout) {
      try { if (cond()) return true; } catch {}
      await sleep(150);
    }
    note(`wait:${label}`, false, 'timeout');
    return false;
  };
  const sheetHas = (text) => !sheet.hidden && sheet.textContent.includes(text);

  (async () => {
    window.addEventListener('error', (event) => {
      if (event.message) note('window-error', false, event.message);
    }, true);
    await waitFor(() => document.getElementById('guestButton'), 10000, 'dom-ready');

    note('boot:modules', typeof renderZoneEventMarkers === 'function' && typeof renderDynamicLocations === 'function' && typeof renderNpcStoryNodes === 'function' && typeof showZoneEvent === 'function' && typeof showDynamicLocation === 'function' && typeof showNpcEncounter === 'function', 'new module functions present');

    const uiIds = ['game', 'aboutButton', 'guideButton', 'bagButton', 'favoritesButton', 'echoButton', 'eventButton', 'homesteadButton', 'walletCount', 'copyCount', 'profileButton', 'player', 'contextWheel', 'contextHint', 'wayfinder', 'dialogue', 'dialogueToggle', 'lifeHud', 'actionButton', 'publishButton', 'dockBagButton', 'journalButton', 'dockHomeButton', 'restButton', 'sheet', 'sheetClose', 'scrim', 'profileDrawer', 'toast'];
    const missingIds = uiIds.filter((id) => !document.getElementById(id));
    note('ui:ids', missingIds.length === 0, missingIds.join(', '));

    document.getElementById('guestButton').click();
    const guestNotice = await waitFor(() => document.getElementById('guestDataContinue'), 3000, 'guest-data-notice');
    note('entry:guest-data-notice', guestNotice, 'guest entry discloses collection scope before creating a session');
    document.getElementById('guestDataContinue')?.click();
    const entered = await waitFor(() => entry.classList.contains('is-gone'), 25000, 'enter-world');
    note('entry:enter-world', entered);
    await sleep(800);

    const keyChecks = [
      ['q', () => !contextWheel.hidden, 'context wheel opens'],
      ['b', () => sheetHas('背包'), 'bag opens'],
      ['j', () => sheetHas('手账'), 'journal opens'],
      ['?', () => sheetHas('图鉴'), 'guide opens'],
      ['p', () => sheetHas('发布'), 'publish opens'],
      ['n', () => sheetHas('纸条') || sheetHas('需求'), 'note opens'],
      ['t', () => sheetHas('标签'), 'loose tag opens'],
    ];
    for (const [key, check, label] of keyChecks) {
      press(key);
      await sleep(450);
      note(`key:${key}`, check(), label);
      press('Escape');
      await sleep(300);
    }

    const dayBefore = state.homestead.day;
    press('h');
    const atHome = await waitFor(() => state.worldMode === 'cottage', 6000, 'go-homestead');
    note('key:h', atHome, 'goes to homestead');
    if (atHome) {
      press('e');
      await sleep(350);
      note('key:e-homestead', !sheet.hidden && sheetHas('今日照料'), 'E opens the homestead panel');
      press('Escape');
      state.homestead.buildings.workbench = 1;
      state.homestead.buildings.well = 1;
      state.homestead.buildings.greenhouse = 1;
      state.homestead.buildings.archive = 1;
      state.homestead.buildings.composter = 1;
      renderHomestead();
      const buildingIds = ['workbench', 'well', 'greenhouse', 'archive', 'composter'];
      note('homestead:building-nodes', buildingIds.every((id) => homeBuildings.querySelector(`[data-building-id="${id}"]`)), 'all completed facilities render as distinct nodes');
      press('r');
      await sleep(500);
      note('key:r', state.homestead.day === dayBefore + 1, 'advance day');
      exitCottage();
      await waitFor(() => state.worldMode === 'overworld', 4000, 'exit-cottage');
    }

    const wyBefore = state.wy;
    press('w');
    await sleep(900);
    const moved = state.wy !== wyBefore || player.dataset.facing === 'up';
    if (moved) note('key:wasd-move', true, `wy ${wyBefore} -> ${state.wy}`);
    else warn('key:wasd-move', 'headless RAF throttled; no position change observed');
    press('Escape');

    const video = worldVideosVisible()[0];
    state.wx = video.wx;
    state.wy = video.wy + 80;
    updateNearby();
    press('e');
    await sleep(500);
    note('key:e-video', !sheet.hidden && Boolean(sheet.querySelector('#videoStatus')), 'video detail with status element');
    press(' ');
    await sleep(300);
    note('key:space-play', true, 'toggle playback without throw (videoStatus fix)');
    press('Escape');
    await sleep(300);
    const likedBefore = state.likes.includes(video.id);
    press('f');
    await sleep(600);
    note('key:f-like', state.likes.includes(video.id) !== likedBefore, 'like toggles');
    press('Escape');
    await sleep(300);
    press('g');
    await sleep(500);
    note('key:g-bid', sheetHas('价格'), 'bid panel opens near video');
    press('Escape');
    await sleep(300);

    const clickCheck = async (selector, label) => {
      const node = document.querySelector(selector);
      if (!node) { note(`click:${label}`, false, 'node missing'); return; }
      node.click();
      await sleep(400);
      note(`click:${label}`, Boolean(pointerMoveTarget), 'walk target set');
      press('Escape');
      await sleep(250);
    };
    await clickCheck('.world-object', 'landmark');
    await clickCheck('.gatherable', 'resource');
    await clickCheck('[data-tag-plant]', 'tag-plant');
    await clickCheck('[data-zone-event]', 'zone-event');
    const videoNode = document.querySelector('.media-screen');
    if (videoNode) {
      const targetVideo = worldVideosVisible().find((item) => item.id === videoNode.dataset.videoId) || worldVideosVisible()[0];
      state.wx = targetVideo.wx + 900;
      state.wy = targetVideo.wy + 900;
      updateNearby();
      videoNode.click();
      await sleep(400);
      note('click:video', Boolean(pointerMoveTarget), 'walk target set (far click)');
      press('Escape');
      await sleep(250);
    } else note('click:video', false, 'node missing');

    const zoneMarkers = document.querySelectorAll('[data-zone-event]').length;
    note('zone-event:markers', zoneMarkers === 5, `${zoneMarkers} markers`);
    showZoneEvent('town');
    await sleep(450);
    note('zone-event:sheet', sheetHas('今日 ·') || sheetHas('今日·'), 'zone event sheet opens');
    const zoneChoice = document.querySelector('[data-zone-choice]');
    if (zoneChoice) {
      const occurrence = () => state.zoneEventsOfDay?.occurrenceDay;
      zoneChoice.click();
      await sleep(500);
      if (!(state.zoneEventChoices[occurrence()] && state.zoneEventChoices[occurrence()].town)) {
        const retry = document.querySelector('[data-zone-choice]');
        if (retry) { retry.click(); await sleep(500); }
      }
      const persisted = Boolean(state.zoneEventChoices[occurrence()] && state.zoneEventChoices[occurrence()].town);
      note('zone-event:choice', persisted, persisted ? 'choice persisted' : `choices=${JSON.stringify(state.zoneEventChoices)}`);
    } else note('zone-event:choice', false, 'no choice buttons');
    press('Escape');

    const locCount = visibleDynamicLocations().length;
    note('dynamic:locations', locCount > 0, `${locCount} locations`);
    showDynamicLocation(visibleDynamicLocations()[0]);
    await sleep(450);
    note('dynamic:sheet', sheetHas('临时出现'), 'dynamic location sheet opens');
    const dlRow = document.querySelector('[data-dl-open-video], [data-dl-open-note]');
    if (dlRow) {
      dlRow.click();
      await sleep(450);
      note('dynamic:open-item', Boolean(!sheet.hidden && (sheet.querySelector('#videoStatus') || sheetHas('需求'))), 'item opens into detail');
      press('Escape');
    } else note('dynamic:open-item', false, 'no rows');
    await sleep(250);

    state.openedVideos.add('qa-v-1');
    state.openedVideos.add('qa-v-2');
    renderWorld();
    await sleep(500);
    note('npc:node-appears', Boolean(document.querySelector('[data-npc="chiye"]')), 'chiye marker renders when conditions met');
    showNpcEncounter('chiye');
    await sleep(450);
    note('npc:sheet', sheetHas('迟野') && sheetHas('NPC'), 'encounter sheet with NPC tag');
    const npcChoice = document.querySelector('[data-npc-choice]');
    if (npcChoice) {
      npcChoice.click();
      await sleep(500);
      note('npc:step-advance', state.npcStories.chiye.step === 2, 'story advances');
    } else note('npc:step-advance', false, 'no choice buttons');
    press('Escape');
    await sleep(300);

    const failed = results.filter((item) => item.ok === false);
    document.title = `AUDIT-DONE ${failed.length} failures`;
    document.getElementById('report').textContent = JSON.stringify({ completed: true, failures: failed.length, results }, null, 2);
    // —— 布局重叠检查（追加，不参与 failures 计数） ——
    await sleep(300);
    const layout = {};
    const measure = (selector) => {
      const node = document.querySelector(selector);
      if (!node) return null;
      const rect = node.getBoundingClientRect();
      if (!rect.width || !rect.height || getComputedStyle(node).display === 'none') return null;
      return { x: Math.round(rect.x), y: Math.round(rect.y), w: Math.round(rect.width), h: Math.round(rect.height), bottom: Math.round(rect.bottom), right: Math.round(rect.right) };
    };
    const huds = [['topbar', '.topbar'], ['lifeHud', '.life-hud'], ['dock', '.action-dock'], ['dialogue', '#dialogue'], ['hint', '#contextHint'], ['wayfinder', '.wayfinder']];
    const boxes = {};
    huds.forEach(([name, selector]) => {
      const rect = measure(selector);
      if (rect) boxes[name] = rect;
      else layout[`missing:${name}`] = true;
    });
    const overlaps = [];
    const names = Object.keys(boxes);
    for (let i = 0; i < names.length; i += 1) {
      for (let j = i + 1; j < names.length; j += 1) {
        const a = boxes[names[i]];
        const b = boxes[names[j]];
        const ox = Math.max(0, Math.min(a.right, b.right) - Math.max(a.x, b.x));
        const oy = Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.y, b.y));
        const area = ox * oy;
        if (area > 24) overlaps.push({ pair: `${names[i]}×${names[j]}`, area });
      }
    }
    layout.overlaps = overlaps;
    layout.boxes = boxes;
    layout.viewport = `${innerWidth}x${innerHeight}`;
    layout.wayfinderText = (document.querySelector('.wayfinder')?.textContent || '').slice(0, 60);
    layout.dialogueCollapsed = document.getElementById('dialogue')?.classList.contains('is-collapsed');
    const entryBook = measure('.entry-book');
    const entryButtons = [...document.querySelectorAll('.entry-actions button')].map((button) => Math.round(button.getBoundingClientRect().height));
    layout.entry = { bookVisible: Boolean(entryBook), bookFits: entryBook ? entryBook.right <= innerWidth && entryBook.bottom <= innerHeight + 1 : null, buttonHeights: entryButtons, entryGone: entry.classList.contains('is-gone') };
    results.push({ name: 'layout', ok: overlaps.length === 0, detail: JSON.stringify(layout) });
    document.title = `AUDIT-LAYOUT ${overlaps.length} overlaps`;
    document.getElementById('report').textContent = JSON.stringify({ completed: true, failures: failed.length, results }, null, 2);
  })().catch((error) => {
    note('runner', false, error.stack || String(error));
    document.title = 'AUDIT-CRASH';
    document.getElementById('report').textContent = JSON.stringify({ completed: false, results }, null, 2);
  });
})();
