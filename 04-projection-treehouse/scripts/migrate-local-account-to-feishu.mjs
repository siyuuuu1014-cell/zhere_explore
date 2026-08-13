import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from '../server/config.mjs';
import { FeishuRepository } from '../server/repositories/feishu-repository.mjs';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const appDir = path.resolve(scriptDir, '..');
const identity = String(process.argv[2] || '').trim().toLowerCase();

if (!identity) throw new Error('Usage: node --env-file=.env scripts/migrate-local-account-to-feishu.mjs <email-or-phone>');
if (config.repository !== 'feishu') throw new Error('ZHERE_REPOSITORY must be feishu for migration.');

const storePath = path.join(appDir, '.data', 'store.json');
const store = JSON.parse(await fs.readFile(storePath, 'utf8'));
const user = (store.users || []).find((entry) => String(entry.identity || '').trim().toLowerCase() === identity);
if (!user) throw new Error('The requested identity does not exist in the local store.');
if (user.guest) throw new Error('Guest accounts are not eligible for account migration.');

const remote = new FeishuRepository(config.feishu);
await remote.init();

const byIdentity = await remote.findUserByIdentity(identity);
const byId = await remote.getUser(user.id);
if (byIdentity && byIdentity.id !== user.id) throw new Error('The identity already belongs to a different Feishu user.');
if (byId && byId.identity !== user.identity) throw new Error('The local user_id already belongs to a different Feishu identity.');

const summary = {
  user: 'existing', worldState: 'none', media: 0, publicAssets: 0, publicDemands: 0,
  publicResponses: 0, publicRecords: 0, reports: 0, researchConsents: 0,
  researchSessions: 0, events: 0, skippedSessions: (store.sessions || []).filter((entry) => entry.userId === user.id).length,
};

if (!byIdentity) {
  await remote.createUser({ ...user });
  summary.user = 'created';
}

const localSubject = (store.researchSubjects || []).find((entry) => entry.user_id === user.id);
const remoteSubject = await remote.ensureResearchSubject(user.id, {
  sourceSystem: localSubject?.source_system || 'web_game',
  createdAt: localSubject?.created_at || user.createdAt || new Date().toISOString(),
});
const remoteUser = await remote.getUser(user.id);
if (remoteUser && remoteUser.researchSubjectId !== remoteSubject.subject_id) {
  remoteUser.researchSubjectId = remoteSubject.subject_id;
  remoteUser.updatedAt = new Date().toISOString();
  await remote.updateUser(remoteUser);
}

const localWorld = store.worldStates?.[user.id];
if (localWorld && !(await remote.getWorldState(user.id))) {
  await remote.saveWorldState(user.id, localWorld.state);
  summary.worldState = 'created';
} else if (localWorld) summary.worldState = 'existing';

for (const asset of (store.assets || []).filter((entry) => entry.userId === user.id)) {
  if (await remote.getMedia(asset.id)) continue;
  const bytes = await fs.readFile(path.join(appDir, '.data', 'media', asset.storageKey));
  await remote.saveMedia({
    userId: user.id, assetId: asset.id, title: asset.title, description: asset.description,
    fileName: asset.fileName, mime: asset.mime, bytes,
  });
  summary.media += 1;
}

for (const record of (store.publicAssets || []).filter((entry) => entry.ownerId === user.id)) {
  await remote.savePublicAsset(record);
  summary.publicAssets += 1;
}
for (const record of (store.publicDemands || []).filter((entry) => entry.ownerId === user.id)) {
  await remote.savePublicDemand(record);
  summary.publicDemands += 1;
}
for (const record of (store.publicResponses || []).filter((entry) => entry.ownerId === user.id)) {
  await remote.createPublicResponse(record);
  summary.publicResponses += 1;
}
for (const record of (store.publicRecords || []).filter((entry) => entry.ownerId === user.id)) {
  await remote.savePublicRecord(record);
  summary.publicRecords += 1;
}

const existingReports = new Set((await remote.listReports()).map((entry) => entry.id));
for (const record of (store.reports || []).filter((entry) => entry.reporterId === user.id && !existingReports.has(entry.id))) {
  await remote.createReport(record);
  summary.reports += 1;
}

for (const consent of (store.researchConsents || []).filter((entry) => entry.user_id === user.id)) {
  await remote.recordResearchConsent({ ...consent, subject_id: remoteSubject.subject_id });
  summary.researchConsents += 1;
}
for (const session of (store.researchSessions || []).filter((entry) => entry.user_id === user.id)) {
  const migrated = { ...session, subject_id: remoteSubject.subject_id };
  await remote.createResearchSession(migrated);
  if (migrated.ended_at) await remote.endResearchSession(migrated.session_id, migrated.ended_at, migrated.end_reason || 'migration');
  summary.researchSessions += 1;
}

const events = (store.events || [])
  .filter((entry) => entry.actor_id === user.id)
  .map(({ actor_id, research_subject_id, derived_signals, ...event }) => event);
summary.events = (await remote.appendEvents(user.id, events, remoteSubject.subject_id)).length;

const unsupportedBids = (store.bids || []).filter((entry) => entry.user_id === user.id).length;
const unsupportedTransactions = (store.transactions || []).filter((entry) => entry.user_id === user.id).length;
if (unsupportedBids || unsupportedTransactions) {
  throw new Error(`Account data was partially migrated, but pricing migration requires review (bids=${unsupportedBids}, transactions=${unsupportedTransactions}).`);
}

console.log(JSON.stringify({ ok: true, userId: user.id, summary }, null, 2));
