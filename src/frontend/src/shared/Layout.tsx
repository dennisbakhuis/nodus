import { useEffect, useState, type ReactNode } from "react";
import { NavLink } from "react-router-dom";
import { Button } from "./Button";
import { useRadarCycle } from "./RadarCycleContext";
import { useAuth } from "./AuthContext";
import { AuthMenu } from "./AuthMenu";
import { useExportTarget } from "./ExportContext";
import { useAddAction } from "./AddActionContext";
import { useDemoMode } from "./DemoModeContext";
import { ExportMenu } from "../radar/ExportMenu";
import { DataExportMenu } from "../radar/DataExportMenu";
import { HelpButton } from "../help/HelpButton";
import { HelpPanel } from "../help/HelpPanel";

function usePrefersReducedMotion(): boolean {
  const [prefers, setPrefers] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setPrefers(mq.matches);
    const onChange = (e: MediaQueryListEvent) => setPrefers(e.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);
  return prefers;
}

type Props = {
  children: ReactNode;
};

export function Layout({ children }: Props) {
  const [navOpen, setNavOpen] = useState(false);
  const { fullBleed } = useRadarCycle();
  const { isWriter } = useAuth();
  const { target: exportTarget } = useExportTarget();
  const { target: addTarget } = useAddAction();
  const { target: demoTarget } = useDemoMode();
  const reducedMotion = usePrefersReducedMotion();
  const showDemoBtn = !!demoTarget && !reducedMotion;
  const navItems = isWriter
    ? (["Radar", "List", "Manage"] as const)
    : (["Radar", "List"] as const);

  return (
    <div
      className="app-shell"
      style={{ height: "100vh", display: "flex", flexDirection: "column" }}
    >
      <header
        className="app-header"
        style={{
          backgroundColor: "var(--color-brand-dark-blue)",
          color: "var(--color-white)",
          padding: "0 var(--space-6)",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          height: "56px",
          boxShadow: "var(--shadow-md)",
          position: "sticky",
          top: 0,
          zIndex: "var(--z-above)",
        }}
      >
        <div
          className="app-header__brand"
          style={{
            display: "flex",
            alignItems: "center",
            gap: "var(--space-1)",
          }}
        >
          <img
            src="/nodus_mark.svg"
            alt=""
            aria-hidden="true"
            style={{ height: "32px", width: "32px", display: "block" }}
          />
          <span
            style={{
              fontSize: "var(--font-size-md)",
              fontWeight: "var(--font-weight-bold)",
              color: "var(--color-white)",
              letterSpacing: "0.02em",
            }}
          >
            Nodus
          </span>
        </div>

        <button
          className="app-header__menu-toggle"
          aria-label={navOpen ? "Close navigation" : "Open navigation"}
          aria-expanded={navOpen}
          aria-controls="app-nav"
          onClick={() => setNavOpen((o) => !o)}
          style={{
            display: "none",
            background: "none",
            border: "none",
            color: "var(--color-white)",
            fontSize: "var(--font-size-xl)",
            cursor: "pointer",
            padding: "var(--space-2)",
          }}
        >
          {navOpen ? "✕" : "☰"}
        </button>

        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "var(--space-4)",
          }}
        >
          <nav
            id="app-nav"
            aria-label="Main navigation"
            className="app-header__nav"
            style={{
              display: "flex",
              gap: "var(--space-1)",
            }}
          >
            {navItems.map((label) => (
              <NavLink
                key={label}
                to={`/${label.toLowerCase()}`}
                style={({ isActive }) => ({
                  color: "var(--color-white)",
                  textDecoration: "none",
                  padding: "var(--space-2) var(--space-3)",
                  borderRadius: "var(--radius-md)",
                  fontWeight: isActive
                    ? "var(--font-weight-bold)"
                    : "var(--font-weight-regular)",
                  borderBottom: isActive
                    ? "2px solid var(--color-brand-orange)"
                    : "2px solid transparent",
                  fontSize: "var(--font-size-body)",
                  transition: "background-color var(--transition-fast)",
                  backgroundColor: isActive
                    ? "rgba(255,255,255,0.1)"
                    : "transparent",
                })}
              >
                {label}
              </NavLink>
            ))}
          </nav>
          <div
            style={{
              minWidth: 150,
              display: "flex",
              justifyContent: "flex-end",
              alignItems: "center",
              gap: "var(--space-2)",
            }}
          >
            {showDemoBtn && demoTarget && (
              <div style={{ position: "relative", display: "inline-flex" }}>
                <Button
                  type="button"
                  variant="header"
                  size="xs"
                  active={demoTarget.running}
                  onClick={demoTarget.onClick}
                  title={
                    demoTarget.running
                      ? "Stop presentation mode"
                      : "Start presentation mode"
                  }
                  aria-label={
                    demoTarget.running
                      ? "Stop presentation mode"
                      : "Start presentation mode"
                  }
                >
                  {demoTarget.running ? "⏸ Stop" : "▶ Demo"}
                </Button>
                {demoTarget.dwell && (
                  <div
                    aria-hidden="true"
                    style={{
                      position: "absolute",
                      left: 0,
                      right: 0,
                      bottom: -6,
                      height: 3,
                      borderRadius: 2,
                      background: "rgba(255,255,255,0.18)",
                      overflow: "hidden",
                      pointerEvents: "none",
                    }}
                  >
                    <div
                      key={demoTarget.dwell.key}
                      style={{
                        height: "100%",
                        width: "100%",
                        background: "var(--color-brand-orange)",
                        transformOrigin: "left center",
                        animation: `nodus-demo-timer ${demoTarget.dwell.duration}ms linear forwards`,
                      }}
                    />
                  </div>
                )}
              </div>
            )}
            {addTarget && isWriter && (
              <Button
                type="button"
                variant="header"
                size="xs"
                onClick={addTarget.onClick}
                title="Add a new technology"
              >
                + Add
              </Button>
            )}
            {exportTarget?.mode === "radar" && (
              <ExportMenu
                svgRef={exportTarget.svgRef}
                data={exportTarget.data}
                variant="header"
              />
            )}
            {exportTarget?.mode === "data" && (
              <DataExportMenu
                data={exportTarget.data}
                filteredEntries={exportTarget.filteredEntries}
                selectedEntries={exportTarget.selectedEntries}
                variant="header"
              />
            )}
            <HelpButton />
            <AuthMenu />
          </div>
        </div>
      </header>

      <main
        className="app-main"
        style={{
          flex: 1,
          minHeight: 0,
          display: "flex",
          flexDirection: "column",
          padding: fullBleed ? 0 : "var(--space-6)",
          maxWidth: fullBleed ? "none" : "1440px",
          width: "100%",
          margin: fullBleed ? 0 : "0 auto",
          overflow: "hidden",
        }}
      >
        {children}
      </main>

      <HelpPanel />

      <style>{`
        @keyframes nodus-demo-timer {
          from { transform: scaleX(1); }
          to { transform: scaleX(0); }
        }
        @media (max-width: 640px) {
          .app-header__menu-toggle { display: block !important; }
          #app-nav {
            display: ${navOpen ? "flex" : "none"} !important;
            flex-direction: column;
            position: absolute;
            top: 56px;
            left: 0;
            right: 0;
            transform: none !important;
            background-color: var(--color-brand-dark-blue);
            padding: var(--space-4);
            z-index: var(--z-dropdown);
            box-shadow: var(--shadow-lg);
          }
        }
      `}</style>
    </div>
  );
}
