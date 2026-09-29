import { Button } from './index';
import { useToasts } from './toastStore';

export function Toasts() {
  const toasts = useToasts((s) => s.toasts);
  const dismiss = useToasts((s) => s.dismiss);
  if (toasts.length === 0) return null;
  return (
    <div className="toasts" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className="toast" role="status">
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
          <Button size="sm" variant="ghost" icon aria-label="Dismiss" onClick={() => dismiss(t.id)}>
            ×
          </Button>
        </div>
      ))}
    </div>
  );
}
