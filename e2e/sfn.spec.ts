import { test, expect } from "./fixtures";
import {
  CreateStateMachineCommand,
  DeleteStateMachineCommand,
  DescribeExecutionCommand,
  ListExecutionsCommand,
} from "@aws-sdk/client-sfn";
import { requireLocalStack, makeClients, unique } from "./helpers";

test.describe("Step Functions e2e", () => {
  const { sfn } = makeClients();
  const machineName = unique("e2e-sfn");

  let machineArn: string;

  // Three states + synthetic start/end = 5 graph nodes.
  const definition = JSON.stringify({
    Comment: "LocalStacker e2e state machine",
    StartAt: "Compute",
    States: {
      Compute: { Type: "Pass", Next: "Tag" },
      Tag: { Type: "Pass", Next: "Done" },
      Done: { Type: "Succeed" },
    },
  });

  test.beforeAll(async () => {
    await requireLocalStack();
    const res = await sfn.send(
      new CreateStateMachineCommand({
        name: machineName,
        definition: definition,
        roleArn: "arn:aws:iam::000000000000:role/localstacker",
      }),
    );
    machineArn = res.stateMachineArn!;
  });

  test.afterAll(async () => {
    if (!machineArn) return;
    try {
      await sfn.send(new DeleteStateMachineCommand({ stateMachineArn: machineArn }));
    } catch (err) {
      console.warn(`State machine cleanup failed for ${machineName}:`, err);
    }
  });

  test("renders seeded machine with graph, runs execution, and shows event history", async ({
    page,
  }) => {
    await page.goto("/");

    // 1. Open Step Functions via sidebar
    await page.locator("aside").getByRole("button", { name: /Step Functions/ }).click();

    // 2. Seeded machine row is visible
    const row = page.locator("table").getByText(machineName);
    await expect(row).toBeVisible({ timeout: 15_000 });

    // 3. Open the machine — graph canvas shows 3 states + start/end
    await row.click();
    await expect(page.locator(".react-flow")).toBeVisible({ timeout: 15_000 });
    await expect(page.locator(".react-flow__node")).toHaveCount(5);

    // 4. Start an execution from the test runner dialog
    await page.getByRole("button", { name: /Start execution/i }).first().click();
    const startDialog = page.getByRole("dialog");
    await expect(startDialog).toBeVisible();
    await startDialog.getByLabel(/Input \(JSON/i).fill('{"value":1}');
    await startDialog.getByRole("button", { name: "Start execution" }).click();
    await expect(startDialog).not.toBeVisible();

    // 5. Execution reaches SUCCEEDED (poll via table refetch, ≤ 10s)
    await expect(
      page.locator("table").getByText("SUCCEEDED").first(),
    ).toBeVisible({ timeout: 10_000 });

    // 6. Select the execution — event history timeline appears
    await page
      .locator("table")
      .filter({ hasText: "SUCCEEDED" })
      .locator("tbody tr")
      .first()
      .click();
    await expect(page.getByText("ExecutionStarted")).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText("ExecutionSucceeded")).toBeVisible({ timeout: 10_000 });

    // 7. SDK ground truth: the execution actually succeeded
    const listed = await sfn.send(
      new ListExecutionsCommand({ stateMachineArn: machineArn, maxResults: 1 }),
    );
    const executionArn = listed.executions![0].executionArn!;
    const status = await sfn.send(
      new DescribeExecutionCommand({ executionArn }),
    );
    expect(status.status).toBe("SUCCEEDED");
  });
});
