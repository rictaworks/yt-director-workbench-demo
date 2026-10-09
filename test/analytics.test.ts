import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Window } from 'happy-dom';
import { Analytics, analyticsPolicy } from '../src/frontend/analytics.ts';

function setup(url: string, verified?: boolean) {
  const win = new Window({url});
  const analytics = new Analytics(win as unknown as globalThis.Window, win.document as unknown as Document, verified);
  return {win,analytics};
}

test('production analytics fails closed pending shared stream verification, regardless of consent', async () => {
  const {win,analytics} = setup(`${analyticsPolicy.origin}/?q=fictional-text#outline/fictional-project`);
  try {
    analytics.allow(); analytics.deny(); analytics.allow();
    assert.equal(analytics.available,false);
    assert.equal(win.document.querySelector('script'),null);
    assert.equal((win as any).dataLayer,undefined);
  } finally { await win.happyDOM.close(); }
});

test('even verified analytics excludes development and preview origins', async () => {
  for (const url of ['http://localhost:5173','https://preview.pages.dev','http://yt-director-workbench-demo.rictaworks.jp']) {
    const {win,analytics} = setup(url,true);
    try { analytics.allow(); assert.equal(win.document.querySelector('script'),null); }
    finally { await win.happyDOM.close(); }
  }
});

test('verified adapter requires consent, queues only fixed page context and revokes without reloading', async () => {
  const {win,analytics} = setup(`${analyticsPolicy.origin}/?q=fictional-text#outline/fictional-project`,true);
  win.document.body.textContent='fictional-private-input';
  try {
    assert.equal(win.document.querySelector('script'),null);
    analytics.allow(); analytics.allow();
    const scripts = win.document.querySelectorAll('script');
    assert.equal(scripts.length,1);
    assert.equal(scripts[0]!.referrerPolicy,'no-referrer');
    assert.equal(scripts[0]!.src,`https://www.googletagmanager.com/gtag/js?id=${analyticsPolicy.measurementId}`);
    assert.equal(Object.prototype.toString.call((win as any).dataLayer[0]),'[object Arguments]');
    const queue = (win as any).dataLayer.map((entry: ArrayLike<unknown>) => Array.from(entry));
    assert.doesNotMatch(JSON.stringify(queue),/fictional/);
    assert.equal(queue.filter((entry:any[])=>entry[0]==='event').length,1);
    assert.deepEqual(queue[0],['consent','default',{analytics_storage:'denied',ad_storage:'denied',ad_user_data:'denied',ad_personalization:'denied'}]);
    const config = queue.find((entry:any[])=>entry[0]==='config')[2];
    assert.equal(config.page_referrer,''); assert.equal(config.send_page_view,false);
    assert.equal(config.allow_google_signals,false);
    win.document.cookie='_ga=fictional-ga-cookie; Path=/';
    win.document.cookie='app_test=fictional-app-cookie; Path=/';
    analytics.deny();
    assert.equal(analytics.consented,false); assert.equal((win as any)['ga-disable-G-C04W1XKS16'],true);
    assert.doesNotMatch(win.document.cookie,/_ga=/); assert.match(win.document.cookie,/app_test=/);
    assert.match(win.location.hash,/fictional-project/);
    analytics.allow(); assert.equal(win.document.querySelectorAll('script').length,1);
  } finally { await win.happyDOM.close(); }
});
