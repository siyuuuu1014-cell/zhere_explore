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
    researchSubjects: 'tbl-research-subjects', researchConsents: 'tbl-research-consents', researchSessions: 'tbl-research-sessions',
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

test('Feishu point lookups use server-side filtered search', async () => {
  const tables = {
    users: 'tbl-users', sessions: 'tbl-sessions', worldStates: 'tbl-world', assets: 'tbl-assets',
    publicAssets: 'tbl-public-assets', publicDemands: 'tbl-public-demands', publicResponses: 'tbl-public-responses',
    publicRecords: 'tbl-public-records', reports: 'tbl-reports', events: 'tbl-events', passwordResets: 'tbl-resets',
    bids: 'tbl-bids', transactions: 'tbl-transactions', basePrices: 'tbl-base-prices',
  };
  const calls = [];
  globalThis.fetch = async (url, options = {}) => {
    const target = String(url);
    if (target.includes('/tenant_access_token/internal')) return jsonResponse({ code: 0, tenant_access_token: 'test-token', expire: 7200 });
    calls.push({ target, method: options.method, body: options.body ? JSON.parse(options.body) : null });
    if (target.includes('/tables/tbl-users/records/search')) {
      return jsonResponse({ code: 0, data: { items: [{ record_id: 'rec-user', fields: { user_id: 'user-1', identity: 'player@example.com', password_hash: 'hash', payload_json: JSON.stringify({ nickname: '旅人' }) } }], has_more: false } });
    }
    return jsonResponse({ code: 0, data: { items: [], has_more: false } });
  };

  const repository = new FeishuRepository({ appId: 'app-id', appSecret: 'secret', bitableAppToken: 'base-token', driveFolderToken: 'folder-token', tables });
  const user = await repository.findUserByIdentity('player@example.com');
  assert.equal(user.id, 'user-1');
  const search = calls.find((call) => call.target.includes('/tables/tbl-users/records/search'));
  assert.equal(search.method, 'POST');
  assert.deepEqual(search.body.filter.conditions, [{ field_name: 'identity', operator: 'is', value: ['player@example.com'] }]);
  assert.equal(calls.some((call) => /tables\/tbl-users\/records\?/.test(call.target)), false);
});

test('Feishu writes adapt booleans and numbers to an existing all-text table schema', async () => {
  const tables = { researchConsents: 'tbl-consents' };
  const calls = [];
  globalThis.fetch = async (url, options = {}) => {
    const target = String(url);
    if (target.includes('/tenant_access_token/internal')) return jsonResponse({ code: 0, tenant_access_token: 'test-token', expire: 7200 });
    if (target.includes('/tables/tbl-consents/records/search')) return jsonResponse({ code: 0, data: { items: [], has_more: false } });
    if (target.includes('/tables/tbl-consents/fields')) return jsonResponse({ code: 0, data: { items: [
      { field_name: 'consent_id', type: 1 }, { field_name: 'user_id', type: 1 }, { field_name: 'subject_id', type: 1 },
      { field_name: 'consent_version', type: 1 }, { field_name: 'research_allowed', type: 1 },
      { field_name: 'effective_at', type: 1 }, { field_name: 'payload_json', type: 1 },
    ], has_more: false } });
    if (target.endsWith('/tables/tbl-consents/records')) {
      calls.push(JSON.parse(options.body));
      return jsonResponse({ code: 0, data: { record: { record_id: 'rec-consent' } } });
    }
    return jsonResponse({ code: 404, msg: 'unexpected request' }, 404);
  };

  const repository = new FeishuRepository({ appId: 'app-id', appSecret: 'secret', bitableAppToken: 'base-token', driveFolderToken: 'folder-token', tables });
  await repository.recordResearchConsent({
    consent_id: 'consent-1', user_id: 'user-1', subject_id: 'subject-1', consent_version: 'research-v1',
    research_allowed: true, effective_at: '2026-08-12T11:00:00.000Z',
  });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].fields.research_allowed, 'true');
  assert.equal(calls[0].fields.effective_at, '2026-08-12T11:00:00.000Z');
  assert.equal(JSON.parse(calls[0].fields.payload_json).research_allowed, true);
});
