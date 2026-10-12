import type { Square } from 'chess.js';
import {
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { Board, type DrawShape, type Key } from '@/components/board/Board';
import { PromotionPicker } from '@/components/board/PromotionPicker';
import { EngineLines, EngineStatus } from '@/components/chess/EngineLines';
import { EvalBar } from '@/components/chess/EvalBar';
import { TreeMoveList, TreeNavigation } from '@/components/chess/TreeMoveList';
import { Badge, Button, Card, Icon, LinkButton, Segmented, Spinner, Switch } from '@/components/ui';
import { parseUci } from '@/chess/helpers';
import { Notated, San } from '@/chess/San';
import type { TreeNode } from '@/chess/tree';
import type { LongColor, PromotionPiece } from '@/chess/types';
import { handOffToAnalysis } from '@/lib/handoff';
import { characterShortcutsOn } from '@/lib/shortcutKey';
import { playMoveSound } from '@/lib/sound';
import { siteConfig } from '@/site.config';
import { useProgress } from '@/store/progress';
import { useSettings } from '@/store/settings';
import { ANALYSIS_ROOM } from '../../../relay/src/live/shared.mjs';
import { moveNumber } from './analysisRoom';
import { PhraseCard } from './PhraseCard';
import { useLivePrefs } from './prefs';
import { getAnalysisRoom } from './roomSessions';
import { analysisRoomLink } from './rooms';
import { onPhone, shareLink } from './share';
import type { AnalysisRoomSession, AnalysisRoomState, AnalysisRoomView } from './types';
import { useRoomEngine } from './useRoomEngine';
import '@/features/analyze/analyze.css';
import './live.css';
import './race-room.css';
import './analysis-room.css';

/** No arrows: one array, so the board's shapes stay put between renders. */
const NO_SHAPES: DrawShape[] = [];

type Brush = 'green' | 'red' | 'blue' | 'yellow';
const BRUSH_OPTIONS: { value: Brush; label: string }[] = [
  { value: 'green', label: 'Green' },
  { value: 'red', label: 'Red' },
  { value: 'blue', label: 'Blue' },
  { value: 'yellow', label: 'Yellow' },
];

const RESULT_WORDS: Record<string, string> = {
  '1-0': 'White won',
  '0-1': 'Black won',
  '1/2-1/2': 'Drawn',
};

/**
 * A game analysed together: up to eight people who came by the room's link (or
 * from the end of a live game), on one board. The relay keeps the moves and
 * the shared position; each device runs its own engine. A device follows the
 * shared position, or browses alone and comes back to it. Arrows and circles
 * drawn on a position are drawn for everyone. The connection belongs to
 * roomSessions.ts and outlives the page: the bar under the header leads back.
 */
export default function AnalysisRoomPage() {
  const { roomId = '' } = useParams();
  // Another room is another page: it starts afresh.
  return <Room key={roomId} id={roomId} />;
}

function Room({ id }: { id: string }) {
  const session = useMemo(() => getAnalysisRoom(id), [id]);
  if (!session) {
    return (
      <RoomAbsent title="No such room">That link does not lead to an analysis room.</RoomAbsent>
    );
  }
  return <RoomSessionView session={session} />;
}

function useTitle() {
  useEffect(() => {
    document.title = `Analyse together · ${siteConfig.name}`;
  }, []);
}

function RoomAbsent({ title, children }: { title: string; children: ReactNode }) {
  useTitle();
  return (
    <div className="narrow">
      <Card data-testid="together-absent">
        <h1 className="live-game__absent-title">{title}</h1>
        <p>{children}</p>
        <div className="row">
          <LinkButton variant="primary" to="/analyze">
            Go to Analyze
          </LinkButton>
        </div>
      </Card>
    </div>
  );
}

function RoomSessionView({ session }: { session: AnalysisRoomSession }) {
  const subscribe = useCallback((listener: () => void) => session.subscribe(listener), [session]);
  const getView = useCallback(() => session.getView(), [session]);
  const view = useSyncExternalStore(subscribe, getView);
  useTitle();
  if (view.missing) {
    return (
      <RoomAbsent title="Room not found">
        This analysis room has closed: a room goes a while after everyone has left it.
      </RoomAbsent>
    );
  }
  if (!view.state) {
    if (view.connection === 'open') {
      return (
        <RoomAbsent title="No such room">That link does not lead to an analysis room.</RoomAbsent>
      );
    }
    return (
      <div>
        <Header state={null} />
        <ConnectionLine view={view} />
      </div>
    );
  }
  return <RoomScreen session={session} view={view} state={view.state} />;
}

/** "Calm Rook v Swift Knight · White won", or what the room is, for one made from a position. */
function Header({ state }: { state: AnalysisRoomState | null }) {
  const players =
    state?.white || state?.black ? `${state.white ?? 'White'} v ${state.black ?? 'Black'}` : null;
  const result = state ? RESULT_WORDS[state.result] : undefined;
  return (
    <div className="page-header page-header--lean">
      <p className="card__eyebrow">
        <Link to="/analyze">Analyze</Link> / Together
      </p>
      <h1>Analyse together</h1>
      <p className="together__subtitle" data-testid="together-game">
        {players ? `${players}${result ? ` · ${result}` : ''}` : 'One board for everyone here.'}
        {state?.variant === 'chess960'
          ? `${players ? '.' : ''} Chess960: castle by moving the king onto its rook.`
          : ''}
      </p>
    </div>
  );
}

function ConnectionLine({ view }: { view: AnalysisRoomView }) {
  if (view.connection === 'open') return null;
  if (view.connection === 'closed') {
    return (
      <p className="small muted together__connection" role="status">
        The connection to this room has closed.
      </p>
    );
  }
  return (
    <div className="together__connection">
      <Spinner
        label={view.connection === 'connecting' ? 'Connecting to the room…' : 'Reconnecting…'}
      />
    </div>
  );
}

/** A member's name (someone who has left since: "Someone"). */
function nameOf(view: AnalysisRoomView, id: string): string {
  return view.members.find((m) => m.id === id)?.name ?? 'Someone';
}

function RoomScreen({
  session,
  view,
  state,
}: {
  session: AnalysisRoomSession;
  view: AnalysisRoomView;
  state: AnalysisRoomState;
}) {
  const navigate = useNavigate();
  const autoQueen = useSettings((s) => s.autoQueen);
  const analysisLines = useSettings((s) => s.analysisLines);
  const analysisDepth = useSettings((s) => s.analysisDepth);
  const updateSettings = useSettings((s) => s.update);
  const myName = useLivePrefs((s) => s.name);
  const { tree } = state;
  // A player of the game sees it from their own side.
  const [orientation, setOrientation] = useState<LongColor>(() =>
    state.black === myName && state.white !== myName ? 'black' : 'white',
  );
  const [drawing, setDrawing] = useState(false);
  const [brush, setBrush] = useState<Brush>('green');
  const [drawFrom, setDrawFrom] = useState<Square | null>(null);
  const [drawNote, setDrawNote] = useState('');
  const [promotion, setPromotion] = useState<{ from: Square; to: Square; at: number } | null>(null);

  const member = view.you !== null;
  const open = view.connection === 'open';
  const node = state.nodes.get(view.viewed) ?? tree.root;
  const pending = view.pending;
  const fen = pending?.fen ?? node.fen;
  const info = useMemo(() => tree.rules.position(fen), [tree, fen]);
  const lastMove = useMemo<[Square, Square] | null>(() => {
    if (pending) return pending.lastMove;
    if (!node.uci) return null;
    const { from, to } = parseUci(node.uci);
    return [from, to];
  }, [pending, node]);
  const line = useMemo(
    () => [...tree.pathTo(node).map((n) => n.uci), ...(pending ? [pending.uci] : [])].join(' '),
    [tree, node, pending],
  );
  const over = info.status.over;
  const engine = useRoomEngine({
    startFen: tree.startFen,
    moves: line,
    chess960: tree.chess960,
    gameOver: over,
  });
  const canMove = member && open && !pending && !drawing;
  const shapes = pending ? NO_SHAPES : (state.shapes.get(view.viewed) ?? NO_SHAPES);
  const choosing = promotion !== null && promotion.at === view.viewed && canMove;
  const shared = state.nodes.get(state.at) ?? tree.root;
  const isMain = useMemo(() => tree.isMainLine(node), [tree, node, state.version]); // eslint-disable-line react-hooks/exhaustive-deps
  const siblings = node.parent?.children ?? [];
  const alone = member && view.members.length === 1;

  // Into the room as soon as the page opens (once: someone who leaves stays out).
  const joinAsked = useRef(false);
  useEffect(() => {
    if (joinAsked.current || !open || view.you !== null) return;
    if (view.members.length >= view.max) return;
    joinAsked.current = true;
    session.join();
  }, [open, view.you, view.members.length, view.max, session]);

  // The others' moves are heard, as a game's are, while this board follows them.
  const heard = useRef(state.last?.seq ?? 0);
  useEffect(() => {
    const last = state.last;
    if (!last || last.seq === heard.current) return;
    heard.current = last.seq;
    if (!last.move || last.by === view.you || !view.follow) return;
    const played = tree.rules.play(last.move.fen, parseUci(last.move.uci));
    if (played) playMoveSound(played, { inCheck: () => tree.rules.position(played.after).inCheck });
  }, [state.last, view.you, view.follow, tree]);

  // Drawing by squares stops at another position: its first square was this one's.
  useEffect(() => {
    setDrawFrom(null);
  }, [view.viewed]);

  const goTo = useCallback(
    (target: TreeNode | null | undefined) => {
      const id = target ? state.ids.get(target) : undefined;
      if (id !== undefined) session.goTo(id);
    },
    [session, state],
  );
  const back = useCallback(() => goTo(node.parent), [goTo, node]);
  const forward = useCallback(() => goTo(node.children[0]), [goTo, node]);
  const toStart = useCallback(() => session.goTo(0), [session]);
  const toEnd = useCallback(() => {
    let cursor = node;
    while (cursor.children[0]) cursor = cursor.children[0];
    goTo(cursor);
  }, [goTo, node]);

  // Keyboard navigation, as on the analysis board. Nothing fires from form fields, the board
  // (which has its own keys), a dialog, or a control that has used the key already.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.ctrlKey || event.metaKey || event.altKey) return;
      const target = event.target as HTMLElement | null;
      if (
        typeof target?.closest === 'function' &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT' ||
          target.isContentEditable ||
          target.closest('[role="application"], dialog, [role="dialog"]'))
      ) {
        return;
      }
      if (document.querySelector('dialog[open]')) return;
      switch (event.key.length === 1 ? event.key.toLowerCase() : event.key) {
        case 'ArrowLeft':
          back();
          break;
        case 'ArrowRight':
          forward();
          break;
        case 'Home':
          toStart();
          break;
        case 'End':
          toEnd();
          break;
        case 'f':
          if (event.shiftKey || !characterShortcutsOn()) return;
          setOrientation((o) => (o === 'white' ? 'black' : 'white'));
          break;
        default:
          return;
      }
      event.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [back, forward, toStart, toEnd]);

  const onMove = (from: Square, to: Square) => {
    if (!canMove) return;
    if (!tree.rules.isPromotion(fen, from, to)) session.play({ from, to });
    else if (autoQueen) session.play({ from, to, promotion: 'q' });
    else setPromotion({ from, to, at: view.viewed });
  };

  const onPromotion = (piece: PromotionPiece | null) => {
    const chosen = choosing ? promotion : null;
    setPromotion(null);
    if (piece && chosen) session.play({ from: chosen.from, to: chosen.to, promotion: piece });
  };

  /** Drawing by squares: the first square, then the arrow's point (or the same square, a circle). */
  const onSquare = (key: Key) => {
    if (!drawing || !member || pending) return;
    const square = key as Square;
    if (!drawFrom) {
      setDrawFrom(square);
      setDrawNote(`From ${square}: now the square it points to, or ${square} again for a circle.`);
      return;
    }
    const shape: DrawShape =
      drawFrom === square ? { orig: square, brush } : { orig: drawFrom, dest: square, brush };
    const same = shapes.find((s) => s.orig === shape.orig && s.dest === shape.dest);
    // As on the board: the same mark again takes it away; in another colour, recolours it.
    const next = same
      ? same.brush === brush
        ? shapes.filter((s) => s !== same)
        : shapes.map((s) => (s === same ? shape : s))
      : [...shapes, shape];
    setDrawFrom(null);
    if (next.length > ANALYSIS_ROOM.shapes) {
      setDrawNote('That is as much as one position takes: clear some first.');
      return;
    }
    session.draw(view.viewed, next);
    const what = shape.dest
      ? `arrow from ${shape.orig} to ${shape.dest}`
      : `circle on ${shape.orig}`;
    setDrawNote(
      same?.brush === brush ? `Removed the ${what}.` : `Drew ${shape.dest ? 'an' : 'a'} ${what}.`,
    );
  };

  const highlights = useMemo(
    () => (drawFrom ? new Map<Key, string>([[drawFrom, 'selected']]) : undefined),
    [drawFrom],
  );

  const openInAnalyze = () => {
    const headers: Record<string, string> = {};
    if (state.white) headers.White = state.white;
    if (state.black) headers.Black = state.black;
    if (state.result !== '*') headers.Result = state.result;
    void navigate(handOffToAnalysis(tree.toPgn(headers), { orientation }));
  };

  const last = state.last;
  const news = last && last.by !== view.you ? `${nameOf(view, last.by)} ${last.words}.` : '';
  const score = engine.on ? (engine.lines.get(1)?.score ?? null) : null;
  const result = over ? (info.status.result === '*' ? '1/2-1/2' : info.status.result) : null;
  const moveText = `${info.moveNumber}${info.turn === 'black' ? '…' : '.'}`;

  const navigation = (
    <TreeNavigation
      canBack={node.parent !== null && !pending}
      canForward={node.children.length > 0 && !pending}
      onStart={toStart}
      onBack={back}
      onForward={forward}
      onEnd={toEnd}
    />
  );

  return (
    <div>
      <Header state={state} />
      <ConnectionLine view={view} />

      <div className="trainer">
        <div className="analyze__boardcol">
          <div className="trainer__board">
            <EvalBar score={score} turn={info.turn} orientation={orientation} result={result} />
            <div style={{ position: 'relative', flex: 1, minWidth: 0 }}>
              <Board
                fen={fen}
                orientation={orientation}
                turnColor={info.turn}
                movableColor={canMove ? 'both' : undefined}
                dests={info.dests}
                chess960={tree.chess960}
                lastMove={lastMove}
                check={info.inCheck}
                shapes={shapes}
                autoShapes={engine.best}
                highlights={highlights}
                drawable={member && !drawing && !pending}
                onShapesChange={(next) => {
                  if (member && !pending) session.draw(view.viewed, next);
                }}
                onSelect={drawing ? onSquare : undefined}
                onMove={onMove}
                ariaLabel={
                  drawing
                    ? 'Shared board, drawing: choose squares'
                    : `Shared board, ${info.turn} to move`
                }
              />
              {choosing ? <PromotionPicker color={info.turn} onSelect={onPromotion} /> : null}
            </div>
          </div>
          <div className="analyze__under">
            <div className="analyze__strip">
              {navigation}
              <span className="analyze__strip-move small" aria-live="polite" aria-atomic="true">
                {node.parent ? (
                  <>
                    {moveNumber(node)} <San san={node.san} />
                    {!isMain ? <span className="faint"> · variation</span> : null}
                  </>
                ) : (
                  'Start position'
                )}
              </span>
            </div>
            {member ? (
              <div className="together__tools" data-testid="together-draw">
                <Button
                  size="sm"
                  aria-pressed={drawing}
                  onClick={() => {
                    setDrawing((on) => !on);
                    setDrawFrom(null);
                    setDrawNote('');
                  }}
                  disabled={!open}
                >
                  <Icon name="pen" size={16} />
                  <span>Draw</span>
                </Button>
                {drawing ? (
                  <Segmented<Brush>
                    ariaLabel="Colour"
                    value={brush}
                    onChange={setBrush}
                    options={BRUSH_OPTIONS}
                  />
                ) : null}
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    session.draw(view.viewed, []);
                    setDrawNote('Cleared the drawing on this position.');
                  }}
                  disabled={!open || shapes.length === 0}
                >
                  Clear drawing
                </Button>
                <p className="small muted together__note" aria-live="polite">
                  {drawNote ||
                    (drawing
                      ? 'Tap a square, then another for an arrow, or the same one for a circle.'
                      : onPhone()
                        ? 'Draw arrows and circles on the board: everyone here sees them.'
                        : 'Right-click and drag to draw an arrow, or use Draw: everyone here sees it.')}
                </p>
              </div>
            ) : null}
          </div>
        </div>

        <aside className="trainer__panel stack">
          {/* Alone in the room: the link to send comes first. */}
          {alone ? <LinkCard view={view} /> : null}
          <Card as="section" aria-labelledby="together-follow-title" data-testid="together-follow">
            <h2 id="together-follow-title" className="live__title">
              The shared position
            </h2>
            <Switch
              checked={view.follow}
              onChange={(on) => session.setFollow(on)}
              label="Follow"
              description={
                view.follow
                  ? member
                    ? 'Your board shows the shared position; your steps through the moves take everyone following with you.'
                    : 'Your board shows the shared position.'
                  : 'You are browsing alone: your steps are your own. Moves you play still join the analysis.'
              }
            />
            {!view.follow ? (
              <div className="together__actions">
                <Button variant="primary" size="sm" onClick={() => session.setFollow(true)}>
                  Back to the shared position
                </Button>
                <span className="small muted">
                  {shared.parent ? (
                    <>
                      Now at {moveNumber(shared)} <San san={shared.san} />
                    </>
                  ) : (
                    'Now at the start'
                  )}
                </span>
              </div>
            ) : null}
            <p className="small together__news" role="status" data-testid="together-news">
              <Notated text={news} />
            </p>
            {view.error ? (
              <p className="small live-game__error" role="alert">
                {view.error}
              </p>
            ) : null}
          </Card>

          <Card>
            <div className="analyze__panelnav">{navigation}</div>
            <div className="together__moves">
              <TreeMoveList
                tree={tree}
                version={state.version}
                current={node}
                onSelect={(target) => goTo(target)}
              />
            </div>
            {node.parent && member ? (
              <div className="analyze__nodetools">
                <p className="small muted together__note">
                  {isMain ? 'Main line' : 'Variation'} · move <San san={node.san} />
                </p>
                <div className="together__actions">
                  {!isMain ? (
                    <Button
                      size="sm"
                      onClick={() => session.promote(view.viewed)}
                      disabled={!open || pending !== null}
                    >
                      Make main line
                    </Button>
                  ) : null}
                  <Button
                    size="sm"
                    variant="danger"
                    onClick={() => session.remove(view.viewed)}
                    disabled={!open || pending !== null}
                  >
                    {isMain && siblings.length === 1 ? 'Delete from here' : 'Delete variation'}
                  </Button>
                </div>
              </div>
            ) : null}
            <div className="together__actions">
              <Button
                size="sm"
                onClick={() => setOrientation((o) => (o === 'white' ? 'black' : 'white'))}
              >
                Flip
              </Button>
              <Button size="sm" onClick={openInAnalyze} data-testid="together-open-analyze">
                Open in Analyze
              </Button>
            </div>
          </Card>

          <Card as="section" aria-labelledby="together-engine-title">
            <div className="row row--between">
              <h2 id="together-engine-title" className="live__title">
                Your engine
              </h2>
              <div className="row">
                <label className="small muted">
                  Lines{' '}
                  <select
                    className="select analyze__mini"
                    value={analysisLines}
                    onChange={(e) => updateSettings({ analysisLines: Number(e.target.value) })}
                    aria-label="Number of engine lines"
                  >
                    {[1, 2, 3, 4, 5].map((n) => (
                      <option key={n} value={n}>
                        {n}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="small muted">
                  Depth{' '}
                  <select
                    className="select analyze__mini"
                    value={analysisDepth}
                    onChange={(e) => updateSettings({ analysisDepth: Number(e.target.value) })}
                    aria-label="Search depth"
                  >
                    {[12, 15, 18, 20, 22, 24].map((n) => (
                      <option key={n} value={n}>
                        {n}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            </div>
            <Switch
              checked={engine.on}
              onChange={engine.setOn}
              label="Engine"
              description="On this device only: the others see their own."
            />
            {engine.status === 'error' ? (
              <p className="small live-game__error" role="alert">
                The engine could not start: {engine.error?.message}{' '}
                <Button size="sm" onClick={() => void engine.retry()}>
                  Retry
                </Button>
              </p>
            ) : null}
            {engine.on ? (
              <>
                <EngineLines
                  chess960={tree.chess960}
                  fen={fen}
                  turn={info.turn}
                  lines={engine.lines}
                  count={analysisLines}
                  thinking={engine.thinking}
                  onPlayMove={canMove ? (uci) => session.play(parseUci(uci)) : undefined}
                  moveLabel={moveText}
                />
                <EngineStatus
                  name={engine.name}
                  depth={engine.depth}
                  nps={engine.nps}
                  thinking={engine.thinking}
                  loading={engine.status === 'idle' || engine.status === 'loading'}
                />
              </>
            ) : null}
          </Card>

          <MembersCard session={session} view={view} />
          {alone ? null : <LinkCard view={view} />}
          {view.you ? (
            <PhraseCard
              chat={view.chat}
              you={view.you}
              nameOf={(id) => nameOf(view, id)}
              onSay={(phrase) => session.say(phrase)}
              disabled={!open}
            />
          ) : null}
        </aside>
      </div>
    </div>
  );
}

/** Who is in the room and who is here; joining and leaving. */
function MembersCard({ session, view }: { session: AnalysisRoomSession; view: AnalysisRoomView }) {
  const name = useLivePrefs((s) => s.name);
  const showRating = useLivePrefs((s) => s.showRating);
  const rating = useProgress((s) => Math.round(s.puzzleRating));
  const full = view.members.length >= view.max;
  const open = view.connection === 'open';
  return (
    <Card as="section" aria-labelledby="together-members-title" data-testid="together-members">
      <div className="live__head">
        <h2 id="together-members-title" className="live__title">
          People
        </h2>
        <p className="small muted live__aside">
          {view.members.length} of {view.max}
        </p>
      </div>
      <ul className="race-room__members" role="list">
        {view.members.map((m) => (
          <li key={m.id} className="race-room__member">
            <span className="race-room__name">
              {m.name}
              {m.rating !== null ? <span className="live-game__rating"> {m.rating}</span> : null}
            </span>
            {m.id === view.you ? <Badge>You</Badge> : null}
            <span className={`race-room__presence${m.here ? ' race-room__presence--here' : ''}`}>
              <span className="race-room__dot" aria-hidden="true" />
              {m.here ? 'Here' : 'Away'}
            </span>
          </li>
        ))}
      </ul>
      <div className="race-room__actions">
        {view.you === null ? (
          <>
            <p className="small race-room__lead">
              {full ? (
                'This room is full: you can look on.'
              ) : (
                <>
                  Join under your name, <b>{name}</b>
                  {showRating ? ` (${rating})` : ''}, to play moves and draw.
                </>
              )}
            </p>
            <Button
              variant="primary"
              onClick={() => session.join()}
              disabled={!open || full || view.joining}
              data-testid="together-join"
            >
              {view.joining ? 'Joining…' : 'Join the room'}
            </Button>
          </>
        ) : (
          <Button variant="ghost" size="sm" onClick={() => session.leave()} disabled={!open}>
            Leave the room
          </Button>
        )}
      </div>
    </Card>
  );
}

/** The room's link, to send to the others. */
function LinkCard({ view }: { view: AnalysisRoomView }) {
  const link = analysisRoomLink(view.id);
  const places = view.max - view.members.length;
  return (
    <Card as="section" aria-labelledby="together-link-title">
      <h2 id="together-link-title" className="live__title">
        Invite
      </h2>
      <p className="small">
        {places > 0
          ? `Send this link: up to ${places} more can join, in the app.`
          : 'The room is full.'}
      </p>
      <p className="race-room__link" data-testid="together-link">
        {link}
      </p>
      <Button
        onClick={() => void shareLink(link, 'Analyse a game with me', 'Link copied.')}
        data-testid="together-share"
      >
        <Icon name="link" size={18} />
        <span>{onPhone() ? 'Share link' : 'Copy link'}</span>
      </Button>
    </Card>
  );
}
