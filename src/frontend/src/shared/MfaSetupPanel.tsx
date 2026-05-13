import { useEffect, useState } from "react";
import { Button } from "./Button";
import { Input } from "./Input";
import { Modal } from "./Modal";
import { useAuth } from "./AuthContext";
import { buildAuthHeaders } from "./tokenStore";

type Props = {
  open: boolean;
  onClose: () => void;
};

type SetupResponse = {
  secret: string;
  provisioning_uri: string;
  qr_data_url: string;
};

function authHeader(): Record<string, string> {
  return buildAuthHeaders() as Record<string, string>;
}

export function MfaSetupPanel({ open, onClose }: Props) {
  const { user, refreshUser } = useAuth();
  const [setup, setSetup] = useState<SetupResponse | null>(null);
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) {
      setSetup(null);
      setCode("");
      setPassword("");
      setError(null);
      setBusy(false);
    }
  }, [open]);

  const enrolled = user?.mfa_enabled ?? false;

  async function startSetup() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/mfa/setup", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeader() },
      });
      if (!res.ok) throw new Error(await res.text());
      const body = (await res.json()) as SetupResponse;
      setSetup(body);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to start MFA setup");
    } finally {
      setBusy(false);
    }
  }

  async function confirmEnable(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/mfa/enable", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeader() },
        body: JSON.stringify({ code }),
      });
      if (!res.ok) throw new Error("Invalid authenticator code.");
      await refreshUser();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to enable MFA");
    } finally {
      setBusy(false);
    }
  }

  async function disableMfa(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/mfa/disable", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeader() },
        body: JSON.stringify({ password }),
      });
      if (!res.ok) throw new Error("Wrong password.");
      await refreshUser();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to disable MFA");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Two-factor authentication">
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: "var(--space-4)",
        }}
      >
        {enrolled ? (
          <form
            onSubmit={disableMfa}
            style={{
              display: "flex",
              flexDirection: "column",
              gap: "var(--space-3)",
            }}
          >
            <p
              style={{
                margin: 0,
                fontSize: "13px",
                color: "var(--color-dark-text)",
              }}
            >
              Two-factor authentication is currently <strong>enabled</strong>.
              To disable it, confirm your password.
            </p>
            <Input
              label="Password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
            {error && (
              <span style={{ fontSize: "12px", color: "var(--color-danger)" }}>
                {error}
              </span>
            )}
            <div
              style={{
                display: "flex",
                justifyContent: "flex-end",
                gap: "var(--space-2)",
              }}
            >
              <Button
                variant="ghost"
                type="button"
                onClick={onClose}
                disabled={busy}
              >
                Cancel
              </Button>
              <Button
                variant="danger"
                type="submit"
                disabled={busy || !password}
              >
                {busy ? "Disabling…" : "Disable 2FA"}
              </Button>
            </div>
          </form>
        ) : !setup ? (
          <>
            <p
              style={{
                margin: 0,
                fontSize: "13px",
                color: "var(--color-dark-text)",
              }}
            >
              Add a time-based one-time-password (TOTP) authenticator to your
              account. You'll be asked for a 6-digit code in addition to your
              password when signing in.
            </p>
            {error && (
              <span style={{ fontSize: "12px", color: "var(--color-danger)" }}>
                {error}
              </span>
            )}
            <div
              style={{
                display: "flex",
                justifyContent: "flex-end",
                gap: "var(--space-2)",
              }}
            >
              <Button
                variant="ghost"
                type="button"
                onClick={onClose}
                disabled={busy}
              >
                Cancel
              </Button>
              <Button variant="primary" onClick={startSetup} disabled={busy}>
                {busy ? "Generating…" : "Generate secret"}
              </Button>
            </div>
          </>
        ) : (
          <form
            onSubmit={confirmEnable}
            style={{
              display: "flex",
              flexDirection: "column",
              gap: "var(--space-3)",
            }}
          >
            <p
              style={{
                margin: 0,
                fontSize: "13px",
                color: "var(--color-dark-text)",
              }}
            >
              Scan the QR code below with your authenticator app (1Password,
              Authy, Google Authenticator, …) and enter the 6-digit code it
              generates to confirm.
            </p>
            <div
              style={{
                display: "flex",
                gap: "var(--space-4)",
                alignItems: "center",
              }}
            >
              <img
                src={setup.qr_data_url}
                alt="TOTP QR code"
                width={160}
                height={160}
                style={{
                  border: "1px solid var(--color-border)",
                  borderRadius: "var(--radius-md)",
                  background: "var(--color-white)",
                  padding: 8,
                }}
              />
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: 4,
                  minWidth: 0,
                }}
              >
                <span
                  style={{
                    fontSize: "10px",
                    fontWeight: "var(--font-weight-bold)",
                    textTransform: "uppercase",
                    letterSpacing: "0.05em",
                    color: "var(--color-muted-text)",
                  }}
                >
                  Secret (manual entry)
                </span>
                <code
                  style={{
                    fontFamily:
                      "ui-monospace, SFMono-Regular, Menlo, monospace",
                    fontSize: "12px",
                    background: "var(--color-page-background)",
                    border: "1px solid var(--color-border)",
                    borderRadius: "var(--radius-md)",
                    padding: "6px 8px",
                    wordBreak: "break-all",
                  }}
                >
                  {setup.secret}
                </code>
              </div>
            </div>
            <Input
              label="6-digit code"
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
              <span style={{ fontSize: "12px", color: "var(--color-danger)" }}>
                {error}
              </span>
            )}
            <div
              style={{
                display: "flex",
                justifyContent: "flex-end",
                gap: "var(--space-2)",
              }}
            >
              <Button
                variant="ghost"
                type="button"
                onClick={onClose}
                disabled={busy}
              >
                Cancel
              </Button>
              <Button
                variant="primary"
                type="submit"
                disabled={busy || code.length !== 6}
              >
                {busy ? "Enabling…" : "Enable 2FA"}
              </Button>
            </div>
          </form>
        )}
      </div>
    </Modal>
  );
}
