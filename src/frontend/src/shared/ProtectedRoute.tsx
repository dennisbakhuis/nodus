import type { ReactNode } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "./AuthContext";

type Props = {
  requireRole: "writer" | "admin";
  redirectTo?: string;
  children: ReactNode;
};

/**
 * Route guard that renders its children only when the current user meets the
 * required role. Unauthorized visitors are redirected to `redirectTo`.
 *
 * Rendering nothing while the initial auth check is in flight avoids a
 * redirect-flash before the session token has been validated.
 */
export function ProtectedRoute({ requireRole, redirectTo = "/radar", children }: Props) {
  const { isLoading, isWriter, isAdmin } = useAuth();
  if (isLoading) return null;
  const ok = requireRole === "admin" ? isAdmin : isWriter;
  if (!ok) return <Navigate to={redirectTo} replace />;
  return <>{children}</>;
}
