import { CATALOG } from './templates/catalog.ts';
import { EDIT_POLICIES, MESSAGES } from './templates/messages.ts';
import { DomainValidationError, validateIdeaType, validateIndustry } from './validation.ts';
import { validateDate } from './rules/calendar.ts';
import type { EditBrief, PlanSheet, Schedule, ScriptOutline } from './types.ts';
export function buildEditBrief(outline: ScriptOutline, plan: PlanSheet, schedule?: Schedule): EditBrief {
  validateIdeaType(plan.ideaType); validateIndustry(plan.channel.industry);
  if (outline.ideaType !== plan.ideaType) throw new DomainValidationError('outline', MESSAGES.incompatibleOutline);
  const cautions = [...CATALOG.cautions.find(x => x.industry === plan.channel.industry)!.items];
  const dueDate = schedule?.tasks.find(x => x.step === 'draft')?.due ?? null;
  if (dueDate !== null) validateDate(dueDate, 'draftDue');
  const directions = outline.blocks.map(block => {
    const policy = EDIT_POLICIES[block.kind];
    if (!policy) throw new DomainValidationError('blocks', MESSAGES.invalidChoice);
    return { seq: block.seq, block: block.label, seconds: block.seconds, talkingPoints: block.talkingPoints, shootMemo: block.shootMemo,
      captions: `${policy.captions}\n${MESSAGES.cautionPrefix}${cautions.join(MESSAGES.captionSeparator)}`, bgm: policy.bgm, cuts: policy.cuts };
  });
  return { title: (plan.titles[0] ?? plan.ideaTypeLabel) + MESSAGES.briefSuffix, dueDate, directions, cautions, notice: MESSAGES.briefNotice };
}
