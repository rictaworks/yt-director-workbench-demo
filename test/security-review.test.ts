import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { test } from 'node:test';
import { body, HttpError, member, number, sessionCookie, sessionId, text, todayJst } from '../src/backend/http.ts';

function jsonRequest(value: unknown, headers: Record<string, string> = {}): Request {
  return new Request('https://demo.example/api/projects', {
    method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(value),
  });
}
function statusIs(status: number) { return (error: unknown) => error instanceof HttpError && error.status === status; }

test('security: write bodies reject cross-site and wrong-origin requests', async () => {
  await assert.rejects(body(jsonRequest({}, { origin: 'https://attacker.example' })), statusIs(403));
  await assert.rejects(body(jsonRequest({}, { origin: 'null' })), statusIs(403));
  await assert.rejects(body(jsonRequest({}, { 'sec-fetch-site': 'cross-site' })), statusIs(403));
  assert.deepEqual(await body(jsonRequest({ clientAlias: 'A社' }, { origin: 'https://demo.example' })), { clientAlias: 'A社' });
});

test('security: JSON object protocol rejects primitive bodies and malformed JSON', async () => {
  for (const input of [null, [], 'text', 0, true]) await assert.rejects(body(jsonRequest(input)), statusIs(400));
  await assert.rejects(body(new Request('https://demo.example/api/projects', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: '{bad json',
  })), statusIs(400));
  await assert.rejects(body(new Request('https://demo.example/api/projects', {
    method: 'POST', headers: { 'content-type': 'text/plain' }, body: '{}',
  })), statusIs(415));
});

test('security: body byte limit is enforced without trusting Content-Length', async () => {
  await assert.rejects(body(jsonRequest({ memo: 'a'.repeat(98305) })), statusIs(413));
  await assert.rejects(body(jsonRequest({ memo: '界'.repeat(33000) }, { 'content-length': '1' })), statusIs(413));
  await assert.rejects(body(jsonRequest({}, { 'content-length': '1000000' })), statusIs(413));
  assert.deepEqual(await body(jsonRequest({ memo: '日本語です' })), { memo: '日本語です' });
});

test('security: server validators reject unsafe numbers, coercion and invalid enums', () => {
  for (const input of [NaN, Infinity, -Infinity, 1.5, '1', null, Number.MAX_SAFE_INTEGER + 1]) {
    assert.throws(() => number(input, '数値', 0, Number.MAX_SAFE_INTEGER), statusIs(400));
  }
  for (const input of ['', 'HOWTO', ['howto'], {}, '__proto__']) assert.throws(() => member(input, ['howto', 'faq'], '型'), statusIs(400));
  assert.equal(number(0, '数値', 0, 10), 0);
  assert.equal(number(12.5, '維持率', 0, 100, false), 12.5);
  assert.equal(member('howto', ['howto', 'faq'], '型'), 'howto');
});

test('security: text validation uses code points and rejects blank or oversized input', () => {
  assert.equal(text('  😊😊  ', 'メモ', 2, 2), '😊😊');
  for (const input of [' ', '\t\n', '一', 'あいう', undefined, {}]) assert.throws(() => text(input, 'メモ', 2, 2), statusIs(400));
});

test('security: session cookie is HttpOnly, same-site and expires at the JST daily reset', () => {
  const id = '12345678-1234-4abc-8abc-123456789abc';
  const cookie = sessionCookie(id, new Request('https://demo.example/api/session'), new Date('2026-10-09T17:59:00Z'));
  assert.equal(cookie, `dw_session=${id}; Path=/; HttpOnly; SameSite=Strict; Max-Age=60; Secure`);
  assert.match(sessionCookie(id, new Request('http://localhost/api/session'), new Date('2026-10-09T18:00:00Z')), /Max-Age=86400$/);
  assert.equal(todayJst(new Date('2026-10-09T14:59:59Z')), '2026-10-09');
  assert.equal(todayJst(new Date('2026-10-09T15:00:00Z')), '2026-10-10');
});

test('security: incoming session IDs must be UUIDv4 values', () => {
  const id = '12345678-1234-4abc-8abc-123456789abc';
  assert.equal(sessionId(new Request('https://demo.example', { headers: { cookie: `other=a; dw_session=${id}; another=b` } })), id);
  for (const cookie of ['dw_session=abc', 'dw_session=../../other', 'dw_session=12345678-1234-1abc-8abc-123456789abc', 'dw_session=', 'not_dw_session=' + id]) {
    assert.equal(sessionId(new Request('https://demo.example', { headers: { cookie } })), null);
  }
});

function schemaDatabase(): DatabaseSync {
  const db = new DatabaseSync(':memory:');
  db.exec(readFileSync(new URL('../migrations/0001_initial.sql', import.meta.url), 'utf8'));
  db.exec(`
    INSERT INTO sessions VALUES ('session-a', '2026-10-09T00:00:00Z');
    INSERT INTO projects (id, session_id, client_alias, created_at) VALUES ('project-a', 'session-a', 'A社', '2026-10-09T00:00:00Z');
    INSERT INTO ideas (id, session_id, project_id, memo, idea_type, classified_by) VALUES ('idea-a', 'session-a', 'project-a', '企画メモ', 'howto', 'manual');
    INSERT INTO plan_sheets (id, session_id, idea_id, titles, thumb_texts, aim, non_recommended) VALUES ('plan-a', 'session-a', 'idea-a', '["a","b","c"]', '["a","b"]', '目的', 0);
  `);
  return db;
}

test('security: DB CHECK constraints reject calendar dates that normalize to NULL', () => {
  const db = schemaDatabase();
  try {
    const insert = db.prepare('INSERT INTO schedules (id, session_id, plan_id, publish_date, shoot_date, compressed) VALUES (?, ?, ?, ?, ?, 0)');
    for (const date of ['2026-13-01', '2026-01-00', '2026-00-01', '2026-02-29', '2026-04-31']) {
      assert.throws(() => insert.run('schedule-a', 'session-a', 'plan-a', date, null), /CHECK/, `invalid publish_date ${date} must fail`);
      assert.throws(() => insert.run('schedule-a', 'session-a', 'plan-a', '2026-10-30', date), /CHECK/, `invalid shoot_date ${date} must fail`);
    }
    insert.run('schedule-a', 'session-a', 'plan-a', '2026-10-30', '2026-10-20');
    const task = db.prepare('INSERT INTO tasks (id, session_id, schedule_id, step, due) VALUES (?, ?, ?, ?, ?)');
    for (const date of ['2026-13-01', '2026-01-00', '2026-00-01', '2026-02-29', '2026-04-31']) {
      assert.throws(() => task.run('task-a', 'session-a', 'schedule-a', 'plan', date), /CHECK/, `invalid due ${date} must fail`);
    }
  } finally { db.close(); }
});

async function apiHarness() {
  const { default: worker } = await import('../src/backend/index.ts');
  const { createTestDatabase } = await import('./helpers/sqlite.ts');
  const db = createTestDatabase();
  const env = { DB: db, JEV_ENABLED: 'false', WORKERS_PLAN: 'free' };
  const call = async (cookie: string, path: string, method = 'GET', input?: unknown) => {
    const response = await worker.fetch(new Request(`https://demo.example${path}`, {
      method, headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}) },
      ...(input === undefined ? {} : { body: JSON.stringify(input) }),
    }), env);
    return { response, data: response.status === 204 ? null : await response.json() as any };
  };
  const session = async () => {
    const { response } = await call('', '/api/bootstrap');
    assert.equal(response.status, 200);
    const cookie = response.headers.get('set-cookie')?.split(';')[0];
    assert.ok(cookie);
    return cookie;
  };
  const project = async (cookie: string) => {
    const created = await call(cookie, '/api/projects', 'POST', { clientAlias: 'A社' });
    assert.equal(created.response.status, 201);
    const id = created.data.id as string;
    const base = `/api/projects/${id}`;
    for (const [path, method, input] of [
      ['/channel', 'PUT', { industry: 'clinic', goal: 'leads', target: '' }],
      ['/ideas', 'POST', { memo: '受診前によくある質問を説明する', ideaType: 'faq' }],
    ] as const) assert.equal((await call(cookie, base + path, method, input)).response.status, 200);
    let snapshot = (await call(cookie, base)).data;
    assert.equal((await call(cookie, base + '/plans', 'POST', { ideaId: snapshot.ideas[0].id, ideaType: 'faq' })).response.status, 200);
    snapshot = (await call(cookie, base)).data;
    const planId = snapshot.plans[0].id;
    assert.equal((await call(cookie, base + '/outlines', 'POST', { planId, targetSeconds: 480 })).response.status, 200);
    assert.equal((await call(cookie, base + '/schedules', 'POST', { planId, publishDate: '2027-01-29' })).response.status, 200);
    assert.equal((await call(cookie, base + '/edit-briefs', 'POST', { planId })).response.status, 200);
    return { id, base, data: (await call(cookie, base)).data };
  };
  return { worker, db, env, call, session, project };
}

test('security: API session isolation covers reads, all writes and nested foreign IDs', async () => {
  const h = await apiHarness();
  try {
    const a = await h.session(), b = await h.session();
    assert.notEqual(a, b);
    const projectA = await h.project(a), projectB = await h.project(b);
    const before = (await h.call(a, projectA.base)).data;
    const planA = before.plans[0].id, outlineA = before.outlines[0].id, taskA = before.schedules[0].tasks[0].id;
    for (const [suffix, method, input] of [
      ['', 'GET', undefined],
      ['/channel', 'PUT', { industry: 'btob', goal: 'sales', target: '' }],
      ['/ideas', 'POST', { memo: '別セッションからの書き込み', ideaType: 'howto' }],
      ['/plans', 'POST', { ideaId: before.ideas[0].id, ideaType: 'howto' }],
      ['/outlines', 'POST', { planId: planA, targetSeconds: 100 }],
      [`/outlines/${outlineA}`, 'PUT', { blocks: [] }],
      ['/schedules', 'POST', { planId: planA, publishDate: '2027-02-26' }],
      [`/tasks/${taskA}`, 'PATCH', { status: 'done' }],
      ['/edit-briefs', 'POST', { planId: planA }],
      ['/metrics', 'PUT', { month: '2026-10', views: 1, subsDelta: 1, retention: 1, conversions: 1 }],
    ] as const) {
      const result = await h.call(b, projectA.base + suffix, method, input);
      assert.equal(result.response.status, 404, `${method} ${suffix} must not expose another owner`);
      assert.doesNotMatch(JSON.stringify(result.data), /受診前|企画メモ|sessionId/);
    }
    for (const [suffix, method, input] of [
      ['/plans', 'POST', { ideaId: before.ideas[0].id, ideaType: 'howto' }],
      ['/outlines', 'POST', { planId: planA, targetSeconds: 100 }],
      [`/outlines/${outlineA}`, 'PUT', { blocks: before.outlines[0].blocks }],
      ['/schedules', 'POST', { planId: planA, publishDate: '2027-02-26' }],
      [`/tasks/${taskA}`, 'PATCH', { status: 'done' }],
      ['/edit-briefs', 'POST', { planId: planA }],
    ] as const) assert.equal((await h.call(b, projectB.base + suffix, method, input)).response.status, 404);
    assert.deepEqual((await h.call(a, projectA.base)).data, before);
    const bootstrapB = await h.call(b, '/api/bootstrap');
    assert.deepEqual(bootstrapB.data.projects.map((project: any) => project.id), [projectB.id]);
    assert.doesNotMatch(JSON.stringify(before), /sessionId|session_id|dw_session/);
    assert.equal((await h.call(a, projectA.base)).response.headers.get('cache-control'), 'no-store');
  } finally { h.db.close(); }
});

test('security: API validators reject hostile field values without modifying saved artifacts', async () => {
  const h = await apiHarness();
  try {
    const cookie = await h.session(), project = await h.project(cookie);
    const before = project.data, planId = before.plans[0].id, outline = before.outlines[0];
    for (const [suffix, method, input] of [
      ['/channel', 'PUT', { industry: '__proto__', goal: 'leads', target: '' }],
      ['/channel', 'PUT', { industry: 'clinic', goal: 'leads', target: 'あ'.repeat(201) }],
      ['/ideas', 'POST', { memo: '一', ideaType: 'faq' }],
      ['/ideas', 'POST', { memo: ' '.repeat(10), ideaType: 'faq' }],
      ['/ideas', 'POST', { memo: 'あ'.repeat(501), ideaType: 'faq' }],
      ['/plans', 'POST', { ideaId: before.ideas[0].id, ideaType: 'unknown' }],
      ['/outlines', 'POST', { planId, targetSeconds: 0 }],
      ['/outlines', 'POST', { planId, targetSeconds: 1801 }],
      ['/outlines', 'POST', { planId, targetSeconds: 1.5 }],
      ['/outlines', 'POST', { planId, targetSeconds: '480' }],
      ['/schedules', 'POST', { planId, publishDate: '2026-02-29' }],
      ['/schedules', 'POST', { planId, publishDate: '2026-13-01' }],
      ['/schedules', 'POST', { planId, publishDate: '2027-01-29', shootDate: '2027-00-00' }],
      [`/tasks/${before.schedules[0].tasks[0].id}`, 'PATCH', { status: 'complete' }],
      ['/metrics', 'PUT', { month: '2026-13', views: 1, subsDelta: 1, retention: 1, conversions: 1 }],
      ['/metrics', 'PUT', { month: '2026-10', views: 1.5, subsDelta: 1, retention: 1, conversions: 1 }],
      ['/metrics', 'PUT', { month: '2026-10', views: 1, subsDelta: -1.5, retention: 1, conversions: 1 }],
      ['/metrics', 'PUT', { month: '2026-10', views: 1, subsDelta: 1, retention: 101, conversions: 1 }],
      [`/outlines/${outline.id}`, 'PUT', { blocks: outline.blocks.map((block: any) => ({ ...block, seq: 0 })) }],
      [`/outlines/${outline.id}`, 'PUT', { blocks: outline.blocks.map((block: any) => ({ ...block, talkingPoints: 'あ'.repeat(2001) })) }],
    ] as const) {
      const result = await h.call(cookie, project.base + suffix, method, input);
      assert.equal(result.response.status, 400, `${method} ${suffix}: ${JSON.stringify(result.data)}`);
    }
    assert.deepEqual((await h.call(cookie, project.base)).data, before);
  } finally { h.db.close(); }
});

test('security: honeypot has no DB side effects and infrastructure errors expose no details', async () => {
  const h = await apiHarness();
  try {
    const queryCount = h.db.queries.length;
    const ignored = await h.call('', '/api/projects', 'POST', { clientAlias: 'A社', website: 'https://bot.example' });
    assert.equal(ignored.response.status, 204);
    assert.equal(h.db.queries.length, queryCount);
    for (const error of [
      new Error('SECRET_CONNECTION_STRING and internal SQL schema'),
      new RangeError('SECRET_CONNECTION_STRING and internal SQL schema'),
      Object.assign(new Error('SECRET_CONNECTION_STRING and internal SQL schema'), { name: 'ValidationError' }),
      Object.assign(new Error('SECRET_CONNECTION_STRING and internal SQL schema'), { name: 'DomainError' }),
    ]) {
      const response = await h.worker.fetch(new Request('https://demo.example/api/bootstrap'), {
        DB: { prepare() { throw error; }, async batch() { return []; } },
      });
      assert.equal(response.status, 500);
      assert.doesNotMatch(await response.text(), /SECRET|CONNECTION|schema|SQL/);
    }
  } finally { h.db.close(); }
});

test('security: daily reset is scheduler-only, cascades all entities and rotates old cookies', async () => {
  const h = await apiHarness();
  try {
    const cookie = await h.session(), project = await h.project(cookie);
    const manual = await h.call(cookie, '/api/reset', 'POST', {});
    assert.equal(manual.response.status, 404);
    await h.worker.scheduled({ cron: '* * * * *' }, h.env);
    assert.equal((await h.call(cookie, project.base)).response.status, 200);
    await h.worker.scheduled({ cron: '0 18 * * *' }, h.env);
    for (const table of ['sessions', 'projects', 'channel_designs', 'ideas', 'plan_sheets', 'script_outlines', 'script_blocks', 'schedules', 'tasks', 'edit_briefs', 'monthly_metrics']) {
      assert.equal(h.db.sqlite.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get()?.count, 0, `${table} must reset`);
    }
    const refreshed = await h.call(cookie, '/api/bootstrap');
    assert.deepEqual(refreshed.data.projects, []);
    assert.notEqual(refreshed.response.headers.get('set-cookie')?.split(';')[0], cookie);
    assert.equal((await h.call(cookie, project.base)).response.status, 404);
  } finally { h.db.close(); }
});


test('security: six fully populated valid Unicode script blocks fit the body limit', async () => {
  const h = await apiHarness();
  try {
    const cookie = await h.session(), project = await h.project(cookie);
    const outline = project.data.outlines[0];
    const blocks = outline.blocks.map((block: any) => ({
      seq: block.seq, talkingPoints: '😊'.repeat(2000), shootMemo: '😊'.repeat(1000),
    }));
    const saved = await h.call(cookie, `${project.base}/outlines/${outline.id}`, 'PUT', { blocks });
    assert.equal(saved.response.status, 200, JSON.stringify(saved.data));
    assert.equal(saved.data.outlines[0].blocks[0].talkingPoints, '😊'.repeat(2000));
    assert.equal(saved.data.outlines[0].blocks[0].shootMemo, '😊'.repeat(1000));
  } finally { h.db.close(); }
});

test('correctness: changed plans, outlines, notes and schedules cannot expose stale derived briefs', async () => {
  const h = await apiHarness();
  try {
    const cookie = await h.session(), project = await h.project(cookie), unrelated = await h.project(cookie);
    const planId = project.data.plans[0].id;
    let snapshot = project.data;
    const createBrief = async () => {
      const result = await h.call(cookie, project.base + '/edit-briefs', 'POST', { planId });
      assert.equal(result.response.status, 200);
      return result.data;
    };
    const outline = snapshot.outlines[0];
    const updateNotes = await h.call(cookie, `${project.base}/outlines/${outline.id}`, 'PUT', {
      blocks: outline.blocks.map((block: any) => ({ seq: block.seq, talkingPoints: '変更した説明', shootMemo: '変更した撮影指示' })),
    });
    assert.equal(updateNotes.response.status, 200);
    assert.equal(updateNotes.data.editBriefs.length, 0, 'editing notes must invalidate the previously generated brief');
    snapshot = await createBrief();
    assert.ok(snapshot.editBriefs[0].directions.every((direction: any) => direction.talkingPoints === '変更した説明' && direction.shootMemo === '変更した撮影指示'));
    const scheduled = await h.call(cookie, project.base + '/schedules', 'POST', { planId, publishDate: '2027-02-26' });
    assert.equal(scheduled.response.status, 200);
    assert.equal(scheduled.data.editBriefs.length, 0, 'changing deadlines must invalidate the old brief due date');
    snapshot = await createBrief();
    assert.equal(snapshot.editBriefs[0].dueDate, snapshot.schedules[0].tasks.find((task: any) => task.step === 'draft').due);
    const regenerated = await h.call(cookie, project.base + '/outlines', 'POST', { planId, targetSeconds: 90 });
    assert.equal(regenerated.response.status, 200);
    assert.equal(regenerated.data.editBriefs.length, 0);
    snapshot = await createBrief();
    assert.equal(snapshot.editBriefs[0].directions.reduce((total: number, direction: any) => total + direction.seconds, 0), 90);
    const changedPlan = await h.call(cookie, project.base + '/plans', 'POST', { ideaId: snapshot.ideas[0].id, ideaType: 'day' });
    assert.equal(changedPlan.response.status, 200);
    assert.equal(changedPlan.data.outlines.length, 0, 'changing the idea type must invalidate the old type-specific outline');
    assert.equal(changedPlan.data.editBriefs.length, 0);
    assert.deepEqual((await h.call(cookie, unrelated.base)).data, unrelated.data, 'invalidation must leave unrelated project data intact');
  } finally { h.db.close(); }
});

test('correctness: integer monthly differences retain exact safe-integer precision', async () => {
  const { buildMonthlyReport } = await import('../src/core/index.ts');
  for (const value of [9007199254740990, 4000000000000001]) {
    const report = buildMonthlyReport({ views: value, subsDelta: value, retention: 0, conversions: value }, { views: 0, subsDelta: 0, retention: 0, conversions: 0 });
    for (const metric of report.metrics.filter(metric => metric.key !== 'retention')) assert.equal(metric.difference, value);
  }
});

test('correctness: accepted tiny nonzero previous retention never emits non-finite JSON numbers', async () => {
  const { buildMonthlyReport } = await import('../src/core/index.ts');
  const report = buildMonthlyReport({ views: 0, subsDelta: 0, retention: 50, conversions: 0 }, { views: 0, subsDelta: 0, retention: Number.MIN_VALUE, conversions: 0 });
  const metric = report.metrics.find(metric => metric.key === 'retention')!;
  assert.ok(metric.changeRate === null || Number.isFinite(metric.changeRate));
  if (metric.changeRate === null) assert.ok(metric.note.trim(), 'an unrepresentable rate needs an explicit note');
});
