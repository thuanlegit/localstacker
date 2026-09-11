import { test, expect } from "./fixtures";
import { requireLocalStack } from "./helpers";

test.describe("Health & Connection", () => {
  test.beforeAll(async () => {
    await requireLocalStack();
  });

  test("displays healthy badge and Local profile", async ({ page }) => {
    await page.goto("/");

    const badge = page.getByTestId("health-badge");
    await expect(badge).toContainText(/Running/, { timeout: 20_000 });

    const profileBtn = page.getByRole("button", { name: /Local/i });
    await expect(profileBtn).toBeVisible();
    await expect(profileBtn).toContainText("Local");
  });
});
