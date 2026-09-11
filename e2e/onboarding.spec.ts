import { expect, test } from "@playwright/test";
import { requireLocalStack } from "./helpers";

// Imports from @playwright/test directly on purpose: no onboarding seed, so
// each test's fresh browser context is a genuine first launch.
test.describe("First-launch onboarding", () => {
  test.beforeAll(async () => {
    await requireLocalStack();
  });

  test("completes onboarding into the shell and never shows again", async ({ page }) => {
    await page.goto("/");

    const overlay = page.getByTestId("onboarding");
    await expect(overlay).toBeVisible();

    await expect(overlay.getByText(/Connected · \d+\./)).toBeVisible({ timeout: 20_000 });
    expect(
      await overlay.locator("[data-testid^='onboarding-lamp-'] span.bg-emerald-500").count(),
    ).toBeGreaterThanOrEqual(1);

    await overlay.getByRole("button", { name: "Open LocalStacker" }).click();
    const badge = page.getByTestId("health-badge");
    await expect(badge).toContainText(/Running/, { timeout: 20_000 });

    await page.reload();
    await expect(page.getByTestId("onboarding")).toHaveCount(0);
    await expect(badge).toContainText(/Running/, { timeout: 20_000 });
  });

  test("skip for now reveals the shell and persists", async ({ page }) => {
    await page.goto("/");

    const overlay = page.getByTestId("onboarding");
    await expect(overlay).toBeVisible();

    await overlay.getByRole("button", { name: "Skip for now" }).click();
    await expect(page.getByTestId("health-badge")).toBeVisible({ timeout: 20_000 });

    await page.reload();
    await expect(page.getByTestId("onboarding")).toHaveCount(0);
  });
});
