/**
 * A stand-in for a D1 binding over node:sqlite, answering as D1 does (BLOBs as
 * number arrays, `run()` with `meta.changes`, `all()` with `results`). Not a
 * test file itself: the relay's tests share it.
 */
import { DatabaseSync } from 'node:sqlite';

export function fakeD1() {
  const db = new DatabaseSync(':memory:');
  return {
    prepare(sql: string) {
      let params: unknown[] = [];
      const statement = {
        bind(...values: unknown[]) {
          params = values;
          return statement;
        },
        first() {
          const row = db.prepare(sql).get(...(params as never[]));
          return Promise.resolve(row ?? null);
        },
        run() {
          const result = db.prepare(sql).run(...(params as never[]));
          return Promise.resolve({ success: true, meta: { changes: Number(result.changes) } });
        },
        all() {
          const results = db.prepare(sql).all(...(params as never[]));
          return Promise.resolve({ success: true, results, meta: {} });
        },
      };
      return statement;
    },
  };
}
