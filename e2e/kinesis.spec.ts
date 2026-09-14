import { test, expect } from "./fixtures";
import { setTimeout as delay } from "node:timers/promises";
import {
  DeleteStreamCommand,
  DescribeStreamSummaryCommand,
} from "@aws-sdk/client-kinesis";
import { requireLocalStack, makeClients, unique } from "./helpers";

test.describe("Kinesis e2e", () => {
  const { kinesis } = makeClients();
  const streamName = unique("e2e-kinesis");

  test.beforeAll(async () => {
    await requireLocalStack();
  });

  test.afterAll(async () => {
    try {
      await kinesis.send(new DeleteStreamCommand({ StreamName: streamName }));
    } catch (err) {
      console.warn(`Stream cleanup failed for ${streamName}:`, err);
    }
  });

  test("creates a stream, publishes a record, and peeks the decoded payload", async ({
    page,
  }) => {
    test.setTimeout(90_000);
    await requireLocalStack();
    await page.goto("/");

    // 1. Create stream via UI dialog; the app auto-opens the stream view
    await page.locator("aside").getByRole("button", { name: /Kinesis/ }).click();
    await page.getByRole("button", { name: "Create stream" }).click();
    const createDialog = page.getByRole("dialog");
    await expect(createDialog).toBeVisible();
    await createDialog.getByLabel(/Stream name/i).fill(streamName);
    await createDialog.getByRole("button", { name: "Create stream" }).click();
    await expect(createDialog).not.toBeVisible();

    // 2. Stream becomes ACTIVE (SDK-side), then the stream view reflects it
    for (let i = 0; i < 60; i++) {
      try {
        const summary = await kinesis.send(
          new DescribeStreamSummaryCommand({ StreamName: streamName }),
        );
        if (summary.StreamDescriptionSummary?.StreamStatus === "ACTIVE") break;
      } catch {
        // stream not yet visible
      }
      await delay(500);
    }
    await expect(page.getByRole("heading", { name: streamName })).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByText("ACTIVE").first()).toBeVisible({ timeout: 15_000 });

    // 3. Put a record through the UI dialog
    await page.getByRole("button", { name: "Put record" }).click();
    const putDialog = page.getByRole("dialog");
    await expect(putDialog).toBeVisible();
    await putDialog.getByLabel(/Partition key/i).fill("p1");
    await putDialog.getByLabel(/Data/i).fill("hello kinesis");
    await putDialog.getByRole("button", { name: "Publish" }).click();
    await expect(putDialog).not.toBeVisible();

    // 4. Peek the shard; records propagate asynchronously, so re-click on miss
    await expect(async () => {
      await page.getByRole("button", { name: "Peek", exact: true }).click();
      await expect(page.getByText("hello kinesis").first()).toBeVisible();
    }).toPass({ timeout: 20_000 });
  });
});
