/**
 * JSON with every object's keys in sorted order, so two values that hold the
 * same data compare equal however their keys were inserted. Device sync uses
 * it to tell "changed" from "the same", which keeps it from writing a vault, or
 * a store, that would come out the same.
 */
export function canonical(value: unknown): string {
  return JSON.stringify(value, (_key, v: unknown) => {
    if (v === null || typeof v !== 'object' || Array.isArray(v)) return v;
    const sorted: Record<string, unknown> = {};
    for (const key of Object.keys(v).sort()) {
      const entry = (v as Record<string, unknown>)[key];
      if (entry !== undefined) sorted[key] = entry;
    }
    return sorted;
  });
}

/** Whether two values hold the same data. */
export function same(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  return canonical(a) === canonical(b);
}
