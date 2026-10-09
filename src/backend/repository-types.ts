import { HTTP_MESSAGES } from './messages.ts';
import type {
  ChannelDesign, Classification, EditBrief, IdeaTypeId, MonthlyMetrics, PlanSheet,
  Schedule, ScheduleTask, ScriptBlock, ScriptOutline, TaskStatus,
} from '../core/types.ts';

interface Identity { id: string; sessionId: string }
export type ChannelRecord = ChannelDesign & Identity & { projectId: string };
export interface IdeaInput {
  memo: string;
  ideaType: IdeaTypeId | null;
  confidence: number | null;
  classifiedBy: 'jev' | 'manual';
  jevModel: string | null;
  classification: Classification | null;
}
export type IdeaRecord = IdeaInput & Identity & { projectId: string };
export type PlanRecord = PlanSheet & Identity & { ideaId: string };
export type BlockRecord = ScriptBlock & Identity & { outlineId: string };
export type OutlineRecord = Omit<ScriptOutline, 'blocks'> & Identity & { planId: string; blocks: BlockRecord[] };
export type TaskRecord = ScheduleTask & Identity & { scheduleId: string };
export type ScheduleRecord = Omit<Schedule, 'tasks'> & Identity & { planId: string; tasks: TaskRecord[] };
export type EditBriefRecord = EditBrief & Identity & { planId: string };
export type MetricRecord = MonthlyMetrics & Identity & { projectId: string; month: string };
export interface ProjectRecord extends Identity {
  clientAlias: string;
  createdAt: string;
  channel: ChannelRecord | null;
  ideas: IdeaRecord[];
  plans: PlanRecord[];
  outlines: OutlineRecord[];
  schedules: ScheduleRecord[];
  editBriefs: EditBriefRecord[];
  metrics: MetricRecord[];
}
export interface OutlineBlockUpdate { seq: number; talkingPoints: string; shootMemo: string }
