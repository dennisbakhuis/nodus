import { useEffect, useRef, useState } from "react";
import { Button } from "./Button";
import { Input } from "./Input";
import { useAuth } from "./AuthContext";

type Props = {
  open: boolean;
  onClose: () => void;
  /** Element the popover should anchor to / avoid closing on outside-click. */
  anchorRef: React.RefObject<HTMLElement | null>;
};

type Step = "creds" | "mfa";

/** Lightweight floating sign-in form anchored next to the Sign in button.
 * Not a `<dialog>` — there's no backdrop and the rest of the page stays
 * interactive. Click outside or Escape dismisses.
 */
export function LoginPopover({ open, onClose, anchorRef }: Props) {
  const { login, loginMfa, providers } = useAuth();
  const wrapRef = useRef<HTMLDivElement>(null);
  const [step, setStep] = useState<Step>("creds");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [mfaToken, setMfaToken] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [entraStarting, setEntraStarting] = useState(false);

  const entraEnabled = providers.includes("entra");

  async function startEntraSignIn() {
    setEntraStarting(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/entra/start", {
        credentials: "include",
      });
      if (!res.ok) throw new Error(`Entra start failed (${res.status})`);
      const body = (await res.json()) as { authorize_url: string };
      window.location.href = body.authorize_url;
    } catch {
      setEntraStarting(false);
      setError("Could not start Microsoft sign-in. Try the local form below.");
    }
  }

  useEffect(() => {
    if (!open) {
      // Reset on close so the next open starts clean.
      setStep("creds");
      setUsername("");
      setPassword("");
      setCode("");
      setMfaToken(null);
      setError(null);
      setSubmitting(false);
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function onClick(e: MouseEvent) {
      const target = e.target as Node;
      if (wrapRef.current?.contains(target)) return;
      if (anchorRef.current?.contains(target)) return;
      onClose();
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, onClose, anchorRef]);

  if (!open) return null;

  async function handleCredsSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const result = await login(username, password);
      if (result.kind === "mfa_required") {
        setMfaToken(result.mfaToken);
        setStep("mfa");
      } else {
        onClose();
      }
    } catch {
      setError("Invalid username or password.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleMfaSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!mfaToken) return;
    setSubmitting(true);
    setError(null);
    try {
      await loginMfa(mfaToken, code);
      onClose();
    } catch {
      setError("Invalid authenticator code.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div
      ref={wrapRef}
      role="dialog"
      aria-label="Sign in"
      style={{
        position: "absolute",
        top: "calc(100% + 8px)",
        right: 0,
        width: 280,
        background: "var(--color-white)",
        color: "var(--color-dark-text)",
        border: "1px solid var(--color-border)",
        borderRadius: "var(--radius-md)",
        boxShadow: "var(--shadow-lg)",
        padding: "var(--space-4)",
        zIndex: 1000,
        fontFamily: "var(--font-family)",
      }}
    >
      {step === "creds" ? (
        <form
          onSubmit={handleCredsSubmit}
          style={{
            display: "flex",
            flexDirection: "column",
            gap: "var(--space-3)",
          }}
        >
          <div
            style={{
              fontSize: "13px",
              fontWeight: "var(--font-weight-bold)",
              color: "var(--color-brand-dark-blue)",
              marginBottom: "var(--space-1)",
            }}
          >
            Sign in
          </div>
          {entraEnabled && (
            <>
              <button
                type="button"
                onClick={startEntraSignIn}
                disabled={entraStarting || submitting}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: "var(--space-2)",
                  width: "100%",
                  padding: "var(--space-2) var(--space-3)",
                  background: "var(--color-white)",
                  border: "1px solid var(--color-border)",
                  borderRadius: "var(--radius-md)",
                  color: "var(--color-dark-text)",
                  fontSize: "13px",
                  fontWeight: "var(--font-weight-medium)",
                  fontFamily: "var(--font-family)",
                  cursor:
                    entraStarting || submitting ? "not-allowed" : "pointer",
                  opacity: entraStarting || submitting ? 0.7 : 1,
                }}
                aria-label="Sign in with Microsoft (Entra ID)"
              >
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 16 16"
                  xmlns="http://www.w3.org/2000/svg"
                  aria-hidden
                >
                  <rect x="1" y="1" width="6.5" height="6.5" fill="#F25022" />
                  <rect x="8.5" y="1" width="6.5" height="6.5" fill="#7FBA00" />
                  <rect x="1" y="8.5" width="6.5" height="6.5" fill="#00A4EF" />
                  <rect
                    x="8.5"
                    y="8.5"
                    width="6.5"
                    height="6.5"
                    fill="#FFB900"
                  />
                </svg>
                {entraStarting ? "Redirecting…" : "Sign in with Microsoft"}
              </button>
              <div
                style={{
                  textAlign: "center",
                  fontSize: "11px",
                  color: "var(--color-muted-text)",
                  textTransform: "uppercase",
                  letterSpacing: "0.05em",
                }}
              >
                or use a local account
              </div>
            </>
          )}
          <Input
            label="Username"
            autoComplete="username"
            autoFocus
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            required
          />
          <Input
            label="Password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
          {error && (
            <span
              role="alert"
              style={{ fontSize: "12px", color: "var(--color-danger)" }}
            >
              {error}
            </span>
          )}
          <div
            style={{
              display: "flex",
              justifyContent: "flex-end",
              gap: "var(--space-2)",
              marginTop: "var(--space-1)",
            }}
          >
            <Button
              variant="ghost"
              size="sm"
              type="button"
              onClick={onClose}
              disabled={submitting}
            >
              Cancel
            </Button>
            <Button
              variant="primary"
              size="sm"
              type="submit"
              disabled={submitting}
            >
              {submitting ? "Signing in…" : "Sign in"}
            </Button>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            style={{
              background: "transparent",
              border: "none",
              color: "var(--color-muted-text)",
              fontSize: "12px",
              cursor: "pointer",
              padding: 0,
              marginTop: "var(--space-1)",
              textAlign: "center",
              textDecoration: "underline",
              textUnderlineOffset: "2px",
            }}
            title="Browse the public radar without signing in."
          >
            Continue without signing in
          </button>
        </form>
      ) : (
        <form
          onSubmit={handleMfaSubmit}
          style={{
            display: "flex",
            flexDirection: "column",
            gap: "var(--space-3)",
          }}
        >
          <div
            style={{
              fontSize: "13px",
              fontWeight: "var(--font-weight-bold)",
              color: "var(--color-brand-dark-blue)",
            }}
          >
            Two-factor code
          </div>
          <p
            style={{
              margin: 0,
              fontSize: "12px",
              color: "var(--color-muted-text)",
              lineHeight: 1.4,
            }}
          >
            Enter the 6-digit code from your authenticator app.
          </p>
          <Input
            label="Code"
            inputMode="numeric"
            autoComplete="one-time-code"
            autoFocus
            pattern="[0-9]{6}"
            maxLength={6}
            value={code}
            onChange={(e) =>
              setCode(e.target.value.replace(/\D/g, "").slice(0, 6))
            }
            required
          />
          {error && (
            <span
              role="alert"
              style={{ fontSize: "12px", color: "var(--color-danger)" }}
            >
              {error}
            </span>
          )}
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              gap: "var(--space-2)",
              marginTop: "var(--space-1)",
            }}
          >
            <button
              type="button"
              onClick={() => setStep("creds")}
              disabled={submitting}
              style={{
                background: "transparent",
                border: "none",
                color: "var(--color-muted-text)",
                fontSize: "12px",
                cursor: "pointer",
                padding: 0,
              }}
            >
              ← Back
            </button>
            <Button
              variant="primary"
              size="sm"
              type="submit"
              disabled={submitting || code.length !== 6}
            >
              {submitting ? "Verifying…" : "Verify"}
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}
