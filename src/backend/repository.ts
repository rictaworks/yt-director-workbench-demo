import type { ProjectRepository } from '../core/ports.ts';
import type {
  ChannelDesign, Classification, EditBrief, IdeaTypeId, MonthlyMetrics, PlanSheet,
  Schedule, ScheduleTask, ScriptBlock, ScriptOutline, TaskStatus,
} from '../core/types.ts';

import type { ChannelRecord, IdeaInput, IdeaRecord, PlanRecord, BlockRecord, OutlineRecord, TaskRecord, ScheduleRecord, EditBriefRecord, MetricRecord, ProjectRecord, OutlineBlockUpdate } from './repository-types.ts';
export type * from './repository-types.ts';

/** A deliberately small structural subset of D1, also exercised against SQLite. */
export interface RepositoryStatement {
  bind(...values: unknown[]): RepositoryStatement;
  first<T = Record<string, unknown>>(): Promise<T | null>;
  all<T = Record<string, unknown>>(): Promise<{ results: T[] }>;
  run(): Promise<unknown>;
}
export interface RepositoryDatabase {
  prepare(query: string): RepositoryStatement;
  batch(statements: RepositoryStatement[]): Promise<unknown[]>;
}
export class RepositoryNotFoundError extends Error {
  constructor() { super('対象の案件または成果物が見つかりません。'); this.name = 'RepositoryNotFoundError'; }
}

type Row = Record<string, unknown>;
const textValue = (row: Row, key: string): string => String(row[key]);
const numericValue = (row: Row, key: string): number => Number(row[key]);
const nullableText = (row: Row, key: string): string | null => row[key] === null ? null : String(row[key]);
const identity = (row: Row) => ({ id: textValue(row, 'id'), sessionId: textValue(row, 'session_id') });
const payload = <T>(row: Row): T => JSON.parse(textValue(row, 'payload_json')) as T;
const newId = (): string => crypto.randomUUID();

function channelRecord(row: Row): ChannelRecord {
  return { ...payload<ChannelDesign>(row), ...identity(row), projectId: textValue(row, 'project_id'), industry: row.industry as ChannelDesign['industry'], goal: row.goal as ChannelDesign['goal'], target: textValue(row, 'target'), targetDefaulted: Boolean(row.target_defaulted) };
}
function ideaRecord(row: Row): IdeaRecord {
  return { ...payload<IdeaInput>(row), ...identity(row), projectId: textValue(row, 'project_id'), memo: textValue(row, 'memo'), ideaType: row.idea_type as IdeaTypeId | null, confidence: row.confidence === null ? null : Number(row.confidence), classifiedBy: row.classified_by as IdeaInput['classifiedBy'], jevModel: nullableText(row, 'jev_model') };
}
function planRecord(row: Row): PlanRecord {
  return { ...payload<PlanSheet>(row), ...identity(row), ideaId: textValue(row, 'idea_id'), titles: JSON.parse(textValue(row, 'titles')) as string[], thumbTexts: JSON.parse(textValue(row, 'thumb_texts')) as string[], aim: textValue(row, 'aim'), nonRecommended: Boolean(row.non_recommended) };
}
function blockRecord(row: Row): BlockRecord {
  return { ...payload<ScriptBlock>(row), ...identity(row), outlineId: textValue(row, 'outline_id'), seq: numericValue(row, 'seq'), kind: row.kind as ScriptBlock['kind'], seconds: numericValue(row, 'seconds'), talkingPoints: textValue(row, 'talking_points'), shootMemo: textValue(row, 'shoot_memo') };
}
function outlineRecord(row: Row, blocks: BlockRecord[]): OutlineRecord {
  return { ...payload<ScriptOutline>(row), ...identity(row), planId: textValue(row, 'plan_id'), targetSeconds: numericValue(row, 'target_seconds'), blocks: blocks.filter(block => block.outlineId === row.id).sort((a, b) => a.seq - b.seq) };
}
function taskRecord(row: Row): TaskRecord {
  return { ...payload<ScheduleTask>(row), ...identity(row), scheduleId: textValue(row, 'schedule_id'), step: row.step as ScheduleTask['step'], due: textValue(row, 'due'), status: row.status as TaskStatus };
}
function scheduleRecord(row: Row, tasks: TaskRecord[]): ScheduleRecord {
  const order = ['plan', 'script', 'shoot', 'draft', 'revision', 'publish'];
  return { ...payload<Schedule>(row), ...identity(row), planId: textValue(row, 'plan_id'), publishDate: textValue(row, 'publish_date'), shootDate: textValue(row, 'shoot_date'), compressed: Boolean(row.compressed), tasks: tasks.filter(task => task.scheduleId === row.id).sort((a, b) => order.indexOf(a.step) - order.indexOf(b.step)) };
}
function editBriefRecord(row: Row): EditBriefRecord {
  return { ...payload<EditBrief>(row), ...identity(row), planId: textValue(row, 'plan_id'), directions: JSON.parse(textValue(row, 'directions')) as EditBrief['directions'] };
}
function metricRecord(row: Row): MetricRecord {
  return { ...identity(row), projectId: textValue(row, 'project_id'), month: textValue(row, 'month'), views: numericValue(row, 'views'), subsDelta: numericValue(row, 'subs_delta'), retention: numericValue(row, 'retention'), conversions: numericValue(row, 'conversions') };
}

/** D1 adapter. The caller's session is mandatory on every ordinary operation. */
export class D1ProjectRepository implements ProjectRepository<ProjectRecord> {
  private readonly db: RepositoryDatabase;
  constructor(db: RepositoryDatabase) { this.db = db; }

  private statement(sql: string, values: unknown[]): RepositoryStatement {
    return this.db.prepare(sql).bind(...values);
  }
  private one(sql: string, values: unknown[]): Promise<Row | null> {
    return this.statement(sql, values).first<Row>();
  }
  private async rows(sql: string, values: unknown[]): Promise<Row[]> {
    return (await this.statement(sql, values).all<Row>()).results;
  }
  private async required(sql: string, values: unknown[]): Promise<Row> {
    const row = await this.one(sql, values);
    if (!row) throw new RepositoryNotFoundError();
    return row;
  }
  private requireProject(sessionId: string, projectId: string): Promise<Row> {
    return this.required('SELECT * FROM projects WHERE session_id = ? AND id = ?', [sessionId, projectId]);
  }
  private requireIdea(sessionId: string, projectId: string, ideaId: string): Promise<Row> {
    return this.required('SELECT * FROM ideas WHERE session_id = ? AND project_id = ? AND id = ?', [sessionId, projectId, ideaId]);
  }
  private requirePlan(sessionId: string, projectId: string, planId: string): Promise<Row> {
    return this.required(`SELECT p.* FROM plan_sheets p JOIN ideas i ON i.id = p.idea_id AND i.session_id = p.session_id
      WHERE p.session_id = ? AND i.session_id = ? AND i.project_id = ? AND p.id = ?`, [sessionId, sessionId, projectId, planId]);
  }
  private requireOutline(sessionId: string, projectId: string, outlineId: string): Promise<Row> {
    return this.required(`SELECT o.* FROM script_outlines o
      JOIN plan_sheets p ON p.id = o.plan_id AND p.session_id = o.session_id
      JOIN ideas i ON i.id = p.idea_id AND i.session_id = p.session_id
      WHERE o.session_id = ? AND p.session_id = ? AND i.session_id = ? AND i.project_id = ? AND o.id = ?`, [sessionId, sessionId, sessionId, projectId, outlineId]);
  }

  async createSession(sessionId: string, createdAt: string): Promise<void> {
    await this.statement('INSERT INTO sessions (session_id, created_at) VALUES (?, ?) ON CONFLICT(session_id) DO NOTHING', [sessionId, createdAt]).run();
  }
  async sessionExists(sessionId: string): Promise<boolean> {
    return Boolean(await this.one('SELECT session_id FROM sessions WHERE session_id = ?', [sessionId]));
  }
  async createProject(sessionId: string, clientAlias: string): Promise<ProjectRecord> {
    const id = newId();
    const createdAt = new Date().toISOString();
    await this.statement('INSERT INTO projects (id, session_id, client_alias, created_at) VALUES (?, ?, ?, ?)', [id, sessionId, clientAlias, createdAt]).run();
    return { id, sessionId, clientAlias, createdAt, channel: null, ideas: [], plans: [], outlines: [], schedules: [], editBriefs: [], metrics: [] };
  }
  async getProject(sessionId: string, projectId: string): Promise<ProjectRecord | null> {
    return (await this.loadProjects(sessionId, projectId))[0] ?? null;
  }
  async listProjects(sessionId: string): Promise<ProjectRecord[]> {
    return this.loadProjects(sessionId);
  }
  private async loadProjects(sessionId: string, projectId?: string): Promise<ProjectRecord[]> {
    const projects = await this.rows(`SELECT * FROM projects WHERE session_id = ?${projectId === undefined ? '' : ' AND id = ?'} ORDER BY created_at DESC, id`, projectId === undefined ? [sessionId] : [sessionId, projectId]);
    if (projects.length === 0) return [];
    // A constant ten reads even for the whole home screen, below Workers Free's
    // per-request D1 query budget. Only this session's rows can enter the snapshot.
    const [channels, ideas, plans, outlines, blocks, schedules, tasks, briefs, metrics] = await Promise.all([
      this.rows('SELECT * FROM channel_designs WHERE session_id = ?', [sessionId]),
      this.rows('SELECT * FROM ideas WHERE session_id = ? ORDER BY rowid', [sessionId]),
      this.rows('SELECT * FROM plan_sheets WHERE session_id = ? ORDER BY rowid', [sessionId]),
      this.rows('SELECT * FROM script_outlines WHERE session_id = ? ORDER BY rowid', [sessionId]),
      this.rows('SELECT * FROM script_blocks WHERE session_id = ? ORDER BY seq', [sessionId]),
      this.rows('SELECT * FROM schedules WHERE session_id = ? ORDER BY rowid', [sessionId]),
      this.rows('SELECT * FROM tasks WHERE session_id = ?', [sessionId]),
      this.rows('SELECT * FROM edit_briefs WHERE session_id = ? ORDER BY rowid', [sessionId]),
      this.rows('SELECT * FROM monthly_metrics WHERE session_id = ? ORDER BY month DESC', [sessionId]),
    ]);
    const blockRecords = blocks.map(blockRecord);
    const taskRecords = tasks.map(taskRecord);
    return projects.map(project => {
      const projectIdeas = ideas.filter(idea => idea.project_id === project.id).map(ideaRecord);
      const ideaIds = new Set(projectIdeas.map(idea => idea.id));
      const projectPlans = plans.filter(plan => ideaIds.has(textValue(plan, 'idea_id'))).map(planRecord);
      const planIds = new Set(projectPlans.map(plan => plan.id));
      const channel = channels.find(item => item.project_id === project.id);
      return {
        ...identity(project), clientAlias: textValue(project, 'client_alias'), createdAt: textValue(project, 'created_at'),
        channel: channel ? channelRecord(channel) : null,
        ideas: projectIdeas, plans: projectPlans,
        outlines: outlines.filter(outline => planIds.has(textValue(outline, 'plan_id'))).map(outline => outlineRecord(outline, blockRecords)),
        schedules: schedules.filter(schedule => planIds.has(textValue(schedule, 'plan_id'))).map(schedule => scheduleRecord(schedule, taskRecords)),
        editBriefs: briefs.filter(brief => planIds.has(textValue(brief, 'plan_id'))).map(editBriefRecord),
        metrics: metrics.filter(metric => metric.project_id === project.id).map(metricRecord),
      };
    });
  }

  async saveChannel(sessionId: string, projectId: string, data: ChannelDesign): Promise<ChannelRecord> {
    await this.requireProject(sessionId, projectId);
    await this.statement(`INSERT INTO channel_designs (id, session_id, project_id, industry, goal, target, target_defaulted, payload_json)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(session_id, project_id) DO UPDATE SET
      industry = excluded.industry, goal = excluded.goal, target = excluded.target,
      target_defaulted = excluded.target_defaulted, payload_json = excluded.payload_json WHERE channel_designs.session_id = ?`,
    [newId(), sessionId, projectId, data.industry, data.goal, data.target, Number(data.targetDefaulted), JSON.stringify(data), sessionId]).run();
    return channelRecord(await this.required('SELECT * FROM channel_designs WHERE session_id = ? AND project_id = ?', [sessionId, projectId]));
  }
  async saveIdea(sessionId: string, projectId: string, data: IdeaInput): Promise<IdeaRecord> {
    await this.requireProject(sessionId, projectId);
    const id = newId();
    await this.statement(`INSERT INTO ideas (id, session_id, project_id, memo, idea_type, confidence, classified_by, jev_model, payload_json)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`, [id, sessionId, projectId, data.memo, data.ideaType, data.confidence, data.classifiedBy, data.jevModel, JSON.stringify(data)]).run();
    return ideaRecord(await this.required('SELECT * FROM ideas WHERE session_id = ? AND project_id = ? AND id = ?', [sessionId, projectId, id]));
  }
  async savePlan(sessionId: string, projectId: string, ideaId: string, data: PlanSheet): Promise<PlanRecord> {
    const idea = await this.requireIdea(sessionId, projectId, ideaId);
    const classifiedBy = idea.idea_type === data.ideaType ? textValue(idea, 'classified_by') : 'manual';
    const existing = await this.one('SELECT id, payload_json FROM plan_sheets WHERE session_id = ? AND idea_id = ?', [sessionId, ideaId]);
    const changed = existing && existing.payload_json !== JSON.stringify(data);
    const invalidations = changed ? [
      this.statement('DELETE FROM script_outlines WHERE session_id = ? AND plan_id = ?', [sessionId, existing.id]),
      this.statement('DELETE FROM edit_briefs WHERE session_id = ? AND plan_id = ?', [sessionId, existing.id]),
    ] : [];
    await this.db.batch([
      ...invalidations,
      this.statement(`INSERT INTO plan_sheets (id, session_id, idea_id, titles, thumb_texts, aim, non_recommended, payload_json)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(session_id, idea_id) DO UPDATE SET
        titles = excluded.titles, thumb_texts = excluded.thumb_texts, aim = excluded.aim,
        non_recommended = excluded.non_recommended, payload_json = excluded.payload_json WHERE plan_sheets.session_id = ?`,
      [newId(), sessionId, ideaId, JSON.stringify(data.titles), JSON.stringify(data.thumbTexts), data.aim, Number(data.nonRecommended), JSON.stringify(data), sessionId]),
      this.statement('UPDATE ideas SET idea_type = ?, classified_by = ? WHERE session_id = ? AND project_id = ? AND id = ?', [data.ideaType, classifiedBy, sessionId, projectId, ideaId]),
    ]);
    return planRecord(await this.required('SELECT * FROM plan_sheets WHERE session_id = ? AND idea_id = ?', [sessionId, ideaId]));
  }
  async saveOutline(sessionId: string, projectId: string, planId: string, data: ScriptOutline): Promise<OutlineRecord> {
    await this.requirePlan(sessionId, projectId, planId);
    const statements = [
      this.statement(`INSERT INTO script_outlines (id, session_id, plan_id, target_seconds, payload_json) VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(session_id, plan_id) DO UPDATE SET target_seconds = excluded.target_seconds,
        payload_json = excluded.payload_json WHERE script_outlines.session_id = ?`, [newId(), sessionId, planId, data.targetSeconds, JSON.stringify(data), sessionId]),
      this.statement(`DELETE FROM script_blocks WHERE session_id = ? AND outline_id =
        (SELECT id FROM script_outlines WHERE session_id = ? AND plan_id = ?)`, [sessionId, sessionId, planId]),
      this.statement('DELETE FROM edit_briefs WHERE session_id = ? AND plan_id = ?', [sessionId, planId]),
      ...data.blocks.map(block => this.statement(`INSERT INTO script_blocks
        (id, session_id, outline_id, seq, kind, seconds, talking_points, shoot_memo, payload_json)
        VALUES (?, ?, (SELECT id FROM script_outlines WHERE session_id = ? AND plan_id = ?), ?, ?, ?, ?, ?, ?)`,
      [newId(), sessionId, sessionId, planId, block.seq, block.kind, block.seconds, block.talkingPoints, block.shootMemo, JSON.stringify(block)])),
    ];
    await this.db.batch(statements);
    const saved = await this.required('SELECT id FROM script_outlines WHERE session_id = ? AND plan_id = ?', [sessionId, planId]);
    return this.readOutline(sessionId, textValue(saved, 'id'));
  }
  private async readOutline(sessionId: string, outlineId: string): Promise<OutlineRecord> {
    const row = await this.required('SELECT * FROM script_outlines WHERE session_id = ? AND id = ?', [sessionId, outlineId]);
    const blocks = (await this.rows('SELECT * FROM script_blocks WHERE session_id = ? AND outline_id = ? ORDER BY seq', [sessionId, outlineId])).map(blockRecord);
    return outlineRecord(row, blocks);
  }
  async updateOutlineBlocks(sessionId: string, projectId: string, outlineId: string, blocks: OutlineBlockUpdate[]): Promise<OutlineRecord> {
    const outline = await this.requireOutline(sessionId, projectId, outlineId);
    const existing = await this.rows('SELECT seq FROM script_blocks WHERE session_id = ? AND outline_id = ?', [sessionId, outlineId]);
    const sequences = new Set(existing.map(row => numericValue(row, 'seq')));
    if (new Set(blocks.map(block => block.seq)).size !== blocks.length || blocks.some(block => !sequences.has(block.seq))) {
      throw new RepositoryNotFoundError();
    }
    if (blocks.length > 0) await this.db.batch([
      this.statement('DELETE FROM edit_briefs WHERE session_id = ? AND plan_id = ?', [sessionId, outline.plan_id]),
      ...blocks.map(block => this.statement(`UPDATE script_blocks SET talking_points = ?, shoot_memo = ?
        WHERE session_id = ? AND outline_id = ? AND seq = ?`, [block.talkingPoints, block.shootMemo, sessionId, outlineId, block.seq])),
    ]);
    return this.readOutline(sessionId, outlineId);
  }
  async saveSchedule(sessionId: string, projectId: string, planId: string, data: Schedule): Promise<ScheduleRecord> {
    await this.requirePlan(sessionId, projectId, planId);
    const steps = data.tasks.map(task => task.step);
    await this.db.batch([
      this.statement(`INSERT INTO schedules (id, session_id, plan_id, publish_date, shoot_date, compressed, payload_json)
        VALUES (?, ?, ?, ?, ?, ?, ?) ON CONFLICT(session_id, plan_id) DO UPDATE SET
        publish_date = excluded.publish_date, shoot_date = excluded.shoot_date, compressed = excluded.compressed,
        payload_json = excluded.payload_json WHERE schedules.session_id = ?`, [newId(), sessionId, planId, data.publishDate, data.shootDate, Number(data.compressed), JSON.stringify(data), sessionId]),
      this.statement(`DELETE FROM tasks WHERE session_id = ? AND schedule_id =
        (SELECT id FROM schedules WHERE session_id = ? AND plan_id = ?)${steps.length ? ` AND step NOT IN (${steps.map(() => '?').join(',')})` : ''}`, [sessionId, sessionId, planId, ...steps]),
      this.statement('DELETE FROM edit_briefs WHERE session_id = ? AND plan_id = ?', [sessionId, planId]),
      ...data.tasks.map(task => this.statement(`INSERT INTO tasks (id, session_id, schedule_id, step, due, status, payload_json)
        VALUES (?, ?, (SELECT id FROM schedules WHERE session_id = ? AND plan_id = ?), ?, ?, ?, ?)
        ON CONFLICT(session_id, schedule_id, step) DO UPDATE SET due = excluded.due,
        payload_json = excluded.payload_json WHERE tasks.session_id = ?`,
      [newId(), sessionId, sessionId, planId, task.step, task.due, task.status, JSON.stringify(task), sessionId])),
    ]);
    const row = await this.required('SELECT * FROM schedules WHERE session_id = ? AND plan_id = ?', [sessionId, planId]);
    const tasks = (await this.rows('SELECT * FROM tasks WHERE session_id = ? AND schedule_id = ?', [sessionId, row.id])).map(taskRecord);
    return scheduleRecord(row, tasks);
  }
  async updateTask(sessionId: string, projectId: string, taskId: string, status: TaskStatus): Promise<TaskRecord> {
    await this.required(`SELECT t.id FROM tasks t
      JOIN schedules s ON s.id = t.schedule_id AND s.session_id = t.session_id
      JOIN plan_sheets p ON p.id = s.plan_id AND p.session_id = s.session_id
      JOIN ideas i ON i.id = p.idea_id AND i.session_id = p.session_id
      WHERE t.session_id = ? AND s.session_id = ? AND p.session_id = ? AND i.session_id = ? AND i.project_id = ? AND t.id = ?`,
    [sessionId, sessionId, sessionId, sessionId, projectId, taskId]);
    await this.statement('UPDATE tasks SET status = ? WHERE session_id = ? AND id = ?', [status, sessionId, taskId]).run();
    return taskRecord(await this.required('SELECT * FROM tasks WHERE session_id = ? AND id = ?', [sessionId, taskId]));
  }
  async saveEditBrief(sessionId: string, projectId: string, planId: string, data: EditBrief): Promise<EditBriefRecord> {
    await this.requirePlan(sessionId, projectId, planId);
    await this.statement(`INSERT INTO edit_briefs (id, session_id, plan_id, directions, payload_json) VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(session_id, plan_id) DO UPDATE SET directions = excluded.directions,
      payload_json = excluded.payload_json WHERE edit_briefs.session_id = ?`, [newId(), sessionId, planId, JSON.stringify(data.directions), JSON.stringify(data), sessionId]).run();
    return editBriefRecord(await this.required('SELECT * FROM edit_briefs WHERE session_id = ? AND plan_id = ?', [sessionId, planId]));
  }
  async saveMetric(sessionId: string, projectId: string, data: MonthlyMetrics & { month: string }): Promise<MetricRecord> {
    await this.requireProject(sessionId, projectId);
    await this.statement(`INSERT INTO monthly_metrics (id, session_id, project_id, month, views, subs_delta, retention, conversions)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(session_id, project_id, month) DO UPDATE SET
      views = excluded.views, subs_delta = excluded.subs_delta, retention = excluded.retention,
      conversions = excluded.conversions WHERE monthly_metrics.session_id = ?`, [newId(), sessionId, projectId, data.month, data.views, data.subsDelta, data.retention, data.conversions, sessionId]).run();
    return metricRecord(await this.required('SELECT * FROM monthly_metrics WHERE session_id = ? AND project_id = ? AND month = ?', [sessionId, projectId, data.month]));
  }
  /** The sole unscoped operation, used only by the daily scheduled reset. */
  async resetAll(): Promise<void> {
    await this.db.prepare('DELETE FROM sessions').run();
  }
}
