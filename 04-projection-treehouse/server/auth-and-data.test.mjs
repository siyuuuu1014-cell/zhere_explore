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
let repository;

before(async () => {
  dataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'zhere-server-test-'));
  repository = new LocalRepository(dataDir);
  await repository.init();
  const config = {
    isProduction: false, repository: 'local', appDir: path.resolve(import.meta.dirname, '..'), dataDir,
    sessionDays: 30, sessionCookieSecure: 'auto', maxJsonBytes: 2 * 1024 * 1024, maxVideoBytes: 1024 * 1024,
    publicWriteLimit: 60, publicWorldCacheTtlMs: 3000, slowRequestThresholdMs: 0,
    basePriceTransactionCount: 10, adminIdentities: ['player@example.com'],
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
  assert.doesNotMatch(setCookie, /; Secure/i);
  cookie = setCookie.split(';')[0];
});

test('a completed registration cannot be replayed through the register endpoint', async () => {
  const response = await fetch(`${baseUrl}/api/auth/register`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      identity: 'player@example.com', username: 'player', nickname: '路过的风', spaceName: '礁石小窝',
      password: 'correct-horse', confirmPassword: 'correct-horse', ageConfirmed: true, agreeTerms: true, research: true,
    }),
  });
  assert.equal(response.status, 409);
  assert.equal((await response.json()).error.code, 'identity-exists');
});

test('register rejects malformed public profile fields', async () => {
  const cases = [
    { username: '中文名', nickname: '旅人', spaceName: '小屋', message: /用户名只能使用/ },
    { username: 'valid-user', nickname: '这是一个明显超过十六个字符限制的昵称内容', spaceName: '小屋', message: /昵称需要/ },
    { username: 'valid-user', nickname: '旅人', spaceName: '这是一个明显超过二十四个字符限制的小屋名称内容用于测试', message: /小屋名称需要/ },
  ];
  for (const [index, item] of cases.entries()) {
    const response = await fetch(`${baseUrl}/api/auth/register`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        identity: `invalid-profile-${index}@example.com`, username: item.username, nickname: item.nickname, spaceName: item.spaceName,
        password: 'correct-horse', confirmPassword: 'correct-horse', ageConfirmed: true, agreeTerms: true, research: false,
      }),
    });
    assert.equal(response.status, 400);
    assert.match((await response.json()).error.message, item.message);
  }
});

test('register accepts an exact mainland phone number and creates the internal username', async () => {
  const invalidPhone = await fetch(`${baseUrl}/api/auth/register`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      identity: '1380013800', nickname: '手机旅人', spaceName: '河岸小屋',
      password: 'correct-horse', confirmPassword: 'correct-horse', ageConfirmed: true, agreeTerms: true, research: false,
    }),
  });
  assert.equal(invalidPhone.status, 400);

  const response = await fetch(`${baseUrl}/api/auth/register`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      identity: '13800138000', nickname: '手机旅人', spaceName: '河岸小屋',
      password: 'correct-horse', confirmPassword: 'correct-horse', ageConfirmed: true, agreeTerms: true, research: false,
    }),
  });
  assert.equal(response.status, 201);
  const body = await response.json();
  assert.match(body.user.username, /^user-[a-f0-9]{12}$/);
  assert.equal(body.state, null);
  assert.equal(body.version, 0);
});

test('session cookie auto mode follows HTTPS proxy headers', async () => {
  const response = await fetch(`${baseUrl}/api/auth/login`, {
    method: 'POST', headers: { 'content-type': 'application/json', 'x-forwarded-proto': 'https' },
    body: JSON.stringify({ identity: 'player@example.com', password: 'correct-horse' }),
  });
  assert.equal(response.status, 200);
  assert.match(response.headers.get('set-cookie'), /; Secure/i);
  const body = await response.json();
  assert.equal(Object.prototype.hasOwnProperty.call(body, 'state'), true);
});

test('forgot password is an explicit rate-limited manual request', async () => {
  const invalid = await fetch(`${baseUrl}/api/auth/forgot-password`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ identity: 'not-an-account' }),
  });
  assert.equal(invalid.status, 400);
  const request = await fetch(`${baseUrl}/api/auth/forgot-password`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ identity: 'player@example.com', note: '测试人工重置' }),
  });
  assert.equal(request.status, 202);
  const body = await request.json();
  assert.equal(body.mode, 'manual-admin');
  assert.match(body.message, /不会自动发送邮件或短信/);
});

test('world state persists behind the authenticated API', async () => {
  const state = { wx: 120, wy: -30, wallet: 490, profile: { nickname: '路过的风' } };
  const saved = await fetch(`${baseUrl}/api/world-state`, {
    method: 'PUT', headers: { 'content-type': 'application/json', cookie }, body: JSON.stringify({ state, baseVersion: 0 }),
  });
  assert.equal(saved.status, 200);
  const savedBody = await saved.json();
  assert.equal(savedBody.version, 1);
  const newerState = { ...state, wx: 140 };
  const newer = await fetch(`${baseUrl}/api/world-state`, {
    method: 'PUT', headers: { 'content-type': 'application/json', cookie }, body: JSON.stringify({ state: newerState, baseVersion: 1 }),
  });
  assert.equal(newer.status, 200);
  assert.equal((await newer.json()).version, 2);
  const stale = await fetch(`${baseUrl}/api/world-state`, {
    method: 'PUT', headers: { 'content-type': 'application/json', cookie }, body: JSON.stringify({ state: { ...state, wx: -999 }, baseVersion: 1 }),
  });
  assert.equal(stale.status, 409);
  const staleBody = await stale.json();
  assert.equal(staleBody.error.code, 'world-state-conflict');
  assert.equal(staleBody.conflict.version, 2);
  assert.equal(staleBody.conflict.state.wx, 140);
  const restored = await fetch(`${baseUrl}/api/world-state`, { headers: { cookie } });
  assert.equal(restored.status, 200);
  assert.deepEqual((await restored.json()).state, newerState);
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

test('research identity, consent history, and collection health are connected', async () => {
  const status = await fetch(`${baseUrl}/api/privacy/research-status`, { headers: { cookie } });
  assert.equal(status.status, 200);
  const body = await status.json();
  assert.equal(body.collecting, true);
  assert.equal(body.status, 'collecting');
  assert.equal(body.event_count >= 1, true);
  assert.equal(body.consent_record_count >= 1, true);
  assert.equal(body.consent_version, 'research-v1');

  const stored = JSON.parse(await fs.readFile(path.join(dataDir, 'store.json'), 'utf8'));
  const user = stored.users.find((item) => item.identity === 'player@example.com');
  const subject = stored.researchSubjects.find((item) => item.user_id === user.id);
  assert.match(subject.subject_id, /^rs-/);
  assert.equal(stored.events.find((event) => event.event_id === 'evt-0001').research_subject_id, subject.subject_id);
  assert.equal(stored.researchConsents.some((item) => item.user_id === user.id && item.reason === 'registration' && item.research_allowed === true), true);
  assert.equal(stored.researchSessions.some((item) => item.user_id === user.id && item.subject_id === subject.subject_id), true);
});

test('research opt-out is persisted and non-essential telemetry is acknowledged without storage', async () => {
  const consent = await fetch(`${baseUrl}/api/privacy/consent`, {
    method: 'PUT', headers: { 'content-type': 'application/json', cookie }, body: JSON.stringify({ active: false }),
  });
  assert.equal(consent.status, 200);
  assert.equal((await consent.json()).user.research, false);

  const paused = await fetch(`${baseUrl}/api/privacy/research-status`, { headers: { cookie } }).then((item) => item.json());
  assert.equal(paused.status, 'paused');
  assert.equal(paused.collecting, false);
  assert.equal(paused.consent_record_count >= 2, true);

  const events = [
    { event_id: 'evt-opted-out-move', raw_event: 'move_sample', details: { wx: 2 }, created_at: new Date().toISOString(), research_consent: false },
    { event_id: 'evt-consent-off', raw_event: 'research_consent_change', details: { active: false }, created_at: new Date().toISOString(), research_consent: false },
    { event_id: 'evt-opted-out-feedback', raw_event: 'feedback', details: { text: '按钮没有反应' }, created_at: new Date().toISOString(), research_consent: false },
  ];
  const response = await fetch(`${baseUrl}/api/events/batch`, {
    method: 'POST', headers: { 'content-type': 'application/json', cookie }, body: JSON.stringify({ events }),
  });
  const result = await response.json();
  assert.deepEqual(result.accepted, ['evt-consent-off', 'evt-opted-out-feedback']);
  assert.deepEqual(result.acknowledged, ['evt-opted-out-move', 'evt-consent-off', 'evt-opted-out-feedback']);
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

test('video upload rejects a declared body larger than the configured envelope before parsing multipart data', async () => {
  const form = new FormData();
  form.set('file', new File([Buffer.alloc(2 * 1024 * 1024)], 'too-large.mp4', { type: 'video/mp4' }));
  const response = await fetch(`${baseUrl}/api/media`, { method: 'POST', headers: { cookie }, body: form });
  assert.equal(response.status, 413);
});

test('combined video upload and publication is idempotent and immediately public', async () => {
  const makeForm = () => {
    const form = new FormData();
    form.set('assetId', 'u-combined-video');
    form.set('title', '一站式发布视频');
    form.set('description', '上传与公共发布共用一次请求');
    form.set('wx', '128');
    form.set('wy', '-44');
    form.set('zone', 'town');
    form.set('file', new File([Buffer.from('combined-mp4-data')], 'combined.mp4', { type: 'video/mp4' }));
    return form;
  };
  const first = await fetch(`${baseUrl}/api/public/assets/upload`, { method: 'POST', headers: { cookie }, body: makeForm() });
  assert.equal(first.status, 201);
  const firstBody = await first.json();
  assert.equal(firstBody.asset.id, 'u-combined-video');
  assert.equal(firstBody.asset.owner, 'me');
  assert.equal(firstBody.asset.mediaUrl, '/api/media/u-combined-video');
  assert.equal(firstBody.reusedMedia, false);

  const repeated = await fetch(`${baseUrl}/api/public/assets/upload`, { method: 'POST', headers: { cookie }, body: makeForm() });
  assert.equal(repeated.status, 200);
  const repeatedBody = await repeated.json();
  assert.equal(repeatedBody.duplicate, true);
  assert.equal(repeatedBody.reusedMedia, true);

  const world = await fetch(`${baseUrl}/api/public/world`, { headers: { cookie } }).then((response) => response.json());
  assert.equal(world.assets.filter((asset) => asset.id === 'u-combined-video').length, 1);
  const media = await fetch(`${baseUrl}/api/media/u-combined-video`, { headers: { cookie } });
  assert.equal(Buffer.from(await media.arrayBuffer()).toString(), 'combined-mp4-data');
});

test('combined publication resumes from an uploaded private file after a partial write failure', async () => {
  const makeForm = () => {
    const form = new FormData();
    form.set('assetId', 'u-resumable-video');
    form.set('title', '可恢复发布');
    form.set('wx', '72');
    form.set('wy', '36');
    form.set('zone', 'shore');
    form.set('file', new File([Buffer.from('resumable-video-data')], 'resumable.mp4', { type: 'video/mp4' }));
    return form;
  };
  const original = repository.savePublicAsset.bind(repository);
  let failOnce = true;
  repository.savePublicAsset = async (...args) => {
    if (failOnce) { failOnce = false; throw new Error('simulated-public-table-failure'); }
    return original(...args);
  };
  try {
    const interrupted = await fetch(`${baseUrl}/api/public/assets/upload`, { method: 'POST', headers: { cookie }, body: makeForm() });
    assert.equal(interrupted.status, 500);
    const privateMedia = await fetch(`${baseUrl}/api/media/u-resumable-video`, { headers: { cookie } });
    assert.equal(privateMedia.status, 200);

    const resumed = await fetch(`${baseUrl}/api/public/assets/upload`, { method: 'POST', headers: { cookie }, body: makeForm() });
    assert.equal(resumed.status, 201);
    const body = await resumed.json();
    assert.equal(body.reusedMedia, true);
    assert.equal(body.asset.id, 'u-resumable-video');
  } finally {
    repository.savePublicAsset = original;
  }
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

  const metadataOnlyPublish = await fetch(`${baseUrl}/api/public/assets`, {
    method: 'POST', headers: { 'content-type': 'application/json', cookie },
    body: JSON.stringify({ id: 'u-without-media', title: '只有标题的素材', wx: 0, wy: 0, zone: '镇中心' }),
  });
  assert.equal(metadataOnlyPublish.status, 400);
  assert.equal((await metadataOnlyPublish.json()).error.code, 'media-required');

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
  const repeatedResponse = await fetch(`${baseUrl}/api/public/demands/n-public-test/responses`, {
    method: 'POST', headers: { 'content-type': 'application/json', cookie: secondCookie },
    body: JSON.stringify({ id: 'response-second', text: '我建议采用这段视频。', assetId: 'u-test-video', assetTitle: '雨后的街角' }),
  });
  assert.equal(repeatedResponse.status, 200);
  assert.equal((await repeatedResponse.json()).duplicate, true);

  const wrongDemandResponseEdit = await fetch(`${baseUrl}/api/public/demands/not-the-parent/responses/response-second`, {
    method: 'PATCH', headers: { 'content-type': 'application/json', cookie: secondCookie }, body: JSON.stringify({ text: '不应保存' }),
  });
  assert.equal(wrongDemandResponseEdit.status, 404);

  const crossUserPurchase = await fetch(`${baseUrl}/api/pricing/materials/u-test-video/bids`, {
    method: 'POST', headers: { 'content-type': 'application/json', cookie: secondCookie },
    body: JSON.stringify({ bid_price: 37, idempotency_key: 'public-material-second-bid' }),
  });
  assert.equal(crossUserPurchase.status, 201);
  const crossUserPurchaseBody = await crossUserPurchase.json();
  assert.equal(crossUserPurchaseBody.bid.bid_status, 'accepted');
  assert.equal(crossUserPurchaseBody.transaction.material_id, 'u-test-video');
  assert.equal(crossUserPurchaseBody.transaction.transaction_price, 37);
  const secondPurchases = await fetch(`${baseUrl}/api/pricing/purchases`, { headers: { cookie: secondCookie } }).then((item) => item.json());
  assert.equal(secondPurchases.purchases.some((purchase) => purchase.material_id === 'u-test-video'), true);

  const secondWorldState = {
    wx: 48, wy: -12, wallet: 500,
    profile: { nickname: '第二位旅人', spaceName: '海边小屋' },
    copies: [{ assetId: 'u-test-video', acquiredAt: '2026/8/12', source: 'pricing' }],
    placed: [{ assetId: 'u-test-video', x: 46, y: 58, since: Date.now() }],
    worldMode: 'cottage', homestead: { day: 2, buildings: { workbench: 1 } },
  };
  const savedSecondWorld = await fetch(`${baseUrl}/api/world-state`, {
    method: 'PUT', headers: { 'content-type': 'application/json', cookie: secondCookie }, body: JSON.stringify({ state: secondWorldState }),
  });
  assert.equal(savedSecondWorld.status, 200);
  const restoredSecondWorld = await fetch(`${baseUrl}/api/world-state`, { headers: { cookie: secondCookie } }).then((item) => item.json());
  assert.deepEqual(restoredSecondWorld.state.copies, secondWorldState.copies);
  assert.deepEqual(restoredSecondWorld.state.placed, secondWorldState.placed);
  assert.equal(restoredSecondWorld.state.worldMode, 'cottage');

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

  const notifications = await fetch(`${baseUrl}/api/notifications`, { headers: { cookie } }).then((item) => item.json());
  assert.equal(notifications.notifications.some((item) => item.id === 'comment:comment-second' && item.targetId === 'u-test-video'), true);
  assert.equal(notifications.notifications.some((item) => item.id === 'response:response-second' && item.targetId === 'n-public-test'), true);

  const cannotDeleteOthersComment = await fetch(`${baseUrl}/api/public/assets/u-test-video/comments/comment-second`, {
    method: 'DELETE', headers: { 'content-type': 'application/json', cookie }, body: '{}',
  });
  assert.equal(cannotDeleteOthersComment.status, 403);
  const deleteOwnComment = await fetch(`${baseUrl}/api/public/assets/u-test-video/comments/comment-second`, {
    method: 'DELETE', headers: { 'content-type': 'application/json', cookie: secondCookie }, body: '{}',
  });
  assert.equal(deleteOwnComment.status, 200);
});

test('profile updates are reflected in later public authorship', async () => {
  const updated = await fetch(`${baseUrl}/api/profile`, {
    method: 'PUT', headers: { 'content-type': 'application/json', cookie },
    body: JSON.stringify({ nickname: '新名字旅人', spaceName: '改名后的小窝' }),
  });
  assert.equal(updated.status, 200);
  assert.equal((await updated.json()).user.nickname, '新名字旅人');

  const message = await fetch(`${baseUrl}/api/public/records`, {
    method: 'POST', headers: { 'content-type': 'application/json', cookie },
    body: JSON.stringify({ id: 'bench-profile-name', kind: 'bench_message', payload: { text: '改名后的第一句话' } }),
  });
  assert.equal(message.status, 201);
  assert.equal((await message.json()).record.name, '新名字旅人');
});

test('the public swap box is shared and only one concurrent claimant succeeds', async () => {
  const firstWorld = await fetch(`${baseUrl}/api/public/world`, { headers: { cookie } }).then((response) => response.json());
  const seedOffer = firstWorld.records.find((record) => record.kind === 'swap_offer');
  assert.ok(seedOffer);
  assert.equal(seedOffer.payload.npc, true);

  const attempts = await Promise.all([
    [cookie, 'v-swap-first'],
    [secondCookie, 'v-swap-second'],
  ].map(([claimCookie, replacementAssetId]) => fetch(`${baseUrl}/api/public/swaps/${encodeURIComponent(seedOffer.id)}/claim`, {
    method: 'POST', headers: { 'content-type': 'application/json', cookie: claimCookie },
    body: JSON.stringify({ replacementAssetId, note: `留下 ${replacementAssetId}` }),
  }).then(async (response) => ({ status: response.status, body: await response.json(), cookie: claimCookie }))));

  assert.equal(attempts.filter((item) => item.status === 201).length, 1);
  assert.equal(attempts.filter((item) => item.status === 409).length, 1);
  const winner = attempts.find((item) => item.status === 201);
  const loser = attempts.find((item) => item.status === 409);
  assert.equal(winner.body.gainedAssetId, seedOffer.payload.assetId);
  assert.equal(loser.body.error.code, 'swap-offer-gone');

  const viewerCookie = winner.cookie === cookie ? secondCookie : cookie;
  const sharedWorld = await fetch(`${baseUrl}/api/public/world`, { headers: { cookie: viewerCookie } }).then((response) => response.json());
  const replacementOffer = sharedWorld.records.find((record) => record.id === winner.body.offer.id);
  assert.ok(replacementOffer);
  assert.equal(replacementOffer.owner, 'other');

  const ownClaim = await fetch(`${baseUrl}/api/public/swaps/${encodeURIComponent(winner.body.offer.id)}/claim`, {
    method: 'POST', headers: { 'content-type': 'application/json', cookie: winner.cookie },
    body: JSON.stringify({ replacementAssetId: 'v-swap-own', note: '不能自己取回' }),
  });
  assert.equal(ownClaim.status, 409);
  assert.equal((await ownClaim.json()).error.code, 'swap-own-offer');
});

test('public interactions, ownership management, delta sync, and moderation are server-backed', async () => {
  const beforeChange = new Date(Date.now() - 1000).toISOString();
  const reaction = await fetch(`${baseUrl}/api/public/assets/u-test-video/reaction`, {
    method: 'PUT', headers: { 'content-type': 'application/json', cookie: secondCookie }, body: JSON.stringify({ liked: true }),
  });
  assert.equal(reaction.status, 200);
  assert.equal((await reaction.json()).asset.likes, 1);
  const worldImmediatelyAfterReaction = await fetch(`${baseUrl}/api/public/world`, { headers: { cookie: secondCookie } }).then((response) => response.json());
  assert.equal(worldImmediatelyAfterReaction.assets.some((asset) => asset.id === 'u-test-video' && asset.likes === 1), true);
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
  const archivedAsset = await fetch(`${baseUrl}/api/public/assets/u-test-video`, {
    method: 'PATCH', headers: { 'content-type': 'application/json', cookie }, body: JSON.stringify({ archived: true }),
  });
  assert.equal((await archivedAsset.json()).asset.archived, true);
  const archivedDemand = await fetch(`${baseUrl}/api/public/demands/n-public-test`, {
    method: 'PATCH', headers: { 'content-type': 'application/json', cookie }, body: JSON.stringify({ archived: true }),
  });
  assert.equal((await archivedDemand.json()).demand.archived, true);

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
  const looseTag = await fetch(`${baseUrl}/api/public/records`, {
    method: 'POST', headers: { 'content-type': 'application/json', cookie: secondCookie },
    body: JSON.stringify({ id: 'loose-tag-public-test', kind: 'loose_tag', payload: { tag: '雨停以后', wx: 318, wy: -204, zone: '镇中心' } }),
  });
  assert.equal(looseTag.status, 201);
  const sharedLooseTag = await fetch(`${baseUrl}/api/public/world`, { headers: { cookie } }).then((response) => response.json());
  assert.equal(sharedLooseTag.records.some((record) => record.id === 'loose-tag-public-test' && record.payload.tag === '雨停以后' && record.owner === 'other'), true);
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

test('each account can buy a material once while ten different buyers form the base price', async () => {
  const invalid = await fetch(`${baseUrl}/api/pricing/materials/v-pricing-test/bids`, {
    method: 'POST', headers: { 'content-type': 'application/json', cookie },
    body: JSON.stringify({ bid_price: 0, idempotency_key: 'pricing-invalid-0001' }),
  });
  assert.equal(invalid.status, 400);

  const prices = [48, 52, 50, 49, 51, 53, 47, 50, 52, 48];
  const bidderCookies = [cookie, secondCookie];
  for (let index = 2; index < prices.length; index += 1) {
    const registration = await fetch(`${baseUrl}/api/auth/register`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        identity: `pricing-${index}@example.com`, username: `pricing-player-${index}`, nickname: `报价旅人${index}`, spaceName: `报价小屋${index}`,
        password: `pricing-horse-${index}`, confirmPassword: `pricing-horse-${index}`, ageConfirmed: true, agreeTerms: true, research: true,
      }),
    });
    assert.equal(registration.status, 201);
    bidderCookies.push(registration.headers.get('set-cookie').split(';')[0]);
  }
  const results = [];
  for (let index = 0; index < prices.length; index += 1) {
    const response = await fetch(`${baseUrl}/api/pricing/materials/v-pricing-test/bids`, {
      method: 'POST', headers: { 'content-type': 'application/json', cookie: bidderCookies[index] },
      body: JSON.stringify({ bid_price: prices[index], idempotency_key: `pricing-sample-${String(index).padStart(4, '0')}` }),
    });
    assert.equal(response.status, 201);
    const body = await response.json();
    assert.equal(body.bid.bid_status, 'accepted');
    assert.equal(body.transaction.bid_price, prices[index]);
    assert.equal(body.transaction.transaction_price, prices[index]);
    assert.equal(body.transaction.is_valid, true);
    assert.equal(body.pricing.base_price, index < 9 ? null : 50);
    assert.equal(body.insight.eligible, true);
    assert.equal(body.insight.cohort == null, index < 4);
    results.push(body);
  }

  // 不可变基础价版本：10 笔成交应追加 10 条快照 + 1 条 formation，版本严格递增。
  const basePriceVersions = await repository.listBasePriceVersions('v-pricing-test');
  assert.equal(basePriceVersions.length >= 10, true);
  const ascendingVersions = [...basePriceVersions].sort((a, b) => Number(a.version) - Number(b.version));
  assert.equal(ascendingVersions.every((item, index) => index === 0 || Number(item.version) > Number(ascendingVersions[index - 1].version)), true);
  assert.equal(ascendingVersions.some((item) => item.formed === true), true);
  assert.equal(ascendingVersions.at(-1).base_price, 50);
  assert.equal(ascendingVersions.find((item) => item.formed === true).transaction_id, null);

  const duplicate = await fetch(`${baseUrl}/api/pricing/materials/v-pricing-test/bids`, {
    method: 'POST', headers: { 'content-type': 'application/json', cookie },
    body: JSON.stringify({ bid_price: 999, idempotency_key: 'pricing-sample-0000' }),
  });
  assert.equal(duplicate.status, 200);
  const duplicateBody = await duplicate.json();
  assert.equal(duplicateBody.bid.bid_id, results[0].bid.bid_id);
  assert.equal(duplicateBody.transaction.transaction_id, results[0].transaction.transaction_id);
  assert.equal(duplicateBody.pricing.valid_transaction_count, 10);

  const repeatedPurchase = await fetch(`${baseUrl}/api/pricing/materials/v-pricing-test/bids`, {
    method: 'POST', headers: { 'content-type': 'application/json', cookie },
    body: JSON.stringify({ bid_price: 55, idempotency_key: 'pricing-repeat-0001' }),
  });
  assert.equal(repeatedPurchase.status, 409);
  assert.equal((await repeatedPurchase.json()).error.code, 'material-already-acquired');

  const purchases = await fetch(`${baseUrl}/api/pricing/purchases`, { headers: { cookie } }).then((response) => response.json());
  assert.equal(purchases.purchases.filter((purchase) => purchase.material_id === 'v-pricing-test').length, 1);
  assert.equal(purchases.purchases.find((purchase) => purchase.material_id === 'v-pricing-test').transaction_id, results[0].transaction.transaction_id);

  const pricing = await fetch(`${baseUrl}/api/pricing/materials/v-pricing-test`, { headers: { cookie } }).then((response) => response.json());
  assert.equal(pricing.pricing.base_price, 50);
  assert.equal(pricing.pricing.sample_transaction_ids.length, 10);
  assert.deepEqual(pricing.insight.cohort, { minimum: 47, maximum: 53, mean: 50, median: 50 });

  const outsiderRegistration = await fetch(`${baseUrl}/api/auth/register`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      identity: 'pricing-outsider@example.com', username: 'pricing-outsider', nickname: '未报价旅人', spaceName: '观察小屋',
      password: 'pricing-outsider-horse', confirmPassword: 'pricing-outsider-horse', ageConfirmed: true, agreeTerms: true, research: true,
    }),
  });
  const outsiderCookie = outsiderRegistration.headers.get('set-cookie').split(';')[0];
  const hiddenPricing = await fetch(`${baseUrl}/api/pricing/materials/v-pricing-test`, { headers: { cookie: outsiderCookie } }).then((response) => response.json());
  assert.equal(hiddenPricing.pricing.base_price, null);
  assert.equal(hiddenPricing.pricing.valid_transaction_count, null);
  assert.equal(hiddenPricing.insight.sample_count, null);

  const pricingForm = new FormData();
  pricingForm.set('assetId', 'u-pricing-public');
  pricingForm.set('title', '定价测试素材');
  pricingForm.set('file', new File([Buffer.from('pricing-video')], 'pricing.mp4', { type: 'video/mp4' }));
  const pricingUpload = await fetch(`${baseUrl}/api/media`, { method: 'POST', headers: { cookie }, body: pricingForm });
  assert.equal(pricingUpload.status, 201);
  const pricingAsset = await fetch(`${baseUrl}/api/public/assets`, {
    method: 'POST', headers: { 'content-type': 'application/json', cookie },
    body: JSON.stringify({ id: 'u-pricing-public', title: '定价测试素材', description: '用于验证发布者无定价权。' }),
  });
  assert.equal(pricingAsset.status, 201);

  const ownerBid = await fetch(`${baseUrl}/api/pricing/materials/u-pricing-public/bids`, {
    method: 'POST', headers: { 'content-type': 'application/json', cookie },
    body: JSON.stringify({ bid_price: 60, idempotency_key: 'owner-bid-blocked-0001' }),
  });
  assert.equal(ownerBid.status, 403);

  const otherUserBid = await fetch(`${baseUrl}/api/pricing/materials/u-pricing-public/bids`, {
    method: 'POST', headers: { 'content-type': 'application/json', cookie: secondCookie },
    body: JSON.stringify({ bid_price: 60, idempotency_key: 'other-user-bid-0001' }),
  });
  assert.equal(otherUserBid.status, 201);

  const invalidated = await fetch(`${baseUrl}/api/admin/pricing/transactions/${encodeURIComponent(results[0].transaction.transaction_id)}`, {
    method: 'PATCH', headers: { 'content-type': 'application/json', cookie }, body: JSON.stringify({ is_valid: false }),
  });
  assert.equal(invalidated.status, 200);
  assert.equal((await invalidated.json()).pricing.base_price, null);

  const restored = await fetch(`${baseUrl}/api/admin/pricing/transactions/${encodeURIComponent(results[0].transaction.transaction_id)}`, {
    method: 'PATCH', headers: { 'content-type': 'application/json', cookie }, body: JSON.stringify({ is_valid: true }),
  });
  assert.equal(restored.status, 200);
  assert.equal((await restored.json()).pricing.base_price, 50);

  const concurrent = await Promise.all(Array.from({ length: 10 }, (_, index) => fetch(`${baseUrl}/api/pricing/materials/v-pricing-concurrent/bids`, {
    method: 'POST', headers: { 'content-type': 'application/json', cookie: bidderCookies[index] },
    body: JSON.stringify({ bid_price: index + 1, idempotency_key: `pricing-concurrent-${String(index).padStart(4, '0')}` }),
  }).then(async (response) => ({ status: response.status, body: await response.json() }))));
  assert.equal(concurrent.every((item) => item.status === 201), true);
  const concurrentPricing = await fetch(`${baseUrl}/api/pricing/materials/v-pricing-concurrent`, { headers: { cookie } }).then((response) => response.json());
  assert.equal(concurrentPricing.pricing.valid_transaction_count, 10);
  assert.equal(concurrentPricing.pricing.base_price, 5.5);

  const exportResponse = await fetch(`${baseUrl}/api/admin/pricing/export.csv`, { headers: { cookie } });
  assert.equal(exportResponse.status, 200);
  assert.match(exportResponse.headers.get('content-type'), /text\/csv/);
  const csvText = await exportResponse.text();
  assert.match(csvText, /material_id/);
  assert.match(csvText, /v-pricing-test/);
  assert.match(csvText, /base_price_version/);
  assert.match(csvText, /base_price_version_formed_at/);
});

test('legacy fallback bid request identifiers containing a decimal point remain accepted', async () => {
  const response = await fetch(`${baseUrl}/api/pricing/materials/v-fallback-idempotency/bids`, {
    method: 'POST', headers: { 'content-type': 'application/json', cookie },
    body: JSON.stringify({ bid_price: 20, idempotency_key: 'bid-1786580000000-0.123456789' }),
  });
  assert.equal(response.status, 201);
  const body = await response.json();
  assert.equal(body.transaction.transaction_price, 20);
  assert.equal(body.transaction.is_valid, true);
});

test('account export returns complete server-side state, assets, and raw events', async () => {
  const response = await fetch(`${baseUrl}/api/privacy/export`, { headers: { cookie } });
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.export.world_state.wx, 140);
  assert.equal(body.export.assets.some((asset) => asset.id === 'u-test-video'), true);
  assert.equal(body.export.public_assets.some((asset) => asset.id === 'u-test-video'), true);
  assert.equal(body.export.public_demands.some((demand) => demand.id === 'n-public-test'), true);
  assert.equal(Array.isArray(body.export.public_responses), true);
  assert.equal(body.export.bids.some((bid) => bid.material_id === 'v-pricing-test'), true);
  assert.equal(body.export.transactions.some((transaction) => transaction.material_id === 'v-pricing-test'), true);
  assert.equal(body.export.base_prices.some((pricing) => pricing.material_id === 'v-pricing-test' && pricing.base_price === 50), true);
  assert.equal(body.export.raw_events.some((event) => event.event_id === 'evt-0001'), true);
  assert.match(body.export.research_subject.subject_id, /^rs-/);
  assert.equal(body.export.research_consents.length >= 3, true);
  assert.equal(body.export.research_consents.every((consent) => !('user_id' in consent)), true);
  assert.equal('passwordHash' in body.export.profile, false);
});

test('admin research export expands impression batches into joinable CSV rows', async () => {
  const event = {
    event_id: 'evt-impression-export', raw_event: 'impression_batch', created_at: new Date().toISOString(), research_consent: true,
    details: { impression_batch_id: 'batch-export', impressions: [{ impression_id: 'imp-export', impression_batch_id: 'batch-export', asset_id: 'u-test-video', rank: 1, recommendation_score: 1.5, visibility_duration_ms: 950 }] },
  };
  await fetch(`${baseUrl}/api/events/batch`, { method: 'POST', headers: { 'content-type': 'application/json', cookie }, body: JSON.stringify({ events: [event] }) });
  const response = await fetch(`${baseUrl}/api/admin/research/events.csv`, { headers: { cookie } });
  assert.equal(response.status, 200);
  const text = await response.text();
  assert.match(text, /row_type/);
  assert.match(text, /imp-export/);
  assert.match(text, /u-test-video/);
  assert.match(text, /positive_feedback/);
  assert.match(text, /derived_schema_version/);
});

test('event batch rejects unknown event types and reports the field reason', async () => {
  const response = await fetch(`${baseUrl}/api/events/batch`, {
    method: 'POST', headers: { 'content-type': 'application/json', cookie },
    body: JSON.stringify({ events: [{ event_id: 'evt-unknown-contract', raw_event: 'typo_event', details: {}, created_at: new Date().toISOString() }] }),
  });
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.deepEqual(body.rejected_ids, ['evt-unknown-contract']);
  assert.equal(body.rejection_reasons['evt-unknown-contract'], 'unknown-event-type');
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
  const anonymousEvent = store.events.find((event) => event.event_id === 'evt-0001');
  assert.match(anonymousEvent.actor_id, /^anonymous-/);
  assert.notEqual(anonymousEvent.actor_id, store.users[0].id);
  assert.equal(store.researchSubjects.some((subject) => subject.user_id === anonymousEvent.actor_id && subject.status === 'anonymized'), true);
  assert.equal(store.researchConsents.some((consent) => consent.user_id === anonymousEvent.actor_id), true);
  assert.equal(store.researchSessions.some((researchSession) => researchSession.user_id === anonymousEvent.actor_id), true);
});
