import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createApp } from './app.mjs';

const appDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

async function withServer(run) {
  const server = createApp({ repository: {}, config: {
    appDir, isProduction: false, repository: 'local', publicWorldCacheTtlMs: 0,
    slowRequestThresholdMs: 0, sessionCleanupIntervalMs: 900_000,
  } });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  try { await run(`http://127.0.0.1:${server.address().port}`); }
  finally { await new Promise((resolve) => server.close(resolve)); }
}

test('static server exposes only browser assets', async () => {
  await withServer(async (origin) => {
    for (const pathname of [
      '/04-projection-treehouse/',
      '/04-projection-treehouse/prototype.js',
      '/04-projection-treehouse/formal-v4.css',
      '/04-projection-treehouse/assets/projection-treehouse.png',
    ]) {
      const response = await fetch(`${origin}${pathname}`);
      assert.equal(response.status, 200, pathname);
    }
  });
});

test('static server blocks secrets, data, backend source and project metadata', async () => {
  await withServer(async (origin) => {
    for (const pathname of [
      '/04-projection-treehouse/.env',
      '/04-projection-treehouse/%2eenv',
      '/04-projection-treehouse/.data/store.json',
      '/04-projection-treehouse/runtime-data/store.json',
      '/04-projection-treehouse/server/app.mjs',
      '/04-projection-treehouse/scripts/feishu-e2e-verify.mjs',
      '/04-projection-treehouse/package.json',
      '/04-projection-treehouse/README.md',
      '/04-projection-treehouse/assets/fonts/lxgw-wenkai-screen/OFL.txt',
      '/04-projection-treehouse/%2e%2e%2f.env',
    ]) {
      const response = await fetch(`${origin}${pathname}`);
      assert.equal(response.status, 404, pathname);
    }
  });
});

test('static server supports HEAD but rejects state-changing methods', async () => {
  await withServer(async (origin) => {
    const url = `${origin}/04-projection-treehouse/index.html`;
    const head = await fetch(url, { method: 'HEAD' });
    assert.equal(head.status, 200);
    assert.equal(await head.text(), '');
    const post = await fetch(url, { method: 'POST' });
    assert.equal(post.status, 405);
    assert.equal(post.headers.get('allow'), 'GET, HEAD');
  });
});
