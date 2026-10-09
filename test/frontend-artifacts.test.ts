import assert from 'node:assert/strict';
import { test } from 'node:test';
import { CATALOG, designChannel, buildPlanSheet, buildScriptOutline, scheduleBackward, judgeDelay, buildEditBrief, buildMonthlyReport } from '../src/core/index.ts';
import { channelText, planText, outlineText, scheduleText, briefText, reportText } from '../src/frontend/artifacts.ts';
const channel = designChannel('clinic', 'leads', '');
const plan = buildPlanSheet(channel, 'faq', '診察の予約から受診までの流れを紹介する');
const label = (id: string) => CATALOG.ideaTypes.find(item => item.id === id)?.label ?? id;

test('channel and plan copy include defaults, source limitations and expression cautions', () => {
  const channelCopy = channelText(channel, label);
  assert.match(channelCopy, /^# チャンネル設計/);
  assert.match(channelCopy, /既定値で補完/);
  for (const caution of channel.cautions) assert.ok(channelCopy.includes(caution));
  const planCopy = planText(plan);
  assert.ok(planCopy.includes(plan.titles[0]!));
  assert.ok(planCopy.includes(plan.summary));
  assert.match(planCopy, /テンプレート/);
  assert.match(planCopy, /サムネ文言案/);
});

test('script copy keeps user notes, all blocks, and derived shooting checklist', () => {
  const outline = buildScriptOutline(plan, 59);
  outline.blocks[0]!.talkingPoints = '<script>alert("example")</script>';
  outline.blocks[0]!.shootMemo = '説明用パネルを準備';
  const copy = outlineText(outline);
  assert.match(copy, /ショート/);
  assert.ok(copy.includes('## 1.'));
  assert.ok(!copy.includes('## 4.'));
  assert.ok(copy.includes(outline.blocks[0]!.talkingPoints));
  assert.ok(copy.includes('説明用パネルを準備'));
  for (const block of outline.blocks) assert.ok(copy.includes(`${block.seconds}秒`));
  for (const item of outline.checklist) for (const value of [item.cut,item.prop,item.position]) assert.ok(copy.includes(value));
});

test('schedule copy includes calendar caveat, task status and earliest publish date', () => {
  const schedule = scheduleBackward('2026-10-09','2026-10-09');
  schedule.tasks[0]!.status = 'done';
  const copy = scheduleText(schedule, judgeDelay(schedule, '2026-10-09'));
  assert.ok(copy.includes(schedule.earliestPublishDate));
  assert.match(copy, /祝日/);
  assert.match(copy, /完了/);
  for (const task of schedule.tasks) assert.ok(copy.includes(task.due));
});

test('edit brief copy includes saved notes, draft deadline, all directions and cautions', () => {
  const outline = buildScriptOutline(plan,480);
  outline.blocks[0]!.talkingPoints = '冒頭で疑問を紹介';
  const schedule = scheduleBackward('2026-11-20','2026-10-09');
  const brief = buildEditBrief(outline,plan,schedule);
  const copy = briefText(brief);
  assert.ok(copy.includes(schedule.tasks.find(task => task.step === 'draft')!.due));
  assert.ok(copy.includes('冒頭で疑問を紹介'));
  assert.match(copy,/## 1\./);
  for (const direction of brief.directions) for (const text of [direction.captions,direction.bgm,direction.cuts]) assert.ok(copy.includes(text));
  for (const caution of brief.cautions) assert.ok(copy.includes(caution));
});

test('monthly copy distinguishes zero previous results from missing previous input', () => {
  const current = {views:1000,subsDelta:10,retention:50,conversions:10};
  const zeroReport = buildMonthlyReport(current,{views:0,subsDelta:0,retention:0,conversions:0});
  const zeroCopy = reportText(zeroReport,'2026-10');
  assert.match(zeroCopy,/2026-10/);
  assert.match(zeroCopy,/前月実績なし/);
  assert.doesNotMatch(zeroCopy,/Infinity|NaN|null|undefined/);
  const missingCopy = reportText(buildMonthlyReport(current),'2026-10');
  assert.match(missingCopy,/未入力/);
  const growth = buildMonthlyReport(current,{views:500,subsDelta:5,retention:40,conversions:10});
  const growthCopy = reportText(growth,'2026-10');
  assert.match(growthCopy,/100%/);
  for (const measure of growth.measures) assert.ok(growthCopy.includes(measure.action));
});
