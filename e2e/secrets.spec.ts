import { test, expect } from "@playwright/test";
import { DeleteSecretCommand } from "@aws-sdk/client-secrets-manager";
import { requireLocalStack, makeClients, unique } from "./helpers";

test.describe("Secrets Manager e2e", () => {
  const { secrets } = makeClients();
  const secretName = unique("e2e-secret");
  const secretValue = JSON.stringify({ u: "admin", p: "hunter2" });

  test.beforeAll(async () => {
    await requireLocalStack();
  });

  test.afterAll(async () => {
    try {
      await secrets.send(
        new DeleteSecretCommand({
          SecretId: secretName,
          ForceDeleteWithoutRecovery: true,
        })
      );
    } catch (err) {
      console.warn(`Failed to cleanup secret ${secretName}:`, err);
    }
  });

  test("creates secret, reveals value, and deletes it", async ({ page }) => {
    await page.goto("/");

    // 1. Open Secrets Manager via sidebar
    await page.locator("aside").getByRole("button", { name: /Secrets Manager/ }).click();

    // 2. Create secret via UI
    await page.getByRole("button", { name: "Create secret" }).click();
    const createDialog = page.getByRole("dialog");
    await expect(createDialog).toBeVisible();

    await createDialog.locator("#new-secret-name").fill(secretName);
    await createDialog.locator("#new-secret-value").fill(secretValue);
    await createDialog.getByRole("button", { name: "Create secret" }).click();
    await expect(createDialog).not.toBeVisible();

    // 3. Open created secret
    const secretItem = page.getByText(secretName, { exact: true });
    await expect(secretItem).toBeVisible({ timeout: 15_000 });
    await secretItem.click();

    // 4. Reveal value
    await page.getByRole("button", { name: "Reveal value" }).click();
    await expect(page.getByText("hunter2")).toBeVisible({ timeout: 10_000 });

    // 5. Delete secret
    await page.getByRole("button", { name: `Actions for ${secretName}` }).click();
    await page.getByRole("menuitem", { name: "Delete secret" }).click();

    const deleteDialog = page.getByRole("dialog");
    await expect(deleteDialog).toBeVisible();
    await deleteDialog.getByRole("button", { name: "Delete" }).click();
    await expect(deleteDialog).not.toBeVisible();

    // 6. Switch back to Secrets Manager list and verify row is gone
    await page.getByRole("tab", { name: /Secrets/ }).click();
    await expect(page.locator("table").getByText(secretName)).not.toBeVisible();
  });
});
