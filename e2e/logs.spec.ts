import { test, expect } from "@playwright/test";
import {
  CreateLogGroupCommand,
  CreateLogStreamCommand,
  DeleteLogGroupCommand,
  PutLogEventsCommand,
} from "@aws-sdk/client-cloudwatch-logs";
import { requireLocalStack, makeClients, unique } from "./helpers";

test.describe("CloudWatch Logs e2e", () => {
  const { logs } = makeClients();
  const groupName = `/e2e/${unique("logs")}`;
  const streamName = "stream-1";
  const groupsToClean: string[] = [];

  test.beforeAll(async () => {
    await requireLocalStack();

    await logs.send(new CreateLogGroupCommand({ logGroupName: groupName }));
    groupsToClean.push(groupName);

    await logs.send(
      new CreateLogStreamCommand({
        logGroupName: groupName,
        logStreamName: streamName,
      }),
    );

    const now = Date.now();
    await logs.send(
      new PutLogEventsCommand({
        logGroupName: groupName,
        logStreamName: streamName,
        logEvents: [
          { timestamp: now - 3000, message: "INFO Application started" },
          {
            timestamp: now - 2000,
            message: "ERROR Database connection timed out",
          },
          { timestamp: now - 1000, message: "INFO Server listening on 8080" },
        ],
      }),
    );
  });

  test.afterAll(async () => {
    for (const g of groupsToClean) {
      try {
        await logs.send(new DeleteLogGroupCommand({ logGroupName: g }));
      } catch (err) {
        console.warn(`Cleanup failed for group ${g}:`, err);
      }
    }
  });

  test("browses log groups, inspects events, searches, live tails, deletes stream, and creates/deletes group", async ({
    page,
  }) => {
    await page.goto("/");

    // 1. Open CloudWatch Logs via sidebar
    await page.locator("aside").getByRole("button", { name: /Logs/ }).click();

    // 2. Open seeded log group
    const groupRow = page.getByText(groupName, { exact: true });
    await expect(groupRow).toBeVisible({ timeout: 15_000 });
    await groupRow.click();

    // 3. Events visible in viewer
    await expect(
      page.getByText("INFO Application started"),
    ).toBeVisible({ timeout: 10_000 });
    await expect(
      page.getByText("ERROR Database connection timed out"),
    ).toBeVisible();
    await expect(
      page.getByText("INFO Server listening on 8080"),
    ).toBeVisible();

    // 4. Search filter narrows to 1 matching event
    const searchInput = page.getByPlaceholder(/Search \/ filter pattern/i);
    await searchInput.fill("ERROR");
    await expect(
      page.getByText("ERROR Database connection timed out"),
    ).toBeVisible();
    await expect(
      page.getByText("INFO Application started"),
    ).not.toBeVisible({ timeout: 5000 });

    // 5. Clear filter, enable live tailing
    await searchInput.fill("");
    await expect(
      page.getByText("INFO Application started"),
    ).toBeVisible({ timeout: 5000 });

    await page.getByRole("button", { name: "Live tail" }).click();
    await expect(page.getByText("Pause tail")).toBeVisible();

    // 6. SDK PutLogEvents one new event
    const liveMsg = `DEBUG Live tail event ${Date.now()}`;
    await logs.send(
      new PutLogEventsCommand({
        logGroupName: groupName,
        logStreamName: streamName,
        logEvents: [{ timestamp: Date.now(), message: liveMsg }],
      }),
    );

    // Live tail picks it up within 15s
    await expect(page.getByText(liveMsg)).toBeVisible({ timeout: 15_000 });

    // Pause tail
    await page.getByRole("button", { name: "Pause tail" }).click();

    // 7. Delete stream via UI
    await page.getByRole("tabpanel").getByRole("combobox").click();
    await page.getByRole("option", { name: streamName }).click();

    await page.getByTitle(`Delete stream ${streamName}`).click();
    const streamDelDialog = page.getByRole("dialog");
    await expect(streamDelDialog).toBeVisible();
    await streamDelDialog
      .getByRole("button", { name: "Delete stream" })
      .click();
    await expect(streamDelDialog).not.toBeVisible();

    // 8. Create group via UI and delete via UI
    await page.locator("aside").getByRole("button", { name: /Logs/ }).click();
    await page.getByRole("button", { name: "Create log group" }).click();

    const createDialog = page.getByRole("dialog");
    await expect(createDialog).toBeVisible();
    const uiGroup = `/e2e/${unique("ui-logs")}`;
    groupsToClean.push(uiGroup);

    await createDialog.getByLabel(/Log group name/i).fill(uiGroup);
    await createDialog
      .getByRole("button", { name: "Create log group" })
      .click();
    await expect(createDialog).not.toBeVisible();
    // Newly created group opens in a new tab
    await expect(page.getByRole("tab", { name: uiGroup })).toBeVisible({
      timeout: 15_000,
    });

    // Delete uiGroup via header action
    await page.getByRole("button", { name: "Delete group" }).click();
    const delDialog = page.getByRole("dialog");
    await delDialog.getByRole("button", { name: "Delete log group" }).click();
    await expect(delDialog).not.toBeVisible();

    // Tab is closed
    await expect(page.getByRole("tab", { name: uiGroup })).not.toBeVisible();
  });
});
