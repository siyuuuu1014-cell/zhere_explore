import { performance } from 'node:perf_hooks';
import { config } from '../server/config.mjs';
import { createRepository } from '../server/repositories/index.mjs';

const baseUrl = process.env.ZHERE_LIVE_TEST_URL || `http://127.0.0.1:${config.port}`;
const runId = `qa-e2e-${Date.now()}`;
const timings = [];
const cleanup = { a: null, b: null, assetId: null, demandId: null, commentId: null, responseId: null, transactionId: null };

class Client {
  constructor(name) {
    this.name = name;
    this.cookie = '';
  }

  async request(label, path, { method = 'GET', body, form, expect = [200] } = {}) {
    const headers = {};
    if (this.cookie) headers.cookie = this.cookie;
    if (body !== undefined) headers['content-type'] = 'application/json';
    const started = performance.now();
    const response = await fetch(`${baseUrl}${path}`, {
      method,
      headers,
      body: form || (body === undefined ? undefined : JSON.stringify(body)),
    });
    const elapsedMs = Math.round(performance.now() - started);
    const setCookie = response.headers.get('set-cookie');
    if (setCookie) this.cookie = setCookie.split(';', 1)[0];
    const contentType = response.headers.get('content-type') || '';
    const payload = contentType.includes('application/json') ? await response.json() : await response.text();
    const passed = expect.includes(response.status);
    timings.push({ label, account: this.name, status: response.status, elapsed_ms: elapsedMs, passed });
    if (!passed) throw new Error(`${label}: expected ${expect.join('/')}, got ${response.status}: ${JSON.stringify(payload)}`);
    return payload;
  }
}

const a = new Client('A');
const b = new Client('B');
const anonymous = new Client('anonymous');

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function invalidateQaTransaction() {
  if (!cleanup.transactionId) return;
  const repository = await createRepository(config);
  await repository.setTransactionValidity(cleanup.transactionId, false, config.basePriceTransactionCount);
}

async function bestEffortCleanup() {
  const cleanupResults = [];
  const attempt = async (label, fn) => {
    try {
      await fn();
      cleanupResults.push({ label, ok: true });
  } catch (error) {
    cleanupResults.push({ label, ok: false, error: error.message });
    }
  };
  if (cleanup.responseId && cleanup.demandId) await attempt('delete-response', () => b.request('清理需求回应', `/api/public/demands/${cleanup.demandId}/responses/${cleanup.responseId}`, { method: 'DELETE' }));
  if (cleanup.commentId && cleanup.assetId) await attempt('delete-comment', () => b.request('清理评论', `/api/public/assets/${cleanup.assetId}/comments/${cleanup.commentId}`, { method: 'DELETE' }));
  if (cleanup.demandId) await attempt('delete-demand', () => a.request('清理需求', `/api/public/demands/${cleanup.demandId}`, { method: 'DELETE' }));
  if (cleanup.assetId) await attempt('delete-public-asset', () => a.request('清理公共素材', `/api/public/assets/${cleanup.assetId}`, { method: 'DELETE' }));
  // Direct repository cleanup may be blocked in a restricted shell. The run ID is
  // deliberately stable and can be invalidated later with pricing:data:repair.
  if (cleanup.transactionId) await attempt('invalidate-transaction', invalidateQaTransaction);
  return cleanupResults;
}

let failure = null;
let cleanupResults = [];
try {
  await anonymous.request('健康检查-冷读', '/api/health');
  await anonymous.request('健康检查-热读1', '/api/health');
  await anonymous.request('健康检查-热读2', '/api/health');

  const [guestA, guestB] = await Promise.all([
    a.request('创建测试账号A', '/api/auth/guest', { method: 'POST', expect: [201] }),
    b.request('创建测试账号B', '/api/auth/guest', { method: 'POST', expect: [201] }),
  ]);
  cleanup.a = guestA.user.id;
  cleanup.b = guestB.user.id;

  await a.request('更新账号A资料', '/api/profile', { method: 'PUT', body: { nickname: `${runId}-A`, spaceName: `${runId}-home` } });
  await b.request('更新账号B资料', '/api/profile', { method: 'PUT', body: { nickname: `${runId}-B`, spaceName: `${runId}-home` } });

  cleanup.assetId = `${runId}-asset`;
  const form = new FormData();
  const bytes = Uint8Array.from([0, 0, 0, 24, 102, 116, 121, 112, 105, 115, 111, 109, 0, 0, 2, 0, 105, 115, 111, 109, 105, 115, 111, 50]);
  form.set('file', new File([bytes], `${runId}.mp4`, { type: 'video/mp4' }));
  form.set('assetId', cleanup.assetId);
  form.set('title', `${runId} 测试视频`);
  form.set('description', '自动化交互回归测试，测试后撤回。');
  form.set('wx', '120');
  form.set('wy', '120');
  form.set('zone', 'town');
  const combinedPublish = await a.request('上传并发布公共素材', '/api/public/assets/upload', { method: 'POST', form, expect: [201] });
  assert(combinedPublish.asset.id === cleanup.assetId && combinedPublish.asset.mediaUrl, '上传并发布没有返回可播放的公共素材。');

  const worldB = await b.request('账号B首次读取公共世界', '/api/public/world?limit=200');
  assert(worldB.assets.some((item) => item.id === cleanup.assetId), '跨账号读取失败：账号B看不到账号A发布的素材。');

  const reaction = await b.request('账号B点赞素材', `/api/public/assets/${cleanup.assetId}/reaction`, { method: 'PUT', body: { liked: true } });
  assert(reaction.asset.liked === true && reaction.asset.likes >= 1, '点赞结果没有立即返回正确状态。');
  const tag = await b.request('账号B添加标签', `/api/public/assets/${cleanup.assetId}/tags/测试标记`, { method: 'PUT', body: { active: true } });
  assert(tag.asset.tags.includes('测试标记'), '标签结果没有立即返回。');

  const comment = await b.request('账号B发表评论', `/api/public/assets/${cleanup.assetId}/comments`, {
    method: 'POST', body: { text: `${runId} 评论` }, expect: [201],
  });
  cleanup.commentId = comment.comment.id;
  const editedComment = await b.request('账号B编辑评论', `/api/public/assets/${cleanup.assetId}/comments/${cleanup.commentId}`, {
    method: 'PATCH', body: { text: `${runId} 评论-已编辑` },
  });
  assert(editedComment.comment.text.endsWith('已编辑'), '评论编辑结果不正确。');

  const ownerWorldAfterComment = await a.request('账号A刷新并读取评论', '/api/public/world?limit=200');
  const ownerAsset = ownerWorldAfterComment.assets.find((item) => item.id === cleanup.assetId);
  assert(ownerAsset?.comments?.some((item) => item.id === cleanup.commentId && item.text.endsWith('已编辑')), '评论跨账号刷新后不可见。');
  const ownerNotifications = await a.request('账号A读取互动通知', '/api/notifications');
  assert(ownerNotifications.notifications.some((item) => item.id === `comment:${cleanup.commentId}` && item.targetId === cleanup.assetId), '素材互动没有出现在发布者通知中。');

  cleanup.demandId = `${runId}-demand`;
  const demand = await a.request('账号A发布需求', '/api/public/demands', {
    method: 'POST',
    body: { id: cleanup.demandId, title: `${runId} 测试需求`, description: '验证跨用户回应与视频关联。', type: 'personal', quantity: 1, budget: 20, wx: 140, wy: 140, zone: 'town' },
    expect: [201],
  });
  assert(demand.demand.id === cleanup.demandId, '需求发布返回不正确。');
  const response = await b.request('账号B回应需求并附视频', `/api/public/demands/${cleanup.demandId}/responses`, {
    method: 'POST',
    body: { text: `${runId} 回应`, assetId: cleanup.assetId, assetTitle: `${runId} 测试素材` },
    expect: [201],
  });
  cleanup.responseId = response.response.id;
  const editedResponse = await b.request('账号B编辑需求回应', `/api/public/demands/${cleanup.demandId}/responses/${cleanup.responseId}`, {
    method: 'PATCH', body: { text: `${runId} 回应-已编辑` },
  });
  assert(editedResponse.response.text.endsWith('已编辑'), '需求回应编辑结果不正确。');
  const linkedDemand = await b.request('账号B关联视频到需求', `/api/public/demands/${cleanup.demandId}/links`, {
    method: 'PUT', body: { assetId: cleanup.assetId, active: true },
  });
  assert(linkedDemand.demand.assetLinks.includes(cleanup.assetId), '需求与视频关联失败。');
  const ownerWorldAfterResponse = await a.request('账号A刷新并读取需求回应', '/api/public/world?limit=200');
  const ownerDemand = ownerWorldAfterResponse.demands.find((item) => item.id === cleanup.demandId);
  assert(ownerDemand?.responses?.some((item) => item.id === cleanup.responseId), '需求回应跨账号刷新后不可见。');

  const bid = await b.request('账号B报价并购入素材', `/api/pricing/materials/${cleanup.assetId}/bids`, {
    method: 'POST', body: { bid_price: 20, idempotency_key: `${runId}-bid-0001` }, expect: [201],
  });
  cleanup.transactionId = bid.transaction.transaction_id;
  assert(bid.bid.bid_status === 'accepted' && bid.transaction.is_valid === true, '报价没有形成有效成交。');
  const purchases = await b.request('账号B读取背包购买记录', '/api/pricing/purchases');
  assert(purchases.purchases.some((item) => item.transaction_id === cleanup.transactionId), '成交后没有进入购买记录。');
  await b.request('账号B重复购买拦截', `/api/pricing/materials/${cleanup.assetId}/bids`, {
    method: 'POST', body: { bid_price: 21, idempotency_key: `${runId}-bid-0002` }, expect: [409],
  });

  const deltaWorld = await b.request('账号B增量同步公共世界', `/api/public/world?since=${encodeURIComponent(worldB.refreshedAt)}&limit=200`);
  assert(deltaWorld.mode === 'delta', '公共世界增量同步没有进入 delta 模式。');
} catch (error) {
  failure = error;
} finally {
  cleanupResults = await bestEffortCleanup();
  const sorted = [...timings].sort((left, right) => right.elapsed_ms - left.elapsed_ms);
  console.log(JSON.stringify({
    ok: !failure,
    run_id: runId,
    base_url: baseUrl,
    repository: config.repository,
    failure: failure?.stack || null,
    timings,
    slowest: sorted.slice(0, 10),
    cleanup: cleanupResults,
  }, null, 2));
  if (failure || cleanupResults.some((item) => !item.ok)) process.exitCode = 1;
}
