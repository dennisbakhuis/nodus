import type { ReactNode } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "./AuthContext";

type Capability = "canViewList" | "canBrowseCycles";

type Props = {
  capability: Capability;
  redirectTo?: string;
  children: ReactNode;
};

/**
 * Route guard for the admin-configurable view capabilities (e.g. whether the
 * current role may open the list view). Redirects to `redirectTo` when the
 * capability is absent.
 *
 * Rendering nothing while auth/capabilities are still loading avoids a
 * redirect-flash before an admin's overrides are known.
 */
export function CapabilityRoute({
  capability,
  redirectTo = "/radar",
  children,
}: Props) {
  const auth = useAuth();
  if (auth.isLoading) return null;
  if (!auth[capability]) return <Navigate to={redirectTo} replace />;
  return <>{children}</>;
}
