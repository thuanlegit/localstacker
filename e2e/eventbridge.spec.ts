import { test, expect } from "@playwright/test";
import { setTimeout as delay } from "node:timers/promises";
import {
  CreateQueueCommand,
  DeleteQueueCommand,
  GetQueueAttributesCommand,
  ReceiveMessageCommand,
  PurgeQueueCommand,
} from "@aws-sdk/client-sqs";
import { DeleteEventBusCommand } from "@aws-sdk/client-eventbridge";
import { requireLocalStack, makeClients, unique } from "./helpers";

test.describe("EventBridge e2e", () => {
  const { eventbridge, sqs } = makeClients();
  const busName = unique("e2e-eb-bus");
  const ruleName = unique("e2e-rule");
  const queueName = unique("e2e-eb-target");
  let queueUrl: string;
  let queueArn: string;

  test.beforeAll(async () => {
    await requireLocalStack();

    // 1. Seed an SQS queue as target
    const qRes = await sqs.send(new CreateQueueCommand({ QueueName: queueName }));
    queueUrl = qRes.QueueUrl!;

    const attrs = await sqs.send(
      new GetQueueAttributesCommand({
        QueueUrl: queueUrl,
        AttributeNames: ["QueueArn"],
      }),
    );
    queueArn = attrs.Attributes!.QueueArn!;
  });

  test.afterAll(async () => {
    // Best-effort SDK cleanup
    try {
      if (queueUrl) {
        await sqs.send(new PurgeQueueCommand({ QueueUrl: queueUrl })).catch(() => {});
        await sqs.send(new DeleteQueueCommand({ QueueUrl: queueUrl }));
      }
    } catch (err) {
      console.warn(`Queue cleanup failed for ${queueName}:`, err);
    }

    try {
      await sqs.send(new PurgeQueueCommand({ QueueUrl: queueUrl })).catch(() => {});
    } catch {
      // ignore
    }

    try {
      await eventbridge.send(
        new DeleteEventBusCommand({ Name: busName }),
      ).catch(() => {});
    } catch {
      // ignore
    }
  });

  test("creates bus, rule, and SQS target, publishes matched event, and asserts delivery on queue", async ({
    page,
  }) => {
    await page.goto("/");

    // 1. Navigate to EventBridge via sidebar
    await page.locator("aside").getByRole("button", { name: /^EventBridge Event buses/ }).click();
    await expect(page.getByRole("heading", { name: "EventBridge" })).toBeVisible();

    // 2. Create a custom event bus
    await page.getByRole("button", { name: "Create bus" }).click();
    const createBusDialog = page.getByRole("dialog");
    await expect(createBusDialog).toBeVisible();
    await createBusDialog.getByLabel(/Bus name/i).fill(busName);
    await createBusDialog.getByRole("button", { name: "Create bus" }).click();
    await expect(createBusDialog).not.toBeVisible();

    // 3. Tab opens for the new bus
    await expect(page.getByRole("tab", { name: busName })).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole("heading", { name: busName })).toBeVisible();

    // 4. Create rule with an event pattern
    await page.getByRole("button", { name: "Create rule" }).first().click();
    const ruleDialog = page.getByRole("dialog");
    await expect(ruleDialog).toBeVisible();
    await ruleDialog.getByLabel(/Rule name/i).fill(ruleName);
    await ruleDialog
      .getByLabel("Event pattern (JSON)")
      .fill('{"source":["e2e.source"]}');
    await ruleDialog.getByRole("button", { name: "Create rule" }).click();
    await expect(ruleDialog).not.toBeVisible();

    // Rule appears in rules table with ENABLED badge
    const ruleRow = page.locator("table").filter({ hasText: ruleName });
    await expect(ruleRow).toBeVisible({ timeout: 10_000 });
    await expect(ruleRow.getByText("ENABLED")).toBeVisible();

    // 5. Add the SQS queue as a target
    await page.getByRole("button", { name: "Add target" }).click();
    const targetDialog = page.getByRole("dialog");
    await expect(targetDialog).toBeVisible();

    // Target type defaults to "SQS queue"; open the queue select and pick the seeded queue
    await targetDialog.getByRole("combobox", { name: /Queue/i }).click();
    await page.getByRole("option", { name: new RegExp(queueName) }).click();

    // ARN preview reflects the picked queue
    await expect(targetDialog.getByText(queueArn)).toBeVisible();
    await targetDialog.getByRole("button", { name: "Add target" }).click();
    await expect(targetDialog).not.toBeVisible();

    // Target row appears with SQS type and the queue ARN
    await expect(page.locator("table").getByText(queueArn)).toBeVisible({ timeout: 10_000 });

    // 6. Publish test event via modal
    await page.getByRole("button", { name: /Publish test event/i }).click();
    const pubDialog = page.getByRole("dialog");
    await expect(pubDialog).toBeVisible();

    await pubDialog.getByLabel("Source").fill("e2e.source");
    await pubDialog.getByLabel("Detail type").fill("e2e");
    await pubDialog.getByLabel("Detail (JSON object)").fill('{"match":"yes"}');
    await pubDialog.getByRole("button", { name: "Publish event" }).click();
    await expect(pubDialog).not.toBeVisible();
    await expect(page.getByText("Event published")).toBeVisible();

    // 7. Poll SQS queue with SDK to assert message delivery
    let receivedMessage: { Body?: string } | undefined;
    for (let i = 0; i < 20; i++) {
      const recv = await sqs.send(
        new ReceiveMessageCommand({
          QueueUrl: queueUrl,
          MaxNumberOfMessages: 1,
          WaitTimeSeconds: 1,
        }),
      );
      if (recv.Messages && recv.Messages.length > 0) {
        receivedMessage = recv.Messages[0];
        break;
      }
      await delay(500);
    }

    expect(receivedMessage).toBeDefined();
    expect(receivedMessage?.Body).toBeDefined();

    const body = JSON.parse(receivedMessage!.Body!);
    expect(body.source).toBe("e2e.source");
    expect(body["detail-type"]).toBe("e2e");
    expect(body.detail).toEqual({ match: "yes" });

    // 8. Delete target via UI
    const targetRow = page.locator("tr").filter({ hasText: queueArn });
    await targetRow.getByRole("button", { name: /Actions for target/ }).click();
    await page.getByRole("menuitem", { name: /Remove target/i }).click();
    const removeConfirm = page.getByRole("dialog");
    await expect(removeConfirm).toBeVisible();
    await removeConfirm.getByRole("button", { name: "Remove" }).click();
    await expect(removeConfirm).not.toBeVisible();

    // 9. Delete rule via UI
    await ruleRow.getByRole("button", { name: new RegExp(`Actions for rule ${ruleName}`) }).click();
    await page.getByRole("menuitem", { name: /Delete rule/i }).click();
    const deleteRuleConfirm = page.getByRole("dialog");
    await expect(deleteRuleConfirm).toBeVisible();
    await deleteRuleConfirm.getByRole("button", { name: "Delete" }).click();
    await expect(deleteRuleConfirm).not.toBeVisible();

    // 10. Delete bus via UI
    await page.getByRole("button", { name: "Delete", exact: true }).click();
    const deleteBusConfirm = page.getByRole("dialog");
    await expect(deleteBusConfirm).toBeVisible();
    await deleteBusConfirm.getByRole("button", { name: "Delete" }).click();
    await expect(deleteBusConfirm).not.toBeVisible();

    // Bus tab closes
    await expect(page.getByRole("tab", { name: busName })).not.toBeVisible();
  });
});
