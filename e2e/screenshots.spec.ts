import { setTimeout as delay } from "node:timers/promises";
import { test, expect } from "@playwright/test";
import {
  CreateBucketCommand,
  PutObjectCommand,
  ListObjectsV2Command,
  DeleteObjectsCommand,
  DeleteBucketCommand,
} from "@aws-sdk/client-s3";
import {
  CreateQueueCommand,
  SendMessageCommand,
  GetQueueUrlCommand,
  DeleteQueueCommand,
} from "@aws-sdk/client-sqs";
import {
  CreateFunctionCommand,
  DeleteFunctionCommand,
  GetFunctionConfigurationCommand,
} from "@aws-sdk/client-lambda";
import { zipSync, strToU8 } from "fflate";
import { requireLocalStack, makeClients, unique } from "./helpers";

test.describe("@screenshot Capture screenshots", () => {
  test.use({ viewport: { width: 1600, height: 1000 } });

  const { s3, sqs, lambda } = makeClients();
  const bucketName = unique("demo-assets");
  const queueName = unique("order-processing");
  const functionName = unique("process-webhook");

  test.beforeAll(async () => {
    await requireLocalStack();

    // 1. Seed S3 bucket with photogenic assets
    await s3.send(new CreateBucketCommand({ Bucket: bucketName }));
    await s3.send(
      new PutObjectCommand({
        Bucket: bucketName,
        Key: "config.json",
        Body: JSON.stringify(
          {
            service: "localstacker",
            environment: "local-dev",
            debug: true,
            maxConnections: 50,
            features: {
              s3Preview: true,
              sqsPeek: true,
              lambdaLogs: true,
            },
          },
          null,
          2
        ),
      })
    );
    await s3.send(
      new PutObjectCommand({
        Bucket: bucketName,
        Key: "notes.txt",
        Body: "LocalStacker release engineering and e2e testing suite.\nAll services local-first.",
      })
    );
    await s3.send(
      new PutObjectCommand({
        Bucket: bucketName,
        Key: "data/users.json",
        Body: JSON.stringify([{ id: 1, name: "Alice" }, { id: 2, name: "Bob" }], null, 2),
      })
    );

    // 2. Seed SQS queue with messages
    const qRes = await sqs.send(new CreateQueueCommand({ QueueName: queueName }));
    if (qRes.QueueUrl) {
      await sqs.send(
        new SendMessageCommand({
          QueueUrl: qRes.QueueUrl,
          MessageBody: JSON.stringify(
            {
              orderId: "ord-9482",
              customer: "jane@example.com",
              items: [{ sku: "PRO-100", qty: 2 }],
              total: 49.99,
            },
            null,
            2
          ),
        })
      );
      await sqs.send(
        new SendMessageCommand({
          QueueUrl: qRes.QueueUrl,
          MessageBody: JSON.stringify(
            {
              orderId: "ord-9483",
              customer: "alex@example.com",
              items: [{ sku: "PRO-250", qty: 1 }],
              total: 89.5,
            },
            null,
            2
          ),
        })
      );
    }

    // 3. Seed Lambda function
    const codeZip = zipSync({
      "index.js": strToU8(
        `exports.handler = async (event) => {
  console.log("INFO: Received webhook event payload");
  console.log("DEBUG: Validating payload signature...");
  console.log("INFO: Webhook processed successfully for " + (event.customerId || "guest"));
  return {
    statusCode: 200,
    status: "success",
    eventId: "evt_99182",
    received: event
  };
};`
      ),
    });

    await lambda.send(
      new CreateFunctionCommand({
        FunctionName: functionName,
        Runtime: "nodejs22.x",
        Handler: "index.handler",
        Role: "arn:aws:iam::000000000000:role/irrelevant",
        Code: { ZipFile: codeZip },
      })
    );

    // Wait for function to become active
    const start = Date.now();
    while (Date.now() - start < 30_000) {
      const cfg = await lambda.send(
        new GetFunctionConfigurationCommand({ FunctionName: functionName })
      );
      if (cfg.State === "Active") break;
      await delay(500);
    }
  });

  test.afterAll(async () => {
    // Cleanup S3
    try {
      let token: string | undefined;
      do {
        const list = await s3.send(
          new ListObjectsV2Command({ Bucket: bucketName, ContinuationToken: token })
        );
        if (list.Contents && list.Contents.length > 0) {
          await s3.send(
            new DeleteObjectsCommand({
              Bucket: bucketName,
              Delete: { Objects: list.Contents.map((o) => ({ Key: o.Key! })) },
            })
          );
        }
        token = list.NextContinuationToken;
      } while (token);
      await s3.send(new DeleteBucketCommand({ Bucket: bucketName }));
    } catch (err) {
      console.warn("S3 screenshot cleanup error:", err);
    }

    // Cleanup SQS
    try {
      const q = await sqs.send(new GetQueueUrlCommand({ QueueName: queueName }));
      if (q.QueueUrl) {
        await sqs.send(new DeleteQueueCommand({ QueueUrl: q.QueueUrl }));
      }
    } catch (err) {
      console.warn("SQS screenshot cleanup error:", err);
    }

    // Cleanup Lambda
    try {
      await lambda.send(new DeleteFunctionCommand({ FunctionName: functionName }));
    } catch (err) {
      console.warn("Lambda screenshot cleanup error:", err);
    }
  });

  test("captures s3-bucket, sqs-peek, and lambda-invoke screenshots", async ({ page }) => {
    // 1. S3 bucket screenshot with preview
    await page.goto("/");
    await page.locator("aside").getByRole("button", { name: /S3/ }).click();
    const bucketRow = page.getByText(bucketName, { exact: true });
    await expect(bucketRow).toBeVisible({ timeout: 15_000 });
    await bucketRow.click();

    await expect(page.getByText("config.json")).toBeVisible();
    await page.getByText("config.json").click();
    const previewDialog = page.getByRole("dialog");
    await expect(previewDialog).toBeVisible();
    await expect(previewDialog.getByText("local-dev")).toBeVisible();
    await page.screenshot({ path: "docs/screenshots/s3-bucket.png", animations: "disabled" });

    // Close preview dialog
    await previewDialog.getByRole("button", { name: "Close" }).click();
    await expect(previewDialog).not.toBeVisible();

    // 2. SQS peek screenshot
    await page.locator("aside").getByRole("button", { name: /SQS/ }).click();
    const queueRow = page.getByText(queueName, { exact: true });
    await expect(queueRow).toBeVisible({ timeout: 15_000 });
    await queueRow.click();

    await page.getByRole("button", { name: "Peek messages" }).click();
    await expect(page.getByText(/ord-9482/)).toBeVisible({ timeout: 10_000 });
    await page.screenshot({ path: "docs/screenshots/sqs-peek.png", animations: "disabled" });

    // 3. Lambda invoke screenshot
    await page.locator("aside").getByRole("button", { name: /Lambda/ }).click();
    const fnRow = page.getByText(functionName, { exact: true });
    await expect(fnRow).toBeVisible({ timeout: 15_000 });
    await fnRow.click();

    await page.getByRole("button", { name: "Invoke", exact: true }).click();
    const invokeDialog = page.getByRole("dialog");
    await expect(invokeDialog).toBeVisible();

    await invokeDialog.locator("#invoke-payload").fill(
      JSON.stringify(
        {
          action: "payment.succeeded",
          amount: 4900,
          currency: "usd",
          customerId: "cus_1048",
        },
        null,
        2
      )
    );
    await invokeDialog.getByRole("button", { name: "Invoke", exact: true }).click();

    await expect(invokeDialog.getByText("200", { exact: true })).toBeVisible({ timeout: 15_000 });
    await expect(invokeDialog.getByText("INFO: Webhook processed successfully")).toBeVisible();
    await page.screenshot({ path: "docs/screenshots/lambda-invoke.png", animations: "disabled" });
  });
});
