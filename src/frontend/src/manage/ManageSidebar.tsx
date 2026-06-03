import { NavLink } from "react-router-dom";
import { useAuth } from "../shared/AuthContext";
import { NodusFooterLink } from "../shared/NodusFooterLink";
import { ResizeHandle, useResizableWidth } from "../shared/useResizableWidth";
import { MANAGE_NAV } from "./manageNav";

export function ManageSidebar() {
  const { isAdmin } = useAuth();
  const visible = MANAGE_NAV.filter((i) => i.role !== "admin" || isAdmin);
  const { width, onPointerDown, reset } = useResizableWidth(
    "manage.sidebar.width",
    { min: 200, max: 400, initial: 200 },
  );

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

      <ResizeHandle onPointerDown={onPointerDown} onDoubleClick={reset} />
    </aside>
  );
}
