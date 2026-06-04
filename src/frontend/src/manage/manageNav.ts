export type ManageRole = "writer" | "admin";

export type ManageNavItem = {
  to: string;
  label: string;
  role: ManageRole;
};

/**
 * Single source of truth for the management section: drives both the sidebar
 * link visibility (ManageSidebar) and the client-side route guards (App). The
 * whole section requires Writer+; items marked `admin` require Admin.
 */
export const MANAGE_NAV: ManageNavItem[] = [
  { to: "/manage/cycles", label: "Cycles", role: "writer" },
  { to: "/manage/segments", label: "Segments", role: "admin" },
  { to: "/manage/groups", label: "Groups", role: "writer" },
  { to: "/manage/persons", label: "People", role: "writer" },
  { to: "/manage/users", label: "Users", role: "admin" },
  { to: "/manage/visibility", label: "Data Visibility", role: "admin" },
  { to: "/manage/backup", label: "Backup & Restore", role: "admin" },
  { to: "/manage/import", label: "Import References", role: "writer" },
  { to: "/manage/settings", label: "Settings", role: "writer" },
  { to: "/manage/api", label: "API", role: "writer" },
];
