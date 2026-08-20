import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

// world-foundation.js is a browser classic script exposing an IIFE result on
// globalThis. Evaluating it in this context keeps the data contracts testable
// without a DOM or test framework in the browser bundle.
const foundationPath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'world-foundation.js');
vm.runInThisContext(readFileSync(foundationPath, 'utf8'), { filename: 'world-foundation.js' });
const F = globalThis.ZhereWorldFoundation;

test('world foundation exposes a frozen pure-data contract', () => {
  assert.ok(F, 'ZhereWorldFoundation should be exposed');
  assert.ok(Object.isFrozen(F), 'exposed contract should be frozen');
  for (const key of ['RESOURCE_META', 'CROP_META', 'CRAFT_RECIPES', 'BUILDING_META', 'ZONE_DEFS', 'ZONE_SPAWN', 'HOMESTEAD_DEFAULT', 'DISCOVERY_META', 'WORLD_CYCLES', 'CREATOR_TIERS', 'AVATAR_SWATCHES', 'STARTER_GATHERABLES']) {
    assert.ok(F[key], `missing contract member ${key}`);
  }
});

test('freshPlots creates 16 plots with the first four cleared', () => {
  const plots = F.freshPlots();
  assert.equal(plots.length, F.PLOT_COUNT);
  assert.equal(F.PLOT_COUNT, 16);
  plots.forEach((plot, index) => {
    assert.equal(plot.state, index < 4 ? 'cleared' : 'wild');
    assert.equal(plot.stage, 0);
    assert.equal(plot.growth, 0);
    assert.equal(plot.cropId, '');
    assert.equal(plot.watered, false);
  });
});

test('mulberry32 is deterministic and stays in [0, 1)', () => {
  const a = F.mulberry32(1234);
  const b = F.mulberry32(1234);
  for (let i = 0; i < 32; i += 1) {
    const va = a();
    assert.equal(va, b(), 'same seed must produce the same sequence');
    assert.ok(va >= 0 && va < 1, 'values must be within [0, 1)');
  }
  const freshA = F.mulberry32(1234);
  const freshB = F.mulberry32(1234);
  const different = F.mulberry32(4321)();
  assert.equal(freshA(), freshB(), 'fresh generators with the same seed must agree on the first roll');
  assert.notEqual(different, freshA(), 'different seeds must not necessarily match the second roll');
});

test('zoneAt matches the documented six-zone precedence', () => {
  assert.equal(F.zoneAt(0, 0).id, 'town');
  assert.equal(F.zoneAt(2000, 0).id, 'street');
  assert.equal(F.zoneAt(-2000, 0).id, 'forest');
  assert.equal(F.zoneAt(0, -2000).id, 'hill');
  assert.equal(F.zoneAt(0, 500).id, 'shore');
  assert.equal(F.zoneAt(0, 1200).id, 'sea');
  assert.equal(F.zoneAt(1500, 100).id, 'street');
  assert.equal(F.zoneAt(100, 2000).id, 'sea');
});

test('zone spawn plan covers 52 daily placements across six zones', () => {
  const totalSlots = Object.values(F.ZONE_SPAWN).reduce((sum, spec) => sum + spec.slots, 0);
  assert.equal(totalSlots, 52);
  for (const [zoneId, spec] of Object.entries(F.ZONE_SPAWN)) {
    assert.equal(F.ZONE_DEFS.some((zone) => zone.id === zoneId), true, `spawn zone ${zoneId} must exist in ZONE_DEFS`);
    assert.ok(Array.isArray(spec.x) && Array.isArray(spec.y));
    assert.ok(spec.x[1] > spec.x[0] && spec.y[1] > spec.y[0]);
    assert.ok(Number.isInteger(spec.slots) && spec.slots > 0);
  }
});

test('resource, crop, recipe and building metadata stay internally consistent', () => {
  for (const [type, meta] of Object.entries(F.RESOURCE_META)) {
    assert.ok(meta.label && meta.energy > 0 && meta.reward && Object.keys(meta.reward).length > 0, `resource ${type} incomplete`);
  }
  for (const [cropId, meta] of Object.entries(F.CROP_META)) {
    assert.ok(meta.name && meta.days > 0 && meta.yield > 0 && Array.isArray(meta.seasons), `crop ${cropId} incomplete`);
  }
  assert.equal(F.CROP_META.fieldbean.need, 0);
  assert.equal(F.CROP_META.nightberry.need, 24);
  for (const [recipeId, meta] of Object.entries(F.CRAFT_RECIPES)) {
    assert.ok(meta.name && meta.cost, `recipe ${recipeId} missing cost`);
    assert.ok(Number.isFinite(meta.coinCost) && meta.coinCost > 0, `recipe ${recipeId} needs a coin sink`);
    const totalCost = Object.values(meta.cost).reduce((sum, value) => sum + value, 0);
    assert.ok(totalCost > 0, `recipe ${recipeId} must cost something`);
  }
  for (const [buildingId, meta] of Object.entries(F.BUILDING_META)) {
    assert.ok(meta.name && meta.cost && meta.description, `building ${buildingId} incomplete`);
    assert.ok(Number.isFinite(meta.coinCost) && meta.coinCost > 0, `building ${buildingId} needs a coin sink`);
  }
  const discoveryIds = Object.values(F.DISCOVERY_META).map((meta) => meta.id);
  assert.equal(new Set(discoveryIds).size, discoveryIds.length, 'discovery ids must be unique');
  assert.equal(Object.keys(F.DISCOVERY_META).length, 6, 'one rare discovery per zone');
});

test('gameplay achievement keys deduplicate repeatable actions by target', () => {
  assert.equal(F.gameplayAchievementKey('like', { asset_id: 'asset-1' }, 'event-1'), 'like:asset-1');
  assert.equal(F.gameplayAchievementKey('like', { asset_id: 'asset-1' }, 'event-2'), 'like:asset-1');
  assert.equal(F.gameplayAchievementKey('tag_add', { asset_id: 'asset-1', tag: ' 雨夜 ' }), 'tag_add:asset-1:雨夜');
  assert.equal(F.gameplayAchievementKey('homestead_crop_harvested', { day: 4, plot_index: 2, crop_id: 'fieldbean' }), 'homestead_crop_harvested:4:2:fieldbean');
});

test('wallet changes produce balanced ledger entries and reject overdrafts', () => {
  const opening = { version: 1, earned: 0, spent: 0, transactions: [] };
  const earned = F.applyWalletChange(20, opening, 9, { id: 'income-1', type: 'harvest_reward', label: '收获风铃豆', createdAt: '2026-08-18T00:00:00.000Z' });
  assert.equal(earned.wallet, 29);
  assert.equal(earned.economy.earned, 9);
  assert.equal(earned.transaction.balance, 29);
  const spent = F.applyWalletChange(earned.wallet, earned.economy, -12, { id: 'spend-1', type: 'homestead_spend', label: '制作木风铃', createdAt: '2026-08-18T00:01:00.000Z' });
  assert.equal(spent.wallet, 17);
  assert.equal(spent.economy.spent, 12);
  assert.equal(spent.economy.transactions.length, 2);
  assert.equal(F.applyWalletChange(spent.wallet, spent.economy, -18, { id: 'overdraft' }), null);
});

test('homestead default matches the documented starting state', () => {
  const home = F.HOMESTEAD_DEFAULT;
  assert.equal(home.day, 1);
  assert.equal(home.energy, 100);
  assert.equal(home.season, '初春');
  assert.equal(home.weather, '晴');
  assert.equal(home.plots.length, 16);
  assert.ok(home.resources.wood >= 0 && home.resources.stone >= 0 && home.resources.fiber >= 0 && home.resources.seeds >= 0);
  assert.ok(['workbench', 'well', 'greenhouse', 'cabin', 'archive', 'composter'].every((key) => Object.hasOwn(home.buildings, key)));
});

test('creator tiers and world cycles keep unique ids and zones', () => {
  const tierIds = F.CREATOR_TIERS.map((tier) => tier.id);
  assert.equal(new Set(tierIds).size, tierIds.length);
  assert.deepEqual([...tierIds].sort((a, b) => a.localeCompare(b)), ['builder', 'echo', 'recorder', 'visitor', 'weaver'].sort((a, b) => a.localeCompare(b)));
  const cycleIds = F.WORLD_CYCLES.map((cycle) => cycle.id);
  assert.equal(new Set(cycleIds).size, cycleIds.length);
  assert.equal(F.WORLD_CYCLES.length, 5, 'one daily world cycle per land zone');
});

test('zone event deck covers five land zones with eight valid events each', () => {
  const deck = F.ZONE_EVENT_DECK;
  assert.ok(Array.isArray(deck) && deck.length >= 40, 'deck should hold at least 40 events');
  for (const zone of ['forest', 'hill', 'town', 'street', 'shore']) {
    const events = deck.filter((event) => event.zone === zone);
    assert.ok(events.length >= 8, `${zone} needs at least 8 events`);
  }
  const ids = deck.map((event) => event.id);
  assert.equal(new Set(ids).size, ids.length, 'event ids must be unique');
  for (const event of deck) {
    assert.ok(event.title && event.summary, `event ${event.id} needs copy`);
    assert.ok(Array.isArray(event.choices) && event.choices.length >= 2 && event.choices.length <= 4, `event ${event.id} needs 2-4 choices`);
    assert.ok(event.choices.some((choice) => choice.id === 'ignore'), `event ${event.id} needs an ignore choice`);
    assert.ok(event.choices.every((choice) => ['resource', 'none', 'say'].includes(choice.effect?.kind)), `event ${event.id} has invalid effect kind`);
    assert.ok(event.choices.every((choice) => choice.effect?.kind !== 'resource' || ['wood', 'stone', 'fiber', 'seeds'].includes(choice.effect.resource)), `event ${event.id} has invalid resource`);
    assert.ok(event.seasons.every((season) => F.VALID_SEASONS.includes(season)), `event ${event.id} has invalid season`);
    assert.ok(event.weather.every((weather) => F.VALID_WEATHER.includes(weather)), `event ${event.id} has invalid weather`);
    if (event.condition) assert.ok(F.EVENT_CONDITION_KINDS.includes(event.condition.kind), `event ${event.id} has invalid condition`);
  }
});

test('zone event selection is deterministic and respects filters', () => {
  const rand = F.mulberry32(20260814);
  const first = F.zoneEventForDay('forest', 7, '初春', '雨', rand, { openedVideos: 0, likedCount: 0, hasCopy: false });
  const second = F.mulberry32(20260814);
  const again = F.zoneEventForDay('forest', 7, '初春', '雨', second, { openedVideos: 0, likedCount: 0, hasCopy: false });
  assert.equal(first?.id, again?.id, 'same seed must pick the same event');
  const seasonal = F.mulberry32(99);
  const picked = F.zoneEventForDay('forest', 3, '冬日', '晴', seasonal, { openedVideos: 0, likedCount: 0, hasCopy: false });
  assert.ok(picked && (!picked.seasons.length || picked.seasons.includes('冬日')), 'picked event must match season');
  assert.ok(picked && (!picked.weather.length || picked.weather.includes('晴')), 'picked event must match weather');
  assert.ok(picked && !(picked.condition?.kind === 'openedVideos' && picked.condition.min > 0), 'condition-gated event must not surface for empty profile');
  const gated = F.mulberry32(5);
  const ungated = F.zoneEventForDay('street', 9, '盛夏', '晴', gated, { openedVideos: 0, likedCount: 0, hasCopy: false });
  assert.ok(ungated && !(ungated.condition && ungated.condition.min > 0), 'picked event must satisfy profile conditions');
  const none = F.zoneEventForDay('sea', 1, '初春', '晴', F.mulberry32(1), { openedVideos: 0, likedCount: 0, hasCopy: false });
  assert.equal(none, null, 'sea has no zone event deck');
});

test('zone event spots live inside their zones and are deterministic', () => {
  for (const zone of ['forest', 'hill', 'town', 'street', 'shore']) {
    const spots = F.ZONE_EVENT_SPOTS[zone];
    assert.equal(spots.length, 4, `${zone} needs 4 spots`);
    spots.forEach(([wx, wy]) => assert.equal(F.zoneAt(wx, wy).id, zone, `${zone} spot ${wx},${wy} misplaced`));
  }
  const spotA = F.zoneEventSpot('town', 12);
  const spotB = F.zoneEventSpot('town', 12);
  assert.deepEqual(spotA, spotB, 'spot must be deterministic per day');
  assert.ok(F.ZONE_EVENT_SPOTS.town.some(([wx, wy]) => wx === spotA[0] && wy === spotA[1]));
});

test('dynamic location rules aggregate themes and keep landmark clearance', () => {
  const videos = [
    { id: 'a1', tags: ['海边', '慢镜头'], likes: 2 },
    { id: 'a2', tags: ['海边'], likes: 1 },
    { id: 'a3', tags: ['海边', '夜晚'], likes: 0 },
    { id: 'b1', tags: ['雨天'], likes: 8 },
    { id: 'c1', tags: ['海边'], likes: 1 },
  ];
  const themes = F.dynamicLocationThemes(videos);
  assert.equal(themes[0].tag, '海边');
  assert.equal(themes[0].count, 4);
  assert.equal(themes[0].videos.length, 4);
  assert.ok(themes.every((entry) => entry.count >= F.DYNAMIC_LOCATION_RULES.themeMinAssets));
  const landmarks = [{ wx: 0, wy: 0 }, { wx: 260, wy: -60 }];
  const clearance = (wx, wy) => landmarks.every((item) => Math.hypot(wx - item.wx, wy - item.wy) >= F.DYNAMIC_LOCATION_RULES.landmarkClearance);
  const spot = F.dynamicLocationPosition('test:seed', 'town', clearance);
  assert.ok(spot, 'position must be found with clearance');
  assert.ok(clearance(spot.wx, spot.wy), 'position must respect landmark clearance');
  assert.equal(F.dynamicLocationPosition('test:seed', 'sea', clearance), null, 'sea has no dynamic zone bounds');
});

test('npc story definitions keep valid four-step arcs', () => {
  const defs = F.NPC_STORY_DEFS;
  assert.equal(defs.length, 2, 'two npc storylines');
  const npcIds = defs.map((npc) => npc.id);
  assert.equal(new Set(npcIds).size, npcIds.length);
  for (const npc of defs) {
    assert.ok(npc.name && npc.glyph && npc.title, `${npc.id} needs identity`);
    assert.ok(npc.steps.length >= 3 && npc.steps.length <= 5, `${npc.id} needs 3-5 steps`);
    assert.ok(npc.afterTexts.length >= 2, `${npc.id} needs repeat-visit lines`);
    assert.ok(Object.keys(npc.reward.resources).every((key) => ['wood', 'stone', 'fiber', 'seeds'].includes(key)), `${npc.id} reward invalid`);
    npc.steps.forEach((step, index) => {
      assert.equal(step.step, index + 1, `${npc.id} step order`);
      assert.ok(F.ZONE_DEFS.some((zone) => zone.id === step.zone), `${npc.id} step ${step.step} zone invalid`);
      assert.ok(Array.isArray(step.conditions), `${npc.id} step ${step.step} conditions array`);
      step.conditions.forEach((condition) => assert.ok(F.NPC_PROFILE_KEYS.includes(condition.kind), `${npc.id} step ${step.step} condition invalid`));
      assert.ok(step.choices.some((choice) => choice.advance), `${npc.id} step ${step.step} needs an advance choice`);
      assert.ok(step.choices.every((choice) => choice.label && choice.reply), `${npc.id} step ${step.step} choice copy`);
      assert.ok(F.NPC_SPOTS[npc.id]?.[index], `${npc.id} step ${step.step} missing spot`);
    });
    const lastStep = npc.steps.at(-1);
    assert.ok(lastStep.choices.some((choice) => choice.reward), `${npc.id} final step needs a reward choice`);
  }
  const profile = { openedVideos: 3, likedCount: 1, hasCopy: false, publishedDemand: 0, placedCount: 0, discoveredZones: 0 };
  assert.equal(F.npcStoryConditionMet([{ kind: 'openedVideos', min: 2 }], profile), true);
  assert.equal(F.npcStoryConditionMet([{ kind: 'openedVideos', min: 4 }], profile), false);
  assert.equal(F.npcStoryConditionMet([], profile), true);
});
