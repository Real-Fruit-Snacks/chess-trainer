/** An opening line from the book: ECO code, name and its moves in SAN. */
export interface OpeningLine {
  eco: string;
  name: string;
  moves: string[];
}

type RawLine = [eco: string, name: string, moves: string];

let linesPromise: Promise<OpeningLine[]> | null = null;

/** Lazily downloads (then caches) every opening line of the book. */
export function loadOpeningLines(): Promise<OpeningLine[]> {
  linesPromise ??= fetch(`${import.meta.env.BASE_URL}openings/lines.json`)
    .then((res) => {
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json() as Promise<RawLine[]>;
    })
    .then((raw) => raw.map(([eco, name, moves]) => ({ eco, name, moves: moves.split(' ') })))
    .catch((err: unknown) => {
      linesPromise = null;
      throw err;
    });
  return linesPromise;
}

/** Test seam: preload lines without fetching. */
export function setOpeningLines(lines: OpeningLine[]): void {
  linesPromise = Promise.resolve(lines);
}
