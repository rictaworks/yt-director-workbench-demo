import { designChannel } from './channel.ts';
import { CATALOG } from './templates/catalog.ts';
import { MESSAGES } from './templates/messages.ts';
import { charLength, excerpt, validateIdeaType, validateMemo } from './validation.ts';
import type { ChannelDesign, DomainWarning, IdeaTypeId, PlanSheet } from './types.ts';
const replace = (template: string, industry: string, target: string): string => template.replaceAll('{industry}', () => industry).replaceAll('{target}', () => target);
export function buildPlanSheet(channel: ChannelDesign, ideaType: IdeaTypeId, memo: string): PlanSheet {
  validateIdeaType(ideaType); const normalizedMemo = validateMemo(memo);
  const verified = designChannel(channel.industry, channel.goal, channel.target);
  verified.targetDefaulted = channel.targetDefaulted === true;
  const industry = CATALOG.industries.find(x => x.id === verified.industry)!;
  const goal = CATALOG.goals.find(x => x.id === verified.goal)!;
  const warnings: DomainWarning[] = [];
  const nonRecommended = verified.nonRecommended.find(x => x.ideaType === ideaType);
  if (nonRecommended) warnings.push({ code: 'non_recommended', message: MESSAGES.nonRecommended + nonRecommended.reason });
  const shortTarget = verified.targetDefaulted ? industry.shortTarget : excerpt(verified.target, 10);
  const titles = CATALOG.titles.filter(x => x.ideaType === ideaType).map(template => {
    const full = replace(template.text, industry.label, verified.target);
    return charLength(full) <= 40 ? full : replace(template.text, industry.shortLabel, shortTarget);
  });
  if (titles.some(title => charLength(title) > 40)) warnings.push({ code: 'title_too_long', message: MESSAGES.titleTooLong });
  return { channel: verified, ideaType, ideaTypeLabel: CATALOG.ideaTypes.find(x => x.id === ideaType)!.label, memo: normalizedMemo, titles,
    thumbTexts: CATALOG.thumbnails.filter(x => x.ideaType === ideaType).map(x => replace(x.text, industry.shortLabel, shortTarget)),
    aim: replace(goal.aim, industry.label, verified.target), audience: verified.target, summary: excerpt(normalizedMemo, 120), summaryTruncated: charLength(normalizedMemo) > 120,
    nonRecommended: !!nonRecommended, warnings };
}
