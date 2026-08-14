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
    const totalCost = Object.values(meta.cost).reduce((sum, value) => sum + value, 0);
    assert.ok(totalCost > 0, `recipe ${recipeId} must cost something`);
  }
  for (const [buildingId, meta] of Object.entries(F.BUILDING_META)) {
    assert.ok(meta.name && meta.cost && meta.description, `building ${buildingId} incomplete`);
  }
  const discoveryIds = Object.values(F.DISCOVERY_META).map((meta) => meta.id);
  assert.equal(new Set(discoveryIds).size, discoveryIds.length, 'discovery ids must be unique');
  assert.equal(Object.keys(F.DISCOVERY_META).length, 6, 'one rare discovery per zone');
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
