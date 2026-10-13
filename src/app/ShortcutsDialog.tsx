import { Button, Dialog, Kbd } from '@/components/ui';
import { SHORTCUT_GROUPS } from './shortcuts';

/**
 * The keyboard shortcut reference. Opens with "?" anywhere, or from the
 * footer link, and lists every shortcut the feature pages handle.
 */
export function ShortcutsDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Keyboard shortcuts"
      actions={
        <Button variant="primary" onClick={onClose}>
          Close
        </Button>
      }
    >
      <div className="shortcuts">
        {SHORTCUT_GROUPS.map((group) => (
          <section key={group.title} className="shortcuts__group">
            <h3 className="shortcuts__title">{group.title}</h3>
            <dl className="shortcuts__list">
              {group.shortcuts.map((shortcut) => (
                <div key={shortcut.action} className="shortcuts__row">
                  <dt>
                    {shortcut.keys.map((key, i) => (
                      <span key={`${key}-${i}`}>
                        {i > 0 ? ' ' : ''}
                        <Kbd>{key}</Kbd>
                      </span>
                    ))}
                  </dt>
                  <dd>{shortcut.action}</dd>
                </div>
              ))}
            </dl>
          </section>
        ))}
      </div>
    </Dialog>
  );
}
