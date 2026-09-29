#!/usr/bin/env node
/**
 * Builds the bundled puzzle set from the Lichess puzzle database.
 *
 * Lichess publishes ~5 million engine-verified tactical puzzles under the CC0
 * licence (https://database.lichess.org/#puzzles). This script streams the
 * compressed CSV, filters for well-established puzzles, and uses reservoir
 * sampling to pick a fixed number per rating bucket so that every level from
 * absolute beginner to master gets appropriate material. The output is a set
 * of small JSON chunks the app loads on demand.
 *
 * Usage:
 *   node scripts/import-lichess-puzzles.mjs [options]
 *
 * Options:
 *   --source <path|url>   CSV (.zst or plain) — default: the Lichess download URL
 *   --per-bucket <n>      puzzles to keep per rating bucket           (default 500)
 *   --min-plays <n>       minimum number of plays on Lichess          (default 500)
 *   --min-popularity <n>  minimum popularity score, -100..100         (default 70)
 *   --max-rd <n>          maximum rating deviation                    (default 90)
 *   --seed <n>            PRNG seed for reproducible sampling         (default 2024)
 *   --out <dir>           output directory                            (default public/puzzles)
 *   --limit <n>           stop after reading n rows (for quick tests)
 *
 * The whole database is ~300 MB compressed; streaming it takes a few minutes.
 */
import { createReadStream } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { Readable } from 'node:stream';
import { fileURLToPath } from 'node:url';
import { createZstdDecompress } from 'node:zlib';
import { Chess } from 'chess.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

const DEFAULT_SOURCE = 'https://database.lichess.org/lichess_db_puzzle.csv.zst';

/** Rating bands. Keep in sync with src/features/puzzles/buckets.ts. */
export const BUCKETS = [
  { id: 'b0400', min: 0, max: 799, label: 'Beginner' },
  { id: 'b0800', min: 800, max: 1099, label: 'Novice' },
  { id: 'b1100', min: 1100, max: 1399, label: 'Casual' },
  { id: 'b1400', min: 1400, max: 1699, label: 'Club' },
  { id: 'b1700', min: 1700, max: 1999, label: 'Intermediate' },
  { id: 'b2000', min: 2000, max: 2299, label: 'Advanced' },
  { id: 'b2300', min: 2300, max: 2599, label: 'Expert' },
  { id: 'b2600', min: 2600, max: 9999, label: 'Master' },
];

// ---------------------------------------------------------------------------
// CLI parsing
// ---------------------------------------------------------------------------
function parseArgs(argv) {
  const opts = {
    source: DEFAULT_SOURCE,
    perBucket: 500,
    minPlays: 500,
    minPopularity: 70,
    maxRd: 90,
    seed: 2024,
    out: join(ROOT, 'public', 'puzzles'),
    limit: Infinity,
  };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    const next = () => argv[++i];
    switch (arg) {
      case '--source':
        opts.source = next();
        break;
      case '--per-bucket':
        opts.perBucket = Number(next());
        break;
      case '--min-plays':
        opts.minPlays = Number(next());
        break;
      case '--min-popularity':
        opts.minPopularity = Number(next());
        break;
      case '--max-rd':
        opts.maxRd = Number(next());
        break;
      case '--seed':
        opts.seed = Number(next());
        break;
      case '--out':
        opts.out = next();
        break;
      case '--limit':
        opts.limit = Number(next());
        break;
      case '--help':
      case '-h':
        console.log(
          `Usage: node scripts/import-lichess-puzzles.mjs [--source <path|url>] [--per-bucket n] ` +
            `[--min-plays n] [--min-popularity n] [--max-rd n] [--seed n] [--out dir] [--limit n]`,
        );
        process.exit(0);
        break;
      default:
        throw new Error(`Unknown option: ${arg}`);
    }
  }
  return opts;
}

// ---------------------------------------------------------------------------
// Deterministic PRNG (mulberry32) so re-running with the same seed yields the
// same puzzle set — important for reviewable, reproducible content changes.
// ---------------------------------------------------------------------------
function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

class Reservoir {
  constructor(capacity, rng) {
    this.capacity = capacity;
    this.rng = rng;
    this.items = [];
    this.seen = 0;
  }
  offer(item) {
    this.seen++;
    if (this.items.length < this.capacity) {
      this.items.push(item);
    } else {
      const j = Math.floor(this.rng() * this.seen);
      if (j < this.capacity) this.items[j] = item;
    }
  }
}

// ---------------------------------------------------------------------------
// Input streaming
// ---------------------------------------------------------------------------
async function openSource(source) {
  let stream;
  if (/^https?:\/\//.test(source)) {
    const res = await fetch(source);
    if (!res.ok || !res.body) throw new Error(`Download failed: HTTP ${res.status}`);
    stream = Readable.fromWeb(res.body);
  } else {
    stream = createReadStream(source);
  }
  if (!source.endsWith('.zst')) return stream;
  return Readable.from(stripSkippableFrames(stream)).pipe(createZstdDecompress());
}

const ZSTD_MAGIC = 0xfd2fb528;
const SKIPPABLE_MIN = 0x184d2a50;
const SKIPPABLE_MAX = 0x184d2a5f;

/**
 * Lichess compresses its dumps with pzstd, which interleaves "skippable"
 * frames (each carrying the byte length of the frame that follows) between the
 * real Zstandard frames. libzstd tolerates them, but Node's built-in
 * decompressor rejects them with "Unknown frame descriptor", so we drop them
 * here and forward only the standard frames.
 */
async function* stripSkippableFrames(source) {
  let pending = Buffer.alloc(0);
  let passRemaining = 0; // bytes of the current standard frame still to forward
  let sizeHint = null; // length of the next standard frame, from the preceding skippable frame
  let passthrough = false; // no hints available: forward everything

  for await (const chunk of source) {
    pending = pending.length ? Buffer.concat([pending, chunk]) : chunk;

    for (;;) {
      if (passthrough) {
        yield pending;
        pending = Buffer.alloc(0);
        break;
      }
      if (passRemaining > 0) {
        const n = Math.min(passRemaining, pending.length);
        if (n === 0) break;
        yield pending.subarray(0, n);
        pending = pending.subarray(n);
        passRemaining -= n;
        continue;
      }
      if (pending.length < 8) break;

      const magic = pending.readUInt32LE(0);
      if (magic >= SKIPPABLE_MIN && magic <= SKIPPABLE_MAX) {
        const size = pending.readUInt32LE(4);
        if (pending.length < 8 + size) break;
        if (size === 4) sizeHint = pending.readUInt32LE(8);
        pending = pending.subarray(8 + size);
        continue;
      }
      if (magic === ZSTD_MAGIC) {
        if (sizeHint === null) {
          passthrough = true;
        } else {
          passRemaining = sizeHint;
          sizeHint = null;
        }
        continue;
      }
      throw new Error(`Unexpected data in .zst stream (magic 0x${magic.toString(16)})`);
    }
  }
  if (pending.length) yield pending;
}

/** Async generator yielding lines from a byte stream. */
async function* lines(stream) {
  let buffer = '';
  const decoder = new TextDecoder();
  for await (const chunk of stream) {
    buffer += decoder.decode(chunk, { stream: true });
    let idx;
    while ((idx = buffer.indexOf('\n')) >= 0) {
      yield buffer.slice(0, idx);
      buffer = buffer.slice(idx + 1);
    }
  }
  buffer += decoder.decode();
  if (buffer.length) yield buffer;
}

// ---------------------------------------------------------------------------
// Row handling
// ---------------------------------------------------------------------------
const COLUMNS = [
  'PuzzleId',
  'FEN',
  'Moves',
  'Rating',
  'RatingDeviation',
  'Popularity',
  'NbPlays',
  'Themes',
  'GameUrl',
  'OpeningTags',
  // Newer dumps also append 'DailyDate'; extra trailing columns are ignored.
];

function parseRow(line) {
  const cols = line.split(',');
  if (cols.length < 9) return null;
  return {
    id: cols[0],
    fen: cols[1],
    moves: cols[2],
    rating: Number(cols[3]),
    rd: Number(cols[4]),
    popularity: Number(cols[5]),
    plays: Number(cols[6]),
    themes: cols[7],
    url: cols[8],
    opening: cols[9] || '',
  };
}

/** Confirms every move is legal from the FEN. Cheap insurance against corrupt rows. */
function isPlayable(fen, moves) {
  try {
    const chess = new Chess(fen);
    for (const uci of moves.split(' ')) {
      const from = uci.slice(0, 2);
      const to = uci.slice(2, 4);
      const promotion = uci.length > 4 ? uci[4] : undefined;
      chess.move({ from, to, promotion });
    }
    return true;
  } catch {
    return false;
  }
}

function bucketFor(rating) {
  return BUCKETS.find((b) => rating >= b.min && rating <= b.max) ?? null;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
  const opts = parseArgs(process.argv.slice(2));
  const rng = mulberry32(opts.seed);
  const reservoirs = new Map(BUCKETS.map((b) => [b.id, new Reservoir(opts.perBucket, rng)]));

  console.log(`Reading ${opts.source}`);
  const stream = await openSource(opts.source);

  let rows = 0;
  let accepted = 0;
  let header = true;
  const started = Date.now();

  for await (const line of lines(stream)) {
    if (header) {
      header = false;
      const cols = line.trim().split(',');
      if (cols[0] !== COLUMNS[0] || cols[1] !== COLUMNS[1]) {
        throw new Error(`Unexpected CSV header: ${line.slice(0, 120)}`);
      }
      continue;
    }
    if (!line) continue;
    rows++;
    if (rows > opts.limit) break;
    if (rows % 500000 === 0) {
      const secs = ((Date.now() - started) / 1000).toFixed(0);
      process.stdout.write(
        `  … ${(rows / 1e6).toFixed(1)}M rows, ${accepted} candidates (${secs}s)\n`,
      );
    }

    const row = parseRow(line);
    if (!row) continue;
    if (row.plays < opts.minPlays) continue;
    if (row.popularity < opts.minPopularity) continue;
    if (row.rd > opts.maxRd) continue;
    const bucket = bucketFor(row.rating);
    if (!bucket) continue;

    accepted++;
    reservoirs.get(bucket.id).offer(row);
  }

  await mkdir(opts.out, { recursive: true });

  const index = {
    source: 'https://database.lichess.org/#puzzles',
    license: 'CC0-1.0',
    generatedAt: new Date().toISOString(),
    seed: opts.seed,
    filters: { minPlays: opts.minPlays, minPopularity: opts.minPopularity, maxRd: opts.maxRd },
    total: 0,
    buckets: [],
    themes: {},
  };

  for (const bucket of BUCKETS) {
    const reservoir = reservoirs.get(bucket.id);
    const puzzles = reservoir.items
      .filter((p) => isPlayable(p.fen, p.moves))
      .sort((a, b) => a.rating - b.rating)
      .map((p) => ({
        id: p.id,
        fen: p.fen,
        moves: p.moves,
        rating: p.rating,
        rd: p.rd,
        popularity: p.popularity,
        plays: p.plays,
        themes: p.themes,
        url: p.url,
        ...(p.opening ? { opening: p.opening } : {}),
      }));

    for (const p of puzzles) {
      for (const theme of p.themes.split(' ')) {
        if (!theme) continue;
        index.themes[theme] = (index.themes[theme] ?? 0) + 1;
      }
    }

    const file = `${bucket.id}.json`;
    await writeFile(join(opts.out, file), JSON.stringify(puzzles));
    index.buckets.push({
      id: bucket.id,
      label: bucket.label,
      min: bucket.min,
      max: bucket.max,
      count: puzzles.length,
      file,
    });
    index.total += puzzles.length;
    console.log(
      `  ${bucket.id} ${String(bucket.min).padStart(4)}–${String(bucket.max).padEnd(4)} ` +
        `kept ${puzzles.length}/${reservoir.seen} candidates`,
    );
  }

  index.themes = Object.fromEntries(
    Object.entries(index.themes).sort(([a], [b]) => a.localeCompare(b)),
  );
  await writeFile(join(opts.out, 'index.json'), JSON.stringify(index, null, 2) + '\n');

  const secs = ((Date.now() - started) / 1000).toFixed(0);
  console.log(`\nWrote ${index.total} puzzles to ${opts.out} from ${rows} rows in ${secs}s.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
