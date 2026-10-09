import { MESSAGES } from '../templates/messages.ts';
import { DomainValidationError } from '../validation.ts';
const DAY_MS = 86_400_000;
export function validateDate(value: unknown, field = 'date'): string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value) || value.startsWith('0000')) throw new DomainValidationError(field, MESSAGES.invalidDate);
  const date = new Date(`${value}T00:00:00.000Z`);
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== value) throw new DomainValidationError(field, MESSAGES.invalidDate);
  return value;
}
const dateValue = (date: string): number => new Date(`${validateDate(date)}T00:00:00.000Z`).getTime();
function fromValue(value: number): string {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) throw new DomainValidationError('date', MESSAGES.dateRange);
  const iso = date.toISOString();
  if (iso.length !== 24 || iso.startsWith('0000')) throw new DomainValidationError('date', MESSAGES.dateRange);
  return iso.slice(0, 10);
}
export function isBusinessDay(date: string): boolean { const day = new Date(dateValue(date)).getUTCDay(); return day !== 0 && day !== 6; }
export function addCalendarDays(date: string, days: number): string {
  if (!Number.isSafeInteger(days)) throw new DomainValidationError('days', MESSAGES.integerDays);
  return fromValue(dateValue(date) + days * DAY_MS);
}
/** Excludes the starting date, includes the destination day when it is a weekday. */
export function addBusinessDays(date: string, days: number): string {
  validateDate(date);
  if (!Number.isSafeInteger(days)) throw new DomainValidationError('days', MESSAGES.integerDays);
  if (days === 0) return date;
  const direction = days > 0 ? 1 : -1;
  let remaining = Math.abs(days); let result = date;
  // Reach a weekday first so that jumping full weeks preserves exact semantics.
  while (remaining > 0 && !isBusinessDay(result)) { result = addCalendarDays(result, direction); if (isBusinessDay(result)) remaining--; }
  const weeks = Math.floor(remaining / 5);
  result = addCalendarDays(result, weeks * 7 * direction); remaining -= weeks * 5;
  while (remaining > 0) { result = addCalendarDays(result, direction); if (isBusinessDay(result)) remaining--; }
  return result;
}
export function businessDaysBetween(start: string, end: string): number {
  validateDate(start); validateDate(end);
  if (start === end) return 0;
  if (start > end) return -businessDaysBetween(end, start);
  const days = Math.round((dateValue(end) - dateValue(start)) / DAY_MS);
  const weeks = Math.floor(days / 7); let count = weeks * 5;
  let cursor = addCalendarDays(start, weeks * 7);
  for (let i = 0; i < days % 7; i++) { cursor = addCalendarDays(cursor, 1); if (isBusinessDay(cursor)) count++; }
  return count;
}
export function onOrNextBusinessDay(date: string): string { return isBusinessDay(date) ? date : addBusinessDays(date, 1); }
