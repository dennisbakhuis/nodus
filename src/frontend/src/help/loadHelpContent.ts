/**
 * Load a help markdown document by slug. Content lives in `./content/*.md` and
 * is bundled at build time via Vite's glob import. Falls back to `default.md`,
 * then to a hard-coded stub, so a missing slug never throws.
 *
 * Shared by the route-driven HelpPanel and the in-modal help drawer.
 */

const docs = import.meta.glob("./content/*.md", {
  query: "?raw",
  import: "default",
  eager: true,
}) as Record<string, string>;

export function loadHelpContent(slug: string): string {
  const key = `./content/${slug}.md`;
  return (
    docs[key] ??
    docs["./content/default.md"] ??
    "# Help\n\nNo help content available for this page yet."
  );
}
