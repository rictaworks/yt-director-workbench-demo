import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Window } from 'happy-dom';
import worker from '../src/backend/index.ts';
import type { Env } from '../src/backend/index.ts';
import { Workbench } from '../src/frontend/app.ts';
import { ApiClient } from '../src/frontend/api.ts';
import { messages as m } from '../src/frontend/messages.ts';
import { parseRoute, routeHash } from '../src/frontend/view-model.ts';
import type { ScreenId } from '../src/frontend/view-model.ts';
import { createTestDatabase } from './helpers/sqlite.ts';

async function eventually(condition: () => boolean, detail = 'condition'): Promise<void> {
  const end = Date.now() + 3000;
  while (!condition()) {
    if (Date.now() > end) throw new Error(`Timed out: ${detail}`);
    await new Promise(resolve => setTimeout(resolve, 5));
  }
}

async function fixture(extra: Partial<Env> = {}, seed = false) {
  const db = createTestDatabase();
  const win = new Window({url:'https://demo.test/'});
  const originalFormData = globalThis.FormData;
  globalThis.FormData = win.FormData as unknown as typeof FormData;
  let cookie = '';
  const requests: {path: string; method: string; body: unknown}[] = [];
  let intercept: ((path: string, init: RequestInit) => Promise<void>) | null = null;
  const api = new ApiClient(async (path, init = {}) => {
    requests.push({path, method: init.method ?? 'GET', body: init.body ? JSON.parse(String(init.body)) : null});
    if (intercept) await intercept(path, init);
    const headers = new Headers(init.headers);
    headers.set('origin','https://demo.test'); headers.set('cookie',cookie);
    const response = await worker.fetch(new Request(`https://demo.test${path}`, {...init,headers}), {DB:db,...extra});
    const nextCookie = response.headers.get('set-cookie'); if (nextCookie) cookie = nextCookie.split(';')[0]!;
    return response;
  });
  let projectId = '';
  if (seed) {
    const project = await api.request<{id:string}>('/api/projects','POST',{clientAlias:'A社',website:''});
    projectId = project.id;
    await api.request(`/api/projects/${projectId}/channel`,'PUT',{industry:'clinic',goal:'leads',target:'',website:''});
    win.location.hash = routeHash('channel',projectId);
  }
  const root = win.document.createElement('div'); win.document.body.append(root);
  const app = new Workbench(root as unknown as HTMLElement, {api,document:win.document as unknown as Document,window:win as unknown as globalThis.Window});
  await app.start();
  const query = <T = any>(selector: string, within: any = root): T => {
    const element = within.querySelector(selector); assert.ok(element, `Missing ${selector}`); return element;
  };
  const button = (label: string, within: any = root): any => {
    const element = [...within.querySelectorAll('button')].find((item:any) => item.textContent === label);
    assert.ok(element, `Missing button ${label}`); return element;
  };
  const fill = (name: string, value: string, change = false, within: any = root): any => {
    const input = query(`[name="${name}"]`,within); input.value = value;
    input.dispatchEvent(new win.Event('input',{bubbles:true}));
    if (change) input.dispatchEvent(new win.Event('change',{bubbles:true}));
    return input;
  };
  const idle = async () => {
    await eventually(() => !query('main').hasAttribute('aria-busy'), 'operation completion');
    assert.equal(query('[role="alert"]').textContent,'','UI error');
  };
  const submit = async (label: string, within: any = root) => {
    const before = requests.length;
    button(label,within).click();
    await eventually(() => requests.length > before, `request for ${label}`);
    await idle();
  };
  const go = async (screen: ScreenId) => {
    projectId ||= parseRoute(win.location.hash).projectId;
    win.location.hash = routeHash(screen,projectId);
    win.dispatchEvent(new win.HashChangeEvent('hashchange'));
    await eventually(() => query('nav a[aria-current="page"]').getAttribute('href') === routeHash(screen,projectId), `route ${screen}`);
    assert.ok(query('footer').textContent.includes('JST 03:00'));
  };
  const close = async () => {
    app.destroy(); win.close(); db.close(); globalThis.FormData = originalFormData;
  };
  return {db,win,root,api,requests,app,query,button,fill,idle,submit,go,close,
    get projectId() { return projectId || parseRoute(win.location.hash).projectId; },
    setInterceptor(value: typeof intercept) { intercept = value; }};
}

test('actual DOM and Worker complete all seven screens, persistence, notes, tasks, monthly report and clipboard fallback', {timeout:15000}, async () => {
  const f = await fixture();
  try {
    assert.equal(f.root.querySelectorAll('nav a').length,7);
    f.fill('clientAlias','A社'); await f.submit(m.createProject);
    assert.equal(parseRoute(f.win.location.hash).screen,'channel');
    f.fill('industry','clinic'); f.fill('goal','leads'); await f.submit(m.saveChannel);
    assert.ok(f.query('main').textContent.includes(m.targetDefaulted));
    await f.go('ideas');
    f.fill('memo','受診前によくある質問を紹介する企画です'); await f.submit(m.classify);
    assert.equal(f.button(m.classify).disabled,true);
    assert.ok(f.query('main').textContent.includes(m.classificationManual));
    f.fill('ideaType','faq'); await f.submit(m.buildPlan);
    assert.ok(f.query('main').textContent.includes(m.titles));
    await f.go('outline'); f.fill('targetSeconds','59'); await f.submit(m.buildOutline);
    assert.equal(f.root.querySelectorAll('textarea[name^="points-"]').length,3);
    f.fill('points-1','初診の流れを紹介'); f.fill('shoot-1','正面で説明用パネルを見せる'); await f.submit(m.saveNotes);
    assert.equal(f.query('[name="points-1"]').value,'初診の流れを紹介');
    await f.go('schedule'); f.fill('publishDate','2099-10-30'); await f.submit(m.buildSchedule);
    assert.equal(f.root.querySelectorAll('select[name="status"]').length,6);
    const taskForm = f.query('select[name="status"]').closest('form'); f.fill('status','done',false,taskForm); await f.submit(m.update,taskForm);
    assert.equal(f.query('select[name="status"]').value,'done');
    await f.go('brief'); await f.submit(m.buildBrief);
    assert.ok(f.query('main').textContent.includes('初診の流れを紹介'));
    assert.ok(f.query('main').textContent.includes('正面で説明用パネルを見せる'));
    const stored = await f.api.request<any>(`/api/projects/${f.projectId}`);
    assert.equal(stored.editBriefs[0].dueDate,stored.schedules[0].tasks.find((task:any) => task.step === 'draft').due);
    await f.go('report');
    f.fill('month','2026-09',true);
    for (const [key,value] of Object.entries({views:100,subsDelta:5,retention:50,conversions:2})) f.fill(key,String(value));
    await f.submit(m.saveMetrics); assert.ok(f.query('main').textContent.includes(m.noPrevious));
    f.fill('month','2026-10',true);
    for (const [key,value] of Object.entries({views:200,subsDelta:8,retention:60,conversions:2})) f.fill(key,String(value));
    await f.submit(m.saveMetrics); assert.ok(f.query('main').textContent.includes('100%'));
    Object.defineProperty(f.win.navigator.clipboard,'writeText',{configurable:true,value:async () => {throw new Error('Permission denied');}});
    f.button(m.copy).click();
    await eventually(() => f.query('main').textContent.includes(m.copyFallback),'copy fallback');
    assert.equal(f.query('details').open,true); assert.ok(f.query('textarea[name="artifact"]').value.includes(m.monthlyReport));
    await f.go('home'); assert.ok(f.query('main').textContent.includes('A社'));
    for (const request of f.requests.filter(item => item.method !== 'GET')) assert.equal((request.body as any).website,'');
    assert.equal(JSON.stringify(stored).includes('sessionId'),false);
  } finally { await f.close(); }
});

test('delayed Worker response preserves newer route input and focus; duplicate submits issue one write', {timeout:10000}, async () => {
  const f = await fixture({},true);
  try {
    let release!: () => void;
    const gate = new Promise<void>(resolve => { release = resolve; });
    f.setInterceptor(async (path,init) => { if (path.endsWith('/channel') && init.method === 'PUT') await gate; });
    const before = f.requests.filter(item => item.path.endsWith('/channel')).length;
    f.fill('target','変更したターゲット像');
    const save = f.button(m.saveChannel); const form = save.closest('form'); save.click();
    form.dispatchEvent(new f.win.SubmitEvent('submit',{bubbles:true,cancelable:true,submitter:save}));
    assert.equal(f.requests.filter(item => item.path.endsWith('/channel')).length,before+1);
    await f.go('ideas');
    const newMemo = f.fill('memo','移動した先で入力を続けた新しい企画メモ'); newMemo.focus();
    release(); await f.idle();
    assert.equal(parseRoute(f.win.location.hash).screen,'ideas');
    assert.equal(f.query('[name="memo"]'),newMemo);
    assert.equal(newMemo.value,'移動した先で入力を続けた新しい企画メモ');
    assert.equal(f.win.document.activeElement,newMemo);
    assert.equal((await f.api.request<any>(`/api/projects/${f.projectId}`)).channel.target,'変更したターゲット像');
  } finally { await f.close(); }
});

test('low-confidence UI requires a candidate or explicit other choice and displays caution; regenerated earlier plan stays selected', {timeout:15000}, async () => {
  const f = await fixture({JEV_ENABLED:'true',WORKERS_PLAN:'free',AI:{async run() {
    return {model:'jev-1.13.0',answers:{idea_type:{type:'choice',choice:'faq',confidence:.79,probabilities:{faq:.9,howto:.1,case:0,day:0,interview:0,ranking:0,consultation:0,employee:0}},caution:{type:'noul',noul:.6}}};
  }}},true);
  try {
    await f.go('ideas'); f.fill('memo','最初の企画はよくある質問の解説です'); await f.submit(m.classify);
    assert.ok(f.query('main').textContent.includes(m.classificationSelection));
    const candidates = f.query('select[name="candidate"]'); assert.equal(candidates.value,''); assert.equal(candidates.options.length,4);
    assert.ok(f.query('main').textContent.includes(m.cautionProbability));
    f.fill('candidate','other',true); assert.equal(f.query('select[name="ideaType"]').disabled,false);
    f.fill('ideaType','ranking'); await f.submit(m.buildPlan);
    const firstPlan = f.query('select[name="active-plan"]').value;
    f.fill('memo','二つ目の企画は社員インタビューです'); f.fill('manualType','employee'); await f.submit(m.manualSave);
    const manualCard = [...f.root.querySelectorAll('article')].find(item => item.querySelector('h3')?.textContent === '二つ目の企画は社員インタビューです')!;
    await f.submit(m.buildPlan,manualCard);
    assert.notEqual(f.query('select[name="active-plan"]').value,firstPlan);
    const firstCard = [...f.root.querySelectorAll('article')].find(item => item.querySelector('h3')?.textContent === '最初の企画はよくある質問の解説です')!;
    f.fill('candidate','other',true,firstCard); f.fill('ideaType','consultation',false,firstCard); await f.submit(m.buildPlan,firstCard);
    assert.equal(f.query('select[name="active-plan"]').value,firstPlan);
    assert.ok(f.query('main').textContent.includes('企画型: お悩み相談'));
  } finally { await f.close(); }
});

test('rendering never interprets stored markup as HTML and every field has an explicit label', {timeout:10000}, async () => {
  const f = await fixture();
  try {
    f.fill('clientAlias','<img src=x onerror="alert(1)">'); await f.submit(m.createProject);
    await f.go('home');
    assert.equal(f.root.querySelectorAll('img,script,iframe').length,0);
    assert.ok(f.query('main').textContent.includes('<img src=x onerror="alert(1)">'));
    for (const input of f.root.querySelectorAll('input, select, textarea')) {
      assert.ok(input.id); assert.ok(f.root.querySelector(`label[for="${input.id}"]`));
    }
    assert.ok(f.query('[role="alert"]'));
    assert.equal(f.query('[role="status"]').getAttribute('aria-live'),'polite');
  } finally { await f.close(); }
});

test('high-confidence choice is editable and copying sends the complete displayed artifact', {timeout:10000}, async () => {
  const f = await fixture({JEV_ENABLED:'true',WORKERS_PLAN:'free',AI:{async run() {
    return {model:'jev-1.13.0',answers:{idea_type:{type:'choice',choice:'faq',confidence:.8,probabilities:{faq:.9,howto:.1,case:0,day:0,interview:0,ranking:0,consultation:0,employee:0}},caution:{type:'noul',noul:0}}};
  }}},true);
  try {
    await f.go('ideas'); f.fill('memo','自動分類の初期選択は後から変更できます'); await f.submit(m.classify);
    assert.ok(f.query('main').textContent.includes(m.classificationAutomatic));
    assert.equal(f.query('select[name="ideaType"]').value,'faq');
    f.fill('ideaType','howto'); await f.submit(m.buildPlan);
    assert.ok(f.query('main').textContent.includes('企画型: ノウハウ解説'));
    let copied = '';
    Object.defineProperty(f.win.navigator.clipboard,'writeText',{configurable:true,value:async (text:string) => {copied=text;}});
    f.button(m.copy).click(); await eventually(() => copied.length > 0,'clipboard write');
    assert.equal(copied,f.query('textarea[name="artifact"]').value);
    assert.ok(copied.includes(m.titles)); assert.ok(copied.includes(m.generationNotice));
  } finally { await f.close(); }
});

test('failed save shows an accessible error, retains inputs and can be retried once connectivity returns', {timeout:10000}, async () => {
  const f = await fixture({},true);
  try {
    f.fill('target','通信に失敗しても残るターゲット像');
    f.setInterceptor(async (path,init) => {if (path.endsWith('/channel') && init.method === 'PUT') throw new Error('internal connection detail');});
    f.button(m.saveChannel).click();
    await eventually(() => !f.query('main').hasAttribute('aria-busy'),'failed save');
    assert.equal(f.query('[role="alert"]').textContent,m.networkError);
    assert.equal(f.query('[name="target"]').value,'通信に失敗しても残るターゲット像');
    assert.equal(f.button(m.saveChannel).disabled,false);
    assert.equal(f.win.document.activeElement,f.query('[role="alert"]'));
    f.setInterceptor(null); await f.submit(m.saveChannel);
    assert.equal(f.query('[role="alert"]').textContent,'');
    assert.equal((await f.api.request<any>(`/api/projects/${f.projectId}`)).channel.target,'通信に失敗しても残るターゲット像');
  } finally { await f.close(); }
});

test('older idea response never clears a newer draft from the draft cache after leaving and returning', {timeout:10000}, async () => {
  const f = await fixture({},true);
  let release = () => {};
  try {
    await f.go('ideas');
    f.fill('memo','先に保存を始めた企画メモ'); f.fill('manualType','faq');
    const gate = new Promise<void>(resolve => {release=resolve;});
    f.setInterceptor(async (path,init) => {if (path.endsWith('/ideas') && init.method === 'POST') await gate;});
    f.button(m.manualSave).click();
    await f.go('channel'); await f.go('ideas');
    const nextMemo = f.fill('memo','後から入力した別の企画メモを保持する'); nextMemo.focus();
    release(); await f.idle();
    assert.equal(f.query('[name="memo"]'),nextMemo);
    assert.equal(nextMemo.value,'後から入力した別の企画メモを保持する');
    await f.go('channel'); await f.go('ideas');
    assert.equal(f.query('[name="memo"]').value,'後から入力した別の企画メモを保持する');
    const project = await f.api.request<any>(`/api/projects/${f.projectId}`);
    assert.equal(project.ideas.length,1); assert.equal(project.ideas[0].memo,'先に保存を始めた企画メモ');
  } finally {release(); await f.close();}
});

test('manual type omission identifies the field accessibly and preserves memo for retry', async () => {
  const f = await fixture({},true);
  try {
    await f.go('ideas');
    f.fill('memo','架空企画の質問に答えます');
    f.button(m.manualSave).click();
    await eventually(() => !f.query('main').hasAttribute('aria-busy'));
    assert.match(f.query('[role="alert"]').textContent,/手動で型を選ぶ.*選択/);
    const type = f.query('[name="manualType"]');
    assert.equal(type.getAttribute('aria-invalid'),'true');
    assert.ok(f.win.document.getElementById(type.getAttribute('aria-describedby'))?.textContent.includes('選択'));
    assert.equal(f.query('[name="memo"]').value,'架空企画の質問に答えます');
    f.fill('manualType','faq',true); await f.submit(m.manualSave);
    assert.equal(f.query('[name="manualType"]').hasAttribute('aria-invalid'),false);
  } finally { await f.close(); }
});

test('script drafts survive routes and plan switches, revert cleanly and clear after save or regeneration', async () => {
  const f = await fixture({},true);
  try {
    await f.go('ideas'); f.fill('memo','架空企画の質問に答えます'); f.fill('manualType','faq'); await f.submit(m.manualSave); await f.submit(m.buildPlan);
    const firstPlan = f.query('[name="active-plan"]').value;
    await f.go('outline'); await f.submit(m.buildOutline);
    f.fill('points-1','未保存の架空要点'); f.fill('shoot-1','未保存の撮影メモ');
    await f.go('brief'); await f.go('outline');
    assert.equal(f.query('[name="points-1"]').value,'未保存の架空要点');
    assert.equal(f.query('[name="shoot-1"]').value,'未保存の撮影メモ');
    await f.go('ideas'); f.fill('memo','二番目の架空企画です'); f.fill('manualType','howto'); await f.submit(m.manualSave);
    const card = [...f.root.querySelectorAll('article')].find(item=>item.querySelector('h3')?.textContent==='二番目の架空企画です')!;
    await f.submit(m.buildPlan,card); await f.go('outline'); await f.submit(m.buildOutline);
    assert.equal(f.query('[name="points-1"]').value,'');
    f.fill('active-plan',firstPlan,true);
    assert.equal(f.query('[name="points-1"]').value,'未保存の架空要点');
    await f.submit(m.saveNotes);
    assert.equal((await f.api.request<any>(`/api/projects/${f.projectId}`)).outlines.find((x:any)=>x.planId===firstPlan).blocks[0].talkingPoints,'未保存の架空要点');
    f.fill('points-1','一時変更'); f.fill('points-1','未保存の架空要点');
    await f.go('brief'); await f.go('outline');
    assert.equal(f.query('[name="points-1"]').value,'未保存の架空要点');
    f.fill('points-1','再作成前の下書き'); await f.submit(m.regenerateOutline);
    assert.equal(f.query('[name="points-1"]').value,'');
  } finally { await f.close(); }
});

test('script drafts stay separate across projects and survive failed and delayed saves', async () => {
  const f = await fixture({},true);
  let release = () => {};
  try {
    await f.go('ideas'); f.fill('memo','架空案件の台本保持テスト'); f.fill('manualType','faq'); await f.submit(m.manualSave); await f.submit(m.buildPlan);
    await f.go('outline'); await f.submit(m.buildOutline);
    const firstProject = f.projectId;
    f.fill('points-1','保存失敗しても残す要点');
    f.setInterceptor(async (path, init) => { if (path.includes('/outlines/') && init.method === 'PUT') throw new Error('offline'); });
    f.button(m.saveNotes).click();
    await eventually(()=>!f.query('main').hasAttribute('aria-busy'));
    assert.equal(f.query('[data-script-draft]').textContent,m.notesDraft);
    await f.go('home'); f.setInterceptor(null);
    f.fill('clientAlias','架空B社'); await f.submit(m.createProject); await f.submit(m.saveChannel);
    const secondProject = parseRoute(f.win.location.hash).projectId;
    f.fill('active-project',firstProject,true);
    await f.go('outline');
    assert.equal(f.query('[name="points-1"]').value,'保存失敗しても残す要点');
    f.fill('active-project',secondProject,true);
    assert.equal(f.root.querySelector('[name="points-1"]'),null);
    f.fill('active-project',firstProject,true);
    const gate = new Promise<void>(resolve=>{release=resolve;});
    f.setInterceptor(async (path,init)=>{if(path.includes('/outlines/') && init.method==='PUT') await gate;});
    f.button(m.saveNotes).click();
    await f.go('brief'); await f.go('outline');
    f.fill('points-1','応答待ちの新しい要点');
    release(); await f.idle();
    await f.go('brief'); await f.go('outline');
    assert.equal(f.query('[name="points-1"]').value,'応答待ちの新しい要点');
    assert.equal(f.query('[data-script-draft]').textContent,m.notesDraft);
    f.fill('points-1','保存失敗しても残す要点');
    assert.equal(f.query('[data-script-draft]').textContent,'');
  } finally { release(); await f.close(); }
});

test('invalid manual memos cannot bypass validation and never invoke automatic classification', async () => {
  const f = await fixture({},true);
  try {
    await f.go('ideas'); f.fill('manualType','faq');
    for (const memo of ['', '一', '   ', 'あ'.repeat(501)]) {
      f.fill('memo',memo);
      const before = f.requests.length;
      const button = f.button(m.manualSave);
      button.closest('form').dispatchEvent(new f.win.SubmitEvent('submit',{bubbles:true,cancelable:true,submitter:button}));
      await eventually(()=>!f.query('main').hasAttribute('aria-busy'));
      assert.equal(f.query('[role="alert"]').textContent,m.invalidMemo);
      assert.equal(f.requests.length,before);
      assert.equal(f.query('[name="memo"]').value,memo);
    }
  } finally { await f.close(); }
});
