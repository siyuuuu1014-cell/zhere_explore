import test from 'node:test';
import assert from 'node:assert/strict';
import { feishuFieldValue } from '../scripts/feishu-research-client.mjs';

test('Feishu checkbox fields receive real booleans, never strings', () => {
  assert.equal(feishuFieldValue({ type: 7 }, true), true);
  assert.equal(feishuFieldValue({ type: 7 }, false), false);
  assert.equal(feishuFieldValue({ type: 7 }, 'true'), true);
});
