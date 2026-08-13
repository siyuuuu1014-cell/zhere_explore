import path from 'node:path';
import { fileURLToPath } from 'node:url';

const serverDir = path.dirname(fileURLToPath(import.meta.url));
const repository = process.env.ZHERE_REPOSITORY || 'local';
const isProduction = process.env.NODE_ENV === 'production';
const sessionCookieSecure = String(process.env.ZHERE_SESSION_COOKIE_SECURE || 'auto').trim().toLowerCase();

export const config = {
  port: Number(process.env.PORT || 4175),
  host: process.env.HOST || (isProduction ? '0.0.0.0' : '127.0.0.1'),
  isProduction,
  repository,
  appDir: path.resolve(serverDir, '..'),
  dataDir: path.resolve(process.env.ZHERE_DATA_DIR || path.join(serverDir, '..', '.data')),
  sessionDays: Number(process.env.ZHERE_SESSION_DAYS || 30),
  sessionCleanupIntervalMs: Math.max(60_000, Number(process.env.ZHERE_SESSION_CLEANUP_INTERVAL_MS || 15 * 60 * 1000)),
  sessionCookieSecure,
  maxJsonBytes: 2 * 1024 * 1024,
  maxVideoBytes: Number(process.env.ZHERE_MAX_VIDEO_BYTES || (repository === 'feishu' ? 20 : 100) * 1024 * 1024),
  publicWriteLimit: Number(process.env.ZHERE_PUBLIC_WRITE_LIMIT || 60),
  researchConsentVersion: String(process.env.RESEARCH_CONSENT_VERSION || 'research-v1'),
  basePriceTransactionCount: Math.max(1, Math.floor(Number(process.env.BASE_PRICE_TRANSACTION_COUNT) || 10)),
  marketInsightMinSample: Math.max(3, Math.floor(Number(process.env.MARKET_INSIGHT_MIN_SAMPLE) || 5)),
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
    },
  },
};

export function assertProductionConfig() {
  if (!config.isProduction) return;
  if (config.repository !== 'feishu') throw new Error('Production requires ZHERE_REPOSITORY=feishu.');
  const values = [
    config.feishu.appId,
    config.feishu.appSecret,
    config.feishu.bitableAppToken,
    config.feishu.driveFolderToken,
    ...Object.values(config.feishu.tables),
  ];
  if (values.some((value) => !value)) throw new Error('Production Feishu configuration is incomplete.');
  if (!Number.isInteger(config.port) || config.port < 1 || config.port > 65535) throw new Error('PORT must be an integer between 1 and 65535.');
  if (!Number.isFinite(config.maxVideoBytes) || config.maxVideoBytes < 1) throw new Error('ZHERE_MAX_VIDEO_BYTES must be a positive number.');
  if (!Number.isFinite(config.sessionDays) || config.sessionDays < 1) throw new Error('ZHERE_SESSION_DAYS must be a positive number.');
  if (!['auto', 'true', 'false'].includes(config.sessionCookieSecure)) throw new Error('ZHERE_SESSION_COOKIE_SECURE must be auto, true, or false.');
}
