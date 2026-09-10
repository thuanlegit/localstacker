import { test, expect } from "@playwright/test";

test.describe("Docker e2e", () => {
  // Mock adapter drives the panel in the browser; the only outbound call is
  // the create wizard's LocalStack health poll, stubbed here so the flow is
  // LocalStack-independent.
  test.beforeEach(async ({ page }) => {
    await page.route("**/_localstack/health", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ version: "4.14.0", services: {} }),
      }),
    );
  });

  test("docker panel lifecycle: stop warning, logs console, remove, create with auto-connect", async ({
    page,
  }) => {
    await page.goto("/");

    // Open Docker panel
    await page.locator("aside").getByRole("button", { name: /^Docker/ }).click();
    await expect(page.getByRole("heading", { name: "Docker" })).toBeVisible();
    await expect(page.getByText("Demo data")).toBeVisible();
    await expect(
      page.getByText(/Docker daemon · v27\.5\.1 \(mock\)/),
    ).toBeVisible();

    const vanillaRow = page.locator("tr", { hasText: "demo-localstack" }).first();
    const persistRow = page.locator("tr", { hasText: "demo-localstack-persist" });
    await expect(vanillaRow).toBeVisible();
    await expect(persistRow).toBeVisible();

    // Stop vanilla container: persistence-aware warning appears
    await vanillaRow
      .getByRole("button", { name: "Actions for demo-localstack" })
      .click();
    await page.getByRole("menuitem", { name: "Stop", exact: true }).click();
    const stopDialog = page.getByRole("dialog");
    await expect(
      stopDialog.getByText(/This container has no persistence volume/),
    ).toBeVisible();
    await stopDialog.getByRole("button", { name: "Stop" }).click();
    await expect(vanillaRow).toContainText("exited", { timeout: 10_000 });

    // Start again
    await vanillaRow
      .getByRole("button", { name: "Actions for demo-localstack" })
      .click();
    await page.getByRole("menuitem", { name: "Start", exact: true }).click();
    await expect(vanillaRow).toContainText("running", { timeout: 10_000 });

    // Detail panel: summary + logs console
    await vanillaRow.locator("td").first().click();
    const detail = page.getByText("Environment Variables");
    await expect(detail).toBeVisible();

    await page.getByRole("tab", { name: "Logs" }).click();
    await expect(
      page.getByTestId("container-logs-console").getByText(/\[LocalStack\]/).first(),
    ).toBeVisible();
    await expect(page.getByTestId("log-line-count")).toContainText("lines");

    await page.getByRole("button", { name: "Pause follow" }).click();
    await expect(page.getByTestId("paused-indicator")).toBeVisible();
    await page.getByRole("button", { name: "Resume follow" }).click();

    // Collapse the detail panel again
    await vanillaRow.locator("td").first().click();

    // Remove persist container with volumes checkbox
    await persistRow
      .getByRole("button", { name: "Actions for demo-localstack-persist" })
      .click();
    await page.getByRole("menuitem", { name: "Remove", exact: true }).click();
    const removeDialog = page.getByRole("dialog");
    await expect(
      removeDialog.getByText("Remove demo-localstack-persist?"),
    ).toBeVisible();
    await removeDialog.getByLabel("Also delete named volumes").check();
    await removeDialog.getByRole("button", { name: "Remove" }).click();
    await expect(persistRow).not.toBeVisible({ timeout: 10_000 });

    // Create wizard: launch a new container with pull progress
    await page.getByRole("button", { name: "Launch Container" }).click();
    const createDialog = page.getByRole("dialog");
    await expect(
      createDialog.getByRole("heading", { name: /Launch LocalStack container/ }),
    ).toBeVisible();
    await createDialog.getByLabel("Container name").fill("e2e-stack");
    await createDialog.getByRole("button", { name: "Launch" }).click();

    await expect(createDialog.getByText(/Pulling|Starting|Container started/)).toBeVisible();
    await expect(
      page.locator("tr", { hasText: "e2e-stack" }),
    ).toBeVisible({ timeout: 15_000 });
    await expect(page.locator("tr", { hasText: "e2e-stack" })).toContainText(
      "running",
    );

    // Auto-connect: reuses the existing localhost profile bound to :4566
    await expect(
      page.getByText(/Connected to e2e-stack \(http:\/\/localhost:4566\)/),
    ).toBeVisible({ timeout: 15_000 });
  });
});
