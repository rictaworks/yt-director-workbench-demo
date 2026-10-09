import { CATALOG } from './templates/catalog.ts';
import { MESSAGES } from './templates/messages.ts';
import type { GoalId, IdeaTypeId, IndustryId, MonthlyMetrics } from './types.ts';

export class DomainValidationError extends Error {
  readonly field: string;
  constructor(field: string, message: string) { super(message); this.name = 'ValidationError'; this.field = field; }
}
export const charLength = (value: string): number => Array.from(value).length;
export const excerpt = (value: string, length: number): string => Array.from(value).slice(0, length).join('');
export function validateIndustry(value: unknown): IndustryId {
  if (typeof value !== 'string' || !CATALOG.industries.some(x => x.id === value)) throw new DomainValidationError('industry', MESSAGES.invalidChoice);
  return value as IndustryId;
}
export function validateGoal(value: unknown): GoalId {
  if (typeof value !== 'string' || !CATALOG.goals.some(x => x.id === value)) throw new DomainValidationError('goal', MESSAGES.invalidChoice);
  return value as GoalId;
}
export function validateIdeaType(value: unknown): IdeaTypeId {
  if (typeof value !== 'string' || !CATALOG.ideaTypes.some(x => x.id === value)) throw new DomainValidationError('ideaType', MESSAGES.invalidChoice);
  return value as IdeaTypeId;
}
export function validateMemo(value: unknown): string {
  if (typeof value !== 'string' || charLength(value) > 500 || charLength(value.trim()) < 2) throw new DomainValidationError('memo', MESSAGES.memoLength);
  return value.trim();
}
export function validateTarget(value: unknown): string {
  if (typeof value !== 'string') throw new DomainValidationError('target', MESSAGES.invalidText);
  if (charLength(value) > 200) throw new DomainValidationError('target', MESSAGES.targetLength);
  return value.trim();
}
export function validateSeconds(value: unknown): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 1 || value > 1800) throw new DomainValidationError('targetSeconds', MESSAGES.invalidSeconds);
  return value;
}
export function validateMetrics(value: unknown): MonthlyMetrics {
  if (!value || typeof value !== 'object') throw new DomainValidationError('metrics', MESSAGES.invalidMetrics);
  const m = value as MonthlyMetrics;
  for (const key of ['views', 'subsDelta', 'conversions'] as const) if (!Number.isSafeInteger(m[key]) || m[key] < 0) throw new DomainValidationError(key, MESSAGES.invalidMetrics);
  if (typeof m.retention !== 'number' || !Number.isFinite(m.retention) || m.retention < 0 || m.retention > 100) throw new DomainValidationError('retention', MESSAGES.invalidMetrics);
  return { views: m.views, subsDelta: m.subsDelta, retention: m.retention, conversions: m.conversions };
}
