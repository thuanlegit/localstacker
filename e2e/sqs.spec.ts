import { test, expect } from "./fixtures";
import { GetQueueUrlCommand, DeleteQueueCommand } from "@aws-sdk/client-sqs";
import { requireLocalStack, makeClients, unique } from "./helpers";

test.describe("SQS e2e", () => {
  const { sqs } = makeClients();
  const queueName = unique("e2e-queue");

  test.beforeAll(async () => {
    await requireLocalStack();
  });

  test.afterAll(async () => {
    try {
      const res = await sqs.send(new GetQueueUrlCommand({ QueueName: queueName }));
      if (res.QueueUrl) {
        await sqs.send(new DeleteQueueCommand({ QueueUrl: res.QueueUrl }));
      }
    } catch (err) {
      console.warn(`Failed to cleanup queue ${queueName}:`, err);
    }
  });

  test("creates queue, sends message, peeks, and purges", async ({ page }) => {
    await page.goto("/");
    // 1. Open SQS via sidebar
    await page.locator("aside").getByRole("button", { name: /SQS/ }).click();

    // 2. Create queue via UI
    await page.getByRole("button", { name: "Create queue" }).click();
    const createDialog = page.getByRole("dialog");
    await expect(createDialog).toBeVisible();
    await createDialog.locator("#new-queue-name").fill(queueName);
    await createDialog.getByRole("button", { name: "Create queue" }).click();
    await expect(createDialog).not.toBeVisible();
    const queueItem = page.getByText(queueName, { exact: true });
    await expect(queueItem).toBeVisible({ timeout: 15_000 });
    await queueItem.click();

    // 4. Send message
    await page.getByRole("button", { name: "Send message" }).click();
    const sendDialog = page.getByRole("dialog");
    await expect(sendDialog).toBeVisible();
    await sendDialog.locator("#message-body").fill(JSON.stringify({ e2e: true }));
    await sendDialog.getByRole("button", { name: "Send" }).click();
    await expect(sendDialog).not.toBeVisible();

    // Header stats show 1 messages
    await expect(page.locator("span").filter({ hasText: /1 messages/ })).toBeVisible({ timeout: 10_000 });
    // 5. Peek messages
    await page.getByRole("button", { name: "Peek messages" }).click();
    await expect(page.getByText(/"e2e":\s*true/)).toBeVisible({ timeout: 10_000 });

    // 6. Purge queue
    await page.getByRole("button", { name: "Queue actions" }).click();
    await page.getByRole("menuitem", { name: "Purge queue…" }).click();
    const purgeDialog = page.getByRole("dialog");
    await expect(purgeDialog).toBeVisible();
    await purgeDialog.getByRole("button", { name: "Purge" }).click();
    await expect(purgeDialog).not.toBeVisible();

    // Header stats show 0 messages
    await expect(page.locator("span").filter({ hasText: /0 messages/ })).toBeVisible({ timeout: 10_000 });
  });
});
