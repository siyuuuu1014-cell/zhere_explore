import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { recommendationResearchTableIds } from './recommendation-research-schema.mjs';

const serverDir = path.dirname(fileURLToPath(import.meta.url));
const repository = process.env.ZHERE_REPOSITORY || 'local';
const isProduction = process.env.NODE_ENV === 'production';
const sessionCookieSecure = String(process.env.ZHERE_SESSION_COOKIE_SECURE || 'auto').trim().toLowerCase();
const processCount = Number(process.env.ZHERE_PROCESS_COUNT || process.env.WEB_CONCURRENCY || 1);
const recommendationSyncMode = String(process.env.ZHERE_RECOMMENDATION_SYNC_ENABLED || 'auto').trim().toLowerCase();
const recommendationSyncEnabled = recommendationSyncMode === 'true'
  || (recommendationSyncMode === 'auto' && repository === 'feishu');

export const config = {
  port: Number(process.env.PORT || 4175),
  host: process.env.HOST || (isProduction ? '0.0.0.0' : '127.0.0.1'),
  isProduction,
  repository,
  processCount,
  appDir: path.resolve(serverDir, '..'),
  dataDir: path.resolve(process.env.ZHERE_DATA_DIR || path.join(serverDir, '..', '.data')),
  sessionDays: Number(process.env.ZHERE_SESSION_DAYS || 30),
  sessionCleanupIntervalMs: Math.max(60_000, Number(process.env.ZHERE_SESSION_CLEANUP_INTERVAL_MS || 15 * 60 * 1000)),
  guestCleanupIntervalMs: Math.max(60_000, Number(process.env.ZHERE_GUEST_CLEANUP_INTERVAL_MS || 6 * 60 * 60 * 1000)),
  guestCleanupBatchSize: Math.max(1, Math.floor(Number(process.env.ZHERE_GUEST_CLEANUP_BATCH_SIZE || 25))),
  sessionCookieSecure,
  trustProxy: String(process.env.ZHERE_TRUST_PROXY || 'false').trim().toLowerCase() === 'true',
  authRateLimitEnabled: String(process.env.ZHERE_AUTH_RATE_LIMIT_ENABLED || (isProduction ? 'true' : 'false')).trim().toLowerCase() === 'true',
  maxJsonBytes: 2 * 1024 * 1024,
  maxVideoBytes: Number(process.env.ZHERE_MAX_VIDEO_BYTES || 100 * 1024 * 1024),
  maxConcurrentVideoUploads: Math.max(1, Math.floor(Number(process.env.ZHERE_MAX_CONCURRENT_VIDEO_UPLOADS || 2))),
  publicWriteLimit: Number(process.env.ZHERE_PUBLIC_WRITE_LIMIT || 60),
  publicWorldCacheTtlMs: Math.max(0, Number(process.env.ZHERE_PUBLIC_WORLD_CACHE_TTL_MS || 3000)),
  slowRequestThresholdMs: Math.max(0, Number(process.env.ZHERE_SLOW_REQUEST_THRESHOLD_MS || 1500)),
  researchConsentVersion: String(process.env.RESEARCH_CONSENT_VERSION || 'research-v1'),
  basePriceTransactionCount: Math.max(1, Math.floor(Number(process.env.BASE_PRICE_TRANSACTION_COUNT) || 10)),
  marketInsightMinSample: Math.max(3, Math.floor(Number(process.env.MARKET_INSIGHT_MIN_SAMPLE) || 5)),
  recommendationSync: {
    mode: recommendationSyncMode,
    enabled: recommendationSyncEnabled,
    initialDelayMs: Math.max(0, Number(process.env.ZHERE_RECOMMENDATION_SYNC_INITIAL_DELAY_MS || 30_000)),
    intervalMs: Math.max(60_000, Number(process.env.ZHERE_RECOMMENDATION_SYNC_INTERVAL_MS || 15 * 60 * 1000)),
    timeoutMs: Math.max(60_000, Number(process.env.ZHERE_RECOMMENDATION_SYNC_TIMEOUT_MS || 20 * 60 * 1000)),
  },
  adminIdentities: String(process.env.ZHERE_ADMIN_IDENTITIES || '').split(',').map((value) => value.trim().toLowerCase()).filter(Boolean),
  feishu: {
    appId: process.env.FEISHU_APP_ID || '',
    appSecret: process.env.FEISHU_APP_SECRET || '',
    bitableAppToken: process.env.FEISHU_BITABLE_APP_TOKEN || '',
    driveFolderToken: process.env.FEISHU_DRIVE_FOLDER_TOKEN || '',
    readCacheTtlMs: Math.max(0, Number(process.env.FEISHU_READ_CACHE_TTL_MS || 3000)),
    tables: {
      users: process.env.FEISHU_TABLE_USERS || '',
      sessions: process.env.FEISHU_TABLE_SESSIONS || '',
      worldStates: process.env.FEISHU_TABLE_WORLD_STATES || '',
      assets: process.env.FEISHU_TABLE_ASSETS || '',
      publicAssets: process.env.FEISHU_TABLE_PUBLIC_ASSETS || '',
      publicDemands: process.env.FEISHU_TABLE_PUBLIC_DEMANDS || '',
      publicResponses: process.env.FEISHU_TABLE_PUBLIC_RESPONSES || '',
      publicRecords: process.env.FEISHU_TABLE_PUBLIC_RECORDS || '',
      reports: process.env.FEISHU_TABLE_REPORTS || '',
      events: process.env.FEISHU_TABLE_EVENTS || '',
      passwordResets: process.env.FEISHU_TABLE_PASSWORD_RESETS || '',
      bids: process.env.FEISHU_TABLE_BIDS || '',
      transactions: process.env.FEISHU_TABLE_TRANSACTIONS || '',
      basePrices: process.env.FEISHU_TABLE_BASE_PRICES || '',
      researchSubjects: process.env.FEISHU_TABLE_RESEARCH_SUBJECTS || '',
      researchConsents: process.env.FEISHU_TABLE_RESEARCH_CONSENTS || '',
      researchSessions: process.env.FEISHU_TABLE_RESEARCH_SESSIONS || '',
      recommendationRequests: process.env.FEISHU_TABLE_RESEARCH_RECOMMENDATION_REQUESTS || '',
      recommendationCandidates: process.env.FEISHU_TABLE_RESEARCH_RECOMMENDATION_CANDIDATES || '',
      recommendationImpressions: process.env.FEISHU_TABLE_RESEARCH_RECOMMENDATION_IMPRESSIONS || '',
      bidAttempts: process.env.FEISHU_TABLE_BID_ATTEMPTS || '',
      basePriceVersions: process.env.FEISHU_TABLE_BASE_PRICE_VERSIONS || '',
    },
    recommendationProjectionTables: recommendationResearchTableIds(),
  },
};

export function assertProductionConfig(runtimeConfig = config) {
  if (!runtimeConfig.isProduction) return;
  if (runtimeConfig.repository !== 'feishu') throw new Error('Production requires ZHERE_REPOSITORY=feishu.');
  const values = [
    runtimeConfig.feishu.appId,
    runtimeConfig.feishu.appSecret,
    runtimeConfig.feishu.bitableAppToken,
    runtimeConfig.feishu.driveFolderToken,
    ...Object.values(runtimeConfig.feishu.tables),
  ];
  if (values.some((value) => !value)) throw new Error('Production Feishu configuration is incomplete.');
  if (!Number.isInteger(runtimeConfig.port) || runtimeConfig.port < 1 || runtimeConfig.port > 65535) throw new Error('PORT must be an integer between 1 and 65535.');
  if (!Number.isFinite(runtimeConfig.maxVideoBytes) || runtimeConfig.maxVideoBytes < 1) throw new Error('ZHERE_MAX_VIDEO_BYTES must be a positive number.');
  const uploadConcurrency = Number(runtimeConfig.maxConcurrentVideoUploads ?? 2);
  if (!Number.isInteger(uploadConcurrency) || uploadConcurrency < 1) throw new Error('ZHERE_MAX_CONCURRENT_VIDEO_UPLOADS must be a positive integer.');
  if (!Number.isFinite(runtimeConfig.sessionDays) || runtimeConfig.sessionDays < 1) throw new Error('ZHERE_SESSION_DAYS must be a positive number.');
  if (!['auto', 'true', 'false'].includes(runtimeConfig.sessionCookieSecure)) throw new Error('ZHERE_SESSION_COOKIE_SECURE must be auto, true, or false.');
  if (!['auto', 'true', 'false'].includes(runtimeConfig.recommendationSync?.mode)) throw new Error('ZHERE_RECOMMENDATION_SYNC_ENABLED must be auto, true, or false.');
  if (runtimeConfig.recommendationSync?.enabled) {
    const projectionTables = Object.values(runtimeConfig.feishu.recommendationProjectionTables || {});
    if (projectionTables.length !== 9 || projectionTables.some((value) => !value)) {
      throw new Error('Recommendation sync requires all 9 Feishu recommendation projection Table IDs.');
    }
  }
  if (!Number.isInteger(runtimeConfig.processCount) || runtimeConfig.processCount !== 1) {
    throw new Error('Feishu production currently requires exactly one Node.js process. Set ZHERE_PROCESS_COUNT=1 (and WEB_CONCURRENCY=1 when applicable) until a distributed lock provider is configured.');
  }
}
