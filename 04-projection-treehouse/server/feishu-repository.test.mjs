import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';
import { FeishuRepository } from './repositories/feishu-repository.mjs';

const originalFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = originalFetch; });

function jsonResponse(payload, status = 200, headers = {}) {
  return new Response(JSON.stringify(payload), { status, headers: { 'content-type': 'application/json', ...headers } });
}

test('Feishu startup health check validates every table and retries rate limits', async () => {
  const tables = {
    users: 'tbl-users', sessions: 'tbl-sessions', worldStates: 'tbl-world', assets: 'tbl-assets',
    publicAssets: 'tbl-public-assets', publicDemands: 'tbl-public-demands', publicResponses: 'tbl-public-responses',
    publicRecords: 'tbl-public-records', reports: 'tbl-reports', events: 'tbl-events', passwordResets: 'tbl-resets',
  };
  let limited = false;
  const requestedTables = new Set();
  globalThis.fetch = async (url) => {
    const target = String(url);
    if (target.includes('/tenant_access_token/internal')) return jsonResponse({ code: 0, tenant_access_token: 'test-token', expire: 7200 });
    const table = Object.entries(tables).find(([, id]) => target.includes(`/tables/${id}/records`));
    if (table) {
      requestedTables.add(table[0]);
      if (!limited) { limited = true; return jsonResponse({ code: 1254290, msg: 'rate limited' }, 429, { 'retry-after': '0.001' }); }
      return jsonResponse({ code: 0, data: { items: [], has_more: false } });
    }
    if (target.includes('/drive/explorer/v2/folder/folder-token/meta')) return jsonResponse({ code: 0, data: { name: 'Zhere Assets', token: 'folder-token' } });
    return jsonResponse({ code: 404, msg: 'unexpected request' }, 404);
  };

  const repository = new FeishuRepository({ appId: 'app-id', appSecret: 'secret', bitableAppToken: 'base-token', driveFolderToken: 'folder-token', tables });
  await repository.init();
  const health = await repository.healthCheck();
  assert.equal(health.ok, true);
  assert.equal(health.storage, 'feishu');
  assert.equal(health.folder, 'Zhere Assets');
  assert.deepEqual([...requestedTables].sort(), Object.keys(tables).sort());
  assert.equal(limited, true);
});
