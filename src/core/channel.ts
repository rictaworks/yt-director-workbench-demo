import { CATALOG } from './templates/catalog.ts';
import { validateGoal, validateIndustry, validateTarget } from './validation.ts';
import type { ChannelDesign, GoalId, IndustryId } from './types.ts';
export function designChannel(industry: IndustryId, goal: GoalId, target = ''): ChannelDesign {
  validateIndustry(industry); validateGoal(goal);
  const actualTarget = validateTarget(target);
  const industryData = CATALOG.industries.find(x => x.id === industry)!;
  const goalData = CATALOG.goals.find(x => x.id === goal)!;
  const rule = CATALOG.recommendations.find(x => x.industry === industry && x.goal === goal)!;
  return { industry, goal, industryLabel: industryData.label, goalLabel: goalData.label, target: actualTarget || industryData.defaultTarget,
    targetDefaulted: !actualTarget, recommended: [...rule.recommended], nonRecommended: rule.nonRecommended.map(x => ({ ...x })),
    cautions: [...CATALOG.cautions.find(x => x.industry === industry)!.items] };
}
