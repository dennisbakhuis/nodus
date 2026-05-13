import { type ReactNode, useEffect, useRef } from "react";
import { useLocation } from "react-router-dom";

type Size = "default" | "full";

type Props = {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  ariaDescribedBy?: string;
  size?: Size;
  headerActions?: ReactNode;
  hideHeader?: boolean;
};

export function Modal({
  open,
  onClose,
  title,
  children,
  ariaDescribedBy,
  size = "default",
  headerActions,
  hideHeader = false,
}: Props) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const closeBtnRef = useRef<HTMLButtonElement>(null);
  const location = useLocation();
  const openLocationKeyRef = useRef<string | null>(null);

  // If the user navigates (via NavLink, back button, etc.) while the modal is
  // open, close it. Without this, an open dialog stays in the top layer over
  // the new page and silently absorbs subsequent header clicks, making the
  // top menu appear broken.
  useEffect(() => {
    if (open) {
      if (openLocationKeyRef.current === null) {
        openLocationKeyRef.current = location.key;
      } else if (openLocationKeyRef.current !== location.key) {
        onClose();
      }
    } else {
      openLocationKeyRef.current = null;
    }
  }, [open, location.key, onClose]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open) {
      if (!dialog.open) dialog.showModal();
      if (closeBtnRef.current) {
        closeBtnRef.current.focus();
      } else {
        // No header → focus the dialog itself so the browser doesn't pick
        // an arbitrary descendant and draw a focus ring around it.
        dialog.focus();
      }
    } else {
      if (dialog.open) dialog.close();
    }
  }, [open]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    const handleClose = () => onClose();
    dialog.addEventListener("close", handleClose);
    return () => dialog.removeEventListener("close", handleClose);
  }, [onClose]);

  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [open, onClose]);

  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [open]);

  if (!open) return null;

  const isFull = size === "full";

  const dialogStyle: React.CSSProperties = isFull
    ? {
        border: "none",
        borderRadius: "var(--radius-lg)",
        boxShadow: "var(--shadow-panel)",
        padding: 0,
        position: "fixed",
        inset: 0,
        width: "min(1280px, calc(100vw - 96px))",
        height: "min(900px, calc(100vh - 96px))",
        margin: "auto",
        maxWidth: "none",
        maxHeight: "none",
        backgroundColor: "var(--color-white)",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
      }
    : {
        border: "none",
        borderRadius: "var(--radius-lg)",
        boxShadow: "var(--shadow-panel)",
        padding: 0,
        position: "fixed",
        inset: 0,
        margin: "auto",
        maxWidth: "560px",
        width: "calc(100% - var(--space-8))",
        maxHeight: "calc(100vh - var(--space-8))",
        height: "fit-content",
        backgroundColor: "var(--color-white)",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
      };

  const headerStyle: React.CSSProperties = {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "var(--space-4) var(--space-6)",
    borderBottom: "1px solid var(--color-border)",
    backgroundColor: "var(--color-brand-dark-blue)",
    borderRadius: "var(--radius-lg) var(--radius-lg) 0 0",
    flexShrink: 0,
  };

  const bodyStyle: React.CSSProperties = isFull
    ? { padding: 0, flex: 1, overflow: "auto" }
    : { padding: "var(--space-6)" };

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby="modal-title"
      aria-describedby={ariaDescribedBy}
      tabIndex={-1}
      style={dialogStyle}
      onMouseDown={(e) => {
        // Backdrop dismiss: react on mousedown rather than click so the
        // subsequent click can land on whatever element ends up under the
        // cursor (e.g. a header NavLink) once the dialog is gone. The
        // synthetic ``click`` that follows a backdrop mousedown otherwise
        // targets the dialog and is swallowed by the top-layer overlay.
        if (e.button !== 0) return;
        if (e.target !== dialogRef.current) return;
        const x = e.clientX;
        const y = e.clientY;
        onClose();
        requestAnimationFrame(() => {
          const el = document.elementFromPoint(x, y);
          const anchor = el?.closest?.("a[href]");
          if (anchor instanceof HTMLAnchorElement) {
            anchor.click();
          }
        });
      }}
    >
      {!hideHeader && (
        <div style={headerStyle}>
          <h2
            id="modal-title"
            style={{
              fontSize: "var(--font-size-lg)",
              fontWeight: "var(--font-weight-bold)",
              color: "var(--color-white)",
              margin: 0,
              flex: 1,
              minWidth: 0,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {title}
          </h2>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "var(--space-3)",
            }}
          >
            {headerActions}
            <button
              ref={closeBtnRef}
              onClick={onClose}
              aria-label="Close modal"
              style={{
                background: "none",
                border: "none",
                color: "var(--color-white)",
                fontSize: "var(--font-size-xl)",
                cursor: "pointer",
                lineHeight: 1,
                // 36×36 hit target meets WCAG 2.5.5.
                width: 36,
                height: 36,
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                borderRadius: "var(--radius-md)",
                transition: "background-color var(--transition-fast)",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor =
                  "rgba(255, 255, 255, 0.15)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = "transparent";
              }}
            >
              ✕
            </button>
          </div>
        </div>
      )}
      <div style={bodyStyle}>{children}</div>
    </dialog>
  );
}
