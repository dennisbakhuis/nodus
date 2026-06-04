/**
 * Map a URL pathname to a help slug + display title.
 *
 * Order matters: the first matching entry wins. Place specific
 * `/manage/<sub>` patterns before the generic `/manage` catch-all.
 *
 * Adding a new page is a one-line change: append an entry here and create
 * `content/<slug>.md`.
 */

export type HelpPage = {
  slug: string;
  title: string;
};

type Route = HelpPage & {
  match: RegExp;
};

const routes: Route[] = [
  { match: /^\/radar(\/|$)/, slug: "radar", title: "Radar view" },
  { match: /^\/list(\/|$)/, slug: "list", title: "Technology list" },
  { match: /^\/manage\/cycles/, slug: "manage-cycles", title: "Cycles" },
  { match: /^\/manage\/settings/, slug: "manage-settings", title: "Settings" },
  { match: /^\/manage\/segments/, slug: "manage-segments", title: "Segments" },
  { match: /^\/manage\/groups/, slug: "manage-groups", title: "Groups" },
  { match: /^\/manage\/persons/, slug: "manage-persons", title: "People" },
  { match: /^\/manage\/users/, slug: "manage-users", title: "Users" },
  {
    match: /^\/manage\/visibility/,
    slug: "manage-visibility",
    title: "Data Visibility",
  },
  {
    match: /^\/manage\/backup/,
    slug: "manage-backup",
    title: "Backup & Restore",
  },
  {
    match: /^\/manage\/import/,
    slug: "manage-import",
    title: "Import References",
  },
  { match: /^\/manage\/api/, slug: "manage-api", title: "API" },
  { match: /^\/manage(\/|$)/, slug: "manage", title: "Manage" },
];

const fallback: HelpPage = { slug: "default", title: "Help" };

export function routeToHelp(pathname: string): HelpPage {
  for (const route of routes) {
    if (route.match.test(pathname)) {
      return { slug: route.slug, title: route.title };
    }
  }
  return fallback;
}
