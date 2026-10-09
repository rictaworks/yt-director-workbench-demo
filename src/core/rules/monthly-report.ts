import { CATALOG } from '../templates/catalog.ts';
import { METRIC_LABELS, MESSAGES } from '../templates/messages.ts';
import { validateMetrics } from '../validation.ts';
import type { MetricComparison, MetricKey, MetricTrend, MonthlyMetrics, MonthlyReport } from '../types.ts';
const keys: MetricKey[] = ['views', 'subsDelta', 'retention', 'conversions'];
const rounded = (n: number): number => Math.round((n + Number.EPSILON) * 100) / 100;
export function buildMonthlyReport(current: MonthlyMetrics, previous?: MonthlyMetrics): MonthlyReport {
  const cur = validateMetrics(current); const prev = previous === undefined ? undefined : validateMetrics(previous);
  const metrics: MetricComparison[] = keys.map(key => {
    const rawRate = prev && prev[key] > 0 ? (cur[key] - prev[key]) / prev[key] * 100 : null;
    const changeRate = rawRate !== null && Number.isFinite(rawRate) ? (Math.abs(rawRate) > Number.MAX_SAFE_INTEGER / 100 ? rawRate : rounded(rawRate)) : null;
    return { key, label: METRIC_LABELS[key], current: cur[key], previous: prev?.[key] ?? null,
      difference: prev ? (key === 'retention' ? rounded(cur[key] - prev[key]) : cur[key] - prev[key]) : null, changeRate,
      note: !prev ? MESSAGES.noPreviousInput : prev[key] === 0 ? MESSAGES.noPreviousResults : prev[key] < 0 ? MESSAGES.negativePrevious : changeRate === null ? MESSAGES.rateUnavailable : '' };
  });
  const trend = (key: MetricKey): MetricTrend => cur[key] > prev![key] ? 'up' : cur[key] < prev![key] ? 'down' : 'flat';
  const measures = prev ? CATALOG.measureRules.filter(rule => rule.conditions.every(condition => trend(condition.metric) === condition.trend)).slice(0, 3).map(rule => ({ id: rule.id, title: rule.title, action: rule.action })) : [];
  return { metrics, measures, hasPrevious: prev !== undefined, notes: [MESSAGES.pointDifference, MESSAGES.reportNotice, ...(!prev ? [MESSAGES.noPreviousMeasures] : [])] };
}
