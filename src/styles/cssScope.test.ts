import { describe, expect, it } from 'vitest';

/**
 * Every page is code-split, and so is its stylesheet: a class defined in
 * puzzles.css exists only once the Puzzles chunk has loaded. A page that uses
 * such a class without importing the stylesheet renders unstyled until the
 * visitor happens to open the other page first — which is how the placement
 * quiz's options once came out as a run of inline checkboxes. This test
 * follows each chunk's static imports and checks that every class name a
 * component uses is defined in a stylesheet loaded with it: its own, one of
 * a module it imports, or one loaded by the app shell.
 */
const sources = import.meta.glob<string>('/src/**/*.{ts,tsx,css}', {
  query: '?raw',
  import: 'default',
  eager: true,
});
const files = Object.keys(sources);
const modules = files.filter((f) => /\.tsx?$/.test(f) && !/\.test\.tsx?$/.test(f));
const stylesheets = files.filter((f) => f.endsWith('.css'));

/** The class names each stylesheet defines, and where each name is defined. */
const definedAnywhere = new Map<string, string[]>();
for (const css of stylesheets) {
  const source = sources[css]!.replace(/\/\*[\s\S]*?\*\//g, '');
  for (const match of source.match(/\.[a-zA-Z_][\w-]*/g) ?? []) {
    const name = match.slice(1);
    const owners = definedAnywhere.get(name) ?? [];
    if (!owners.includes(css)) definedAnywhere.set(name, [...owners, css]);
  }
}

function normalize(path: string): string {
  const out: string[] = [];
  for (const part of path.split('/')) {
    if (part === '' || part === '.') continue;
    if (part === '..') out.pop();
    else out.push(part);
  }
  return `/${out.join('/')}`;
}

/** Resolves an import specifier to a file in src, or null for packages. */
function resolveImport(from: string, specifier: string): string | null {
  let base: string;
  if (specifier.startsWith('@/')) base = `/src/${specifier.slice(2)}`;
  else if (specifier.startsWith('.')) base = normalize(`${from}/../${specifier}`);
  else return null;
  const candidates = [base, `${base}.ts`, `${base}.tsx`, `${base}/index.ts`, `${base}/index.tsx`];
  return candidates.find((c) => c in sources) ?? null;
}

/** Static imports only: a lazy `import()` loads its own chunk, and its own CSS, later. */
function staticImports(module: string): string[] {
  const source = sources[module]!;
  const specifiers = [
    ...source.matchAll(/^\s*import\s+(?:[^'"]*?\s+from\s+)?['"]([^'"]+)['"]/gm),
    ...source.matchAll(/^\s*export\s+[^'"]*?\s+from\s+['"]([^'"]+)['"]/gm),
  ].map((m) => m[1]!);
  return specifiers.map((s) => resolveImport(module, s)).filter((f): f is string => f !== null);
}

/** The modules loaded on demand — the code-split pages — each the root of its own chunk. */
function dynamicImports(module: string): string[] {
  return [...sources[module]!.matchAll(/import\(\s*['"]([^'"]+)['"]\s*\)/g)]
    .map((m) => resolveImport(module, m[1]!))
    .filter((f): f is string => f !== null);
}

/** Everything a root loads with it: the modules and stylesheets in its static-import closure. */
function closureOf(root: string): { modules: Set<string>; stylesheets: Set<string> } {
  const chunkModules = new Set<string>();
  const css = new Set<string>();
  const stack = [root];
  while (stack.length) {
    const current = stack.pop()!;
    if (chunkModules.has(current) || css.has(current)) continue;
    if (current.endsWith('.css')) {
      css.add(current);
      continue;
    }
    chunkModules.add(current);
    stack.push(...staticImports(current));
  }
  return { modules: chunkModules, stylesheets: css };
}

/** Class names a component uses: every string fragment inside a className attribute. */
function classNamesUsed(module: string): Set<string> {
  const names = new Set<string>();
  const attributes = sources[module]!.matchAll(
    /className=("([^"]*)"|\{((?:[^{}]|\{[^{}]*\})*)\})/g,
  );
  for (const match of attributes) {
    const literal = match[2];
    const expression = match[3];
    const fragments = literal
      ? [literal]
      : [...(expression ?? '').matchAll(/(["'`])((?:(?!\1).)*)\1/g)].map((m) => m[2]!);
    for (const fragment of fragments) {
      for (const token of fragment.split(/\$\{[^}]*\}|\s+/)) {
        if (/^[a-zA-Z_][\w-]*$/.test(token)) names.add(token);
      }
    }
  }
  return names;
}

describe('stylesheet scope', () => {
  const main = '/src/main.tsx';
  const shell = closureOf(main);
  // Every lazily loaded module is a root: it arrives with its own stylesheets
  // and whatever the shell already loaded, and nothing else.
  const roots = new Set<string>([main]);
  for (const module of modules) for (const target of dynamicImports(module)) roots.add(target);

  it('the app shell loads the global stylesheets, and the pages are code-split', () => {
    expect([...shell.stylesheets]).toContain('/src/styles/global.css');
    expect([...shell.stylesheets]).toContain('/src/components/ui/ui.css');
    expect(roots.size).toBeGreaterThan(20);
    expect([...roots]).toContain('/src/features/placement/PlacementPage.tsx');
    expect(definedAnywhere.get('choice')).toEqual(['/src/components/ui/ui.css']);
  });

  it('every component only uses classes from stylesheets loaded with it', () => {
    const problems = new Set<string>();
    for (const root of roots) {
      const chunk = closureOf(root);
      const loaded = new Set([...shell.stylesheets, ...chunk.stylesheets]);
      for (const module of chunk.modules) {
        if (!module.endsWith('.tsx')) continue;
        for (const name of classNamesUsed(module)) {
          const owners = definedAnywhere.get(name);
          if (!owners) continue; // not a styled hook: a chessground class, a test id, plain text
          if (owners.some((css) => loaded.has(css))) continue;
          problems.add(
            `${root} renders ${module}, which uses .${name} from ${owners.join(', ')} without loading it`,
          );
        }
      }
    }
    expect([...problems]).toEqual([]);
  });
});
