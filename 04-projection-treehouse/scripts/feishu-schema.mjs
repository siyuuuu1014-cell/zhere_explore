import fs from 'node:fs/promises';
import path from 'node:path';
import { config } from '../server/config.mjs';

const TYPE_NAMES = new Map([[1, '文本'], [2, '数字'], [5, '日期'], [7, '复选框']]);
const EXPECTED = {
  events: { created_at: 5 },
  bids: { bid_time: 5, bid_price: 2 },
  transactions: { transaction_time: 5, bid_price: 2, transaction_price: 2, is_valid: 7 },
  basePrices: { base_price: 2, valid_transaction_count: 2, formed_at: 5 },
  researchConsents: { research_allowed: 7, effective_at: 5 },
  researchSessions: { started_at: 5, ended_at: 5 },
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

  if (!changes.length) {
    console.log('飞书字段类型已符合研究数据规范，无需迁移。');
    return;
  }
  for (const change of changes) {
    console.log(`${change.tableKey}.${change.fieldName}: ${TYPE_NAMES.get(Number(change.field?.type)) || '缺失'} -> ${TYPE_NAMES.get(change.targetType)} [${change.status}]`);
    if (change.invalid.length) console.log(`  无法转换的 record_id: ${change.invalid.slice(0, 10).join(', ')}${change.invalid.length > 10 ? ' ...' : ''}`);
  }
  if (!apply) {
    console.log('\n当前为只读审计。确认所有项目均为 ready 后，可运行 npm run feishu:schema:migrate。');
    return;
  }
  const blocked = changes.filter((change) => change.status !== 'ready');
  if (blocked.length) throw new Error(`存在 ${blocked.length} 个缺失字段或不可转换数据，已停止迁移。`);

  const backupDir = path.resolve(config.dataDir, 'schema-backups');
  await fs.mkdir(backupDir, { recursive: true });
  const backupFile = path.join(backupDir, `feishu-schema-${new Date().toISOString().replaceAll(':', '-')}.json`);
  await fs.writeFile(backupFile, `${JSON.stringify(backup, null, 2)}\n`, 'utf8');
  console.log(`迁移前备份：${backupFile}`);

  for (const change of changes) {
    const body = { field_name: change.fieldName, type: change.targetType };
    if (change.field.description) body.description = change.field.description;
    await request(`/bitable/v1/apps/${feishu.bitableAppToken}/tables/${change.tableId}/fields/${change.field.field_id}`, {
      method: 'PUT', body: JSON.stringify(body),
    });
    console.log(`已迁移 ${change.tableKey}.${change.fieldName}`);
  }
  console.log('迁移完成。请重启服务，再运行 npm run feishu:schema:audit 复核。');
}

main().catch((error) => { console.error(error.message); process.exitCode = 1; });
