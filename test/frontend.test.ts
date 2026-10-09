import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { getMessages, screens } from '../src/frontend/messages.ts';
import { parseRoute, routeHash, normalizeError, dateInJapan, numberFromInput, isValidMemo, ViewRevision } from '../src/frontend/view-model.ts';
import { ApiClient, ApiError } from '../src/frontend/api.ts';

test('all seven Japanese screens expose the demo reset and privacy notice', () => {
  assert.equal(screens.length, 7);
  assert.equal(screens[0]?.id, 'home');
  assert.equal(screens[6]?.id, 'report');
  const messages = getMessages();
  assert.match(messages.resetNotice, /JST 03:00/);
  assert.match(messages.privacyNotice, /実名|個人情報/);
  assert.match(messages.generationNotice, /テンプレート/);
  assert.match(messages.scheduleRegenerateNote, /進行状態.*保持/);
  assert.doesNotMatch(messages.scheduleRegenerateNote, /初期化/);
});

test('routes only accept known screen IDs and safely round trip project IDs', () => {
  assert.deepEqual(parseRoute('#unknown/a'), { screen: 'home', projectId: '' });
  assert.deepEqual(parseRoute(routeHash('ideas', 'project test')), { screen: 'ideas', projectId: 'project test' });
  assert.deepEqual(parseRoute('#ideas/%E0%A4%A'), { screen: 'home', projectId: '' });
});

test('input helpers avoid empty numeric values and enforce memo length', () => {
  assert.equal(numberFromInput(''), null);
  assert.equal(numberFromInput('not a number'), null);
  assert.equal(numberFromInput('20'), 20);
  assert.equal(isValidMemo(' '), false);
  assert.equal(isValidMemo('あ'), false);
  assert.equal(isValidMemo('あい'), true);
  assert.equal(isValidMemo('あ'.repeat(501)), false);
  assert.equal(dateInJapan(new Date('2026-10-08T18:00:00Z')), '2026-10-09');
});

test('API client sends same-origin cookies and write honeypot without leaking values in errors', async () => {
  const calls: {input: string; init: RequestInit}[] = [];
  const api = new ApiClient(async (input, init) => {
    calls.push({input: String(input), init: init ?? {}});
    return new Response(JSON.stringify({id: 'project-1'}), {headers: {'Content-Type':'application/json'}});
  });
  await api.request('/api/projects', 'POST', {clientAlias:'A社', website:''});
  assert.equal(calls[0]?.input, '/api/projects');
  assert.equal(calls[0]?.init.credentials, 'same-origin');
  assert.equal(calls[0]?.init.headers && new Headers(calls[0].init.headers).get('Content-Type'), 'application/json');
  assert.deepEqual(JSON.parse(String(calls[0]?.init.body)), {clientAlias:'A社', website:''});
  await assert.rejects(api.request('https://untrusted.example/api'), /同一/);
});

test('API failure remains an explicit error and is not treated as successful classification', async () => {
  const api = new ApiClient(async () => new Response(JSON.stringify({error:{code:'CLASSIFICATION_UNAVAILABLE', message:'自動分類を利用できません'}}), {status:503}));
  await assert.rejects(api.request('/api/projects/p/ideas', 'POST', {memo:'テスト', website:''}), (error) => {
    assert.ok(error instanceof ApiError);
    assert.equal(error.status, 503);
    assert.equal(error.code, 'CLASSIFICATION_UNAVAILABLE');
    assert.match(normalizeError(error), /自動分類/);
    return true;
  });
});

test('source uses safe DOM methods, accessible status and no native blocking dialogs', async () => {
  const source = await readFile(new URL('../src/frontend/app.ts', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /\.innerHTML\s*=|\b(?:alert|confirm|prompt)\s*\(/);
  assert.match(source, /textContent/);
  assert.match(source, /aria-live/);
  assert.match(source, /website/);
});

test('API handles network failure and malformed responses with safe Japanese messages', async () => {
  const offline = new ApiClient(async () => { throw new Error('secret detail'); });
  await assert.rejects(offline.request('/api/bootstrap'), error => error instanceof ApiError && error.code === 'network_error' && !error.message.includes('secret'));
  const malformed = new ApiClient(async () => new Response('<html>error</html>', {status:502}));
  await assert.rejects(malformed.request('/api/bootstrap'), /応答を読み取れません/);
});

test('API client understands the Worker flat error format', async () => {
  const api = new ApiClient(async () => new Response(JSON.stringify({error:'invalid_input',message:'入力値を確認してください。'}), {status:400}));
  await assert.rejects(api.request('/api/projects', 'POST', {}), error => error instanceof ApiError && error.code === 'invalid_input' && error.message === '入力値を確認してください。');
});


test('a delayed save cannot replace a newer screen or selector draft', async () => {
  const revision = new ViewRevision();
  const pendingView = revision.capture();
  let screenText = '保存中のチャンネル';
  let finish: (() => void) | undefined;
  const pending = new Promise<void>(resolve => { finish = resolve; }).then(() => {
    if (revision.isCurrent(pendingView)) screenText = '古い保存結果';
  });
  revision.advance();
  screenText = '移動先で入力中の新しい企画メモ';
  finish!(); await pending;
  assert.equal(screenText, '移動先で入力中の新しい企画メモ');
  assert.equal(revision.isCurrent(pendingView), false);
  assert.equal(revision.isCurrent(revision.capture()), true);
  assert.equal(revision.isCurrent(null), false);
});
