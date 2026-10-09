import assert from 'node:assert/strict';
import { test } from 'node:test';
import { JevClassifier } from '../src/backend/jev.ts';
import type { ClassifierInput } from '../src/core/types.ts';

function input(): ClassifierInput { return { memo: '転職のよくある疑問を解説します', industry: 'career', choices: [{ id: 'faq', label: 'よくある質問' }, { id: 'howto', label: 'ノウハウ解説' }], cautions: ['内定を保証しません'] }; }
function wire() { return { model: 'jev-1.13.0', answers: { idea_type: { type: 'choice', choice: 'faq', confidence: 0.79, probabilities: { faq: 0.9, howto: 0.1 } }, caution: { type: 'noul', noul: 0.6 } } }; }

test('Jev adapter uses one binding call for choice and caution, preserves confidence separately', async () => {
  let calls = 0;
  const adapter = new JevClassifier({ async run(model, value) {
    calls++; assert.equal(model, 'typesafe/jev');
    const request = value as { questions: Record<string, {type: string}> };
    assert.equal(request.questions.idea_type.type, 'choice'); assert.equal(request.questions.caution.type, 'noul');
    return wire();
  } }, true);
  const result = await adapter.classify(input());
  assert.equal(calls, 1); assert.equal(result.confidence, 0.79); assert.equal(result.candidates[0]?.probability, 0.9); assert.equal(result.model, 'jev-1.13.0');
});

test('disabled or absent binding never calls external service', async () => {
  await assert.rejects(new JevClassifier().classify(input()), /unavailable/);
  await assert.rejects(new JevClassifier({ async run() { throw new Error('must not call'); } }).classify(input()), /unavailable/);
});

test('Jev rejects model drift and malformed responses', async () => {
  await assert.rejects(new JevClassifier({ async run() { return { ...wire(), model: 'jev-latest' }; } }, true).classify(input()), /version_mismatch/);
  await assert.rejects(new JevClassifier({ async run() { return { model: 'jev-1.13.0', answers: {} }; } }, true).classify(input()), /invalid_jev_response/);
});

test('quota errors are distinguishable from provider failures', async () => {
  await assert.rejects(new JevClassifier({ async run() { throw new Error('daily neuron quota exceeded'); } }, true).classify(input()), { code: 'quota_exceeded' });
  await assert.rejects(new JevClassifier({ async run() { throw new Error('upstream error with secret'); } }, true).classify(input()), /classification_failed/);
});

test('Cloudflare documented 3036 code stops classification as daily quota', async () => {
  await assert.rejects(new JevClassifier({ async run() { throw Object.assign(new Error('Account limited'), { code: 3036 }); } }, true).classify(input()), { code: 'quota_exceeded' });
});
