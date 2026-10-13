import { Badge, Stars } from '@/components/ui';

const WORDS = ['', 'Easy', 'Medium', 'Hard', 'Very hard'] as const;

/**
 * The one way difficulty is shown on cards (drills, studies, mating patterns):
 * stars in a badge, with a spoken label — "Difficulty: Medium (2 of 4)".
 * `max` is the scale (3 for most content, 4 for the endgame library).
 */
export function Difficulty({ level, max = 3 }: { level: number; max?: 3 | 4 }) {
  const word = WORDS[Math.min(Math.max(level, 1), max)] ?? '';
  const label = `Difficulty: ${word} (${level} of ${max})`;
  return (
    <Badge className="difficulty">
      <Stars count={level} max={max} label={label} />
    </Badge>
  );
}
