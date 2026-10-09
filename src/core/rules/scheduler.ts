import { CATALOG } from '../templates/catalog.ts';
import { DELAY_LABELS, MESSAGES } from '../templates/messages.ts';
import { DomainValidationError } from '../validation.ts';
import { addBusinessDays, businessDaysBetween, onOrNextBusinessDay, validateDate } from './calendar.ts';
import type { DelayJudgment, DelayStatus, DomainWarning, Schedule, ScheduleTask } from '../types.ts';
/** Milestone deadlines may start today; each later stage consumes its defined interval. */
export function scheduleBackward(publishDate: string, today: string, shootDate?: string): Schedule {
  validateDate(publishDate, 'publishDate'); validateDate(today, 'today');
  if (shootDate !== undefined) {
    validateDate(shootDate, 'shootDate');
    if (shootDate > publishDate) throw new DomainValidationError('shootDate', MESSAGES.shootAfterPublish);
  }
  const steps = CATALOG.steps;
  const shootIndex = steps.findIndex(s => s.id === 'shoot');
  const prepDays = steps.slice(1, shootIndex + 1).reduce((n, s) => n + s.businessDays, 0);
  const postDays = steps.slice(shootIndex + 1).reduce((n, s) => n + s.businessDays, 0);
  const earliestShootDate = addBusinessDays(onOrNextBusinessDay(today), prepDays);
  const shootNeedsReschedule = shootDate !== undefined && shootDate < earliestShootDate;
  const feasibleShootDate = shootDate && shootDate >= earliestShootDate ? shootDate : earliestShootDate;
  const earliestPublishDate = addBusinessDays(feasibleShootDate, postDays);
  const due = new Array<string>(steps.length);
  due[steps.length - 1] = publishDate;
  for (let i = steps.length - 2; i >= 0; i--) due[i] = addBusinessDays(due[i + 1]!, -steps[i + 1]!.businessDays);
  let compressed = false;
  if (shootDate !== undefined) {
    due[shootIndex] = shootDate;
    for (let i = shootIndex - 1; i >= 0; i--) due[i] = addBusinessDays(due[i + 1]!, -steps[i + 1]!.businessDays);
    const availableDays = businessDaysBetween(shootDate, publishDate);
    compressed = availableDays < postDays;
    if (compressed) {
      let weight = 0;
      for (let i = shootIndex + 1; i < steps.length - 1; i++) {
        weight += steps[i]!.businessDays;
        due[i] = addBusinessDays(shootDate, Math.floor(availableDays * weight / postDays));
      }
    } else {
      // Keep the delivery-side deadlines anchored to publication; any slack is after shooting.
      for (let i = steps.length - 2; i > shootIndex; i--) due[i] = addBusinessDays(due[i + 1]!, -steps[i + 1]!.businessDays);
    }
  }
  const tasks: ScheduleTask[] = steps.map((step, i) => ({ step: step.id, label: step.label, due: due[i]!, status: 'todo' }));
  const insufficient = publishDate <= today || tasks[0]!.due < today || shootNeedsReschedule;
  const warnings: DomainWarning[] = [];
  if (compressed) warnings.push({ code: 'compressed', message: MESSAGES.compressed });
  if (insufficient) warnings.push({ code: 'insufficient', message: MESSAGES.insufficient });
  if (shootNeedsReschedule) warnings.push({ code: 'shoot_needs_reschedule', message: MESSAGES.shootNeedsReschedule });
  return { publishDate, shootDate: tasks[shootIndex]!.due, fixedShootDate: shootDate !== undefined, tasks, compressed, insufficient,
    status: insufficient ? 'insufficient' : compressed ? 'compressed' : 'ready', earliestPublishDate, earliestShootDate, shootNeedsReschedule, warnings, calendarNote: MESSAGES.calendarNote };
}
export function judgeDelay(project: { tasks: ScheduleTask[] }, today: string): DelayJudgment {
  validateDate(today, 'today');
  if (!project || !Array.isArray(project.tasks)) throw new DomainValidationError('tasks', MESSAGES.invalidStructure);
  const tasks = project.tasks.map(task => {
    if (!task || !CATALOG.steps.some(x => x.id === task.step) || !['todo', 'in_progress', 'done'].includes(task.status)) throw new DomainValidationError('tasks', MESSAGES.invalidChoice);
    validateDate(task.due, 'due');
    const status: DelayStatus = task.status === 'done' ? 'none' : task.due < today ? 'delayed' : businessDaysBetween(today, task.due) <= 1 ? 'warning' : 'none';
    return { step: task.step, status, label: DELAY_LABELS[status], due: task.due };
  });
  const status: DelayStatus = tasks.some(t => t.status === 'delayed') ? 'delayed' : tasks.some(t => t.status === 'warning') ? 'warning' : 'none';
  return { status, label: DELAY_LABELS[status], tasks };
}
