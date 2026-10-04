import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Button, Icon, type IconName, type Tone } from './index';
import { useToasts } from './toastStore';

/** The icon that says what kind of message this is, so the tone never rests on colour alone. */
const TONE_ICONS: Partial<Record<Tone, IconName>> = {
  success: 'check',
  info: 'info',
  warning: 'warning',
  danger: 'alert',
};

/** The modal dialog on top of the page, if one is open: toasts render inside it, where they stay reachable. */
function topMostOpenDialog(): HTMLDialogElement | null {
  const open = document.querySelectorAll<HTMLDialogElement>('dialog[open]');
  return open.length ? (open[open.length - 1] ?? null) : null;
}

/**
 * Keeps track of the open modal dialog. While one is open the rest of the
 * document is inert, so a toast fired from the dialog (a saved analysis, a
 * copied link) would be dimmed and unclickable behind the backdrop.
 */
function useToastHost(): HTMLDialogElement | null {
  const [host, setHost] = useState<HTMLDialogElement | null>(null);
  useEffect(() => {
    const update = () => setHost(topMostOpenDialog());
    update();
    const observer = new MutationObserver(update);
    observer.observe(document.body, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ['open'],
    });
    return () => observer.disconnect();
  }, []);
  return host;
}

export function Toasts() {
  const toasts = useToasts((s) => s.toasts);
  const dismiss = useToasts((s) => s.dismiss);
  const host = useToastHost();

  // The live region is always in the document, so the first toast is announced too.
  const region = (
    <div className="toasts" aria-live="polite" data-testid="toasts">
      {toasts.map((t) => {
        const tone = t.tone ?? 'neutral';
        const icon = TONE_ICONS[tone];
        return (
          <div
            key={t.id}
            className={icon ? `toast toast--${tone}` : 'toast'}
            role={tone === 'danger' ? 'alert' : undefined}
            data-tone={tone}
          >
            {icon ? (
              <span className="toast__icon">
                <Icon name={icon} size={20} />
              </span>
            ) : null}
            <span className="toast__body">{t.message}</span>
            {t.actionLabel ? (
              <Button
                size="sm"
                variant="primary"
                onClick={() => {
                  t.onAction?.();
                  dismiss(t.id);
                }}
              >
                {t.actionLabel}
              </Button>
            ) : null}
            <Button
              size="sm"
              variant="ghost"
              icon
              aria-label="Dismiss"
              onClick={() => dismiss(t.id)}
            >
              <Icon name="close" size={18} />
            </Button>
          </div>
        );
      })}
    </div>
  );

  return host ? createPortal(region, host) : region;
}
