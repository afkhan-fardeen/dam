"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { IconAlertTriangle, IconCheck, IconInfoCircle, IconX } from "@tabler/icons-react";

export type ToastKind = "success" | "error" | "info";

export type ToastItem = {
  id: string;
  kind: ToastKind;
  message: string;
};

type ToastContextValue = {
  toast: {
    success: (message: string) => void;
    error: (message: string) => void;
    info: (message: string) => void;
  };
};

const ToastContext = createContext<ToastContextValue | null>(null);

const MAX_TOASTS = 3;
const TTL_MS = 3200;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);

  const push = useCallback((kind: ToastKind, message: string) => {
    const id = `t-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    setItems((prev) => [...prev, { id, kind, message }].slice(-MAX_TOASTS));
    window.setTimeout(() => {
      setItems((prev) => prev.filter((t) => t.id !== id));
    }, TTL_MS);
  }, []);

  const dismiss = useCallback((id: string) => {
    setItems((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const value = useMemo(
    () => ({
      toast: {
        success: (message: string) => push("success", message),
        error: (message: string) => push("error", message),
        info: (message: string) => push("info", message),
      },
    }),
    [push],
  );

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="xp-toast-stack" aria-live="polite" aria-relevant="additions">
        {items.map((t) => (
          <div key={t.id} className={`xp-toast xp-toast-${t.kind}`} role="status">
            <span className="xp-toast-icon" aria-hidden>
              {t.kind === "success" ? (
                <IconCheck size={16} stroke={2} />
              ) : t.kind === "error" ? (
                <IconAlertTriangle size={16} stroke={1.75} />
              ) : (
                <IconInfoCircle size={16} stroke={1.75} />
              )}
            </span>
            <p className="xp-toast-msg">{t.message}</p>
            <button
              type="button"
              className="xp-toast-close"
              aria-label="Dismiss"
              onClick={() => dismiss(t.id)}
            >
              <IconX size={14} />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    throw new Error("useToast must be used within ToastProvider");
  }
  return ctx.toast;
}
