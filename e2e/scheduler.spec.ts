import { test, expect } from "./fixtures";
import {
  CreateQueueCommand,
  DeleteQueueCommand,
  GetQueueAttributesCommand,
  PurgeQueueCommand,
} from "@aws-sdk/client-sqs";
import { DeleteScheduleGroupCommand } from "@aws-sdk/client-scheduler";
import { requireLocalStack, makeClients, unique } from "./helpers";

// Note: LocalStack community mocks Scheduler CRUD only and does not execute
// schedules or trigger targets. This spec exercises full UI CRUD without
// asserting execution.
test.describe("EventBridge Scheduler e2e", () => {
  const { scheduler, sqs } = makeClients();
  const groupName = unique("e2e-group");
  const schedName = unique("e2e-sched");
  const queueName = unique("e2e-sched-target");
  let queueUrl: string;
  let queueArn: string;

  test.beforeAll(async () => {
    await requireLocalStack();

    // Seed target SQS queue
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
    try {
      if (queueUrl) {
        await sqs.send(new PurgeQueueCommand({ QueueUrl: queueUrl })).catch(() => {});
        await sqs.send(new DeleteQueueCommand({ QueueUrl: queueUrl }));
      }
    } catch (err) {
      console.warn(`Queue cleanup failed for ${queueName}:`, err);
    }

    try {
      await scheduler.send(
        new DeleteScheduleGroupCommand({ Name: groupName }),
      ).catch(() => {});
    } catch {
      // ignore
    }
  });

  test("creates group, schedule with payload, inspects payload, disables schedule, and deletes", async ({
    page,
  }) => {
    await page.goto("/");

    // 1. Open Scheduler via sidebar
    await page
      .locator("aside")
      .getByRole("button", { name: /^EventBridge Scheduler/ })
      .click();
    await expect(
      page.getByRole("heading", { name: "EventBridge Scheduler" }),
    ).toBeVisible();

    // 2. Create custom schedule group
    await page.getByRole("button", { name: "Create group" }).click();
    const createGroupDialog = page.getByRole("dialog");
    await expect(createGroupDialog).toBeVisible();
    await createGroupDialog.getByLabel(/Group name/i).fill(groupName);
    await createGroupDialog.getByRole("button", { name: "Create group" }).click();
    await expect(createGroupDialog).not.toBeVisible();

    // 3. Tab opens for the new group
    await expect(page.getByRole("tab", { name: groupName })).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByRole("heading", { name: groupName })).toBeVisible();

    // Execution note is displayed
    await expect(
      page.getByText(
        /LocalStack community stores schedules but does not execute them/,
      ),
    ).toBeVisible();

    // 4. Create schedule
    await page.getByRole("button", { name: "Create schedule" }).first().click();
    const createSchedDialog = page.getByRole("dialog");
    await expect(createSchedDialog).toBeVisible();

    await createSchedDialog.getByLabel(/Schedule name/i).fill(schedName);
    await createSchedDialog
      .getByLabel("Expression", { exact: true })
      .fill("rate(1 day)");

    // Target picker: select queue
    await createSchedDialog.getByRole("combobox", { name: /Queue/i }).click();
    await page.getByRole("option", { name: new RegExp(queueName) }).click();
    await expect(createSchedDialog.getByText(queueArn)).toBeVisible();

    // Optional input payload
    await createSchedDialog
      .getByLabel(/Input \(JSON/i)
      .fill('{"s":"e2e"}');

    await createSchedDialog
      .getByRole("button", { name: "Create schedule" })
      .click();
    await expect(createSchedDialog).not.toBeVisible();

    // 5. Schedule row appears in table with ENABLED badge
    const schedRow = page.locator("table").filter({ hasText: schedName });
    await expect(schedRow).toBeVisible({ timeout: 10_000 });
    await expect(schedRow.getByText("ENABLED")).toBeVisible();
    await expect(schedRow.getByText("rate(1 day)")).toBeVisible();
    await expect(schedRow.getByText(queueArn)).toBeVisible();

    // 6. Inspect payload via detail dialog
    await schedRow.getByText(schedName).click();
    const detailDialog = page.getByRole("dialog");
    await expect(detailDialog).toBeVisible();
    await expect(detailDialog.getByText('"s": "e2e"')).toBeVisible();
    await detailDialog.getByRole("button", { name: "Close" }).first().click();
    await expect(detailDialog).not.toBeVisible();

    // 7. Toggle schedule state (ENABLED -> DISABLED)
    await schedRow
      .getByRole("button", { name: new RegExp(`Actions for ${schedName}`) })
      .click();
    await page.getByRole("menuitem", { name: "Disable" }).click();
    await expect(schedRow.getByText("DISABLED")).toBeVisible({ timeout: 10_000 });

    // 8. Delete schedule via UI
    await schedRow
      .getByRole("button", { name: new RegExp(`Actions for ${schedName}`) })
      .click();
    await page.getByRole("menuitem", { name: /Delete schedule/i }).click();
    const deleteSchedConfirm = page.getByRole("dialog");
    await expect(deleteSchedConfirm).toBeVisible();
    await deleteSchedConfirm.getByRole("button", { name: "Delete" }).click();
    await expect(deleteSchedConfirm).not.toBeVisible();
    await expect(schedRow).not.toBeVisible();

    // 9. Delete schedule group
    await page.getByRole("button", { name: "Delete", exact: true }).click();
    const deleteGroupConfirm = page.getByRole("dialog");
    await expect(deleteGroupConfirm).toBeVisible();
    await deleteGroupConfirm.getByRole("button", { name: "Delete" }).click();
    await expect(deleteGroupConfirm).not.toBeVisible();

    // Tab closes
    await expect(page.getByRole("tab", { name: groupName })).not.toBeVisible();
  });
});
