import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Board } from '@/components/board/Board';
import { Badge, Button, Card, LinkButton, ProgressBar } from '@/components/ui';
import type { San } from '@/chess/types';
import { getCourse } from '@/features/learn/courses';
import { LESSON_META } from '@/features/learn/lessonMeta';
import { themeName } from '@/features/puzzles/themes';
import { CALIBRATION_PUZZLES, formatRating } from '@/lib/rating';
import { siteConfig } from '@/site.config';
import { useProgress } from '@/store/progress';
import {
  ENDGAME_OPTIONS,
  type EndgameId,
  evaluatePlacement,
  EXPERIENCE_OPTIONS,
  type ExperienceId,
  OPENING_OPTIONS,
  type OpeningId,
  type PlacementAnswers,
  type PlacementResult,
  RULE_OPTIONS,
  type RuleId,
  shuffledOptions,
  TACTIC_QUESTIONS,
} from './placement';
import './placement.css';

type Step =
  | { kind: 'experience' }
  | { kind: 'rules' }
  | { kind: 'tactic'; index: number }
  | { kind: 'endgames' }
  | { kind: 'openings' }
  | { kind: 'result' };

const STEPS: Step[] = [
  { kind: 'experience' },
  { kind: 'rules' },
  ...TACTIC_QUESTIONS.map((_, index) => ({ kind: 'tactic' as const, index })),
  { kind: 'endgames' },
  { kind: 'openings' },
  { kind: 'result' },
];

export default function PlacementPage() {
  const [stepIndex, setStepIndex] = useState(0);
  const [experience, setExperience] = useState<ExperienceId | null>(null);
  const [rules, setRules] = useState<RuleId[]>([]);
  const [tactics, setTactics] = useState<(San | null)[]>(TACTIC_QUESTIONS.map(() => null));
  const [endgames, setEndgames] = useState<EndgameId | null>(null);
  const [openings, setOpenings] = useState<OpeningId | null>(null);
  const [seed] = useState(() => Math.floor(Math.random() * 1000) + 1);

  useEffect(() => {
    document.title = `Placement quiz · ${siteConfig.name}`;
  }, []);

  const step = STEPS[stepIndex] ?? STEPS[0];
  if (!step) return null;
  const canContinue =
    step.kind === 'experience'
      ? experience !== null
      : step.kind === 'endgames'
        ? endgames !== null
        : step.kind === 'openings'
          ? openings !== null
          : true;

  const answers: PlacementAnswers = {
    experience: experience ?? 'beginner',
    rules,
    tactics,
    endgames: endgames ?? 'none',
    openings: openings ?? 'none',
  };

  return (
    <div className="placement">
      <div className="page-header">
        <p className="card__eyebrow">
          <Link to="/learn">Learn</Link> / Placement quiz
        </p>
        <h1>Where should you start?</h1>
        <p>
          Five quick questions and three positions. At the end you get a course, your first lessons
          and a starting point for your puzzle rating. Nothing is final — the rating adjusts as you
          solve.
        </p>
      </div>
      {step.kind !== 'result' ? (
        <div style={{ marginBottom: 16 }}>
          <ProgressBar value={stepIndex} max={STEPS.length - 1} label="Quiz progress" />
        </div>
      ) : null}

      <Card>
        {step.kind === 'experience' ? (
          <Choice<ExperienceId>
            title="How much chess have you played?"
            options={EXPERIENCE_OPTIONS.map((o) => ({ id: o.id, label: o.label }))}
            value={experience}
            onChange={setExperience}
            testId="placement-experience"
          />
        ) : null}

        {step.kind === 'rules' ? (
          <div>
            <h2 style={{ marginTop: 0 }}>Which of these do you know well?</h2>
            <p className="muted">Tick everything you could explain to a friend. Leave the rest.</p>
            <div className="choices" role="group" aria-label="Rules you know">
              {RULE_OPTIONS.map((rule) => {
                const checked = rules.includes(rule.id);
                return (
                  <label key={rule.id} className={`choice${checked ? ' is-selected' : ''}`}>
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={(e) =>
                        setRules((prev) =>
                          e.target.checked
                            ? [...prev, rule.id]
                            : prev.filter((id) => id !== rule.id),
                        )
                      }
                    />
                    <span>{rule.label}</span>
                  </label>
                );
              })}
            </div>
          </div>
        ) : null}

        {step.kind === 'tactic' ? (
          <TacticStep
            index={step.index}
            seed={seed}
            value={tactics[step.index] ?? null}
            onChange={(san) =>
              setTactics((prev) => prev.map((v, i) => (i === step.index ? san : v)))
            }
          />
        ) : null}

        {step.kind === 'endgames' ? (
          <Choice<EndgameId>
            title="Endgames: which is true for you?"
            options={ENDGAME_OPTIONS.map((o) => ({ id: o.id, label: o.label }))}
            value={endgames}
            onChange={setEndgames}
            testId="placement-endgames"
          />
        ) : null}

        {step.kind === 'openings' ? (
          <Choice<OpeningId>
            title="Openings: which is true for you?"
            options={OPENING_OPTIONS.map((o) => ({ id: o.id, label: o.label }))}
            value={openings}
            onChange={setOpenings}
            testId="placement-openings"
          />
        ) : null}

        {step.kind === 'result' ? (
          <Result result={evaluatePlacement(answers)} answers={answers} />
        ) : null}

        {step.kind !== 'result' ? (
          <div className="row row--between" style={{ marginTop: 20 }}>
            <Button
              variant="ghost"
              onClick={() => setStepIndex((i) => Math.max(0, i - 1))}
              disabled={stepIndex === 0}
            >
              Back
            </Button>
            <Button
              variant="primary"
              onClick={() => setStepIndex((i) => Math.min(STEPS.length - 1, i + 1))}
              disabled={!canContinue}
              data-testid="placement-next"
            >
              {step.kind === 'tactic' && tactics[step.index] === null
                ? 'Skip'
                : stepIndex === STEPS.length - 2
                  ? 'See my result'
                  : 'Next'}
            </Button>
          </div>
        ) : null}
      </Card>
    </div>
  );
}

function Choice<T extends string>({
  title,
  options,
  value,
  onChange,
  testId,
}: {
  title: string;
  options: { id: T; label: string }[];
  value: T | null;
  onChange: (id: T) => void;
  testId: string;
}) {
  return (
    <div>
      <h2 style={{ marginTop: 0 }}>{title}</h2>
      <div className="choices" role="radiogroup" aria-label={title} data-testid={testId}>
        {options.map((option) => (
          <label key={option.id} className={`choice${option.id === value ? ' is-selected' : ''}`}>
            <input
              type="radio"
              name={testId}
              value={option.id}
              checked={option.id === value}
              onChange={() => onChange(option.id)}
            />
            <span>{option.label}</span>
          </label>
        ))}
      </div>
    </div>
  );
}

function TacticStep({
  index,
  seed,
  value,
  onChange,
}: {
  index: number;
  seed: number;
  value: San | null;
  onChange: (san: San | null) => void;
}) {
  const question = TACTIC_QUESTIONS[index];
  if (!question) return null;
  const options = shuffledOptions(question, seed + index);
  const turn = question.fen.split(' ')[1] === 'b' ? 'black' : 'white';
  return (
    <div className="placement__tactic">
      <div className="placement__board">
        <Board
          fen={question.fen}
          orientation={turn}
          turnColor={turn}
          viewOnly
          ariaLabel={`Position ${index + 1} of ${TACTIC_QUESTIONS.length}`}
        />
      </div>
      <div>
        <p className="card__eyebrow">
          Position {index + 1} of {TACTIC_QUESTIONS.length}
        </p>
        <h2 style={{ marginTop: 0 }}>{question.prompt}</h2>
        <div
          className="choices"
          role="radiogroup"
          aria-label="Your move"
          data-testid="placement-tactic"
        >
          {options.map((option) => (
            <label key={option} className={`choice${option === value ? ' is-selected' : ''}`}>
              <input
                type="radio"
                name={`tactic-${index}`}
                value={option}
                checked={option === value}
                onChange={() => onChange(option)}
              />
              <span className="mono">{option}</span>
            </label>
          ))}
        </div>
        <p className="small muted" style={{ marginBottom: 0 }}>
          Not sure? Skip it — a skipped position does not count against you.
        </p>
      </div>
    </div>
  );
}

function Result({ result, answers }: { result: PlacementResult; answers: PlacementAnswers }) {
  const navigate = useNavigate();
  const onboarded = useProgress((s) => s.onboarded);
  const currentRating = useProgress((s) => s.puzzleRating);
  const completeOnboarding = useProgress((s) => s.completeOnboarding);
  const setPlacement = useProgress((s) => s.setPlacement);
  const lessonsDone = useProgress((s) => s.lessons);
  const course = getCourse(result.courseId);

  useEffect(() => {
    setPlacement({ rating: result.rating, courseId: result.courseId });
  }, [result.rating, result.courseId, setPlacement]);

  const firstLessons = LESSON_META.filter(
    (l) => l.level === result.level && !lessonsDone[l.id]?.completedAt,
  ).slice(0, 3);

  const startPuzzles = () => {
    completeOnboarding(result.rating, 'calibrate');
    void navigate('/puzzles');
  };

  return (
    <div data-testid="placement-result">
      <p className="card__eyebrow">Your result</p>
      <h2 style={{ marginTop: 0 }}>
        Start with the <em>{course?.title ?? result.courseId}</em> course
      </h2>
      <p className="muted">{result.summary}</p>
      <div className="placement__stats">
        <div>
          <span className="placement__stat-value" data-testid="placement-rating">
            {formatRating(result.rating)}
          </span>
          <span className="small muted">suggested starting rating</span>
        </div>
        <div>
          <span className="placement__stat-value">
            {result.tacticsSolved}/{TACTIC_QUESTIONS.length}
          </span>
          <span className="small muted">positions solved</span>
        </div>
        <div>
          <span className="placement__stat-value">
            <Badge tone="accent">{result.level}</Badge>
          </span>
          <span className="small muted">lesson level</span>
        </div>
      </div>

      {answers.tactics.some((t) => t !== null) ? (
        <details className="small" style={{ margin: '12px 0' }}>
          <summary className="muted">The positions, explained</summary>
          <ul>
            {TACTIC_QUESTIONS.map((q, i) => {
              const chosen = answers.tactics[i];
              if (chosen === null || chosen === undefined) return null;
              return (
                <li key={q.id}>
                  <strong>{chosen === q.answer ? 'Solved' : `You played ${chosen}`}.</strong>{' '}
                  {q.explanation}{' '}
                  <a href={q.source} target="_blank" rel="noreferrer">
                    source
                  </a>
                </li>
              );
            })}
          </ul>
        </details>
      ) : null}

      <div className="placement__next">
        <div>
          <h3 style={{ margin: '0 0 4px' }}>Your first lessons</h3>
          <ul className="placement__lessons">
            {firstLessons.map((l) => (
              <li key={l.id}>
                <Link to={`/learn/${l.id}`}>{l.title}</Link>{' '}
                <span className="small muted">· {l.minutes} min</span>
              </li>
            ))}
          </ul>
          {result.themes.length ? (
            <p className="small muted">
              Puzzles to practise:{' '}
              {result.themes.map((t) => (
                <Link
                  key={t}
                  to={`/puzzles/themes?theme=${encodeURIComponent(t)}`}
                  className="badge"
                >
                  {themeName(t)}
                </Link>
              ))}
            </p>
          ) : null}
        </div>
        <div className="row" style={{ flexWrap: 'wrap' }}>
          <LinkButton variant="primary" size="lg" to={`/learn/course/${result.courseId}`}>
            Open the course
          </LinkButton>
          {onboarded ? (
            <LinkButton size="lg" to="/puzzles">
              Puzzles (rating {formatRating(currentRating)})
            </LinkButton>
          ) : (
            <Button size="lg" onClick={startPuzzles} data-testid="placement-start-puzzles">
              Find my level: {CALIBRATION_PUZZLES} puzzles from {formatRating(result.rating)}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
