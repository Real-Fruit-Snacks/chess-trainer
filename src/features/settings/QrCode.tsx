import { useEffect, useState } from 'react';

/** The light margin a reader needs around the code, in modules (the standard's four). */
const QUIET = 4;

/** The code's dark modules as one SVG path, a rectangle per run of dark modules in a row. */
function modulesPath(data: boolean[][]): string {
  let path = '';
  data.forEach((row, y) => {
    let x = 0;
    while (x < row.length) {
      if (!row[x]) {
        x++;
        continue;
      }
      const start = x;
      while (x < row.length && row[x]) x++;
      path += `M${start + QUIET} ${y + QUIET}h${x - start}v1h${start - x}z`;
    }
  });
  return path;
}

/**
 * A QR code for `text`: dark modules on white with the quiet zone around them,
 * in either colour scheme, so a phone's camera reads it off the screen. The
 * encoder loads when the first code is shown.
 */
export function QrCode({
  text,
  label,
  size = 232,
}: {
  text: string;
  /** What the code is for, for screen readers. */
  label: string;
  size?: number;
}) {
  const [code, setCode] = useState<{ text: string; path: string; modules: number } | null>(null);

  useEffect(() => {
    let cancelled = false;
    import('uqr')
      .then(({ encode }) => {
        if (cancelled) return;
        const qr = encode(text, { ecc: 'M', border: 0 });
        setCode({ text, path: modulesPath(qr.data), modules: qr.size + 2 * QUIET });
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [text]);

  if (code?.text !== text) {
    return (
      <div className="qr qr--loading" style={{ width: size, height: size }} aria-hidden="true" />
    );
  }
  return (
    <svg
      className="qr"
      role="img"
      aria-label={label}
      width={size}
      height={size}
      viewBox={`0 0 ${code.modules} ${code.modules}`}
      shapeRendering="crispEdges"
      data-testid="sync-qr"
    >
      <rect width={code.modules} height={code.modules} fill="#fff" />
      <path d={code.path} fill="#000" />
    </svg>
  );
}
