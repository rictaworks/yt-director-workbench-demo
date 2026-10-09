import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createRuntime } from '../scripts/local-runtime.mjs';

test('real workerd and local D1 complete a saved project workflow', { timeout: 30000 }, async () => {
  const runtime = await createRuntime({port:0,persist:false});
  let cookie = '';
  async function call(path, method='GET', data) {
    const result=await runtime.dispatchFetch(`http://localhost${path}`, { method, headers:{cookie,...(data?{'content-type':'application/json'}:{})}, ...(data ? {body:JSON.stringify(data)}:{}) });
    if (result.headers.get('set-cookie')) cookie=result.headers.get('set-cookie').split(';')[0];
    const json=await result.json(); assert.ok(result.ok,JSON.stringify(json)); return json;
  }
  try {
    const bootstrap=await call('/api/bootstrap'); assert.equal(bootstrap.projects.length,0);
    let project=await call('/api/projects','POST',{clientAlias:'実行環境テスト'});
    const base=`/api/projects/${project.id}`;
    project=await call(`${base}/channel`,'PUT',{industry:'btob',goal:'leads',target:''});
    project=await call(`${base}/ideas`,'POST',{memo:'よくある導入の質問を解説します',ideaType:'faq'});
    project=await call(`${base}/plans`,'POST',{ideaId:project.ideas[0].id,ideaType:'faq'});
    const planId=project.plans[0].id;
    project=await call(`${base}/outlines`,'POST',{planId,targetSeconds:480});
    project=await call(`${base}/schedules`,'POST',{planId,publishDate:'2099-10-30'});
    project=await call(`${base}/edit-briefs`,'POST',{planId});
    assert.equal(project.editBriefs.length,1); assert.equal(project.schedules[0].tasks.length,6);
    const db=await runtime.getD1Database('DB');
    assert.equal((await db.prepare('SELECT count(*) AS n FROM projects').first()).n,1);
    assert.equal((await db.prepare('PRAGMA foreign_key_check').all()).results.length,0);
    const outsider=await runtime.dispatchFetch(`http://localhost${base}`); assert.equal(outsider.status,404);
  } finally { await runtime.dispose(); }
});
