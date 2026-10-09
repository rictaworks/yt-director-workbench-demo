import assert from 'node:assert/strict';
import { test } from 'node:test';
import { D1ProjectRepository, RepositoryNotFoundError } from '../src/backend/repository.ts';
import type { ChannelDesign, EditBrief, PlanSheet, Schedule, ScriptOutline } from '../src/core/types.ts';
import { createTestDatabase } from './helpers/sqlite.ts';

const channel: ChannelDesign = {
  industry: 'career', goal: 'leads', industryLabel: '転職エージェント', goalLabel: '集客',
  target: '転職を検討している方', targetDefaulted: true,
  recommended: ['howto', 'faq', 'case'], nonRecommended: [{ ideaType: 'ranking', reason: '公平な比較が必要' }], cautions: ['転職成功を保証しない'],
};
const idea = { memo: '面接対策のポイントを解説', ideaType: 'howto' as const, confidence: 0.91, classifiedBy: 'jev' as const, jevModel: 'jev-1.13.0', classification: null };
const plan: PlanSheet = { channel, ideaType: 'howto', ideaTypeLabel: 'ノウハウ解説', memo: idea.memo, titles: ['面接対策3選', '面接で何を話す？', '面接対策の基本'], thumbTexts: ['面接の基本', '対策3選'], aim: '問い合わせの検討につなげる', audience: channel.target, summary: idea.memo, summaryTruncated: false, nonRecommended: false, warnings: [] };
const outline: ScriptOutline = { ideaType: 'howto', targetSeconds: 60, shorts: false, blocks: [{ seq: 0, kind: 'hook', label: 'フック', seconds: 10, talkingPoints: '', shootMemo: '' }, { seq: 1, kind: 'main', label: '本論', seconds: 40, talkingPoints: '', shootMemo: '' }, { seq: 2, kind: 'cta', label: 'CTA', seconds: 10, talkingPoints: '', shootMemo: '' }], checklist: [{ seq: 0, block: 'フック', cut: '正面', prop: '資料', position: '中央' }], warnings: [] };
const schedule: Schedule = { publishDate: '2026-11-06', shootDate: '2026-10-30', fixedShootDate: false, tasks: [{ step: 'plan', label: '企画確定', due: '2026-10-26', status: 'todo' }, { step: 'script', label: '台本確定', due: '2026-10-28', status: 'todo' }, { step: 'shoot', label: '撮影', due: '2026-10-30', status: 'todo' }, { step: 'draft', label: '編集初稿', due: '2026-11-03', status: 'todo' }, { step: 'revision', label: '修正', due: '2026-11-05', status: 'todo' }, { step: 'publish', label: '投稿', due: '2026-11-06', status: 'todo' }], compressed: false, insufficient: false, status: 'ready', earliestPublishDate: '2026-10-23', earliestShootDate: '2026-10-16', shootNeedsReschedule: false, warnings: [], calendarNote: '土日を除く営業日。祝日は考慮しません。' };
const brief: EditBrief = { title: '面接対策', dueDate: '2026-11-03', directions: [{ seq: 0, block: 'フック', seconds: 10, captions: '転職成功を保証しない', bgm: '声を優先', cuts: '正面', talkingPoints: '要点', shootMemo: '資料を持つ' }], cautions: channel.cautions, notice: 'テンプレート出力' };

async function setup() {
  const db = createTestDatabase();
  const repository = new D1ProjectRepository(db);
  await repository.createSession('a', '2026-10-09T00:00:00.000Z');
  await repository.createSession('b', '2026-10-09T00:00:00.000Z');
  const project = await repository.createProject('a', 'A社');
  return { db, repository, project };
}

async function completeProject(repository: D1ProjectRepository, projectId: string) {
  const savedChannel = await repository.saveChannel('a', projectId, channel);
  const savedIdea = await repository.saveIdea('a', projectId, idea);
  const savedPlan = await repository.savePlan('a', projectId, savedIdea.id, plan);
  const savedOutline = await repository.saveOutline('a', projectId, savedPlan.id, outline);
  const savedSchedule = await repository.saveSchedule('a', projectId, savedPlan.id, schedule);
  const savedBrief = await repository.saveEditBrief('a', projectId, savedPlan.id, brief);
  const savedMetric = await repository.saveMetric('a', projectId, { month: '2026-10', views: 100, subsDelta: 5, retention: 43.2, conversions: 7 });
  return { savedChannel, savedIdea, savedPlan, savedOutline, savedSchedule, savedBrief, savedMetric };
}

test('full workflow persists all eleven entities and reconstructs flattened artifact records', async () => {
  const { db, repository, project } = await setup();
  const artifacts = await completeProject(repository, project.id);
  const loaded = await repository.getProject('a', project.id);
  assert.ok(loaded);
  assert.equal(loaded.id, project.id);
  assert.deepEqual(loaded.channel, artifacts.savedChannel);
  assert.deepEqual(loaded.ideas, [artifacts.savedIdea]);
  assert.deepEqual(loaded.plans, [artifacts.savedPlan]);
  assert.deepEqual(loaded.outlines, [artifacts.savedOutline]);
  assert.deepEqual(loaded.schedules, [artifacts.savedSchedule]);
  assert.deepEqual(loaded.editBriefs, [artifacts.savedBrief]);
  assert.deepEqual(loaded.metrics, [artifacts.savedMetric]);
  assert.equal(loaded.outlines[0]?.blocks.reduce((sum, block) => sum + block.seconds, 0), 60);
  assert.equal(loaded.schedules[0]?.tasks.length, 6);
  assert.equal(loaded.ideas[0]?.jevModel, 'jev-1.13.0');
  assert.equal(await repository.sessionExists('a'), true);
  assert.equal(await repository.sessionExists('unknown'), false);
  assert.deepEqual(db.sqlite.prepare('PRAGMA foreign_key_check').all(), []);
  db.close();
});

test('every relationship rejects writes from another session or the wrong project', async () => {
  const { db, repository, project } = await setup();
  const artifacts = await completeProject(repository, project.id);
  const ownOtherProject = await repository.createProject('a', '別案件');
  const taskId = artifacts.savedSchedule.tasks[0]!.id;
  for (const [session, projectId] of [['b', project.id], ['a', ownOtherProject.id]]) {
    assert.ok(session && projectId);
    for (const action of [
      () => repository.savePlan(session, projectId, artifacts.savedIdea.id, plan),
      () => repository.saveOutline(session, projectId, artifacts.savedPlan.id, outline),
      () => repository.saveSchedule(session, projectId, artifacts.savedPlan.id, schedule),
      () => repository.updateTask(session, projectId, taskId, 'done'),
      () => repository.updateOutlineBlocks(session, projectId, artifacts.savedOutline.id, [{ seq: 0, talkingPoints: '書換え', shootMemo: '' }]),
      () => repository.saveEditBrief(session, projectId, artifacts.savedPlan.id, brief),
    ]) await assert.rejects(action, RepositoryNotFoundError);
  }
  for (const action of [
    () => repository.saveChannel('b', project.id, channel),
    () => repository.saveIdea('b', project.id, idea),
    () => repository.saveMetric('b', project.id, { month: '2026-10', views: 1, subsDelta: 1, retention: 1, conversions: 1 }),
  ]) await assert.rejects(action, RepositoryNotFoundError);
  assert.equal(await repository.getProject('b', project.id), null);
  assert.deepEqual(await repository.listProjects('b'), []);
  assert.equal((await repository.getProject('a', project.id))?.schedules[0]?.tasks[0]?.status, 'todo');
  assert.equal((await repository.getProject('a', project.id))?.outlines[0]?.blocks[0]?.talkingPoints, '');
  db.close();
});

test('upserts keep cardinalities and task status survives schedule recalculation', async () => {
  const { db, repository, project } = await setup();
  const saved = await completeProject(repository, project.id);
  const updatedChannel = await repository.saveChannel('a', project.id, { ...channel, target: '経験者' });
  assert.equal(updatedChannel.id, saved.savedChannel.id);
  const changedPlan = await repository.savePlan('a', project.id, saved.savedIdea.id, { ...plan, ideaType: 'faq' });
  assert.equal(changedPlan.id, saved.savedPlan.id);
  const ideaAfter = (await repository.getProject('a', project.id))!.ideas[0]!;
  assert.equal(ideaAfter.ideaType, 'faq');
  assert.equal(ideaAfter.classifiedBy, 'manual');
  assert.equal(ideaAfter.jevModel, 'jev-1.13.0');
  const afterPlan = (await repository.getProject('a', project.id))!;
  assert.equal(afterPlan.outlines.length, 0);
  assert.equal(afterPlan.editBriefs.length, 0);
  assert.equal(afterPlan.schedules.length, 1);
  const task = saved.savedSchedule.tasks[0]!;
  await repository.updateTask('a', project.id, task.id, 'done');
  const newSchedule = await repository.saveSchedule('a', project.id, saved.savedPlan.id, { ...schedule, publishDate: '2026-11-09' });
  assert.equal(newSchedule.id, saved.savedSchedule.id);
  assert.equal(newSchedule.tasks[0]?.id, task.id);
  assert.equal(newSchedule.tasks[0]?.status, 'done');
  const newOutline = await repository.saveOutline('a', project.id, saved.savedPlan.id, outline);
  assert.notEqual(newOutline.id, saved.savedOutline.id);
  await repository.saveEditBrief('a', project.id, saved.savedPlan.id, { ...brief, title: '改訂版' });
  const metric = await repository.saveMetric('a', project.id, { month: '2026-10', views: 120, subsDelta: 6, retention: 45, conversions: 8 });
  assert.equal(metric.id, saved.savedMetric.id);
  const loaded = (await repository.getProject('a', project.id))!;
  for (const items of [loaded.plans, loaded.outlines, loaded.schedules, loaded.editBriefs, loaded.metrics]) assert.equal(items.length, 1);
  assert.equal(loaded.metrics[0]?.views, 120);
  assert.equal(loaded.outlines[0]?.blocks.length, outline.blocks.length);
  assert.equal(loaded.schedules[0]?.tasks.length, schedule.tasks.length);
  db.close();
});

test('editable notes are persisted in normalized blocks and cannot replace ownership or timing', async () => {
  const { db, repository, project } = await setup();
  const saved = await completeProject(repository, project.id);
  const changed = await repository.updateOutlineBlocks('a', project.id, saved.savedOutline.id, [{ seq: 0, talkingPoints: '<script>alert(1)</script>要点', shootMemo: '固定カメラ' }]);
  assert.equal(changed.blocks[0]?.talkingPoints, '<script>alert(1)</script>要点');
  assert.equal(changed.blocks[0]?.seconds, 10);
  assert.equal(changed.blocks[0]?.sessionId, 'a');
  assert.equal((await repository.getProject('a', project.id))?.outlines[0]?.blocks[0]?.shootMemo, '固定カメラ');
  assert.equal((await repository.getProject('a', project.id))?.editBriefs.length, 0);
  await assert.rejects(() => repository.updateOutlineBlocks('a', project.id, saved.savedOutline.id, [{ seq: 999, talkingPoints: 'X', shootMemo: '' }]), RepositoryNotFoundError);
  await assert.rejects(() => repository.updateOutlineBlocks('a', project.id, saved.savedOutline.id, [{ seq: 0, talkingPoints: 'X', shootMemo: '' }, { seq: 0, talkingPoints: 'Y', shootMemo: '' }]), RepositoryNotFoundError);
  db.close();
});

test('nested writes rollback completely when a child violates database constraints', async () => {
  const { db, repository, project } = await setup();
  const saved = await completeProject(repository, project.id);
  await assert.rejects(() => repository.saveOutline('a', project.id, saved.savedPlan.id, { ...outline, targetSeconds: 100, blocks: [outline.blocks[0]!, { ...outline.blocks[1]!, seconds: -1 }] }), /CHECK/);
  assert.deepEqual((await repository.getProject('a', project.id))?.outlines[0], saved.savedOutline);
  await assert.rejects(() => repository.saveSchedule('a', project.id, saved.savedPlan.id, { ...schedule, publishDate: '2026-11-09', tasks: [{ ...schedule.tasks[0]!, due: '2026-13-01' }] }), /CHECK/);
  assert.deepEqual((await repository.getProject('a', project.id))?.schedules[0], saved.savedSchedule);
  db.close();
});

test('every ordinary SQL operation includes and binds its session; reset is the only global operation', async () => {
  const { db, repository, project } = await setup();
  const saved = await completeProject(repository, project.id);
  await repository.updateTask('a', project.id, saved.savedSchedule.tasks[0]!.id, 'in_progress');
  await repository.updateOutlineBlocks('a', project.id, saved.savedOutline.id, [{ seq: 0, talkingPoints: '要点', shootMemo: '' }]);
  await repository.listProjects('a');
  for (const query of db.queries) {
    assert.match(query.sql, /\bsession_id\b/i, query.sql);
    assert.ok(query.values.includes('a') || query.values.includes('b'), query.sql);
    if (/^\s*(SELECT|UPDATE|DELETE)/i.test(query.sql)) assert.match(query.sql, /WHERE[\s\S]*session_id\s*=\s*\?/i, query.sql);
  }
  await repository.resetAll();
  assert.equal(db.queries.at(-1)?.sql, 'DELETE FROM sessions');
  for (const table of ['sessions', 'projects', 'channel_designs', 'ideas', 'plan_sheets', 'script_outlines', 'script_blocks', 'schedules', 'tasks', 'edit_briefs', 'monthly_metrics']) assert.equal(db.sqlite.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get()?.count, 0, table);
  assert.equal(await repository.sessionExists('a'), false);
  assert.deepEqual(await repository.listProjects('a'), []);
  db.close();
});

test('raw composite foreign keys reject cross-session references on every child table', async () => {
  const { db, repository, project } = await setup();
  await completeProject(repository, project.id);
  for (const table of ['channel_designs', 'ideas', 'plan_sheets', 'script_outlines', 'script_blocks', 'schedules', 'tasks', 'edit_briefs', 'monthly_metrics']) {
    const columns = db.sqlite.prepare(`PRAGMA table_info(${table})`).all().map(row => String(row.name));
    const source = db.sqlite.prepare(`SELECT * FROM ${table} LIMIT 1`).get()!;
    const values = columns.map(column => column === 'id' ? crypto.randomUUID() : column === 'session_id' ? 'b' : source[column]);
    assert.throws(() => db.sqlite.prepare(`INSERT INTO ${table} (${columns.join(',')}) VALUES (${columns.map(() => '?').join(',')})`).run(...values), /FOREIGN KEY/, table);
  }
  db.close();
});


test('regeneration invalidates derived briefs while identical plan saves preserve work', async () => {
  const { db, repository, project } = await setup();
  const saved = await completeProject(repository, project.id);
  await repository.savePlan('a', project.id, saved.savedIdea.id, plan);
  let current = (await repository.getProject('a', project.id))!;
  assert.equal(current.outlines[0]?.id, saved.savedOutline.id);
  assert.equal(current.editBriefs[0]?.id, saved.savedBrief.id);
  await repository.saveOutline('a', project.id, saved.savedPlan.id, outline);
  current = (await repository.getProject('a', project.id))!;
  assert.equal(current.editBriefs.length, 0);
  await repository.saveEditBrief('a', project.id, saved.savedPlan.id, brief);
  await repository.saveSchedule('a', project.id, saved.savedPlan.id, schedule);
  current = (await repository.getProject('a', project.id))!;
  assert.equal(current.editBriefs.length, 0);
  assert.equal(current.outlines.length, 1);
  db.close();
});

test('normalized identity fields take precedence over any extra payload fields', async () => {
  const { db, repository, project } = await setup();
  const data = { ...channel, sessionId: 'b', id: 'forged', projectId: 'another' };
  const saved = await repository.saveChannel('a', project.id, data);
  assert.equal(saved.sessionId, 'a');
  assert.equal(saved.projectId, project.id);
  assert.notEqual(saved.id, 'forged');
  const restored = (await repository.getProject('a', project.id))?.channel;
  assert.deepEqual(restored, saved);
  db.close();
});

test('uncertain classification is stored without an automatic selection and retains Jev provenance after manual choice', async () => {
  const { db, repository, project } = await setup();
  const classification = { mode: 'selection' as const, selectedIdeaType: null, confidence: 0.7, candidates: [{ ideaType: 'howto' as const, confidence: 0.7 }, { ideaType: 'faq' as const, confidence: 0.6 }], otherAvailable: true, cautionProbability: 0.6, cautions: ['断定を避ける'], model: 'jev-1.13.0', error: null };
  const saved = await repository.saveIdea('a', project.id, { ...idea, ideaType: null, confidence: classification.confidence, classification });
  assert.equal(saved.ideaType, null);
  assert.deepEqual(saved.classification, classification);
  await repository.savePlan('a', project.id, saved.id, { ...plan, ideaType: 'faq' });
  const restored = (await repository.getProject('a', project.id))!.ideas[0]!;
  assert.equal(restored.ideaType, 'faq');
  assert.equal(restored.classifiedBy, 'manual');
  assert.equal(restored.jevModel, 'jev-1.13.0');
  assert.deepEqual(restored.classification, classification);
  db.close();
});
