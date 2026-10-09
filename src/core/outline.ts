import { CATALOG } from './templates/catalog.ts';
import { MESSAGES } from './templates/messages.ts';
import { validateIdeaType, validateSeconds } from './validation.ts';
import type { ChecklistItem, PlanSheet, ScriptOutline } from './types.ts';
export function buildScriptOutline(plan: PlanSheet, targetSeconds = 480): ScriptOutline {
  validateIdeaType(plan.ideaType); validateSeconds(targetSeconds);
  const template = CATALOG.outlines.find(x => x.ideaType === plan.ideaType)!;
  const shorts = targetSeconds < 60;
  const source = shorts ? template.blocks.filter(x => ['hook', 'main', 'cta'].includes(x.kind)).map(x => ({ ...x, ratio: x.kind === 'hook' ? .15 : x.kind === 'main' ? .7 : .15 })) : template.blocks;
  const blocks = source.map((block, i) => ({ seq: i + 1, kind: block.kind, label: block.label, seconds: Math.floor(block.ratio * targetSeconds), talkingPoints: '', shootMemo: '' }));
  const main = blocks.find(x => x.kind === 'main')!;
  main.seconds += targetSeconds - blocks.reduce((total, x) => total + x.seconds, 0);
  const checklist = source.map((block, i) => ({ seq: i + 1, block: block.label, cut: block.cut, prop: block.prop, position: block.position }));
  return { ideaType: plan.ideaType, targetSeconds, shorts, blocks, checklist, warnings: blocks.some(x => x.seconds === 0) ? [{ code: 'zero_second_block', message: MESSAGES.tinyOutline }] : [] };
}
export function shootChecklist(outline: ScriptOutline): ChecklistItem[] { return outline.checklist.map(x => ({ ...x })); }
