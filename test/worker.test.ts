import assert from 'node:assert/strict';
import { test } from 'node:test';
import worker from '../src/backend/index.ts';

test('health endpoint identifies setup status without external calls', async () => {
  const response = await worker.fetch(new Request('http://localhost/api/health'));
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { status: 'ok', stage: 'demo' });
});

test('unknown endpoint is a JSON 404', async () => {
  const response = await worker.fetch(new Request('http://localhost/missing'));
  assert.equal(response.status, 404);
  assert.deepEqual(await response.json(), { error: 'not_found', message: '対象の API はありません。' });
});

test('health endpoint rejects writes', async () => {
  const response = await worker.fetch(new Request('http://localhost/api/health', { method: 'POST' }));
  assert.equal(response.status, 405);
  assert.equal(response.headers.get('allow'), 'GET');
});
