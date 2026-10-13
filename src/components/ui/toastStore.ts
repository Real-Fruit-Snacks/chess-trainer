import { create } from 'zustand';
import type { Tone } from './index';

export interface Toast {
  id: number;
  message: string;
  tone?: Tone;
  actionLabel?: string;
  onAction?: () => void;
  /** Auto-dismiss after this many ms; 0 keeps it until dismissed. */
  duration: number;
}

interface ToastState {
  toasts: Toast[];
  push: (toast: Omit<Toast, 'id' | 'duration'> & { duration?: number }) => number;
  dismiss: (id: number) => void;
}

let nextId = 1;
/** The pending auto-dismiss per toast, so a dismissal or a repeat can cancel it. */
const timers = new Map<number, ReturnType<typeof setTimeout>>();

function clearTimer(id: number): void {
  const timer = timers.get(id);
  if (timer !== undefined) clearTimeout(timer);
  timers.delete(id);
}

export const useToasts = create<ToastState>((set, get) => ({
  toasts: [],
  push: (toast) => {
    const duration = toast.duration ?? 4000;
    // The same message again (a shortcut pressed twice, a retried save) refreshes
    // the toast on screen instead of stacking a copy under it.
    const existing = get().toasts.find(
      (t) => t.message === toast.message && (t.tone ?? 'neutral') === (toast.tone ?? 'neutral'),
    );
    const id = existing?.id ?? nextId++;
    if (existing) {
      clearTimer(id);
      set({
        toasts: get().toasts.map((t) => (t.id === id ? { ...t, ...toast, id, duration } : t)),
      });
    } else {
      set({ toasts: [...get().toasts, { ...toast, id, duration }] });
    }
    if (duration > 0) {
      timers.set(
        id,
        setTimeout(() => get().dismiss(id), duration),
      );
    }
    return id;
  },
  dismiss: (id) => {
    clearTimer(id);
    set({ toasts: get().toasts.filter((t) => t.id !== id) });
  },
}));

export function toast(message: string, options: Partial<Omit<Toast, 'id' | 'message'>> = {}) {
  return useToasts.getState().push({ message, ...options });
}
