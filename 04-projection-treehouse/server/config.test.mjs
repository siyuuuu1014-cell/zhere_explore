import test from 'node:test';
import assert from 'node:assert/strict';
import { assertProductionConfig } from './config.mjs';

function productionConfig(overrides = {}) {
  return {
    isProduction: true,
    repository: 'feishu',
    processCount: 1,
    port: 4175,
    maxVideoBytes: 100 * 1024 * 1024,
    sessionDays: 30,
    sessionCookieSecure: 'auto',
    recommendationSync: { mode: 'false', enabled: false },
    feishu: {
      appId: 'cli-test',
      appSecret: 'secret',
      bitableAppToken: 'app-token',
      driveFolderToken: 'folder-token',
      tables: { users: 'tbl-users' },
    },
    ...overrides,
  };
}

test('production config accepts one Feishu server process', () => {
  assert.doesNotThrow(() => assertProductionConfig(productionConfig()));
});

test('production config requires all projection tables when recommendation sync is enabled', () => {
  assert.throws(
    () => assertProductionConfig(productionConfig({ recommendationSync: { mode: 'true', enabled: true } })),
    /all 9 Feishu recommendation projection Table IDs/,
  );
});

test('production config rejects multi-process Feishu deployment without distributed locking', () => {
  assert.throws(
    () => assertProductionConfig(productionConfig({ processCount: 2 })),
    /exactly one Node\.js process/,
  );
});
