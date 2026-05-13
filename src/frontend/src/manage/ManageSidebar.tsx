import { useCallback, useEffect, useState } from "react";
import { NavLink } from "react-router-dom";
import { useAuth } from "../shared/AuthContext";
import { NodusFooterLink } from "../shared/NodusFooterLink";

type Item = {
  to: string;
  label: string;
  adminOnly?: boolean;
};

const ITEMS: Item[] = [
  { to: "/manage/cycles", label: "Cycles" },
  { to: "/manage/segments", label: "Segments", adminOnly: true },
  { to: "/manage/persons", label: "People" },
  { to: "/manage/users", label: "Users", adminOnly: true },
  { to: "/manage/visibility", label: "Data Visibility", adminOnly: true },
  { to: "/manage/backup", label: "Backup & Restore", adminOnly: true },
  { to: "/manage/import", label: "Import References" },
  { to: "/manage/settings", label: "Settings" },
  { to: "/manage/api", label: "API", adminOnly: true },
];

const WIDTH_KEY = "manage.sidebar.width";
const MIN_WIDTH = 200;
const MAX_WIDTH = 400;

function readSavedWidth(): number {
  try {
    const raw = localStorage.getItem(WIDTH_KEY);
    if (!raw) return MIN_WIDTH;
    const n = Number(raw);
    if (!Number.isFinite(n)) return MIN_WIDTH;
    return Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, n));
  } catch {
    return MIN_WIDTH;
  }
}

export function ManageSidebar() {
  const { isAdmin } = useAuth();
  const visible = ITEMS.filter((i) => !i.adminOnly || isAdmin);
  const [width, setWidth] = useState<number>(readSavedWidth);
  const [dragging, setDragging] = useState(false);

  useEffect(() => {
    try {
      localStorage.setItem(WIDTH_KEY, String(width));
    } catch {
      /* ignore */
    }
  }, [width]);

  // Body cursor/userSelect ride a real lifecycle: applied when dragging
  // starts, reverted in the cleanup. If the component unmounts mid-drag
  // (e.g. user navigates away during a resize), the cleanup still fires
  // and restores the page state. Previously these were toggled inline in
  // a pointerup handler that could be missed if the pointer was released
  // outside the window.
  useEffect(() => {
    if (!dragging) return;
    const previousUserSelect = document.body.style.userSelect;
    const previousCursor = document.body.style.cursor;
    document.body.style.userSelect = "none";
    document.body.style.cursor = "col-resize";
    return () => {
      document.body.style.userSelect = previousUserSelect;
      document.body.style.cursor = previousCursor;
    };
  }, [dragging]);

  const onPointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      e.preventDefault();
      const handle = e.currentTarget;
      const pointerId = e.pointerId;
      handle.setPointerCapture(pointerId);
      setDragging(true);
      const startX = e.clientX;
      const startWidth = width;
      const onMove = (ev: PointerEvent) => {
        const next = Math.max(
          MIN_WIDTH,
          Math.min(MAX_WIDTH, startWidth + (ev.clientX - startX)),
        );
        setWidth(next);
      };
      const stop = () => {
        setDragging(false);
        try {
          handle.releasePointerCapture(pointerId);
        } catch {
          /* already released */
        }
        handle.removeEventListener("pointermove", onMove);
        handle.removeEventListener("pointerup", stop);
        handle.removeEventListener("pointercancel", stop);
      };
      handle.addEventListener("pointermove", onMove);
      handle.addEventListener("pointerup", stop);
      handle.addEventListener("pointercancel", stop);
    },
    [width],
  );

  function resetWidth() {
    setWidth(MIN_WIDTH);
  }

  return (
    <aside
      style={{
        width,
        flexShrink: 0,
        background: "var(--color-white)",
        borderRight: "1px solid var(--color-ring-boundary)",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
        position: "relative",
      }}
    >
      <nav
        aria-label="Manage navigation"
        style={{
          flex: 1,
          minHeight: 0,
          overflowY: "auto",
          display: "flex",
          flexDirection: "column",
          padding: "var(--space-4) 0",
        }}
      >
        {visible.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            style={({ isActive }) => ({
              padding: "var(--space-2) var(--space-4)",
              color: isActive
                ? "var(--color-brand-dark-blue)"
                : "var(--color-dark-text)",
              textDecoration: "none",
              fontSize: "var(--font-size-body)",
              fontWeight: isActive
                ? "var(--font-weight-bold)"
                : "var(--font-weight-regular)",
              backgroundColor: isActive ? "rgba(0,53,132,0.08)" : "transparent",
              borderLeft: isActive
                ? "3px solid var(--color-brand-orange)"
                : "3px solid transparent",
            })}
          >
            {item.label}
          </NavLink>
        ))}
      </nav>

      <NodusFooterLink />

      <div
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize sidebar"
        title="Drag to resize · double-click to reset"
        onPointerDown={onPointerDown}
        onDoubleClick={resetWidth}
        style={{
          position: "absolute",
          top: 0,
          right: -3,
          bottom: 0,
          width: 6,
          cursor: "col-resize",
          zIndex: 1,
        }}
      />
    </aside>
  );
}
