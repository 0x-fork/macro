import { Database } from 'bun:sqlite';

export type SqlParam = string | number | null;

/**
 * Minimal SQL surface the sync store runs on. Implemented here by
 * `bun:sqlite`; a Cloudflare D1 binding satisfies the same two methods
 * (`prepare(sql).bind(...params).run()/all()`), so the store ports to a
 * Worker unchanged.
 */
export interface SqlExecutor {
  run(sql: string, params?: SqlParam[]): Promise<void>;
  all<T>(sql: string, params?: SqlParam[]): Promise<T[]>;
}

export function bunSqlite(path: string): SqlExecutor {
  const db = new Database(path, { create: true });
  return {
    async run(sql, params = []) {
      db.query(sql).run(...params);
    },
    async all<T>(sql: string, params: SqlParam[] = []) {
      return db.query(sql).all(...params) as T[];
    },
  };
}
