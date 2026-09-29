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

export const useToasts = create<ToastState>((set, get) => ({
  toasts: [],
  push: (toast) => {
    const id = nextId++;
    const duration = toast.duration ?? 4000;
    set({ toasts: [...get().toasts, { ...toast, id, duration }] });
    if (duration > 0) {
      setTimeout(() => get().dismiss(id), duration);
    }
    return id;
  },
  dismiss: (id) => set({ toasts: get().toasts.filter((t) => t.id !== id) }),
}));

export function toast(message: string, options: Partial<Omit<Toast, 'id' | 'message'>> = {}) {
  return useToasts.getState().push({ message, ...options });
}
