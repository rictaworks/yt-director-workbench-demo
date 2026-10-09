import type { ChannelDesign, PlanSheet, ScriptOutline, Schedule, EditBrief, MonthlyReport, DelayJudgment } from '../core/types.ts';
import { messages as m } from './messages.ts';
import { numberLabel } from './view-model.ts';

const bullets = (items: readonly string[]) => items.map(item => `- ${item}`).join('\n');
const warningText = (warnings: {message: string}[]) => warnings.length ? `\n\n${bullets(warnings.map(item => item.message))}` : '';
const value = (label: string, text: string | number) => `${label}: ${text}`;
export function channelText(channel: ChannelDesign, ideaLabel: (id: string) => string): string {
  return [`# ${m.channelDesign}`,
    value(m.industry, channel.industryLabel), value(m.goal, channel.goalLabel), value(m.target, channel.target),
    ...(channel.targetDefaulted ? [m.targetDefaulted] : []), `\n## ${m.recommended}`, bullets(channel.recommended.map(ideaLabel)),
    `\n## ${m.nonRecommended}`, bullets(channel.nonRecommended.map(item => `${ideaLabel(item.ideaType)}: ${item.reason}`)),
    `\n## ${m.cautions}`, bullets(channel.cautions), `\n${m.legalNotice}`].join('\n');
}
export function planText(plan: PlanSheet): string {
  return [`# ${m.plan}`, value(m.ideaType, plan.ideaTypeLabel), `\n## ${m.titles}`, bullets(plan.titles),
    `\n## ${m.thumbnails}`, bullets(plan.thumbTexts), `\n## ${m.aim}`, plan.aim, `\n## ${m.audience}`, plan.audience,
    `\n## ${m.summary}`, plan.summary, ...(plan.summaryTruncated ? [m.excerptNotice] : []),
    `\n## ${m.cautions}`, bullets(plan.channel.cautions), m.generationNotice, warningText(plan.warnings)].join('\n');
}
export function outlineText(outline: ScriptOutline): string {
  return [`# ${m.outline}`, value(m.total, `${outline.targetSeconds}${m.secondsUnit}`), ...(outline.shorts ? [m.shorts] : []),
    ...outline.blocks.flatMap((block, index) => [`\n## ${index + 1}. ${block.label} (${block.seconds}秒)`, value(m.talkingPoints, block.talkingPoints), value(m.shootMemo, block.shootMemo)]),
    `\n# ${m.checklist}`, ...outline.checklist.flatMap(item => [`\n## ${item.block}`, value(m.cut, item.cut), value(m.prop, item.prop), value(m.position, item.position)]),
    warningText(outline.warnings)].join('\n');
}
export function scheduleText(schedule: Schedule, delay?: DelayJudgment): string {
  return [`# ${m.schedule}`, value(m.publishDate, schedule.publishDate), value(m.shootDate, schedule.shootDate), schedule.calendarNote,
    ...schedule.tasks.map(task => `- ${task.label}: ${task.due} / ${m.taskStatuses[task.status]}${delay ? ` / ${m.delays[delay.tasks.find(item => item.step === task.step)?.status ?? 'none']}` : ''}`),
    ...(schedule.insufficient ? [value(m.earliestPublish, schedule.earliestPublishDate)] : []),
    ...(schedule.shootNeedsReschedule ? [value(m.earliestShoot, schedule.earliestShootDate)] : []), warningText(schedule.warnings)].join('\n');
}
export function briefText(brief: EditBrief): string {
  return [`# ${m.brief}`, brief.title, value(m.due, brief.dueDate ?? m.dueUnset),
    ...brief.directions.flatMap((item, index) => [`\n## ${index + 1}. ${item.block} (${item.seconds}秒)`, value(m.captions, item.captions), value(m.bgm, item.bgm), value(m.cuts, item.cuts), value(m.talkingPoints, item.talkingPoints), value(m.shootMemo, item.shootMemo)]),
    `\n## ${m.cautions}`, bullets(brief.cautions), brief.notice].join('\n');
}
export function reportText(report: MonthlyReport, month: string): string {
  return [`# ${m.monthlyReport} (${month})`, ...report.metrics.flatMap(metric => [`\n## ${metric.label}`,
    value(m.current, numberLabel(metric.current)), value(m.previous, numberLabel(metric.previous)), value(m.difference, numberLabel(metric.difference)),
    value(m.changeRate, metric.changeRate === null ? metric.note || m.noPrevious : `${numberLabel(metric.changeRate)}%`)]),
    `\n## ${m.measures}`, ...(report.measures.length ? report.measures.map(item => `- ${item.title}: ${item.action}`) : [m.noMeasures]),
    ...report.notes].join('\n');
}
