/**
 * A stand-in for lichess.org: the endpoints the account sync uses, answering
 * the way lila (the Lichess server) does — its source was the reference for
 * every rule below. Plain requests in, plain answers out, so the unit tests
 * (through a `fetch` stub) and the end-to-end tests (through Playwright
 * routes) share one server.
 *
 * What it keeps to, from lila:
 * - OAuth: the authorization code flow with PKCE (S256 only), codes used once.
 * - Puzzles: a batch of fewer than 100 results per request; each becomes a
 *   round in the activity, newest first, `since` inclusive.
 * - Imports: the same PGN text imports once (the same game comes back); the
 *   export of imported games gives each original text back.
 * - Studies: a new study starts with an empty "Chapter 1"; at most 64
 *   chapters; a PGN import adds chapters in order and stops at the first it
 *   cannot take, reporting the error beside the chapters made; deleting the
 *   last chapter leaves an empty one; a chapter's name comes from the `name`
 *   field (first chapter only), else its `ChapterName` tag, else the players,
 *   else the event; exports carry `ChapterName`, `ChapterURL` and the
 *   orientation, and write comments `{ like this }` on one long line.
 * - Study settings: creating a study takes all five "who may" settings; a
 *   study's own export needs its viewer to be allowed to share it (sharing
 *   set to nobody refuses everyone, its owner too, with a 403 page), while the
 *   export of all an account's studies does not ask.
 * - Names: a study's is cleaned like a public text and cut to 100 characters,
 *   a chapter's cleaned more gently and cut to 80 (`lichessNames.ts`).
 */
import { cutUnits, fullCleanUp, softCleanUp } from '../lib/lichess/lichessNames';

export const FAKE_ORIGIN = 'https://lichess.org';

export interface FakeRequest {
  method: string;
  url: string;
  /** Header names in lower case. */
  headers: Record<string, string>;
  body: string;
}

export interface FakeResponse {
  status: number;
  headers: Record<string, string>;
  body: string;
}

export interface FakeChapter {
  id: string;
  name: string;
  orientation: 'white' | 'black';
  /** The start position, when not the usual one. */
  fen: string | null;
  /** Moves, variations and comments as stored (one line, no result). */
  movetext: string;
}

/** Who may do something with a study (lila's `Settings.UserSelection`). */
export type FakeUserSelection = 'nobody' | 'owner' | 'contributor' | 'member' | 'everyone';
const USER_SELECTIONS: readonly string[] = ['nobody', 'owner', 'contributor', 'member', 'everyone'];

export interface FakeStudy {
  id: string;
  name: string;
  ownerId: string;
  visibility: 'public' | 'unlisted' | 'private';
  /** Who may share and export it (a study made on lichess.org starts with everyone). */
  shareable: FakeUserSelection;
  createdAt: number;
  updatedAt: number;
  chapters: FakeChapter[];
}

export interface FakeRound {
  date: number;
  id: string;
  win: boolean;
  rating: number;
  themes: string[];
}

export interface FakeImport {
  id: string;
  pgn: string;
  userId: string | null;
  at: number;
}

interface Failure {
  status: number;
  times: number;
  headers: Record<string, string>;
  body: string;
}

const ALL_SCOPES = ['puzzle:read', 'puzzle:write', 'study:read', 'study:write'];
const studyNameOf = (name: string) => cutUnits(fullCleanUp(name), 100);
const chapterNameOf = (name: string) => cutUnits(softCleanUp(name), 80);
const MAX_CHAPTERS = 64;
const MAX_CHAPTER_NODES = 3000;
const MAX_PGN = 100_000;

const CORS = { 'access-control-allow-origin': '*' };

/** An answer given early, from deep in a handler (thrown, and caught by `handle`). */
class Answer extends Error {
  constructor(readonly response: FakeResponse) {
    super(`HTTP ${response.status}`);
  }
}

const answer = (status: number, body = '', type = 'application/json'): FakeResponse => ({
  status,
  headers: { ...CORS, ...(body ? { 'content-type': type } : {}) },
  body,
});
const json = (value: unknown, status = 200) => answer(status, JSON.stringify(value));
const fail = (status: number, error: string): never => {
  throw new Answer(json({ error }, status));
};

function base64Url(bytes: ArrayBuffer): string {
  let text = '';
  for (const byte of new Uint8Array(bytes)) text += String.fromCharCode(byte);
  return btoa(text).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function s256(verifier: string): Promise<string> {
  return base64Url(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier)));
}

const TAG_LINE = /^\[(\w+)\s+"((?:[^"\\]|\\.)*)"\]\s*$/;

/** One PGN game: its tags and its movetext (one line, result removed, comments `{ spaced }`). */
export function readGame(text: string): { tags: Record<string, string>; movetext: string } {
  const tags: Record<string, string> = {};
  const moves: string[] = [];
  for (const line of text.split(/\r?\n/)) {
    const tag = TAG_LINE.exec(line.trim());
    if (tag && moves.length === 0) tags[tag[1] ?? ''] = (tag[2] ?? '').replace(/\\"/g, '"');
    else if (line.trim()) moves.push(line.trim());
  }
  const movetext = moves
    .join(' ')
    .replace(/\{\s*([^}]*?)\s*\}/g, (_, inner: string) => `{ ${inner.replace(/\s+/g, ' ')} }`)
    .replace(/\s+/g, ' ')
    .replace(/\s*(1-0|0-1|1\/2-1\/2|\*)\s*$/, '')
    .trim();
  return { tags, movetext };
}

/** Splits a multi-game PGN: a tag line after movetext starts the next game. */
export function splitGames(text: string): string[] {
  const games: string[] = [];
  let current: string[] = [];
  let inMoves = false;
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (trimmed.startsWith('[') && inMoves) {
      games.push(current.join('\n'));
      current = [];
      inMoves = false;
    }
    if (trimmed && !trimmed.startsWith('[')) inMoves = true;
    current.push(line);
  }
  if (current.some((l) => l.trim())) games.push(current.join('\n'));
  return games.filter((g) => g.trim());
}

const SAN = /^(?:O-O(?:-O)?|[KQRBN]?[a-h]?[1-8]?x?[a-h][1-8](?:=[QRBN])?)[+#]?[!?]*$/;

/** Moves in a movetext, variations included (what Lichess counts against its limit). */
function countMoves(movetext: string): number {
  return movetext
    .replace(/\{[^}]*\}/g, ' ')
    .replace(/[()]/g, ' ')
    .split(/\s+/)
    .map((token) => token.replace(/^\d+\.(\.\.)?/, ''))
    .filter((token) => SAN.test(token)).length;
}

function readForm(body: string): URLSearchParams {
  return new URLSearchParams(body);
}

export class FakeLichess {
  username = 'Learner';
  perfs: Record<string, { rating: number; rd: number; games: number; prov?: boolean }> = {
    puzzle: { rating: 1720, rd: 70, games: 812 },
    blitz: { rating: 1580, rd: 60, games: 300 },
    rapid: { rating: 1650, rd: 70, games: 120 },
    classical: { rating: 1700, rd: 110, games: 12, prov: true },
  };
  /** Lichess's clock (ms); every request moves it on by a second. */
  clock = Date.UTC(2026, 8, 1, 12);
  readonly tokens = new Map<string, string[]>();
  readonly studies: FakeStudy[] = [];
  readonly activity: FakeRound[] = [];
  /** `/api/puzzle/{id}` answers, by id. */
  readonly puzzles = new Map<string, unknown>();
  readonly imports: FakeImport[] = [];
  /** Every request, as "METHOD /path?query". */
  readonly requests: string[] = [];
  /** A test can refuse PGNs the way Lichess refuses ones it cannot read (returns the error). */
  refusePgn: ((pgn: string) => string | null) | null = null;
  private readonly codes = new Map<
    string,
    { challenge: string; redirectUri: string; clientId: string }
  >();
  private readonly failures: { match: RegExp; failure: Failure }[] = [];
  private seq = 0;

  get userId(): string {
    return this.username.toLowerCase();
  }

  private nextId(prefix: string, length = 8): string {
    this.seq++;
    return `${prefix}${String(this.seq).padStart(length - prefix.length, '0')}`;
  }

  private tick(): number {
    this.clock += 1000;
    return this.clock;
  }

  /** A token as if the learner had approved this app (all the sync's permissions by default). */
  issueToken(scopes: readonly string[] = ALL_SCOPES): string {
    const token = this.nextId('lip_', 24);
    this.tokens.set(token, [...scopes]);
    return token;
  }

  /** Makes the next `times` requests matching "METHOD /path" fail with `status`. */
  failNext(
    match: RegExp,
    status: number,
    options: { times?: number; headers?: Record<string, string>; body?: string } = {},
  ): void {
    this.failures.push({
      match,
      failure: {
        status,
        times: options.times ?? 1,
        headers: options.headers ?? {},
        body: options.body ?? JSON.stringify({ error: `HTTP ${status}` }),
      },
    });
  }

  /** Adds a study as if made on lichess.org (chapters as PGN texts). */
  addStudy(
    name: string,
    chapters: { name: string; pgn: string; orientation?: 'white' | 'black' }[] = [],
    visibility: FakeStudy['visibility'] = 'private',
    shareable: FakeUserSelection = 'everyone',
  ): FakeStudy {
    const at = this.tick();
    const study: FakeStudy = {
      id: this.nextId('st'),
      name: studyNameOf(name),
      ownerId: this.userId,
      visibility,
      shareable,
      createdAt: at,
      updatedAt: at,
      chapters: [],
    };
    for (const chapter of chapters) {
      const { tags, movetext } = readGame(chapter.pgn);
      study.chapters.push({
        id: this.nextId('ch'),
        name: chapterNameOf(chapter.name),
        orientation: chapter.orientation ?? 'white',
        fen: tags.FEN ?? null,
        movetext,
      });
    }
    if (study.chapters.length === 0) study.chapters.push(this.blankChapter());
    this.studies.push(study);
    return study;
  }

  /** Edits a chapter as the learner would on lichess.org (the study's `updatedAt` moves on). */
  editChapter(
    studyId: string,
    chapterId: string,
    change: { name?: string; pgn?: string; orientation?: 'white' | 'black' },
  ): void {
    const study = this.studies.find((s) => s.id === studyId);
    const chapter = study?.chapters.find((c) => c.id === chapterId);
    if (!study || !chapter) throw new Error(`No chapter ${studyId}/${chapterId}`);
    if (change.name !== undefined) chapter.name = chapterNameOf(change.name);
    if (change.orientation) chapter.orientation = change.orientation;
    if (change.pgn !== undefined) {
      const { tags, movetext } = readGame(change.pgn);
      chapter.movetext = movetext;
      chapter.fen = tags.FEN ?? null;
    }
    study.updatedAt = this.tick();
  }

  /** Deletes a chapter as the learner would on lichess.org. */
  deleteChapter(studyId: string, chapterId: string): void {
    const study = this.studies.find((s) => s.id === studyId);
    if (!study) throw new Error(`No study ${studyId}`);
    this.removeChapter(study, chapterId);
  }

  /** Records puzzle rounds as if played on lichess.org. */
  addRounds(rounds: Omit<FakeRound, 'date'>[], spacingMs = 60_000): void {
    for (const round of rounds) {
      this.clock += spacingMs;
      this.activity.unshift({ ...round, date: this.clock });
    }
  }

  async handle(req: FakeRequest): Promise<FakeResponse> {
    const url = new URL(req.url);
    this.requests.push(`${req.method} ${url.pathname}${url.search}`);
    if (req.method === 'OPTIONS') {
      return {
        status: 204,
        headers: {
          ...CORS,
          'access-control-allow-headers': 'Authorization, Content-Type, Accept',
          'access-control-allow-methods': 'GET, POST, DELETE, OPTIONS',
        },
        body: '',
      };
    }
    const signature = `${req.method} ${url.pathname}`;
    for (const entry of this.failures) {
      if (entry.failure.times > 0 && entry.match.test(signature)) {
        entry.failure.times--;
        return {
          status: entry.failure.status,
          headers: { ...CORS, 'content-type': 'application/json', ...entry.failure.headers },
          body: entry.failure.body,
        };
      }
    }
    try {
      return await this.route(req, url);
    } catch (err) {
      if (err instanceof Answer) return err.response;
      throw err;
    }
  }

  private route(req: FakeRequest, url: URL): Promise<FakeResponse> | FakeResponse {
    const { pathname: path } = url;
    const m = req.method;
    let match: RegExpExecArray | null;
    if (m === 'GET' && path === '/oauth') return this.authorize(url);
    if (m === 'POST' && path === '/api/token') return this.exchange(readForm(req.body));
    if (m === 'DELETE' && path === '/api/token') return this.revoke(req);
    if (m === 'POST' && path === '/api/token/test') return this.testTokens(req.body);
    if (m === 'GET' && path === '/api/account') return this.account(req);
    if (m === 'GET' && path === '/api/puzzle/activity') return this.puzzleActivity(req, url);
    if (m === 'POST' && /^\/api\/puzzle\/batch\/[\w-]+$/.test(path)) return this.solve(req);
    if (m === 'GET' && (match = /^\/api\/puzzle\/([A-Za-z0-9]{5})$/.exec(path))) {
      const puzzle = this.puzzles.get(match[1] ?? '');
      return puzzle ? json(puzzle) : fail(404, 'Not found');
    }
    if (m === 'POST' && path === '/api/import') return this.importGame(req);
    if (m === 'GET' && path === '/api/games/export/imports') return this.exportImports(req);
    if (m === 'GET' && (match = /^\/api\/study\/by\/([\w-]+)$/.exec(path))) {
      return this.listStudies(req, match[1] ?? '');
    }
    if (m === 'GET' && (match = /^\/api\/study\/by\/([\w-]+)\/export\.pgn$/.exec(path))) {
      return this.exportAccountStudies(req, match[1] ?? '', url);
    }
    if (m === 'POST' && path === '/api/study') return this.createStudy(req);
    if (m === 'GET' && (match = /^\/api\/study\/(\w{8})\.pgn$/.exec(path))) {
      return this.exportStudy(req, match[1] ?? '', url);
    }
    if (m === 'POST' && (match = /^\/api\/study\/(\w{8})\/import-pgn$/.exec(path))) {
      return this.importPgn(req, match[1] ?? '');
    }
    if (m === 'POST' && (match = /^\/api\/study\/(\w{8})\/(\w{8})\/moves$/.exec(path))) {
      return this.replaceMoves(req, match[1] ?? '', match[2] ?? '');
    }
    if (m === 'DELETE' && (match = /^\/api\/study\/(\w{8})\/(\w{8})$/.exec(path))) {
      return this.deleteChapterApi(req, match[1] ?? '', match[2] ?? '');
    }
    return fail(404, 'Not found');
  }

  /* ---------------------------------------------------------------- */
  /* OAuth                                                            */
  /* ---------------------------------------------------------------- */

  /** The approval page: two links, as the learner would choose on lichess.org. */
  private authorize(url: URL): FakeResponse {
    const p = url.searchParams;
    const redirectUri = p.get('redirect_uri') ?? '';
    const state = p.get('state') ?? '';
    if (
      p.get('response_type') !== 'code' ||
      p.get('code_challenge_method') !== 'S256' ||
      !p.get('code_challenge') ||
      !p.get('client_id') ||
      !/^https?:\/\//.test(redirectUri)
    ) {
      return answer(400, 'Invalid authorization request', 'text/plain');
    }
    const code = this.nextId('liu_', 20);
    this.codes.set(code, {
      challenge: p.get('code_challenge') ?? '',
      redirectUri,
      clientId: p.get('client_id') ?? '',
    });
    const back = (params: Record<string, string>) => {
      const target = new URL(redirectUri);
      for (const [key, value] of Object.entries(params)) target.searchParams.set(key, value);
      return target.href.replace(/&/g, '&amp;');
    };
    const scopes = (p.get('scope') ?? '').split(' ').filter(Boolean).join(', ');
    return answer(
      200,
      `<!doctype html><html><head><title>Authorize</title></head><body>
<h1>${p.get('client_id') ?? ''} wants to access your Lichess account</h1>
<p>Permissions: ${scopes}</p>
<a id="approve" href="${back({ code, state })}">Authorize</a>
<a id="deny" href="${back({ error: 'access_denied', error_description: 'user cancelled authorization', state })}">Cancel</a>
</body></html>`,
      'text/html',
    );
  }

  private async exchange(form: URLSearchParams): Promise<FakeResponse> {
    if (form.get('grant_type') !== 'authorization_code') {
      return json({ error: 'unsupported_grant_type' }, 400);
    }
    const code = form.get('code') ?? '';
    const pending = this.codes.get(code);
    this.codes.delete(code);
    if (!pending) return json({ error: 'invalid_grant', error_description: 'unknown code' }, 400);
    if (pending.redirectUri !== form.get('redirect_uri')) {
      return json({ error: 'invalid_grant', error_description: 'redirect_uri mismatch' }, 400);
    }
    if (pending.clientId !== form.get('client_id')) {
      return json({ error: 'invalid_grant', error_description: 'client_id mismatch' }, 400);
    }
    if ((await s256(form.get('code_verifier') ?? '')) !== pending.challenge) {
      return json({ error: 'invalid_grant', error_description: 'code_verifier mismatch' }, 400);
    }
    return json({
      token_type: 'Bearer',
      access_token: this.issueToken(),
      expires_in: 31_536_000,
    });
  }

  private user(req: FakeRequest, scope?: string): string {
    const auth = req.headers.authorization ?? '';
    const token = /^Bearer (.+)$/.exec(auth)?.[1];
    const scopes = token ? this.tokens.get(token) : undefined;
    if (!scopes) return fail(401, 'No such token');
    if (scope && !scopes.includes(scope)) return fail(403, `Missing scope: ${scope}`);
    return this.userId;
  }

  private testTokens(body: string): FakeResponse {
    const answer: Record<string, unknown> = {};
    for (const token of body
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean)
      .slice(0, 1000)) {
      const scopes = this.tokens.get(token);
      answer[token] = scopes
        ? { userId: this.userId, scopes: scopes.join(','), expires: null }
        : null;
    }
    return json(answer);
  }

  private revoke(req: FakeRequest): FakeResponse {
    const token = /^Bearer (.+)$/.exec(req.headers.authorization ?? '')?.[1];
    if (token) this.tokens.delete(token);
    return answer(204);
  }

  private account(req: FakeRequest): FakeResponse {
    this.user(req);
    return json({ id: this.userId, username: this.username, perfs: this.perfs });
  }

  /* ---------------------------------------------------------------- */
  /* Puzzles                                                          */
  /* ---------------------------------------------------------------- */

  private puzzleInfo(id: string): { rating: number; themes: string[] } {
    const known = this.puzzles.get(id) as
      { puzzle?: { rating?: number; themes?: string[] } } | undefined;
    return { rating: known?.puzzle?.rating ?? 1500, themes: known?.puzzle?.themes ?? [] };
  }

  private solve(req: FakeRequest): FakeResponse {
    this.user(req, 'puzzle:write');
    let body: { solutions?: { id?: unknown; win?: unknown; rated?: unknown }[] };
    try {
      body = JSON.parse(req.body) as typeof body;
    } catch {
      return fail(400, 'Invalid JSON');
    }
    const solutions = Array.isArray(body.solutions) ? body.solutions : [];
    if (solutions.length >= 100) return fail(400, 'Too many solutions');
    const rounds: { id: string; win: boolean; ratingDiff: number }[] = [];
    const perf = this.perfs.puzzle ?? { rating: 1500, rd: 350, games: 0 };
    for (const solution of solutions) {
      if (typeof solution.id !== 'string' || !/^[A-Za-z0-9]{5}$/.test(solution.id)) continue;
      const win = solution.win === true;
      const rated = solution.rated !== false;
      const diff = rated ? (win ? 8 : -8) : 0;
      perf.rating += diff;
      if (rated) perf.games++;
      const info = this.puzzleInfo(solution.id);
      this.activity.unshift({ date: this.tick(), id: solution.id, win, ...info });
      rounds.push({ id: solution.id, win, ratingDiff: diff });
    }
    this.perfs.puzzle = perf;
    return json({
      puzzles: [],
      glicko: { rating: perf.rating, deviation: perf.rd, provisional: perf.prov === true },
      rounds,
    });
  }

  private puzzleActivity(req: FakeRequest, url: URL): FakeResponse {
    this.user(req, 'puzzle:read');
    const max = Number(url.searchParams.get('max') ?? Infinity);
    const since = Number(url.searchParams.get('since') ?? 0);
    const before = Number(url.searchParams.get('before') ?? Infinity);
    const lines = this.activity
      .filter((r) => r.date >= since && r.date < before)
      .slice(0, max)
      .map((r) =>
        JSON.stringify({
          date: r.date,
          win: r.win,
          puzzle: {
            id: r.id,
            fen: '8/8/8/8/8/8/8/8 w - - 0 1',
            lastMove: 'e2e4',
            plays: 1000,
            rating: r.rating,
            solution: ['e7e5'],
            themes: r.themes,
          },
        }),
      );
    return answer(200, lines.map((l) => `${l}\n`).join(''), 'application/x-ndjson');
  }

  /* ---------------------------------------------------------------- */
  /* Imported games                                                   */
  /* ---------------------------------------------------------------- */

  private importGame(req: FakeRequest): FakeResponse {
    const pgn = readForm(req.body).get('pgn') ?? '';
    if (!pgn.trim()) return fail(400, 'Missing PGN');
    // The same text is imported once: the same game comes back.
    const existing = this.imports.find((g) => g.pgn === pgn);
    const token = /^Bearer (.+)$/.exec(req.headers.authorization ?? '')?.[1];
    const userId = token && this.tokens.has(token) ? this.userId : null;
    const game = existing ?? { id: this.nextId('gm'), pgn, userId, at: this.tick() };
    if (!existing) this.imports.push(game);
    return json({ id: game.id, url: `${FAKE_ORIGIN}/${game.id}` });
  }

  private exportImports(req: FakeRequest): FakeResponse {
    const userId = this.user(req);
    const texts = this.imports
      .filter((g) => g.userId === userId)
      .sort((a, b) => b.at - a.at)
      .map((g) => `${g.pgn}\n\n\n`);
    return answer(200, texts.join(''), 'application/x-chess-pgn');
  }

  /* ---------------------------------------------------------------- */
  /* Studies                                                          */
  /* ---------------------------------------------------------------- */

  private blankChapter(): FakeChapter {
    return {
      id: this.nextId('ch'),
      name: 'Chapter 1',
      orientation: 'white',
      fen: null,
      movetext: '',
    };
  }

  private ownStudy(req: FakeRequest, id: string, scope: string): FakeStudy {
    const userId = this.user(req, scope);
    const study = this.studies.find((s) => s.id === id);
    if (study?.ownerId !== userId) return fail(404, 'Study not found');
    return study;
  }

  private removeChapter(study: FakeStudy, chapterId: string): void {
    const index = study.chapters.findIndex((c) => c.id === chapterId);
    if (index < 0) return;
    // A study keeps at least one chapter: deleting the last leaves an empty one.
    if (study.chapters.length < 2) study.chapters.push(this.blankChapter());
    study.chapters.splice(index, 1);
    study.updatedAt = this.tick();
  }

  private listStudies(req: FakeRequest, username: string): FakeResponse {
    const viewer = this.studyViewer(req);
    const lines = this.studies
      .filter((s) => s.ownerId === username.toLowerCase())
      .filter((s) => s.visibility === 'public' || viewer === s.ownerId)
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .map((s) =>
        JSON.stringify({ id: s.id, name: s.name, createdAt: s.createdAt, updatedAt: s.updatedAt }),
      );
    return answer(200, lines.map((l) => `${l}\n`).join(''), 'application/x-ndjson');
  }

  private createStudy(req: FakeRequest): FakeResponse {
    const userId = this.user(req, 'study:write');
    const form = readForm(req.body);
    const given = form.get('name') ?? '';
    if (given.trim().length < 1 || given.length > 100) return fail(400, 'Invalid name');
    const name = studyNameOf(given) || `${this.username}'s Study`;
    const visibility = form.get('visibility');
    if (visibility !== 'public' && visibility !== 'unlisted' && visibility !== 'private') {
      return fail(400, 'Invalid visibility');
    }
    // Lila's form wants every one of these, each one of its user selections.
    for (const field of ['computer', 'explorer', 'cloneable', 'shareable', 'chat']) {
      if (!USER_SELECTIONS.includes(form.get(field) ?? '')) {
        return json({ [field]: ['error.required'] }, 400);
      }
    }
    const at = this.tick();
    const study: FakeStudy = {
      id: this.nextId('st'),
      name,
      ownerId: userId,
      visibility,
      shareable: form.get('shareable') as FakeUserSelection,
      createdAt: at,
      updatedAt: at,
      chapters: [this.blankChapter()],
    };
    this.studies.push(study);
    return json({ id: study.id });
  }

  /** Who is asking with study access: null without a token (as lila's `AnonOrScoped`). */
  private studyViewer(req: FakeRequest): string | null {
    return req.headers.authorization ? this.user(req, 'study:read') : null;
  }

  /** Lila's page for a study the viewer may not see or export. */
  private privateStudyPage(status: 401 | 403): FakeResponse {
    return answer(
      status,
      `<!doctype html><html lang="en"><head><title>Private study • lichess.org</title></head><body>
<main class="page-small box box-pad"><h1 class="box__top">Private study</h1>
<p>Sorry! This study is private, you cannot access it. Ask the study owner to invite you.</p>
</main></body></html>`,
      'text/html',
    );
  }

  /** A study's chapters as lila exports them. */
  private renderStudy(study: FakeStudy, url: URL): string {
    const orientation = url.searchParams.get('orientation') === 'true';
    const date = new Date(study.createdAt).toISOString().slice(0, 10).replace(/-/g, '.');
    const games = study.chapters.map((chapter) => {
      const tags: [string, string][] = [
        ['Event', `${study.name}: ${chapter.name}`],
        ['Date', date],
        ['Result', '*'],
        ['Variant', 'Standard'],
        ['ECO', '?'],
        ['Opening', '?'],
        ['StudyName', study.name],
        ['ChapterName', chapter.name],
        ['ChapterURL', `${FAKE_ORIGIN}/study/${study.id}/${chapter.id}`],
        ['Annotator', `${FAKE_ORIGIN}/@/${this.username}`],
      ];
      if (chapter.fen) tags.push(['FEN', chapter.fen], ['SetUp', '1']);
      tags.push(['UTCDate', date], ['UTCTime', '12:00:00']);
      if (orientation) tags.push(['Orientation', chapter.orientation]);
      const head = tags.map(([k, v]) => `[${k} "${v.replace(/"/g, '\\"')}"]`).join('\n');
      return `${head}\n\n${chapter.movetext ? `${chapter.movetext} ` : ' '}*`;
    });
    return games.map((g) => `${g}\n\n\n`).join('');
  }

  /**
   * One study's export (lila's `apiPgn`): a private study only for its members
   * (here, its owner), and then only if its sharing setting allows the viewer —
   * "nobody" allows no one, the owner included.
   */
  private exportStudy(req: FakeRequest, id: string, url: URL): FakeResponse {
    const viewer = this.studyViewer(req);
    const study = this.studies.find((s) => s.id === id);
    if (!study) return fail(404, 'Study not found');
    const member = viewer !== null && viewer === study.ownerId;
    if (study.visibility === 'private' && !member) {
      return this.privateStudyPage(viewer === null ? 401 : 403);
    }
    const allowed = study.shareable === 'everyone' || (study.shareable !== 'nobody' && member);
    if (!allowed) return this.privateStudyPage(403);
    return answer(200, this.renderStudy(study, url), 'application/x-chess-pgn');
  }

  /**
   * Every study of an account (lila's `apiExportPgn`), the most recently
   * updated first: its private ones for the account itself. It does not look
   * at the sharing settings.
   */
  private exportAccountStudies(req: FakeRequest, username: string, url: URL): FakeResponse {
    const viewer = this.studyViewer(req);
    const ownerId = username.toLowerCase();
    const text = this.studies
      .filter((s) => s.ownerId === ownerId && (s.visibility === 'public' || viewer === ownerId))
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .map((s) => this.renderStudy(s, url))
      .join('');
    return answer(200, text, 'application/x-chess-pgn');
  }

  /** A chapter from one game of an import, or the reason Lichess would not take it. */
  private chapterFrom(
    text: string,
    givenName: string | null,
    orientation: 'white' | 'black',
  ): FakeChapter | string {
    if (text.length > MAX_PGN) return 'PGN too large';
    const refusal = this.refusePgn?.(text);
    if (refusal) return refusal;
    const { tags, movetext } = readGame(text);
    if (countMoves(movetext) > MAX_CHAPTER_NODES) return 'PGN has too many moves/nodes';
    const players =
      tags.White && tags.Black ? `${tags.White} - ${tags.Black}` : (tags.White ?? tags.Black);
    const name = chapterNameOf(givenName ?? tags.ChapterName ?? players ?? tags.Event ?? '');
    return {
      id: this.nextId('ch'),
      name: name || 'Chapter',
      orientation,
      fen: tags.FEN ?? null,
      movetext,
    };
  }

  private importPgn(req: FakeRequest, id: string): FakeResponse {
    const study = this.ownStudy(req, id, 'study:write');
    const form = readForm(req.body);
    const pgn = form.get('pgn') ?? '';
    if (!pgn.trim()) return fail(400, 'Missing PGN');
    const given = form.get('name')?.trim() ?? '';
    const name = given === '' ? null : given;
    const orientation = form.get('orientation') === 'black' ? 'black' : 'white';
    const made: FakeChapter[] = [];
    let error: string | null = null;
    const games = splitGames(pgn).slice(0, MAX_CHAPTERS);
    for (const [index, game] of games.entries()) {
      if (study.chapters.length >= MAX_CHAPTERS) {
        error = 'Too many chapters';
        break;
      }
      const chapter = this.chapterFrom(game, index === 0 ? name : null, orientation);
      if (typeof chapter === 'string') {
        error = chapter;
        break;
      }
      study.chapters.push(chapter);
      made.push(chapter);
    }
    if (made.length > 0) study.updatedAt = this.tick();
    return json({
      chapters: made.map((c) => ({
        id: c.id,
        name: c.name,
        players: [{ name: null }, { name: null }],
        status: '*',
      })),
      error,
    });
  }

  private replaceMoves(req: FakeRequest, id: string, chapterId: string): FakeResponse {
    const userId = this.user(req, 'study:write');
    const study = this.studies.find((s) => s.id === id && s.ownerId === userId);
    const chapter = study?.chapters.find((c) => c.id === chapterId);
    if (!study || !chapter) return fail(400, `Invalid or forbidden chapter ${id}/${chapterId}`);
    const pgn = readForm(req.body).get('pgn') ?? '';
    if (!pgn.trim()) return fail(400, 'Missing PGN');
    const refusal = this.refusePgn?.(pgn);
    if (refusal) return fail(400, refusal);
    const { tags, movetext } = readGame(pgn);
    chapter.movetext = movetext;
    chapter.fen = tags.FEN ?? null;
    // Lila does not mark the study updated for this one.
    return answer(204);
  }

  private deleteChapterApi(req: FakeRequest, id: string, chapterId: string): FakeResponse {
    const study = this.ownStudy(req, id, 'study:write');
    this.removeChapter(study, chapterId);
    return answer(204);
  }
}
