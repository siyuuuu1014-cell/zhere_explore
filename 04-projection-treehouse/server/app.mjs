import fs from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { config as defaultConfig } from './config.mjs';
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
const ESSENTIAL_EVENTS = new Set(['register', 'login', 'logout', 'research_consent_change', 'deletion_request', 'data_export']);
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

function validateIdentity(identity) {
  return /^\+?[0-9][0-9\s-]{7,17}$/.test(identity) || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(identity);
}

function validateEvent(event) {
  if (!event || typeof event !== 'object') return null;
  if (!/^[a-z0-9_:-]{2,80}$/i.test(String(event.event_id || ''))) return null;
  if (!/^[a-z0-9_:-]{2,80}$/i.test(String(event.raw_event || ''))) return null;
  const createdAt = Number.isNaN(Date.parse(event.created_at)) ? new Date().toISOString() : event.created_at;
  return {
    event_id: String(event.event_id),
    raw_event: String(event.raw_event),
    details: event.details && typeof event.details === 'object' ? event.details : {},
    created_at: createdAt,
    schema_version: Math.max(1, Math.min(100, Number(event.schema_version) || 1)),
    session_id: String(event.session_id || '').slice(0, 100),
    session_sequence: Math.max(0, Number(event.session_sequence) || 0),
    research_consent: Boolean(event.research_consent),
    experiment_id: String(event.experiment_id || ''),
    experiment_group: String(event.experiment_group || ''),
    derived_signals: {},
  };
}

function cleanText(value, max = 200) {
  return String(value || '').trim().slice(0, max);
}

function cleanCoordinate(value) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(-1000000, Math.min(1000000, number)) : 0;
}

function publicAssetView(asset, viewerId) {
  const { ownerId, comments = [], likedBy = [], tagRecords = [], ...publicAsset } = asset;
  return {
    ...publicAsset,
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
    owner: ownerId === viewerId ? 'me' : 'other',
    responses: responses.filter((response) => response.status !== 'deleted' && response.moderationStatus !== 'hidden').map(({ ownerId: responseOwnerId, ...response }) => ({ ...response, owner: responseOwnerId === viewerId ? 'me' : 'other' })),
  };
}

function publicRecordView(record, viewerId) {
  const { ownerId, ...publicRecord } = record;
  return { ...publicRecord, owner: ownerId === viewerId ? 'me' : 'other' };
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

  function exposeUser(user) {
    const result = publicUser(user);
    return result ? { ...result, admin: config.adminIdentities?.includes(String(user.identity || '').toLowerCase()) || false } : null;
  }

  function isAdmin(user) {
    return Boolean(user && config.adminIdentities?.includes(String(user.identity || '').toLowerCase()));
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
    const record = await repository.getSession(hashToken(token));
    if (!record || Date.parse(record.expiresAt) <= Date.now()) {
      if (record) await repository.deleteSession(record.tokenHash);
      return null;
    }
    const user = await repository.getUser(record.userId);
    return user ? { record, user } : null;
  }

  async function issueSession(response, user) {
    const token = createSessionToken();
    const maxAge = config.sessionDays * 86400;
    const session = {
      id: randomUUID(), userId: user.id, tokenHash: hashToken(token),
      createdAt: new Date().toISOString(), expiresAt: new Date(Date.now() + maxAge * 1000).toISOString(),
    };
    await repository.createSession(session);
    response.setHeader('set-cookie', sessionCookie(token, { secure: config.isProduction, maxAge }));
  }

  async function requireUser(request, response) {
    const session = await currentSession(request);
    if (!session) apiError(response, 401, 'unauthorized', '请先登录。');
    return session?.user || null;
  }

  function sameOrigin(request) {
    const origin = request.headers.origin;
    if (!origin) return true;
    try { return new URL(origin).host === request.headers.host; } catch { return false; }
  }

  async function handleApi(request, response, url) {
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
      if (!validateIdentity(identity)) return apiError(response, 400, 'invalid-identity', '请输入有效邮箱或手机号。');
      if (String(body.password || '').length < 8) return apiError(response, 400, 'weak-password', '密码至少需要 8 位。');
      if (body.password !== body.confirmPassword) return apiError(response, 400, 'password-mismatch', '两次密码不一致。');
      if (!body.ageConfirmed || !body.agreeTerms) return apiError(response, 400, 'consent-required', '请确认年龄并同意条款。');
      if (await repository.findUserByIdentity(identity)) return apiError(response, 409, 'identity-exists', '该邮箱或手机号已经注册。');
      const user = {
        id: randomUUID(), identity, username: String(body.username || '').trim().slice(0, 32),
        nickname: String(body.nickname || '').trim().slice(0, 32), spaceName: String(body.spaceName || '').trim().slice(0, 40),
        research: Boolean(body.research), passwordHash: hashPassword(String(body.password)), guest: false,
        failedLoginCount: 0, frozenUntil: null, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
      };
      if (user.username.length < 2 || !user.nickname) return apiError(response, 400, 'profile-invalid', '用户名和昵称不能为空。');
      await repository.createUser(user);
      await issueSession(response, user);
      return json(response, 201, { ok: true, user: exposeUser(user) });
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
      user.failedLoginCount = 0; user.frozenUntil = null; user.updatedAt = new Date().toISOString();
      await repository.updateUser(user);
      await issueSession(response, user);
      return json(response, 200, { ok: true, user: exposeUser(user) });
    }

    if (url.pathname === '/api/auth/guest' && request.method === 'POST') {
      const suffix = randomUUID().slice(0, 8);
      const user = {
        id: randomUUID(), identity: `guest-${suffix}@local`, username: `visitor-${suffix}`,
        nickname: '路过的风', spaceName: '礁石小窝', research: false, passwordHash: '', guest: true,
        failedLoginCount: 0, frozenUntil: null, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
      };
      await repository.createUser(user);
      await issueSession(response, user);
      return json(response, 201, { ok: true, user: exposeUser(user) });
    }

    if (url.pathname === '/api/auth/session' && request.method === 'GET') {
      const session = await currentSession(request);
      return json(response, 200, { ok: true, authenticated: Boolean(session), user: exposeUser(session?.user) });
    }

    if (url.pathname === '/api/auth/logout' && request.method === 'POST') {
      const token = parseCookies(request.headers.cookie).zhere_session;
      if (token) await repository.deleteSession(hashToken(token));
      response.setHeader('set-cookie', sessionCookie('', { secure: config.isProduction, maxAge: 0 }));
      return json(response, 200, { ok: true });
    }

    if (url.pathname === '/api/auth/forgot-password' && request.method === 'POST') {
      const body = await readJson(request, 32 * 1024);
      await repository.createPasswordReset({ id: randomUUID(), identity: normalizeIdentity(body.identity), note: String(body.note || '').slice(0, 500), createdAt: new Date().toISOString(), status: 'pending' });
      return json(response, 202, { ok: true, message: '如果账户存在，管理员会发送重置指引。' });
    }

    if (url.pathname === '/api/privacy/consent' && request.method === 'PUT') {
      const user = await requireUser(request, response); if (!user) return;
      const body = await readJson(request, 16 * 1024);
      user.research = Boolean(body.active);
      user.researchConsentUpdatedAt = new Date().toISOString();
      user.updatedAt = user.researchConsentUpdatedAt;
      await repository.updateUser(user);
      return json(response, 200, { ok: true, user: exposeUser(user) });
    }

    if (url.pathname === '/api/privacy/export' && request.method === 'GET') {
      const user = await requireUser(request, response); if (!user) return;
      const [world, assets, events, publicAssets, publicDemands, publicRecords] = await Promise.all([
        repository.getWorldState(user.id),
        repository.listMediaByUser(user.id),
        repository.allEvents(user.id),
        repository.listPublicAssets({ includeDeleted: true }),
        repository.listPublicDemands({ includeDeleted: true }),
        repository.listPublicRecords({ includeDeleted: true }),
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
      await repository.anonymizeUserData(user.id);
      user.identity = `${anonymousName}@deleted.local`;
      user.username = anonymousName;
      user.nickname = '匿名旅人';
      user.passwordHash = '';
      user.research = false;
      user.guest = true;
      user.anonymized = true;
      user.anonymizedAt = new Date().toISOString();
      user.updatedAt = user.anonymizedAt;
      await repository.updateUser(user);
      await repository.deleteSessionsByUser(user.id);
      response.setHeader('set-cookie', sessionCookie('', { secure: config.isProduction, maxAge: 0 }));
      return json(response, 200, { ok: true, anonymized: true });
    }

    if (url.pathname === '/api/public/world' && request.method === 'GET') {
      const user = await requireUser(request, response); if (!user) return;
      const snapshotAt = new Date().toISOString();
      const since = Number.isNaN(Date.parse(url.searchParams.get('since') || '')) ? null : Date.parse(url.searchParams.get('since'));
      const cursor = Math.max(0, Number(url.searchParams.get('cursor')) || 0);
      const limit = Math.max(10, Math.min(200, Number(url.searchParams.get('limit')) || 100));
      const [allAssets, allDemands, allRecords] = await Promise.all([
        repository.listPublicAssets({ includeDeleted: true }),
        repository.listPublicDemands({ includeDeleted: true }),
        repository.listPublicRecords({ includeDeleted: true }),
      ]);
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

    if (url.pathname === '/api/public/assets' && request.method === 'POST') {
      const user = await requireUser(request, response); if (!user) return;
      if (!allowPublicWrite(user.id, 'asset-publish', 20, 60 * 60_000)) return apiError(response, 429, 'rate-limited', '发布过于频繁，请稍后再试。');
      const body = await readJson(request, 128 * 1024);
      const assetId = cleanText(body.id, 80);
      if (!/^[a-z0-9_-]{2,80}$/i.test(assetId)) return apiError(response, 400, 'invalid-asset-id', '素材 ID 无效。');
      const media = await repository.getMedia(assetId);
      if (media && media.userId !== user.id) return apiError(response, 403, 'asset-owner-mismatch', '不能发布其他用户的素材文件。');
      const existing = await repository.getPublicAsset(assetId);
      if (existing && existing.ownerId !== user.id) return apiError(response, 409, 'asset-id-exists', '该素材 ID 已被使用。');
      const now = new Date().toISOString();
      const record = await repository.savePublicAsset({
        id: assetId,
        ownerId: user.id,
        ownerName: user.nickname || '匿名旅人',
        title: cleanText(body.title, 80) || '未命名素材',
        description: cleanText(body.description, 500),
        fileName: media ? cleanText(media.fileName, 180) : '',
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
      });
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
      const existing = await repository.getPublicDemand(demandId);
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
      });
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
      const demand = await repository.getPublicDemand(demandId);
      if (!demand) return apiError(response, 404, 'demand-not-found', '需求不存在。');
      if (demand.status !== 'open') return apiError(response, 409, 'demand-closed', '该需求已经关闭。');
      const body = await readJson(request, 64 * 1024);
      const text = cleanText(body.text, 500);
      const assetId = cleanText(body.assetId, 80) || null;
      if (!text && !assetId) return apiError(response, 400, 'empty-response', '请选择视频或填写回应。');
      if (assetId && !assetId.startsWith('v-') && !(await repository.getPublicAsset(assetId))) return apiError(response, 400, 'asset-not-public', '回应视频必须先发布到公共世界。');
      const record = await repository.createPublicResponse({
        id: cleanText(body.id, 80) || `response-${randomUUID()}`,
        demandId, ownerId: user.id, ownerName: user.nickname || '匿名旅人', name: user.nickname || '匿名旅人',
        text, assetId, assetTitle: cleanText(body.assetTitle, 80), status: 'published', createdAt: new Date().toISOString(), at: '刚刚',
      });
      return json(response, 201, { ok: true, response: { ...record, owner: 'me' } });
    }

    const responseItemMatch = url.pathname.match(/^\/api\/public\/demands\/([^/]+)\/responses\/([^/]+)$/);
    if (responseItemMatch && ['PATCH', 'DELETE'].includes(request.method)) {
      const user = await requireUser(request, response); if (!user) return;
      const demandId = decodeURIComponent(responseItemMatch[1]);
      const responseId = decodeURIComponent(responseItemMatch[2]);
      const demand = await repository.getPublicDemand(demandId);
      if (!demand) return apiError(response, 404, 'demand-not-found', '需求不存在。');
      if (!(demand.responses || []).some((item) => item.id === responseId)) return apiError(response, 404, 'response-not-found', '该需求下不存在这条回应。');
      if (request.method === 'DELETE') {
        const result = await repository.updatePublicResponse(responseId, user.id, { status: 'deleted' });
        if (result == null) return apiError(response, 404, 'response-not-found', '回应不存在。');
        if (!result) return apiError(response, 403, 'not-response-owner', '只能删除自己的回应。');
        return json(response, 200, { ok: true, deleted: true });
      }
      const body = await readJson(request, 32 * 1024);
      const text = cleanText(body.text, 500);
      const result = await repository.updatePublicResponse(responseId, user.id, { text });
      if (result == null) return apiError(response, 404, 'response-not-found', '回应不存在。');
      if (!result) return apiError(response, 403, 'not-response-owner', '只能修改自己的回应。');
      const { ownerId, ...publicResponse } = result;
      return json(response, 200, { ok: true, response: { ...publicResponse, owner: 'me' } });
    }

    const demandLinkMatch = url.pathname.match(/^\/api\/public\/demands\/([^/]+)\/links$/);
    if (demandLinkMatch && request.method === 'PUT') {
      const user = await requireUser(request, response); if (!user) return;
      const demandId = decodeURIComponent(demandLinkMatch[1]);
      const demand = await repository.getPublicDemand(demandId);
      if (!demand) return apiError(response, 404, 'demand-not-found', '需求不存在。');
      const body = await readJson(request, 16 * 1024);
      const assetId = cleanText(body.assetId, 80);
      if (!assetId || (!assetId.startsWith('v-') && !(await repository.getPublicAsset(assetId)))) return apiError(response, 400, 'asset-not-public', '只能关联公共素材。');
      const links = new Set(demand.assetLinks || []);
      if (body.active === false) links.delete(assetId); else links.add(assetId);
      const updated = await repository.savePublicDemand({ ...demand, assetLinks: [...links], updatedAt: new Date().toISOString() });
      return json(response, 200, { ok: true, demand: publicDemandView({ ...updated, responses: demand.responses || [] }, user.id) });
    }

    if (url.pathname === '/api/public/records' && request.method === 'POST') {
      const user = await requireUser(request, response); if (!user) return;
      if (!allowPublicWrite(user.id, 'public-record', 50)) return apiError(response, 429, 'rate-limited', '公共互动过于频繁，请稍后再试。');
      const body = await readJson(request, 64 * 1024);
      const allowedKinds = new Set(['asset_relation', 'bench_message', 'bottle_reply', 'swap_offer', 'follow']);
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
      const record = await repository.saveWorldState(user.id, body.state);
      return json(response, 200, { ok: true, version: record.version, updatedAt: record.updatedAt });
    }

    if (url.pathname === '/api/events/batch' && request.method === 'POST') {
      const user = await requireUser(request, response); if (!user) return;
      const body = await readJson(request, config.maxJsonBytes);
      const rawEvents = Array.isArray(body.events) ? body.events.slice(0, 200) : [];
      const validated = rawEvents.map((event) => ({ raw: event, event: validateEvent(event) }));
      const events = validated.map((entry) => entry.event).filter(Boolean);
      const rejectedIds = validated.filter((entry) => !entry.event && entry.raw?.event_id).map((entry) => String(entry.raw.event_id));
      if (!events.length) return json(response, 200, { ok: true, accepted: [], acknowledged: [], rejected: rejectedIds.length, rejected_ids: rejectedIds });
      const allowedEvents = user.research ? events : events.filter((event) => ESSENTIAL_EVENTS.has(event.raw_event));
      const accepted = await repository.appendEvents(user.id, allowedEvents);
      return json(response, 200, { ok: true, accepted, acknowledged: events.map((event) => event.event_id), rejected: rejectedIds.length, rejected_ids: rejectedIds });
    }

    if (url.pathname === '/api/events/recent' && request.method === 'GET') {
      const user = await requireUser(request, response); if (!user) return;
      return json(response, 200, { ok: true, events: await repository.recentEvents(user.id, 200) });
    }

    if (url.pathname === '/api/media' && request.method === 'POST') {
      const user = await requireUser(request, response); if (!user) return;
      const requestUrl = new URL(request.url || '/', `http://${request.headers.host || 'localhost'}`);
      const webRequest = new Request(requestUrl, { method: 'POST', headers: request.headers, body: request, duplex: 'half' });
      const form = await webRequest.formData();
      const file = form.get('file');
      if (!(file instanceof File) || !file.type.startsWith('video/')) return apiError(response, 400, 'invalid-media', '请选择有效视频文件。');
      if (file.size > config.maxVideoBytes) return apiError(response, 413, 'media-too-large', `视频不能超过 ${Math.floor(config.maxVideoBytes / 1024 / 1024)}MB。`);
      const assetId = String(form.get('assetId') || `u-${Date.now()}`).replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 80);
      const asset = await repository.saveMedia({
        userId: user.id, assetId, title: String(form.get('title') || file.name).slice(0, 80),
        description: String(form.get('description') || '').slice(0, 500), fileName: file.name.slice(0, 180),
        mime: file.type, bytes: Buffer.from(await file.arrayBuffer()),
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
      const bytes = await repository.readMedia(asset);
      const range = request.headers.range?.match(/^bytes=(\d*)-(\d*)$/);
      if (range) {
        const start = range[1] ? Number(range[1]) : 0;
        const end = range[2] ? Math.min(Number(range[2]), bytes.length - 1) : bytes.length - 1;
        if (!Number.isInteger(start) || !Number.isInteger(end) || start < 0 || start > end || start >= bytes.length) {
          response.writeHead(416, { 'content-range': `bytes */${bytes.length}` });
          return response.end();
        }
        const chunk = bytes.subarray(start, end + 1);
        response.writeHead(206, {
          'content-type': asset.mime || 'application/octet-stream', 'content-length': chunk.length,
          'content-range': `bytes ${start}-${end}/${bytes.length}`, 'cache-control': 'private, max-age=3600', 'accept-ranges': 'bytes',
        });
        return response.end(chunk);
      }
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
    const url = new URL(request.url || '/', `http://${request.headers.host || 'localhost'}`);
    try {
      if (url.pathname.startsWith('/api/')) await handleApi(request, response, url);
      else await serveStatic(request, response, url);
    } catch (error) {
      if (!response.headersSent) apiError(response, error.status || 500, error.message || 'server-error', error.status ? '请求格式无效。' : '服务暂时不可用。');
      else response.destroy(error);
      if (!error.status) console.error(error);
    }
  });
}
