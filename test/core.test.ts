import assert from 'node:assert/strict';
import { test } from 'node:test';
import { CATALOG, DomainValidationError, addBusinessDays, businessDaysBetween, buildEditBrief, buildMonthlyReport, buildPlanSheet, buildScriptOutline, classifyIdea, designChannel, judgeDelay, scheduleBackward, validateDate, validateMemo } from '../src/core/index.ts';
import type { ClassifierRawResult, IdeaClassifierPort } from '../src/core/index.ts';

const channel = () => designChannel('btob', 'leads', '業務改善を検討する担当者');
const plan = () => buildPlanSheet(channel(), 'howto', '業務改善の手順をわかりやすく説明します。');
const raw = (overrides: Partial<ClassifierRawResult> = {}): ClassifierRawResult => ({ selectedIdeaType: 'faq', confidence: .8, candidates: [{ ideaType: 'howto', probability: .6 }, { ideaType: 'faq', probability: .4 }], cautionProbability: .5, model: 'jev-1.13.0', ...overrides });
const port = (value: ClassifierRawResult): IdeaClassifierPort => ({ async classify() { return value; } });

test('master data implements all ten specified category counts (spec arithmetic is 107)', () => {
  assert.deepEqual(Object.fromEntries(Object.entries(CATALOG).map(([k, v]) => [k, v.length])), { industries: 6, goals: 3, ideaTypes: 8, recommendations: 18, outlines: 8, titles: 24, thumbnails: 16, cautions: 6, steps: 6, measureRules: 12 });
  assert.equal(Object.values(CATALOG).reduce((n, rows) => n + rows.length, 0), 107);
  for (const type of CATALOG.ideaTypes) {
    assert.equal(CATALOG.titles.filter(t => t.ideaType === type.id).length, 3);
    assert.equal(CATALOG.thumbnails.filter(t => t.ideaType === type.id).length, 2);
    const outline = CATALOG.outlines.find(t => t.ideaType === type.id)!;
    assert.equal(outline.blocks.filter(b => b.kind === 'main').length, 1);
    assert.ok(Math.abs(outline.blocks.reduce((n, b) => n + b.ratio, 0) - 1) < 1e-9);
  }
  for (const recommendation of CATALOG.recommendations) {
    assert.equal(new Set(recommendation.recommended).size, 3);
    assert.ok(recommendation.nonRecommended.length > 0);
    assert.ok(recommendation.nonRecommended.every(x => !recommendation.recommended.includes(x.ideaType)));
  }
});
test('channel defaults are explicit and every industry/goal has a mapping', () => {
  for (const industry of CATALOG.industries) for (const goal of CATALOG.goals) {
    const result = designChannel(industry.id, goal.id);
    assert.equal(result.targetDefaulted, true);
    assert.equal(result.recommended.length, 3);
    assert.ok(result.cautions.length > 0);
  }
  assert.equal(channel().targetDefaulted, false);
  assert.equal(designChannel('clinic', 'leads', '  ').targetDefaulted, true);
  assert.throws(() => designChannel('invalid' as never, 'leads'), DomainValidationError);
  assert.throws(() => designChannel('btob', 'invalid' as never), DomainValidationError);
  assert.throws(() => designChannel('btob', 'leads', 'あ'.repeat(201)), DomainValidationError);
  assert.equal(designChannel('btob', 'leads', '😀'.repeat(200)).target.length, 400);
});
test('memo validates before a classifier can be invoked', async () => {
  let calls = 0;
  const p: IdeaClassifierPort = { async classify() { calls++; return raw(); } };
  for (const memo of ['', ' ', '字', 'a'.repeat(501), ' '.repeat(501)]) await assert.rejects(() => classifyIdea(memo, p), DomainValidationError);
  assert.equal(calls, 0);
  assert.equal(validateMemo(' 😀😀 '), '😀😀');
  await classifyIdea('字'.repeat(500), p);
  assert.equal(calls, 1);
});
test('classification uses Jev confidence and selected choice separately from probabilities', async () => {
  const result = await classifyIdea('質問について', port(raw()), 'clinic');
  assert.equal(result.mode, 'automatic');
  assert.equal(result.selectedIdeaType, 'faq');
  assert.equal(result.confidence, .8);
  assert.equal(result.candidates[0]?.ideaType, 'howto');
  assert.equal(result.model, 'jev-1.13.0');
  assert.ok(result.cautions.length > 0);
  const uncertain = await classifyIdea('質問について', port(raw({ confidence: .799, cautionProbability: .499 })));
  assert.equal(uncertain.mode, 'selection');
  assert.equal(uncertain.selectedIdeaType, null);
  assert.equal(uncertain.candidates.length, 2);
  assert.equal(uncertain.otherAvailable, true);
  assert.deepEqual(uncertain.cautions, []);
});
test('classifier receives both exact industry cautions and all eight choices', async () => {
  await classifyIdea('診療の質問です', { async classify(input) { assert.equal(input.industry, 'clinic'); assert.equal(input.choices.length, 8); assert.ok(input.cautions.some(x => x.includes('治療効果'))); return raw(); } }, 'clinic');
});
test('classification failures explicitly stop without another classification', async () => {
  for (const error of [new Error('failure'), Object.assign(new Error('quota'), { code: 'quota_exceeded' })]) {
    let calls = 0;
    const result = await classifyIdea('企画について', { async classify() { calls++; throw error; } });
    assert.equal(calls, 1); assert.equal(result.mode, 'manual'); assert.equal(result.selectedIdeaType, null); assert.equal(result.model, null); assert.deepEqual(result.candidates, []);
    assert.equal(result.error?.code, 'code' in error ? 'quota_exceeded' : 'classification_failed');
  }
  const result = await classifyIdea('企画について', port(raw({ confidence: Number.NaN })));
  assert.equal(result.mode, 'manual');
});
test('plan includes title variants, summary excerpt and non-recommended warning', () => {
  const result = buildPlanSheet(designChannel('clinic', 'leads'), 'ranking', '😀'.repeat(130));
  assert.equal(result.titles.length, 3); assert.equal(result.thumbTexts.length, 2);
  assert.equal(Array.from(result.summary).length, 120); assert.equal(result.summaryTruncated, true);
  assert.equal(result.nonRecommended, true); assert.ok(result.warnings.some(w => w.code === 'non_recommended'));
  const long = buildPlanSheet(designChannel('career', 'leads', 'あ'.repeat(200)), 'howto', '転職の手順');
  assert.ok(long.titles.every(t => Array.from(t).length <= 40));
  assert.equal(long.audience, 'あ'.repeat(200));
});
test('all types allocate integer seconds exactly, including shorts and boundaries', () => {
  for (const ideaType of CATALOG.ideaTypes) for (const seconds of [1, 2, 3, 59, 60, 61, 479, 480, 1799, 1800]) {
    const outline = buildScriptOutline(buildPlanSheet(channel(), ideaType.id, '具体的な企画です'), seconds);
    assert.equal(outline.blocks.reduce((n, b) => n + b.seconds, 0), seconds);
    assert.ok(outline.blocks.every(b => Number.isInteger(b.seconds) && b.seconds >= 0));
    assert.equal(outline.blocks.length, seconds < 60 ? 3 : 6);
    assert.equal(outline.checklist.length, outline.blocks.length);
    assert.ok(outline.blocks.every(b => b.talkingPoints === '' && b.shootMemo === ''));
  }
  assert.equal(buildScriptOutline(plan()).targetSeconds, 480);
  for (const seconds of [0, -1, 1801, 60.5, NaN, Infinity]) assert.throws(() => buildScriptOutline(plan(), seconds), DomainValidationError);
});
test('calendar validates real dates and handles weekends and leap years deterministically', () => {
  assert.equal(validateDate('2028-02-29'), '2028-02-29');
  for (const date of ['2026-02-29', '2026-13-01', '2026-01-32', '2026-1-01', 'foo']) assert.throws(() => validateDate(date), DomainValidationError);
  assert.equal(addBusinessDays('2026-10-09', 1), '2026-10-12');
  assert.equal(addBusinessDays('2026-10-12', -1), '2026-10-09');
  assert.equal(addBusinessDays('2028-02-28', 2), '2028-03-01');
  assert.equal(businessDaysBetween('2026-10-09', '2026-10-12'), 1);
  assert.equal(businessDaysBetween('2026-10-09', '2026-10-11'), 0);
  assert.equal(addBusinessDays('2026-10-09', 0), '2026-10-09');
});
test('normal reverse schedule excludes weekends, ignores holidays and finds shortest date', () => {
  const result = scheduleBackward('2026-10-30', '2026-10-09');
  assert.equal(result.insufficient, false); assert.equal(result.compressed, false);
  assert.deepEqual(result.tasks.map(t => [t.step, t.due]), [['plan','2026-10-19'], ['script','2026-10-21'], ['shoot','2026-10-22'], ['draft','2026-10-27'], ['revision','2026-10-29'], ['publish','2026-10-30']]);
  assert.equal(result.earliestPublishDate, '2026-10-22');
  assert.ok(result.calendarNote.includes('祝日'));
  assert.equal(scheduleBackward('2026-10-22', '2026-10-09').insufficient, false);
  assert.equal(scheduleBackward('2026-10-21', '2026-10-09').insufficient, true);
  assert.equal(scheduleBackward('2026-10-09', '2026-10-09').insufficient, true);
});
test('fixed shooting remains fixed, compressed dates stay ordered and earliest date respects prep', () => {
  const compressed = scheduleBackward('2026-10-30', '2026-10-09', '2026-10-28');
  assert.equal(compressed.shootDate, '2026-10-28'); assert.equal(compressed.compressed, true);
  assert.equal(compressed.earliestPublishDate, '2026-11-05');
  assert.ok(compressed.tasks.every((t, i, tasks) => i === 0 || t.due >= tasks[i - 1]!.due));
  const impossible = scheduleBackward('2026-10-30', '2026-10-09', '2026-10-12');
  assert.equal(impossible.insufficient, true); assert.equal(impossible.shootNeedsReschedule, true);
  assert.equal(impossible.earliestShootDate, '2026-10-14');
  assert.throws(() => scheduleBackward('2026-10-20', '2026-10-09', '2026-10-21'), DomainValidationError);
});
test('delay distinguishes overdue, next business day, completion, and weekend deadlines', () => {
  const tasks = scheduleBackward('2026-10-30', '2026-10-09').tasks;
  assert.equal(judgeDelay({ tasks: [{ ...tasks[0]!, due: '2026-10-12' }] }, '2026-10-09').status, 'warning');
  assert.equal(judgeDelay({ tasks: [{ ...tasks[0]!, due: '2026-10-09' }] }, '2026-10-10').status, 'delayed');
  assert.equal(judgeDelay({ tasks: [{ ...tasks[0]!, due: '2026-10-09', status: 'done' }] }, '2026-10-10').status, 'none');
  assert.equal(judgeDelay({ tasks: [] }, '2026-10-09').status, 'none');
  assert.throws(() => judgeDelay({ tasks: [{ ...tasks[0]!, status: 'invalid' as never }] }, '2026-10-09'), DomainValidationError);
});
test('edit brief carries caution, user fields, and exact first-draft deadline', () => {
  const p = plan(); const outline = buildScriptOutline(p); outline.blocks[0]!.talkingPoints = '最初に結論を伝える';
  const schedule = scheduleBackward('2026-10-30', '2026-10-09'); const brief = buildEditBrief(outline, p, schedule);
  assert.equal(brief.dueDate, schedule.tasks.find(t => t.step === 'draft')!.due);
  assert.equal(brief.directions[0]!.talkingPoints, '最初に結論を伝える');
  assert.ok(brief.directions.every(d => d.captions.includes(p.channel.cautions[0]!)));
  assert.equal(buildEditBrief(outline, p).dueDate, null);
});
test('monthly comparisons handle zero baseline, omitted month and deterministic max three rules', () => {
  const current = { views: 200, subsDelta: 5, retention: 40.5, conversions: 5 };
  const previous = { views: 100, subsDelta: 5, retention: 50, conversions: 5 };
  const result = buildMonthlyReport(current, previous);
  assert.equal(result.metrics[0]!.difference, 100); assert.equal(result.metrics[0]!.changeRate, 100);
  assert.equal(result.metrics[2]!.changeRate, -19);
  assert.equal(result.measures[0]!.id, 'cta-path'); assert.ok(result.measures.length <= 3);
  const zero = buildMonthlyReport(current, { views: 0, subsDelta: 0, retention: 0, conversions: 0 });
  assert.ok(zero.metrics.every(m => m.changeRate === null && m.note === '前月実績なし'));
  const missing = buildMonthlyReport(current); assert.equal(missing.hasPrevious, false); assert.deepEqual(missing.measures, []);
  assert.ok(missing.metrics.every(m => m.previous === null && m.difference === null && m.changeRate === null));
  for (const invalid of [{ ...current, views: -1 }, { ...current, subsDelta: .5 }, { ...current, retention: 101 }, { ...current, conversions: Infinity }, { ...current, views: Number.MAX_SAFE_INTEGER + 1 }]) assert.throws(() => buildMonthlyReport(invalid), DomainValidationError);
});
