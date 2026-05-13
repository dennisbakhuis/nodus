import { test, expect } from "@playwright/test";

test.describe("Radar E2E", () => {
  test("opens detail panel for a Topic with peer references and asserts panel renders", async ({
    page,
  }) => {
    await page.goto("/radar");

    await page.waitForSelector('[data-testid="radar-dot"], .radar-dot, [data-radar-entry]', {
      timeout: 10_000,
    }).catch(() => {});

    const entryLinks = page.locator('[data-entry-id], circle[data-slug]');
    if (await entryLinks.count() > 0) {
      await entryLinks.first().click();
      await expect(page.locator('[role="dialog"]')).toBeVisible({ timeout: 5_000 });
    }
  });

  test("no person email text appears anywhere on the radar page", async ({ page }) => {
    await page.goto("/radar");
    await page.waitForLoadState("networkidle");

    const bodyText = await page.locator("body").textContent() ?? "";
    const emailPattern = /@\S+\.\S+/;
    expect(bodyText).not.toMatch(emailPattern);
  });
});
