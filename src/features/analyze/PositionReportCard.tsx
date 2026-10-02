import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import type { DrawShape } from '@/components/board/Board';
import { Button, Card } from '@/components/ui';
import type { Fen } from '@/chess/types';
import { getLessonMeta } from '@/features/learn/lessonMeta';
import { type ReportItem, reportPosition } from './positionReport';
import { Notated } from '@/chess/San';

const TOPIC_LABEL: Record<ReportItem['topic'], string> = {
  material: 'Material',
  pawns: 'Pawn structure',
  king: 'King safety',
  files: 'Files',
  pieces: 'Pieces',
  plan: 'Plans',
};

/**
 * "Explain this position": the coach's checklist for the position on the
 * board, with the squares of each finding shown on hover and a link to the
 * lesson about it.
 */
export function PositionReportCard({
  fen,
  onHighlight,
}: {
  fen: Fen;
  /** Called with squares to circle (empty to clear). */
  onHighlight: (shapes: DrawShape[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const report = useMemo(() => (open ? reportPosition(fen) : null), [fen, open]);

  const show = (item: ReportItem | null) => {
    onHighlight(
      item ? item.squares.map((sq) => ({ orig: sq, brush: item.weakness ? 'red' : 'green' })) : [],
    );
  };

  const groups = report
    ? (['material', 'pawns', 'king', 'files', 'pieces'] as const)
        .map((topic) => ({ topic, items: report.items.filter((i) => i.topic === topic) }))
        .filter((g) => g.items.length > 0)
    : [];

  return (
    <Card data-testid="position-report">
      <div className="row row--between">
        <strong>Position report</strong>
        <Button size="sm" onClick={() => setOpen((v) => !v)}>
          {open ? 'Hide' : 'Explain this position'}
        </Button>
      </div>
      {!open ? (
        <p className="small muted" style={{ margin: '6px 0 0' }}>
          Material, pawn structure, king safety, files and pieces — and the plans that follow, each
          linked to its lesson.
        </p>
      ) : report ? (
        <div className="report" onMouseLeave={() => show(null)}>
          <p className="small muted" style={{ margin: '6px 0 8px' }}>
            {report.phase === 'opening'
              ? 'Still the opening.'
              : report.phase === 'middlegame'
                ? 'A middlegame.'
                : 'An endgame.'}{' '}
            Hover a line to see the squares.
          </p>
          {groups.map((group) => (
            <section key={group.topic} className="report__group">
              <h3 className="report__heading">{TOPIC_LABEL[group.topic]}</h3>
              <ul className="report__list">
                {group.items.map((item, i) => (
                  <ReportLine key={`${group.topic}-${i}`} item={item} onHover={show} />
                ))}
              </ul>
            </section>
          ))}
          {(['white', 'black'] as const).map((side) => (
            <section key={side} className="report__group">
              <h3 className="report__heading">Plans for {side}</h3>
              <ul className="report__list" data-testid={`report-plans-${side}`}>
                {report.plans[side].map((item, i) => (
                  <ReportLine key={`${side}-${i}`} item={item} onHover={show} />
                ))}
              </ul>
            </section>
          ))}
        </div>
      ) : null}
    </Card>
  );
}

function ReportLine({
  item,
  onHover,
}: {
  item: ReportItem;
  onHover: (item: ReportItem | null) => void;
}) {
  const lesson = item.lesson ? getLessonMeta(item.lesson) : null;
  return (
    <li
      className={`report__item${item.weakness ? ' report__item--weak' : ''}`}
      onMouseEnter={() => onHover(item)}
      onFocus={() => onHover(item)}
      tabIndex={item.squares.length ? 0 : -1}
    >
      <span>
        <Notated text={item.text} />
      </span>
      {lesson ? (
        <Link to={`/learn/${lesson.id}`} className="small report__lesson">
          {lesson.title}
        </Link>
      ) : null}
    </li>
  );
}
