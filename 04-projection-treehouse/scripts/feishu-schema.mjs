import fs from 'node:fs/promises';
import path from 'node:path';
import { config } from '../server/config.mjs';

const TYPE_NAMES = new Map([[1, '文本'], [2, '数字'], [5, '日期'], [7, '复选框']]);
const EXPECTED = {
  publicDemands: {
    demand_id: 1, owner_id: 1, status: 1, demand_type: 1, title: 1, theme: 1, description: 1,
    duration_seconds: 2, aspect_ratio: 1, aspect_ratio_preset: 1, resolution: 1, resolution_preset: 1,
    price_amount: 2, price_role: 1, price_unit: 1, pricing_signal_eligible: 7,
    company_name: 1, activity_name: 1, cooperation_scope: 1, region: 1,
    skill_requirements: 1, cooperation_description: 1,
    start_at: 5, end_at: 5, timezone: 1, created_at: 5, updated_at: 5, payload_json: 1,
  },
  events: { created_at: 5 },
  bids: { bid_time: 5, bid_price: 2 },
  transactions: { transaction_time: 5, bid_price: 2, transaction_price: 2, is_valid: 7 },
  basePrices: { base_price: 2, valid_transaction_count: 2, formed_at: 5 },
  researchConsents: { research_allowed: 7, effective_at: 5 },
  researchSessions: { started_at: 5, ended_at: 5 },
  basePriceVersions: { material_id: 1, version: 1, base_price: 1, formed: 1, transaction_id: 1, payload_json: 1 },
  bidAttempts: { event_id: 1, user_id: 1, asset_id: 1, attempt_kind: 1, payload_json: 1 },
  recommendationRequests: { request_id: 1, user_id: 1, subject_id: 1, payload_json: 1 },
  recommendationCandidates: { request_id: 1, asset_id: 1, payload_json: 1 },
  recommendationImpressions: { impression_id: 1, request_id: 1, asset_id: 1, payload_json: 1 },
};
const apply = process.argv.includes('--apply');
const confirmed = process.argv.includes('--yes');

function plain(value) {
  if (Array.isArray(value)) return value.map((item) => typeof item === 'object' ? item.text || item.name || '' : item).join('');
  if (value && typeof value === 'object') return value.text || value.name || '';
  return value == null ? '' : String(value);
}

function validForType(value, type) {
  const text = plain(value).trim();
  if (!text) return true;
  if (type === 2) return Number.isFinite(Number(text));
  if (type === 5) return !Number.isNaN(Date.parse(text)) || Number.isFinite(Number(text));
  if (type === 7) return ['true', 'false', '1', '0', '是', '否'].includes(text.toLowerCase());
  return true;
}

function demandBackfillFields(demand) {
  const fields = {};
  const assign = (field, value, type = 1) => {
    if (value === undefined || value === null || value === '') return;
    if (type === 2) {
      const number = Number(value);
      if (Number.isFinite(number)) fields[field] = number;
      return;
    }
    if (type === 5) {
      const timestamp = typeof value === 'number' ? value : Date.parse(value);
      if (Number.isFinite(timestamp)) fields[field] = timestamp;
      return;
    }
    if (type === 7) {
      fields[field] = value === true;
      return;
    }
    fields[field] = String(value);
  };
  assign('demand_id', demand.id);
  assign('owner_id', demand.ownerId);
  assign('status', demand.status);
  assign('demand_type', demand.type);
  assign('title', demand.title);
  assign('theme', demand.theme);
  assign('description', demand.description);
  assign('duration_seconds', demand.durationSeconds, 2);
  assign('aspect_ratio', demand.aspectRatio);
  assign('aspect_ratio_preset', demand.aspectRatioPreset);
  assign('resolution', demand.resolution);
  assign('resolution_preset', demand.resolutionPreset);
  assign('price_amount', demand.priceAmount, 2);
  assign('price_role', demand.priceRole);
  assign('price_unit', demand.priceUnit);
  assign('pricing_signal_eligible', demand.pricingSignalEligible, 7);
  assign('company_name', demand.companyName);
  assign('activity_name', demand.activityName);
  assign('cooperation_scope', demand.cooperationScope);
  assign('region', demand.region);
  assign('skill_requirements', demand.skillRequirements);
  assign('cooperation_description', demand.cooperationDescription);
  assign('start_at', demand.startAt, 5);
  assign('end_at', demand.endAt, 5);
  assign('timezone', demand.timezone);
  assign('created_at', demand.createdAt, 5);
  assign('updated_at', demand.updatedAt, 5);
  return fields;
}

function demandNeedsBackfill(record) {
  try {
    const demand = JSON.parse(plain(record.fields?.payload_json) || '{}');
    const expected = demandBackfillFields(demand);
    return Object.entries(expected).some(([field, value]) => {
      const current = record.fields?.[field];
      if (current === undefined || current === null || plain(current).trim() === '') return true;
      if (typeof value === 'boolean') return !['true', 'false', '1', '0', '是', '否'].includes(plain(current).trim().toLowerCase());
      return false;
    });
  } catch {
    return true;
  }
}

async function main() {
  const feishu = config.feishu;
  const required = [feishu.appId, feishu.appSecret, feishu.bitableAppToken, ...Object.keys(EXPECTED).map((table) => feishu.tables[table])];
  if (required.some((value) => !value)) throw new Error('飞书配置不完整，请先检查 .env 中的 App ID、Secret、App Token 和目标 Table ID。');
  if (apply && !confirmed) throw new Error('实际迁移会修改飞书字段类型。请先只运行审计；确认备份后使用 --apply --yes。');

  const authResponse = await fetch('https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ app_id: feishu.appId, app_secret: feishu.appSecret }), signal: AbortSignal.timeout(12_000),
  });
  const auth = await authResponse.json();
  if (!authResponse.ok || auth.code) throw new Error(`飞书鉴权失败：${auth.msg || authResponse.status}`);

  async function request(url, options = {}) {
    const response = await fetch(`https://open.feishu.cn/open-apis${url}`, {
      ...options, signal: AbortSignal.timeout(15_000),
      headers: { authorization: `Bearer ${auth.tenant_access_token}`, 'content-type': 'application/json', ...options.headers },
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok || body.code) throw new Error(`飞书请求失败：${body.msg || response.status}`);
    return body.data;
  }

  async function list(url, pageSize = 100) {
    const items = [];
    let pageToken = '';
    do {
      const query = new URLSearchParams({ page_size: String(pageSize) });
      if (pageToken) query.set('page_token', pageToken);
      const data = await request(`${url}?${query}`);
      items.push(...(data.items || []));
      pageToken = data.has_more ? data.page_token : '';
    } while (pageToken);
    return items;
  }

  const changes = [];
  const backup = { created_at: new Date().toISOString(), app_token: feishu.bitableAppToken, tables: {} };
  for (const [tableKey, expectedFields] of Object.entries(EXPECTED)) {
    const tableId = feishu.tables[tableKey];
    const base = `/bitable/v1/apps/${feishu.bitableAppToken}/tables/${tableId}`;
    const [fields, records] = await Promise.all([list(`${base}/fields`), list(`${base}/records`, 500)]);
    backup.tables[tableKey] = { table_id: tableId, fields, records };
    for (const [fieldName, targetType] of Object.entries(expectedFields)) {
      const field = fields.find((item) => item.field_name === fieldName);
      if (!field) {
        changes.push({ tableKey, tableId, fieldName, targetType, status: 'missing', invalid: [] });
        continue;
      }
      if (Number(field.type) === targetType) continue;
      const invalid = records.filter((record) => !validForType(record.fields?.[fieldName], targetType)).map((record) => record.record_id);
      changes.push({ tableKey, tableId, fieldName, field, targetType, status: invalid.length ? 'invalid-data' : 'ready', invalid });
    }
  }

  if (!changes.length) console.log('飞书字段类型已符合研究数据规范，无需调整字段。');
  else {
    for (const change of changes) {
      console.log(`${change.tableKey}.${change.fieldName}: ${TYPE_NAMES.get(Number(change.field?.type)) || '缺失'} -> ${TYPE_NAMES.get(change.targetType)} [${change.status}]`);
      if (change.invalid.length) console.log(`  无法转换的 record_id: ${change.invalid.slice(0, 10).join(', ')}${change.invalid.length > 10 ? ' ...' : ''}`);
    }
  }
  if (!apply) {
    const demandCount = backup.tables.publicDemands.records.filter(demandNeedsBackfill).length;
    console.log(`\n当前为只读审计。仍有 ${demandCount} 条历史需求需要从 payload_json 回填到独立字段。`);
    if (demandCount || changes.length) console.log('确认变更清单正确、且没有 invalid-data 后，可运行 npm run feishu:schema:migrate；missing 字段会由迁移脚本自动创建。');
    else console.log('字段结构与历史需求独立列均已同步完成，无需再次迁移。');
    return;
  }
  const blocked = changes.filter((change) => change.status === 'invalid-data');
  if (blocked.length) throw new Error(`存在 ${blocked.length} 组不可转换数据，已停止迁移。请先修正对应 record_id。`);

  const backupDir = path.resolve(config.dataDir, 'schema-backups');
  await fs.mkdir(backupDir, { recursive: true });
  const backupFile = path.join(backupDir, `feishu-schema-${new Date().toISOString().replaceAll(':', '-')}.json`);
  await fs.writeFile(backupFile, `${JSON.stringify(backup, null, 2)}\n`, 'utf8');
  console.log(`迁移前备份：${backupFile}`);

  for (const change of changes) {
    const body = { field_name: change.fieldName, type: change.targetType };
    if (change.field?.description) body.description = change.field.description;
    if (change.status === 'missing') {
      await request(`/bitable/v1/apps/${feishu.bitableAppToken}/tables/${change.tableId}/fields`, {
        method: 'POST', body: JSON.stringify(body),
      });
      console.log(`已创建 ${change.tableKey}.${change.fieldName}`);
    } else {
      await request(`/bitable/v1/apps/${feishu.bitableAppToken}/tables/${change.tableId}/fields/${change.field.field_id}`, {
        method: 'PUT', body: JSON.stringify(body),
      });
      console.log(`已迁移 ${change.tableKey}.${change.fieldName}`);
    }
  }

  const demandTable = backup.tables.publicDemands;
  const demandUpdates = demandTable.records.flatMap((record) => {
    try {
      const demand = JSON.parse(plain(record.fields?.payload_json) || '{}');
      const fields = demandBackfillFields(demand);
      return Object.keys(fields).length ? [{ record_id: record.record_id, fields }] : [];
    } catch {
      console.warn(`跳过无法解析 payload_json 的需求记录：${record.record_id}`);
      return [];
    }
  });
  for (let index = 0; index < demandUpdates.length; index += 500) {
    await request(`/bitable/v1/apps/${feishu.bitableAppToken}/tables/${demandTable.table_id}/records/batch_update`, {
      method: 'POST', body: JSON.stringify({ records: demandUpdates.slice(index, index + 500) }),
    });
  }
  console.log(`已回填 ${demandUpdates.length} 条历史需求的独立字段。`);
  console.log('迁移与历史数据同步完成。请重启服务，再运行 npm run feishu:schema:audit 复核。');
}

main().catch((error) => { console.error(error.message); process.exitCode = 1; });
