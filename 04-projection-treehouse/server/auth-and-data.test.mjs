import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { after, before, test } from 'node:test';
import { createApp } from './app.mjs';
import { LocalRepository } from './repositories/local-repository.mjs';
import { hashPassword, verifyPassword } from './security.mjs';

let baseUrl;
let cookie;
let secondCookie;
let server;
let dataDir;

before(async () => {
  dataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'zhere-server-test-'));
  const repository = new LocalRepository(dataDir);
  await repository.init();
  const config = {
    isProduction: false, repository: 'local', appDir: path.resolve(import.meta.dirname, '..'), dataDir,
    sessionDays: 30, maxJsonBytes: 2 * 1024 * 1024, maxVideoBytes: 100 * 1024 * 1024,
    publicWriteLimit: 60, adminIdentities: ['player@example.com'],
  };
  server = createApp({ repository, config });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  await new Promise((resolve) => server.close(resolve));
  await fs.rm(dataDir, { recursive: true, force: true });
});

test('Argon2id hashes do not contain the password and verify safely', () => {
  const hash = hashPassword('correct-horse');
  assert.match(hash, /^argon2id\$/);
  assert.equal(hash.includes('correct-horse'), false);
  assert.equal(verifyPassword('correct-horse', hash), true);
  assert.equal(verifyPassword('wrong-password', hash), false);
});

test('register issues an HttpOnly session cookie', async () => {
  const response = await fetch(`${baseUrl}/api/auth/register`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      identity: 'player@example.com', username: 'player', nickname: '路过的风', spaceName: '礁石小窝',
      password: 'correct-horse', confirmPassword: 'correct-horse', ageConfirmed: true, agreeTerms: true, research: true,
    }),
  });
  assert.equal(response.status, 201);
  const setCookie = response.headers.get('set-cookie');
  assert.match(setCookie, /zhere_session=/);
  assert.match(setCookie, /HttpOnly/i);
  assert.match(setCookie, /SameSite=Lax/i);
  cookie = setCookie.split(';')[0];
});

test('world state persists behind the authenticated API', async () => {
  const state = { wx: 120, wy: -30, wallet: 490, profile: { nickname: '路过的风' } };
  const saved = await fetch(`${baseUrl}/api/world-state`, {
    method: 'PUT', headers: { 'content-type': 'application/json', cookie }, body: JSON.stringify({ state }),
  });
  assert.equal(saved.status, 200);
  const restored = await fetch(`${baseUrl}/api/world-state`, { headers: { cookie } });
  assert.equal(restored.status, 200);
  assert.deepEqual((await restored.json()).state, state);
});

test('event batches are idempotent by event_id', async () => {
  const event = { event_id: 'evt-0001', raw_event: 'move_sample', details: { wx: 1 }, created_at: new Date().toISOString(), schema_version: 2, session_id: 'session-1', session_sequence: 1, research_consent: true };
  const first = await fetch(`${baseUrl}/api/events/batch`, {
    method: 'POST', headers: { 'content-type': 'application/json', cookie }, body: JSON.stringify({ events: [event, event] }),
  });
  assert.equal(first.status, 200);
  assert.deepEqual((await first.json()).accepted, ['evt-0001']);
  const second = await fetch(`${baseUrl}/api/events/batch`, {
    method: 'POST', headers: { 'content-type': 'application/json', cookie }, body: JSON.stringify({ events: [event] }),
  });
  assert.deepEqual((await second.json()).accepted, []);
});

test('research opt-out is persisted and non-essential telemetry is acknowledged without storage', async () => {
  const consent = await fetch(`${baseUrl}/api/privacy/consent`, {
    method: 'PUT', headers: { 'content-type': 'application/json', cookie }, body: JSON.stringify({ active: false }),
  });
  assert.equal(consent.status, 200);
  assert.equal((await consent.json()).user.research, false);

  const events = [
    { event_id: 'evt-opted-out-move', raw_event: 'move_sample', details: { wx: 2 }, created_at: new Date().toISOString(), research_consent: false },
    { event_id: 'evt-consent-off', raw_event: 'research_consent_change', details: { active: false }, created_at: new Date().toISOString(), research_consent: false },
  ];
  const response = await fetch(`${baseUrl}/api/events/batch`, {
    method: 'POST', headers: { 'content-type': 'application/json', cookie }, body: JSON.stringify({ events }),
  });
  const result = await response.json();
  assert.deepEqual(result.accepted, ['evt-consent-off']);
  assert.deepEqual(result.acknowledged, ['evt-opted-out-move', 'evt-consent-off']);
  const recent = await fetch(`${baseUrl}/api/events/recent`, { headers: { cookie } }).then((item) => item.json());
  assert.equal(recent.events.some((event) => event.event_id === 'evt-opted-out-move'), false);

  await fetch(`${baseUrl}/api/privacy/consent`, {
    method: 'PUT', headers: { 'content-type': 'application/json', cookie }, body: JSON.stringify({ active: true }),
  });
});

test('video upload returns a protected playable URL', async () => {
  const form = new FormData();
  form.set('assetId', 'u-test-video');
  form.set('title', '测试视频');
  form.set('description', '上传链路测试');
  form.set('file', new File([Buffer.from('fake-mp4-data')], 'test.mp4', { type: 'video/mp4' }));
  const uploaded = await fetch(`${baseUrl}/api/media`, { method: 'POST', headers: { cookie }, body: form });
  assert.equal(uploaded.status, 201);
  const body = await uploaded.json();
  assert.equal(body.asset.mediaUrl, '/api/media/u-test-video');
  const media = await fetch(`${baseUrl}${body.asset.mediaUrl}`, { headers: { cookie } });
  assert.equal(media.status, 200);
  assert.equal(media.headers.get('content-type'), 'video/mp4');
  assert.equal(Buffer.from(await media.arrayBuffer()).toString(), 'fake-mp4-data');
  const ranged = await fetch(`${baseUrl}${body.asset.mediaUrl}`, { headers: { cookie, range: 'bytes=0-3' } });
  assert.equal(ranged.status, 206);
  assert.equal(ranged.headers.get('content-range'), 'bytes 0-3/13');
  assert.equal(Buffer.from(await ranged.arrayBuffer()).toString(), 'fake');
});

test('public assets, public demands, and responses are shared across accounts with ownership checks', async () => {
  const privateBeforePublish = await fetch(`${baseUrl}/api/media/u-test-video`);
  assert.equal(privateBeforePublish.status, 401);

  const secondRegistration = await fetch(`${baseUrl}/api/auth/register`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      identity: 'second@example.com', username: 'second-player', nickname: '第二位旅人', spaceName: '海边小屋',
      password: 'second-horse', confirmPassword: 'second-horse', ageConfirmed: true, agreeTerms: true, research: true,
    }),
  });
  assert.equal(secondRegistration.status, 201);
  secondCookie = secondRegistration.headers.get('set-cookie').split(';')[0];

  const privateFromOtherAccount = await fetch(`${baseUrl}/api/media/u-test-video`, { headers: { cookie: secondCookie } });
  assert.equal(privateFromOtherAccount.status, 403);

  const publishedAsset = await fetch(`${baseUrl}/api/public/assets`, {
    method: 'POST', headers: { 'content-type': 'application/json', cookie },
    body: JSON.stringify({ id: 'u-test-video', title: '雨后的街角', description: '给公共世界的测试素材', wx: 48, wy: -12, zone: '镇中心' }),
  });
  assert.equal(publishedAsset.status, 201);
  assert.equal((await publishedAsset.json()).asset.owner, 'me');

  const playableByOtherAccount = await fetch(`${baseUrl}/api/media/u-test-video`, { headers: { cookie: secondCookie } });
  assert.equal(playableByOtherAccount.status, 200);
  assert.equal(Buffer.from(await playableByOtherAccount.arrayBuffer()).toString(), 'fake-mp4-data');

  const createdDemand = await fetch(`${baseUrl}/api/public/demands`, {
    method: 'POST', headers: { 'content-type': 'application/json', cookie },
    body: JSON.stringify({ id: 'n-public-test', title: '寻找雨夜街景', description: '需要一段安静的雨夜素材', wx: 52, wy: -16, zone: '镇中心' }),
  });
  assert.equal(createdDemand.status, 201);

  const publicWorldForSecond = await fetch(`${baseUrl}/api/public/world`, { headers: { cookie: secondCookie } }).then((response) => response.json());
  assert.equal(publicWorldForSecond.assets.some((asset) => asset.id === 'u-test-video' && asset.owner === 'other'), true);
  assert.equal(publicWorldForSecond.demands.some((demand) => demand.id === 'n-public-test' && demand.owner === 'other'), true);

  const comment = await fetch(`${baseUrl}/api/public/assets/u-test-video/comments`, {
    method: 'POST', headers: { 'content-type': 'application/json', cookie: secondCookie },
    body: JSON.stringify({ id: 'comment-second', text: '这个镜头很适合需求。' }),
  });
  assert.equal(comment.status, 201);
  assert.equal((await comment.json()).comment.owner, 'me');

  const response = await fetch(`${baseUrl}/api/public/demands/n-public-test/responses`, {
    method: 'POST', headers: { 'content-type': 'application/json', cookie: secondCookie },
    body: JSON.stringify({ id: 'response-second', text: '我建议采用这段视频。', assetId: 'u-test-video', assetTitle: '雨后的街角' }),
  });
  assert.equal(response.status, 201);

  const forbiddenEdit = await fetch(`${baseUrl}/api/public/demands/n-public-test`, {
    method: 'PATCH', headers: { 'content-type': 'application/json', cookie: secondCookie }, body: JSON.stringify({ status: 'closed' }),
  });
  assert.equal(forbiddenEdit.status, 403);
  const forbiddenDelete = await fetch(`${baseUrl}/api/public/demands/n-public-test`, {
    method: 'DELETE', headers: { 'content-type': 'application/json', cookie: secondCookie }, body: '{}',
  });
  assert.equal(forbiddenDelete.status, 403);

  const publicWorldForOwner = await fetch(`${baseUrl}/api/public/world`, { headers: { cookie } }).then((result) => result.json());
  const ownerAsset = publicWorldForOwner.assets.find((asset) => asset.id === 'u-test-video');
  const ownerDemand = publicWorldForOwner.demands.find((demand) => demand.id === 'n-public-test');
  assert.equal(ownerAsset.comments.some((item) => item.id === 'comment-second' && item.owner === 'other'), true);
  assert.equal(ownerDemand.responses.some((item) => item.id === 'response-second' && item.owner === 'other'), true);

  const cannotDeleteOthersComment = await fetch(`${baseUrl}/api/public/assets/u-test-video/comments/comment-second`, {
    method: 'DELETE', headers: { 'content-type': 'application/json', cookie }, body: '{}',
  });
  assert.equal(cannotDeleteOthersComment.status, 403);
  const deleteOwnComment = await fetch(`${baseUrl}/api/public/assets/u-test-video/comments/comment-second`, {
    method: 'DELETE', headers: { 'content-type': 'application/json', cookie: secondCookie }, body: '{}',
  });
  assert.equal(deleteOwnComment.status, 200);
});

test('public interactions, ownership management, delta sync, and moderation are server-backed', async () => {
  const beforeChange = new Date(Date.now() - 1000).toISOString();
  const reaction = await fetch(`${baseUrl}/api/public/assets/u-test-video/reaction`, {
    method: 'PUT', headers: { 'content-type': 'application/json', cookie: secondCookie }, body: JSON.stringify({ liked: true }),
  });
  assert.equal(reaction.status, 200);
  assert.equal((await reaction.json()).asset.likes, 1);
  const tag = await fetch(`${baseUrl}/api/public/assets/u-test-video/tags/%E9%9B%A8%E5%A4%9C`, {
    method: 'PUT', headers: { 'content-type': 'application/json', cookie: secondCookie }, body: JSON.stringify({ active: true }),
  });
  assert.equal(tag.status, 200);
  assert.equal((await tag.json()).asset.tags.includes('雨夜'), true);

  const forbiddenAssetEdit = await fetch(`${baseUrl}/api/public/assets/u-test-video`, {
    method: 'PATCH', headers: { 'content-type': 'application/json', cookie: secondCookie }, body: JSON.stringify({ title: '不应成功' }),
  });
  assert.equal(forbiddenAssetEdit.status, 403);
  const ownerAssetEdit = await fetch(`${baseUrl}/api/public/assets/u-test-video`, {
    method: 'PATCH', headers: { 'content-type': 'application/json', cookie }, body: JSON.stringify({ title: '雨后的公共街角', wx: 64, wy: -18 }),
  });
  assert.equal(ownerAssetEdit.status, 200);
  assert.equal((await ownerAssetEdit.json()).asset.title, '雨后的公共街角');

  const createdComment = await fetch(`${baseUrl}/api/public/assets/u-test-video/comments`, {
    method: 'POST', headers: { 'content-type': 'application/json', cookie: secondCookie }, body: JSON.stringify({ id: 'comment-editable', text: '第一版留言' }),
  });
  assert.equal(createdComment.status, 201);
  const editedComment = await fetch(`${baseUrl}/api/public/assets/u-test-video/comments/comment-editable`, {
    method: 'PATCH', headers: { 'content-type': 'application/json', cookie: secondCookie }, body: JSON.stringify({ text: '修改后的留言' }),
  });
  assert.equal(editedComment.status, 200);
  assert.equal((await editedComment.json()).comment.text, '修改后的留言');

  const relation = await fetch(`${baseUrl}/api/public/records`, {
    method: 'POST', headers: { 'content-type': 'application/json', cookie: secondCookie },
    body: JSON.stringify({ id: 'relation-public-test', kind: 'asset_relation', payload: { aId: 'u-test-video', bId: 'v-built-in', type: 'contrast', note: '一明一暗' } }),
  });
  assert.equal(relation.status, 201);
  const link = await fetch(`${baseUrl}/api/public/demands/n-public-test/links`, {
    method: 'PUT', headers: { 'content-type': 'application/json', cookie: secondCookie }, body: JSON.stringify({ assetId: 'u-test-video', active: true }),
  });
  assert.equal(link.status, 200);
  assert.equal((await link.json()).demand.assetLinks.includes('u-test-video'), true);

  const secondDemand = await fetch(`${baseUrl}/api/public/demands`, {
    method: 'POST', headers: { 'content-type': 'application/json', cookie },
    body: JSON.stringify({ id: 'n-response-boundary-test', title: '另一张需求' }),
  });
  assert.equal(secondDemand.status, 201);
  const wrongDemandResponseEdit = await fetch(`${baseUrl}/api/public/demands/n-response-boundary-test/responses/response-second`, {
    method: 'PATCH', headers: { 'content-type': 'application/json', cookie: secondCookie }, body: JSON.stringify({ text: '不应跨需求修改' }),
  });
  assert.equal(wrongDemandResponseEdit.status, 404);

  const delta = await fetch(`${baseUrl}/api/public/world?since=${encodeURIComponent(beforeChange)}&limit=10`, { headers: { cookie } }).then((response) => response.json());
  assert.equal(delta.mode, 'delta');
  assert.equal(delta.assets.some((asset) => asset.id === 'u-test-video' && asset.likes === 1 && asset.tags.includes('雨夜')), true);
  assert.equal(delta.records.some((record) => record.id === 'relation-public-test' && record.owner === 'other'), true);

  const missingTargetReport = await fetch(`${baseUrl}/api/public/reports`, {
    method: 'POST', headers: { 'content-type': 'application/json', cookie: secondCookie },
    body: JSON.stringify({ targetType: 'asset', targetId: 'missing-asset', reason: '不存在的对象不应进入审核队列' }),
  });
  assert.equal(missingTargetReport.status, 404);

  const report = await fetch(`${baseUrl}/api/public/reports`, {
    method: 'POST', headers: { 'content-type': 'application/json', cookie: secondCookie },
    body: JSON.stringify({ targetType: 'asset', targetId: 'u-test-video', reason: '自动化审核流程测试' }),
  });
  assert.equal(report.status, 201);
  const reportId = (await report.json()).report.id;
  const forbiddenQueue = await fetch(`${baseUrl}/api/admin/reports`, { headers: { cookie: secondCookie } });
  assert.equal(forbiddenQueue.status, 403);
  const adminQueue = await fetch(`${baseUrl}/api/admin/reports`, { headers: { cookie } }).then((response) => response.json());
  assert.equal(adminQueue.reports.some((item) => item.id === reportId), true);
  const hide = await fetch(`${baseUrl}/api/admin/moderation/asset/u-test-video`, {
    method: 'PUT', headers: { 'content-type': 'application/json', cookie }, body: JSON.stringify({ hidden: true }),
  });
  assert.equal(hide.status, 200);
  const resolve = await fetch(`${baseUrl}/api/admin/reports/${reportId}`, {
    method: 'PATCH', headers: { 'content-type': 'application/json', cookie }, body: JSON.stringify({ status: 'resolved' }),
  });
  assert.equal(resolve.status, 200);
  const worldAfterModeration = await fetch(`${baseUrl}/api/public/world`, { headers: { cookie: secondCookie } }).then((response) => response.json());
  assert.equal(worldAfterModeration.assets.some((asset) => asset.id === 'u-test-video'), false);
  assert.equal(worldAfterModeration.deletedAssetIds.includes('u-test-video'), true);
});

test('account export returns complete server-side state, assets, and raw events', async () => {
  const response = await fetch(`${baseUrl}/api/privacy/export`, { headers: { cookie } });
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.export.world_state.wx, 120);
  assert.equal(body.export.assets.some((asset) => asset.id === 'u-test-video'), true);
  assert.equal(body.export.public_assets.some((asset) => asset.id === 'u-test-video'), true);
  assert.equal(body.export.public_demands.some((demand) => demand.id === 'n-public-test'), true);
  assert.equal(Array.isArray(body.export.public_responses), true);
  assert.equal(body.export.raw_events.some((event) => event.event_id === 'evt-0001'), true);
  assert.equal('passwordHash' in body.export.profile, false);
});

test('server-side anonymization removes login identity, updates world profile, and revokes sessions', async () => {
  const response = await fetch(`${baseUrl}/api/privacy/anonymize`, {
    method: 'POST', headers: { 'content-type': 'application/json', cookie }, body: JSON.stringify({ confirm: true }),
  });
  assert.equal(response.status, 200);
  const session = await fetch(`${baseUrl}/api/auth/session`, { headers: { cookie } }).then((item) => item.json());
  assert.equal(session.authenticated, false);
  const store = JSON.parse(await fs.readFile(path.join(dataDir, 'store.json'), 'utf8'));
  assert.match(store.users[0].identity, /^anonymous-/);
  assert.equal(store.users[0].passwordHash, '');
  assert.equal(store.users[0].research, false);
  assert.equal(store.worldStates[store.users[0].id].state.profile.nickname, '匿名旅人');
});
