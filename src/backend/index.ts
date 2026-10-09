import { DomainValidationError } from '../core/validation.ts';
import { HTTP_MESSAGES, FIELD_LABELS } from './messages.ts';
import { CATALOG, designChannel, classifyIdea, buildPlanSheet, buildScriptOutline, scheduleBackward, judgeDelay, buildEditBrief, buildMonthlyReport } from '../core/index.ts';
import { D1ProjectRepository, RepositoryNotFoundError, type ProjectRecord, type RepositoryDatabase } from './repository.ts';
import { JevClassifier, type WorkersAiBinding } from './jev.ts';
import { HttpError, body, member, number, object, response, sessionCookie, sessionId, text, todayJst } from './http.ts';

export interface Env { DB: RepositoryDatabase; AI?: WorkersAiBinding; JEV_ENABLED?: string; WORKERS_PLAN?: string }

function publicData(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(publicData);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).filter(([key]) => key !== 'sessionId').map(([key, entry]) => [key, publicData(entry)]));
  return value;
}
function view(project: ProjectRecord, today: string): unknown {
  return publicData({ ...project, delay: judgeDelay({ tasks: project.schedules.flatMap(schedule => schedule.tasks) }, today) });
}
function requireProject(project: ProjectRecord | null): ProjectRecord {
  if (!project) throw new RepositoryNotFoundError(); return project;
}
function month(value: unknown): string {
  const result = text(value, FIELD_LABELS.month, 7, 7);
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(result) || result.startsWith('0000')) throw new HttpError(400, 'invalid_input', HTTP_MESSAGES.invalidMonth);
  return result;
}
function previousMonth(value: string): string {
  const date = new Date(`${value}-01T00:00:00Z`); date.setUTCMonth(date.getUTCMonth() - 1); return date.toISOString().slice(0, 7);
}

async function fetchHandler(request: Request, env?: Env): Promise<Response> {
  const url = new URL(request.url);
  if (url.pathname === '/api/health') {
    if (request.method !== 'GET') return Response.json({ error: 'method_not_allowed' }, { status: 405, headers: { allow: 'GET' } });
    return response({ status: 'ok', stage: 'demo' });
  }
  if (!url.pathname.startsWith('/api/') || !['GET', 'POST', 'PUT', 'PATCH'].includes(request.method)) return response({ error: 'not_found', message: HTTP_MESSAGES.noApi }, 404);
  let cookie: string | undefined;
  try {
    let data: Record<string, unknown> = {};
    if (request.method !== 'GET') {
      data = await body(request);
      if (data.website !== undefined && data.website !== '') return new Response(null, { status: 204 });
    }
    if (!env?.DB) throw new HttpError(503, 'database_unavailable', HTTP_MESSAGES.databaseUnavailable);
    const repository = new D1ProjectRepository(env.DB);
    let owner = sessionId(request);
    if (!owner || !await repository.sessionExists(owner)) {
      owner = crypto.randomUUID(); await repository.createSession(owner, new Date().toISOString()); cookie = sessionCookie(owner, request);
    }
    const today = todayJst();
    if (url.pathname === '/api/bootstrap' && request.method === 'GET') {
      const projects = await repository.listProjects(owner);
      return response({ projects: projects.map(project => view(project, today)), catalog: CATALOG, today }, 200, cookie);
    }
    if (url.pathname === '/api/projects' && request.method === 'POST') {
      const project = await repository.createProject(owner, text(data.clientAlias, FIELD_LABELS.clientAlias, 80, 1));
      return response(view(project, today), 201, cookie);
    }
    const route = /^\/api\/projects\/([a-zA-Z0-9-]+)(?:\/([a-z-]+))?(?:\/([a-zA-Z0-9-]+))?$/.exec(url.pathname);
    if (!route) throw new HttpError(404, 'not_found', HTTP_MESSAGES.noApi);
    const projectId = route[1]!; const action = route[2]; const itemId = route[3];
    const project = requireProject(await repository.getProject(owner, projectId));
    if (!action && request.method === 'GET') return response(view(project, today), 200, cookie);
    if (action === 'report' && request.method === 'GET') {
      const selectedMonth = month(url.searchParams.get('month'));
      const current = project.metrics.find(metric => metric.month === selectedMonth);
      if (!current) throw new HttpError(404, 'metric_not_found', HTTP_MESSAGES.noMetric);
      const previous = project.metrics.find(metric => metric.month === previousMonth(selectedMonth));
      return response({ report: buildMonthlyReport(current, previous) }, 200, cookie);
    }
    if (action === 'channel' && request.method === 'PUT') {
      const channel = designChannel(member(data.industry, CATALOG.industries.map(row => row.id), FIELD_LABELS.industry), member(data.goal, CATALOG.goals.map(row => row.id), FIELD_LABELS.goal), text(data.target ?? '', FIELD_LABELS.target, 200));
      await repository.saveChannel(owner, projectId, channel);
    } else if (action === 'ideas' && request.method === 'POST') {
      if (!project.channel) throw new HttpError(409, 'channel_required', HTTP_MESSAGES.channelRequired);
      const memo = text(data.memo, FIELD_LABELS.memo, 500, 2);
      if (data.ideaType !== undefined && data.ideaType !== '') {
        const ideaType = member(data.ideaType, CATALOG.ideaTypes.map(row => row.id), FIELD_LABELS.ideaType);
        await repository.saveIdea(owner, projectId, { memo, ideaType, confidence: null, classifiedBy: 'manual', jevModel: null, classification: null });
      } else {
        const classification = await classifyIdea(memo, new JevClassifier(env.AI, env.JEV_ENABLED === 'true' && env.WORKERS_PLAN === 'free'), project.channel.industry);
        await repository.saveIdea(owner, projectId, { memo, ideaType: classification.selectedIdeaType, confidence: classification.confidence, classifiedBy: 'jev', jevModel: classification.model, classification });
      }
    } else if (action === 'plans' && request.method === 'POST') {
      if (!project.channel) throw new HttpError(409, 'channel_required', HTTP_MESSAGES.channelRequired);
      const idea = project.ideas.find(row => row.id === data.ideaId);
      if (!idea) throw new RepositoryNotFoundError();
      const ideaType = member(data.ideaType, CATALOG.ideaTypes.map(row => row.id), FIELD_LABELS.ideaType);
      await repository.savePlan(owner, projectId, idea.id, buildPlanSheet(project.channel, ideaType, idea.memo));
    } else if (action === 'outlines' && request.method === 'POST') {
      const plan = project.plans.find(row => row.id === data.planId); if (!plan) throw new RepositoryNotFoundError();
      await repository.saveOutline(owner, projectId, plan.id, buildScriptOutline(plan, number(data.targetSeconds ?? 480, FIELD_LABELS.seconds, 1, 1800)));
    } else if (action === 'outlines' && itemId && request.method === 'PUT') {
      const outline = project.outlines.find(row => row.id === itemId); if (!outline) throw new RepositoryNotFoundError();
      if (!Array.isArray(data.blocks) || data.blocks.length !== outline.blocks.length) throw new HttpError(400, 'invalid_input', HTTP_MESSAGES.allBlocks);
      const blocks = data.blocks.map(raw => { const row = object(raw); return { seq: number(row.seq, FIELD_LABELS.seq, 0, 100), talkingPoints: text(row.talkingPoints, FIELD_LABELS.talkingPoints, 2000), shootMemo: text(row.shootMemo, FIELD_LABELS.shootMemo, 1000) }; });
      if (new Set(blocks.map(row => row.seq)).size !== blocks.length || blocks.some(row => !outline.blocks.some(block => block.seq === row.seq))) throw new HttpError(400, 'invalid_input', HTTP_MESSAGES.invalidBlocks);
      await repository.updateOutlineBlocks(owner, projectId, itemId, blocks);
    } else if (action === 'schedules' && request.method === 'POST') {
      const plan = project.plans.find(row => row.id === data.planId); if (!plan) throw new RepositoryNotFoundError();
      const shootDate = data.shootDate === undefined || data.shootDate === '' ? undefined : text(data.shootDate, FIELD_LABELS.shootDate, 10, 10);
      await repository.saveSchedule(owner, projectId, plan.id, scheduleBackward(text(data.publishDate, FIELD_LABELS.publishDate, 10, 10), today, shootDate));
    } else if (action === 'tasks' && itemId && request.method === 'PATCH') {
      await repository.updateTask(owner, projectId, itemId, member(data.status, ['todo', 'in_progress', 'done'], FIELD_LABELS.taskStatus));
    } else if (action === 'edit-briefs' && request.method === 'POST') {
      const plan = project.plans.find(row => row.id === data.planId); if (!plan) throw new RepositoryNotFoundError();
      const outline = project.outlines.find(row => row.planId === plan.id), schedule = project.schedules.find(row => row.planId === plan.id);
      if (!outline || !schedule) throw new HttpError(409, 'production_required', HTTP_MESSAGES.productionRequired);
      await repository.saveEditBrief(owner, projectId, plan.id, buildEditBrief(outline, plan, schedule));
    } else if (action === 'metrics' && request.method === 'PUT') {
      await repository.saveMetric(owner, projectId, { month: month(data.month), views: number(data.views, FIELD_LABELS.views, 0, Number.MAX_SAFE_INTEGER), subsDelta: number(data.subsDelta, FIELD_LABELS.subsDelta, Number.MIN_SAFE_INTEGER, Number.MAX_SAFE_INTEGER), retention: number(data.retention, FIELD_LABELS.retention, 0, 100, false), conversions: number(data.conversions, FIELD_LABELS.conversions, 0, Number.MAX_SAFE_INTEGER) });
    } else throw new HttpError(404, 'not_found', HTTP_MESSAGES.noApi);
    return response(view(requireProject(await repository.getProject(owner, projectId)), today), 200, cookie);
  } catch (error) {
    if (error instanceof RepositoryNotFoundError) return response({ error: 'not_found', message: error.message }, 404, cookie);
    if (error instanceof HttpError) return response({ error: error.code, message: error.message }, error.status, cookie);
    // Domain validation errors are safe, deliberately human-readable. Infrastructure details stay private.
    if (error instanceof DomainValidationError) return response({ error: 'invalid_input', message: error.message }, 400, cookie);
    return response({ error: 'internal_error', message: HTTP_MESSAGES.internalError }, 500, cookie);
  }
}

export default {
  fetch: fetchHandler,
  async scheduled(event: { cron: string }, env: Env): Promise<void> {
    if (event.cron !== '0 18 * * *') return;
    await new D1ProjectRepository(env.DB).resetAll();
  },
};
