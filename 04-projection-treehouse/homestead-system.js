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

function resourceLabel(key) {
  return { wood: '木料', stone: '石料', fiber: '纤维', seeds: '种子', produce: '收成' }[key] || key;
}

function energyCap() {
  return state.homestead.buildings.cabin ? 120 : 100;
}

function homeCapacity() {
  return HOME_CAPACITY + (state.homestead.buildings.cabin ? 8 : 0) + (creatorLevel().need >= 24 ? 4 : 0);
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

function enterCottage() {
  cancelPointerMove('space_enter');
  cottageExitPending = false;
  cottageExitArmed = false;
  if (cottageExitDistance() < HOMESTEAD_EXIT.armDistance) {
    state.cottageX = 50;
    state.cottageY = 62;
  }
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
  cancelPointerMove('go_to_homestead');
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
  cottageExitArmed = false;
  state.cottageX = 50;
  state.cottageY = 62;
  state.wx = objectTargets.cottage.wx + 240;
  state.wy = objectTargets.cottage.wy + 110;
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
  const near = state.worldMode === 'cottage' && cottageExitArmed && cottageExitDistance() <= 14;
  cottageExit.classList.toggle('is-near', near);
  cottageExit.setAttribute('aria-label', near ? '继续沿左侧小径返回开放公域' : '沿左侧小径返回开放公域');
}

function tryExitCottageByWalking() {
  if (state.worldMode !== 'cottage' || !cottageExitArmed || cottageExitPending || cottageExitDistance() > HOMESTEAD_EXIT.radius) return false;
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
  cottageExitArmed = true;
  cottageExit.classList.add('is-entering');
  startPointerMove('cottage', HOMESTEAD_EXIT.x, HOMESTEAD_EXIT.y, { source: 'cottage_exit' });
}
