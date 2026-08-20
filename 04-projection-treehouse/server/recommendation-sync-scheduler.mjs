import { spawn } from 'node:child_process';
import path from 'node:path';

const OUTPUT_TAIL_LIMIT = 8 * 1024;

function appendTail(previous, chunk) {
  return `${previous}${String(chunk)}`.slice(-OUTPUT_TAIL_LIMIT);
}

function abortError() {
  const error = new Error('Recommendation sync was stopped.');
  error.name = 'AbortError';
  return error;
}

export function runRecommendationSyncProcess(runtimeConfig, { signal, spawnProcess = spawn } = {}) {
  const scriptPath = path.join(runtimeConfig.appDir, 'scripts', 'recommendation-research-sync.mjs');
  return new Promise((resolve, reject) => {
    let settled = false;
    let stdoutTail = '';
    let stderrTail = '';
    const child = spawnProcess(process.execPath, [scriptPath, '--apply', '--yes', '--prune'], {
      cwd: runtimeConfig.appDir,
      env: process.env,
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    });
    const finish = (callback, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      signal?.removeEventListener('abort', onAbort);
      callback(value);
    };
    const stopChild = () => {
      if (!child.killed) child.kill('SIGTERM');
    };
    const onAbort = () => {
      stopChild();
      finish(reject, abortError());
    };
    const timeout = setTimeout(() => {
      stopChild();
      const error = new Error(`Recommendation sync exceeded ${runtimeConfig.recommendationSync.timeoutMs} ms.`);
      error.code = 'SYNC_TIMEOUT';
      error.stdoutTail = stdoutTail;
      error.stderrTail = stderrTail;
      finish(reject, error);
    }, runtimeConfig.recommendationSync.timeoutMs);
    timeout.unref?.();
    child.stdout?.on('data', (chunk) => { stdoutTail = appendTail(stdoutTail, chunk); });
    child.stderr?.on('data', (chunk) => { stderrTail = appendTail(stderrTail, chunk); });
    child.once('error', (error) => finish(reject, error));
    child.once('close', (code, childSignal) => {
      if (code === 0) {
        finish(resolve, { code, signal: childSignal, stdoutTail, stderrTail });
        return;
      }
      const error = new Error(`Recommendation sync exited with code ${code ?? 'null'}${childSignal ? ` (${childSignal})` : ''}.`);
      error.code = 'SYNC_PROCESS_FAILED';
      error.stdoutTail = stdoutTail;
      error.stderrTail = stderrTail;
      finish(reject, error);
    });
    if (signal?.aborted) onAbort();
    else signal?.addEventListener('abort', onAbort, { once: true });
  });
}

function writeLog(logger, level, payload) {
  const method = level === 'error' ? 'error' : 'log';
  logger?.[method]?.(JSON.stringify({ level, kind: 'recommendation_sync', ...payload, at: new Date().toISOString() }));
}

export function createRecommendationSyncScheduler({
  config,
  logger = console,
  runSync = ({ signal }) => runRecommendationSyncProcess(config, { signal }),
  setTimer = setTimeout,
  clearTimer = clearTimeout,
} = {}) {
  let timer = null;
  let activeRun = null;
  let activeController = null;
  let stopped = true;

  const schedule = (delayMs) => {
    if (stopped || !config.recommendationSync.enabled) return;
    timer = setTimer(() => {
      timer = null;
      void runNow('scheduled').finally(() => schedule(config.recommendationSync.intervalMs));
    }, delayMs);
    timer?.unref?.();
  };

  const runNow = (trigger = 'manual') => {
    if (!config.recommendationSync.enabled) return Promise.resolve({ ok: false, skipped: 'disabled' });
    if (activeRun) {
      writeLog(logger, 'info', { status: 'skipped', reason: 'already_running', trigger });
      return Promise.resolve({ ok: false, skipped: 'already_running' });
    }
    activeController = new AbortController();
    const startedAt = Date.now();
    writeLog(logger, 'info', { status: 'started', trigger });
    activeRun = Promise.resolve()
      .then(() => runSync({ signal: activeController.signal, trigger }))
      .then((result) => {
        writeLog(logger, 'info', {
          status: 'completed', trigger, duration_ms: Date.now() - startedAt,
          stdout_tail: result?.stdoutTail?.trim() || undefined,
        });
        return { ok: true, result };
      })
      .catch((error) => {
        const stoppedRun = error?.name === 'AbortError';
        writeLog(logger, stoppedRun ? 'info' : 'error', {
          status: stoppedRun ? 'stopped' : 'failed', trigger, duration_ms: Date.now() - startedAt,
          error: error?.message || String(error), stderr_tail: error?.stderrTail?.trim() || undefined,
        });
        return { ok: false, error };
      })
      .finally(() => {
        activeRun = null;
        activeController = null;
      });
    return activeRun;
  };

  return {
    start() {
      if (!stopped) return;
      stopped = false;
      if (!config.recommendationSync.enabled) {
        writeLog(logger, 'info', { status: 'disabled' });
        return;
      }
      writeLog(logger, 'info', {
        status: 'scheduled', initial_delay_ms: config.recommendationSync.initialDelayMs,
        interval_ms: config.recommendationSync.intervalMs, timeout_ms: config.recommendationSync.timeoutMs,
      });
      schedule(config.recommendationSync.initialDelayMs);
    },
    runNow,
    stop() {
      stopped = true;
      if (timer) clearTimer(timer);
      timer = null;
      activeController?.abort();
    },
    isRunning() { return Boolean(activeRun); },
  };
}
