import {
  type ButtonHTMLAttributes,
  type ComponentProps,
  type HTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  useEffect,
  useId,
  useRef,
} from 'react';
import { Link, type LinkProps } from 'react-router-dom';
import './ui.css';

/* ------------------------------------------------------------------ */
/* Button                                                             */
/* ------------------------------------------------------------------ */
type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
type ButtonSize = 'sm' | 'md' | 'lg';

interface ButtonBaseProps {
  variant?: ButtonVariant;
  size?: ButtonSize;
  block?: boolean;
  icon?: boolean;
  loading?: boolean;
}

export type ButtonProps = ButtonBaseProps & ButtonHTMLAttributes<HTMLButtonElement>;

function buttonClass({
  variant = 'secondary',
  size = 'md',
  block,
  icon,
  className,
}: ButtonBaseProps & { className?: string }) {
  return [
    'btn',
    `btn--${variant}`,
    size !== 'md' && `btn--${size}`,
    block && 'btn--block',
    icon && 'btn--icon',
    className,
  ]
    .filter(Boolean)
    .join(' ');
}

export function Button({
  variant,
  size,
  block,
  icon,
  loading,
  className,
  children,
  disabled,
  type = 'button',
  ...rest
}: ButtonProps) {
  return (
    <button
      type={type}
      className={buttonClass({ variant, size, block, icon, className })}
      disabled={(disabled ?? false) || (loading ?? false)}
      aria-busy={loading ? true : undefined}
      {...rest}
    >
      {loading ? <span className="spinner" aria-hidden="true" /> : null}
      {children}
    </button>
  );
}

export type LinkButtonProps = ButtonBaseProps & LinkProps;

export function LinkButton({
  variant,
  size,
  block,
  icon,
  className,
  children,
  ...rest
}: LinkButtonProps) {
  return (
    <Link className={buttonClass({ variant, size, block, icon, className })} {...rest}>
      {children}
    </Link>
  );
}

/* ------------------------------------------------------------------ */
/* Card                                                               */
/* ------------------------------------------------------------------ */
export function Card({
  children,
  className,
  as: Tag = 'div',
  ...rest
}: {
  children: ReactNode;
  className?: string;
  as?: 'div' | 'section' | 'article';
} & Omit<HTMLAttributes<HTMLElement>, 'className' | 'children'>) {
  return (
    <Tag className={['card', className].filter(Boolean).join(' ')} {...rest}>
      {children}
    </Tag>
  );
}

export function CardLink({
  to,
  children,
  className,
}: {
  to: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <Link to={to} className={['card', 'card--interactive', className].filter(Boolean).join(' ')}>
      {children}
    </Link>
  );
}

/* ------------------------------------------------------------------ */
/* Badge / Stat / Alert                                               */
/* ------------------------------------------------------------------ */
export type Tone = 'neutral' | 'accent' | 'success' | 'warning' | 'danger' | 'info';

export function Badge({
  tone = 'neutral',
  children,
  className,
}: {
  tone?: Tone;
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={['badge', tone !== 'neutral' && `badge--${tone}`, className]
        .filter(Boolean)
        .join(' ')}
    >
      {children}
    </span>
  );
}

export function Stat({ value, label }: { value: ReactNode; label: ReactNode }) {
  return (
    <div className="stat">
      <span className="stat__value">{value}</span>
      <span className="stat__label">{label}</span>
    </div>
  );
}

export function Alert({
  tone = 'neutral',
  children,
  role = 'status',
}: {
  tone?: Tone;
  children: ReactNode;
  role?: 'status' | 'alert';
}) {
  return (
    <div
      role={role}
      className={['alert', tone !== 'neutral' && `alert--${tone}`].filter(Boolean).join(' ')}
    >
      {children}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Progress                                                           */
/* ------------------------------------------------------------------ */
export function ProgressBar({
  value,
  max = 1,
  label,
}: {
  value: number;
  max?: number;
  label?: string;
}) {
  const pct = max > 0 ? Math.min(100, Math.max(0, (value / max) * 100)) : 0;
  return (
    <div
      className="progress"
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={max}
      aria-valuenow={value}
      aria-label={label}
    >
      <div className="progress__fill" style={{ width: `${pct}%` }} />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Form controls                                                      */
/* ------------------------------------------------------------------ */
export function Field({
  label,
  hint,
  children,
}: {
  label: ReactNode;
  hint?: ReactNode;
  children: (id: string) => ReactNode;
}) {
  const id = useId();
  return (
    <div className="field">
      <label className="field__label" htmlFor={id}>
        {label}
      </label>
      {children(id)}
      {hint ? <span className="field__hint">{hint}</span> : null}
    </div>
  );
}

export function Select(props: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select className="select" {...props} />;
}

export function Input({ className, ...props }: ComponentProps<'input'>) {
  return <input className={className ? `input ${className}` : 'input'} {...props} />;
}

export function Switch({
  checked,
  onChange,
  label,
  description,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  label: ReactNode;
  description?: ReactNode;
}) {
  return (
    <label className="switch">
      <input
        type="checkbox"
        role="switch"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span className="switch__track" aria-hidden="true">
        <span className="switch__thumb" />
      </span>
      <span className="switch__label">
        <span>{label}</span>
        {description ? <small>{description}</small> : null}
      </span>
    </label>
  );
}

export function Segmented<T extends string | number>({
  value,
  options,
  onChange,
  ariaLabel,
}: {
  value: T;
  options: { value: T; label: ReactNode }[];
  onChange: (value: T) => void;
  ariaLabel: string;
}) {
  return (
    <div className="segmented" role="group" aria-label={ariaLabel}>
      {options.map((opt) => (
        <button
          key={String(opt.value)}
          type="button"
          className="segmented__option"
          aria-pressed={opt.value === value}
          onClick={() => onChange(opt.value)}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Dialog (native <dialog>)                                           */
/* ------------------------------------------------------------------ */
export function Dialog({
  open,
  onClose,
  title,
  children,
  actions,
  dismissible = true,
  wide = false,
}: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  children: ReactNode;
  actions?: ReactNode;
  /** Allow closing with Escape / backdrop click. */
  dismissible?: boolean;
  /** Use most of the viewport width (for editors and tables). */
  wide?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (open && !el.open) el.showModal();
    if (!open && el.open) el.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      className={wide ? 'dialog dialog--wide' : 'dialog'}
      aria-labelledby={titleId}
      onClose={onClose}
      onCancel={(e) => {
        if (!dismissible) e.preventDefault();
      }}
      onClick={(e) => {
        if (dismissible && e.target === ref.current) onClose();
      }}
    >
      <div className="dialog__body">
        <h2 className="dialog__title" id={titleId}>
          {title}
        </h2>
        {children}
        {actions ? <div className="dialog__actions">{actions}</div> : null}
      </div>
    </dialog>
  );
}

/* ------------------------------------------------------------------ */
/* Misc                                                               */
/* ------------------------------------------------------------------ */
export function Spinner({ label = 'Loading' }: { label?: string }) {
  return (
    <span className="row" role="status">
      <span className="spinner" aria-hidden="true" />
      <span className="small muted">{label}</span>
    </span>
  );
}

export function Kbd({ children }: { children: ReactNode }) {
  return <kbd className="kbd">{children}</kbd>;
}

export function EmptyState({
  icon,
  title,
  children,
}: {
  icon?: ReactNode;
  title: ReactNode;
  children?: ReactNode;
}) {
  return (
    <div className="empty">
      {icon ? (
        <div className="empty__icon" aria-hidden="true">
          {icon}
        </div>
      ) : null}
      <h3>{title}</h3>
      {children}
    </div>
  );
}
