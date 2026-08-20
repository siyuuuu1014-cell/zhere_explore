import test from 'node:test';
import assert from 'node:assert/strict';
import { loadProjectEnvironment } from './environment.mjs';

test('project environment loader uses the requested .env file', () => {
  let received = '';
  const result = loadProjectEnvironment({ envPath: 'project.env', loadEnvFile: (value) => { received = value; } });
  assert.equal(received, 'project.env');
  assert.deepEqual(result, { loaded: true, envPath: 'project.env' });
});

test('project environment loader treats a missing .env as local defaults', () => {
  const result = loadProjectEnvironment({
    envPath: 'missing.env',
    loadEnvFile: () => { const error = new Error('missing'); error.code = 'ENOENT'; throw error; },
  });
  assert.deepEqual(result, { loaded: false, envPath: 'missing.env' });
});

