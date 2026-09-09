import { test, expect } from "@playwright/test";
import { DeleteParameterCommand } from "@aws-sdk/client-ssm";
import { requireLocalStack, makeClients, unique } from "./helpers";

test.describe("SSM Parameter Store e2e", () => {
  const { ssm } = makeClients();
  const urlParam = `/e2e/${unique("db-url")}`;
  const passParam = `/e2e/${unique("db-pass")}`;
  const paramsToClean: string[] = [urlParam, passParam];

  test.beforeAll(async () => {
    await requireLocalStack();
  });

  test.afterAll(async () => {
    for (const p of paramsToClean) {
      try {
        await ssm.send(new DeleteParameterCommand({ Name: p }));
      } catch (err) {
        console.warn(`Cleanup failed for parameter ${p}:`, err);
      }
    }
  });

  test("creates parameters, verifies hierarchy, decrypts SecureString, edits value, and deletes", async ({
    page,
  }) => {
    await page.goto("/");

    // 1. Open Parameter Store via sidebar
    await page
      .locator("aside")
      .getByRole("button", { name: /Parameter Store/ })
      .click();

    await page.getByRole("button", { name: "New parameter" }).first().click();
    const createDialog = page.getByRole("dialog");
    await expect(createDialog).toBeVisible();

    await createDialog.getByLabel(/Parameter name/i).fill(urlParam);
    await createDialog
      .getByLabel(/Value/i)
      .fill("postgres://localhost:5432/e2edb");
    await createDialog.getByRole("button", { name: "Save parameter" }).click();
    await expect(createDialog).not.toBeVisible();

    // 3. Create SecureString parameter via dialog
    await page.getByRole("button", { name: "New parameter" }).first().click();
    await expect(createDialog).toBeVisible();

    await createDialog.getByLabel(/Parameter name/i).fill(passParam);
    await createDialog.getByRole("combobox").click();
    await page.getByRole("option", { name: "SecureString" }).click();
    await createDialog.getByLabel(/Value/i).fill("super-secret-123");
    await createDialog.getByRole("button", { name: "Save parameter" }).click();
    await expect(createDialog).not.toBeVisible();

    // 4. Flat list shows both parameters and their type badges
    await expect(page.getByText(urlParam, { exact: true })).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByText(passParam, { exact: true })).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByText("SecureString")).toBeVisible();
    await expect(page.getByText("String", { exact: true })).toBeVisible();

    // 5. Switch to Hierarchy view
    await page.getByRole("button", { name: "Hierarchy" }).click();
    await expect(page.getByText("e2e", { exact: true })).toBeVisible({ timeout: 5_000 });

    // 6. Switch back to Flat view and open the SecureString parameter
    await page.getByRole("button", { name: "Flat" }).click();
    await page.getByText(passParam, { exact: true }).click();

    // ParameterView opens
    await expect(
      page.getByRole("heading", { name: passParam }),
    ).toBeVisible({ timeout: 10_000 });

    // Value initially masked
    await expect(page.getByText("Value hidden")).toBeVisible();

    // 7. Click Reveal value (decrypts SecureString via LocalStack KMS)
    await page.getByRole("button", { name: /Reveal value/i }).click();

    // Plaintext revealed in <pre>
    await expect(
      page.locator("pre").getByText("super-secret-123"),
    ).toBeVisible({ timeout: 15_000 });

    // 8. Edit value with Overwrite checked
    await page.getByRole("button", { name: "Edit" }).click();
    const editDialog = page.getByRole("dialog");
    await expect(editDialog).toBeVisible();

    await editDialog.getByLabel("Value").fill("updated-secret-456");
    await editDialog.getByRole("button", { name: "Save changes" }).click();
    await expect(editDialog).not.toBeVisible();

    // Value in view updates
    await expect(
      page.locator("pre").getByText("updated-secret-456"),
    ).toBeVisible({ timeout: 10_000 });

    // 9. Delete parameter
    await page.getByRole("button", { name: "Delete" }).click();
    const delDialog = page.getByRole("dialog");
    await expect(delDialog).toBeVisible();
    await delDialog.getByRole("button", { name: "Delete parameter" }).click();
    await expect(delDialog).not.toBeVisible();

    // Tab is closed
    await expect(page.getByRole("tab", { name: passParam })).not.toBeVisible();

    // Parameter is gone from list
    await expect(page.getByText(passParam, { exact: true })).not.toBeVisible();
  });
});
