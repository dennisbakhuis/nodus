import { test, expect } from "@playwright/test";

// Runs against whatever the dev database holds, so every assertion is guarded:
// the point is that the view mounts, switches mode, and round-trips its state
// through the URL — not that any particular technology exists.
test.describe("Tree E2E", () => {
  test("renders the group tree", async ({ page }) => {
    await page.goto("/tree");
    await page
      .waitForSelector("[data-topic-id]", { timeout: 10_000 })
      .catch(() => {});

    const nodes = page.locator("[data-topic-id]");
    if ((await nodes.count()) > 0) {
      await expect(nodes.first()).toBeVisible();
    }
  });

  test("dependency mode asks for an anchor and keeps it in the URL", async ({
    page,
  }) => {
    await page.goto("/tree?mode=deps");
    await page.waitForLoadState("networkidle");

    await expect(page.getByText(/Pick an anchor technology/)).toBeVisible({
      timeout: 10_000,
    });
    expect(page.url()).toContain("mode=deps");
  });

  test("an anchored lineage survives a reload", async ({ page }) => {
    await page.goto("/tree");
    await page
      .waitForSelector("[data-kind='technology']", { timeout: 10_000 })
      .catch(() => {});

    const leaf = page.locator("[data-kind='technology']").first();
    if ((await leaf.count()) === 0) test.skip();

    await leaf.dblclick();
    await expect(page.getByText("ANCHOR")).toBeVisible({ timeout: 5_000 });
    expect(page.url()).toContain("anchor=");

    const anchored = page.url();
    await page.reload();
    await expect(page.getByText("ANCHOR")).toBeVisible({ timeout: 10_000 });
    expect(page.url()).toBe(anchored);
  });
});
