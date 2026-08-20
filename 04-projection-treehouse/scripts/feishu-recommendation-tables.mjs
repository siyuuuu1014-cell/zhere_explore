import { config } from '../server/config.mjs';
import { RECOMMENDATION_RESEARCH_TABLES } from '../server/recommendation-research-schema.mjs';
import { createFeishuResearchClient } from './feishu-research-client.mjs';

const apply = process.argv.includes('--apply');
const confirmed = process.argv.includes('--yes');

async function main() {
  if (![config.feishu.appId, config.feishu.appSecret, config.feishu.bitableAppToken].every(Boolean)) throw new Error('请先在 .env 配置 FEISHU_APP_ID、FEISHU_APP_SECRET、FEISHU_BITABLE_APP_TOKEN。');
  if (apply && !confirmed) throw new Error('建表会修改飞书，请加 --apply --yes 确认。');
  const client = await createFeishuResearchClient(config.feishu);
  const appPath = `/bitable/v1/apps/${config.feishu.bitableAppToken}`;
  const existing = await client.list(`${appPath}/tables`);
  const result = [];
  for (const schema of RECOMMENDATION_RESEARCH_TABLES) {
    let table = existing.find((item) => item.name === schema.name);
    if (!table && apply) {
      const created = await client.request(`${appPath}/tables`, { method: 'POST', body: JSON.stringify({ table: { name: schema.name, default_view_name: '全部数据', fields: schema.fields.map((field) => ({ field_name: field.name, type: field.type })) } }) });
      table = created.table || (created.table_id ? { ...created, name: schema.name } : null);
    }
    if (!table) { console.log(`[待创建] ${schema.name} (${schema.fields.length} 字段)`); continue; }
    const fields = await client.list(`${appPath}/tables/${table.table_id}/fields`);
    const missing = schema.fields.filter((expected) => !fields.some((field) => field.field_name === expected.name));
    const mismatched = schema.fields.flatMap((expected) => {
      const current = fields.find((field) => field.field_name === expected.name);
      return current && Number(current.type) !== expected.type ? [{ expected, current }] : [];
    });
    if (apply) for (const field of missing) await client.request(`${appPath}/tables/${table.table_id}/fields`, { method: 'POST', body: JSON.stringify({ field_name: field.name, type: field.type }) });
    if (apply) for (const { expected, current } of mismatched) await client.request(`${appPath}/tables/${table.table_id}/fields/${current.field_id}`, { method: 'PUT', body: JSON.stringify({ field_name: expected.name, type: expected.type }) });
    const notes = [missing.length ? `${apply ? '已补齐' : '缺少'} ${missing.length} 字段` : '', mismatched.length ? `${apply ? '已修正' : '类型不符'} ${mismatched.length} 字段` : ''].filter(Boolean).join('，');
    console.log(`[${apply ? '已就绪' : '已存在'}] ${schema.name}: ${table.table_id}${notes ? `，${notes}` : ''}`);
    result.push({ ...schema, tableId: table.table_id });
  }
  console.log('\n请写入 .env：');
  for (const item of result) console.log(`${item.env}=${item.tableId}`);
  if (!apply) console.log('\n当前为只读审计；确认后运行 npm run feishu:recommendation:tables:create。');
}
main().catch((error) => { console.error(error.message); process.exitCode = 1; });
