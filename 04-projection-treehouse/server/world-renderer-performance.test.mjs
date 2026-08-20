import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('desktop movement reuses terrain chunks and keeps ambient life frame-synchronized', async () => {
  const [prototypeSource, rendererSource] = await Promise.all([
    readFile(path.join(projectRoot, 'prototype.js'), 'utf8'),
    readFile(path.join(projectRoot, 'world-renderer.js'), 'utf8'),
  ]);

  assert.match(prototypeSource, /const terrainChunkCache = new Map\(\)/);
  assert.match(prototypeSource, /const AMBIENT_UPDATE_INTERVAL_MS = 16/);
  assert.match(rendererSource, /className = 'terrain-chunk'/);
  assert.match(rendererSource, /dataset\.reusedChunks/);
  assert.match(rendererSource, /function refreshWorldViewportMetrics\(\)/);

  const movementFrame = rendererSource.match(/function updateWorldMovementFrame[\s\S]*?\n}\n/)?.[0] || '';
  assert.match(movementFrame, /updateAmbientLife\(now, true\)/);
  assert.match(rendererSource, /ambientLifeLoop\.handle = requestAnimationFrame\(frame\)/);
  assert.doesNotMatch(rendererSource, /setInterval\([\s\S]*?updateAmbientLife/);
});

test('entry, telemetry, and overscan rendering exclude inactive controls and impressions', async () => {
  const [indexSource, prototypeSource, rendererSource, telemetrySource] = await Promise.all([
    readFile(path.join(projectRoot, 'index.html'), 'utf8'),
    readFile(path.join(projectRoot, 'prototype.js'), 'utf8'),
    readFile(path.join(projectRoot, 'world-renderer.js'), 'utf8'),
    readFile(path.join(projectRoot, 'telemetry-system.js'), 'utf8'),
  ]);

  assert.match(indexSource, /<main class="game"[^>]*\sinert>/);
  assert.match(prototypeSource, /state\.impressionAccum = \{\};\s*telemetryWorldEntered = true;/);
  assert.match(rendererSource, /function setWorldNodeInteractivity\(node, interactive\)/);
  assert.match(rendererSource, /setWorldNodeInteractivity\(node, intersectsViewport\)/);
  assert.match(telemetrySource, /if \(!telemetryWorldEntered \|\| telemetrySessionEnded\) return;/);
});
