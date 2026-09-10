import { setTimeout as delay } from "node:timers/promises";
import { test, expect } from "@playwright/test";
import {
  CreateFunctionCommand,
  DeleteFunctionCommand,
  GetFunctionConfigurationCommand,
} from "@aws-sdk/client-lambda";
import {
  CreateQueueCommand,
  DeleteQueueCommand,
  GetQueueAttributesCommand,
} from "@aws-sdk/client-sqs";
import { zipSync, strToU8 } from "fflate";
import { requireLocalStack, makeClients, unique } from "./helpers";

test.describe("Lambda SQS Trigger e2e", () => {
  const { lambda, sqs } = makeClients();
  const functionName = unique("e2e-trig-fn");
  const queueName = unique("e2e-trig-q");
  let queueUrl: string;

  test.beforeAll(async () => {
    await requireLocalStack();

    // 1. Create SQS Queue
    const qRes = await sqs.send(new CreateQueueCommand({ QueueName: queueName }));
    queueUrl = qRes.QueueUrl!;

    // Wait for Queue attributes (especially ARN)
    await sqs.send(
      new GetQueueAttributesCommand({
        QueueUrl: queueUrl,
        AttributeNames: ["QueueArn"],
      }),
    );

    // 2. Create Lambda function
    const codeZip = zipSync({
      "index.js": strToU8(
        "exports.handler = async (event) => { console.log('processed', event); return { status: 'ok' }; };",
      ),
    });

    await lambda.send(
      new CreateFunctionCommand({
        FunctionName: functionName,
        Runtime: "nodejs22.x",
        Handler: "index.handler",
        Role: "arn:aws:iam::000000000000:role/irrelevant",
        Code: { ZipFile: codeZip },
      }),
    );

    const start = Date.now();
    while (Date.now() - start < 30_000) {
      const cfg = await lambda.send(
        new GetFunctionConfigurationCommand({ FunctionName: functionName }),
      );
      if (cfg.State === "Active") break;
      await delay(500);
    }
  });

  test.afterAll(async () => {
    try {
      await lambda.send(new DeleteFunctionCommand({ FunctionName: functionName }));
    } catch (err) {
      console.warn(`Failed to cleanup function ${functionName}:`, err);
    }
    try {
      if (queueUrl) {
        await sqs.send(new DeleteQueueCommand({ QueueUrl: queueUrl }));
      }
    } catch (err) {
      console.warn(`Failed to cleanup queue ${queueName}:`, err);
    }
  });

  test("attaches SQS queue trigger to Lambda, verifies in UI, and verifies badge on queue", async ({
    page,
  }) => {
    await page.goto("/");

    // 1. Navigate to Lambda function
    await page.locator("aside").getByRole("button", { name: /Lambda/ }).click();
    const fnItem = page.getByText(functionName, { exact: true });
    await expect(fnItem).toBeVisible({ timeout: 15_000 });
    await fnItem.click();

    // 2. Locate Triggers section
    await expect(page.getByText("Triggers & Event Sources")).toBeVisible();
    await expect(
      page.getByText("No event source triggers configured"),
    ).toBeVisible();

    // 3. Open Add Trigger dialog
    await page
      .getByRole("button", { name: "Add SQS Trigger", exact: true })
      .click();
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByText("Add Event Source Trigger")).toBeVisible();

    // 4. Select the seeded SQS queue
    // Open the dropdown
    const selectTrigger = dialog.locator("#sqs-select");
    await selectTrigger.click();
    const queueOption = page.getByRole("option", { name: new RegExp(queueName) });
    await expect(queueOption).toBeVisible({ timeout: 5_000 });
    await queueOption.click();

    // 5. Submit Add Trigger
    await dialog.getByRole("button", { name: "Add Trigger" }).click();

    // 6. Verify trigger row appears in the Lambda triggers table
    const triggerRow = page.locator("tr", { hasText: queueName });
    await expect(triggerRow.getByText("sqs", { exact: true })).toBeVisible();
    await expect(triggerRow.getByText("10 msgs")).toBeVisible();

    // 7. Navigate to SQS in sidebar and open the queue
    await page.locator("aside").getByRole("button", { name: /^SQS/ }).click();
    const qItem = page.getByText(queueName, { exact: true });
    await expect(qItem).toBeVisible({ timeout: 15_000 });
    await qItem.click();

    // 8. Verify the attached Lambda function badge appears in the queue header
    const lambdaBadge = page.getByTitle(new RegExp(`Attached to Lambda: ${functionName}`));
    await expect(lambdaBadge).toBeVisible({ timeout: 10_000 });
  });
});
