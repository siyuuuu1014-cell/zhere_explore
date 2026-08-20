import test from 'node:test';
import assert from 'node:assert/strict';
import { validateRecommendationProjection } from './recommendation-research-validation.mjs';

const schema = { name: 'sample', primary: 'id', fields: [{ name: 'id', format: 'UUID', required: true }, { name: 'active', format: 'Boolean' }, { name: 'count', format: 'Int' }, { name: 'rate', format: 'Float64' }, { name: 'content_type', format: 'String', enum: ['published_asset'] }] };

test('document formats accept UUID, Boolean, Int, Float64 and enums', () => {
  assert.deepEqual(validateRecommendationProjection(schema, [{ id: '1e197262-499d-45a5-a7ca-672a68179975', active: true, count: 2, rate: 0.5, content_type: 'published_asset' }]), []);
});

test('document formats reject loose ids, numeric booleans and invalid enums', () => {
  const errors = validateRecommendationProjection(schema, [{ id: 'asset-1', active: 1, count: 1.2, rate: Number.NaN, content_type: 'asset' }]);
  assert.equal(errors.length, 5);
});
