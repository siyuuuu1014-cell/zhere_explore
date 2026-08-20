import test from 'node:test';
import assert from 'node:assert/strict';
import { createRecommendationSyncScheduler } from './recommendation-sync-scheduler.mjs';

function runtimeConfig(enabled = true) {
  return {
    recommendationSync: {
      enabled,
      initialDelayMs: 30_000,
      intervalMs: 900_000,
      timeoutMs: 1_200_000,
    },
  };
}

function silentLogger() {
  return { log() {}, error() {} };
}

test('recommendation sync scheduler skips overlapping runs', async () => {
  let finish;
  let calls = 0;
  const runSync = () => {
    calls += 1;
    return new Promise((resolve) => { finish = resolve; });
  };
  const scheduler = createRecommendationSyncScheduler({ config: runtimeConfig(), runSync, logger: silentLogger() });
  const first = scheduler.runNow('test');
  await Promise.resolve();
  const overlapping = await scheduler.runNow('test-overlap');
  assert.equal(calls, 1);
  assert.deepEqual(overlapping, { ok: false, skipped: 'already_running' });
  finish({ stdoutTail: 'synced' });
  assert.equal((await first).ok, true);
  assert.equal(scheduler.isRunning(), false);
});

test('disabled recommendation sync neither schedules nor runs', async () => {
  let scheduled = false;
  let calls = 0;
  const scheduler = createRecommendationSyncScheduler({
    config: runtimeConfig(false),
    runSync: async () => { calls += 1; },
    logger: silentLogger(),
    setTimer: () => { scheduled = true; },
  });
  scheduler.start();
  assert.deepEqual(await scheduler.runNow(), { ok: false, skipped: 'disabled' });
  assert.equal(scheduled, false);
  assert.equal(calls, 0);
});

test('stopping recommendation sync aborts the active background run', async () => {
  let observedAbort = false;
  const runSync = ({ signal }) => new Promise((resolve, reject) => {
    signal.addEventListener('abort', () => {
      observedAbort = true;
      const error = new Error('stopped');
      error.name = 'AbortError';
      reject(error);
    }, { once: true });
  });
  const scheduler = createRecommendationSyncScheduler({ config: runtimeConfig(), runSync, logger: silentLogger() });
  const running = scheduler.runNow('test-stop');
  await Promise.resolve();
  scheduler.stop();
  const result = await running;
  assert.equal(observedAbort, true);
  assert.equal(result.ok, false);
  assert.equal(result.error.name, 'AbortError');
});
