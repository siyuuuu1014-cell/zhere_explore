import fs from 'node:fs/promises';
import path from 'node:path';
import { config } from '../server/config.mjs';
import { createRepository } from '../server/repositories/index.mjs';

const apply = process.argv.includes('--apply');
const confirmed = process.argv.includes('--yes');

async function main() {
  if (apply && !confirmed) throw new Error('实际修复会将重复有效成交标记为无效。请先审计，确认后使用 --apply --yes。');
  const repository = await createRepository(config);
  const pricing = await repository.listAllPricing();
  const groups = Map.groupBy((pricing.transactions || []).filter((transaction) => transaction.is_valid === true), (transaction) => `${transaction.user_id}\u0000${transaction.material_id}`);
  const duplicates = [];
  for (const transactions of groups.values()) {
    if (transactions.length < 2) continue;
    const ordered = transactions.toSorted((a, b) => String(a.transaction_time).localeCompare(String(b.transaction_time)) || String(a.transaction_id).localeCompare(String(b.transaction_id)));
    duplicates.push({
      user_id: ordered[0].user_id, material_id: ordered[0].material_id,
      keep_transaction_id: ordered[0].transaction_id,
      invalidate_transaction_ids: ordered.slice(1).map((item) => item.transaction_id),
    });
  }
  if (!duplicates.length) {
    console.log('未发现同一用户对同一素材存在多笔有效成交。');
    return;
  }
  console.log(JSON.stringify({ duplicate_group_count: duplicates.length, duplicates }, null, 2));
  if (!apply) {
    console.log('\n当前为只读审计。确认后运行 npm run pricing:data:repair。');
    return;
  }
  const backupDir = path.resolve(config.dataDir, 'pricing-backups');
  await fs.mkdir(backupDir, { recursive: true });
  const backupFile = path.join(backupDir, `pricing-before-dedup-${new Date().toISOString().replaceAll(':', '-')}.json`);
  await fs.writeFile(backupFile, `${JSON.stringify(pricing, null, 2)}\n`, 'utf8');
  console.log(`修复前备份：${backupFile}`);
  let invalidated = 0;
  for (const group of duplicates) {
    for (const transactionId of group.invalidate_transaction_ids) {
      const result = await repository.setTransactionValidity(transactionId, false, config.basePriceTransactionCount);
      if (!result) throw new Error(`找不到待修复交易：${transactionId}`);
      invalidated += 1;
    }
  }
  console.log(`修复完成：${duplicates.length} 组，${invalidated} 笔重复成交已标记为无效；最早一笔保留有效。`);
}

main().catch((error) => { console.error(error.message); process.exitCode = 1; });
