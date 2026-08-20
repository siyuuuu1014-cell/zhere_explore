import fs from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { config as defaultConfig } from './config.mjs';
import { normalizeBidPrice } from './pricing.mjs';
import { EVENT_TYPES, deriveSignals, validateTelemetryEvent } from './event-schema.mjs';
import { receiveVideoMultipart } from './video-upload.mjs';
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
const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.mp4': 'video/mp4', '.webm': 'video/webm',
  '.woff': 'font/woff', '.woff2': 'font/woff2',
};
const PUBLIC_ROOT_EXTENSIONS = new Set(['.html', '.css', '.js']);
const PUBLIC_ASSET_EXTENSIONS = new Set([
  '.css', '.png', '.jpg', '.jpeg', '.webp', '.svg', '.gif', '.ico',
  '.mp4', '.webm', '.woff', '.woff2', '.ttf',
]);

function publicStaticTarget(appDir, encodedRelative) {
  let relative;
  try { relative = decodeURIComponent(encodedRelative) || 'index.html'; }
  catch { return null; }
  relative = relative.replaceAll('\\', '/');
  const segments = relative.split('/').filter(Boolean);
  if (!segments.length || segments.some((segment) => segment === '.' || segment === '..' || segment.startsWith('.'))) return null;
  const extension = path.extname(segments.at(-1)).toLowerCase();
  const allowed = segments.length === 1
    ? PUBLIC_ROOT_EXTENSIONS.has(extension)
    : segments[0] === 'assets' && PUBLIC_ASSET_EXTENSIONS.has(extension);
  if (!allowed) return null;
  const root = path.resolve(appDir);
  const target = path.resolve(root, ...segments);
  const contained = path.relative(root, target);
  if (!contained || contained.startsWith('..') || path.isAbsolute(contained)) return null;
  return target;
}

function sharedWorldClock(now = new Date()) {
  const date = now.toISOString().slice(0, 10);
  return {
    date,
    day: Math.floor(now.getTime() / 86400000),
    eventSeed: Number.parseInt(createHash('sha256').update(`zhere-world:${date}`).digest('hex').slice(0, 8), 16),
    version: `world-${date}`,
  };
}

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

function validateIdentity(identity) {
  return /^1[3-9]\d{9}$/.test(identity) || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(identity);
}

function internalUsername(identity) {
  return `user-${createHash('sha256').update(identity).digest('hex').slice(0, 12)}`;
}

function cleanText(value, max = 200) {
  return String(value || '').trim().slice(0, max);
}

function cleanAvatarImage(value) {
  const image = String(value || '').trim();
  if (!image) return '';
  if (image.length > 48 * 1024 || !/^data:image\/(?:png|jpeg|webp);base64,[a-z0-9+/=]+$/i.test(image)) return null;
  return image;
}

function cleanCoordinate(value) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(-1000000, Math.min(1000000, number)) : 0;
}

const DEMAND_ASPECT_RATIOS = new Set(['16:9', '9:16', '4:3', '3:4', '1:1', 'other']);
const DEMAND_RESOLUTIONS = new Set(['1080p', '720p', '4K', '2K', '480p', 'other']);

function normalizeDemandDate(value) {
  const timestamp = Date.parse(String(value || ''));
  return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : '';
}

function normalizeDemandInput(body, existing = {}) {
  const source = { ...existing, ...body };
  const type = source.type === 'commerce' ? 'commerce' : 'personal';
  const aspectRatioPreset = DEMAND_ASPECT_RATIOS.has(source.aspectRatioPreset) ? source.aspectRatioPreset : '';
  const resolutionPreset = DEMAND_RESOLUTIONS.has(source.resolutionPreset) ? source.resolutionPreset : '';
  const activityName = cleanText(source.activityName, 80);
  const cooperationDescription = cleanText(source.cooperationDescription, 1000);
  return {
    type,
    title: type === 'commerce' ? activityName : cleanText(source.title, 80),
    theme: type === 'personal' ? cleanText(source.theme, 80) : '',
    description: type === 'commerce' ? cooperationDescription : cleanText(source.description, 1000),
    durationSeconds: type === 'personal' ? sanitizeOptionalNumber(source.durationSeconds, { min: 1, max: 86400, integer: true }) : null,
    aspectRatioPreset: type === 'personal' ? aspectRatioPreset : '',
    aspectRatio: type === 'personal' ? cleanText(aspectRatioPreset === 'other' ? source.aspectRatioOther : aspectRatioPreset, 32) : '',
    resolutionPreset: type === 'personal' ? resolutionPreset : '',
    resolution: type === 'personal' ? cleanText(resolutionPreset === 'other' ? source.resolutionOther : resolutionPreset, 32) : '',
    priceAmount: sanitizeOptionalNumber(source.priceAmount, { min: 1, max: 1000000 }),
    priceRole: type === 'commerce' ? 'budget' : 'quote',
    priceUnit: 'inspiration_coin',
    pricingSignalEligible: true,
    companyName: type === 'commerce' ? cleanText(source.companyName, 120) : '',
    activityName: type === 'commerce' ? activityName : '',
    cooperationScope: type === 'commerce' ? cleanText(source.cooperationScope, 240) : '',
    region: type === 'commerce' ? cleanText(source.region, 120) : '',
    skillRequirements: type === 'commerce' ? cleanText(source.skillRequirements, 1000) : '',
    cooperationDescription: type === 'commerce' ? cooperationDescription : '',
    startAt: normalizeDemandDate(source.startAt),
    endAt: normalizeDemandDate(source.endAt),
    timezone: 'Asia/Shanghai',
  };
}

function validateDemandInput(demand) {
  if (demand.type === 'personal') {
    if (!demand.title) return ['demand-title-required', '请填写需求标题。'];
    if (!demand.theme) return ['demand-theme-required', '请填写素材主题。'];
    if (!demand.description) return ['demand-description-required', '请填写详细描述。'];
    if (!demand.durationSeconds) return ['demand-duration-required', '请填写大于 0 的素材时长。'];
    if (!demand.aspectRatioPreset || !demand.aspectRatio) return ['demand-aspect-ratio-required', '请选择尺寸；选择其他时还需填写自定义尺寸。'];
    if (!demand.resolutionPreset || !demand.resolution) return ['demand-resolution-required', '请选择分辨率；选择其他时还需填写自定义分辨率。'];
  } else {
    if (!demand.companyName) return ['demand-company-required', '请填写公司名称。'];
    if (!demand.activityName) return ['demand-activity-required', '请填写活动名称。'];
    if (!demand.cooperationScope) return ['demand-scope-required', '请填写合作范围。'];
    if (!demand.region) return ['demand-region-required', '请填写所在地区。'];
    if (!demand.skillRequirements) return ['demand-skills-required', '请填写技能需求。'];
    if (!demand.cooperationDescription) return ['demand-cooperation-description-required', '请填写合作描述。'];
  }
  if (!demand.priceAmount) return ['demand-price-required', `请填写大于 0 的${demand.type === 'commerce' ? '预算' : '报价'}。`];
  if (!demand.startAt || !demand.endAt) return ['demand-time-required', '请填写开始时间和结束时间。'];
  if (Date.parse(demand.startAt) >= Date.parse(demand.endAt)) return ['demand-time-order', '结束时间必须晚于开始时间。'];
  return null;
}

// 客户端上传的可选媒体元数据字段：非有限、越界或空值一律置 null，避免污染事实表。
function sanitizeOptionalNumber(value, { min = 0, max, integer = false } = {}) {
  if (value == null || value === '') return null;
  const number = Number(value);
  if (!Number.isFinite(number) || number < min || number > max) return null;
  return integer ? Math.round(number) : number;
}

// 规范化 JSON：递归按键排序，让同一份数据集在不同进程间得到可复现的 sha256。
function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

// 把已接受的事件流投影到研究事实表。投影失败只告警，不影响事件本体已持久化的结果。
async function projectResearchEvents(repository, events, userId, subjectId) {
  for (const event of events) {
    const details = event.details && typeof event.details === 'object' ? event.details : {};
    try {
      if (event.raw_event === 'recommendation_request') {
        await repository.appendRecommendationRequest({
          request_id: details.request_id,
          user_id: userId,
          subject_id: subjectId,
          created_at: event.created_at,
          zone_slots: Number.isFinite(Number(details.zone_slots)) ? Number(details.zone_slots) : null,
          candidate_count: Array.isArray(details.candidates) ? details.candidates.length : 0,
          details_json: JSON.stringify(details),
        });
        if (Array.isArray(details.candidates)) {
          await repository.appendRecommendationCandidates(details.candidates.map((candidate, index) => ({
            request_id: details.request_id,
            rank: Number(candidate.rank) || index + 1,
            asset_id: candidate.asset_id,
            zone_id: candidate.zone_id || null,
            spawn_source: candidate.spawn_source || null,
            recommendation_score: Number.isFinite(Number(candidate.recommendation_score)) ? Number(candidate.recommendation_score) : null,
            chosen: Boolean(candidate.chosen),
            subject_id: subjectId,
            created_at: event.created_at,
          })));
        }
      } else if (event.raw_event === 'impression_batch') {
        if (Array.isArray(details.impressions)) {
          await repository.appendRecommendationImpressions(details.impressions.map((impression) => ({
            impression_id: impression.impression_id,
            impression_batch_id: impression.impression_batch_id || details.impression_batch_id || null,
            recommendation_request_id: impression.recommendation_request_id || details.recommendation_request_id || null,
            asset_id: impression.asset_id,
            zone_id: impression.zone_id || null,
            spawn_source: impression.spawn_source || null,
            rank: Number(impression.rank) || null,
            recommendation_score: Number.isFinite(Number(impression.recommendation_score)) ? Number(impression.recommendation_score) : null,
            visibility_duration_ms: Number.isFinite(Number(impression.visibility_duration_ms)) ? Number(impression.visibility_duration_ms) : null,
            distance_to_player: Number.isFinite(Number(impression.distance_to_player)) ? Number(impression.distance_to_player) : null,
            experiment_id: impression.experiment_id || event.experiment_id || null,
            experiment_group: impression.experiment_group || event.experiment_group || null,
            subject_id: subjectId,
            created_at: event.created_at,
          })));
        }
      } else if (event.raw_event === 'bid_attempt' || event.raw_event === 'bid_abandon' || event.raw_event === 'bid_validation_failed') {
        await repository.appendBidAttempts([{
          event_id: event.event_id,
          user_id: userId,
          subject_id: subjectId,
          asset_id: details.asset_id,
          attempt_kind: event.raw_event,
          reason: details.reason || null,
          open_duration_ms: Number.isFinite(Number(details.open_duration_ms)) ? Number(details.open_duration_ms) : null,
          created_at: event.created_at,
        }]);
      }
    } catch (error) {
      console.warn(`research projection failed for ${event.raw_event} ${event.event_id}: ${error.message}`);
    }
  }
}

async function readVideoMultipart(request, config) {
  const received = await receiveVideoMultipart(request, {
    maxVideoBytes: config.maxVideoBytes,
    tempDir: path.join(config.dataDir, 'upload-tmp'),
  });
  const form = { get: (name) => received.fields.get(name) ?? null };
  const file = received.file;
  const assetId = cleanText(form.get('assetId') || `u-${randomUUID()}`, 80).replace(/[^a-zA-Z0-9_-]/g, '');
  if (!/^[a-z0-9_-]{2,80}$/i.test(assetId)) {
    await received.cleanup();
    throw Object.assign(new Error('invalid-asset-id'), { status: 400, publicMessage: '素材 ID 无效。' });
  }
  return {
    form, file, assetId, cleanup: received.cleanup,
    mediaInput: {
      assetId,
      title: cleanText(form.get('title') || file.fileName, 80),
      description: cleanText(form.get('description'), 500),
      fileName: cleanText(file.fileName, 180),
      mime: file.mime,
      filePath: file.path,
      size: file.size,
      // 可选媒体元数据：客户端用临时 video 元素提取；非法或缺失时置 null。
      mediaDurationSec: sanitizeOptionalNumber(form.get('media_duration_sec'), { max: 86400 }),
      mediaWidth: sanitizeOptionalNumber(form.get('media_width'), { max: 16384, integer: true }),
      mediaHeight: sanitizeOptionalNumber(form.get('media_height'), { max: 16384, integer: true }),
      mediaBitrateKbps: sanitizeOptionalNumber(form.get('media_bitrate_kbps'), { max: 1e9, integer: true }),
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
    tagStats: tagRecords.map((record) => ({
      tag: record.tag,
      count: new Set(record.userIds || []).size,
      selected: (record.userIds || []).includes(viewerId),
    })),
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
  const payload = publicRecord.payload && typeof publicRecord.payload === 'object' ? { ...publicRecord.payload } : publicRecord.payload;
  if (payload) delete payload.targetUserId;
  return { ...publicRecord, payload, owner: ownerId === viewerId ? 'me' : 'other' };
}

function publicRecordVisibleTo(record, viewerId) {
  if (!record || record.status === 'deleted' || record.moderationStatus === 'hidden') return false;
  if (record.kind === 'content_rating') return record.ownerId === viewerId;
  if (record.kind === 'content_share') return record.ownerId === viewerId || record.payload?.targetUserId === viewerId;
  return true;
}

function stablePublicRecordId(kind, ...parts) {
  return `${kind}-${createHash('sha256').update(parts.map(String).join('|')).digest('hex').slice(0, 32)}`;
}

async function notificationFeed(repository, viewerId) {
  const [assets, demands, records] = await Promise.all([
    repository.listPublicAssetsByOwner(viewerId, { includeDeleted: true }),
    repository.listPublicDemandsByOwner(viewerId, { includeDeleted: true }),
    repository.listPublicRecords({ includeDeleted: true }),
  ]);
  const transactions = await repository.listValidTransactionsForMaterials(assets.map((asset) => asset.id));
  const spaceByOwner = new Map(records
    .filter((record) => record.kind === 'space_snapshot' && record.status !== 'deleted')
    .map((record) => [record.ownerId, record.payload?.spaceId || record.id]));
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
  records.filter((record) => record.status !== 'deleted' && record.ownerId !== viewerId && record.payload?.targetUserId === viewerId).forEach((record) => {
    if (record.kind === 'follow') push({
      id: `follow:${record.id}`, kind: 'follow', title: '小径上多了一位熟人',
      summary: `${record.ownerName || record.name || '一位旅人'}关注了你的小窝`, targetType: 'neighbor', targetId: spaceByOwner.get(record.ownerId) || '', createdAt: record.createdAt,
    });
    if (record.kind === 'space_message') push({
      id: `space-message:${record.id}`, kind: 'space_message', title: '小窝门口收到一张纸条',
      summary: `${record.ownerName || record.name || '一位旅人'}留下了来访纸条`, targetType: 'neighbor', targetId: spaceByOwner.get(record.ownerId) || '', createdAt: record.createdAt,
    });
    if (record.kind === 'content_share') push({
      id: `content-share:${record.id}`, kind: 'content_share', title: '有人递来一条内容线索',
      summary: `${record.ownerName || record.name || '一位旅人'}分享了${record.payload?.targetType === 'demand' ? '一张需求' : '一段素材'}`,
      targetType: record.payload?.targetType || 'record', targetId: record.payload?.targetId || record.id, createdAt: record.createdAt,
    });
  });
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
  let guestCleanup = null;
  let lastGuestCleanupAt = 0;
  let activeVideoUploads = 0;
  const marketInsightMinSample = Math.max(3, Number(config.marketInsightMinSample) || 5);
  const guestCleanupIntervalMs = Math.max(60_000, Number(config.guestCleanupIntervalMs) || 6 * 60 * 60 * 1000);
  const maxConcurrentVideoUploads = Math.max(1, Math.floor(Number(config.maxConcurrentVideoUploads) || 2));

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

  async function ensureDefaultResearchCollection(user) {
    if (user.research === true) return user;
    user.research = true;
    user.researchConsentUpdatedAt = new Date().toISOString();
    user.updatedAt = user.researchConsentUpdatedAt;
    await repository.updateUser(user);
    await recordConsent(user, true, 'collection-policy-default');
    return user;
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
    if (rateBuckets.size > 10_000) {
      for (const [bucketKey, timestamps] of rateBuckets) {
        if (!timestamps.some((timestamp) => now - timestamp < 24 * 60 * 60 * 1000)) rateBuckets.delete(bucketKey);
        if (rateBuckets.size <= 8_000) break;
      }
    }
    return true;
  }

  function clientAddress(request) {
    if (config.trustProxy) {
      const forwarded = String(request.headers['x-forwarded-for'] || '').split(',')[0].trim();
      if (forwarded) return forwarded.slice(0, 80);
    }
    return String(request.socket?.remoteAddress || 'unknown').slice(0, 80);
  }

  function allowAnonymousRequest(request, scope, { ipLimit, deviceLimit, windowMs }) {
    if (config.authRateLimitEnabled === false || (!config.isProduction && config.authRateLimitEnabled == null)) return true;
    const ip = clientAddress(request);
    const agent = String(request.headers['user-agent'] || '').slice(0, 256);
    const device = createHash('sha256').update(`${ip}|${agent}`).digest('hex').slice(0, 24);
    return allowPublicWrite(`ip:${ip}`, scope, ipLimit, windowMs)
      && allowPublicWrite(`device:${device}`, scope, deviceLimit, windowMs);
  }

  function tryStartVideoUpload() {
    if (activeVideoUploads >= maxConcurrentVideoUploads) return null;
    activeVideoUploads += 1;
    let released = false;
    return () => {
      if (released) return;
      released = true;
      activeVideoUploads = Math.max(0, activeVideoUploads - 1);
    };
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
        await repository.deleteSession(record.tokenHash).catch((error) => console.warn('Expired session deletion failed:', error.message));
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

  function maybeCleanupExpiredGuests() {
    if (typeof repository.listAllUsers !== 'function'
      || typeof repository.anonymizeUserData !== 'function'
      || typeof repository.deleteSessionsByUser !== 'function') return;
    const now = Date.now();
    if (guestCleanup || now - lastGuestCleanupAt < guestCleanupIntervalMs) return;
    lastGuestCleanupAt = now;
    guestCleanup = (async () => {
      const expired = (await repository.listAllUsers())
        .filter((user) => user.guest === true && !user.guestExpired && Date.parse(user.guestExpiresAt || '') <= now)
        .slice(0, Math.max(1, Number(config.guestCleanupBatchSize) || 25));
      for (const user of expired) {
        const anonymized = await repository.anonymizeUserData(user.id);
        const anonymousId = anonymized?.anonymousId || `anonymous-${randomUUID()}`;
        await repository.deleteSessionsByUser(user.id);
        user.identity = `${anonymousId}@expired.local`;
        user.username = anonymousId;
        user.nickname = '过期访客';
        user.spaceName = '已归档小窝';
        user.passwordHash = '';
        user.guest = false;
        user.guestExpired = true;
        user.guestExpiredAt = new Date(now).toISOString();
        user.updatedAt = user.guestExpiredAt;
        await repository.updateUser(user);
      }
      if (expired.length) console.info(JSON.stringify({ level: 'info', kind: 'guest_cleanup', removed_access: expired.length, at: new Date().toISOString() }));
    })().catch((error) => console.warn('Expired guest cleanup failed:', error.message))
      .finally(() => { guestCleanup = null; });
  }

  function secureSessionCookie(request) {
    if (config.sessionCookieSecure === 'true') return true;
    if (config.sessionCookieSecure === 'false') return false;
    if (request.socket?.encrypted) return true;
    return String(request.headers['x-forwarded-proto'] || '').split(',')[0].trim().toLowerCase() === 'https';
  }

  async function issueSession(request, response, user, { subject: suppliedSubject = null } = {}) {
    await ensureDefaultResearchCollection(user);
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
        research_allowed: true, entry_surface: 'web_game', client_version: 'formal-v4', schema_version: '1',
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
    maybeCleanupExpiredGuests();
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

    if (url.pathname === '/api/config' && request.method === 'GET') {
      return json(response, 200, {
        ok: true,
        limits: {
          maxVideoBytes: config.maxVideoBytes,
          maxVideoMegabytes: Math.max(1, Math.floor(config.maxVideoBytes / 1024 / 1024)),
        },
      });
    }

    if (url.pathname === '/api/auth/register' && request.method === 'POST') {
      if (!allowAnonymousRequest(request, 'auth-register', { ipLimit: 20, deviceLimit: 8, windowMs: 60 * 60_000 })) {
        response.setHeader('retry-after', '3600');
        return apiError(response, 429, 'rate-limited', '注册请求过于频繁，请稍后再试。');
      }
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
        avatar: 0, avatarImage: '', bio: '',
        research: true, passwordHash: hashPassword(String(body.password)), guest: false,
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
      const bootstrap = existingUser ? await sessionBootstrap(user) : { state: null, version: 0 };
      return json(response, existingUser ? 200 : 201, { ok: true, resumed: Boolean(existingUser), user: exposeUser(user), ...bootstrap });
    }

    if (url.pathname === '/api/auth/login' && request.method === 'POST') {
      if (!allowAnonymousRequest(request, 'auth-login', { ipLimit: 60, deviceLimit: 20, windowMs: 15 * 60_000 })) {
        response.setHeader('retry-after', '900');
        return apiError(response, 429, 'rate-limited', '登录尝试过于频繁，请稍后再试。');
      }
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
      if (!allowAnonymousRequest(request, 'auth-guest', { ipLimit: 30, deviceLimit: 12, windowMs: 60 * 60_000 })) {
        response.setHeader('retry-after', '3600');
        return apiError(response, 429, 'rate-limited', '访客进入过于频繁，请稍后再试。');
      }
      const body = await readJson(request, 4 * 1024);
      const suppliedKey = String(body.guest_key || '').trim();
      const safeKey = /^[A-Za-z0-9-]{16,80}$/.test(suppliedKey) ? suppliedKey : randomUUID();
      const suffix = createHash('sha256').update(safeKey).digest('hex').slice(0, 16);
      const identity = `guest-${suffix}@local`;
      let user = await repository.findUserByIdentity(identity);
      if (user && !user.guest) return apiError(response, 409, 'guest-identity-conflict', '访客身份发生冲突，请刷新后重试。');
      if (!user) {
        user = {
          id: randomUUID(), identity, username: `visitor-${suffix.slice(0, 8)}`,
          nickname: '路过的风', spaceName: '礁石小窝', research: true, passwordHash: '', guest: true,
          failedLoginCount: 0, frozenUntil: null, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
          guestExpiresAt: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString(),
        };
        user.researchSubjectId = `rs-${randomUUID()}`;
        const [, subject] = await Promise.all([
          repository.createUser(user),
          ensureResearchIdentity(user, { skipLookup: true }),
        ]);
        await Promise.all([
          recordConsent(user, true, 'guest-registration', { subject, skipLookup: true }),
          issueSession(request, response, user, { subject }),
        ]);
        return json(response, 201, { ok: true, resumed: false, user: exposeUser(user), state: null, version: 0 });
      }
      user.updatedAt = new Date().toISOString();
      user.guestExpiresAt = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString();
      const [, bootstrap] = await Promise.all([
        issueSession(request, response, user),
        sessionBootstrap(user),
      ]);
      return json(response, 200, { ok: true, resumed: true, user: exposeUser(user), ...bootstrap });
    }

    if (url.pathname === '/api/auth/session' && request.method === 'GET') {
      const session = await currentSession(request);
      return json(response, 200, {
        ok: true,
        worldClock: sharedWorldClock(),
        authenticated: Boolean(session),
        user: exposeUser(session?.user),
        ...(session ? await sessionBootstrap(session.user) : {}),
      });
    }

    if (url.pathname === '/api/profile' && request.method === 'PUT') {
      const user = await requireUser(request, response); if (!user) return;
      const body = await readJson(request, 128 * 1024);
      const nickname = cleanText(body.nickname, 32);
      const spaceName = cleanText(body.spaceName, 40);
      const avatarImage = cleanAvatarImage(body.avatarImage);
      if (!nickname) return apiError(response, 400, 'profile-invalid', '昵称不能为空。');
      if (avatarImage === null) return apiError(response, 400, 'avatar-invalid', '头像格式无效或图片数据过大。');
      user.nickname = nickname;
      if (spaceName) user.spaceName = spaceName;
      user.bio = cleanText(body.bio, 120);
      user.avatar = Math.max(0, Math.min(12, Number(body.avatar) || 0));
      user.avatarImage = avatarImage;
      user.updatedAt = new Date().toISOString();
      await repository.updateUser(user);
      return json(response, 200, { ok: true, user: exposeUser(user) });
    }

    if (url.pathname === '/api/auth/logout' && request.method === 'POST') {
      response.setHeader('set-cookie', sessionCookie('', { secure: secureSessionCookie(request), maxAge: 0 }));
      const token = parseCookies(request.headers.cookie).zhere_session;
      if (token) {
        const tokenHash = hashToken(token);
        const record = await repository.getSession(tokenHash).catch((error) => {
          console.warn('Logout session lookup failed:', error.message);
          return sessionCache.get(tokenHash)?.record || null;
        });
        const cleanup = await Promise.allSettled([
          record?.id ? repository.endResearchSession(record.id, new Date().toISOString(), 'logout') : Promise.resolve(),
          repository.deleteSession(tokenHash),
        ]);
        cleanup.filter((result) => result.status === 'rejected').forEach((result) => console.warn('Logout session cleanup failed:', result.reason?.message || result.reason));
        sessionCache.delete(tokenHash);
      }
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
      await readJson(request, 16 * 1024);
      await ensureDefaultResearchCollection(user);
      return apiError(response, 409, 'collection-policy-fixed', '页面活动会按隐私说明记录；你仍可导出数据或申请删除并匿名化。');
    }

    if (url.pathname === '/api/privacy/research-status' && request.method === 'GET') {
      const user = await requireUser(request, response); if (!user) return;
      const health = await repository.getResearchHealth(user.id);
      const latestEventAgeMs = health.lastEventAt ? Math.max(0, Date.now() - Date.parse(health.lastEventAt)) : null;
      const collecting = Boolean(health.subjectReady);
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
        records: pageRecords.filter((record) => publicRecordVisibleTo(record, user.id)).map((record) => publicRecordView(record, user.id)),
        deletedAssetIds: pageAssets.filter((asset) => asset.status !== 'published' || asset.moderationStatus === 'hidden').map((asset) => asset.id),
        deletedDemandIds: pageDemands.filter((demand) => demand.status === 'deleted' || demand.moderationStatus === 'hidden').map((demand) => demand.id),
        deletedRecordIds: pageRecords.filter((record) => !publicRecordVisibleTo(record, user.id)).map((record) => record.id),
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
      // 最近的不可变基础价版本历史（倒序，最多 50 条）。
      const basePriceHistory = (await repository.listBasePriceVersions(materialId))
        .sort((a, b) => Number(a.version) - Number(b.version))
        .slice(-50)
        .reverse();
      return json(response, 200, { ok: true, pricing, insight, base_price_transaction_count: config.basePriceTransactionCount, base_price_history: basePriceHistory });
    }

    if (url.pathname === '/api/admin/pricing/export.csv' && request.method === 'GET') {
      const user = await requireUser(request, response); if (!user) return;
      if (!isAdmin(user)) return apiError(response, 403, 'admin-required', '需要管理员权限。');
      const [pricing, assets] = await Promise.all([repository.listAllPricing(), repository.listPublicAssets({ includeDeleted: true })]);
      const transactionsByBid = new Map(pricing.transactions.map((transaction) => [transaction.bid_id, transaction]));
      const basePricesByMaterial = new Map(pricing.basePrices.map((item) => [item.material_id, item]));
      const assetsById = new Map(assets.map((asset) => [asset.id, asset]));
      // 每笔成交对应其最新的不可变基础价版本行（formation 行 transaction_id 为空，不参与匹配）。
      const versionByTransaction = new Map();
      for (const version of pricing.basePriceVersions || []) {
        if (!version.transaction_id) continue;
        const existing = versionByTransaction.get(version.transaction_id);
        if (!existing || Number(version.version) > Number(existing.version)) versionByTransaction.set(version.transaction_id, version);
      }
      const rows = [[
        'bid_id', 'transaction_id', 'material_id', 'user_id', 'timestamp', 'bid_price', 'counter_price', 'transaction_price', 'bid_status', 'is_valid',
        'base_price', 'base_price_valid_transaction_count', 'base_price_formed_at', 'base_price_sample_transaction_ids',
        'base_price_version', 'base_price_version_formed_at',
        'quality_score', 'heat_score', 'scarcity_score', 'training_value_score',
      ]];
      for (const bid of pricing.bids.sort((a, b) => String(a.bid_time).localeCompare(String(b.bid_time)))) {
        const transaction = transactionsByBid.get(bid.bid_id);
        const basePrice = basePricesByMaterial.get(bid.material_id);
        const asset = assetsById.get(bid.material_id) || {};
        const transactionVersion = transaction ? versionByTransaction.get(transaction.transaction_id) : null;
        rows.push([
          bid.bid_id, transaction?.transaction_id ?? '', bid.material_id, bid.user_id, bid.bid_time, bid.bid_price, bid.counter_price ?? '',
          transaction?.transaction_price ?? '', bid.bid_status, transaction?.is_valid ?? '', basePrice?.base_price ?? '',
          basePrice?.valid_transaction_count ?? '', basePrice?.formed_at ?? '', (basePrice?.sample_transaction_ids || []).join('|'),
          transactionVersion?.version ?? '', transactionVersion?.formed_at ?? '',
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

    if (url.pathname === '/api/admin/research/recommendations.csv' && request.method === 'GET') {
      const user = await requireUser(request, response); if (!user) return;
      if (!isAdmin(user)) return apiError(response, 403, 'admin-required', '需要管理员权限。');
      const [requests, candidates, recommendationImpressions] = await Promise.all([
        repository.listRecommendationRequests(),
        repository.listRecommendationCandidates(),
        repository.listRecommendationImpressions(),
      ]);
      const candidatesByRequest = Map.groupBy(candidates, (item) => item.request_id);
      const impressionsByRequest = Map.groupBy(recommendationImpressions, (item) => item.recommendation_request_id || '');
      const rows = [[
        'request_id', 'subject_id', 'request_created_at', 'zone_slots', 'candidate_count',
        'rank', 'asset_id', 'zone_id', 'spawn_source', 'recommendation_score', 'chosen',
        'impression_id', 'impression_batch_id', 'visibility_duration_ms', 'distance_to_player', 'experiment_id', 'experiment_group',
      ]];
      for (const request of requests.sort((a, b) => String(a.request_id).localeCompare(String(b.request_id)))) {
        const requestCandidates = (candidatesByRequest.get(request.request_id) || []).sort((a, b) => Number(a.rank) - Number(b.rank));
        const impressionsByAsset = new Map((impressionsByRequest.get(request.request_id) || []).map((item) => [item.asset_id, item]));
        for (const candidate of requestCandidates) {
          const impression = impressionsByAsset.get(candidate.asset_id) || {};
          rows.push([
            request.request_id, request.subject_id || '', request.created_at || '', request.zone_slots ?? '', request.candidate_count ?? '',
            candidate.rank ?? '', candidate.asset_id || '', candidate.zone_id || '', candidate.spawn_source || '', candidate.recommendation_score ?? '',
            candidate.chosen ?? '', impression.impression_id || '', impression.impression_batch_id || '', impression.visibility_duration_ms ?? '',
            impression.distance_to_player ?? '', impression.experiment_id || '', impression.experiment_group || '',
          ]);
        }
      }
      return csv(response, `zhere-recommendations-${new Date().toISOString().slice(0, 10)}.csv`, rows);
    }

    if (url.pathname === '/api/admin/research/snapshot' && request.method === 'GET') {
      const user = await requireUser(request, response); if (!user) return;
      if (!isAdmin(user)) return apiError(response, 403, 'admin-required', '需要管理员权限。');
      const [events, pricing, requests, candidates, recommendationImpressions, bidAttempts] = await Promise.all([
        repository.listAllEvents(),
        repository.listAllPricing(),
        repository.listRecommendationRequests(),
        repository.listRecommendationCandidates(),
        repository.listRecommendationImpressions(),
        repository.listBidAttempts(),
      ]);
      const recent = (items, field) => items.slice().sort((a, b) => String(a[field]).localeCompare(String(b[field]))).slice(-5000);
      const recommendation = {
        requests: recent(requests, 'created_at'),
        candidates: recent(candidates, 'created_at'),
        impressions: recent(recommendationImpressions, 'created_at'),
      };
      const pricingSnapshot = {
        bids: recent(pricing.bids || [], 'bid_time'),
        transactions: recent(pricing.transactions || [], 'transaction_time'),
        base_price_versions: recent(pricing.basePriceVersions || [], 'created_at'),
      };
      const bidAttemptsSnapshot = recent(bidAttempts, 'created_at');
      const counts = {
        events: events.length,
        recommendation_requests: requests.length,
        recommendation_candidates: candidates.length,
        recommendation_impressions: recommendationImpressions.length,
        bids: pricing.bids?.length || 0,
        transactions: pricing.transactions?.length || 0,
        base_price_versions: pricing.basePriceVersions?.length || 0,
        bid_attempts: bidAttempts.length,
      };
      const hash = createHash('sha256')
        .update(canonicalJson({ recommendation, pricing: pricingSnapshot, bid_attempts: bidAttemptsSnapshot }))
        .digest('hex')
        .slice(0, 16);
      return json(response, 200, {
        ok: true, generated_at: new Date().toISOString(), research_schema: 'v1', hash, counts,
        recommendation, pricing: pricingSnapshot, bid_attempts: bidAttemptsSnapshot,
      });
    }

    if (url.pathname === '/api/admin/research/health' && request.method === 'GET') {
      const user = await requireUser(request, response); if (!user) return;
      if (!isAdmin(user)) return apiError(response, 403, 'admin-required', '需要管理员权限。');
      const [events, pricing, requests, candidates, recommendationImpressions, bidAttempts, media] = await Promise.all([
        repository.listAllEvents(),
        repository.listAllPricing(),
        repository.listRecommendationRequests(),
        repository.listRecommendationCandidates(),
        repository.listRecommendationImpressions(),
        repository.listBidAttempts(),
        repository.listAllMedia(),
      ]);
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
      const latestEventAgeHours = lastEventAt ? Number(((Date.now() - Date.parse(lastEventAt)) / 3600000).toFixed(2)) : null;
      const eventsLast24h = events.filter((event) => event.created_at && Date.now() - Date.parse(event.created_at) <= 24 * 3600000).length;
      const requestIds = new Set(requests.map((item) => item.request_id));
      const impressionsByRequestId = Map.groupBy(recommendationImpressions, (item) => item.recommendation_request_id || '');
      const requestsWithoutImpressions = requests.filter((item) => !(impressionsByRequestId.get(item.request_id)?.length)).map((item) => item.request_id);
      const impressionsWithoutRequest = recommendationImpressions.filter((item) => !requestIds.has(item.recommendation_request_id)).length;
      const bidAttemptCount = bidAttempts.filter((item) => item.attempt_kind === 'bid_attempt').length;
      const bidAbandonCount = bidAttempts.filter((item) => item.attempt_kind === 'bid_abandon').length;
      const bidValidationFailedCount = bidAttempts.filter((item) => item.attempt_kind === 'bid_validation_failed').length;
      return json(response, 200, {
        ok: true, checked_at: new Date().toISOString(),
        summary: {
          event_count: events.length, impression_count: impressions.length, attributed_event_count: attributedEvents.length,
          orphan_attribution_count: orphanAttributions.length, unknown_event_count: unknownEvents.length,
          bid_count: pricing.bids?.length || 0, transaction_count: pricing.transactions?.length || 0,
          valid_transaction_count: (pricing.transactions || []).filter((item) => item.is_valid === true).length,
          duplicate_valid_purchase_group_count: duplicatePurchases.length, last_event_at: lastEventAt,
          recommendation_request_count: requests.length,
          recommendation_candidate_count: candidates.length,
          recommendation_impression_count: recommendationImpressions.length,
          impression_row_count: recommendationImpressions.length,
          bid_attempt_count: bidAttemptCount,
          bid_abandon_count: bidAbandonCount,
          bid_validation_failed_count: bidValidationFailedCount,
          events_last_24h: eventsLast24h,
          latest_event_age_h: latestEventAgeHours,
          media_without_metadata_count: media.filter((item) => Number(item.size) > 0 && item.media_duration_sec == null).length,
        },
        event_type_counts: eventTypeCounts,
        issues: {
          duplicate_valid_purchases: duplicatePurchases.slice(0, 100),
          orphan_attribution_event_ids: orphanAttributions.slice(0, 100).map((event) => event.event_id),
          unknown_event_types: [...new Set(unknownEvents.map((event) => event.raw_event))],
          recommendation_requests_without_impressions: requestsWithoutImpressions.slice(0, 100),
          impressions_without_request: impressionsWithoutRequest,
          stale_events_alert: latestEventAgeHours != null && latestEventAgeHours > 24,
          impression_coverage_alert: recommendationImpressions.length < requests.length ? requestsWithoutImpressions.length : 0,
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
      const releaseUpload = tryStartVideoUpload();
      if (!releaseUpload) return apiError(response, 503, 'upload-busy', '当前上传人数较多，请稍后再试。');
      let upload;
      try {
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
          media: {
            id: media.id, fileName: media.fileName, mime: media.mime, size: media.size,
            mediaUrl: `/api/media/${encodeURIComponent(media.id)}`,
            media_duration_sec: media.media_duration_sec ?? null, media_width: media.media_width ?? null,
            media_height: media.media_height ?? null, media_bitrate_kbps: media.media_bitrate_kbps ?? null,
          },
        });
      } finally {
        await upload?.cleanup?.();
        releaseUpload();
      }
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
      const demandInput = normalizeDemandInput(body, existing || {});
      const demandError = validateDemandInput(demandInput);
      if (demandError) return apiError(response, 400, demandError[0], demandError[1]);
      const now = new Date().toISOString();
      const record = await repository.savePublicDemand({
        ...(existing || {}), id: demandId, ownerId: user.id, ownerName: user.nickname || '匿名旅人', by: user.nickname || '匿名旅人',
        ...demandInput,
        status: ['open', 'closed'].includes(body.status) ? body.status : existing?.status || 'open',
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
      const demandContentFields = ['type', 'title', 'theme', 'description', 'durationSeconds', 'aspectRatioPreset', 'aspectRatioOther', 'resolutionPreset', 'resolutionOther', 'priceAmount', 'companyName', 'activityName', 'cooperationScope', 'region', 'skillRequirements', 'cooperationDescription', 'startAt', 'endAt'];
      const editsDemandContent = demandContentFields.some((field) => Object.hasOwn(body, field));
      const demandInput = editsDemandContent ? normalizeDemandInput(body, existing) : null;
      const demandError = demandInput ? validateDemandInput(demandInput) : null;
      if (demandError) return apiError(response, 400, demandError[0], demandError[1]);
      const updated = await repository.savePublicDemand({
        ...existing,
        ...(demandInput || {}),
        ...(body.status != null && ['open', 'closed'].includes(body.status) ? { status: body.status } : {}),
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
      const allowedKinds = new Set(['asset_relation', 'bench_message', 'bottle_reply', 'frame_message', 'follow', 'loose_tag', 'space_snapshot', 'content_rating', 'content_share', 'content_tag', 'space_message']);
      const kind = cleanText(body.kind, 40);
      if (!allowedKinds.has(kind)) return apiError(response, 400, 'invalid-record-kind', '公共互动类型无效。');
      let id = cleanText(body.id, 80) || `${kind}-${randomUUID()}`;
      const payload = body.payload && typeof body.payload === 'object' && !Array.isArray(body.payload) ? body.payload : {};
      if (kind === 'asset_relation') {
        const aId = cleanText(payload.aId, 80); const bId = cleanText(payload.bId, 80);
        if (!aId || !bId || aId === bId) return apiError(response, 400, 'invalid-relation', '请选择两段不同素材。');
        payload.aId = aId; payload.bId = bId; payload.type = ['echo', 'contrast', 'sequence', 'unresolved'].includes(payload.type) ? payload.type : 'unresolved'; payload.note = cleanText(payload.note, 300);
      }
      if (kind === 'bench_message' || kind === 'bottle_reply' || kind === 'frame_message' || kind === 'space_message') payload.text = cleanText(payload.text, 180);
      if ((kind === 'bench_message' || kind === 'bottle_reply' || kind === 'frame_message' || kind === 'space_message') && !payload.text) return apiError(response, 400, 'empty-record', '请填写内容。');
      if (kind === 'loose_tag') {
        payload.tag = cleanText(payload.tag, 24);
        payload.wx = cleanCoordinate(payload.wx);
        payload.wy = cleanCoordinate(payload.wy);
        payload.zone = cleanText(payload.zone, 40);
        if (payload.tag.length < 2) return apiError(response, 400, 'invalid-loose-tag', '标签至少需要 2 个字。');
      }
      if (kind === 'space_snapshot') {
        payload.spaceId = `space-${user.id}`;
        payload.nickname = cleanText(payload.nickname, 16) || '匿名旅人';
        payload.spaceName = cleanText(payload.spaceName, 24) || '未命名小窝';
        payload.avatar = Math.max(0, Math.min(12, Number(payload.avatar) || 0));
        payload.avatarImage = cleanAvatarImage(payload.avatarImage) || '';
        payload.decor = Array.isArray(payload.decor) ? payload.decor.map((item) => cleanText(item, 32)).filter(Boolean).slice(0, 30) : [];
        payload.stickers = Array.isArray(payload.stickers) ? payload.stickers.map((item) => cleanText(item, 48)).filter(Boolean).slice(0, 40) : [];
        payload.placedAssetIds = Array.isArray(payload.placedAssetIds) ? payload.placedAssetIds.map((item) => cleanText(item, 80)).filter(Boolean).slice(0, 20) : [];
        payload.buildings = Array.isArray(payload.buildings) ? payload.buildings.map((item) => cleanText(item, 32)).filter(Boolean).slice(0, 12) : [];
        payload.day = Math.max(1, Math.min(100000, Number(payload.day) || 1));
      }
      if (kind === 'follow' || kind === 'content_share' || kind === 'space_message') {
        payload.targetSpaceId = cleanText(payload.targetSpaceId, 80);
        const targetSpace = (await repository.listPublicRecords()).find((record) => record.kind === 'space_snapshot' && record.id === payload.targetSpaceId && record.status !== 'deleted');
        if (!targetSpace) return apiError(response, 404, 'target-space-not-found', '这个公开小窝已经不在小径上了。');
        if (targetSpace.ownerId === user.id) return apiError(response, 400, 'self-target-not-allowed', '不用把纸条递给自己的小窝。');
        payload.targetUserId = targetSpace.ownerId;
        if (kind === 'follow') id = stablePublicRecordId('follow', user.id, targetSpace.ownerId);
      }
      if (kind === 'content_rating' || kind === 'content_share' || kind === 'content_tag') {
        payload.targetType = cleanText(payload.targetType, 20);
        payload.targetId = cleanText(payload.targetId, 80);
        if (!['asset', 'demand'].includes(payload.targetType) || !payload.targetId) return apiError(response, 400, 'invalid-content-target', '要互动的内容已经不存在。');
        const targetExists = payload.targetType === 'asset'
          ? (payload.targetId.startsWith('v-') || Boolean(await repository.getPublicAsset(payload.targetId)))
          : (payload.targetId.startsWith('sys-n-') || Boolean(await repository.getPublicDemandCore(payload.targetId)));
        if (!targetExists) return apiError(response, 404, 'content-target-not-found', '要互动的内容已经不存在。');
      }
      if (kind === 'content_rating') {
        payload.rate = Number(payload.rate);
        if (!Number.isInteger(payload.rate) || payload.rate < 1 || payload.rate > 5) return apiError(response, 400, 'invalid-content-rating', '请选择 1 到 5 枚印记。');
        id = stablePublicRecordId('rating', user.id, payload.targetType, payload.targetId);
      }
      if (kind === 'content_share') {
        id = stablePublicRecordId('share', user.id, payload.targetType, payload.targetId, payload.targetUserId);
      }
      if (kind === 'content_tag') {
        if (payload.targetType !== 'asset') return apiError(response, 400, 'tag-target-must-be-asset', '标签只能贴在素材旁。');
        payload.tag = cleanText(payload.tag, 24).replace(/\s+/g, ' ');
        if (payload.tag.length < 2) return apiError(response, 400, 'invalid-content-tag', '标签至少需要 2 个字。');
        id = stablePublicRecordId('content-tag', user.id, payload.targetId, payload.tag.toLocaleLowerCase('zh-CN'));
      }
      const now = new Date().toISOString();
      const existingRecord = (await repository.listPublicRecords({ includeDeleted: true })).find((record) => record.id === id);
      const record = await repository.savePublicRecord({
        id, kind, ownerId: user.id, ownerName: user.nickname || '匿名旅人', name: user.nickname || '匿名旅人',
        payload, status: 'published', createdAt: existingRecord?.createdAt || now, updatedAt: now,
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
      const events = validated.map((entry) => entry.event).filter(Boolean).map((event) => ({ ...event, research_consent: true }));
      const rejectedIds = validated.filter((entry) => !entry.event && entry.raw?.event_id).map((entry) => String(entry.raw.event_id));
      const rejectionReasons = Object.fromEntries(validated.filter((entry) => !entry.event && entry.raw?.event_id).map((entry) => [String(entry.raw.event_id), entry.error]));
      if (!events.length) return json(response, 200, { ok: true, accepted: [], acknowledged: [], rejected: rejectedIds.length, rejected_ids: rejectedIds, rejection_reasons: rejectionReasons });
      const subject = await ensureResearchIdentity(user);
      const accepted = await repository.appendEvents(user.id, events, subject.subject_id);
      // 投影到研究事实表：只处理本次真正新落库的事件，避免重放重复写入；失败只告警。
      const acceptedSet = new Set(accepted);
      const newlyAccepted = events.filter((event) => acceptedSet.has(event.event_id));
      if (newlyAccepted.length) {
        try { await projectResearchEvents(repository, newlyAccepted, user.id, subject.subject_id); }
        catch (error) { console.warn(`research post-processing failed: ${error.message}`); }
      }
      return json(response, 200, { ok: true, accepted, acknowledged: events.map((event) => event.event_id), rejected: rejectedIds.length, rejected_ids: rejectedIds, rejection_reasons: rejectionReasons });
    }

    if (url.pathname === '/api/events/recent' && request.method === 'GET') {
      const user = await requireUser(request, response); if (!user) return;
      return json(response, 200, { ok: true, events: await repository.recentEvents(user.id, 200) });
    }

    if (url.pathname === '/api/media' && request.method === 'POST') {
      const user = await requireUser(request, response); if (!user) return;
      const releaseUpload = tryStartVideoUpload();
      if (!releaseUpload) return apiError(response, 503, 'upload-busy', '当前上传人数较多，请稍后再试。');
      let upload;
      try {
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
      } finally {
        await upload?.cleanup?.();
        releaseUpload();
      }
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
    if (!['GET', 'HEAD'].includes(request.method)) {
      response.setHeader('allow', 'GET, HEAD');
      return apiError(response, 405, 'method-not-allowed', '该页面请求方式无效。');
    }
    const target = publicStaticTarget(config.appDir, url.pathname.slice(APP_PREFIX.length));
    if (!target) return apiError(response, 404, 'not-found', '页面不存在。');
    try {
      const stat = await fs.stat(target);
      if (!stat.isFile()) return apiError(response, 404, 'not-found', '页面不存在。');
      const responseHeaders = { ...headers, 'content-type': MIME[path.extname(target).toLowerCase()] || 'application/octet-stream', 'content-length': stat.size, 'cache-control': config.isProduction ? 'public, max-age=300' : 'no-store' };
      if (request.method === 'HEAD') { response.writeHead(200, responseHeaders); return response.end(); }
      const bytes = await fs.readFile(target);
      response.writeHead(200, responseHeaders);
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
