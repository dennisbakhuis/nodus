import { test, expect, type Page } from "@playwright/test";
import { signIn } from "./support/session";

/**
 * Runs against whatever the dev database holds, so assertions about specific
 * technologies are guarded — the point is that the view mounts, switches mode,
 * and round-trips its state through the URL.
 *
 * `/tree` sits behind the `canViewList` capability, which excludes anonymous
 * callers, so each test signs in as the seeded demo reader first. Requires
 * `make seed` (which seeds demo users when NODUS_ENV is dev or test).
 */
async function openTree(page: Page, path = "/tree"): Promise<boolean> {
  if (!(await signIn(page))) return false;
  await page.goto(path);
  await page.waitForLoadState("networkidle");
  // The capability guard redirects to /radar when the session lacks access.
  return page.url().includes("/tree");
}

test.describe("Tree E2E", () => {
  test("renders the group tree with distinct node kinds", async ({ page }) => {
    test.skip(!(await openTree(page)), "demo reader unavailable");

    await page
      .waitForSelector("[data-topic-id]", { timeout: 10_000 })
      .catch(() => {});
    const nodes = page.locator("[data-topic-id]");
    expect(await nodes.count()).toBeGreaterThan(0);

    // The seeded dataset has both pure umbrellas and technologies that are
    // themselves parents, so both marks must appear.
    expect(
      await page.locator("[data-kind='labelGroup']").count(),
    ).toBeGreaterThan(0);
    expect(
      await page.locator("[data-kind='technologyGroup']").count(),
    ).toBeGreaterThan(0);
  });

  test("dependency mode asks for an anchor and keeps mode in the URL", async ({
    page,
  }) => {
    test.skip(
      !(await openTree(page, "/tree?mode=deps")),
      "demo reader unavailable",
    );

    await expect(page.getByText(/Pick an anchor technology/)).toBeVisible({
      timeout: 10_000,
    });
    expect(page.url()).toContain("mode=deps");
  });

  test("an anchored lineage renders its level columns", async ({ page }) => {
    test.skip(!(await openTree(page)), "demo reader unavailable");

    await page
      .waitForSelector("[data-kind='technologyGroup']", { timeout: 10_000 })
      .catch(() => {});
    const parent = page.locator("[data-kind='technologyGroup']").first();
    test.skip((await parent.count()) === 0, "no technology group seeded");

    await parent.dblclick();
    await expect(page.getByText("ANCHOR", { exact: true })).toBeVisible({
      timeout: 10_000,
    });
    expect(page.url()).toContain("anchor=");
    // A technology group that is also a relation source has downstream nodes.
    await expect(page.getByText(/DOWNSTREAM · LEVEL -1/)).toBeVisible({
      timeout: 5_000,
    });
  });

  test("an anchored lineage survives a reload", async ({ page }) => {
    test.skip(!(await openTree(page)), "demo reader unavailable");

    await page
      .waitForSelector("[data-kind='technologyGroup']", { timeout: 10_000 })
      .catch(() => {});
    const parent = page.locator("[data-kind='technologyGroup']").first();
    test.skip((await parent.count()) === 0, "no technology group seeded");

    await parent.dblclick();
    await expect(page.getByText("ANCHOR", { exact: true })).toBeVisible({
      timeout: 10_000,
    });
    const anchored = page.url();

    await page.reload();
    await expect(page.getByText("ANCHOR", { exact: true })).toBeVisible({
      timeout: 10_000,
    });
    expect(page.url()).toBe(anchored);
  });
});
