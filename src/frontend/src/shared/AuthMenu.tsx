import { useEffect, useRef, useState } from "react";
import { Button } from "./Button";
import { useAuth } from "./AuthContext";
import { LoginPopover } from "./LoginPopover";
import { MfaSetupPanel } from "./MfaSetupPanel";
import { getInitials } from "./initials";
import { getSetting } from "../api/settings";

const HIDE_LOCAL_ADMIN_BADGE_KEY = "auth.hide_local_admin_badge";

const ROLE_LABEL: Record<string, string> = {
  public_reader: "Public",
  reader: "Reader",
  writer: "Writer",
  admin: "Admin",
};

export function AuthMenu() {
  const { user, logout, authEnabled } = useAuth();
  const [loginOpen, setLoginOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [mfaOpen, setMfaOpen] = useState(false);
  const [hideLocalAdminBadge, setHideLocalAdminBadge] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const signInBtnRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (authEnabled) return;
    let cancelled = false;
    getSetting(HIDE_LOCAL_ADMIN_BADGE_KEY)
      .then((s) => {
        if (!cancelled) setHideLocalAdminBadge(s.value === "true");
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [authEnabled]);

  useEffect(() => {
    if (!menuOpen) return;
    function onClick(e: MouseEvent) {
      if (!wrapRef.current?.contains(e.target as Node)) setMenuOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setMenuOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [menuOpen]);

  if (!authEnabled) {
    if (hideLocalAdminBadge) return null;
    return (
      <span
        title="Authentication is disabled via NODUS_AUTH_DISABLED. Every request runs as a synthetic local admin. Do not use this mode in production."
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 6,
          fontSize: "var(--font-size-sm)",
          fontWeight: "var(--font-weight-medium)",
          color: "var(--color-white)",
          background: "rgba(255, 100, 40, 0.18)",
          border: "1px solid rgba(255, 100, 40, 0.55)",
          padding: "var(--space-1) var(--space-3)",
          borderRadius: "var(--radius-md)",
          fontFamily: "var(--font-family)",
          letterSpacing: "0.02em",
        }}
      >
        <span
          aria-hidden
          style={{
            width: 6,
            height: 6,
            borderRadius: "50%",
            background: "rgb(255, 140, 80)",
          }}
        />
        Auth disabled — local admin
      </span>
    );
  }

  if (!user) {
    return (
      <div style={{ position: "relative" }}>
        <Button
          ref={signInBtnRef}
          type="button"
          variant="header"
          size="xs"
          active={loginOpen}
          onClick={() => setLoginOpen((o) => !o)}
        >
          Sign in
        </Button>
        <LoginPopover
          open={loginOpen}
          onClose={() => setLoginOpen(false)}
          anchorRef={signInBtnRef}
        />
      </div>
    );
  }

  const initials = getInitials(user.first_name, user.last_name);

  return (
    <div ref={wrapRef} style={{ position: "relative" }}>
      <button
        type="button"
        onClick={() => setMenuOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={menuOpen}
        aria-label={`Account menu for ${user.first_name} ${user.last_name}`}
        style={{
          width: 32,
          height: 32,
          borderRadius: "50%",
          border: "none",
          background: "var(--color-brand-bright-blue, #2d8bc9)",
          color: "var(--color-white)",
          fontSize: "13px",
          fontWeight: "var(--font-weight-bold)",
          fontFamily: "var(--font-family)",
          letterSpacing: "0.02em",
          cursor: "pointer",
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          padding: 0,
        }}
      >
        {initials}
      </button>

      {menuOpen && (
        <div
          role="menu"
          style={{
            position: "absolute",
            top: "calc(100% + 8px)",
            right: 0,
            minWidth: 220,
            background: "var(--color-white)",
            color: "var(--color-dark-text)",
            border: "1px solid var(--color-border)",
            borderRadius: "var(--radius-md)",
            boxShadow: "var(--shadow-lg)",
            padding: "var(--space-3)",
            zIndex: 1000,
            fontFamily: "var(--font-family)",
          }}
        >
          <div
            style={{
              fontSize: "var(--font-size-body)",
              fontWeight: "var(--font-weight-bold)",
              color: "var(--color-dark-text)",
            }}
          >
            {user.first_name} {user.last_name}
          </div>
          <div
            style={{
              fontSize: "var(--font-size-sm)",
              color: "var(--color-muted-text)",
              marginBottom: "var(--space-2)",
            }}
          >
            @{user.username}
          </div>
          <div
            style={{
              display: "flex",
              gap: 6,
              flexWrap: "wrap",
              marginBottom: "var(--space-3)",
            }}
          >
            <span
              style={{
                display: "inline-block",
                fontSize: "10px",
                fontWeight: "var(--font-weight-bold)",
                textTransform: "uppercase",
                letterSpacing: "0.05em",
                padding: "2px 8px",
                borderRadius: "10px",
                background: "var(--color-page-background)",
                color: "var(--color-brand-dark-blue)",
              }}
            >
              {ROLE_LABEL[user.role] ?? user.role}
            </span>
            <span
              title={
                user.mfa_enabled
                  ? "Two-factor authentication is enabled"
                  : "Two-factor authentication is not enabled"
              }
              style={{
                display: "inline-block",
                fontSize: "10px",
                fontWeight: "var(--font-weight-bold)",
                textTransform: "uppercase",
                letterSpacing: "0.05em",
                padding: "2px 8px",
                borderRadius: "10px",
                background: user.mfa_enabled
                  ? "rgba(20,140,80,0.15)"
                  : "var(--color-page-background)",
                color: user.mfa_enabled
                  ? "rgb(20,100,60)"
                  : "var(--color-muted-text)",
              }}
            >
              {user.mfa_enabled ? "2FA on" : "2FA off"}
            </span>
          </div>

          <button
            type="button"
            onClick={() => {
              setMenuOpen(false);
              setMfaOpen(true);
            }}
            style={{
              display: "block",
              width: "100%",
              textAlign: "left",
              background: "transparent",
              border: "1px solid var(--color-border)",
              borderRadius: "var(--radius-md)",
              padding: "var(--space-2) var(--space-3)",
              fontSize: "var(--font-size-sm)",
              fontFamily: "var(--font-family)",
              color: "var(--color-dark-text)",
              cursor: "pointer",
              marginBottom: "var(--space-2)",
            }}
          >
            {user.mfa_enabled ? "Manage 2FA" : "Set up 2FA"}
          </button>

          <button
            type="button"
            onClick={() => {
              setMenuOpen(false);
              void logout();
            }}
            style={{
              display: "block",
              width: "100%",
              textAlign: "left",
              background: "transparent",
              border: "1px solid var(--color-border)",
              borderRadius: "var(--radius-md)",
              padding: "var(--space-2) var(--space-3)",
              fontSize: "var(--font-size-sm)",
              fontFamily: "var(--font-family)",
              color: "var(--color-dark-text)",
              cursor: "pointer",
            }}
          >
            Sign out
          </button>
        </div>
      )}

      <MfaSetupPanel open={mfaOpen} onClose={() => setMfaOpen(false)} />
    </div>
  );
}
