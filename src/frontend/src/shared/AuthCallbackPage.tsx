import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "./AuthContext";

/**
 * Landing page for the Entra OIDC redirect.
 *
 * The backend ``/api/auth/entra/callback`` validates the ID token,
 * issues a local session, and 302s the browser to
 * ``/auth/callback?token=<bearer>``. This component reads the token from
 * the URL, hands it to AuthContext, scrubs it from history, and navigates
 * back to the radar.
 */
export function AuthCallbackPage() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const { adoptToken } = useAuth();
  const [status, setStatus] = useState<"working" | "error">("working");

  useEffect(() => {
    const token = params.get("token");
    if (!token) {
      setStatus("error");
      return;
    }
    let cancelled = false;
    (async () => {
      await adoptToken(token);
      if (cancelled) return;
      // Replace history so the bearer never lives in the back button.
      window.history.replaceState({}, "", "/radar");
      navigate("/radar", { replace: true });
    })();
    return () => {
      cancelled = true;
    };
  }, [params, adoptToken, navigate]);

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        height: "60vh",
        gap: "var(--space-3)",
        fontFamily: "var(--font-family)",
        color: "var(--color-dark-text)",
      }}
    >
      {status === "working" ? (
        <>
          <div style={{ fontSize: "var(--font-size-body)" }}>
            Signing you in…
          </div>
          <div
            style={{
              fontSize: "var(--font-size-sm)",
              color: "var(--color-muted-text)",
            }}
          >
            One moment while we finalise your session.
          </div>
        </>
      ) : (
        <>
          <div style={{ fontSize: "var(--font-size-body)" }}>
            Sign-in failed.
          </div>
          <a
            href="/radar"
            style={{
              fontSize: "var(--font-size-sm)",
              color: "var(--color-brand-bright-blue)",
            }}
          >
            Return to the radar
          </a>
        </>
      )}
    </div>
  );
}
