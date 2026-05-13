import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { AUTH_INVALID_EVENT } from "../api/client";
import { clearToken, getToken, setToken } from "./tokenStore";

export type UserRole = "public_reader" | "reader" | "writer" | "admin";

export type AuthUser = {
  id: string;
  username: string;
  first_name: string;
  last_name: string;
  role: UserRole;
  mfa_enabled: boolean;
};

export type LoginOutcome =
  | { kind: "ok" }
  | { kind: "mfa_required"; mfaToken: string };

export type AuthProviderName = "local" | "entra";

type AuthContextValue = {
  user: AuthUser | null;
  isLoading: boolean;
  isWriter: boolean;
  isAdmin: boolean;
  // Capability flags — prefer these over user !== null in render-time gates.
  // Anonymous visitors map to PublicReader server-side, so anything a
  // PublicReader can do, an anonymous visitor can do too.
  effectiveRole: UserRole;
  canBrowseCycles: boolean;
  canOpenTopicDetail: boolean;
  canOpenFullTopicModal: boolean;
  authEnabled: boolean;
  /** Which login providers the backend currently offers. */
  providers: AuthProviderName[];
  login: (username: string, password: string) => Promise<LoginOutcome>;
  loginMfa: (mfaToken: string, code: string) => Promise<void>;
  /** Adopt a bearer token issued by an external flow (e.g. Entra callback). */
  adoptToken: (token: string) => Promise<void>;
  refreshUser: () => Promise<void>;
  logout: () => Promise<void>;
};

const Ctx = createContext<AuthContextValue>({
  user: null,
  isLoading: false,
  isWriter: false,
  isAdmin: false,
  effectiveRole: "public_reader",
  canBrowseCycles: true,
  canOpenTopicDetail: true,
  canOpenFullTopicModal: false,
  authEnabled: true,
  providers: ["local"],
  login: async () => ({ kind: "ok" }),
  loginMfa: async () => {},
  adoptToken: async () => {},
  refreshUser: async () => {},
  logout: async () => {},
});

const readToken = getToken;

function writeToken(token: string | null): void {
  if (token === null) clearToken();
  else setToken(token);
}

async function fetchMe(token: string): Promise<AuthUser | null> {
  const res = await fetch("/api/auth/me", {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) return null;
  return (await res.json()) as AuthUser;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [authEnabled, setAuthEnabled] = useState<boolean>(true);
  const [providers, setProviders] = useState<AuthProviderName[]>(["local"]);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      let enabled = true;
      let resolvedProviders: AuthProviderName[] = ["local"];
      try {
        const cfgRes = await fetch("/api/auth/config");
        if (cfgRes.ok) {
          const cfg = (await cfgRes.json()) as {
            auth_enabled: boolean;
            providers?: AuthProviderName[];
          };
          enabled = cfg.auth_enabled;
          if (Array.isArray(cfg.providers)) {
            resolvedProviders = cfg.providers;
          }
        }
      } catch {
        /* fall back to enabled=true, local-only */
      }
      if (cancelled) return;
      setAuthEnabled(enabled);
      setProviders(resolvedProviders);

      if (!enabled) {
        // Auth disabled — server returns the synthetic admin from /me.
        const profile = await fetchMe("noop").catch(() => null);
        if (!cancelled) {
          setUser(profile);
          setIsLoading(false);
        }
        return;
      }

      const token = readToken();
      if (!token) {
        if (!cancelled) setIsLoading(false);
        return;
      }
      const profile = await fetchMe(token).catch(() => null);
      if (cancelled) return;
      if (profile) {
        setUser(profile);
      } else {
        writeToken(null);
      }
      setIsLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    function onInvalid() {
      setUser(null);
    }
    window.addEventListener(AUTH_INVALID_EVENT, onInvalid);
    return () => window.removeEventListener(AUTH_INVALID_EVENT, onInvalid);
  }, []);

  const login = useCallback(
    async (username: string, password: string): Promise<LoginOutcome> => {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      if (!res.ok) {
        const detail = await res.text();
        throw new Error(detail || `Login failed (${res.status})`);
      }
      const body = (await res.json()) as {
        requires_mfa?: boolean;
        mfa_token?: string | null;
        token?: string | null;
        user?: AuthUser | null;
      };
      if (body.requires_mfa && body.mfa_token) {
        return { kind: "mfa_required", mfaToken: body.mfa_token };
      }
      if (body.token && body.user) {
        writeToken(body.token);
        setUser(body.user);
        return { kind: "ok" };
      }
      throw new Error("Login response missing token");
    },
    [],
  );

  const loginMfa = useCallback(async (mfaToken: string, code: string) => {
    const res = await fetch("/api/auth/login/mfa", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mfa_token: mfaToken, code }),
    });
    if (!res.ok) {
      const detail = await res.text();
      throw new Error(detail || `MFA login failed (${res.status})`);
    }
    const body = (await res.json()) as { token: string; user: AuthUser };
    writeToken(body.token);
    setUser(body.user);
  }, []);

  const refreshUser = useCallback(async () => {
    const token = readToken();
    if (!token) return;
    const profile = await fetchMe(token).catch(() => null);
    if (profile) setUser(profile);
  }, []);

  const adoptToken = useCallback(async (token: string) => {
    // Used by the Entra OIDC callback page after the backend redirects to
    // /auth/callback?token=… — the bearer protocol downstream is identical
    // to a local-login session token.
    if (!token) return;
    writeToken(token);
    const profile = await fetchMe(token).catch(() => null);
    if (profile) {
      setUser(profile);
    } else {
      writeToken(null);
    }
  }, []);

  const logout = useCallback(async () => {
    const token = readToken();
    if (token) {
      try {
        await fetch("/api/auth/logout", {
          method: "POST",
          headers: { Authorization: `Bearer ${token}` },
        });
      } catch {
        /* swallow — we revoke locally regardless */
      }
    }
    writeToken(null);
    setUser(null);
  }, []);

  const value = useMemo<AuthContextValue>(() => {
    const effectiveRole: UserRole = user?.role ?? "public_reader";
    const isWriter = effectiveRole === "writer" || effectiveRole === "admin";
    const isAdmin = effectiveRole === "admin";
    return {
      user,
      isLoading,
      isWriter,
      isAdmin,
      effectiveRole,
      // Cycles list, topic-detail slide-in, and movement history all use
      // OptionalUserDep server-side and filter via is_public_only(). Anonymous
      // visitors get the public surface and should not be gated client-side.
      canBrowseCycles: true,
      canOpenTopicDetail: true,
      // The full TopicDetailModal calls endpoints that require Writer+
      // (manage peer-references mutations, etc. — though reads are public,
      // the modal's editing surface is not). Keep it gated to authenticated
      // users only.
      canOpenFullTopicModal: !authEnabled || user !== null,
      authEnabled,
      providers,
      login,
      loginMfa,
      adoptToken,
      refreshUser,
      logout,
    };
  }, [
    user,
    isLoading,
    authEnabled,
    providers,
    login,
    loginMfa,
    adoptToken,
    refreshUser,
    logout,
  ]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth(): AuthContextValue {
  return useContext(Ctx);
}
