import { config } from '../server/config.mjs';
import { createRepository } from '../server/repositories/index.mjs';
import { RECOMMENDATION_RESEARCH_TABLES } from '../server/recommendation-research-schema.mjs';
import { buildRecommendationResearchProjections } from '../server/recommendation-research-projector.mjs';
import { assertRecommendationProjections } from '../server/recommendation-research-validation.mjs';
import { createFeishuResearchClient, feishuFieldValue } from './feishu-research-client.mjs';

const apply = process.argv.includes('--apply');
const confirmed = process.argv.includes('--yes');
const prune = process.argv.includes('--prune');

async function main() {
  if (apply && !confirmed) throw new Error('同步会修改飞书，请加 --apply --yes 确认。');
  const repository = await createRepository(config);
  const [users, researchSubjects, worldStates, publicAssets, publicDemands, publicRecords, events, pricing, recommendationImpressions] = await Promise.all([
    repository.listAllUsers(), repository.listAllResearchSubjects(), repository.listAllWorldStates(),
    repository.listPublicAssets({ includeDeleted: true }), repository.listPublicDemands({ includeDeleted: true }),
    repository.listPublicRecords({ includeDeleted: true }), repository.listAllEvents(), repository.listAllPricing(), repository.listRecommendationImpressions(),
  ]);
  const projections = buildRecommendationResearchProjections({ users, researchSubjects, worldStates, publicAssets, publicDemands, publicRecords, events, pricing, recommendationImpressions });
  assertRecommendationProjections(RECOMMENDATION_RESEARCH_TABLES, projections);
  for (const schema of RECOMMENDATION_RESEARCH_TABLES) console.log(`${schema.name}: ${projections[schema.key].length} 行`);
  if (!apply) { console.log('\n当前为只读审计；确认数量后运行 npm run research:recommendation:sync。'); return; }
  const tableIds = config.feishu.recommendationProjectionTables;
  if (RECOMMENDATION_RESEARCH_TABLES.some((schema) => !tableIds[schema.key])) throw new Error('9 张推荐研究表的 Table ID 尚未全部写入 .env。');
  const client = await createFeishuResearchClient(config.feishu);
  const appPath = `/bitable/v1/apps/${config.feishu.bitableAppToken}`;
  for (const schema of RECOMMENDATION_RESEARCH_TABLES) {
    const tableId = tableIds[schema.key]; const path = `${appPath}/tables/${tableId}`;
    const existing = await client.list(`${path}/records`, 500);
    const byKey = new Map(existing.map((record) => [String(record.fields?.[schema.primary] || ''), record]));
    const fieldsByName = new Map(schema.fields.map((field) => [field.name, field]));
    const create = []; const update = [];
    const currentKeys = new Set(projections[schema.key].map((row) => String(row[schema.primary])));
    const remove = prune ? existing.filter((record) => !currentKeys.has(String(record.fields?.[schema.primary] || ''))).map((record) => record.record_id) : [];
    for (const row of projections[schema.key]) {
      const fields = Object.fromEntries(Object.entries(row).filter(([name]) => fieldsByName.has(name)).map(([name, value]) => [name, feishuFieldValue(fieldsByName.get(name), value)]));
      const found = byKey.get(String(row[schema.primary]));
      if (found) update.push({ record_id: found.record_id, fields }); else create.push({ fields });
    }
    for (let i = 0; i < create.length; i += 500) await client.request(`${path}/records/batch_create`, { method: 'POST', body: JSON.stringify({ records: create.slice(i, i + 500) }) });
    for (let i = 0; i < update.length; i += 500) await client.request(`${path}/records/batch_update`, { method: 'POST', body: JSON.stringify({ records: update.slice(i, i + 500) }) });
    for (let i = 0; i < remove.length; i += 500) await client.request(`${path}/records/batch_delete`, { method: 'POST', body: JSON.stringify({ records: remove.slice(i, i + 500) }) });
    console.log(`[已同步] ${schema.name}: 新增 ${create.length}，更新 ${update.length}，清理旧投影 ${remove.length}`);
  }
}
main().catch((error) => { console.error(error.stack || error.message); process.exitCode = 1; });
