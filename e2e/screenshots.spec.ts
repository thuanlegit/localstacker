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
import {
  CreateTableCommand,
  DescribeTableCommand,
  DeleteTableCommand,
} from "@aws-sdk/client-dynamodb";
import { PutCommand } from "@aws-sdk/lib-dynamodb";
import {
  CreateTopicCommand,
  SubscribeCommand,
  DeleteTopicCommand,
} from "@aws-sdk/client-sns";
import {
  CreateLogGroupCommand,
  CreateLogStreamCommand,
  PutLogEventsCommand,
  DeleteLogGroupCommand,
} from "@aws-sdk/client-cloudwatch-logs";
import {
  PutParameterCommand,
  DeleteParameterCommand,
} from "@aws-sdk/client-ssm";
import {
  CreateEventBusCommand,
  PutRuleCommand,
  PutTargetsCommand,
  DeleteEventBusCommand,
  DeleteRuleCommand,
  RemoveTargetsCommand,
} from "@aws-sdk/client-eventbridge";
import {
  CreateScheduleGroupCommand,
  CreateScheduleCommand,
  DeleteScheduleGroupCommand,
  DeleteScheduleCommand,
} from "@aws-sdk/client-scheduler";
import { GetQueueAttributesCommand } from "@aws-sdk/client-sqs";
import { zipSync, strToU8 } from "fflate";
import { requireLocalStack, makeClients, unique } from "./helpers";

test.describe("@screenshot Capture screenshots", () => {
  test.use({ viewport: { width: 1600, height: 1000 } });

  const { s3, sqs, lambda, dynamodb, dynamoDoc, sns, logs, ssm, eventbridge, scheduler } = makeClients();
  const ebBusName = unique("orders-bus");
  const ebRuleName = "order-placed-rule";
  const schedGroupName = unique("ecommerce-schedules");
  const schedName1 = "nightly-report";
  const schedName2 = "heartbeat-ping";
  const bucketName = unique("demo-assets");
  const queueName = unique("order-processing");
  const functionName = unique("process-webhook");
  const tableName = unique("users-table");
  const topicName = unique("order-events");
  let topicArn = "";
  const logGroupName = `/aws/lambda/${unique("process-payment")}`;
  const logStreamName = "2026/01/01/[$LATEST]stream-1";
  const ssmParams = [
    { name: "/app/production/database/url", type: "String" as const, val: "postgres://prod-db:5432/app" },
    { name: "/app/production/database/password", type: "SecureString" as const, val: "prod-secret-9948" },
    { name: "/app/production/features", type: "StringList" as const, val: "auth,billing,analytics" },
    { name: "/app/staging/database/url", type: "String" as const, val: "postgres://stage-db:5432/app" },
  ];

  test.beforeAll(async () => {
    await requireLocalStack();

    // 1. Seed S3 bucket with photogenic assets
    await s3.send(new CreateBucketCommand({ Bucket: bucketName }));
    await s3.send(
      new PutObjectCommand({
        Bucket: bucketName,
        Key: "config.json",
        ContentType: "application/json",
        Body: JSON.stringify(
          {
            app: "LocalStacker",
            env: "local-dev",
            services: ["s3", "sqs", "secrets", "lambda", "dynamodb", "sns", "logs", "ssm"],
            port: 4566,
          },
          null,
          2,
        ),
      }),
    );
    await s3.send(
      new PutObjectCommand({
        Bucket: bucketName,
        Key: "styles.css",
        ContentType: "text/css",
        Body: "body { font-family: system-ui; color: #111; }",
      }),
    );
    await s3.send(
      new PutObjectCommand({
        Bucket: bucketName,
        Key: "data/users.csv",
        ContentType: "text/csv",
        Body: "id,name,role\n1,Alice,admin\n2,Bob,dev\n",
      }),
    );

    // 2. Seed SQS queue with messages
    const qRes = await sqs.send(new CreateQueueCommand({ QueueName: queueName }));
    if (qRes.QueueUrl) {
      const messages = [
        {
          orderId: "ord-9482",
          customer: "alice@example.com",
          amount: 149.5,
          currency: "USD",
          items: [{ sku: "WIDGET-A", qty: 2, unitPrice: 49.75 }],
          status: "pending_fulfillment",
        },
        {
          orderId: "ord-9483",
          customer: "bob@example.com",
          amount: 89.0,
          currency: "USD",
          items: [{ sku: "GADGET-B", qty: 1, unitPrice: 89.0 }],
          status: "payment_cleared",
        },
        {
          orderId: "ord-9484",
          customer: "carol@example.com",
          amount: 234.0,
          currency: "USD",
          items: [{ sku: "TOOL-C", qty: 3, unitPrice: 78.0 }],
          status: "processing",
        },
      ];

      for (const msg of messages) {
        await sqs.send(
          new SendMessageCommand({
            QueueUrl: qRes.QueueUrl,
            MessageBody: JSON.stringify(msg, null, 2),
          }),
        );
      }
    }

    // 3. Seed Lambda function
    const codeZip = zipSync({
      "index.js": strToU8(
        `exports.handler = async (event) => {
  console.log("INFO: Webhook event received", JSON.stringify(event));
  console.log("INFO: Webhook processed successfully");
  return {
    statusCode: 200,
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ ok: true, timestamp: Date.now(), received: event })
  };
};`,
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

    // 4. Seed DynamoDB table & items
    await dynamodb.send(
      new CreateTableCommand({
        TableName: tableName,
        KeySchema: [
          { AttributeName: "id", KeyType: "HASH" },
          { AttributeName: "role", KeyType: "RANGE" },
        ],
        AttributeDefinitions: [
          { AttributeName: "id", AttributeType: "S" },
          { AttributeName: "role", AttributeType: "S" },
        ],
        BillingMode: "PAY_PER_REQUEST",
      }),
    );
    for (let i = 0; i < 30; i++) {
      const desc = await dynamodb.send(new DescribeTableCommand({ TableName: tableName }));
      if (desc.Table?.TableStatus === "ACTIVE") break;
      await delay(500);
    }

    await dynamoDoc.send(
      new PutCommand({
        TableName: tableName,
        Item: { id: "usr_1001", role: "admin", email: "alice@example.com", status: "active", loginCount: 42 },
      }),
    );
    await dynamoDoc.send(
      new PutCommand({
        TableName: tableName,
        Item: { id: "usr_1002", role: "developer", email: "bob@example.com", status: "active", loginCount: 15 },
      }),
    );
    await dynamoDoc.send(
      new PutCommand({
        TableName: tableName,
        Item: { id: "usr_1003", role: "viewer", email: "charlie@example.com", status: "invited", loginCount: 0 },
      }),
    );

    // 5. Seed SNS topic & subscription
    const topicRes = await sns.send(new CreateTopicCommand({ Name: topicName }));
    topicArn = topicRes.TopicArn!;
    await sns.send(
      new SubscribeCommand({
        TopicArn: topicArn,
        Protocol: "email",
        Endpoint: "alerts@company.com",
      }),
    );

    // 6. Seed CloudWatch Logs group, stream, and events
    await logs.send(new CreateLogGroupCommand({ logGroupName }));
    await logs.send(new CreateLogStreamCommand({ logGroupName, logStreamName }));
    const now = Date.now();
    await logs.send(
      new PutLogEventsCommand({
        logGroupName,
        logStreamName,
        logEvents: [
          { timestamp: now - 4000, message: "INFO: Payment gateway initialized" },
          { timestamp: now - 3000, message: "INFO: Processing transaction tx_948271 for $49.00" },
          { timestamp: now - 2000, message: "WARN: High latency detected on upstream provider" },
          { timestamp: now - 1000, message: "INFO: Transaction tx_948271 committed successfully" },
        ],
      }),
    );

    // 7. Seed SSM parameters
    for (const p of ssmParams) {
      await ssm.send(
        new PutParameterCommand({
          Name: p.name,
          Value: p.val,
          Type: p.type,
          Overwrite: true,
        }),
      );
    }

    // 8. Seed EventBridge bus, rule, and target
    await eventbridge.send(new CreateEventBusCommand({ Name: ebBusName }));
    await eventbridge.send(
      new PutRuleCommand({
        Name: ebRuleName,
        EventBusName: ebBusName,
        EventPattern: JSON.stringify({ source: ["store.orders"], "detail-type": ["order.placed"] }),
        State: "ENABLED",
        Description: "Route completed orders to fulfillment queue",
      }),
    );

    const queueAttrs = await sqs.send(
      new GetQueueAttributesCommand({
        QueueUrl: (await sqs.send(new GetQueueUrlCommand({ QueueName: queueName }))).QueueUrl!,
        AttributeNames: ["QueueArn"],
      }),
    );
    const targetArn = queueAttrs.Attributes!.QueueArn!;

    await eventbridge.send(
      new PutTargetsCommand({
        Rule: ebRuleName,
        EventBusName: ebBusName,
        Targets: [
          {
            Id: "target-sqs-orders",
            Arn: targetArn,
            Input: JSON.stringify({ injected: "meta" }),
          },
        ],
      }),
    );

    // 9. Seed Scheduler group and schedules
    await scheduler.send(
      new CreateScheduleGroupCommand({ Name: schedGroupName }),
    );
    await scheduler.send(
      new CreateScheduleCommand({
        Name: schedName1,
        GroupName: schedGroupName,
        ScheduleExpression: "cron(0 2 * * ? *)",
        FlexibleTimeWindow: { Mode: "OFF" },
        Target: {
          Arn: targetArn,
          RoleArn: "arn:aws:iam::000000000000:role/localstacker-scheduler",
          Input: JSON.stringify({ report: "nightly-revenue", format: "pdf" }),
        },
        State: "ENABLED",
      }),
    );
    await scheduler.send(
      new CreateScheduleCommand({
        Name: schedName2,
        GroupName: schedGroupName,
        ScheduleExpression: "rate(5 minutes)",
        FlexibleTimeWindow: { Mode: "OFF" },
        Target: {
          Arn: targetArn,
          RoleArn: "arn:aws:iam::000000000000:role/localstacker-scheduler",
        },
        State: "DISABLED",
      }),
    );
  });

  test.afterAll(async () => {
    // Cleanup S3
    try {
      let token: string | undefined;
      do {
        const list = await s3.send(
          new ListObjectsV2Command({ Bucket: bucketName, ContinuationToken: token }),
        );
        if (list.Contents && list.Contents.length > 0) {
          await s3.send(
            new DeleteObjectsCommand({
              Bucket: bucketName,
              Delete: { Objects: list.Contents.map((o) => ({ Key: o.Key! })) },
            }),
          );
        }
        token = list.NextContinuationToken;
      } while (token);
      await s3.send(new DeleteBucketCommand({ Bucket: bucketName }));
    } catch (err) {
      console.warn("S3 cleanup error:", err);
    }

    // Cleanup SQS
    try {
      const q = await sqs.send(new GetQueueUrlCommand({ QueueName: queueName }));
      if (q.QueueUrl) {
        await sqs.send(new DeleteQueueCommand({ QueueUrl: q.QueueUrl }));
      }
    } catch (err) {
      console.warn("SQS cleanup error:", err);
    }

    // Cleanup Lambda
    try {
      await lambda.send(new DeleteFunctionCommand({ FunctionName: functionName }));
    } catch (err) {
      console.warn("Lambda cleanup error:", err);
    }

    // Cleanup DynamoDB
    try {
      await dynamodb.send(new DeleteTableCommand({ TableName: tableName }));
    } catch (err) {
      console.warn("DynamoDB cleanup error:", err);
    }

    // Cleanup SNS
    try {
      if (topicArn) {
        await sns.send(new DeleteTopicCommand({ TopicArn: topicArn }));
      }
    } catch (err) {
      console.warn("SNS cleanup error:", err);
    }

    // Cleanup Logs
    try {
      await logs.send(new DeleteLogGroupCommand({ logGroupName }));
    } catch (err) {
      console.warn("Logs cleanup error:", err);
    }

    // Cleanup SSM
    for (const p of ssmParams) {
      try {
        await ssm.send(new DeleteParameterCommand({ Name: p.name }));
      } catch (err) {
        console.warn("SSM cleanup error:", err);
      }
    }

    // Cleanup EventBridge
    try {
      await eventbridge.send(
        new RemoveTargetsCommand({
          Rule: ebRuleName,
          EventBusName: ebBusName,
          Ids: ["target-sqs-orders"],
        }),
      ).catch(() => {});
      await eventbridge.send(
        new DeleteRuleCommand({ Name: ebRuleName, EventBusName: ebBusName }),
      ).catch(() => {});
      await eventbridge.send(
        new DeleteEventBusCommand({ Name: ebBusName }),
      ).catch(() => {});
    } catch (err) {
      console.warn("EventBridge cleanup error:", err);
    }

    // Cleanup Scheduler
    try {
      await scheduler.send(
        new DeleteScheduleCommand({ Name: schedName1, GroupName: schedGroupName }),
      ).catch(() => {});
      await scheduler.send(
        new DeleteScheduleCommand({ Name: schedName2, GroupName: schedGroupName }),
      ).catch(() => {});
      await scheduler.send(
        new DeleteScheduleGroupCommand({ Name: schedGroupName }),
      ).catch(() => {});
    } catch (err) {
      console.warn("Scheduler cleanup error:", err);
    }
  });

  test("captures full application screenshots", async ({ page }) => {
    test.setTimeout(120_000);
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
        2,
      ),
    );
    await invokeDialog.getByRole("button", { name: "Invoke", exact: true }).click();
    await expect(invokeDialog.getByText("200", { exact: true })).toBeVisible({ timeout: 15_000 });
    await expect(invokeDialog.getByText("INFO: Webhook processed successfully")).toBeVisible();
    await page.screenshot({ path: "docs/screenshots/lambda-invoke.png", animations: "disabled" });
    await invokeDialog.getByRole("button", { name: "Close" }).first().click();
    await expect(invokeDialog).not.toBeVisible();

    // 4. DynamoDB table screenshot (items grid + inspector)
    await page.locator("aside").getByRole("button", { name: /DynamoDB/ }).click();
    const tableRow = page.getByText(tableName, { exact: true });
    await expect(tableRow).toBeVisible({ timeout: 15_000 });
    await tableRow.click();

    await expect(page.getByText("usr_1001", { exact: true })).toBeVisible({ timeout: 10_000 });
    await page.getByText("usr_1001", { exact: true }).click();
    await expect(page.getByText("Item Details")).toBeVisible();
    await page.screenshot({ path: "docs/screenshots/dynamodb-table.png", animations: "disabled" });

    // 5. SNS topic screenshot (topic view with subscriptions)
    await page.locator("aside").getByRole("button", { name: /SNS/ }).click();
    const topicRow = page.getByText(topicName, { exact: true });
    await expect(topicRow).toBeVisible({ timeout: 15_000 });
    await topicRow.click();

    await expect(page.getByText("alerts@company.com")).toBeVisible({ timeout: 10_000 });
    await page.screenshot({ path: "docs/screenshots/sns-topic.png", animations: "disabled" });

    // 6. CloudWatch Logs screenshot (events + search)
    await page.locator("aside").getByRole("button", { name: /Logs/ }).click();
    const logGroupRow = page.getByText(logGroupName, { exact: true });
    await expect(logGroupRow).toBeVisible({ timeout: 15_000 });
    await logGroupRow.click();

    await expect(page.getByText("INFO: Payment gateway initialized")).toBeVisible({ timeout: 10_000 });
    await page.getByPlaceholder(/Search \/ filter pattern/i).fill("tx_948271");
    await expect(page.getByText("INFO: Processing transaction tx_948271 for $49.00")).toBeVisible();
    await page.screenshot({ path: "docs/screenshots/logs-view.png", animations: "disabled" });

    // 7. SSM Parameter Store screenshot (hierarchy view)
    await page.locator("aside").getByRole("button", { name: /Parameter Store/ }).click();
    await expect(page.getByText("/app/production/database/url", { exact: true })).toBeVisible({ timeout: 15_000 });
    await page.getByRole("button", { name: "Hierarchy" }).click();
    await expect(page.getByText("production")).toBeVisible({ timeout: 5_000 });
    await page.screenshot({ path: "docs/screenshots/ssm-params.png", animations: "disabled" });

    // 8. EventBridge bus view screenshot (rules + selected rule targets)
    await page.locator("aside").getByRole("button", { name: /^EventBridge Event buses/ }).click();
    const busRow = page.getByText(ebBusName, { exact: true });
    await expect(busRow).toBeVisible({ timeout: 15_000 });
    await busRow.click();
    await expect(page.locator("table").getByText(ebRuleName, { exact: true })).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText("target-sqs-orders")).toBeVisible({ timeout: 10_000 });
    await page.screenshot({ path: "docs/screenshots/eventbridge-bus.png", animations: "disabled" });

    // 9. EventBridge Scheduler group view screenshot (schedules table + community note)
    await page.locator("aside").getByRole("button", { name: /^EventBridge Scheduler/ }).click();
    const groupRow = page.getByText(schedGroupName, { exact: true });
    await expect(groupRow).toBeVisible({ timeout: 15_000 });
    await groupRow.click();
    await expect(page.getByText(schedName1, { exact: true })).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText(schedName2, { exact: true })).toBeVisible({ timeout: 10_000 });
    await expect(
      page.getByText(/LocalStack community stores schedules but does not execute them/),
    ).toBeVisible();
    await page.screenshot({ path: "docs/screenshots/scheduler-schedules.png", animations: "disabled" });
  });
});
