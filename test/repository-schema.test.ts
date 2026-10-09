import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { test } from 'node:test';

const migrationUrl = new URL('../migrations/0001_initial.sql', import.meta.url);

function database(): DatabaseSync {
  const db = new DatabaseSync(':memory:');
  db.exec('PRAGMA foreign_keys = ON');
  db.exec(readFileSync(migrationUrl, 'utf8'));
  return db;
}

test('schema contains all eleven session-owned entities and clean foreign keys', () => {
  const db = database();
  const tables = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all();
  assert.deepEqual(tables.map(row => row.name), ['channel_designs', 'edit_briefs', 'ideas', 'monthly_metrics', 'plan_sheets', 'projects', 'schedules', 'script_blocks', 'script_outlines', 'sessions', 'tasks']);
  for (const { name } of tables) {
    const columns = db.prepare(`PRAGMA table_info(${name})`).all();
    assert.ok(columns.some(column => column.name === 'session_id'), `${name} needs an owner`);
  }
  assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(), []);
  db.close();
});

test('schema rejects cross-session references and invalid metrics', () => {
  const db = database();
  db.exec("INSERT INTO sessions VALUES ('a', '2026-10-09T00:00:00.000Z'), ('b', '2026-10-09T00:00:00.000Z')");
  db.exec("INSERT INTO projects (id, session_id, client_alias, created_at) VALUES ('pa', 'a', 'A社', '2026-10-09T00:00:00.000Z')");
  const metric = db.prepare('INSERT INTO monthly_metrics (id,session_id,project_id,month,views,subs_delta,retention,conversions) VALUES (?,?,?,?,?,?,?,?)');
  assert.throws(() => metric.run('m1', 'b', 'pa', '2026-10', 10, 1, 40, 2), /FOREIGN KEY/);
  assert.throws(() => metric.run('m2', 'a', 'pa', '2026-13', 10, 1, 40, 2), /CHECK/);
  assert.throws(() => metric.run('m3', 'a', 'pa', '2026-10', -1, 1, 40, 2), /CHECK/);
  assert.throws(() => metric.run('m4', 'a', 'pa', '2026-10', 10, 1, 101, 2), /CHECK/);
  assert.throws(() => metric.run('m5', 'a', 'pa', '2026-10', 1.2, 1, 40, 2), /CHECK/);
  metric.run('m6', 'a', 'pa', '2026-10', 10, 1, 40, 2);
  assert.throws(() => metric.run('m7', 'a', 'pa', '2026-10', 10, 1, 40, 2), /UNIQUE/);
  db.exec("DELETE FROM sessions WHERE session_id = 'a'");
  assert.equal(db.prepare('SELECT COUNT(*) AS count FROM projects').get()?.count, 0);
  assert.equal(db.prepare('SELECT COUNT(*) AS count FROM monthly_metrics').get()?.count, 0);
  db.close();
});

test('date constraints reject impossible and unparseable calendar values, including SQL NULL comparisons', () => {
  const db = database();
  db.exec("INSERT INTO sessions VALUES ('a','2026-10-09T00:00:00.000Z')");
  db.exec("INSERT INTO projects (id,session_id,client_alias,created_at) VALUES ('p','a','A社','2026-10-09T00:00:00.000Z')");
  db.exec("INSERT INTO ideas (id,session_id,project_id,memo,idea_type,classified_by) VALUES ('i','a','p','企画メモ','howto','manual')");
  db.exec(`INSERT INTO plan_sheets (id,session_id,idea_id,titles,thumb_texts,aim,non_recommended) VALUES ('plan','a','i','["A","B","C"]','["A","B"]','目的',0)`);
  const insertSchedule = db.prepare('INSERT INTO schedules (id,session_id,plan_id,publish_date,shoot_date,compressed) VALUES (?,?,?,?,?,?)');
  for (const date of ['2026-02-30', '2026-13-01', '2026-00-10', '2026-11-31', '2026-1-01', 'not-a-date']) {
    assert.throws(() => insertSchedule.run('s', 'a', 'plan', date, null, 0), /CHECK/, date);
    assert.throws(() => insertSchedule.run('s', 'a', 'plan', '2026-11-06', date, 0), /CHECK/, date);
  }
  insertSchedule.run('s', 'a', 'plan', '2026-11-06', '2026-10-30', 0);
  const insertTask = db.prepare('INSERT INTO tasks (id,session_id,schedule_id,step,due,status) VALUES (?,?,?,?,?,?)');
  for (const date of ['2026-02-30', '2026-13-01', '2026-00-10', '2026-11-31', '2026-1-01', 'not-a-date']) assert.throws(() => insertTask.run('t', 'a', 's', 'plan', date, 'todo'), /CHECK/, date);
  insertTask.run('t', 'a', 's', 'plan', '2026-10-26', 'todo');
  db.close();
});
