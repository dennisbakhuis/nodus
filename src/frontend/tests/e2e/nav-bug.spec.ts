import { test, expect } from "@playwright/test";

// Regression for: PersonFilter's effect listed `selected` (its own state) in
// the dep array and unconditionally `setSelected([])`'d when `selectedIds`
// was empty. The new array reference re-triggered the effect → React
// "Maximum update depth exceeded" → page wedged → top menu unresponsive.
test.describe("Top nav navigation regression", () => {
  test("/radar → /list → /radar without any React update-depth errors", async ({
    page,
  }) => {
    const reactErrors: string[] = [];
    page.on("console", (msg) => {
      if (msg.type() !== "error") return;
      const text = msg.text();
      if (text.includes("Maximum update depth")) reactErrors.push(text);
    });
    page.on("pageerror", (err) => {
      if (err.message.includes("Maximum update depth")) {
        reactErrors.push(err.message);
      }
    });

    await page.goto("/radar");
    await page.waitForLoadState("networkidle");

    await page.getByRole("link", { name: "List" }).click();
    await expect(page).toHaveURL(/\/list/);
    await page.waitForLoadState("networkidle");

    await page.getByRole("link", { name: "Radar" }).click();
    await expect(page).toHaveURL(/\/radar/);

    expect(
      reactErrors,
      `Unexpected React update-depth errors: ${reactErrors.join("\n")}`,
    ).toEqual([]);
  });
});
