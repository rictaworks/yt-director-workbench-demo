import type { ProjectRecord, PlanRecord, IdeaRecord } from '../backend/repository-types.ts';
import type { Industry, Goal, IdeaType, DomainWarning, MonthlyReport, TaskStatus, DelayJudgment } from '../core/types.ts';
import { judgeDelay } from '../core/index.ts';
import { ApiClient, ApiError } from './api.ts';
import { channelText, planText, outlineText, scheduleText, briefText, reportText } from './artifacts.ts';
import { messages as m, screens } from './messages.ts';
import { dateInJapan, isValidMemo, normalizeError, numberLabel, parseRoute, routeHash, ViewRevision } from './view-model.ts';
import type { Route, ScreenId } from './view-model.ts';

export interface Bootstrap { projects: ProjectRecord[]; catalog: { industries: Industry[]; goals: Goal[]; ideaTypes: IdeaType[] }; today: string }
export interface WorkbenchOptions { api?: ApiClient; document?: Document; window?: Window }
type NoteDraft = { seq: number; talkingPoints: string; shootMemo: string }[];
type ElementTag = keyof HTMLElementTagNameMap;
type Control = HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;

export class Workbench {
  private root: HTMLElement;
  private doc: Document;
  private win: Window;
  private api: ApiClient;
  private data: Bootstrap | null = null;
  private route: Route;
  private activePlan = new Map<string, string>();
  private scriptDrafts = new Map<string, NoteDraft>();
  private drafts = new Map<string, string>();
  private reportMonth = new Map<string, string>();
  private reportCache = new Map<string, MonthlyReport>();
  private busy = false;
  private viewRevision = new ViewRevision();
  private requestRevision: number | null = null;
  private autoStopped = false;
  private content!: HTMLElement;
  private status!: HTMLElement;
  private error!: HTMLElement;
  private nav!: HTMLElement;
  private selector!: HTMLElement;
  private formNumber = 0;
  private handleHash = () => {
    const next = parseRoute(this.win.location.hash);
    if (next.screen === this.route.screen && next.projectId === this.route.projectId) return;
    this.route = next; this.viewRevision.advance();
    this.render();
    this.content.focus();
  };

  constructor(root: HTMLElement, options: WorkbenchOptions = {}) {
    this.root = root;
    this.doc = options.document ?? root.ownerDocument;
    this.win = options.window ?? this.doc.defaultView!;
    this.api = options.api ?? new ApiClient();
    this.route = parseRoute(this.win.location.hash);
  }

  async start(): Promise<void> {
    this.shell();
    this.win.addEventListener('hashchange', this.handleHash);
    await this.load();
  }
  destroy(): void { this.win.removeEventListener('hashchange', this.handleHash); }

  private el<K extends ElementTag>(tag: K, text = '', attributes: Record<string, string> = {}): HTMLElementTagNameMap[K] {
    const element = this.doc.createElement(tag);
    if (text) element.textContent = text;
    for (const [key, value] of Object.entries(attributes)) element.setAttribute(key, value);
    return element;
  }
  private paragraph(text: string, className = ''): HTMLParagraphElement { return this.el('p', text, className ? {class: className} : {}); }
  private list(items: readonly string[]): HTMLUListElement {
    const list = this.el('ul');
    for (const item of items) list.append(this.el('li', item));
    return list;
  }
  private section(title: string): HTMLElement {
    const section = this.el('section'); section.append(this.el('h2', title)); return section;
  }
  private warning(warnings: readonly DomainWarning[], parent: HTMLElement): void {
    if (warnings.length) { const list = this.list(warnings.map(item => item.message)); list.className = 'warning'; parent.append(list); }
  }
  private button(label: string, handler: () => void): HTMLButtonElement {
    const button = this.el('button', label, {type: 'button'});
    button.addEventListener('click', handler); return button;
  }
  private link(label: string, screen: ScreenId, projectId = this.route.projectId): HTMLAnchorElement {
    return this.el('a', label, {href: routeHash(screen, projectId)});
  }
  private input(name: string, type = 'text', value = '', attributes: Record<string, string> = {}): HTMLInputElement {
    const input = this.el('input', '', {name, type, ...attributes}); input.value = value; return input;
  }
  private textarea(name: string, value: string, attributes: Record<string, string> = {}): HTMLTextAreaElement {
    const textarea = this.el('textarea', '', {name, ...attributes}); textarea.value = value; return textarea;
  }
  private select(name: string, options: readonly {id: string; label: string}[], value = '', placeholder = false): HTMLSelectElement {
    const select = this.el('select', '', {name});
    if (placeholder) select.append(this.el('option', m.choose, {value: ''}));
    for (const item of options) select.append(this.el('option', item.label, {value: item.id}));
    if (value) select.value = value;
    return select;
  }
  private field(parent: HTMLElement, label: string, control: Control, hint?: string): void {
    const id = `field-${++this.formNumber}`; control.id = id;
    parent.append(this.el('label', label, {for: id}), control);
    if (hint) { control.setAttribute('aria-describedby', `${id}-hint`); parent.append(this.el('small', hint, {id: `${id}-hint`})); }
  }
  private form(action: (data: FormData, submitter: HTMLElement | null) => Promise<void>): HTMLFormElement {
    const form = this.el('form');
    const trap = this.el('div', '', {class: 'honeypot', 'aria-hidden': 'true'});
    const trapInput = this.input('website', 'text', '', {tabindex: '-1', autocomplete: 'off'});
    this.field(trap, m.website, trapInput); form.append(trap);
    form.addEventListener('submit', event => {
      event.preventDefault();
      const submitter = (event as SubmitEvent).submitter;
      const data = new FormData(form);
      void this.run(form, () => action(data, submitter));
    });
    return form;
  }
  private submit(form: HTMLFormElement, label: string, action = ''): HTMLButtonElement {
    const button = this.el('button', label, {type: 'submit', ...(action ? {'data-action': action} : {})});
    form.append(button); return button;
  }
  private async run(form: HTMLFormElement | null, action: () => Promise<void>): Promise<void> {
    if (this.busy) return;
    this.busy = true; this.requestRevision = this.viewRevision.capture(); this.error.textContent = ''; this.status.textContent = m.saving;
    this.content.setAttribute('aria-busy', 'true');
    const controls = Array.from(this.content.querySelectorAll<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement | HTMLButtonElement>('input, select, textarea, button'));
    const previouslyDisabled = controls.map(control => control.disabled);
    controls.forEach(control => { control.disabled = true; });
    try { await action(); this.renderResult(); this.status.textContent = m.saved; }
    catch (error) {
      this.status.textContent = '';
      this.error.textContent = normalizeError(error);
      if (this.canRenderResult()) this.error.focus();
    } finally {
      this.busy = false; this.content.removeAttribute('aria-busy'); this.requestRevision = null;
      controls.forEach((control, index) => { control.disabled = previouslyDisabled[index] ?? false; });
    }
  }
  private canRenderResult(): boolean { return this.viewRevision.isCurrent(this.requestRevision); }
  private renderResult(): void { if (this.canRenderResult()) this.render(); }
  private payload(data: FormData, values: Record<string, unknown>): Record<string, unknown> {
    return {...values, website: String(data.get('website') ?? '')};
  }
  private async mutate(projectId: string, suffix: string, method: string, values: Record<string, unknown>): Promise<ProjectRecord> {
    const project = await this.api.request<ProjectRecord>(`/api/projects/${encodeURIComponent(projectId)}${suffix}`, method, values);
    this.updateProject(project); return project;
  }
  private updateProject(project: ProjectRecord): void {
    if (!this.data) return;
    const index = this.data.projects.findIndex(item => item.id === project.id);
    if (index < 0) this.data.projects.push(project); else this.data.projects[index] = project;
  }
  private navigate(screen: ScreenId, projectId: string): void {
    const hash = routeHash(screen, projectId);
    this.route = {screen, projectId}; this.viewRevision.advance();
    if (this.win.location.hash !== hash) this.win.location.hash = hash;
    this.render();
  }
  private shell(): void {
    const header = this.el('header');
    const skip = this.el('a', m.skipToMain, {href: '#main-content', class: 'skip-link'});
    skip.addEventListener('click', event => { event.preventDefault(); this.content.focus(); });
    header.append(skip, this.el('h1', m.appName), this.paragraph(m.subtitle), this.paragraph(m.generationNotice));
    this.selector = this.el('div');
    this.nav = this.el('nav', '', {'aria-label': m.navigation});
    header.append(this.selector, this.nav);
    this.status = this.el('p', '', {role: 'status', 'aria-live': 'polite'});
    this.error = this.el('p', '', {role: 'alert', tabindex: '-1'});
    this.content = this.el('main', '', {id: 'main-content', tabindex: '-1'});
    const footer = this.el('footer'); footer.append(this.paragraph(m.resetNotice), this.paragraph(m.legalNotice));
    this.root.replaceChildren(header, this.status, this.error, this.content, footer);
  }
  private async load(): Promise<void> {
    this.status.textContent = m.loading; this.error.textContent = '';
    try {
      this.data = await this.api.request<Bootstrap>('/api/bootstrap');
      this.autoStopped = this.data.projects.some(project => project.ideas.some(idea => Boolean(idea.classification?.error)));
      this.status.textContent = ''; this.render();
    } catch (error) {
      this.status.textContent = ''; this.error.textContent = normalizeError(error);
      this.content.replaceChildren(this.button(m.retry, () => { void this.load(); }));
    }
  }
  private get project(): ProjectRecord | null { return this.data?.projects.find(project => project.id === this.route.projectId) ?? null; }
  private get plan(): PlanRecord | null {
    const project = this.project; if (!project) return null;
    return project.plans.find(plan => plan.id === this.activePlan.get(project.id)) ?? project.plans.at(-1) ?? null;
  }
  private ideaLabel = (id: string): string => this.data?.catalog.ideaTypes.find(item => item.id === id)?.label ?? id;
  private delay(project: ProjectRecord): DelayJudgment {
    return judgeDelay({tasks: project.schedules.flatMap(schedule => schedule.tasks)}, this.data?.today ?? dateInJapan());
  }
  private render(): void {
    if (!this.data) return;
    this.formNumber = 0;
    this.selector.replaceChildren();
    const projectSelect = this.select('active-project', this.data.projects.map(item => ({id: item.id, label: item.clientAlias})), this.route.projectId, true);
    projectSelect.className = 'project-selector';
    projectSelect.addEventListener('change', () => this.navigate(this.route.screen, projectSelect.value));
    this.field(this.selector, m.selectProject, projectSelect);
    const navList = this.el('ol');
    for (const screen of screens) {
      const item = this.el('li'); const link = this.link(screen.label, screen.id);
      if (screen.id === this.route.screen) link.setAttribute('aria-current', 'page');
      item.append(link); navList.append(item);
    }
    this.nav.replaceChildren(navList); this.content.replaceChildren();
    if (this.route.screen === 'home') { this.renderHome(); return; }
    this.content.append(this.el('h2', screens.find(screen => screen.id === this.route.screen)?.label ?? ''));
    const project = this.project;
    if (!project) { this.content.append(this.paragraph(m.selectProjectFirst), this.link(m.newProject, 'home', '')); return; }
    this.content.append(this.paragraph(`${m.project}: ${project.clientAlias}`));
    if (['outline', 'schedule', 'brief'].includes(this.route.screen) && !project.plans.length) {
      this.content.append(this.paragraph(m.planRequired), this.link(m.buildPlan, 'ideas')); return;
    }
    if (['ideas', 'outline', 'schedule', 'brief'].includes(this.route.screen) && project.plans.length) this.planSelector(project);
    switch (this.route.screen) {
      case 'channel': this.renderChannel(project); break;
      case 'ideas': this.renderIdeas(project); break;
      case 'outline': this.renderOutline(project); break;
      case 'schedule': this.renderSchedule(project); break;
      case 'brief': this.renderBrief(project); break;
      case 'report': this.renderReport(project); break;
    }
  }
  private planSelector(project: ProjectRecord): void {
    const select = this.select('active-plan', project.plans.map(plan => ({id: plan.id, label: plan.titles[0] ?? plan.ideaTypeLabel})), this.plan?.id);
    select.addEventListener('change', () => { this.activePlan.set(project.id, select.value); this.viewRevision.advance(); this.render(); });
    const wrapper = this.el('div'); this.field(wrapper, m.selectPlan, select); this.content.append(wrapper);
  }
  private renderHome(): void {
    const section = this.section(m.projectList);
    if (!this.data?.projects.length) section.append(this.paragraph(m.noProjects));
    for (const project of this.data?.projects ?? []) {
      const article = this.el('article');
      article.append(this.el('h3', project.clientAlias), this.paragraph(project.channel ? `${project.channel.industryLabel} / ${project.channel.goalLabel}` : m.notConfigured),
        this.paragraph(project.schedules.length ? `${m.delay}: ${this.delay(project).label}` : m.noSchedule), this.link(m.open, 'channel', project.id));
      section.append(article);
    }
    const creation = this.section(m.newProject);
    const form = this.form(async data => {
      const initialRoute = routeHash(this.route.screen, this.route.projectId);
      const project = await this.api.request<ProjectRecord>('/api/projects', 'POST', this.payload(data, {clientAlias: String(data.get('clientAlias') ?? '')}));
      this.updateProject(project);
      if (this.canRenderResult() && routeHash(this.route.screen, this.route.projectId) === initialRoute) this.navigate('channel', project.id);
    });
    this.field(form, m.clientAlias, this.input('clientAlias', 'text', '', {required: '', maxlength: '40', placeholder: 'A社'}), m.clientAliasHint);
    form.append(this.paragraph(m.privacyNotice)); this.submit(form, m.createProject); creation.append(form);
    this.content.append(section, creation);
  }
  private renderChannel(project: ProjectRecord): void {
    const channel = project.channel;
    const form = this.form(async data => {
      await this.mutate(project.id, '/channel', 'PUT', this.payload(data, {industry: String(data.get('industry')), goal: String(data.get('goal')), target: String(data.get('target') ?? '')}));
    });
    this.field(form, m.industry, this.select('industry', this.data!.catalog.industries, channel?.industry));
    this.field(form, m.goal, this.select('goal', this.data!.catalog.goals, channel?.goal));
    this.field(form, m.target, this.textarea('target', channel?.target ?? '', {maxlength: '200'}), m.targetHint);
    form.append(this.paragraph(m.privacyNotice)); this.submit(form, m.saveChannel);
    if (channel) form.append(this.paragraph(m.changeChannelNote));
    this.content.append(form);
    if (!channel) return;
    const result = this.section(m.configured);
    result.append(this.paragraph(`${m.goal}: ${channel.goalLabel}`), this.paragraph(`${m.target}: ${channel.target}`));
    if (channel.targetDefaulted) result.append(this.paragraph(m.targetDefaulted));
    result.append(this.el('h3', m.recommended), this.list(channel.recommended.map(this.ideaLabel)), this.el('h3', m.nonRecommended), this.list(channel.nonRecommended.map(item => `${this.ideaLabel(item.ideaType)}: ${item.reason}`)), this.el('h3', m.cautions), this.list(channel.cautions));
    this.artifact(result, channelText(channel, this.ideaLabel));
    result.append(this.link(m.buildPlan, 'ideas')); this.content.append(result);
  }
  private renderIdeas(project: ProjectRecord): void {
    if (!project.channel) { this.content.append(this.paragraph(m.channelRequired), this.link(m.saveChannel, 'channel')); return; }
    const form = this.form(async (data, submitter) => {
      const memo = String(data.get('memo') ?? '');
      if (!isValidMemo(memo)) throw new Error(m.invalidMemo);
      const manual = submitter?.dataset.action === 'manual';
      const ideaType = String(data.get('manualType') ?? '');
      if (manual && !ideaType) {
        manualType.setAttribute('aria-invalid', 'true');
        manualError.textContent = m.manualTypeRequired;
        throw new Error(m.manualTypeRequired);
      }
      try {
        const result = await this.mutate(project.id, '/ideas', 'POST', this.payload(data, {memo, ...(manual ? {ideaType} : {})}));
        if (this.canRenderResult()) this.drafts.delete(project.id);
        const classification = result.ideas.at(-1)?.classification;
        if (classification?.error) this.autoStopped = true;
      } catch (error) {
        if (error instanceof ApiError && (error.status === 503 || error.status === 429 || /classification|quota/i.test(error.code))) {
          this.autoStopped = true; this.renderResult();
          throw new Error(`${normalizeError(error)} ${m.classificationStopped}`);
        }
        throw error;
      }
    });
    const memo = this.textarea('memo', this.drafts.get(project.id) ?? '', {required: '', minlength: '2', maxlength: '500'});
    memo.addEventListener('input', () => this.drafts.set(project.id, memo.value));
    this.field(form, m.memo, memo, m.memoHint); form.append(this.paragraph(m.privacyNotice));
    const automatic = this.submit(form, m.classify, 'automatic'); automatic.disabled = this.autoStopped;
    if (this.autoStopped) form.append(this.paragraph(m.classificationStopped, 'warning'));
    const manualType = this.select('manualType', this.data!.catalog.ideaTypes, '', true);
    this.field(form, m.manual, manualType);
    const manualError = this.el('small', '', {id: `${manualType.id}-error`});
    manualType.setAttribute('aria-describedby', manualError.id);
    manualType.addEventListener('change', () => {
      manualType.removeAttribute('aria-invalid'); manualError.textContent = '';
      if (this.error.textContent === m.manualTypeRequired) this.error.textContent = '';
    });
    form.append(manualError);
    this.submit(form, m.manualSave, 'manual'); this.content.append(form);
    const ideaSection = this.section(m.ideaList);
    if (!project.ideas.length) ideaSection.append(this.paragraph(m.noIdeas));
    for (const idea of [...project.ideas].reverse()) this.ideaCard(ideaSection, project, idea);
    this.content.append(ideaSection);
    if (this.plan) {
      const plan = this.plan; const section = this.section(m.plan);
      section.append(this.paragraph(`${m.ideaType}: ${plan.ideaTypeLabel}`), this.el('h3', m.titles), this.list(plan.titles), this.el('h3', m.thumbnails), this.list(plan.thumbTexts), this.el('h3', m.aim), this.paragraph(plan.aim), this.el('h3', m.audience), this.paragraph(plan.audience), this.el('h3', m.summary), this.paragraph(plan.summary));
      if (plan.summaryTruncated) section.append(this.paragraph(m.excerptNotice));
      this.warning(plan.warnings, section); section.append(this.el('h3', m.cautions), this.list(plan.channel.cautions));
      this.artifact(section, planText(plan)); section.append(this.link(m.buildOutline, 'outline')); this.content.append(section);
    }
  }
  private ideaCard(parent: HTMLElement, project: ProjectRecord, idea: IdeaRecord): void {
    const article = this.el('article'); article.append(this.el('h3', idea.memo));
    const classification = idea.classification;
    if (classification) {
      article.append(this.paragraph(classification.mode === 'automatic' ? m.classificationAutomatic : classification.mode === 'selection' ? m.classificationSelection : m.classificationManual));
      if (classification.confidence !== null) article.append(this.paragraph(`${m.confidence}: ${numberLabel(classification.confidence * 100)}%`));
      if (classification.model) article.append(this.paragraph(`${m.model}: ${classification.model}`));
      if (classification.error) article.append(this.paragraph(classification.error.message, 'warning'));
      if (classification.cautionProbability !== null && classification.cautionProbability >= .5) {
        article.append(this.paragraph(`${m.cautionProbability}: ${numberLabel(classification.cautionProbability * 100)}%`), this.list(classification.cautions));
      }
    }
    const selectionMode = classification?.mode === 'selection';
    const form = this.form(async data => {
      const choice = String(data.get('candidate') ?? '');
      const ideaType = selectionMode && choice !== 'other' ? choice : String(data.get('ideaType') ?? '');
      if (!ideaType) throw new Error(m.chooseType);
      const result = await this.mutate(project.id, '/plans', 'POST', this.payload(data, {ideaId: idea.id, ideaType}));
      const plan = result.plans.find(item => item.ideaId === idea.id); if (plan && this.canRenderResult()) this.activePlan.set(project.id, plan.id);
    });
    const type = this.select('ideaType', this.data!.catalog.ideaTypes, classification?.selectedIdeaType ?? idea.ideaType ?? '', true);
    if (selectionMode) {
      const candidate = this.select('candidate', [...classification.candidates.slice(0, 2).map(item => ({id: item.ideaType, label: `${this.ideaLabel(item.ideaType)} (${numberLabel(item.probability * 100)}%)`})), {id: 'other', label: m.other}], '', true);
      candidate.required = true; this.field(form, m.chooseType, candidate);
      const manualGroup = this.el('div'); this.field(manualGroup, m.ideaType, type); manualGroup.hidden = true; type.disabled = true;
      candidate.addEventListener('change', () => { manualGroup.hidden = candidate.value !== 'other'; type.disabled = candidate.value !== 'other'; type.required = candidate.value === 'other'; });
      form.append(manualGroup);
    } else { type.required = true; this.field(form, m.ideaType, type); }
    if (project.plans.some(plan => plan.ideaId === idea.id)) form.append(this.paragraph(m.regeneratePlanNote, 'warning'));
    this.submit(form, m.buildPlan); article.append(form); parent.append(article);
  }
  private renderOutline(project: ProjectRecord): void {
    const plan = this.plan; if (!plan) return;
    const outline = project.outlines.find(item => item.planId === plan.id);
    const draftKey = `${project.id}/${plan.id}/${outline?.id ?? ''}`;
    const form = this.form(async data => {
      await this.mutate(project.id, '/outlines', 'POST', this.payload(data, {planId: plan.id, targetSeconds: Number(data.get('targetSeconds'))}));
      this.scriptDrafts.delete(draftKey);
    });
    this.field(form, m.targetSeconds, this.input('targetSeconds', 'number', String(outline?.targetSeconds ?? 480), {required: '', min: '1', max: '1800', step: '1'}), m.secondsHint);
    if (outline) form.append(this.paragraph(m.regenerateOutlineNote));
    this.submit(form, outline ? m.regenerateOutline : m.buildOutline); this.content.append(form);
    if (!outline) { this.content.append(this.paragraph(m.noOutline)); return; }
    const section = this.section(`${m.outline} (${outline.targetSeconds}秒)`);
    if (outline.shorts) section.append(this.paragraph(m.shorts)); this.warning(outline.warnings, section);
    const saved = outline.blocks.map(({seq, talkingPoints, shootMemo}) => ({seq, talkingPoints, shootMemo}));
    const draft = this.scriptDrafts.get(draftKey) ?? saved;
    const notes = this.form(async data => {
      const submittedDraft = this.scriptDrafts.get(draftKey);
      await this.mutate(project.id, `/outlines/${encodeURIComponent(outline.id)}`, 'PUT', this.payload(data, {blocks: outline.blocks.map(block => ({seq: block.seq, talkingPoints: String(data.get(`points-${block.seq}`) ?? ''), shootMemo: String(data.get(`shoot-${block.seq}`) ?? '')}))}));
      // A delayed save must not discard edits made after navigating away and back.
      if (this.scriptDrafts.get(draftKey) === submittedDraft) this.scriptDrafts.delete(draftKey);
      // Reverting to the old baseline during the request is also a newer edit:
      // it becomes dirty once the submitted values replace that baseline.
      else if (submittedDraft && !this.scriptDrafts.has(draftKey)) this.scriptDrafts.set(draftKey, saved);
    });
    const draftStatus = this.el('p', this.scriptDrafts.has(draftKey) ? m.notesDraft : '', {role: 'status', 'data-script-draft': ''});
    notes.addEventListener('input', () => {
      const values = saved.map(block => ({seq: block.seq,
        talkingPoints: notes.querySelector<HTMLTextAreaElement>(`[name="points-${block.seq}"]`)!.value,
        shootMemo: notes.querySelector<HTMLTextAreaElement>(`[name="shoot-${block.seq}"]`)!.value}));
      const baseline = this.data?.projects.find(item => item.id === project.id)?.outlines.find(item => item.id === outline.id)?.blocks ?? saved;
      const dirty = values.some((block, index) => block.talkingPoints !== baseline[index]?.talkingPoints || block.shootMemo !== baseline[index]?.shootMemo);
      if (dirty) this.scriptDrafts.set(draftKey, values); else this.scriptDrafts.delete(draftKey);
      draftStatus.textContent = dirty ? m.notesDraft : '';
    });
    notes.append(this.paragraph(m.notesHint), draftStatus);
    for (const [index, block] of outline.blocks.entries()) {
      const fieldset = this.el('fieldset'); fieldset.append(this.el('legend', `${index + 1}. ${block.label} (${block.seconds}秒)`));
      this.field(fieldset, m.talkingPoints, this.textarea(`points-${block.seq}`, draft[index]?.talkingPoints ?? block.talkingPoints, {maxlength: '1000'}));
      this.field(fieldset, m.shootMemo, this.textarea(`shoot-${block.seq}`, draft[index]?.shootMemo ?? block.shootMemo, {maxlength: '1000'})); notes.append(fieldset);
    }
    this.submit(notes, m.saveNotes); section.append(notes, this.el('h3', m.checklist));
    const list = this.el('ul');
    for (const item of outline.checklist) {
      const li = this.el('li'); li.append(this.el('strong', item.block), this.list([`${m.cut}: ${item.cut}`, `${m.prop}: ${item.prop}`, `${m.position}: ${item.position}`])); list.append(li);
    }
    section.append(list); this.artifact(section, outlineText(outline)); section.append(this.link(m.buildSchedule, 'schedule')); this.content.append(section);
  }
  private renderSchedule(project: ProjectRecord): void {
    const plan = this.plan; if (!plan) return;
    const schedule = project.schedules.find(item => item.planId === plan.id);
    const form = this.form(async data => {
      const shootDate = String(data.get('shootDate') ?? '');
      await this.mutate(project.id, '/schedules', 'POST', this.payload(data, {planId: plan.id, publishDate: String(data.get('publishDate') ?? ''), ...(shootDate ? {shootDate} : {})}));
    });
    this.field(form, m.publishDate, this.input('publishDate', 'date', schedule?.publishDate ?? '', {required: ''}));
    this.field(form, m.shootDate, this.input('shootDate', 'date', schedule?.fixedShootDate ? schedule.shootDate : ''));
    form.append(this.paragraph(m.scheduleNote));
    if (schedule) form.append(this.paragraph(m.scheduleRegenerateNote));
    this.submit(form, m.buildSchedule); this.content.append(form);
    if (!schedule) { this.content.append(this.paragraph(m.noScheduleForPlan)); return; }
    const section = this.section(m.schedule); section.append(this.paragraph(schedule.calendarNote)); this.warning(schedule.warnings, section);
    if (schedule.insufficient) section.append(this.paragraph(`${m.earliestPublish}: ${schedule.earliestPublishDate}`, 'warning'));
    if (schedule.shootNeedsReschedule) section.append(this.paragraph(`${m.earliestShoot}: ${schedule.earliestShootDate}`, 'warning'));
    const delay = judgeDelay(schedule, this.data!.today);
    const table = this.table([m.step, m.due, m.status, m.delay]);
    for (const task of schedule.tasks) {
      const row = this.el('tr'); row.append(this.el('th', task.label, {scope: 'row'}), this.el('td', task.due));
      const cell = this.el('td');
      const taskForm = this.form(async data => { await this.mutate(project.id, `/tasks/${encodeURIComponent(task.id)}`, 'PATCH', this.payload(data, {status: String(data.get('status'))})); });
      this.field(taskForm, `${task.label} ${m.status}`, this.select('status', (Object.keys(m.taskStatuses) as TaskStatus[]).map(id => ({id, label: m.taskStatuses[id]})), task.status));
      this.submit(taskForm, m.update); cell.append(taskForm);
      row.append(cell, this.el('td', m.delays[delay.tasks.find(item => item.step === task.step)?.status ?? 'none'])); table.body.append(row);
    }
    section.append(table.wrapper); this.artifact(section, scheduleText(schedule, delay)); section.append(this.link(m.buildBrief, 'brief')); this.content.append(section);
  }
  private renderBrief(project: ProjectRecord): void {
    const plan = this.plan; if (!plan) return;
    const outline = project.outlines.find(item => item.planId === plan.id);
    if (!outline) { this.content.append(this.paragraph(m.briefOutlineRequired), this.link(m.buildOutline, 'outline')); return; }
    const schedule = project.schedules.find(item => item.planId === plan.id);
    if (!schedule) this.content.append(this.paragraph(m.briefScheduleRequired), this.link(m.buildSchedule, 'schedule'));
    const form = this.form(async data => { await this.mutate(project.id, '/edit-briefs', 'POST', this.payload(data, {planId: plan.id})); });
    form.append(this.paragraph(m.briefRegenerateNote)); this.submit(form, m.buildBrief); this.content.append(form);
    const brief = project.editBriefs.find(item => item.planId === plan.id);
    if (!brief) { this.content.append(this.paragraph(m.noBrief)); return; }
    const section = this.section(brief.title); section.append(this.paragraph(`${m.due}: ${brief.dueDate ?? m.dueUnset}`));
    for (const [index, direction] of brief.directions.entries()) {
      const article = this.el('article'); article.append(this.el('h3', `${index + 1}. ${direction.block} (${direction.seconds}秒)`),
        this.list([`${m.captions}: ${direction.captions}`, `${m.bgm}: ${direction.bgm}`, `${m.cuts}: ${direction.cuts}`, `${m.talkingPoints}: ${direction.talkingPoints}`, `${m.shootMemo}: ${direction.shootMemo}`])); section.append(article);
    }
    section.append(this.el('h3', m.cautions), this.list(brief.cautions), this.paragraph(brief.notice)); this.artifact(section, briefText(brief)); this.content.append(section);
  }
  private renderReport(project: ProjectRecord): void {
    const month = this.reportMonth.get(project.id) ?? this.data!.today.slice(0, 7);
    const metric = project.metrics.find(item => item.month === month);
    const form = this.form(async data => {
      const selectedMonth = String(data.get('month') ?? ''); this.reportMonth.set(project.id, selectedMonth);
      for (const key of this.reportCache.keys()) if (key.startsWith(`${project.id}/`)) this.reportCache.delete(key);
      await this.mutate(project.id, '/metrics', 'PUT', this.payload(data, {month: selectedMonth, views: Number(data.get('views')), subsDelta: Number(data.get('subsDelta')), retention: Number(data.get('retention')), conversions: Number(data.get('conversions'))}));
      await this.loadReport(project.id, selectedMonth);
    });
    const monthInput = this.input('month', 'month', month, {required: ''});
    monthInput.addEventListener('change', () => { if (monthInput.value) { this.reportMonth.set(project.id, monthInput.value); this.viewRevision.advance(); this.render(); } });
    this.field(form, m.month, monthInput);
    for (const key of ['views', 'subsDelta', 'retention', 'conversions'] as const) this.field(form, m[key], this.input(key, 'number', metric ? String(metric[key]) : '', {required: '', ...(key === 'subsDelta' ? {} : {min: '0'}), step: key === 'retention' ? 'any' : '1', ...(key === 'retention' ? {max: '100'} : {})}));
    form.append(this.paragraph(m.metricHint)); this.submit(form, m.saveMetrics);
    const reportButton = this.button(m.showReport, () => { void this.run(null, () => this.loadReport(project.id, month)); }); reportButton.disabled = !metric; form.append(reportButton); this.content.append(form);
    const report = this.reportCache.get(`${project.id}/${month}`);
    if (!report) { this.content.append(this.paragraph(m.noMetrics)); return; }
    const section = this.section(`${m.monthlyReport} (${month})`);
    const table = this.table([m.metric, m.current, m.previous, m.difference, m.changeRate]);
    for (const item of report.metrics) {
      const row = this.el('tr'); row.append(this.el('th', item.label, {scope: 'row'}), this.el('td', numberLabel(item.current)), this.el('td', numberLabel(item.previous)), this.el('td', numberLabel(item.difference)), this.el('td', item.changeRate === null ? item.note || m.noPrevious : `${numberLabel(item.changeRate)}%`)); table.body.append(row);
    }
    section.append(table.wrapper, this.el('h3', m.measures));
    section.append(report.measures.length ? this.list(report.measures.map(item => `${item.title}: ${item.action}`)) : this.paragraph(m.noMeasures));
    section.append(this.list(report.notes)); this.artifact(section, reportText(report, month)); this.content.append(section);
  }
  private async loadReport(projectId: string, month: string): Promise<void> {
    const result = await this.api.request<{report: MonthlyReport}>(`/api/projects/${encodeURIComponent(projectId)}/report?month=${encodeURIComponent(month)}`);
    this.reportCache.set(`${projectId}/${month}`, result.report);
  }
  private table(headers: readonly string[]): {wrapper: HTMLElement; body: HTMLTableSectionElement} {
    const wrapper = this.el('div', '', {class: 'table-scroll'}); const table = this.el('table');
    const head = this.el('thead'); const row = this.el('tr'); headers.forEach(label => row.append(this.el('th', label, {scope: 'col'}))); head.append(row);
    const body = this.el('tbody'); table.append(head, body); wrapper.append(table); return {wrapper, body};
  }
  private artifact(parent: HTMLElement, text: string): void {
    const section = this.el('section', '', {'aria-label': m.artifact});
    const details = this.el('details'); details.append(this.el('summary', m.showArtifact));
    const textarea = this.textarea('artifact', text, {readonly: '', class: 'artifact-text'}); this.field(details, m.copyText, textarea);
    const status = this.el('p', '', {role: 'status', 'aria-live': 'polite'});
    const copy = this.button(m.copy, () => { void (async () => {
      copy.disabled = true;
      try {
        if (!this.win.navigator.clipboard?.writeText) throw new Error(m.copyFallback);
        await this.win.navigator.clipboard.writeText(text); status.textContent = m.copied;
      } catch { details.open = true; textarea.focus(); textarea.select(); status.textContent = m.copyFallback; }
      finally { copy.disabled = false; }
    })(); });
    section.append(copy, status, details); parent.append(section);
  }
}

export async function mountWorkbench(root: HTMLElement, options: WorkbenchOptions = {}): Promise<Workbench> {
  const workbench = new Workbench(root, options); await workbench.start(); return workbench;
}
