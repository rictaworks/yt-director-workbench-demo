import assert from 'node:assert/strict';
import { test } from 'node:test';
import { CATALOG, addBusinessDays, addCalendarDays, buildMonthlyReport, buildPlanSheet, buildScriptOutline, businessDaysBetween, classifyIdea, designChannel, isBusinessDay, scheduleBackward, validateDate } from '../src/core/index.ts';
import type { ClassifierRawResult } from '../src/core/index.ts';

const baseline: ClassifierRawResult = { selectedIdeaType: 'faq', confidence: .8, candidates: [{ ideaType: 'faq', probability: .6 }, { ideaType: 'howto', probability: .4 }], cautionProbability: .5, model: 'jev-1.13.0' };
test('every supported length and idea type keeps exact total seconds and main-only rounding', () => {
  const channel = designChannel('btob', 'sales');
  for (const ideaType of CATALOG.ideaTypes) {
    const plan = buildPlanSheet(channel, ideaType.id, '企画の具体的なテーマ');
    for (let seconds = 1; seconds <= 1800; seconds++) {
      const outline = buildScriptOutline(plan, seconds);
      assert.equal(outline.blocks.reduce((n, b) => n + b.seconds, 0), seconds);
      assert.ok(outline.blocks.every(b => Number.isInteger(b.seconds) && b.seconds >= 0));
      if (seconds >= 60) {
        const template = CATALOG.outlines.find(x => x.ideaType === ideaType.id)!;
        for (let i = 0; i < template.blocks.length; i++) if (template.blocks[i]!.kind !== 'main') assert.equal(outline.blocks[i]!.seconds, Math.floor(template.blocks[i]!.ratio * seconds));
      }
    }
  }
});
test('optimized calendar matches a day-by-day reference across leap and year boundaries', () => {
  const naive = (start: string, n: number) => {
    const date = new Date(`${start}T00:00:00Z`); let remaining = Math.abs(n); const direction = n < 0 ? -1 : 1;
    while (remaining > 0) { date.setUTCDate(date.getUTCDate() + direction); if (date.getUTCDay() !== 0 && date.getUTCDay() !== 6) remaining--; }
    return date.toISOString().slice(0, 10);
  };
  for (const start of ['0001-03-01','0099-03-01','2000-02-25','2026-12-25','2028-02-25','9998-12-25']) {
    for (let offset = 0; offset < 14; offset++) for (let days = -40; days <= 40; days++) {
      const date = addCalendarDays(start, offset);
      assert.equal(addBusinessDays(date, days), naive(date, days));
    }
  }
});
test('business-day distance matches inclusive destination and exclusive starting date', () => {
  for (let offset = 0; offset < 14; offset++) for (let days = 0; days < 40; days++) {
    const start = addCalendarDays('2026-12-25', offset), end = addCalendarDays(start, days);
    let naive = 0;
    for (let n = 1; n <= days; n++) if (isBusinessDay(addCalendarDays(start, n))) naive++;
    assert.equal(businessDaysBetween(start, end), naive);
    assert.equal(businessDaysBetween(end, start), days === 0 ? 0 : -naive);
  }
});
test('all sample fixed schedules preserve shoot/publish and nondecreasing milestones', () => {
  for (let publishOffset = 0; publishOffset < 35; publishOffset++) for (let shootOffset = 0; shootOffset <= publishOffset; shootOffset++) {
    const publish = addCalendarDays('2026-10-09', publishOffset), shoot = addCalendarDays('2026-10-09', shootOffset);
    const result = scheduleBackward(publish, '2026-10-09', shoot);
    assert.equal(result.shootDate, shoot); assert.equal(result.publishDate, publish);
    assert.equal(result.tasks.at(-1)!.due, publish);
    assert.ok(result.tasks.every((task, i) => i === 0 || task.due >= result.tasks[i - 1]!.due));
    assert.equal(result.compressed, businessDaysBetween(shoot, publish) < 6);
    assert.ok(result.earliestPublishDate >= result.earliestShootDate);
  }
});
test('format validation rejects impossible values at boundaries without normalization', () => {
  for (const invalid of ['0000-01-01','0100-02-29','1900-02-29','2026-04-31','2026-01-01T00:00:00Z',null,0]) assert.throws(() => validateDate(invalid));
  assert.equal(validateDate('0001-01-01'), '0001-01-01');
  assert.equal(validateDate('2000-02-29'), '2000-02-29');
  assert.throws(() => addBusinessDays('2026-01-01', .5));
  assert.throws(() => addBusinessDays('2026-01-01', Infinity));
  assert.throws(() => addBusinessDays('9999-12-31', 1));
  assert.throws(() => addBusinessDays('0001-01-01', -1));
});
test('literal replacement metacharacters in audience cannot rewrite templates', () => {
  const audience = '$& $$ $` $\'';
  const result = buildPlanSheet(designChannel('btob', 'leads', audience), 'faq', '質問と回答をまとめる');
  assert.ok(result.titles[2]!.includes(audience));
  assert.ok(result.aim.includes(audience));
  assert.ok(!result.aim.includes('{target}'));
});
test('monthly integer metrics preserve safe-integer differences and extreme rates stay finite or explicit', () => {
  const previous = { views: 0, subsDelta: 0, retention: Number.MIN_VALUE, conversions: 0 };
  for (const views of [9_007_199_254_740_990,4_000_000_000_000_001,Number.MAX_SAFE_INTEGER]) {
    const result = buildMonthlyReport({ views, subsDelta: views, retention: 100, conversions: views }, previous);
    for (const metric of result.metrics.filter(x => x.key !== 'retention')) assert.equal(metric.difference, views);
    const retention = result.metrics.find(x => x.key === 'retention')!;
    assert.equal(retention.changeRate, null); assert.ok(retention.note.includes('計算範囲'));
  }
});
test('malformed classification results stop explicitly and cannot inject an unknown type', async () => {
  const invalid = [
    { ...baseline, selectedIdeaType: 'unknown' },
    { ...baseline, confidence: 1.001 },
    { ...baseline, cautionProbability: -.1 },
    { ...baseline, model: '' },
    { ...baseline, candidates: [] },
    { ...baseline, candidates: [{ ideaType: 'faq', probability: .6 }, { ideaType: 'faq', probability: .4 }] },
    { ...baseline, candidates: [{ ideaType: 'faq', probability: Infinity }, { ideaType: 'howto', probability: .4 }] },
    { ...baseline, selectedIdeaType: 'employee' },
  ];
  for (const result of invalid) {
    let calls = 0;
    const outcome = await classifyIdea('企画のメモ', { async classify() { calls++; return result as ClassifierRawResult; } });
    assert.equal(calls, 1); assert.equal(outcome.mode, 'manual'); assert.equal(outcome.error?.code, 'classification_failed'); assert.equal(outcome.selectedIdeaType, null);
  }
});
test('channel and generated outputs cannot mutate catalog state', () => {
  const before = JSON.stringify(CATALOG);
  const channel = designChannel('clinic', 'leads');
  channel.cautions.push('変更'); channel.nonRecommended[0]!.reason = '変更'; channel.recommended.push('employee');
  const plan = buildPlanSheet(channel, 'faq', '診療の質問と回答');
  const outline = buildScriptOutline(plan); outline.checklist[0]!.cut = '変更'; outline.blocks[0]!.talkingPoints = '変更';
  assert.equal(JSON.stringify(CATALOG), before);
});
