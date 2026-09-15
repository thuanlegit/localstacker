import { test, expect } from "./fixtures";
import { requireLocalStack, makeClients, unique } from "./helpers";
import { DeleteAlarmsCommand } from "@aws-sdk/client-cloudwatch";

test.describe("CloudWatch e2e", () => {
  const { cloudwatch } = makeClients();
  const namespace = unique("e2e-ns").replace(/[^a-zA-Z0-9_-]/g, "-");
  const metricName = "OrderCount";
  const alarmName = unique("e2e-alarm");

  test.beforeAll(async () => {
    await requireLocalStack();
  });

  test.afterAll(async () => {
    try {
      await cloudwatch.send(new DeleteAlarmsCommand({ AlarmNames: [alarmName] }));
    } catch (err) {
      console.warn(`Alarm cleanup failed for ${alarmName}:`, err);
    }
  });

  test("puts a metric, creates an alarm, and shows caller identity", async ({
    page,
  }) => {
    test.setTimeout(90_000);
    await page.goto("/");

    // 1. Publish a datapoint through the UI dialog
    await page.locator("aside").getByRole("button", { name: "CloudWatch Metrics & alarms" }).click();
    await page.getByRole("button", { name: "Put metric data" }).click();
    const putDialog = page.getByRole("dialog");
    await expect(putDialog).toBeVisible();
    await putDialog.getByLabel("Namespace").fill(namespace);
    await putDialog.getByLabel("Metric name").fill(metricName);
    await putDialog.getByLabel("Value").fill("42");
    await putDialog.getByRole("button", { name: "Publish" }).click();
    await expect(putDialog).not.toBeVisible();

    // 2. The metric surfaces in the browser (refetch may lag)
    await expect(async () => {
      await page.getByRole("button", { name: "Refresh" }).click();
      await expect(page.getByText(metricName).first()).toBeVisible();
    }).toPass({ timeout: 20_000 });
    await expect(page.getByText(namespace).first()).toBeVisible();

    // 3. Create a threshold alarm through the UI dialog
    await page.getByRole("button", { name: "Create alarm" }).click();
    const alarmDialog = page.getByRole("dialog");
    await expect(alarmDialog).toBeVisible();
    await alarmDialog.getByLabel("Alarm name").fill(alarmName);
    await alarmDialog.getByLabel("Namespace").fill(namespace);
    await alarmDialog.getByLabel("Metric").fill(metricName);
    await alarmDialog.getByLabel("Threshold").fill("10");
    await alarmDialog.getByRole("button", { name: "Create alarm" }).click();
    await expect(alarmDialog).not.toBeVisible();

    // 4. Alarm row renders with its state
    await expect(page.getByText(alarmName).first()).toBeVisible({ timeout: 15_000 });

    // LocalStack 4.14 evaluates alarms lazily and nondeterministically: the
    // same create flow has been observed settling on OK (missing datapoint
    // treated as non-breaching), ALARM (breaching datapoint), or staying
    // INSUFFICIENT_DATA past 15s. The state VALUE belongs to LocalStack's
    // evaluator — the app contract is that the chip renders a real state.
    await expect(page.getByText(/^(OK|ALARM|INSUFFICIENT DATA)$/).first()).toBeVisible({
      timeout: 20_000,
    });

    // 5. Home shows the STS caller identity chip
    await page.getByRole("button", { name: "Close all tabs" }).click();
    await expect(page.getByText(/acct 000000000000/)).toBeVisible({
      timeout: 15_000,
    });
  });
});
