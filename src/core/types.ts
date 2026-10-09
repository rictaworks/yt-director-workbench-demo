/** Product identifiers stay stable while all display content is Japanese. */
export type IndustryId = 'career' | 'clinic' | 'housing' | 'professional' | 'btob' | 'recruitment';
export type GoalId = 'leads' | 'hiring' | 'sales';
export type IdeaTypeId = 'howto' | 'faq' | 'case' | 'day' | 'interview' | 'ranking' | 'consultation' | 'employee';
export type BlockKind = 'hook' | 'problem' | 'main' | 'example' | 'summary' | 'cta';
export type StepId = 'plan' | 'script' | 'shoot' | 'draft' | 'revision' | 'publish';
export type TaskStatus = 'todo' | 'in_progress' | 'done';
export type DelayStatus = 'none' | 'warning' | 'delayed';
export type MetricKey = 'views' | 'subsDelta' | 'retention' | 'conversions';
export type MetricTrend = 'up' | 'flat' | 'down';

export interface Industry { id: IndustryId; label: string; shortLabel: string; defaultTarget: string; shortTarget: string }
export interface Goal { id: GoalId; label: string; aim: string; cta: string }
export interface IdeaType { id: IdeaTypeId; label: string }
export interface Recommendation { industry: IndustryId; goal: GoalId; recommended: IdeaTypeId[]; nonRecommended: { ideaType: IdeaTypeId; reason: string }[] }
export interface OutlineTemplate { ideaType: IdeaTypeId; blocks: { kind: BlockKind; label: string; ratio: number; cut: string; prop: string; position: string }[] }
export interface TitleTemplate { id: string; ideaType: IdeaTypeId; kind: 'number' | 'question' | 'assertion'; text: string }
export interface ThumbnailTemplate { id: string; ideaType: IdeaTypeId; text: string }
export interface IndustryCaution { industry: IndustryId; items: string[] }
export interface StepDefinition { id: StepId; label: string; businessDays: number }
export interface MeasureRule { id: string; conditions: { metric: MetricKey; trend: MetricTrend }[]; title: string; action: string }
export interface DomainWarning { code: string; message: string }
export interface ChannelDesign { industry: IndustryId; goal: GoalId; industryLabel: string; goalLabel: string; target: string; targetDefaulted: boolean; recommended: IdeaTypeId[]; nonRecommended: { ideaType: IdeaTypeId; reason: string }[]; cautions: string[] }
export interface ClassifierInput { memo: string; industry: IndustryId; choices: { id: IdeaTypeId; label: string }[]; cautions: string[] }
export interface ClassifierCandidate { ideaType: IdeaTypeId; probability: number }
export interface ClassifierRawResult { selectedIdeaType: IdeaTypeId; confidence: number; candidates: ClassifierCandidate[]; cautionProbability: number; model: string }
export interface Classification { mode: 'automatic' | 'selection' | 'manual'; selectedIdeaType: IdeaTypeId | null; confidence: number | null; candidates: ClassifierCandidate[]; otherAvailable: boolean; cautionProbability: number | null; cautions: string[]; model: string | null; error: { code: 'quota_exceeded' | 'classification_failed'; message: string } | null }
export interface PlanSheet { channel: ChannelDesign; ideaType: IdeaTypeId; ideaTypeLabel: string; memo: string; titles: string[]; thumbTexts: string[]; aim: string; audience: string; summary: string; summaryTruncated: boolean; nonRecommended: boolean; warnings: DomainWarning[] }
export interface ScriptBlock { seq: number; kind: BlockKind; label: string; seconds: number; talkingPoints: string; shootMemo: string }
export interface ChecklistItem { seq: number; block: string; cut: string; prop: string; position: string }
export interface ScriptOutline { ideaType: IdeaTypeId; targetSeconds: number; shorts: boolean; blocks: ScriptBlock[]; checklist: ChecklistItem[]; warnings: DomainWarning[] }
export interface ScheduleTask { step: StepId; label: string; due: string; status: TaskStatus }
export interface Schedule { publishDate: string; shootDate: string; fixedShootDate: boolean; tasks: ScheduleTask[]; compressed: boolean; insufficient: boolean; status: 'ready' | 'compressed' | 'insufficient'; earliestPublishDate: string; earliestShootDate: string; shootNeedsReschedule: boolean; warnings: DomainWarning[]; calendarNote: string }
export interface DelayJudgment { status: DelayStatus; label: string; tasks: { step: StepId; status: DelayStatus; label: string; due: string }[] }
export interface EditDirection { seq: number; block: string; seconds: number; captions: string; bgm: string; cuts: string; talkingPoints: string; shootMemo: string }
export interface EditBrief { title: string; dueDate: string | null; directions: EditDirection[]; cautions: string[]; notice: string }
export interface MonthlyMetrics { views: number; subsDelta: number; retention: number; conversions: number }
export interface MetricComparison { key: MetricKey; label: string; current: number; previous: number | null; difference: number | null; changeRate: number | null; note: string }
export interface MonthlyReport { metrics: MetricComparison[]; measures: { id: string; title: string; action: string }[]; hasPrevious: boolean; notes: string[] }
