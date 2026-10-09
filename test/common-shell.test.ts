import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Window } from 'happy-dom';
import { Workbench } from '../src/frontend/app.ts';
import { ApiClient } from '../src/frontend/api.ts';
import { parseRoute } from '../src/frontend/view-model.ts';

test('legal route ignores project identifiers', () => {
  assert.deepEqual(parseRoute('#legal/fictional-project'), {screen:'legal',projectId:''});
});

test('common links and legal information remain available when API bootstrap fails', async () => {
  const win = new Window({url:'https://demo.test/#legal'});
  const root = win.document.createElement('div'); win.document.body.append(root);
  const app = new Workbench(root as unknown as HTMLElement, {
    api:new ApiClient(async () => new Response('{}',{status:503})),
    document:win.document as unknown as Document, window:win as unknown as globalThis.Window,
  });
  try {
    await app.start();
    assert.match(root.querySelector('.demo-banner')?.textContent ?? '', /JST 03:00/);
    for (const [label,url] of [['← デモ一覧へ','https://rictaworks.jp/#demos'],['ご相談はこちら','https://rictaworks.jp/']]) {
      const a = [...root.querySelectorAll('a')].find(a => a.textContent===label);
      assert.equal(a?.href,url); assert.equal(a?.target,'_blank'); assert.ok(a?.rel.includes('noopener'));
    }
    assert.match(root.querySelector('main')?.textContent ?? '', /利用規約/);
    assert.match(root.querySelector('main')?.textContent ?? '', /info@rictaworks.jp/);
    assert.match(root.querySelector('main')?.textContent ?? '', /Google Analytics/);
    assert.match(root.querySelector('footer')?.textContent ?? '', /© 2026 Ricta Works/);
    win.location.hash='#home'; win.dispatchEvent(new win.HashChangeEvent('hashchange'));
    assert.ok(root.querySelector('main button'), 'bootstrap retry available on home');
    win.location.hash='#legal'; win.dispatchEvent(new win.HashChangeEvent('hashchange'));
    assert.match(root.querySelector('main')?.textContent ?? '', /免責事項/);
  } finally { app.destroy(); await win.happyDOM.close(); }
});

test('pending bootstrap cannot be retried across legal navigation', async () => {
  const win = new Window({url:'https://demo.test/'});
  const root = win.document.createElement('div'); win.document.body.append(root);
  let complete!: (response: Response) => void; let calls=0;
  const api=new ApiClient(async () => { calls++; return new Promise(resolve=>{ complete=resolve; }); });
  const app=new Workbench(root as unknown as HTMLElement,{api,document:win.document as unknown as Document,window:win as unknown as globalThis.Window});
  try {
    const started=app.start();
    assert.equal(root.querySelector('main button'),null);
    win.location.hash='#legal'; win.dispatchEvent(new win.HashChangeEvent('hashchange'));
    assert.match(root.querySelector('main')?.textContent ?? '',/利用規約/);
    win.location.hash='#home'; win.dispatchEvent(new win.HashChangeEvent('hashchange'));
    assert.equal(root.querySelector('main button'),null);
    assert.equal(calls,1);
    complete(new Response(JSON.stringify({projects:[],catalog:{industries:[],goals:[],ideaTypes:[]},today:'2026-10-09'})));
    await started;
    assert.ok(root.querySelector('input[name="clientAlias"]'));
    assert.equal(calls,1);
  } finally { app.destroy(); await win.happyDOM.close(); }
});
