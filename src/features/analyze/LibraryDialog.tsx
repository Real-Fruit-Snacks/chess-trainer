import { useMemo, useState } from 'react';
import { Alert, Button, ConfirmDialog, Dialog, Field, Icon, Input } from '@/components/ui';
import { toast } from '@/components/ui/toastStore';
import { formatDate } from '@/lib/dates';
import { buildShareFragment, SHARE_LINK_WARN_CHARS } from '@/lib/shareLink';
import { siteConfig } from '@/site.config';
import {
  DEFAULT_COLLECTION,
  groupAnalyses,
  MAX_ANALYSES,
  type SavedAnalysis,
  useAnalyses,
} from '@/store/analyses';

/**
 * The analysis library: save the current board under a name and collection,
 * reopen, share or delete what is saved.
 */
export function SaveAnalysisDialog({
  open,
  onClose,
  pgn,
  startFen,
  moves,
  suggestedName,
  existing = null,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  pgn: string;
  startFen: string;
  moves: number;
  suggestedName: string;
  /** The library entry the board was opened from: saving updates it instead of adding a copy. */
  existing?: SavedAnalysis | null;
  onSaved: (entry: SavedAnalysis) => void;
}) {
  const save = useAnalyses((s) => s.save);
  const update = useAnalyses((s) => s.update);
  const items = useAnalyses((s) => s.items);
  const collections = useMemo(() => groupAnalyses(items).map((g) => g.collection), [items]);
  const [name, setName] = useState(suggestedName);
  const [collection, setCollection] = useState(existing?.collection ?? DEFAULT_COLLECTION);
  const stillThere = existing ? !!items[existing.id] : false;
  const count = Object.keys(items).length;
  const willEvict = !stillThere && count >= MAX_ANALYSES;

  const submit = () => {
    if (existing && stillThere) {
      update(existing.id, { name, collection, pgn, moves });
      const updated = useAnalyses.getState().items[existing.id] ?? existing;
      toast(`Updated “${updated.name}”.`, { tone: 'success' });
      onSaved(updated);
    } else {
      const entry = save({ name, collection, pgn, startFen, moves });
      toast(`Saved “${entry.name}” to ${entry.collection}.`, { tone: 'success' });
      onSaved(entry);
    }
    onClose();
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={existing && stillThere ? 'Update analysis' : 'Save analysis'}
      actions={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" onClick={submit} data-testid="save-analysis-confirm">
            {existing && stillThere ? `Update “${existing.name}”` : 'Save'}
          </Button>
        </>
      }
    >
      <div className="stack">
        {willEvict ? (
          <Alert tone="warning">
            The library is full ({MAX_ANALYSES} entries). Saving this one removes the entry that was
            changed longest ago. Delete something you no longer need first, or export a backup from
            Settings.
          </Alert>
        ) : null}
        <Field label="Name">
          {(id) => (
            <Input
              id={id}
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoFocus
              data-testid="save-analysis-name"
            />
          )}
        </Field>
        <Field label="Collection" hint="Type a new collection name or pick an existing one.">
          {(id) => (
            <>
              <Input
                id={id}
                list={`${id}-collections`}
                value={collection}
                onChange={(e) => setCollection(e.target.value)}
                data-testid="save-analysis-collection"
              />
              <datalist id={`${id}-collections`}>
                {[DEFAULT_COLLECTION, ...collections]
                  .filter((c, i, all) => all.indexOf(c) === i)
                  .map((c) => (
                    <option key={c} value={c} />
                  ))}
              </datalist>
            </>
          )}
        </Field>
        <p className="small muted" style={{ margin: 0 }}>
          The whole tree is saved — variations, comments and the starting position.
        </p>
      </div>
    </Dialog>
  );
}

export function LibraryDialog({
  open,
  onClose,
  onOpen,
}: {
  open: boolean;
  onClose: () => void;
  onOpen: (entry: SavedAnalysis) => void;
}) {
  const items = useAnalyses((s) => s.items);
  const remove = useAnalyses((s) => s.remove);
  const removeCollection = useAnalyses((s) => s.removeCollection);
  const update = useAnalyses((s) => s.update);
  const groups = useMemo(() => groupAnalyses(items), [items]);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [confirm, setConfirm] = useState<
    { kind: 'entry'; entry: SavedAnalysis } | { kind: 'collection'; collection: string } | null
  >(null);
  const count = Object.keys(items).length;

  const share = async (entry: SavedAnalysis) => {
    const fragment = await buildShareFragment({ pgn: entry.pgn, name: entry.name });
    const url = `${window.location.origin}${window.location.pathname}#${fragment}`;
    try {
      await navigator.clipboard.writeText(url);
      toast('Link copied — anyone who opens it sees this analysis.', { tone: 'success' });
      if (url.length > SHARE_LINK_WARN_CHARS) {
        toast(
          `This link is ${url.length.toLocaleString()} characters long — some apps cut links around 2,000.`,
          { tone: 'warning' },
        );
      }
    } catch {
      toast('Could not copy the link.', { tone: 'warning' });
    }
  };

  const confirmDialog =
    confirm === null ? null : confirm.kind === 'entry' ? (
      <ConfirmDialog
        open
        title={`Delete “${confirm.entry.name}”?`}
        confirmLabel="Delete"
        danger
        onConfirm={() => remove(confirm.entry.id)}
        onClose={() => setConfirm(null)}
      >
        The analysis is removed from this device. There is no undo.
      </ConfirmDialog>
    ) : (
      <ConfirmDialog
        open
        title={`Delete the collection “${confirm.collection}”?`}
        confirmLabel="Delete collection"
        danger
        onConfirm={() => removeCollection(confirm.collection)}
        onClose={() => setConfirm(null)}
      >
        Every analysis in it is removed from this device. There is no undo.
      </ConfirmDialog>
    );

  return (
    <Dialog open={open} onClose={onClose} title="Analysis library" wide>
      {confirmDialog}
      {count >= MAX_ANALYSES - 10 ? (
        <Alert tone={count >= MAX_ANALYSES ? 'warning' : 'info'}>
          {count} of {MAX_ANALYSES} entries used.{' '}
          {count >= MAX_ANALYSES
            ? 'The library is full: the next save removes the entry changed longest ago.'
            : 'Once the library is full, each save removes the entry changed longest ago.'}
        </Alert>
      ) : null}
      {groups.length === 0 ? (
        <p className="muted" style={{ margin: 0 }}>
          Nothing saved yet. Use “Save” on the analysis board, or import a Lichess study to keep
          every chapter here.
        </p>
      ) : (
        <div className="stack" data-testid="library">
          {groups.map((group) => (
            <section key={group.collection} className="library__collection">
              <div className="row row--between">
                <h3 className="library__title">
                  {group.collection}{' '}
                  <span className="small muted">
                    · {group.entries.length} {group.entries.length === 1 ? 'entry' : 'entries'}
                  </span>
                </h3>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setConfirm({ kind: 'collection', collection: group.collection })}
                >
                  Delete collection
                </Button>
              </div>
              <ul role="list" className="library__list">
                {group.entries.map((entry) => (
                  <li key={entry.id} className="library__item" data-testid="library-item">
                    <div className="library__main">
                      {renaming === entry.id ? (
                        <form
                          className="row"
                          onSubmit={(e) => {
                            e.preventDefault();
                            update(entry.id, { name: draft });
                            setRenaming(null);
                          }}
                        >
                          <Input
                            value={draft}
                            onChange={(e) => setDraft(e.target.value)}
                            aria-label="New name"
                            autoFocus
                          />
                          <Button size="sm" type="submit">
                            Rename
                          </Button>
                        </form>
                      ) : (
                        <button
                          type="button"
                          className="linklike library__name"
                          onClick={() => {
                            onOpen(entry);
                            onClose();
                          }}
                        >
                          {entry.name}
                        </button>
                      )}
                      <span className="small muted">
                        {entry.moves} move{entry.moves === 1 ? '' : 's'} · saved{' '}
                        {formatDate(entry.updatedAt, siteConfig.locale)}
                      </span>
                    </div>
                    <div className="row library__actions">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => {
                          setRenaming(entry.id);
                          setDraft(entry.name);
                        }}
                      >
                        Rename
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => void share(entry)}
                        title="Copy a link that opens this analysis here"
                      >
                        Copy link
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        icon
                        aria-label={`Delete ${entry.name}`}
                        onClick={() => setConfirm({ kind: 'entry', entry })}
                      >
                        <Icon name="close" size={14} />
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </Dialog>
  );
}
