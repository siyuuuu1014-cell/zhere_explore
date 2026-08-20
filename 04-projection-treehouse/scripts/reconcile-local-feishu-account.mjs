import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from '../server/config.mjs';
import { createRepository } from '../server/repositories/index.mjs';
import { mergeWorldStates, remapUserReferences } from '../server/account-reconciliation.mjs';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const appDir = path.resolve(scriptDir, '..');
const identityArg = process.argv.find((value) => value.startsWith('--identity='));
const identity = String(identityArg?.slice('--identity='.length) || '').trim().toLowerCase();
const apply = process.argv.includes('--apply');
const confirmed = process.argv.includes('--yes');

if (!identity) throw new Error('Usage: npm run account:reconcile -- --identity=<email-or-phone> [--apply --yes]');
if (config.repository !== 'feishu') throw new Error('ZHERE_REPOSITORY must be feishu.');
if (apply && !confirmed) throw new Error('Refusing to write without --yes.');

const storePath = path.join(appDir, '.data', 'store.json');
const store = JSON.parse(await fs.readFile(storePath, 'utf8'));
const localUser = (store.users || []).find((entry) => String(entry.identity || '').trim().toLowerCase() === identity);
if (!localUser || localUser.guest) throw new Error('No eligible local account exists for this identity.');

const repository = await createRepository(config);
const remoteUser = await repository.findUserByIdentity(identity);
if (!remoteUser || remoteUser.guest) throw new Error('No eligible Feishu account exists for this identity.');
if (remoteUser.id === localUser.id && remoteUser.passwordHash === localUser.passwordHash) {
  console.log(JSON.stringify({ ok: true, status: 'already-aligned', user_id: remoteUser.id }, null, 2));
  process.exit(0);
}
if (remoteUser.id === localUser.id) throw new Error('The accounts share user_id but have different password hashes; use the password reset flow instead.');
if (!String(localUser.passwordHash || '').startsWith('argon2id$')) throw new Error('The local password hash is not a supported Argon2id hash.');

const localWorldRecord = store.worldStates?.[localUser.id] || null;
const [remoteWorldRecord, remotePricing, allPricing, allEvents, remoteSubject] = await Promise.all([
  repository.getWorldState(remoteUser.id), repository.listPricingByUser(remoteUser.id), repository.listAllPricing(),
  repository.listAllEvents(), repository.getResearchSubject(remoteUser.id),
]);
const localBids = (store.bids || []).filter((entry) => entry.user_id === localUser.id);
const localTransactions = (store.transactions || []).filter((entry) => entry.user_id === localUser.id);
const localEvents = (store.events || []).filter((entry) => entry.actor_id === localUser.id);

const remoteBidById = new Map((allPricing.bids || []).map((entry) => [entry.bid_id, entry]));
const remoteTransactionById = new Map((allPricing.transactions || []).map((entry) => [entry.transaction_id, entry]));
const remoteEventById = new Map(allEvents.map((entry) => [entry.event_id, entry]));
for (const bid of localBids) {
  const existing = remoteBidById.get(bid.bid_id);
  if (existing && existing.user_id !== remoteUser.id) throw new Error(`Bid ID conflict: ${bid.bid_id}`);
}
for (const transaction of localTransactions) {
  const existing = remoteTransactionById.get(transaction.transaction_id);
  if (existing && existing.user_id !== remoteUser.id) throw new Error(`Transaction ID conflict: ${transaction.transaction_id}`);
}
for (const event of localEvents) {
  const existing = remoteEventById.get(event.event_id);
  if (existing && existing.actor_id !== remoteUser.id) throw new Error(`Event ID conflict: ${event.event_id}`);
}

const profile = {
  username: localUser.username || remoteUser.username,
  nickname: localUser.nickname || remoteUser.nickname,
  spaceName: localUser.spaceName || remoteUser.spaceName,
};
const mergedWorld = remapUserReferences(mergeWorldStates(
  remoteWorldRecord?.state || {}, localWorldRecord?.state || {}, profile,
), localUser.id, remoteUser.id);
const planned = {
  status: apply ? 'applying' : 'dry-run', identity,
  canonical_user_id: remoteUser.id, merged_from_user_id: localUser.id,
  restore_legacy_password: remoteUser.passwordHash !== localUser.passwordHash,
  local_records: { bids: localBids.length, transactions: localTransactions.length, events: localEvents.length, world_state: Boolean(localWorldRecord) },
  existing_remote_records: { bids: remotePricing.bids.length, transactions: remotePricing.transactions.length, events: allEvents.filter((event) => event.actor_id === remoteUser.id).length, world_state: Boolean(remoteWorldRecord) },
};
if (!apply) {
  console.log(JSON.stringify(planned, null, 2));
  process.exit(0);
}

const backupDir = path.join(appDir, '.data', 'account-reconciliation');
await fs.mkdir(backupDir, { recursive: true });
const backupPath = path.join(backupDir, `${new Date().toISOString().replaceAll(':', '-')}-${remoteUser.id}.json`);
await fs.writeFile(backupPath, JSON.stringify({
  created_at: new Date().toISOString(), local_user: localUser, remote_user: remoteUser,
  local_world: localWorldRecord, remote_world: remoteWorldRecord,
  local_bids: localBids, local_transactions: localTransactions, local_events: localEvents,
}, null, 2), 'utf8');

const subject = remoteSubject || await repository.ensureResearchSubject(remoteUser.id, { createdAt: remoteUser.createdAt || new Date().toISOString() });
for (const transaction of localTransactions) {
  const bid = localBids.find((entry) => entry.bid_id === transaction.bid_id);
  if (!bid) throw new Error(`Missing local bid for transaction ${transaction.transaction_id}`);
  await repository.createAcceptedBidTransaction({
    bid: remapUserReferences({ ...bid, user_id: remoteUser.id }, localUser.id, remoteUser.id),
    transaction: remapUserReferences({ ...transaction, user_id: remoteUser.id }, localUser.id, remoteUser.id),
    basePriceTransactionCount: config.basePriceTransactionCount,
  });
}
const migratedEvents = localEvents.map((event) => remapUserReferences({ ...event, actor_id: remoteUser.id }, localUser.id, remoteUser.id));
await repository.appendEvents(remoteUser.id, migratedEvents, subject?.subject_id || null);
if (localWorldRecord) await repository.saveWorldState(remoteUser.id, mergedWorld, remoteWorldRecord?.version || 0);

const earliestCreatedAt = [localUser.createdAt, remoteUser.createdAt].filter(Boolean).sort()[0] || remoteUser.createdAt;
await repository.updateUser({
  ...remoteUser,
  ...profile,
  passwordHash: localUser.passwordHash,
  createdAt: earliestCreatedAt,
  registrationStatus: 'complete',
  failedLoginCount: 0,
  frozenUntil: null,
  mergedFromUserIds: [...new Set([...(remoteUser.mergedFromUserIds || []), localUser.id])],
  mergedAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
});
await Promise.all([
  repository.deleteSessionsByUser(remoteUser.id),
  repository.deleteSessionsByUser(localUser.id),
]);

console.log(JSON.stringify({ ...planned, status: 'complete', backup: path.relative(appDir, backupPath) }, null, 2));
