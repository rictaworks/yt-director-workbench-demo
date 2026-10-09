import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import type { SQLInputValue } from 'node:sqlite';
import type { RepositoryDatabase, RepositoryStatement } from '../../src/backend/repository.ts';

export interface CapturedQuery { sql: string; values: unknown[] }

class SQLiteStatement implements RepositoryStatement {
  private readonly owner: SQLiteTestDatabase;
  readonly sql: string;
  readonly values: unknown[];
  constructor(owner: SQLiteTestDatabase, sql: string, values: unknown[] = []) {
    this.owner = owner;
    this.sql = sql;
    this.values = values;
  }
  bind(...values: unknown[]): SQLiteStatement { return new SQLiteStatement(this.owner, this.sql, values); }
  async first<T = Record<string, unknown>>(): Promise<T | null> {
    this.owner.queries.push({ sql: this.sql, values: this.values });
    return (this.owner.sqlite.prepare(this.sql).get(...this.values as SQLInputValue[]) ?? null) as T | null;
  }
  async all<T = Record<string, unknown>>(): Promise<{ results: T[] }> {
    this.owner.queries.push({ sql: this.sql, values: this.values });
    return { results: this.owner.sqlite.prepare(this.sql).all(...this.values as SQLInputValue[]) as T[] };
  }
  async run(): Promise<unknown> {
    this.owner.queries.push({ sql: this.sql, values: this.values });
    const result = this.owner.sqlite.prepare(this.sql).run(...this.values as SQLInputValue[]);
    return { success: true, meta: { changes: Number(result.changes) } };
  }
}

/** Local D1-shaped adapter backed by genuine SQLite, including batch rollback. */
export class SQLiteTestDatabase implements RepositoryDatabase {
  readonly sqlite: DatabaseSync;
  readonly queries: CapturedQuery[] = [];
  constructor() {
    this.sqlite = new DatabaseSync(':memory:');
    this.sqlite.exec('PRAGMA foreign_keys = ON');
    this.sqlite.exec(readFileSync(new URL('../../migrations/0001_initial.sql', import.meta.url), 'utf8'));
    this.sqlite.exec(readFileSync(new URL('../../migrations/0002_signed_subscriber_delta.sql', import.meta.url), 'utf8'));
  }
  prepare(sql: string): SQLiteStatement { return new SQLiteStatement(this, sql); }
  async batch(statements: RepositoryStatement[]): Promise<unknown[]> {
    this.sqlite.exec('BEGIN');
    try {
      const results = [];
      for (const statement of statements) results.push(await statement.run());
      this.sqlite.exec('COMMIT');
      return results;
    } catch (error) {
      this.sqlite.exec('ROLLBACK');
      throw error;
    }
  }
  close(): void { this.sqlite.close(); }
}

export function createTestDatabase(): SQLiteTestDatabase { return new SQLiteTestDatabase(); }
