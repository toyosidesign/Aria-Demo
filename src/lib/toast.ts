import { create } from 'zustand';

export type ToastIcon = 'check' | 'trash' | 'clock' | 'alarm' | 'undo' | 'plus';

interface ToastState {
  /** Bumped on every show() so the host can restart its timer/animation. */
  id: number;
  message: string | null;
  icon: ToastIcon;
  show: (message: string, icon?: ToastIcon) => void;
  hide: () => void;
}

export const useToast = create<ToastState>((set) => ({
  id: 0,
  message: null,
  icon: 'check',
  show: (message, icon = 'check') => set((s) => ({ id: s.id + 1, message, icon })),
  hide: () => set({ message: null }),
}));

/** Fire a toast from anywhere (including non-React code like store actions). */
export const showToast = (message: string, icon?: ToastIcon) =>
  useToast.getState().show(message, icon);
