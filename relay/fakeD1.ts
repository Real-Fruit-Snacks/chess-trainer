/**
 * A stand-in for a D1 binding over node:sqlite, answering as D1 does (BLOBs as
 * number arrays, `run()` with `meta.changes`, `all()` with `results`, both with
 * `meta.size_after`, the database's size in bytes). Not a test file itself: the
 * relay's tests share it.
 *
 * `sizeAfter` stands in for the size D1 reports (a test fakes a full database
 * with it, or leaves it out as an older runtime might); by default it is the
 * size of the database the stand-in keeps.
 */
import { DatabaseSync } from 'node:sqlite';

export function fakeD1(options: { sizeAfter?: () => unknown } = {}) {
  const db = new DatabaseSync(':memory:');
  const size = () => {
    if (options.sizeAfter) return options.sizeAfter();
    const pages = db.prepare('PRAGMA page_count').get();
    const page = db.prepare('PRAGMA page_size').get();
    return Number(pages?.page_count) * Number(page?.page_size);
  };
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
          return Promise.resolve({
            success: true,
            meta: { changes: Number(result.changes), size_after: size() },
          });
        },
        all() {
          const results = db.prepare(sql).all(...(params as never[]));
          return Promise.resolve({ success: true, results, meta: { size_after: size() } });
        },
      };
      return statement;
    },
  };
}
