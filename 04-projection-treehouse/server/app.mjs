import fs from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { config as defaultConfig } from './config.mjs';
import { normalizeBidPrice } from './pricing.mjs';
import { EVENT_TYPES, deriveSignals, validateTelemetryEvent } from './event-schema.mjs';
import {
  createSessionToken,
  hashPassword,
  hashToken,
  normalizeIdentity,
  parseCookies,
  publicUser,
  sessionCookie,
  verifyPassword,
} from './security.mjs';

const APP_PREFIX = '/04-projection-treehouse/';
const ESSENTIAL_EVENTS = new Set(['register', 'login', 'logout', 'research_consent_change', 'deletion_request', 'data_export', 'feedback']);
const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.mp4': 'video/mp4', '.webm': 'video/webm',
};

function json(response, status, payload, headers = {}) {
  const body = Buffer.from(JSON.stringify(payload));
  response.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'content-length': body.length, ...headers });
  response.end(body);
}

function apiError(response, status, code, message) {
  json(response, status, { ok: false, error: { code, message } });
}

function csv(response, fileName, rows) {
  const escape = (value) => `"${String(value ?? '').replaceAll('"', '""')}"`;
  const body = Buffer.from(`\uFEFF${rows.map((row) => row.map(escape).join(',')).join('\r\n')}`, 'utf8');
  response.writeHead(200, {
    'content-type': 'text/csv; charset=utf-8',
    'content-disposition': `attachment; filename="${fileName}"`,
    'content-length': body.length,
  });
  response.end(body);
}

async function readJson(request, maxBytes) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > maxBytes) throw Object.assign(new Error('payload-too-large'), { status: 413 });
    chunks.push(chunk);
  }
  if (!chunks.length) return {};
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); }
  catch { throw Object.assign(new Error('invalid-json'), { status: 400 }); }
}

async function readBytes(request, maxBytes) {
  const declaredSize = Number(request.headers['content-length'] || 0);
  if (Number.isFinite(declaredSize) && declaredSize > maxBytes) {
    throw Object.assign(new Error('payload-too-large'), { status: 413 });
  }
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > maxBytes) throw Object.assign(new Error('payload-too-large'), { status: 413 });
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

function validateIdentity(identity) {
  return /^1[3-9]\d{9}$/.test(identity) || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(identity);
}

function internalUsername(identity) {
  return `user-${createHash('sha256').update(identity).digest('hex').slice(0, 12)}`;
}

function cleanText(value, max = 200) {
  return String(value || '').trim().slice(0, max);
}

function cleanCoordinate(value) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(-1000000, Math.min(1000000, number)) : 0;
}

async function readVideoMultipart(request, config) {
  const requestUrl = new URL(request.url || '/', `http://${request.headers.host || 'localhost'}`);
  const multipartBytes = await readBytes(request, config.maxVideoBytes + 1024 * 1024);
  const webRequest = new Request(requestUrl, { method: 'POST', headers: request.headers, body: multipartBytes });
  const form = await webRequest.formData();
  const file = form.get('file');
  if (!(file instanceof File) || !file.type.startsWith('video/')) {
    throw Object.assign(new Error('invalid-media'), { status: 400, publicMessage: '请选择有效视频文件。' });
  }
  if (file.size > config.maxVideoBytes) {
    throw Object.assign(new Error('media-too-large'), { status: 413, publicMessage: `视频不能超过 ${Math.floor(config.maxVideoBytes / 1024 / 1024)}MB。` });
  }
  const assetId = cleanText(form.get('assetId') || `u-${randomUUID()}`, 80).replace(/[^a-zA-Z0-9_-]/g, '');
  if (!/^[a-z0-9_-]{2,80}$/i.test(assetId)) {
    throw Object.assign(new Error('invalid-asset-id'), { status: 400, publicMessage: '素材 ID 无效。' });
  }
  return {
    form, file, assetId,
    mediaInput: {
      assetId,
      title: cleanText(form.get('title') || file.name, 80),
      description: cleanText(form.get('description'), 500),
      fileName: cleanText(file.name, 180),
      mime: file.type,
      bytes: Buffer.from(await file.arrayBuffer()),
    },
  };
}

function publicAssetRecord(user, body, media, existing = null) {
  const now = new Date().toISOString();
  return {
    id: cleanText(body.id, 80),
    ownerId: user.id,
    ownerName: user.nickname || '匿名旅人',
    title: cleanText(body.title, 80) || '未命名素材',
    description: cleanText(body.description, 500),
    fileName: cleanText(media?.fileName, 180),
    mime: media?.mime || cleanText(body.mime, 80),
    hasMedia: Boolean(media),
    status: 'published',
    source: 'user',
    spawn_source: '玩家发布',
    wx: cleanCoordinate(body.wx), wy: cleanCoordinate(body.wy), zone: cleanText(body.zone, 40),
    likes: Number(existing?.likes || 0), likedBy: existing?.likedBy || [], comments: existing?.comments || [], tagRecords: existing?.tagRecords || [], tags: existing?.tags || [],
    dur: '—', res: media ? '已上传' : '示例', license: '个人', price: 0,
    exposureRoll: Number(existing?.exposureRoll || Math.random()),
    createdAt: existing?.createdAt || now, updatedAt: now,
  };
}

function contentFreshness(record) {
  if (record.archived) return { archived: true, freshness: 'archived', freshnessLabel: '已归档' };
  const ageDays = Math.max(0, (Date.now() - (Date.parse(record.createdAt || record.updatedAt || 0) || Date.now())) / 86400000);
  if (ageDays <= 7) return { archived: false, freshness: 'new', freshnessLabel: '新落地' };
  if (ageDays <= 30) return { archived: false, freshness: 'settled', freshnessLabel: '已安放' };
  return { archived: false, freshness: 'old', freshnessLabel: '旧内容' };
}

function publicAssetView(asset, viewerId) {
  const { ownerId, comments = [], likedBy = [], tagRecords = [], _recordId, ...publicAsset } = asset;
  return {
    ...publicAsset,
    ...contentFreshness(asset),
    owner: ownerId === viewerId ? 'me' : 'other',
    liked: likedBy.includes(viewerId),
    likes: likedBy.length || Number(asset.likes || 0),
    tags: tagRecords.length ? tagRecords.map((record) => record.tag) : (asset.tags || []),
    comments: comments.filter((comment) => comment.moderationStatus !== 'hidden' && comment.status !== 'deleted').map(({ ownerId: commentOwnerId, ...comment }) => ({ ...comment, owner: commentOwnerId === viewerId ? 'me' : 'other' })),
    mediaUrl: asset.hasMedia ? `/api/media/${encodeURIComponent(asset.id)}` : '',
  };
}

function publicDemandView(demand, viewerId) {
  const { ownerId, responses = [], ...publicDemand } = demand;
  return {
    ...publicDemand,
    ...contentFreshness(demand),
    owner: ownerId === viewerId ? 'me' : 'other',
    responses: responses.filter((response) => response.status !== 'deleted' && response.moderationStatus !== 'hidden').map(({ ownerId: responseOwnerId, ...response }) => ({ ...response, owner: responseOwnerId === viewerId ? 'me' : 'other' })),
  };
}

async function pricingInsight(repository, viewerId, materialId, minimumSample) {
  const pricing = await repository.listAllPricing();
  const valid = (pricing.transactions || [])
    .filter((transaction) => transaction.material_id === materialId && transaction.is_valid === true)
    .sort((a, b) => String(a.transaction_time).localeCompare(String(b.transaction_time)));
  const personal = valid.find((transaction) => transaction.user_id === viewerId);
  if (!personal) return { eligible: false, sample_count: null, minimum_sample: minimumSample, cohort: null, personal: null };
  const prices = valid.map((transaction) => Number(transaction.transaction_price)).filter(Number.isFinite).sort((a, b) => a - b);
  const canReveal = prices.length >= minimumSample;
  const middle = Math.floor(prices.length / 2);
  const median = prices.length % 2 ? prices[middle] : (prices[middle - 1] + prices[middle]) / 2;
  return {
    eligible: true,
    sample_count: prices.length,
    minimum_sample: minimumSample,
    personal: { bid_price: personal.bid_price, transaction_price: personal.transaction_price, transaction_time: personal.transaction_time },
    cohort: canReveal ? {
      minimum: prices[0], maximum: prices[prices.length - 1],
      mean: Number((prices.reduce((sum, price) => sum + price, 0) / prices.length).toFixed(2)),
      median: Number(median.toFixed(2)),
    } : null,
  };
}

function publicRecordView(record, viewerId) {
  const { ownerId, ...publicRecord } = record;
  return { ...publicRecord, owner: ownerId === viewerId ? 'me' : 'other' };
}

async function notificationFeed(repository, viewerId) {
  const [assets, demands, records] = await Promise.all([
    repository.listPublicAssetsByOwner(viewerId, { includeDeleted: true }),
    repository.listPublicDemandsByOwner(viewerId, { includeDeleted: true }),
    repository.listPublicRecordsByOwner(viewerId, { includeDeleted: true }),
  ]);
  const transactions = await repository.listValidTransactionsForMaterials(assets.map((asset) => asset.id));
  const notices = [];
  const push = (notice) => notices.push({ read: false, ...notice });
  assets.filter((asset) => asset.ownerId === viewerId).forEach((asset) => {
    (asset.comments || []).filter((item) => item.ownerId !== viewerId && item.status !== 'deleted').forEach((item) => push({
      id: `comment:${item.id}`, kind: item.parentId ? 'comment_reply' : 'asset_comment', title: item.parentId ? '有人回复了素材留言' : '素材收到了新留言',
      summary: `${item.ownerName || item.name || '一位旅人'}在《${asset.title}》旁留下了回应`, targetType: 'asset', targetId: asset.id, createdAt: item.createdAt,
    }));
  });
  demands.filter((demand) => demand.ownerId === viewerId).forEach((demand) => {
    (demand.responses || []).filter((item) => item.ownerId !== viewerId && item.status !== 'deleted').forEach((item) => push({
      id: `response:${item.id}`, kind: 'demand_response', title: '需求收到了新回应', summary: `${item.ownerName || item.name || '一位旅人'}回应了「${demand.title}」`, targetType: 'demand', targetId: demand.id, createdAt: item.createdAt,
    }));
    (demand.assetLinkRecords || []).filter((item) => item.ownerId !== viewerId).forEach((item) => push({
      id: `link:${demand.id}:${item.assetId}`, kind: 'demand_link', title: '需求关联了一段素材', summary: `「${demand.title}」出现了新的素材关系`, targetType: 'demand', targetId: demand.id, createdAt: item.createdAt,
    }));
  });
  const assetById = new Map(assets.map((asset) => [asset.id, asset]));
  transactions.filter((transaction) => assetById.has(transaction.material_id) && transaction.user_id !== viewerId).forEach((transaction) => push({
    id: `bid:${transaction.transaction_id}`, kind: 'asset_bid', title: '素材收到了一次模拟报价', summary: `《${assetById.get(transaction.material_id)?.title || '一段素材'}》形成了一笔有效模拟成交`, targetType: 'asset', targetId: transaction.material_id, createdAt: transaction.transaction_time,
  }));
  records.filter((record) => record.ownerId === viewerId && record.kind === 'swap_offer' && record.status === 'deleted' && record.claimedBy).forEach((record) => push({
    id: `swap:${record.id}:${record.claimedAt || record.updatedAt}`, kind: 'swap_claim', title: '交换箱有了回声', summary: '另一位旅人带走了你的副本，并留下了新的东西', targetType: 'record', targetId: record.replacementId || record.id, createdAt: record.claimedAt || record.updatedAt,
  }));
  return notices.filter((notice) => notice.createdAt).sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt))).slice(0, 100);
}

function commonHeaders(config) {
  return {
    'x-content-type-options': 'nosniff',
    'referrer-policy': 'same-origin',
    'permissions-policy': 'camera=(), microphone=(), geolocation=()',
    'content-security-policy': "default-src 'self'; img-src 'self' data: blob:; media-src 'self' blob:; style-src 'self'; script-src 'self'; connect-src 'self'; base-uri 'self'; frame-ancestors 'none'",
    ...(config.isProduction ? { 'strict-transport-security': 'max-age=31536000; includeSubDomains' } : {}),
  };
}

export function createApp({ repository, config = defaultConfig }) {
  const headers = commonHeaders(config);
  const rateBuckets = new Map();
  const sessionCache = new Map();
  let publicWorldCache = null;
  const sessionCacheTtlMs = 30_000;
  const publicWorldCacheTtlMs = Math.max(0, Number(config.publicWorldCacheTtlMs) || 0);
  const slowRequestThresholdMs = Math.max(0, Number(config.slowRequestThresholdMs) || 0);
  const sessionCleanupIntervalMs = Math.max(60_000, Number(config.sessionCleanupIntervalMs) || 15 * 60 * 1000);
  let lastSessionCleanupAt = 0;
  let sessionCleanup = null;
  const marketInsightMinSample = Math.max(3, Number(config.marketInsightMinSample) || 5);

  function invalidatePublicWorldCache() {
    publicWorldCache = null;
  }

  async function readPublicWorldSnapshot() {
    if (publicWorldCache && publicWorldCache.expiresAt > Date.now()) return publicWorldCache.promise;
    const entry = {
      expiresAt: Date.now() + publicWorldCacheTtlMs,
      promise: Promise.all([
        repository.listPublicAssets({ includeDeleted: true }),
        repository.listPublicDemands({ includeDeleted: true }),
        repository.listPublicRecords({ includeDeleted: true }),
      ]).then(([assets, demands, records]) => ({ assets, demands, records })),
    };
    publicWorldCache = entry;
    try {
      return await entry.promise;
    } catch (error) {
      if (publicWorldCache === entry) publicWorldCache = null;
      throw error;
    }
  }

  function exposeUser(user) {
    const result = publicUser(user);
    return result ? { ...result, admin: config.adminIdentities?.includes(String(user.identity || '').toLowerCase()) || false } : null;
  }

  function isAdmin(user) {
    return Boolean(user && config.adminIdentities?.includes(String(user.identity || '').toLowerCase()));
  }

  async function ensureResearchIdentity(user, { skipLookup = false } = {}) {
    const subjectId = user.researchSubjectId || (skipLookup ? `rs-${randomUUID()}` : '');
    const subject = await repository.ensureResearchSubject(user.id, { createdAt: user.createdAt || new Date().toISOString(), subjectId, skipLookup });
    if (!user.researchSubjectId || user.researchSubjectId !== subject.subject_id) {
      user.researchSubjectId = subject.subject_id;
      user.updatedAt = new Date().toISOString();
      await repository.updateUser(user);
    }
    return subject;
  }

  async function recordConsent(user, researchAllowed, reason, { subject = null, skipLookup = false } = {}) {
    const researchSubject = subject || await ensureResearchIdentity(user, { skipLookup });
    const now = new Date().toISOString();
    return repository.recordResearchConsent({
      consent_id: `consent-${randomUUID()}`, user_id: user.id, subject_id: researchSubject.subject_id,
      consent_version: config.researchConsentVersion || 'research-v1', research_allowed: Boolean(researchAllowed),
      text_research_allowed: Boolean(researchAllowed), reason, effective_at: now,
    }, { skipLookup });
  }

  async function ensureRegistrationConsent(user) {
    const consents = await repository.listResearchConsents(user.id);
    if (consents.some((consent) => consent.reason === 'registration')) return consents.at(-1);
    return recordConsent(user, user.research, 'registration');
  }

  function allowPublicWrite(userId, scope = 'public', limit = config.publicWriteLimit || 60, windowMs = 60_000) {
    const key = `${userId}:${scope}`;
    const now = Date.now();
    const recent = (rateBuckets.get(key) || []).filter((timestamp) => now - timestamp < windowMs);
    if (recent.length >= limit) { rateBuckets.set(key, recent); return false; }
    recent.push(now); rateBuckets.set(key, recent);
    return true;
  }

  async function publicTargetExists(targetType, targetId) {
    if (targetType === 'asset') return Boolean(await repository.getPublicAsset(targetId));
    if (targetType === 'demand') return Boolean(await repository.getPublicDemand(targetId));
    if (targetType === 'comment') {
      const assets = await repository.listPublicAssets();
      return assets.some((asset) => (asset.comments || []).some((comment) => comment.id === targetId && comment.status !== 'deleted' && comment.moderationStatus !== 'hidden'));
    }
    if (targetType === 'response') {
      const demands = await repository.listPublicDemands();
      return demands.some((demand) => (demand.responses || []).some((item) => item.id === targetId && item.status !== 'deleted' && item.moderationStatus !== 'hidden'));
    }
    if (targetType === 'record') return (await repository.listPublicRecords()).some((record) => record.id === targetId);
    return false;
  }

  async function currentSession(request) {
    const token = parseCookies(request.headers.cookie).zhere_session;
    if (!token) return null;
    const tokenHash = hashToken(token);
    const cached = sessionCache.get(tokenHash);
    if (cached && cached.cachedUntil > Date.now() && Date.parse(cached.record.expiresAt) > Date.now()) return cached;
    if (cached) sessionCache.delete(tokenHash);
    const record = await repository.getSession(tokenHash);
    if (!record || Date.parse(record.expiresAt) <= Date.now()) {
      if (record) {
        if (record.id) await repository.endResearchSession(record.id, record.expiresAt || new Date().toISOString(), 'session-expired').catch(() => {});
        await repository.deleteSession(record.tokenHash);
      }
      return null;
    }
    const user = await repository.getUser(record.userId);
    if (!user) return null;
    const session = { record, user, cachedUntil: Date.now() + sessionCacheTtlMs };
    sessionCache.set(tokenHash, session);
    return session;
  }

  function maybeCleanupExpiredSessions() {
    if (typeof repository.cleanupExpiredSessions !== 'function') return;
    const now = Date.now();
    if (sessionCleanup || now - lastSessionCleanupAt < sessionCleanupIntervalMs) return;
    lastSessionCleanupAt = now;
    sessionCleanup = repository.cleanupExpiredSessions(new Date(now).toISOString())
      .catch((error) => console.warn('Expired session cleanup failed:', error.message))
      .finally(() => { sessionCleanup = null; });
  }

  function secureSessionCookie(request) {
    if (config.sessionCookieSecure === 'true') return true;
    if (config.sessionCookieSecure === 'false') return false;
    if (request.socket?.encrypted) return true;
    return String(request.headers['x-forwarded-proto'] || '').split(',')[0].trim().toLowerCase() === 'https';
  }

  async function issueSession(request, response, user, { subject: suppliedSubject = null } = {}) {
    const subject = suppliedSubject || (user.researchSubjectId
      ? { subject_id: user.researchSubjectId }
      : await ensureResearchIdentity(user));
    const token = createSessionToken();
    const maxAge = config.sessionDays * 86400;
    const session = {
      id: randomUUID(), userId: user.id, tokenHash: hashToken(token),
      createdAt: new Date().toISOString(), expiresAt: new Date(Date.now() + maxAge * 1000).toISOString(),
    };
    const researchSession = {
        session_id: session.id, user_id: user.id, subject_id: subject.subject_id,
        started_at: session.createdAt, consent_version: config.researchConsentVersion || 'research-v1',
        research_allowed: Boolean(user.research), entry_surface: 'web_game', client_version: 'formal-v4', schema_version: '1',
    };
    try {
      await Promise.all([
        repository.createResearchSession(researchSession, { skipLookup: true }),
        repository.createSession(session),
      ]);
    } catch (error) {
      await Promise.allSettled([
        repository.endResearchSession(session.id, new Date().toISOString(), 'session-create-failed'),
        repository.deleteSession(session.tokenHash),
      ]);
      throw error;
    }
    sessionCache.set(session.tokenHash, { record: session, user, cachedUntil: Date.now() + sessionCacheTtlMs });
    response.setHeader('set-cookie', sessionCookie(token, { secure: secureSessionCookie(request), maxAge }));
  }

  async function requireUser(request, response) {
    const session = await currentSession(request);
    if (!session) apiError(response, 401, 'unauthorized', '请先登录。');
    return session?.user || null;
  }

  async function sessionBootstrap(user) {
    const world = await repository.getWorldState(user.id);
    return { state: world?.state || null, version: world?.version || 0 };
  }

  function sameOrigin(request) {
    const origin = request.headers.origin;
    if (!origin) return true;
    try { return new URL(origin).host === request.headers.host; } catch { return false; }
  }

  async function handleApi(request, response, url) {
    maybeCleanupExpiredSessions();
    if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method) && !sameOrigin(request)) return apiError(response, 403, 'bad-origin', '请求来源无效。');
    if (request.method === 'OPTIONS') { response.writeHead(204, headers); return response.end(); }

    if (url.pathname === '/api/health' && request.method === 'GET') {
      try {
        const check = await repository.healthCheck();
        return json(response, 200, { ok: true, repository: config.repository, storage: check.storage, time: new Date().toISOString() });
      } catch (error) {
        return json(response, 503, { ok: false, repository: config.repository, error: { code: 'repository-unavailable', message: error.message } });
      }
    }

    if (url.pathname === '/api/auth/register' && request.method === 'POST') {
      const body = await readJson(request, 64 * 1024);
      const identity = normalizeIdentity(body.identity);
      if (!validateIdentity(identity)) return apiError(response, 400, 'invalid-identity', '请输入有效邮箱或中国大陆 11 位手机号。');
      if (String(body.password || '').length < 8) return apiError(response, 400, 'weak-password', '密码至少需要 8 位。');
      if (body.password !== body.confirmPassword) return apiError(response, 400, 'password-mismatch', '两次密码不一致。');
      if (!body.ageConfirmed || !body.agreeTerms) return apiError(response, 400, 'consent-required', '请确认年龄并同意条款。');
      const existingUser = await repository.findUserByIdentity(identity);
      if (existingUser && (existingUser.registrationStatus !== 'pending' || !verifyPassword(String(body.password || ''), existingUser.passwordHash))) {
        return apiError(response, 409, 'identity-exists', '该邮箱或手机号已经注册。');
      }
      const user = existingUser || {
        id: randomUUID(), identity, username: String(body.username || '').trim().slice(0, 32) || internalUsername(identity),
        nickname: String(body.nickname || '').trim().slice(0, 32), spaceName: String(body.spaceName || '').trim().slice(0, 40),
        research: Boolean(body.research), passwordHash: hashPassword(String(body.password)), guest: false,
        failedLoginCount: 0, frozenUntil: null, registrationStatus: 'pending',
        createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
      };
      if (!/^[A-Za-z0-9_-]{2,32}$/.test(user.username)) return apiError(response, 400, 'profile-invalid', '用户名只能使用 2–32 位字母、数字、下划线或短横线。');
      if (!user.nickname || user.nickname.length > 16) return apiError(response, 400, 'profile-invalid', '昵称需要 1–16 个字符。');
      if (!user.spaceName || user.spaceName.length > 24) return apiError(response, 400, 'profile-invalid', '小屋名称需要 1–24 个字符。');
      if (!existingUser) {
        user.researchSubjectId = `rs-${randomUUID()}`;
        const [, subject] = await Promise.all([
          repository.createUser(user),
          ensureResearchIdentity(user, { skipLookup: true }),
        ]);
        await Promise.all([
          recordConsent(user, user.research, 'registration', { subject, skipLookup: true }),
          issueSession(request, response, user, { subject }),
        ]);
      } else {
        await ensureRegistrationConsent(user);
        await issueSession(request, response, user);
      }
      if (user.registrationStatus !== 'complete') {
        user.registrationStatus = 'complete';
        user.updatedAt = new Date().toISOString();
        await repository.updateUser(user);
      }
      return json(response, existingUser ? 200 : 201, { ok: true, resumed: Boolean(existingUser), user: exposeUser(user), ...await sessionBootstrap(user) });
    }

    if (url.pathname === '/api/auth/login' && request.method === 'POST') {
      const body = await readJson(request, 32 * 1024);
      const identity = normalizeIdentity(body.identity);
      const user = await repository.findUserByIdentity(identity);
      if (!user || user.guest) return apiError(response, 401, 'invalid-credentials', '账户或密码不正确。');
      if (user.frozenUntil && Date.parse(user.frozenUntil) > Date.now()) return apiError(response, 423, 'account-frozen', '登录失败次数过多，请稍后再试。');
      if (!verifyPassword(String(body.password || ''), user.passwordHash)) {
        user.failedLoginCount = Number(user.failedLoginCount || 0) + 1;
        if (user.failedLoginCount >= 5) user.frozenUntil = new Date(Date.now() + 15 * 60 * 1000).toISOString();
        user.updatedAt = new Date().toISOString();
        await repository.updateUser(user);
        return apiError(response, 401, 'invalid-credentials', '账户或密码不正确。');
      }
      if (user.failedLoginCount || user.frozenUntil) {
        user.failedLoginCount = 0; user.frozenUntil = null; user.updatedAt = new Date().toISOString();
        await repository.updateUser(user);
      }
      const [, bootstrap] = await Promise.all([
        issueSession(request, response, user),
        sessionBootstrap(user),
      ]);
      return json(response, 200, { ok: true, user: exposeUser(user), ...bootstrap });
    }

    if (url.pathname === '/api/auth/guest' && request.method === 'POST') {
      const suffix = randomUUID().slice(0, 8);
      const user = {
        id: randomUUID(), identity: `guest-${suffix}@local`, username: `visitor-${suffix}`,
        nickname: '路过的风', spaceName: '礁石小窝', research: false, passwordHash: '', guest: true,
        failedLoginCount: 0, frozenUntil: null, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
      };
      user.researchSubjectId = `rs-${randomUUID()}`;
      const [, subject] = await Promise.all([
        repository.createUser(user),
        ensureResearchIdentity(user, { skipLookup: true }),
      ]);
      await Promise.all([
        recordConsent(user, false, 'guest-registration', { subject, skipLookup: true }),
        issueSession(request, response, user, { subject }),
      ]);
      return json(response, 201, { ok: true, user: exposeUser(user), ...await sessionBootstrap(user) });
    }

    if (url.pathname === '/api/auth/session' && request.method === 'GET') {
      const session = await currentSession(request);
      return json(response, 200, {
        ok: true,
        authenticated: Boolean(session),
        user: exposeUser(session?.user),
        ...(session ? await sessionBootstrap(session.user) : {}),
      });
    }

    if (url.pathname === '/api/profile' && request.method === 'PUT') {
      const user = await requireUser(request, response); if (!user) return;
      const body = await readJson(request, 16 * 1024);
      const nickname = cleanText(body.nickname, 32);
      const spaceName = cleanText(body.spaceName, 40);
      if (!nickname) return apiError(response, 400, 'profile-invalid', '昵称不能为空。');
      user.nickname = nickname;
      if (spaceName) user.spaceName = spaceName;
      user.updatedAt = new Date().toISOString();
      await repository.updateUser(user);
      return json(response, 200, { ok: true, user: exposeUser(user) });
    }

    if (url.pathname === '/api/auth/logout' && request.method === 'POST') {
      const token = parseCookies(request.headers.cookie).zhere_session;
      if (token) {
        const tokenHash = hashToken(token);
        const record = sessionCache.get(tokenHash)?.record || await repository.getSession(tokenHash);
        await Promise.all([
          record?.id ? repository.endResearchSession(record.id, new Date().toISOString(), 'logout') : Promise.resolve(),
          repository.deleteSession(tokenHash),
        ]);
        sessionCache.delete(tokenHash);
      }
      response.setHeader('set-cookie', sessionCookie('', { secure: secureSessionCookie(request), maxAge: 0 }));
      return json(response, 200, { ok: true });
    }

    if (url.pathname === '/api/auth/forgot-password' && request.method === 'POST') {
      const body = await readJson(request, 32 * 1024);
      const identity = normalizeIdentity(body.identity);
      if (!validateIdentity(identity)) return apiError(response, 400, 'invalid-identity', '请输入有效邮箱或中国大陆 11 位手机号。');
      if (allowPublicWrite(identity, 'forgot-password', 3, 60 * 60_000)) {
        await repository.createPasswordReset({
          id: randomUUID(), identity, note: String(body.note || '').slice(0, 500),
          channel: 'manual-admin', createdAt: new Date().toISOString(), status: 'pending',
        });
      }
      return json(response, 202, { ok: true, mode: 'manual-admin', message: '人工重置申请已提交。管理员核验后会发送指引；当前不会自动发送邮件或短信。' });
    }

    if (url.pathname === '/api/privacy/consent' && request.method === 'PUT') {
      const user = await requireUser(request, response); if (!user) return;
      const body = await readJson(request, 16 * 1024);
      user.research = Boolean(body.active);
      user.researchConsentUpdatedAt = new Date().toISOString();
      user.updatedAt = user.researchConsentUpdatedAt;
      await repository.updateUser(user);
      await recordConsent(user, user.research, 'settings-change');
      return json(response, 200, { ok: true, user: exposeUser(user) });
    }

    if (url.pathname === '/api/privacy/research-status' && request.method === 'GET') {
      const user = await requireUser(request, response); if (!user) return;
      const health = await repository.getResearchHealth(user.id);
      const latestEventAgeMs = health.lastEventAt ? Math.max(0, Date.now() - Date.parse(health.lastEventAt)) : null;
      const collecting = Boolean(user.research && health.subjectReady);
      return json(response, 200, {
        ok: true,
        status: collecting ? (health.eventCount > 0 ? 'collecting' : 'ready') : 'paused',
        collecting, consent_version: config.researchConsentVersion || 'research-v1',
        event_count: health.eventCount, last_event_at: health.lastEventAt,
        last_event_age_ms: latestEventAgeMs, consent_record_count: health.consentRecordCount,
      });
    }

    if (url.pathname === '/api/privacy/export' && request.method === 'GET') {
      const user = await requireUser(request, response); if (!user) return;
      const [world, assets, events, publicAssets, publicDemands, publicRecords, pricing, researchSubject, researchConsents] = await Promise.all([
        repository.getWorldState(user.id),
        repository.listMediaByUser(user.id),
        repository.allEvents(user.id),
        repository.listPublicAssets({ includeDeleted: true }),
        repository.listPublicDemands({ includeDeleted: true }),
        repository.listPublicRecords({ includeDeleted: true }),
        repository.listPricingByUser(user.id),
        repository.getResearchSubject(user.id),
        repository.listResearchConsents(user.id),
      ]);
      const ownedPublicAssets = publicAssets.filter((asset) => asset.ownerId === user.id);
      const ownedPublicDemands = publicDemands.filter((demand) => demand.ownerId === user.id);
      const ownedPublicResponses = publicDemands.flatMap((demand) => (demand.responses || []).filter((item) => item.ownerId === user.id));
      const ownedPublicAssetComments = publicAssets.flatMap((asset) => (asset.comments || []).filter((item) => item.ownerId === user.id));
      return json(response, 200, {
        ok: true,
        export: {
          exported_at: new Date().toISOString(),
          profile: exposeUser(user),
          world_state: world?.state || null,
          assets: assets.map(({ storageKey, localPath, ...asset }) => asset),
          public_assets: ownedPublicAssets.map(({ comments, ...asset }) => asset),
          public_asset_comments: ownedPublicAssetComments,
          public_demands: ownedPublicDemands.map(({ responses, ...demand }) => demand),
          public_responses: ownedPublicResponses,
          public_records: publicRecords.filter((record) => record.ownerId === user.id),
          bids: pricing.bids,
          transactions: pricing.transactions,
          base_prices: pricing.basePrices,
          research_subject: researchSubject ? { subject_id: researchSubject.subject_id, source_system: researchSubject.source_system, status: researchSubject.status, created_at: researchSubject.created_at } : null,
          research_consents: researchConsents.map(({ user_id, ...consent }) => consent),
          raw_events: events,
        },
      });
    }

    if (url.pathname === '/api/privacy/anonymize' && request.method === 'POST') {
      const session = await currentSession(request);
      if (!session) return apiError(response, 401, 'unauthorized', '请先登录。');
      const body = await readJson(request, 16 * 1024);
      if (body.confirm !== true) return apiError(response, 400, 'confirmation-required', '请确认匿名化范围。');
      const { user } = session;
      const anonymousName = `anonymous-${user.id.slice(0, 8)}`;
      const world = await repository.getWorldState(user.id);
      if (world?.state) {
        const nextState = structuredClone(world.state);
        nextState.research = false;
        nextState.anonymized = true;
        nextState.profile = { ...nextState.profile, nickname: '匿名旅人', username: anonymousName };
        await repository.saveWorldState(user.id, nextState);
      }
      const anonymized = await repository.anonymizeUserData(user.id);
      const anonymousId = anonymized?.anonymousId || anonymousName;
      user.identity = `${anonymousName}@deleted.local`;
      user.username = anonymousName;
      user.nickname = '匿名旅人';
      user.passwordHash = '';
      user.research = false;
      user.guest = true;
      user.anonymized = true;
      user.anonymizedAt = new Date().toISOString();
      user.researchSubjectId = null;
      user.anonymousDataId = anonymousId;
      user.updatedAt = user.anonymizedAt;
      await repository.updateUser(user);
      await repository.deleteSessionsByUser(user.id);
      for (const [tokenHash, cached] of sessionCache) if (cached.user.id === user.id) sessionCache.delete(tokenHash);
      response.setHeader('set-cookie', sessionCookie('', { secure: secureSessionCookie(request), maxAge: 0 }));
      return json(response, 200, { ok: true, anonymized: true });
    }

    if (url.pathname === '/api/public/world' && request.method === 'GET') {
      const user = await requireUser(request, response); if (!user) return;
      const snapshot = await readPublicWorldSnapshot();
      let allAssets = snapshot.assets;
      let allDemands = snapshot.demands;
      let allRecords = snapshot.records;
      if (!allRecords.some((record) => record.kind === 'swap_offer' && record.status === 'published')) {
        const now = new Date().toISOString();
        const created = await repository.savePublicRecord({
          id: 'swap-npc-welcome', kind: 'swap_offer', ownerId: 'npc-muqiu', ownerName: '木秋（NPC）', name: '木秋（NPC）',
          status: 'published', moderationStatus: 'visible',
          payload: { assetId: 'v-old-radio', note: '换一个你觉得适合雨夜的东西。', by: '木秋（NPC）', npc: true },
          createdAt: now, updatedAt: now,
        });
        if (created) {
          allRecords = [...allRecords, created];
          invalidatePublicWorldCache();
        }
      }
      const snapshotAt = new Date().toISOString();
      const since = Number.isNaN(Date.parse(url.searchParams.get('since') || '')) ? null : Date.parse(url.searchParams.get('since'));
      const cursor = Math.max(0, Number(url.searchParams.get('cursor')) || 0);
      const limit = Math.max(10, Math.min(200, Number(url.searchParams.get('limit')) || 100));
      const changed = (item) => !since || Date.parse(item.updatedAt || item.createdAt || 0) > since;
      const assets = allAssets.filter(changed);
      const demands = allDemands.filter((demand) => changed(demand) || (demand.responses || []).some(changed));
      const records = allRecords.filter(changed);
      const pageAssets = assets.slice(cursor, cursor + limit);
      const pageDemands = demands.slice(cursor, cursor + limit);
      const pageRecords = records.slice(cursor, cursor + limit);
      const hasMore = Math.max(assets.length, demands.length, records.length) > cursor + limit;
      return json(response, 200, {
        ok: true,
        mode: since ? 'delta' : 'full', cursor, nextCursor: hasMore ? cursor + limit : null,
        assets: pageAssets.filter((asset) => asset.status === 'published' && asset.moderationStatus !== 'hidden').map((asset) => publicAssetView(asset, user.id)),
        demands: pageDemands.filter((demand) => demand.status !== 'deleted' && demand.moderationStatus !== 'hidden').map((demand) => publicDemandView(demand, user.id)),
        records: pageRecords.filter((record) => record.status !== 'deleted' && record.moderationStatus !== 'hidden').map((record) => publicRecordView(record, user.id)),
        deletedAssetIds: pageAssets.filter((asset) => asset.status !== 'published' || asset.moderationStatus === 'hidden').map((asset) => asset.id),
        deletedDemandIds: pageDemands.filter((demand) => demand.status === 'deleted' || demand.moderationStatus === 'hidden').map((demand) => demand.id),
        deletedRecordIds: pageRecords.filter((record) => record.status === 'deleted' || record.moderationStatus === 'hidden').map((record) => record.id),
        refreshedAt: snapshotAt,
      });
    }

    if (url.pathname === '/api/notifications' && request.method === 'GET') {
      const user = await requireUser(request, response); if (!user) return;
      const notifications = await notificationFeed(repository, user.id);
      return json(response, 200, { ok: true, notifications, refreshedAt: new Date().toISOString() });
    }

    const pricingBidMatch = url.pathname.match(/^\/api\/pricing\/materials\/([^/]+)\/bids$/);
    if (pricingBidMatch && request.method === 'POST') {
      const user = await requireUser(request, response); if (!user) return;
      if (!allowPublicWrite(user.id, 'pricing-bid', 30, 60_000)) return apiError(response, 429, 'rate-limited', '报价过于频繁，请稍后再试。');
      const materialId = cleanText(decodeURIComponent(pricingBidMatch[1]), 80);
      if (!/^[a-z0-9_-]{2,80}$/i.test(materialId)) return apiError(response, 400, 'invalid-material-id', '素材 ID 无效。');
      const publicAsset = materialId.startsWith('v-') ? null : await repository.getPublicAsset(materialId);
      if (!materialId.startsWith('v-') && !publicAsset) return apiError(response, 404, 'material-not-found', '素材不存在或已不可见。');
      if (publicAsset?.ownerId === user.id) return apiError(response, 403, 'owner-cannot-bid', '发布者不能为自己发布的素材报价。');
      const body = await readJson(request, 32 * 1024);
      const bidPrice = normalizeBidPrice(body.bid_price);
      if (bidPrice == null) return apiError(response, 400, 'invalid-bid-price', '请输入大于 0、最多保留两位小数的报价。');
      const clientIdempotencyKey = cleanText(body.idempotency_key, 100);
      if (!/^[a-z0-9_.:-]{8,100}$/i.test(clientIdempotencyKey)) return apiError(response, 400, 'invalid-idempotency-key', '报价请求标识无效，请重新提交。');
      const idempotencyKey = createHash('sha256').update(`${user.id}:${clientIdempotencyKey}`).digest('hex');
      const now = new Date().toISOString();
      // Stable IDs make a partially completed Feishu write safe to retry and
      // let Bid and Transaction be persisted in parallel.
      const bidId = `bid-${idempotencyKey.slice(0, 40)}`;
      const transactionId = `txn-${idempotencyKey.slice(0, 40)}`;
      const result = await repository.createAcceptedBidTransaction({
        bid: {
          bid_id: bidId, user_id: user.id, material_id: materialId, bid_time: now,
          bid_price: bidPrice, counter_price: null, bid_status: 'accepted', bidder_type: 'player', idempotency_key: idempotencyKey,
        },
        transaction: {
          transaction_id: transactionId, bid_id: bidId, material_id: materialId, user_id: user.id,
          transaction_time: now, bid_price: bidPrice, transaction_price: bidPrice, is_valid: true,
        },
        basePriceTransactionCount: config.basePriceTransactionCount,
      });
      if (result.alreadyPurchased) {
        return apiError(response, 409, 'material-already-acquired', '你已经购入过这段素材，每个账户对同一素材只能报价一次。');
      }
      // The accepted transaction already contains every value needed for the
      // current user's immediate result. Derive the first post-bid insight from
      // the material transaction set used above instead of scanning all three
      // pricing tables again on the critical response path.
      const materialTransactions = result.materialTransactions || (typeof repository.listTransactionsForMaterial === 'function'
        ? await repository.listTransactionsForMaterial(materialId)
        : (await repository.listAllPricing()).transactions.filter((item) => item.material_id === materialId));
      const validPrices = materialTransactions.filter((item) => item.is_valid === true)
        .map((item) => Number(item.transaction_price)).filter(Number.isFinite).sort((a, b) => a - b);
      const canReveal = validPrices.length >= marketInsightMinSample;
      const midpoint = Math.floor(validPrices.length / 2);
      const insight = {
        eligible: true,
        sample_count: validPrices.length,
        minimum_sample: marketInsightMinSample,
        personal: { bid_price: result.transaction.bid_price, transaction_price: result.transaction.transaction_price, transaction_time: result.transaction.transaction_time },
        cohort: canReveal ? {
          minimum: validPrices[0], maximum: validPrices.at(-1),
          mean: Number((validPrices.reduce((sum, price) => sum + price, 0) / validPrices.length).toFixed(2)),
          median: Number((validPrices.length % 2 ? validPrices[midpoint] : (validPrices[midpoint - 1] + validPrices[midpoint]) / 2).toFixed(2)),
        } : null,
      };
      const { materialTransactions: _, ...publicResult } = result;
      return json(response, result.duplicate ? 200 : 201, { ok: true, ...publicResult, insight, base_price_transaction_count: config.basePriceTransactionCount });
    }

    const materialInsightMatch = url.pathname.match(/^\/api\/pricing\/materials\/([^/]+)\/insight$/);
    if (materialInsightMatch && request.method === 'GET') {
      const user = await requireUser(request, response); if (!user) return;
      const materialId = cleanText(decodeURIComponent(materialInsightMatch[1]), 80);
      if (!/^[a-z0-9_-]{2,80}$/i.test(materialId)) return apiError(response, 400, 'invalid-material-id', '素材 ID 无效。');
      return json(response, 200, { ok: true, insight: await pricingInsight(repository, user.id, materialId, marketInsightMinSample) });
    }

    if (url.pathname === '/api/pricing/purchases' && request.method === 'GET') {
      const user = await requireUser(request, response); if (!user) return;
      const pricing = await repository.listPricingByUser(user.id);
      const bidsById = new Map(pricing.bids.map((bid) => [bid.bid_id, bid]));
      const basePricesByMaterial = new Map(pricing.basePrices.map((item) => [item.material_id, item]));
      const purchases = pricing.transactions
        .filter((transaction) => transaction.is_valid === true)
        .map((transaction) => {
          const bid = bidsById.get(transaction.bid_id);
          const basePrice = basePricesByMaterial.get(transaction.material_id);
          return {
            ...transaction,
            bid_status: bid?.bid_status || 'accepted',
            base_price: basePrice?.base_price ?? null,
            valid_transaction_count: basePrice?.valid_transaction_count ?? null,
            base_price_transaction_count: config.basePriceTransactionCount,
          };
        });
      return json(response, 200, { ok: true, purchases });
    }

    const materialPricingMatch = url.pathname.match(/^\/api\/pricing\/materials\/([^/]+)$/);
    if (materialPricingMatch && request.method === 'GET') {
      const user = await requireUser(request, response); if (!user) return;
      const materialId = cleanText(decodeURIComponent(materialPricingMatch[1]), 80);
      if (!/^[a-z0-9_-]{2,80}$/i.test(materialId)) return apiError(response, 400, 'invalid-material-id', '素材 ID 无效。');
      const insight = await pricingInsight(repository, user.id, materialId, marketInsightMinSample);
      const pricing = insight.eligible && insight.cohort
        ? await repository.getMaterialPricing(materialId)
        : { material_id: materialId, base_price: null, valid_transaction_count: insight.eligible ? insight.sample_count : null, sample_transaction_ids: [] };
      return json(response, 200, { ok: true, pricing, insight, base_price_transaction_count: config.basePriceTransactionCount });
    }

    if (url.pathname === '/api/admin/pricing/export.csv' && request.method === 'GET') {
      const user = await requireUser(request, response); if (!user) return;
      if (!isAdmin(user)) return apiError(response, 403, 'admin-required', '需要管理员权限。');
      const [pricing, assets] = await Promise.all([repository.listAllPricing(), repository.listPublicAssets({ includeDeleted: true })]);
      const transactionsByBid = new Map(pricing.transactions.map((transaction) => [transaction.bid_id, transaction]));
      const basePricesByMaterial = new Map(pricing.basePrices.map((item) => [item.material_id, item]));
      const assetsById = new Map(assets.map((asset) => [asset.id, asset]));
      const rows = [[
        'bid_id', 'transaction_id', 'material_id', 'user_id', 'timestamp', 'bid_price', 'counter_price', 'transaction_price', 'bid_status', 'is_valid',
        'base_price', 'base_price_valid_transaction_count', 'base_price_formed_at', 'base_price_sample_transaction_ids',
        'quality_score', 'heat_score', 'scarcity_score', 'training_value_score',
      ]];
      for (const bid of pricing.bids.sort((a, b) => String(a.bid_time).localeCompare(String(b.bid_time)))) {
        const transaction = transactionsByBid.get(bid.bid_id);
        const basePrice = basePricesByMaterial.get(bid.material_id);
        const asset = assetsById.get(bid.material_id) || {};
        rows.push([
          bid.bid_id, transaction?.transaction_id ?? '', bid.material_id, bid.user_id, bid.bid_time, bid.bid_price, bid.counter_price ?? '',
          transaction?.transaction_price ?? '', bid.bid_status, transaction?.is_valid ?? '', basePrice?.base_price ?? '',
          basePrice?.valid_transaction_count ?? '', basePrice?.formed_at ?? '', (basePrice?.sample_transaction_ids || []).join('|'),
          asset.quality_score ?? '', asset.heat_score ?? '', asset.scarcity_score ?? '', asset.training_value_score ?? '',
        ]);
      }
      return csv(response, `zhere-pricing-${new Date().toISOString().slice(0, 10)}.csv`, rows);
    }

    if (url.pathname === '/api/admin/research/events.csv' && request.method === 'GET') {
      const user = await requireUser(request, response); if (!user) return;
      if (!isAdmin(user)) return apiError(response, 403, 'admin-required', '需要管理员权限。');
      const events = await repository.listAllEvents();
      const rows = [[
        'row_type', 'event_id', 'research_subject_id', 'session_id', 'session_sequence', 'timestamp', 'event_type',
        'asset_id', 'impression_id', 'impression_batch_id', 'zone_id', 'rank', 'recommendation_score',
        'visibility_duration_ms', 'distance_to_player', 'watch_seconds', 'media_duration', 'milestone',
        'watch_ratio', 'positive_feedback', 'negative_feedback', 'conversion', 'bid_id', 'transaction_id', 'bid_price', 'transaction_price',
        'experiment_id', 'experiment_group', 'schema_version', 'derived_schema_version', 'details_json',
      ]];
      for (const event of events.sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)))) {
        const details = event.details && typeof event.details === 'object' ? event.details : {};
        const impressions = event.raw_event === 'impression_batch' && Array.isArray(details.impressions) ? details.impressions : null;
        const entries = impressions?.length ? impressions : [details];
        const derived = Number(event.derived_signals?.derived_schema_version) >= 1 ? event.derived_signals : deriveSignals(event.raw_event, details);
        for (const entry of entries) rows.push([
          impressions ? 'impression' : 'event', event.event_id, event.research_subject_id || '', event.session_id || '', event.session_sequence ?? '',
          event.created_at || '', event.raw_event || '', entry.asset_id || details.asset_id || '', entry.impression_id || details.impression_id || '',
          entry.impression_batch_id || details.impression_batch_id || '', entry.zone_id || details.zone_id || '', entry.rank ?? '',
          entry.recommendation_score ?? '', entry.visibility_duration_ms ?? '', entry.distance_to_player ?? '',
          derived.watch_seconds ?? (event.raw_event === 'watch_time' ? details.duration ?? '' : ''), details.media_duration ?? details.duration ?? '', derived.completion_milestone ?? details.milestone ?? '',
          derived.watch_ratio ?? '', derived.positive_feedback ?? '', derived.negative_feedback ?? '', derived.conversion ?? '',
          details.bid_id ?? '', details.transaction_id ?? '', details.bid_price ?? '', details.transaction_price ?? '',
          event.experiment_id || '', event.experiment_group || '', event.schema_version || '', derived.derived_schema_version ?? '', JSON.stringify(entry),
        ]);
      }
      return csv(response, `zhere-research-events-${new Date().toISOString().slice(0, 10)}.csv`, rows);
    }

    if (url.pathname === '/api/admin/research/health' && request.method === 'GET') {
      const user = await requireUser(request, response); if (!user) return;
      if (!isAdmin(user)) return apiError(response, 403, 'admin-required', '需要管理员权限。');
      const [events, pricing] = await Promise.all([repository.listAllEvents(), repository.listAllPricing()]);
      const duplicatePurchases = [];
      const validGroups = Map.groupBy((pricing.transactions || []).filter((item) => item.is_valid === true), (item) => `${item.user_id}\u0000${item.material_id}`);
      for (const group of validGroups.values()) if (group.length > 1) duplicatePurchases.push({
        user_id: group[0].user_id, material_id: group[0].material_id,
        transaction_ids: group.map((item) => item.transaction_id), count: group.length,
      });
      const eventTypeCounts = Object.fromEntries([...Map.groupBy(events, (event) => event.raw_event).entries()].map(([key, values]) => [key, values.length]));
      const impressions = events.flatMap((event) => event.raw_event === 'impression_batch' && Array.isArray(event.details?.impressions) ? event.details.impressions : []);
      const impressionIds = new Set(impressions.map((item) => item.impression_id).filter(Boolean));
      const attributedEvents = events.filter((event) => event.details?.impression_id);
      const orphanAttributions = attributedEvents.filter((event) => !impressionIds.has(event.details.impression_id));
      const unknownEvents = events.filter((event) => !EVENT_TYPES.has(event.raw_event));
      const lastEventAt = events.map((event) => event.created_at).filter(Boolean).sort().at(-1) || null;
      return json(response, 200, {
        ok: true, checked_at: new Date().toISOString(),
        summary: {
          event_count: events.length, impression_count: impressions.length, attributed_event_count: attributedEvents.length,
          orphan_attribution_count: orphanAttributions.length, unknown_event_count: unknownEvents.length,
          bid_count: pricing.bids?.length || 0, transaction_count: pricing.transactions?.length || 0,
          valid_transaction_count: (pricing.transactions || []).filter((item) => item.is_valid === true).length,
          duplicate_valid_purchase_group_count: duplicatePurchases.length, last_event_at: lastEventAt,
        },
        event_type_counts: eventTypeCounts,
        issues: {
          duplicate_valid_purchases: duplicatePurchases.slice(0, 100),
          orphan_attribution_event_ids: orphanAttributions.slice(0, 100).map((event) => event.event_id),
          unknown_event_types: [...new Set(unknownEvents.map((event) => event.raw_event))],
        },
      });
    }

    const pricingTransactionMatch = url.pathname.match(/^\/api\/admin\/pricing\/transactions\/([^/]+)$/);
    if (pricingTransactionMatch && request.method === 'PATCH') {
      const user = await requireUser(request, response); if (!user) return;
      if (!isAdmin(user)) return apiError(response, 403, 'admin-required', '需要管理员权限。');
      const body = await readJson(request, 16 * 1024);
      if (typeof body.is_valid !== 'boolean') return apiError(response, 400, 'invalid-transaction-status', '请明确设置交易是否有效。');
      const result = await repository.setTransactionValidity(decodeURIComponent(pricingTransactionMatch[1]), body.is_valid, config.basePriceTransactionCount);
      if (!result) return apiError(response, 404, 'transaction-not-found', '交易不存在。');
      return json(response, 200, { ok: true, ...result });
    }

    if (url.pathname === '/api/public/assets/upload' && request.method === 'POST') {
      const user = await requireUser(request, response); if (!user) return;
      if (!allowPublicWrite(user.id, 'asset-upload-publish', 20, 60 * 60_000)) return apiError(response, 429, 'rate-limited', '发布过于频繁，请稍后再试。');
      let upload;
      try { upload = await readVideoMultipart(request, config); }
      catch (error) { return apiError(response, error.status || 400, error.message || 'invalid-media', error.publicMessage || '视频上传格式无效。'); }

      const { form, assetId, mediaInput } = upload;
      const [existingMedia, existingPublic] = await Promise.all([
        repository.getMedia(assetId),
        repository.getPublicAssetCore ? repository.getPublicAssetCore(assetId) : repository.getPublicAsset(assetId),
      ]);
      if (existingMedia && existingMedia.userId !== user.id) return apiError(response, 409, 'asset-id-exists', '该素材 ID 已被使用。');
      if (existingPublic && existingPublic.ownerId !== user.id) return apiError(response, 409, 'asset-id-exists', '该素材 ID 已被使用。');
      if (existingPublic?.moderationStatus === 'hidden') return apiError(response, 403, 'asset-hidden', '该素材已被隐藏，不能通过重试重新发布。');
      if (existingPublic?.status === 'published' && existingPublic.moderationStatus !== 'hidden') {
        return json(response, 200, { ok: true, duplicate: true, reusedMedia: Boolean(existingMedia), asset: publicAssetView(existingPublic, user.id) });
      }

      // Feishu cannot wrap Drive and Bitable in one transaction. Keeping a
      // successfully uploaded private media row lets the same asset id resume
      // publication without uploading the file again after a partial failure.
      const media = existingMedia || await repository.saveMedia({ userId: user.id, ...mediaInput });
      const body = {
        id: assetId,
        title: form.get('title'), description: form.get('description'),
        wx: form.get('wx'), wy: form.get('wy'), zone: form.get('zone'),
      };
      const record = await repository.savePublicAsset(publicAssetRecord(user, body, media, existingPublic), { existing: existingPublic, skipLookup: !existingPublic });
      return json(response, existingPublic ? 200 : 201, {
        ok: true, duplicate: false, reusedMedia: Boolean(existingMedia),
        asset: publicAssetView(record, user.id),
        media: { id: media.id, fileName: media.fileName, mime: media.mime, size: media.size, mediaUrl: `/api/media/${encodeURIComponent(media.id)}` },
      });
    }

    if (url.pathname === '/api/public/assets' && request.method === 'POST') {
      const user = await requireUser(request, response); if (!user) return;
      if (!allowPublicWrite(user.id, 'asset-publish', 20, 60 * 60_000)) return apiError(response, 429, 'rate-limited', '发布过于频繁，请稍后再试。');
      const body = await readJson(request, 128 * 1024);
      const assetId = cleanText(body.id, 80);
      if (!/^[a-z0-9_-]{2,80}$/i.test(assetId)) return apiError(response, 400, 'invalid-asset-id', '素材 ID 无效。');
      const media = await repository.getMedia(assetId);
      if (!media) return apiError(response, 400, 'media-required', '公开视频必须先上传可播放的视频文件。');
      if (media && media.userId !== user.id) return apiError(response, 403, 'asset-owner-mismatch', '不能发布其他用户的素材文件。');
      const existing = repository.getPublicAssetCore ? await repository.getPublicAssetCore(assetId) : await repository.getPublicAsset(assetId);
      if (existing && existing.ownerId !== user.id) return apiError(response, 409, 'asset-id-exists', '该素材 ID 已被使用。');
      if (existing?.moderationStatus === 'hidden') return apiError(response, 403, 'asset-hidden', '该素材已被隐藏，不能重新发布。');
      const record = await repository.savePublicAsset(publicAssetRecord(user, { ...body, id: assetId }, media, existing), { existing, skipLookup: !existing });
      return json(response, existing ? 200 : 201, { ok: true, asset: publicAssetView(record, user.id) });
    }

    const assetMatch = url.pathname.match(/^\/api\/public\/assets\/([^/]+)$/);
    if (assetMatch && request.method === 'PATCH') {
      const user = await requireUser(request, response); if (!user) return;
      if (!allowPublicWrite(user.id, 'asset-update')) return apiError(response, 429, 'rate-limited', '修改过于频繁，请稍后再试。');
      const body = await readJson(request, 64 * 1024);
      const patch = {};
      if (body.title != null) patch.title = cleanText(body.title, 80) || '未命名素材';
      if (body.description != null) patch.description = cleanText(body.description, 500);
      if (body.wx != null) patch.wx = cleanCoordinate(body.wx);
      if (body.wy != null) patch.wy = cleanCoordinate(body.wy);
      if (body.zone != null) patch.zone = cleanText(body.zone, 40);
      if (typeof body.archived === 'boolean') patch.archived = body.archived;
      const result = await repository.updatePublicAsset(decodeURIComponent(assetMatch[1]), user.id, patch);
      if (result == null) return apiError(response, 404, 'public-asset-not-found', '公共素材不存在。');
      if (!result) return apiError(response, 403, 'not-asset-owner', '只有发布者可以修改素材。');
      return json(response, 200, { ok: true, asset: publicAssetView(result, user.id) });
    }

    if (assetMatch && request.method === 'DELETE') {
      const user = await requireUser(request, response); if (!user) return;
      const result = await repository.updatePublicAsset(decodeURIComponent(assetMatch[1]), user.id, { status: 'deleted' });
      if (result == null) return apiError(response, 404, 'public-asset-not-found', '公共素材不存在。');
      if (!result) return apiError(response, 403, 'not-asset-owner', '只有发布者可以撤回素材。');
      return json(response, 200, { ok: true, deleted: true });
    }

    const assetReactionMatch = url.pathname.match(/^\/api\/public\/assets\/([^/]+)\/reaction$/);
    if (assetReactionMatch && request.method === 'PUT') {
      const user = await requireUser(request, response); if (!user) return;
      if (!allowPublicWrite(user.id, 'asset-reaction', 120)) return apiError(response, 429, 'rate-limited', '互动过于频繁，请稍后再试。');
      const body = await readJson(request, 8 * 1024);
      const result = await repository.setPublicAssetReaction(decodeURIComponent(assetReactionMatch[1]), user.id, Boolean(body.liked));
      if (!result) return apiError(response, 404, 'public-asset-not-found', '公共素材不存在。');
      return json(response, 200, { ok: true, asset: publicAssetView(result, user.id) });
    }

    const assetTagMatch = url.pathname.match(/^\/api\/public\/assets\/([^/]+)\/tags\/([^/]+)$/);
    if (assetTagMatch && request.method === 'PUT') {
      const user = await requireUser(request, response); if (!user) return;
      if (!allowPublicWrite(user.id, 'asset-tag', 90)) return apiError(response, 429, 'rate-limited', '标签操作过于频繁，请稍后再试。');
      const tag = cleanText(decodeURIComponent(assetTagMatch[2]), 12).replace(/\s+/g, ' ');
      if (tag.length < 2) return apiError(response, 400, 'invalid-tag', '标签至少需要 2 个字。');
      const body = await readJson(request, 8 * 1024);
      const result = await repository.setPublicAssetTag(decodeURIComponent(assetTagMatch[1]), user.id, tag, Boolean(body.active));
      if (!result) return apiError(response, 404, 'public-asset-not-found', '公共素材不存在。');
      return json(response, 200, { ok: true, asset: publicAssetView(result, user.id) });
    }

    const assetCommentMatch = url.pathname.match(/^\/api\/public\/assets\/([^/]+)\/comments(?:\/([^/]+))?$/);
    if (assetCommentMatch && request.method === 'POST' && !assetCommentMatch[2]) {
      const user = await requireUser(request, response); if (!user) return;
      if (!allowPublicWrite(user.id, 'asset-comment', 40)) return apiError(response, 429, 'rate-limited', '留言过于频繁，请稍后再试。');
      const assetId = decodeURIComponent(assetCommentMatch[1]);
      const asset = await repository.getPublicAsset(assetId);
      if (!asset) return apiError(response, 404, 'public-asset-not-found', '公共素材不存在。');
      const body = await readJson(request, 32 * 1024);
      const text = cleanText(body.text, 160);
      if (!text) return apiError(response, 400, 'empty-comment', '请填写留言内容。');
      const parentId = cleanText(body.parentId, 80) || null;
      if (parentId && !(asset.comments || []).some((comment) => comment.id === parentId)) return apiError(response, 400, 'parent-comment-not-found', '要回复的留言已经不存在。');
      const record = await repository.createPublicAssetComment(assetId, {
        id: cleanText(body.id, 80) || `comment-${randomUUID()}`,
        ownerId: user.id, ownerName: user.nickname || '匿名旅人', name: user.nickname || '匿名旅人',
        text, parentId, status: 'published', createdAt: new Date().toISOString(),
      });
      return json(response, 201, { ok: true, comment: { ...record, owner: 'me' } });
    }

    if (assetCommentMatch && request.method === 'PATCH' && assetCommentMatch[2]) {
      const user = await requireUser(request, response); if (!user) return;
      const body = await readJson(request, 16 * 1024);
      const text = cleanText(body.text, 160);
      if (!text) return apiError(response, 400, 'empty-comment', '请填写留言内容。');
      const result = await repository.updatePublicAssetComment(decodeURIComponent(assetCommentMatch[1]), decodeURIComponent(assetCommentMatch[2]), user.id, text);
      if (result == null) return apiError(response, 404, 'public-asset-not-found', '公共素材不存在。');
      if (!result) return apiError(response, 403, 'not-comment-owner', '只能修改自己的留言。');
      const { ownerId, ...comment } = result;
      return json(response, 200, { ok: true, comment: { ...comment, owner: 'me' } });
    }

    if (assetCommentMatch && request.method === 'DELETE' && assetCommentMatch[2]) {
      const user = await requireUser(request, response); if (!user) return;
      const assetId = decodeURIComponent(assetCommentMatch[1]);
      const commentId = decodeURIComponent(assetCommentMatch[2]);
      const result = await repository.deletePublicAssetComment(assetId, commentId, user.id);
      if (result == null) return apiError(response, 404, 'public-asset-not-found', '公共素材不存在。');
      if (!result) return apiError(response, 403, 'not-comment-owner', '只能删除自己的留言。');
      return json(response, 200, { ok: true, deleted: true });
    }

    if (url.pathname === '/api/public/demands' && request.method === 'POST') {
      const user = await requireUser(request, response); if (!user) return;
      if (!allowPublicWrite(user.id, 'demand-publish', 20, 60 * 60_000)) return apiError(response, 429, 'rate-limited', '发布需求过于频繁，请稍后再试。');
      const body = await readJson(request, 128 * 1024);
      const demandId = cleanText(body.id, 80) || `n-${randomUUID()}`;
      if (!/^[a-z0-9_-]{2,80}$/i.test(demandId)) return apiError(response, 400, 'invalid-demand-id', '需求 ID 无效。');
      const existing = await repository.getPublicDemandCore(demandId);
      if (existing && existing.ownerId !== user.id) return apiError(response, 409, 'demand-id-exists', '该需求 ID 已被使用。');
      const title = cleanText(body.title, 48);
      if (!title) return apiError(response, 400, 'demand-title-required', '请填写需求标题。');
      const now = new Date().toISOString();
      const record = await repository.savePublicDemand({
        ...(existing || {}), id: demandId, ownerId: user.id, ownerName: user.nickname || '匿名旅人', by: user.nickname || '匿名旅人',
        title, description: cleanText(body.description, 360), type: body.type === 'commerce' ? 'commerce' : 'personal',
        projectName: cleanText(body.projectName, 48), audience: cleanText(body.audience, 48), format: cleanText(body.format, 48),
        quantity: Math.max(1, Math.min(99, Number(body.quantity) || 1)), budget: Math.max(0, Math.min(9999, Number(body.budget) || 0)),
        deadline: cleanText(body.deadline, 20), status: ['open', 'closed'].includes(body.status) ? body.status : existing?.status || 'open',
        wx: cleanCoordinate(body.wx), wy: cleanCoordinate(body.wy), zone: cleanText(body.zone, 40),
        refAsset: cleanText(body.refAsset, 80) || null, assetLinks: Array.isArray(existing?.assetLinks) ? existing.assetLinks : [],
        createdAt: existing?.createdAt || now, updatedAt: now,
      }, { skipLookup: !existing });
      const withResponses = { ...record, responses: existing?.responses || [] };
      return json(response, existing ? 200 : 201, { ok: true, demand: publicDemandView(withResponses, user.id) });
    }

    const demandMatch = url.pathname.match(/^\/api\/public\/demands\/([^/]+)$/);
    if (demandMatch && request.method === 'PATCH') {
      const user = await requireUser(request, response); if (!user) return;
      const demandId = decodeURIComponent(demandMatch[1]);
      const existing = await repository.getPublicDemand(demandId);
      if (!existing) return apiError(response, 404, 'demand-not-found', '需求不存在。');
      if (existing.ownerId !== user.id) return apiError(response, 403, 'not-demand-owner', '只有发布者可以修改需求。');
      const body = await readJson(request, 128 * 1024);
      const updated = await repository.savePublicDemand({
        ...existing,
        ...(body.title != null ? { title: cleanText(body.title, 48) } : {}),
        ...(body.description != null ? { description: cleanText(body.description, 360) } : {}),
        ...(body.status != null && ['open', 'closed'].includes(body.status) ? { status: body.status } : {}),
        ...(body.type != null ? { type: body.type === 'commerce' ? 'commerce' : 'personal' } : {}),
        projectName: body.projectName != null ? cleanText(body.projectName, 48) : existing.projectName,
        audience: body.audience != null ? cleanText(body.audience, 48) : existing.audience,
        format: body.format != null ? cleanText(body.format, 48) : existing.format,
        quantity: body.quantity != null ? Math.max(1, Math.min(99, Number(body.quantity) || 1)) : existing.quantity,
        budget: body.budget != null ? Math.max(0, Math.min(9999, Number(body.budget) || 0)) : existing.budget,
        deadline: body.deadline != null ? cleanText(body.deadline, 20) : existing.deadline,
        ...(typeof body.archived === 'boolean' ? { archived: body.archived } : {}),
        updatedAt: new Date().toISOString(),
      });
      return json(response, 200, { ok: true, demand: publicDemandView({ ...updated, responses: existing.responses || [] }, user.id) });
    }

    if (demandMatch && request.method === 'DELETE') {
      const user = await requireUser(request, response); if (!user) return;
      const demandId = decodeURIComponent(demandMatch[1]);
      const existing = await repository.getPublicDemand(demandId);
      if (!existing) return apiError(response, 404, 'demand-not-found', '需求不存在。');
      if (existing.ownerId !== user.id) return apiError(response, 403, 'not-demand-owner', '只有发布者可以删除需求。');
      await repository.deletePublicDemand(demandId, user.id);
      return json(response, 200, { ok: true, deleted: true });
    }

    const responseMatch = url.pathname.match(/^\/api\/public\/demands\/([^/]+)\/responses$/);
    if (responseMatch && request.method === 'POST') {
      const user = await requireUser(request, response); if (!user) return;
      if (!allowPublicWrite(user.id, 'demand-response', 40)) return apiError(response, 429, 'rate-limited', '回应过于频繁，请稍后再试。');
      const demandId = decodeURIComponent(responseMatch[1]);
      const body = await readJson(request, 64 * 1024);
      const text = cleanText(body.text, 500);
      const assetId = cleanText(body.assetId, 80) || null;
      const requestedResponseId = cleanText(body.id, 80);
      if (requestedResponseId && !/^[a-z0-9_.:-]{8,80}$/i.test(requestedResponseId)) return apiError(response, 400, 'invalid-response-id', '回应请求标识无效，请重新提交。');
      const responseId = requestedResponseId || `response-${randomUUID()}`;
      if (!text && !assetId) return apiError(response, 400, 'empty-response', '请选择视频或填写回应。');
      const [demand, publicAsset, existingResponse] = await Promise.all([
        repository.getPublicDemandCore(demandId),
        assetId && !assetId.startsWith('v-') ? repository.getPublicAsset(assetId) : Promise.resolve(null),
        repository.getPublicResponse(responseId),
      ]);
      if (!demand) return apiError(response, 404, 'demand-not-found', '需求不存在。');
      if (demand.status !== 'open') return apiError(response, 409, 'demand-closed', '该需求已经关闭。');
      if (assetId && !assetId.startsWith('v-') && !publicAsset) return apiError(response, 400, 'asset-not-public', '回应视频必须先发布到公共世界。');
      if (existingResponse) {
        if (existingResponse.demandId !== demandId || existingResponse.ownerId !== user.id) return apiError(response, 409, 'response-id-exists', '该回应请求标识已被使用。');
        const { ownerId: _ownerId, _recordId, ...publicResponse } = existingResponse;
        return json(response, 200, { ok: true, response: { ...publicResponse, owner: 'me' }, duplicate: true });
      }
      const record = await repository.createPublicResponse({
        id: responseId,
        demandId, ownerId: user.id, ownerName: user.nickname || '匿名旅人', name: user.nickname || '匿名旅人',
        text, assetId, assetTitle: cleanText(body.assetTitle, 80), status: 'published', createdAt: new Date().toISOString(), at: '刚刚',
      }, { skipLookup: true });
      return json(response, 201, { ok: true, response: { ...record, owner: 'me' } });
    }

    const responseItemMatch = url.pathname.match(/^\/api\/public\/demands\/([^/]+)\/responses\/([^/]+)$/);
    if (responseItemMatch && ['PATCH', 'DELETE'].includes(request.method)) {
      const user = await requireUser(request, response); if (!user) return;
      const demandId = decodeURIComponent(responseItemMatch[1]);
      const responseId = decodeURIComponent(responseItemMatch[2]);
      if (request.method === 'DELETE') {
        const result = await repository.updatePublicResponse(responseId, user.id, { status: 'deleted' }, { demandId });
        if (result == null) return apiError(response, 404, 'response-not-found', '回应不存在。');
        if (!result) return apiError(response, 403, 'not-response-owner', '只能删除自己的回应。');
        return json(response, 200, { ok: true, deleted: true });
      }
      const body = await readJson(request, 32 * 1024);
      const text = cleanText(body.text, 500);
      const result = await repository.updatePublicResponse(responseId, user.id, { text }, { demandId });
      if (result == null) return apiError(response, 404, 'response-not-found', '回应不存在。');
      if (!result) return apiError(response, 403, 'not-response-owner', '只能修改自己的回应。');
      const { ownerId, ...publicResponse } = result;
      return json(response, 200, { ok: true, response: { ...publicResponse, owner: 'me' } });
    }

    const demandLinkMatch = url.pathname.match(/^\/api\/public\/demands\/([^/]+)\/links$/);
    if (demandLinkMatch && request.method === 'PUT') {
      const user = await requireUser(request, response); if (!user) return;
      const demandId = decodeURIComponent(demandLinkMatch[1]);
      const body = await readJson(request, 16 * 1024);
      const assetId = cleanText(body.assetId, 80);
      const [demand, publicAsset] = await Promise.all([
        repository.getPublicDemandCore(demandId),
        assetId && !assetId.startsWith('v-') ? repository.getPublicAsset(assetId) : Promise.resolve(null),
      ]);
      if (!demand) return apiError(response, 404, 'demand-not-found', '需求不存在。');
      if (!assetId || (!assetId.startsWith('v-') && !publicAsset)) return apiError(response, 400, 'asset-not-public', '只能关联公共素材。');
      const links = new Set(demand.assetLinks || []);
      const linkRecords = Array.isArray(demand.assetLinkRecords) ? [...demand.assetLinkRecords] : [];
      if (body.active === false) links.delete(assetId); else links.add(assetId);
      const nextLinkRecords = body.active === false
        ? linkRecords.filter((item) => item.assetId !== assetId)
        : linkRecords.some((item) => item.assetId === assetId) ? linkRecords : [...linkRecords, { assetId, ownerId: user.id, createdAt: new Date().toISOString() }];
      const updated = await repository.savePublicDemand({ ...demand, assetLinks: [...links], assetLinkRecords: nextLinkRecords, updatedAt: new Date().toISOString() });
      return json(response, 200, { ok: true, demand: publicDemandView(updated, user.id) });
    }

    const publicSwapClaimMatch = url.pathname.match(/^\/api\/public\/swaps\/([^/]+)\/claim$/);
    if (publicSwapClaimMatch && request.method === 'POST') {
      const user = await requireUser(request, response); if (!user) return;
      if (!allowPublicWrite(user.id, 'public-swap', 20)) return apiError(response, 429, 'rate-limited', '交换操作过于频繁，请稍后再试。');
      const body = await readJson(request, 32 * 1024);
      const offerId = cleanText(decodeURIComponent(publicSwapClaimMatch[1]), 80);
      const replacementAssetId = cleanText(body.replacementAssetId, 80);
      const note = cleanText(body.note, 100) || '没有留话，但心意在。';
      if (!/^[a-z0-9_-]{2,80}$/i.test(replacementAssetId)) return apiError(response, 400, 'invalid-replacement-asset', '请选择一枚有效副本放入交换箱。');
      if (!replacementAssetId.startsWith('v-') && !(await repository.getPublicAsset(replacementAssetId))) return apiError(response, 400, 'replacement-not-public', '只能交换仍在公共世界中的素材副本。');
      const result = await repository.claimPublicSwap({
        offerId, user, replacementAssetId, note, newRecordId: `swap-${randomUUID()}`, now: new Date().toISOString(),
      });
      if (!result) return apiError(response, 409, 'swap-offer-gone', '这枚副本刚刚被别人换走了，请刷新交换箱。');
      if (result.ownOffer) return apiError(response, 409, 'swap-own-offer', '不能取回自己放进交换箱的副本，请等待下一位玩家回应。');
      if (result.sameAsset) return apiError(response, 409, 'swap-same-asset', '请换一枚不同的副本。');
      return json(response, 201, { ok: true, gainedAssetId: result.gainedAssetId, offer: publicRecordView(result.offer, user.id) });
    }

    if (url.pathname === '/api/public/records' && request.method === 'POST') {
      const user = await requireUser(request, response); if (!user) return;
      if (!allowPublicWrite(user.id, 'public-record', 50)) return apiError(response, 429, 'rate-limited', '公共互动过于频繁，请稍后再试。');
      const body = await readJson(request, 64 * 1024);
      const allowedKinds = new Set(['asset_relation', 'bench_message', 'bottle_reply', 'follow']);
      const kind = cleanText(body.kind, 40);
      if (!allowedKinds.has(kind)) return apiError(response, 400, 'invalid-record-kind', '公共互动类型无效。');
      const id = cleanText(body.id, 80) || `${kind}-${randomUUID()}`;
      const payload = body.payload && typeof body.payload === 'object' && !Array.isArray(body.payload) ? body.payload : {};
      if (kind === 'asset_relation') {
        const aId = cleanText(payload.aId, 80); const bId = cleanText(payload.bId, 80);
        if (!aId || !bId || aId === bId) return apiError(response, 400, 'invalid-relation', '请选择两段不同素材。');
        payload.aId = aId; payload.bId = bId; payload.type = ['echo', 'contrast', 'sequence', 'unresolved'].includes(payload.type) ? payload.type : 'unresolved'; payload.note = cleanText(payload.note, 300);
      }
      if (kind === 'bench_message' || kind === 'bottle_reply') payload.text = cleanText(payload.text, 180);
      if ((kind === 'bench_message' || kind === 'bottle_reply') && !payload.text) return apiError(response, 400, 'empty-record', '请填写内容。');
      const record = await repository.savePublicRecord({
        id, kind, ownerId: user.id, ownerName: user.nickname || '匿名旅人', name: user.nickname || '匿名旅人',
        payload, status: 'published', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
      });
      if (!record) return apiError(response, 409, 'record-owner-conflict', '该公共记录已属于其他用户。');
      return json(response, 201, { ok: true, record: publicRecordView(record, user.id) });
    }

    const publicRecordMatch = url.pathname.match(/^\/api\/public\/records\/([^/]+)$/);
    if (publicRecordMatch && request.method === 'DELETE') {
      const user = await requireUser(request, response); if (!user) return;
      const result = await repository.deletePublicRecord(decodeURIComponent(publicRecordMatch[1]), user.id);
      if (result == null) return apiError(response, 404, 'public-record-not-found', '公共记录不存在。');
      if (!result) return apiError(response, 403, 'not-record-owner', '只能删除自己的公共记录。');
      return json(response, 200, { ok: true, deleted: true });
    }

    if (url.pathname === '/api/public/reports' && request.method === 'POST') {
      const user = await requireUser(request, response); if (!user) return;
      if (!allowPublicWrite(user.id, 'report', 10, 60 * 60_000)) return apiError(response, 429, 'rate-limited', '举报提交过于频繁，请稍后再试。');
      const body = await readJson(request, 32 * 1024);
      const targetType = cleanText(body.targetType, 20);
      if (!['asset', 'demand', 'comment', 'response', 'record'].includes(targetType)) return apiError(response, 400, 'invalid-report-target', '举报对象无效。');
      const targetId = cleanText(body.targetId, 80);
      const reason = cleanText(body.reason, 300);
      if (!targetId || !reason) return apiError(response, 400, 'report-required', '请选择对象并填写举报原因。');
      if (!(await publicTargetExists(targetType, targetId))) return apiError(response, 404, 'report-target-not-found', '举报对象不存在或已不可见。');
      const report = await repository.createReport({
        id: `report-${randomUUID()}`, reporterId: user.id, reporterName: user.nickname || '匿名旅人',
        targetType, targetId, reason, status: 'open', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
      });
      return json(response, 201, { ok: true, report: { id: report.id, status: report.status } });
    }

    if (url.pathname === '/api/admin/reports' && request.method === 'GET') {
      const user = await requireUser(request, response); if (!user) return;
      if (!isAdmin(user)) return apiError(response, 403, 'admin-required', '需要管理员权限。');
      const reports = await repository.listReports();
      return json(response, 200, { ok: true, reports: reports.sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt))) });
    }

    const adminReportMatch = url.pathname.match(/^\/api\/admin\/reports\/([^/]+)$/);
    if (adminReportMatch && request.method === 'PATCH') {
      const user = await requireUser(request, response); if (!user) return;
      if (!isAdmin(user)) return apiError(response, 403, 'admin-required', '需要管理员权限。');
      const body = await readJson(request, 16 * 1024);
      const status = ['open', 'resolved', 'dismissed'].includes(body.status) ? body.status : null;
      if (!status) return apiError(response, 400, 'invalid-report-status', '审核状态无效。');
      const report = await repository.updateReport(decodeURIComponent(adminReportMatch[1]), { status, reviewerId: user.id });
      if (!report) return apiError(response, 404, 'report-not-found', '举报不存在。');
      return json(response, 200, { ok: true, report });
    }

    const moderationMatch = url.pathname.match(/^\/api\/admin\/moderation\/([^/]+)\/([^/]+)$/);
    if (moderationMatch && request.method === 'PUT') {
      const user = await requireUser(request, response); if (!user) return;
      if (!isAdmin(user)) return apiError(response, 403, 'admin-required', '需要管理员权限。');
      const body = await readJson(request, 16 * 1024);
      const moderationStatus = body.hidden ? 'hidden' : 'visible';
      const target = await repository.moderatePublicTarget(decodeURIComponent(moderationMatch[1]), decodeURIComponent(moderationMatch[2]), moderationStatus);
      if (!target) return apiError(response, 404, 'moderation-target-not-found', '审核对象不存在。');
      return json(response, 200, { ok: true, moderationStatus });
    }

    if (url.pathname === '/api/world-state' && request.method === 'GET') {
      const user = await requireUser(request, response); if (!user) return;
      const record = await repository.getWorldState(user.id);
      return json(response, 200, { ok: true, state: record?.state || null, version: record?.version || 0, updatedAt: record?.updatedAt || null });
    }

    if (url.pathname === '/api/world-state' && ['PUT', 'POST'].includes(request.method)) {
      const user = await requireUser(request, response); if (!user) return;
      const body = await readJson(request, config.maxJsonBytes);
      if (!body.state || typeof body.state !== 'object' || Array.isArray(body.state)) return apiError(response, 400, 'invalid-state', '世界状态格式无效。');
      const expectedVersion = body.force === true ? null : (Number.isInteger(body.baseVersion) ? body.baseVersion : null);
      try {
        const record = await repository.saveWorldState(user.id, body.state, expectedVersion);
        return json(response, 200, { ok: true, version: record.version, updatedAt: record.updatedAt });
      } catch (error) {
        if (error.code !== 'world-state-conflict') throw error;
        const current = error.current || await repository.getWorldState(user.id);
        return json(response, 409, {
          ok: false,
          error: { code: 'world-state-conflict', message: '这份进度已在另一个页面更新。' },
          conflict: { state: current?.state || null, version: current?.version || 0, updatedAt: current?.updatedAt || null },
        });
      }
    }

    if (url.pathname === '/api/events/batch' && request.method === 'POST') {
      const user = await requireUser(request, response); if (!user) return;
      const body = await readJson(request, config.maxJsonBytes);
      const rawEvents = Array.isArray(body.events) ? body.events.slice(0, 200) : [];
      const validated = rawEvents.map((event) => ({ raw: event, ...validateTelemetryEvent(event) }));
      const events = validated.map((entry) => entry.event).filter(Boolean);
      const rejectedIds = validated.filter((entry) => !entry.event && entry.raw?.event_id).map((entry) => String(entry.raw.event_id));
      const rejectionReasons = Object.fromEntries(validated.filter((entry) => !entry.event && entry.raw?.event_id).map((entry) => [String(entry.raw.event_id), entry.error]));
      if (!events.length) return json(response, 200, { ok: true, accepted: [], acknowledged: [], rejected: rejectedIds.length, rejected_ids: rejectedIds, rejection_reasons: rejectionReasons });
      const allowedEvents = user.research ? events : events.filter((event) => ESSENTIAL_EVENTS.has(event.raw_event));
      const subject = await ensureResearchIdentity(user);
      const accepted = await repository.appendEvents(user.id, allowedEvents, subject.subject_id);
      return json(response, 200, { ok: true, accepted, acknowledged: events.map((event) => event.event_id), rejected: rejectedIds.length, rejected_ids: rejectedIds, rejection_reasons: rejectionReasons });
    }

    if (url.pathname === '/api/events/recent' && request.method === 'GET') {
      const user = await requireUser(request, response); if (!user) return;
      return json(response, 200, { ok: true, events: await repository.recentEvents(user.id, 200) });
    }

    if (url.pathname === '/api/media' && request.method === 'POST') {
      const user = await requireUser(request, response); if (!user) return;
      let upload;
      try { upload = await readVideoMultipart(request, config); }
      catch (error) { return apiError(response, error.status || 400, error.message || 'invalid-media', error.publicMessage || '视频上传格式无效。'); }
      const { assetId, mediaInput } = upload;
      const existing = await repository.getMedia(assetId);
      if (existing && existing.userId !== user.id) return apiError(response, 409, 'asset-id-exists', '该素材 ID 已被使用。');
      if (existing) return json(response, 200, { ok: true, duplicate: true, asset: { ...existing, storageKey: undefined, mediaUrl: `/api/media/${encodeURIComponent(existing.id)}` } });
      const asset = await repository.saveMedia({
        userId: user.id, ...mediaInput,
      });
      return json(response, 201, { ok: true, asset: { ...asset, storageKey: undefined, mediaUrl: `/api/media/${encodeURIComponent(asset.id)}` } });
    }

    if (url.pathname.startsWith('/api/media/') && request.method === 'GET') {
      const user = await requireUser(request, response); if (!user) return;
      const assetId = decodeURIComponent(url.pathname.slice('/api/media/'.length));
      const asset = await repository.getMedia(assetId);
      if (!asset) return apiError(response, 404, 'media-not-found', '没有找到该视频。');
      const publicAsset = await repository.getPublicAsset(assetId);
      if (asset.userId !== user.id && !publicAsset) return apiError(response, 403, 'media-private', '该视频尚未发布到公共世界。');
      const mediaSize = Number(asset.size || 0);
      const range = request.headers.range?.match(/^bytes=(\d*)-(\d*)$/);
      if (range) {
        const suffixLength = !range[1] && range[2] ? Number(range[2]) : null;
        const start = suffixLength != null ? Math.max(0, mediaSize - suffixLength) : (range[1] ? Number(range[1]) : 0);
        const end = suffixLength != null ? mediaSize - 1 : (range[2] ? Math.min(Number(range[2]), mediaSize - 1) : mediaSize - 1);
        if (!mediaSize || !Number.isInteger(start) || !Number.isInteger(end) || start < 0 || start > end || start >= mediaSize) {
          response.writeHead(416, { 'content-range': `bytes */${mediaSize}` });
          return response.end();
        }
        if (repository.openMedia) {
          const opened = await repository.openMedia(asset, { start, end });
          response.writeHead(206, {
            'content-type': asset.mime || 'application/octet-stream', 'content-length': end - start + 1,
            'content-range': `bytes ${start}-${end}/${opened.size || mediaSize}`, 'cache-control': 'private, max-age=3600', 'accept-ranges': 'bytes',
          });
          opened.stream.on('error', (error) => response.destroy(error));
          return opened.stream.pipe(response);
        }
        const bytes = await repository.readMedia(asset);
        const chunk = bytes.subarray(start, end + 1);
        response.writeHead(206, { 'content-type': asset.mime || 'application/octet-stream', 'content-length': chunk.length, 'content-range': `bytes ${start}-${end}/${bytes.length}`, 'cache-control': 'private, max-age=3600', 'accept-ranges': 'bytes' });
        return response.end(chunk);
      }
      if (repository.openMedia && mediaSize > 0) {
        const opened = await repository.openMedia(asset, { start: 0, end: mediaSize - 1 });
        response.writeHead(200, { 'content-type': asset.mime || 'application/octet-stream', 'content-length': opened.size || mediaSize, 'cache-control': 'private, max-age=3600', 'accept-ranges': 'bytes' });
        opened.stream.on('error', (error) => response.destroy(error));
        return opened.stream.pipe(response);
      }
      const bytes = await repository.readMedia(asset);
      response.writeHead(200, { 'content-type': asset.mime || 'application/octet-stream', 'content-length': bytes.length, 'cache-control': 'private, max-age=3600', 'accept-ranges': 'bytes' });
      return response.end(bytes);
    }

    return apiError(response, 404, 'not-found', '接口不存在。');
  }

  async function serveStatic(request, response, url) {
    if (url.pathname === '/') { response.writeHead(302, { location: APP_PREFIX }); return response.end(); }
    if (!url.pathname.startsWith(APP_PREFIX)) return apiError(response, 404, 'not-found', '页面不存在。');
    const relative = decodeURIComponent(url.pathname.slice(APP_PREFIX.length)) || 'index.html';
    const target = path.resolve(config.appDir, relative);
    if (!target.startsWith(path.resolve(config.appDir))) return apiError(response, 403, 'forbidden', '无权访问。');
    try {
      const stat = await fs.stat(target);
      const file = stat.isDirectory() ? path.join(target, 'index.html') : target;
      const bytes = await fs.readFile(file);
      response.writeHead(200, { ...headers, 'content-type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream', 'content-length': bytes.length, 'cache-control': config.isProduction ? 'public, max-age=300' : 'no-store' });
      response.end(bytes);
    } catch {
      apiError(response, 404, 'not-found', '页面不存在。');
    }
  }

  return http.createServer(async (request, response) => {
    Object.entries(headers).forEach(([name, value]) => response.setHeader(name, value));
    const requestId = randomUUID();
    response.setHeader('x-request-id', requestId);
    const url = new URL(request.url || '/', `http://${request.headers.host || 'localhost'}`);
    const startedAt = performance.now();
    response.once('finish', () => {
      const durationMs = Number((performance.now() - startedAt).toFixed(1));
      if (url.pathname.startsWith('/api/public/') && !['GET', 'HEAD', 'OPTIONS'].includes(request.method) && response.statusCode < 400) {
        invalidatePublicWorldCache();
      }
      if (slowRequestThresholdMs && url.pathname.startsWith('/api/') && durationMs >= slowRequestThresholdMs) {
        console.warn(JSON.stringify({ level: 'warn', kind: 'slow-request', requestId, method: request.method, path: url.pathname, status: response.statusCode, durationMs, repository: config.repository, at: new Date().toISOString() }));
      }
    });
    try {
      if (url.pathname.startsWith('/api/')) await handleApi(request, response, url);
      else await serveStatic(request, response, url);
    } catch (error) {
      if (!response.headersSent) apiError(response, error.status || 500, error.status ? (error.message || 'invalid-request') : 'server-error', error.status ? '请求格式无效。' : `服务暂时不可用，请稍后重试。参考编号：${requestId}`);
      else response.destroy(error);
      if (!error.status) console.error(JSON.stringify({ level: 'error', requestId, method: request.method, path: url.pathname, error: error?.stack || String(error), at: new Date().toISOString() }));
    }
  });
}
