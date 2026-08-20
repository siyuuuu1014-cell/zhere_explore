import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
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

test('Feishu demand writes expose research fields and degrade safely before schema migration', async () => {
  const demand = {
    id: 'demand-1', ownerId: 'user-1', status: 'open', type: 'personal', title: '雨夜街景', theme: '城市', description: '安静的雨夜',
    durationSeconds: 30, aspectRatio: '16:9', aspectRatioPreset: '16:9', resolution: '1080p', resolutionPreset: '1080p',
    priceAmount: 36, priceRole: 'quote', priceUnit: 'inspiration_coin', pricingSignalEligible: true,
    startAt: '2026-09-01T02:00:00.000Z', endAt: '2026-09-02T02:00:00.000Z', timezone: 'Asia/Shanghai',
    createdAt: '2026-08-18T02:00:00.000Z', updatedAt: '2026-08-18T02:00:00.000Z',
  };
  const run = async (extended) => {
    const calls = [];
    globalThis.fetch = async (url, options = {}) => {
      const target = String(url);
      if (target.includes('/tenant_access_token/internal')) return jsonResponse({ code: 0, tenant_access_token: 'test-token', expire: 7200 });
      if (target.includes('/fields')) {
        const basics = ['demand_id', 'owner_id', 'status', 'payload_json'].map((field_name) => ({ field_name, type: 1 }));
        const extra = extended ? [
          { field_name: 'demand_type', type: 1 }, { field_name: 'title', type: 1 }, { field_name: 'theme', type: 1 },
          { field_name: 'duration_seconds', type: 2 }, { field_name: 'aspect_ratio', type: 1 }, { field_name: 'resolution', type: 1 },
          { field_name: 'price_amount', type: 2 }, { field_name: 'price_role', type: 1 }, { field_name: 'price_unit', type: 1 },
          { field_name: 'pricing_signal_eligible', type: 7 }, { field_name: 'start_at', type: 5 }, { field_name: 'end_at', type: 5 },
        ] : [];
        return jsonResponse({ code: 0, data: { items: [...basics, ...extra], has_more: false } });
      }
      if (target.endsWith('/tables/tbl-demands/records')) {
        calls.push(JSON.parse(options.body));
        return jsonResponse({ code: 0, data: { record: { record_id: 'rec-demand' } } });
      }
      return jsonResponse({ code: 404, msg: 'unexpected request' }, 404);
    };
    const repository = new FeishuRepository({ appId: 'app-id', appSecret: 'secret', bitableAppToken: 'base-token', driveFolderToken: 'folder-token', tables: { publicDemands: 'tbl-demands' } });
    await repository.savePublicDemand(demand, { skipLookup: true });
    return calls[0].fields;
  };

  const baseline = await run(false);
  assert.deepEqual(Object.keys(baseline).sort(), ['demand_id', 'owner_id', 'payload_json', 'status']);
  assert.equal(JSON.parse(baseline.payload_json).priceAmount, 36);

  const extended = await run(true);
  assert.equal(extended.price_amount, 36);
  assert.equal(extended.pricing_signal_eligible, true);
  assert.equal(extended.start_at, Date.parse(demand.startAt));
  assert.equal(extended.price_unit, 'inspiration_coin');
});

test('Feishu media larger than 20MB uses multipart Drive upload', async () => {
  const calls = [];
  globalThis.fetch = async (url, options = {}) => {
    const target = String(url);
    if (target.includes('/tenant_access_token/internal')) return jsonResponse({ code: 0, tenant_access_token: 'test-token', expire: 7200 });
    if (target.endsWith('/drive/v1/files/upload_prepare')) {
      calls.push({ kind: 'prepare', body: JSON.parse(options.body) });
      return jsonResponse({ code: 0, data: { upload_id: 'upload-1', block_size: 11 * 1024 * 1024, block_num: 2 } });
    }
    if (target.endsWith('/drive/v1/files/upload_part')) {
      calls.push({
        kind: 'part',
        seq: options.body.get('seq'),
        size: Number(options.body.get('size')),
      });
      return jsonResponse({ code: 0, data: {} });
    }
    if (target.endsWith('/drive/v1/files/upload_finish')) {
      calls.push({ kind: 'finish', body: JSON.parse(options.body) });
      return jsonResponse({ code: 0, data: { file_token: 'file-large-1' } });
    }
    if (target.includes('/tables/tbl-assets/fields')) {
      return jsonResponse({ code: 0, data: { items: [
        { field_name: 'asset_id', type: 1 }, { field_name: 'user_id', type: 1 },
        { field_name: 'file_token', type: 1 }, { field_name: 'payload_json', type: 1 },
      ], has_more: false } });
    }
    if (target.endsWith('/tables/tbl-assets/records')) {
      calls.push({ kind: 'asset', body: JSON.parse(options.body) });
      return jsonResponse({ code: 0, data: { record: { record_id: 'rec-asset' } } });
    }
    return jsonResponse({ code: 404, msg: `unexpected request: ${target}` }, 404);
  };

  const repository = new FeishuRepository({
    appId: 'app-id', appSecret: 'secret', bitableAppToken: 'base-token', driveFolderToken: 'folder-token',
    tables: { assets: 'tbl-assets' },
  });
  const bytes = Buffer.alloc(20 * 1024 * 1024 + 1, 7);
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'zhere-feishu-stream-'));
  const filePath = path.join(tempDir, 'large.mp4');
  await fs.writeFile(filePath, bytes);
  let asset;
  try {
    asset = await repository.saveMedia({
      userId: 'user-1', assetId: 'asset-large-1', title: '大文件', description: '',
      fileName: 'large.mp4', mime: 'video/mp4', filePath, size: bytes.length,
    });
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }

  assert.equal(asset.storageKey, 'file-large-1');
  assert.equal(calls.some((call) => call.kind === 'prepare' && call.body.size === bytes.length), true);
  assert.deepEqual(calls.filter((call) => call.kind === 'part').map((call) => call.seq), ['0', '1']);
  assert.equal(calls.filter((call) => call.kind === 'part').reduce((sum, call) => sum + call.size, 0), bytes.length);
  assert.deepEqual(calls.find((call) => call.kind === 'finish').body, { upload_id: 'upload-1', block_num: 2 });
  assert.equal(calls.find((call) => call.kind === 'asset').body.fields.file_token, 'file-large-1');
  assert.equal(calls.some((call) => call.target?.includes('upload_all')), false);
});
