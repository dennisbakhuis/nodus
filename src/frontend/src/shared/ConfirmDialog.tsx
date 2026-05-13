/**
 * Styled confirmation dialog.
 *
 * Replaces the browser's native ``window.confirm()`` (which can't be
 * styled, doesn't match the app's typography, and looks especially out
 * of place on dark themes / mobile). Built on top of shared/Modal so it
 * inherits the same focus management, escape-to-close, and overlay
 * dismiss behaviour.
 *
 * Usage:
 *
 *   const confirm = useConfirm();
 *   ...
 *   if (await confirm({ title: "Delete cycle?", body: "...", danger: true })) {
 *     deleteCycle();
 *   }
 *   ...
 *   <ConfirmDialogHost />   // mount once near the page root
 */

import {
  type ReactNode,
  createContext,
  useCallback,
  useContext,
  useState,
} from "react";
import { Modal } from "./Modal";

type ConfirmOptions = {
  title: string;
  body: ReactNode;
  /** Custom confirm button label. Defaults to "Confirm" / "Delete" when danger. */
  confirmLabel?: string;
  /** Custom cancel button label. Defaults to "Cancel". */
  cancelLabel?: string;
  /** Marks the confirm action as destructive — red button + "Delete" default. */
  danger?: boolean;
};

type ConfirmContextValue = (opts: ConfirmOptions) => Promise<boolean>;

const ConfirmContext = createContext<ConfirmContextValue | null>(null);

type DialogState = ConfirmOptions & {
  resolve: (value: boolean) => void;
};

type Props = {
  children: ReactNode;
};

export function ConfirmProvider({ children }: Props) {
  const [pending, setPending] = useState<DialogState | null>(null);

  const confirm = useCallback<ConfirmContextValue>((opts) => {
    return new Promise<boolean>((resolve) => {
      setPending({ ...opts, resolve });
    });
  }, []);

  const close = useCallback((result: boolean) => {
    setPending((curr) => {
      if (curr) curr.resolve(result);
      return null;
    });
  }, []);

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      {pending && (
        <Modal open={true} onClose={() => close(false)} title={pending.title}>
          <div
            style={{
              fontSize: "var(--font-size-body)",
              color: "var(--color-dark-text)",
              lineHeight: 1.5,
            }}
          >
            {pending.body}
          </div>
          <div
            style={{
              display: "flex",
              justifyContent: "flex-end",
              gap: "var(--space-3)",
              marginTop: "var(--space-6)",
            }}
          >
            <button
              type="button"
              onClick={() => close(false)}
              style={{
                padding: "var(--space-2) var(--space-4)",
                borderRadius: "var(--radius-md)",
                border: "1px solid var(--color-border)",
                background: "var(--color-white)",
                color: "var(--color-dark-text)",
                fontFamily: "var(--font-family)",
                fontSize: "var(--font-size-body)",
                cursor: "pointer",
              }}
            >
              {pending.cancelLabel ?? "Cancel"}
            </button>
            <button
              type="button"
              onClick={() => close(true)}
              autoFocus
              style={{
                padding: "var(--space-2) var(--space-4)",
                borderRadius: "var(--radius-md)",
                border: "1px solid",
                borderColor: pending.danger
                  ? "var(--color-danger)"
                  : "var(--color-brand-dark-blue)",
                background: pending.danger
                  ? "var(--color-danger)"
                  : "var(--color-brand-dark-blue)",
                color: "var(--color-white)",
                fontFamily: "var(--font-family)",
                fontSize: "var(--font-size-body)",
                fontWeight: "var(--font-weight-medium)",
                cursor: "pointer",
              }}
            >
              {pending.confirmLabel ?? (pending.danger ? "Delete" : "Confirm")}
            </button>
          </div>
        </Modal>
      )}
    </ConfirmContext.Provider>
  );
}

export function useConfirm(): ConfirmContextValue {
  const ctx = useContext(ConfirmContext);
  if (!ctx) {
    throw new Error("useConfirm must be used inside a <ConfirmProvider>");
  }
  return ctx;
}
