import { test, expect } from "./fixtures";
import { setTimeout as delay } from "node:timers/promises";
import {
  CreateQueueCommand,
  DeleteQueueCommand,
  GetQueueAttributesCommand,
  ReceiveMessageCommand,
  PurgeQueueCommand,
} from "@aws-sdk/client-sqs";
import { DeleteTopicCommand, ListTopicsCommand } from "@aws-sdk/client-sns";
import { requireLocalStack, makeClients, unique } from "./helpers";

test.describe("SNS e2e", () => {
  const { sns, sqs } = makeClients();
  const topicName = unique("e2e-sns");
  const queueName = unique("e2e-sqs");
  let queueUrl: string;
  let topicArnToClean: string | undefined;

  test.beforeAll(async () => {
    await requireLocalStack();

    // Create SQS queue for subscription
    const res = await sqs.send(new CreateQueueCommand({ QueueName: queueName }));
    queueUrl = res.QueueUrl!;

    // Ensure queue is ready
    await sqs.send(
      new GetQueueAttributesCommand({
        QueueUrl: queueUrl,
        AttributeNames: ["All"],
      }),
    );
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
      if (topicArnToClean) {
        await sns.send(new DeleteTopicCommand({ TopicArn: topicArnToClean }));
      }
    } catch (err) {
      console.warn(`Topic cleanup failed for ${topicName}:`, err);
    }
  });

  test("creates topic, subscribes SQS queue, publishes message with attributes, and verifies SQS delivery", async ({
    page,
  }) => {
    await page.goto("/");

    // 1. Open SNS via sidebar
    await page.locator("aside").getByRole("button", { name: /SNS/ }).click();

    // 2. Create standard topic via UI dialog
    await page.getByRole("button", { name: "Create topic" }).click();
    const createDialog = page.getByRole("dialog");
    await expect(createDialog).toBeVisible();

    await createDialog.getByLabel(/Topic name/i).fill(topicName);
    await createDialog.getByRole("button", { name: "Create topic" }).click();
    await expect(createDialog).not.toBeVisible();

    // 3. Topic view opens in a new tab
    const heading = page.getByRole("heading", { name: topicName });
    await expect(heading).toBeVisible({ timeout: 15_000 });

    // Capture topic ARN from list for cleanup
    const listRes = await sns.send(new ListTopicsCommand({}));
    const found = listRes.Topics?.find((t) => t.TopicArn?.endsWith(`:${topicName}`));
    if (found?.TopicArn) {
      topicArnToClean = found.TopicArn;
    }

    // 4. Subscribe SQS queue via dialog
    await page.getByRole("button", { name: "Subscribe SQS", exact: true }).click();
    const subDialog = page.getByRole("dialog");
    await expect(subDialog).toBeVisible();

    // Select queue
    await subDialog.getByRole("combobox").click();
    await page.getByRole("option", { name: new RegExp(queueName) }).click();
    await subDialog.getByRole("button", { name: "Subscribe" }).click();
    await expect(subDialog).not.toBeVisible();

    // Expect subscription row to be confirmed
    await expect(page.locator("table").getByText(queueName)).toBeVisible({
      timeout: 10_000,
    });

    // 5. Publish message with attributes
    await page.getByRole("button", { name: /Publish message/i }).click();
    const pubDialog = page.getByRole("dialog");
    await expect(pubDialog).toBeVisible();

    await pubDialog.getByLabel("Message body").fill('{"e2e":"sns"}');
    await pubDialog
      .getByLabel(/Message attributes/i)
      .fill('{"env":{"DataType":"String","StringValue":"e2e"}}');
    await pubDialog.getByRole("button", { name: "Publish" }).click();
    await expect(pubDialog).not.toBeVisible();
    await expect(page.getByText("Message published")).toBeVisible();

    // 6. Assert SDK receives message on SQS queue within 10s
    let receivedMessage: { Body?: string; MessageAttributes?: Record<string, any> } | undefined;
    for (let i = 0; i < 20; i++) {
      const recv = await sqs.send(
        new ReceiveMessageCommand({
          QueueUrl: queueUrl,
          MaxNumberOfMessages: 1,
          WaitTimeSeconds: 1,
          MessageAttributeNames: ["All"],
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

    const parsedEnvelope = JSON.parse(receivedMessage!.Body!);
    // Message payload
    expect(parsedEnvelope.Message).toBe('{"e2e":"sns"}');

    // Message attributes verified from SNS envelope or SQS attributes
    const envAttr =
      parsedEnvelope.MessageAttributes?.env?.Value ??
      receivedMessage?.MessageAttributes?.env?.StringValue;
    expect(envAttr).toBe("e2e");

    // 7. Delete topic via UI
    await page.getByRole("button", { name: "Delete" }).click();
    const delDialog = page.getByRole("dialog");
    await expect(delDialog).toBeVisible();
    await delDialog.getByRole("button", { name: "Delete" }).click();
    await expect(delDialog).not.toBeVisible();

    // Tab should be closed
    await expect(page.getByRole("tab", { name: topicName })).not.toBeVisible();
  });
});
