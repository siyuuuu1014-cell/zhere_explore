// 飞书生产环境端到端验证（对应 server/FEISHU.md「启动检查」第 1-11 步，
// 并重点验证本轮新增五张研究表在真实多维表中的写入与管理员导出）。
//
// 运行方式（需要飞书 .env 与网络）：
//   $env:ZHERE_ADMIN_IDENTITIES="admin@example.com,qa-e2e-admin@example.com"
//   node --env-file-if-exists=.env scripts/feishu-e2e-verify.mjs
//
// 脚本在进程内启动真实 Repository 的 HTTP 服务（监听临时端口），结束后自动关闭。
// 业务对象（素材/需求/评论/回应）在结束时尽力清理；事件与版本历史为只追加数据，按设计保留。

import { performance } from 'node:perf_hooks';
import { config } from '../server/config.mjs';
import { createRepository } from '../server/repositories/index.mjs';
import { createApp } from '../server/app.mjs';

const runId = `qa-e2e-${Date.now()}`;
const ADMIN_IDENTITY = 'qa-e2e-admin@example.com';
const ADMIN_PASSWORD = 'qa-e2e-admin-pass-2026';
const timings = [];
const notes = [];
const cleanup = { assetId: null, demandId: null, commentId: null, responseId: null, transactionId: null, reportId: null };
let identityA = '';

class Client {
  constructor(name) {
    this.name = name;
    this.cookie = '';
  }
  async request(label, path, { method = 'GET', body, form, expect = [200] } = {}) {
    const headers = {};
    if (this.cookie) headers.cookie = this.cookie;
    if (body !== undefined && !form) headers['content-type'] = 'application/json';
    const started = performance.now();
    const response = await fetch(`http://127.0.0.1:${port}${path}`, {
      method, headers, body: form || (body === undefined ? undefined : JSON.stringify(body)),
    });
    const elapsedMs = Math.round(performance.now() - started);
    const setCookie = response.headers.get('set-cookie');
    if (setCookie) this.cookie = setCookie.split(';', 1)[0];
    const contentType = response.headers.get('content-type') || '';
    const payload = contentType.includes('application/json') ? await response.json() : await response.text();
    const passed = expect.includes(response.status);
    timings.push({ label, account: this.name, status: response.status, elapsed_ms: elapsedMs, passed });
    if (!passed) throw new Error(`${label}: expected ${expect.join('/')}, got ${response.status}: ${typeof payload === 'string' ? payload : JSON.stringify(payload).slice(0, 300)}`);
    return payload;
  }
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function event(eventId, rawEvent, details) {
  return {
    event_id: eventId, raw_event: rawEvent, created_at: new Date().toISOString(),
    research_consent: true, session_id: `qa-session-${runId}`, session_sequence: 1,
    experiment_id: 'open-world-v1', experiment_group: 'mixed-biome',
    schema_version: 2, derived_signals: {}, details,
  };
}

let port = 0;
let server = null;
let repository = null;
const stepResults = [];

async function step(name, fn) {
  const started = performance.now();
  try {
    await fn();
    stepResults.push({ step: name, ok: true, elapsed_ms: Math.round(performance.now() - started) });
    console.log(`✔ ${name}`);
  } catch (error) {
    stepResults.push({ step: name, ok: false, elapsed_ms: Math.round(performance.now() - started), error: error.message });
    console.log(`✖ ${name}: ${error.message}`);
    throw error;
  }
}

async function bestEffortCleanup() {
  const results = [];
  const attempt = async (label, fn) => {
    try { await fn(); results.push({ label, ok: true }); }
    catch (error) { results.push({ label, ok: false, error: error.message }); }
  };
  if (cleanup.transactionId) await attempt('invalidate-transaction', async () => {
    await repository.setTransactionValidity(cleanup.transactionId, false, config.basePriceTransactionCount);
  });
  if (cleanup.responseId && cleanup.demandId) await attempt('delete-response', () => b.request('清理需求回应', `/api/public/demands/${cleanup.demandId}/responses/${cleanup.responseId}`, { method: 'DELETE' }));
  if (cleanup.commentId && cleanup.assetId) await attempt('delete-comment', () => b.request('清理评论', `/api/public/assets/${cleanup.assetId}/comments/${cleanup.commentId}`, { method: 'DELETE' }));
  if (cleanup.demandId) await attempt('delete-demand', () => a.request('清理需求', `/api/public/demands/${cleanup.demandId}`, { method: 'DELETE' }));
  if (cleanup.assetId) await attempt('delete-public-asset', () => a.request('清理公共素材', `/api/public/assets/${cleanup.assetId}`, { method: 'DELETE' }));
  return results;
}

const anonymous = new Client('anonymous');
const admin = new Client('admin');
const a = new Client('A');
const b = new Client('B');

let failure = null;
let cleanupResults = [];
try {
  repository = await createRepository(config);
  server = createApp({ repository, config });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  port = server.address().port;

  await step('1 健康检查', async () => {
    const health = await anonymous.request('健康检查', '/api/health');
    assert(health.ok === true && health.repository === 'feishu', 'health 未返回 ok');
    await anonymous.request('健康检查-热读', '/api/health');
  });

  await step('2 注册/登录三个账户（research=true，含管理员）', async () => {
    const short = String(Date.now()).slice(-7);
    identityA = `qa-a-${short}@example.com`;
    for (const [client, identity, nickname] of [
      [admin, ADMIN_IDENTITY, '端到端管理员'],
      [a, identityA, `甲${short.slice(-3)}`],
      [b, `qa-b-${short}@example.com`, `乙${short.slice(-3)}`],
    ]) {
      const password = client === admin ? ADMIN_PASSWORD : 'correct-horse-2026';
      let registered = null;
      try {
        registered = await client.request(`注册${client.name}`, '/api/auth/register', {
          method: 'POST', expect: [201, 200],
          body: { identity, username: identity.split('@')[0].replace(/[^A-Za-z0-9_-]/g, '').slice(0, 32), nickname, spaceName: `${nickname}-小窝`, password, confirmPassword: password, ageConfirmed: true, agreeTerms: true, research: true },
        });
      } catch (error) {
        if (client === admin && error.message.includes('409')) {
          registered = await client.request('管理员登录', '/api/auth/login', { method: 'POST', body: { identity, password } });
          notes.push('管理员账户已存在，改用登录。');
        } else throw error;
      }
      assert(registered.user && registered.user.research === true, `${client.name} 研究授权未开启`);
      const status = await client.request(`研究状态${client.name}`, '/api/privacy/research-status');
      assert(status.collecting === true, `${client.name} 研究状态读取异常: ${JSON.stringify(status)}`);
    }
  });

  await step('3 世界状态持久化与冲突保护', async () => {
    const stateBlob = { schemaVersion: 8, worldMode: 'overworld', wx: 123, wy: -45, homestead: { day: 1 } };
    const saved = await a.request('写入世界状态', '/api/world-state', { method: 'PUT', body: { state: stateBlob, baseVersion: 0 } });
    assert(saved.version >= 1, '世界状态保存没有返回版本');
    const loaded = await a.request('读取世界状态', '/api/world-state');
    assert(loaded.state && loaded.state.wx === 123 && loaded.state.wy === -45, '世界状态恢复内容不一致');
    const conflict = await a.request('过期版本写入应被拒', '/api/world-state', {
      method: 'PUT', body: { state: { ...stateBlob, wx: 999 }, baseVersion: loaded.version - 1 }, expect: [409],
    });
    assert(conflict.error?.code === 'world-state-conflict', '旧版本未被 409 保护');
    await a.request('正确版本写入', '/api/world-state', { method: 'PUT', body: { state: { ...stateBlob, wx: 456 }, baseVersion: loaded.version } });
  });

  await step('4 上传并发布公共素材（含媒体元数据）', async () => {
    cleanup.assetId = `${runId}-asset`;
    const form = new FormData();
    const bytes = Uint8Array.from([0, 0, 0, 24, 102, 116, 121, 112, 105, 115, 111, 109, 0, 0, 2, 0, 105, 115, 111, 109, 105, 115, 111, 50]);
    form.set('file', new File([bytes], `${runId}.mp4`, { type: 'video/mp4' }));
    form.set('assetId', cleanup.assetId);
    form.set('title', `${runId} 端到端验证素材`);
    form.set('description', '飞书生产环境端到端验证，测试后撤回。');
    form.set('wx', '120'); form.set('wy', '120'); form.set('zone', 'town');
    form.set('media_duration_sec', '12.5');
    form.set('media_width', '1920');
    form.set('media_height', '1080');
    form.set('media_bitrate_kbps', '1500');
    const published = await a.request('上传并发布', '/api/public/assets/upload', { method: 'POST', form, expect: [201] });
    assert(published.asset.id === cleanup.assetId && published.asset.mediaUrl, '发布响应缺少可播放媒体');
    const media = await repository.getMedia(cleanup.assetId);
    assert(media.media_duration_sec === 12.5 && media.media_width === 1920 && media.media_height === 1080 && media.media_bitrate_kbps === 1500, `媒体元数据落库不一致: ${JSON.stringify({ d: media.media_duration_sec, w: media.media_width, h: media.media_height, b: media.media_bitrate_kbps })}`);
    const assetRow = await repository.getPublicAsset(cleanup.assetId);
    assert(assetRow && assetRow.status === 'published', 'public_assets 未写入发布记录');
  });

  await step('5 跨账户互动（点赞/标签/评论/通知）', async () => {
    const worldB = await b.request('B 读取公共世界', '/api/public/world?limit=200');
    assert(worldB.assets.some((item) => item.id === cleanup.assetId), 'B 看不到 A 发布的素材');
    await b.request('B 点赞', `/api/public/assets/${cleanup.assetId}/reaction`, { method: 'PUT', body: { liked: true } });
    await b.request('B 贴标签', `/api/public/assets/${cleanup.assetId}/tags/端到端标记`, { method: 'PUT', body: { active: true } });
    const comment = await b.request('B 评论', `/api/public/assets/${cleanup.assetId}/comments`, { method: 'POST', body: { text: `${runId} 评论` }, expect: [201] });
    cleanup.commentId = comment.comment.id;
    const notifications = await a.request('A 读取通知', '/api/notifications');
    assert(notifications.notifications.some((item) => item.id === `comment:${cleanup.commentId}`), '评论未进入发布者通知');
  });

  await step('6 需求发布与跨账户回应', async () => {
    cleanup.demandId = `${runId}-demand`;
    await a.request('A 发布需求', '/api/public/demands', {
      method: 'POST', expect: [201],
      body: { id: cleanup.demandId, title: `${runId} 端到端需求`, description: '验证回应与视频关联。', type: 'personal', quantity: 1, budget: 20, wx: 140, wy: 140, zone: 'town' },
    });
    const response = await b.request('B 回应需求', `/api/public/demands/${cleanup.demandId}/responses`, {
      method: 'POST', expect: [201], body: { text: `${runId} 回应`, assetId: cleanup.assetId, assetTitle: `${runId} 素材` },
    });
    cleanup.responseId = response.response.id;
    await b.request('B 关联视频', `/api/public/demands/${cleanup.demandId}/links`, { method: 'PUT', body: { assetId: cleanup.assetId, active: true } });
    const worldA = await a.request('A 刷新读取回应', '/api/public/world?limit=200');
    const demand = worldA.demands.find((item) => item.id === cleanup.demandId);
    assert(demand?.responses?.some((item) => item.id === cleanup.responseId), '回应跨账号不可见');
  });

  await step('7 举报与管理员审核（含隐藏与恢复）', async () => {
    await b.request('B 举报素材', '/api/public/reports', { method: 'POST', expect: [201], body: { targetType: 'asset', targetId: cleanup.assetId, reason: '端到端验证举报' } });
    const reports = await admin.request('管理员读取举报队列', '/api/admin/reports');
    const report = reports.reports.find((item) => item.targetId === cleanup.assetId && item.status === 'open');
    assert(report, '举报未进入管理队列');
    cleanup.reportId = report.id;
    await admin.request('管理员驳回举报', `/api/admin/reports/${encodeURIComponent(report.id)}`, { method: 'PATCH', body: { status: 'dismissed' } });
    await admin.request('管理员隐藏素材', `/api/admin/moderation/asset/${cleanup.assetId}`, { method: 'PUT', body: { hidden: true } });
    const worldHidden = await b.request('隐藏后 B 读取世界', '/api/public/world?limit=200');
    assert(!worldHidden.assets.some((item) => item.id === cleanup.assetId), '隐藏后素材仍在公共世界可见');
    await admin.request('管理员恢复素材', `/api/admin/moderation/asset/${cleanup.assetId}`, { method: 'PUT', body: { hidden: false } });
    const worldRestored = await b.request('恢复后 B 读取世界', '/api/public/world?limit=200');
    assert(worldRestored.assets.some((item) => item.id === cleanup.assetId), '恢复后素材不可见');
  });

  await step('8 报价成交与重复购买拦截（base_price_versions 落表）', async () => {
    const bid = await b.request('B 报价', `/api/pricing/materials/${cleanup.assetId}/bids`, {
      method: 'POST', expect: [201], body: { bid_price: 20, idempotency_key: `${runId}-bid-0001` },
    });
    cleanup.transactionId = bid.transaction.transaction_id;
    assert(bid.bid.bid_status === 'accepted' && bid.transaction.is_valid === true, '报价未形成有效成交');
    await b.request('重复购买拦截', `/api/pricing/materials/${cleanup.assetId}/bids`, {
      method: 'POST', body: { bid_price: 21, idempotency_key: `${runId}-bid-0002` }, expect: [409],
    });
    const versions = await repository.listBasePriceVersions(cleanup.assetId);
    assert(versions.some((item) => item.transaction_id === cleanup.transactionId), '成交未写入 base_price_versions');
    const history = await b.request('素材基础价历史', `/api/pricing/materials/${cleanup.assetId}`);
    assert(Array.isArray(history.base_price_history) && history.base_price_history.length >= 1, '接口未返回 base_price_history');
  });

  await step('9 事件批量落表（推荐三表 + bid 投影）与幂等去重', async () => {
    const requestId = `${runId}-rec`;
    const events = [
      event(`${runId}-rec`, 'recommendation_request', {
        request_id: requestId, zone_slots: 3,
        candidates: [
          { asset_id: cleanup.assetId, rank: 1, recommendation_score: 2.1, zone_id: 'town', spawn_source: '端到端验证', chosen: true },
          { asset_id: 'v-tide-pause', rank: 2, recommendation_score: 1.8, zone_id: 'shore', spawn_source: '世界推荐', chosen: false },
          { asset_id: 'v-window-cat', rank: 3, recommendation_score: 1.2, zone_id: 'town', spawn_source: '低曝光补偿', chosen: false },
        ],
      }),
      event(`${runId}-imp`, 'impression_batch', {
        impression_batch_id: `${runId}-batch`, recommendation_request_id: requestId,
        impressions: [
          { impression_id: `${runId}-imp-1`, impression_batch_id: `${runId}-batch`, recommendation_request_id: requestId, asset_id: cleanup.assetId, zone_id: 'town', spawn_source: '端到端验证', rank: 1, recommendation_score: 2.1, visibility_duration_ms: 4000, distance_to_player: 120, experiment_id: 'open-world-v1', experiment_group: 'mixed-biome' },
          { impression_id: `${runId}-imp-2`, impression_batch_id: `${runId}-batch`, recommendation_request_id: requestId, asset_id: 'v-window-cat', zone_id: 'town', spawn_source: '低曝光补偿', rank: 2, recommendation_score: 1.2, visibility_duration_ms: 1500, distance_to_player: 300, experiment_id: 'open-world-v1', experiment_group: 'mixed-biome' },
        ],
      }),
      event(`${runId}-ba`, 'bid_attempt', { asset_id: cleanup.assetId }),
      event(`${runId}-bx`, 'bid_abandon', { asset_id: cleanup.assetId, open_duration_ms: 8200 }),
      event(`${runId}-bf`, 'bid_validation_failed', { asset_id: cleanup.assetId, reason: 'invalid-price-format' }),
    ];
    const first = await a.request('投递事件批次', '/api/events/batch', { method: 'POST', body: { events } });
    assert(first.accepted.length === events.length && first.rejected === 0, `事件未被全部接受: ${JSON.stringify(first).slice(0, 200)}`);
    const second = await a.request('重复投递同批事件', '/api/events/batch', { method: 'POST', body: { events } });
    assert(second.accepted.length === 0 && second.acknowledged.length === events.length, 'event_id 去重未生效');
    await new Promise((resolve) => setTimeout(resolve, 2000));
    const requests = await repository.listRecommendationRequests();
    const candidates = await repository.listRecommendationCandidates();
    const impressions = await repository.listRecommendationImpressions();
    const attempts = await repository.listBidAttempts();
    assert(requests.some((item) => item.request_id === requestId), 'research_recommendation_requests 缺少本次请求');
    assert(candidates.filter((item) => item.request_id === requestId).length === 3, 'research_recommendation_candidates 未拆成 3 行');
    assert(impressions.filter((item) => item.recommendation_request_id === requestId).length === 2, 'research_recommendation_impressions 未拆成 2 行');
    for (const kind of ['bid_attempt', 'bid_abandon', 'bid_validation_failed']) {
      assert(attempts.some((item) => item.attempt_kind === kind && item.asset_id === cleanup.assetId), `research_bid_attempts 缺少 ${kind}`);
    }
  });

  await step('10 管理员研究导出与健康告警', async () => {
    const health = await admin.request('研究健康', '/api/admin/research/health');
    assert(health.summary.recommendation_request_count >= 1 && health.summary.recommendation_impression_count >= 2, 'health 推荐计数缺失');
    assert(health.summary.bid_attempt_count >= 1, 'health bid 计数缺失');
    assert(health.issues.stale_events_alert === false, '最新事件竟触发了过期告警');
    const csv = await admin.request('推荐事实表 CSV', '/api/admin/research/recommendations.csv');
    assert(String(csv).includes(`${runId}-rec`) && String(csv).includes(cleanup.assetId), 'recommendations.csv 缺少本次验证数据');
    const snapshot = await admin.request('研究快照', '/api/admin/research/snapshot');
    assert(/^[0-9a-f]{16}$/.test(snapshot.hash || ''), 'snapshot hash 格式不符');
    assert(snapshot.counts.recommendation_impressions >= 2 && snapshot.pricing.base_price_versions.length >= 1, 'snapshot 内容不完整');
    const pricingCsv = await admin.request('定价 CSV', '/api/admin/pricing/export.csv');
    assert(String(pricingCsv).includes('base_price_version'), '定价 CSV 缺少新列');
  });

  await step('11 登出与重新登录（Session 生命周期）', async () => {
    await a.request('A 登出', '/api/auth/logout', { method: 'POST' });
    await a.request('登出后世界状态应 401', '/api/world-state', { method: 'GET', expect: [401] });
    await a.request('A 重新登录', '/api/auth/login', { method: 'POST', body: { identity: identityA, password: 'correct-horse-2026' } });
    await a.request('登录后世界状态恢复', '/api/world-state');
  });
} catch (error) {
  failure = error;
} finally {
  cleanupResults = await bestEffortCleanup();
  if (server) await new Promise((resolve) => server.close(resolve));
  const sorted = [...timings].sort((left, right) => right.elapsed_ms - left.elapsed_ms);
  console.log(JSON.stringify({
    ok: !failure,
    run_id: runId,
    repository: config.repository,
    steps: stepResults,
    failure: failure?.stack || null,
    notes,
    timings,
    slowest: sorted.slice(0, 10),
    cleanup: cleanupResults,
  }, null, 2));
  if (failure || cleanupResults.some((item) => !item.ok)) process.exitCode = 1;
}
