import { useEffect, useState } from 'react';
import { Alert, Button, Dialog, Field, Input, Select } from '@/components/ui';
import { toast } from '@/components/ui/toastStore';
import type { LongColor, San } from '@/chess/types';
import { useRepertoire } from '@/store/repertoire';
import { describeLine, mergeLineIntoPgn } from './mergeLine';

const NEW = '__new__';

/**
 * "Add this line to a repertoire": merges a sequence of moves into one of the
 * learner's own repertoires, or starts a new one with it. Built-in repertoires
 * cannot be changed, so only custom ones are offered.
 */
export function AddToRepertoireDialog({
  open,
  onClose,
  line,
  defaultColor = 'white',
}: {
  open: boolean;
  onClose: () => void;
  /** Moves from the starting position to the position being added, in SAN. */
  line: San[];
  defaultColor?: LongColor;
}) {
  const custom = useRepertoire((s) => s.custom);
  const addCustom = useRepertoire((s) => s.addCustom);
  const updateCustom = useRepertoire((s) => s.updateCustom);
  const [target, setTarget] = useState<string>(NEW);
  const [name, setName] = useState('');
  const [color, setColor] = useState<LongColor>(defaultColor);
  const [error, setError] = useState<string | null>(null);

  // Preselect the most recent custom repertoire for the same colour, else "new".
  useEffect(() => {
    if (!open) return;
    const match = [...custom].reverse().find((c) => c.color === defaultColor);
    setTarget(match?.id ?? NEW);
    setColor(defaultColor);
    setError(null);
  }, [open, custom, defaultColor]);

  const summary = line.length ? describeLine(line) : 'the starting position';

  const confirm = () => {
    setError(null);
    try {
      if (target === NEW) {
        const merged = mergeLineIntoPgn('', line);
        const rep = addCustom({ name: name.trim() || 'My repertoire', color, pgn: merged.pgn });
        toast(`Started "${rep.name}" with ${merged.added} moves.`, { tone: 'success' });
      } else {
        const rep = custom.find((c) => c.id === target);
        if (!rep) throw new Error('That repertoire no longer exists.');
        const merged = mergeLineIntoPgn(rep.pgn, line);
        if (merged.added === 0) {
          toast(`"${rep.name}" already has this line.`);
        } else {
          updateCustom(rep.id, { pgn: merged.pgn });
          toast(
            `Added ${merged.added} new ${merged.added === 1 ? 'move' : 'moves'} to "${rep.name}".`,
            { tone: 'success' },
          );
        }
      }
      setName('');
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Add this line to a repertoire"
      actions={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" onClick={confirm} disabled={line.length === 0}>
            Add line
          </Button>
        </>
      }
    >
      <div className="stack" data-testid="add-to-repertoire">
        <p className="small muted" style={{ margin: 0 }}>
          <code>{summary}</code>
        </p>
        <Field
          label="Repertoire"
          hint={
            custom.length === 0
              ? 'Built-in repertoires cannot be changed, so this starts one of your own.'
              : undefined
          }
        >
          {(id) => (
            <Select
              id={id}
              value={target}
              onChange={(e) => setTarget(e.target.value)}
              data-testid="repertoire-target"
            >
              {custom.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} ({c.color})
                </option>
              ))}
              <option value={NEW}>New repertoire…</option>
            </Select>
          )}
        </Field>
        {target === NEW ? (
          <>
            <Field label="Name">
              {(id) => (
                <Input
                  id={id}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. My Italian"
                />
              )}
            </Field>
            <Field label="You play">
              {(id) => (
                <Select
                  id={id}
                  value={color}
                  onChange={(e) => setColor(e.target.value as LongColor)}
                >
                  <option value="white">White</option>
                  <option value="black">Black</option>
                </Select>
              )}
            </Field>
          </>
        ) : null}
        {error ? <Alert tone="danger">{error}</Alert> : null}
      </div>
    </Dialog>
  );
}
