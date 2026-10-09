import assert from 'node:assert/strict';
import { test } from 'node:test';
import worker from '../src/backend/index.ts';
import { createTestDatabase } from './helpers/sqlite.ts';

function client(db: ReturnType<typeof createTestDatabase>, extra = {}) {
  let cookie = '';
  return async (path: string, method = 'GET', data?: unknown) => {
    const headers: Record<string,string> = { cookie, origin: 'https://demo.test' };
    if (data !== undefined) headers['content-type'] = 'application/json';
    const request = new Request(`https://demo.test${path}`, { method, headers, ...(data === undefined ? {} : { body: JSON.stringify(data) }) });
    const result = await worker.fetch(request, { DB: db, ...extra });
    if (result.headers.get('set-cookie')) cookie = result.headers.get('set-cookie')!.split(';')[0]!;
    const json = result.status === 204 ? null : await result.json() as any;
    return { result, json, cookie };
  };
}

test('API completes production workflow, persists notes and tasks, compares months and isolates sessions', async () => {
  const db = createTestDatabase();
  try {
    const call = client(db), other = client(db);
    let r = await call('/api/bootstrap'); assert.equal(r.result.status,200); assert.equal(r.json.projects.length,0); assert.match(r.cookie,/dw_session=/);
    r = await call('/api/projects','POST',{clientAlias:'A社',website:''}); assert.equal(r.result.status,201); const id=r.json.id, base=`/api/projects/${id}`;
    assert.equal(JSON.stringify(r.json).includes('sessionId'),false);
    r=await call(`${base}/channel`,'PUT',{industry:'career',goal:'leads',target:''}); assert.equal(r.result.status,200); assert.equal(r.json.channel.targetDefaulted,true);
    r=await call(`${base}/ideas`,'POST',{memo:'転職についてよくある疑問に答えます'}); assert.equal(r.result.status,200); assert.equal(r.json.ideas[0].classification.mode,'manual');
    const ideaId=r.json.ideas[0].id;
    r=await call(`${base}/plans`,'POST',{ideaId,ideaType:'faq'}); assert.equal(r.result.status,200); assert.equal(r.json.plans[0].titles.length,3); const planId=r.json.plans[0].id;
    r=await call(`${base}/outlines`,'POST',{planId,targetSeconds:480}); assert.equal(r.result.status,200); const outline=r.json.outlines[0]; assert.equal(outline.blocks.reduce((n:number,b:any)=>n+b.seconds,0),480);
    r=await call(`${base}/outlines/${outline.id}`,'PUT',{blocks:outline.blocks.map((b:any)=>({seq:b.seq,talkingPoints:'話す要点',shootMemo:'正面カット'}))}); assert.equal(r.result.status,200); assert.equal(r.json.outlines[0].blocks[0].talkingPoints,'話す要点');
    r=await call(`${base}/schedules`,'POST',{planId,publishDate:'2099-10-30'}); assert.equal(r.result.status,200); assert.equal(r.json.schedules[0].tasks.length,6); const task=r.json.schedules[0].tasks[0];
    r=await call(`${base}/tasks/${task.id}`,'PATCH',{status:'done'}); assert.equal(r.result.status,200); assert.equal(r.json.schedules[0].tasks[0].status,'done');
    r=await call(`${base}/edit-briefs`,'POST',{planId}); assert.equal(r.result.status,200); assert.equal(r.json.editBriefs[0].directions[0].talkingPoints,'話す要点'); assert.equal(r.json.editBriefs[0].dueDate,r.json.schedules[0].tasks.find((t:any)=>t.step==='draft').due);
    r=await call(`${base}/metrics`,'PUT',{month:'2026-09',views:100,subsDelta:2,retention:50,conversions:1}); assert.equal(r.result.status,200);
    r=await call(`${base}/metrics`,'PUT',{month:'2026-10',views:200,subsDelta:4,retention:60,conversions:1}); assert.equal(r.result.status,200);
    r=await call(`${base}/report?month=2026-10`); assert.equal(r.result.status,200); assert.equal(r.json.report.hasPrevious,true); assert.equal(r.json.report.metrics[0].changeRate,100);
    r=await other(base); assert.equal(r.result.status,404);
    r=await other(`${base}/channel`,'PUT',{industry:'career',goal:'leads',target:''}); assert.equal(r.result.status,404);
    r=await other('/api/bootstrap'); assert.equal(r.json.projects.length,0);
    r=await call('/api/bootstrap'); assert.equal(r.json.projects.length,1);
    await worker.scheduled({cron:'0 17 * * *'},{DB:db}); assert.equal((await call('/api/bootstrap')).json.projects.length,1);
    await worker.scheduled({cron:'0 18 * * *'},{DB:db}); assert.equal((await call('/api/bootstrap')).json.projects.length,0);
  } finally { db.close(); }
});

test('API rejects invalid enums, dates and metric ranges; honeypot writes nothing', async () => {
  const db=createTestDatabase();
  try {
    const call=client(db);
    const trapped=await call('/api/projects','POST',{clientAlias:'bot',website:'filled'}); assert.equal(trapped.result.status,204);
    assert.equal(db.sqlite.prepare('SELECT count(*) AS n FROM sessions').get()!.n,0);
    let r=await call('/api/projects','POST',{clientAlias:'A社'}); const base=`/api/projects/${r.json.id}`;
    r=await call(`${base}/channel`,'PUT',{industry:'invalid',goal:'leads'}); assert.equal(r.result.status,400);
    r=await call(`${base}/channel`,'PUT',{industry:'clinic',goal:'leads'}); assert.equal(r.result.status,200);
    r=await call(`${base}/ideas`,'POST',{memo:'一',ideaType:'faq'}); assert.equal(r.result.status,400);
    r=await call(`${base}/ideas`,'POST',{memo:'よくある質問',ideaType:'faq'}); const ideaId=r.json.ideas[0].id;
    r=await call(`${base}/plans`,'POST',{ideaId,ideaType:'faq'}); const planId=r.json.plans[0].id;
    for (const publishDate of ['2026-02-30','2026-13-01','garbage']) { r=await call(`${base}/schedules`,'POST',{planId,publishDate}); assert.equal(r.result.status,400,JSON.stringify(r.json)); }
    r=await call(`${base}/metrics`,'PUT',{month:'2026-13',views:1,subsDelta:1,retention:50,conversions:1}); assert.equal(r.result.status,400);
    r=await call(`${base}/metrics`,'PUT',{month:'2026-10',views:-1,subsDelta:1,retention:50,conversions:1}); assert.equal(r.result.status,400);
    r=await call(`${base}/metrics`,'PUT',{month:'2026-10',views:1,subsDelta:1,retention:101,conversions:1}); assert.equal(r.result.status,400);
  } finally { db.close(); }
});

test('API persists real adapter contracts for confidence, manual override and daily quota', async () => {
  const db=createTestDatabase(); let confidence=0.79, quota=false, calls=0;
  const AI={async run(_model:string,input:unknown){
    calls++;
    if(quota) throw Object.assign(new Error('Account limited'),{code:3036});
    const criteria=(input as any).questions.idea_type.criteria;
    return {model:'jev-1.13.0',answers:{idea_type:{type:'choice',choice:'faq',confidence,probabilities:Object.fromEntries(Object.keys(criteria).map(id=>[id,id==='faq'?0.9:id==='howto'?0.1:0]))},caution:{type:'noul',noul:0.5}}};
  }};
  try {
    const call=client(db,{AI,JEV_ENABLED:'true',WORKERS_PLAN:'free'});
    let r=await call('/api/projects','POST',{clientAlias:'B社'});const base=`/api/projects/${r.json.id}`;
    await call(`${base}/channel`,'PUT',{industry:'clinic',goal:'leads',target:''});
    r=await call(`${base}/ideas`,'POST',{memo:'よくある相談に回答します'});
    let idea=r.json.ideas.at(-1);assert.equal(idea.classification.mode,'selection');assert.equal(idea.confidence,0.79);assert.equal(idea.jevModel,'jev-1.13.0');assert.equal(idea.classification.candidates.length,2);assert.ok(idea.classification.cautions.length>0);
    r=await call(`${base}/plans`,'POST',{ideaId:idea.id,ideaType:'howto'});assert.equal(r.json.ideas.at(-1).ideaType,'howto');assert.equal(r.json.ideas.at(-1).classifiedBy,'manual');
    confidence=0.8;
    r=await call(`${base}/ideas`,'POST',{memo:'よくある質問の続編を解説します'});idea=r.json.ideas.at(-1);assert.equal(idea.classification.mode,'automatic');assert.equal(idea.ideaType,'faq');
    quota=true;
    r=await call(`${base}/ideas`,'POST',{memo:'質問を分類します'});idea=r.json.ideas.at(-1);assert.equal(idea.classification.mode,'manual');assert.equal(idea.classification.error.code,'quota_exceeded');assert.equal(idea.ideaType,null);assert.equal(calls,3);
  }finally{db.close();}
});
