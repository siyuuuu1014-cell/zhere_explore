import path from 'node:path';
import { fileURLToPath } from 'node:url';

const serverDir = path.dirname(fileURLToPath(import.meta.url));
const repository = process.env.ZHERE_REPOSITORY || 'local';

export const config = {
  port: Number(process.env.PORT || 4175),
  host: process.env.HOST || '127.0.0.1',
  isProduction: process.env.NODE_ENV === 'production',
  repository,
  appDir: path.resolve(serverDir, '..'),
  dataDir: path.resolve(process.env.ZHERE_DATA_DIR || path.join(serverDir, '..', '.data')),
  sessionDays: Number(process.env.ZHERE_SESSION_DAYS || 30),
  maxJsonBytes: 2 * 1024 * 1024,
  maxVideoBytes: Number(process.env.ZHERE_MAX_VIDEO_BYTES || (repository === 'feishu' ? 20 : 100) * 1024 * 1024),
  publicWriteLimit: Number(process.env.ZHERE_PUBLIC_WRITE_LIMIT || 60),
  adminIdentities: String(process.env.ZHERE_ADMIN_IDENTITIES || '').split(',').map((value) => value.trim().toLowerCase()).filter(Boolean),
  feishu: {
    appId: process.env.FEISHU_APP_ID || '',
    appSecret: process.env.FEISHU_APP_SECRET || '',
    bitableAppToken: process.env.FEISHU_BITABLE_APP_TOKEN || '',
    driveFolderToken: process.env.FEISHU_DRIVE_FOLDER_TOKEN || '',
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
}
