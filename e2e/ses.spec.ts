import { test, expect } from "@playwright/test";
import { DeleteIdentityCommand } from "@aws-sdk/client-ses";
import { requireLocalStack, makeClients, unique, ENDPOINT } from "./helpers";

test.describe("SES e2e", () => {
  const { ses } = makeClients();
  const senderEmail = unique("sender") + "@example.com";

  test.beforeAll(async () => {
    await requireLocalStack();
  });

  test.afterAll(async () => {
    try {
      await ses.send(new DeleteIdentityCommand({ Identity: senderEmail }));
    } catch (err) {
      console.warn(`SES cleanup failed for ${senderEmail}:`, err);
    }
  });

  test("verifies email identity, sends email, inspects in captured mailbox, clears mailbox, and deletes identity", async ({
    page,
  }) => {
    await page.goto("/");

    // 1. Open SES via sidebar
    await page
      .locator("aside")
      .getByRole("button", { name: /^SES/ })
      .click();
    await expect(page.getByRole("heading", { name: "SES" })).toBeVisible();

    // 2. Verify email identity
    await page.getByRole("button", { name: "Verify email" }).click();
    const verifyDialog = page.getByRole("dialog");
    await verifyDialog.getByLabel(/Email address/i).fill(senderEmail);
    await verifyDialog.getByRole("button", { name: "Verify email" }).click();

    // Verify identity tab opened and displays Verified status
    await expect(page.getByRole("heading", { name: senderEmail })).toBeVisible();
    await expect(page.getByText("Verified").first()).toBeVisible();

    // 3. Open captured mailbox tab
    await page
      .locator("aside")
      .getByRole("button", { name: /^SES/ })
      .click();
    await page.getByRole("button", { name: /Captured mailbox/i }).click();
    await expect(
      page.getByRole("heading", { name: "SES Mailbox" }),
    ).toBeVisible();

    // 4. Send test email modal
    await page
      .locator("aside")
      .getByRole("button", { name: /^SES/ })
      .click();
    await page.getByRole("button", { name: /Send email/i }).click();

    const sendDialog = page.getByRole("dialog");
    await expect(sendDialog.getByText("Send Test Email")).toBeVisible();
    await sendDialog.getByRole("combobox").click();
    await page.getByRole("option", { name: senderEmail }).click();
    await sendDialog.getByLabel(/To/i).fill("test-recipient@example.com");
    await sendDialog.getByLabel(/Subject/i).fill("Test Welcome Subject");
    await sendDialog.getByLabel(/Body/i).fill("<h1>Hello E2E Test</h1>");
    await sendDialog.getByRole("button", { name: /Send email/i }).click();

    // Toast appears
    await expect(page.getByText("Email sent")).toBeVisible();

    // 5. Switch to SES Mailbox tab and inspect captured message
    await page.getByRole("tab", { name: "SES Mailbox" }).click();
    const messageItem = page
      .locator("span")
      .filter({ hasText: "Test Welcome Subject" })
      .first();
    await expect(messageItem).toBeVisible();
    await messageItem.click();
    await expect(
      page.getByRole("heading", { name: "Test Welcome Subject" }),
    ).toBeVisible();
    const iframe = page.locator("iframe[title='HTML email preview']");
    await expect(iframe).toBeVisible();
    await expect(iframe).toHaveAttribute("srcDoc", /Hello E2E Test/);

    // 6. SDK assertion: check mailbox endpoint
    let res = await fetch(`${ENDPOINT}/_aws/ses`);
    if (res.status === 404) {
      res = await fetch(`${ENDPOINT}/_localstack/ses`);
    }
    expect(res.ok).toBe(true);
    const data = (await res.json()) as { messages?: Array<{ Subject?: string; Source?: string }> };
    expect(
      data.messages?.some(
        (m) =>
          m.Subject === "Test Welcome Subject" && m.Source === senderEmail,
      ),
    ).toBe(true);

    // 7. Clear mailbox
    await page.getByRole("button", { name: /Clear mailbox/i }).click();
    const clearDialog = page.getByRole("dialog");
    await clearDialog
      .getByRole("button", { name: /Delete all captured emails/i })
      .click();
    await expect(page.getByText("No captured emails")).toBeVisible();

    // 8. Delete identity via UI
    await page
      .locator("aside")
      .getByRole("button", { name: /^SES/ })
      .click();
    const row = page.locator("tr").filter({ hasText: senderEmail });
    await row.getByRole("button", { name: `Actions for ${senderEmail}` }).click();
    await page.getByRole("menuitem", { name: /Delete identity/i }).click();
    const deleteDialog = page.getByRole("dialog");
    await deleteDialog.getByRole("button", { name: "Delete identity" }).click();
    await expect(deleteDialog).not.toBeVisible();
    await expect(page.locator("table").getByText(senderEmail)).not.toBeVisible();
  });
});
