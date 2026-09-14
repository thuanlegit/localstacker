import { test, expect } from "./fixtures";
import { setTimeout as delay } from "node:timers/promises";
import {
  CreateTableCommand,
  DeleteTableCommand,
  PutItemCommand,
} from "@aws-sdk/client-dynamodb";
import {
  DescribeStreamCommand,
  ListStreamsCommand,
} from "@aws-sdk/client-dynamodb-streams";
import { requireLocalStack, makeClients, unique } from "./helpers";

test.describe("DynamoDB Streams e2e", () => {
  const { dynamodb } = makeClients();
  const { dynamodbStreams } = makeClients();
  const tableName = unique("e2e-ddbstreams");
  const pkValue = "stream-e2e-item";

  test.beforeAll(async () => {
    await requireLocalStack();
    await dynamodb.send(
      new CreateTableCommand({
        TableName: tableName,
        AttributeDefinitions: [{ AttributeName: "pk", AttributeType: "S" }],
        KeySchema: [{ AttributeName: "pk", KeyType: "HASH" }],
        BillingMode: "PAY_PER_REQUEST",
      }),
    );
  });

  test.afterAll(async () => {
    try {
      await dynamodb.send(new DeleteTableCommand({ TableName: tableName }));
    } catch (err) {
      console.warn(`Table cleanup failed for ${tableName}:`, err);
    }
  });

  test("enables a stream, writes an item, and peeks the INSERT record", async ({
    page,
  }) => {
    await page.goto("/");

    // 1. Open the table view
    await page.locator("aside").getByRole("button", { name: /DynamoDB/ }).click();
    await page.locator("table").getByText(tableName).click();
    await expect(page.getByRole("heading", { name: tableName })).toBeVisible({
      timeout: 15_000,
    });

    // 2. Stream section shows disabled; enable with NEW_AND_OLD_IMAGES
    await expect(page.getByText("Disabled").first()).toBeVisible();
    await page.getByRole("button", { name: "Enable stream" }).click();
    const confirmDialog = page.getByRole("dialog");
    await expect(confirmDialog).toBeVisible();
    await confirmDialog.getByRole("button", { name: "Enable" }).click();
    await expect(confirmDialog).not.toBeVisible();

    // Badge flips once describeTable picks up the stream
    await expect(
      page.getByText(/Enabled · NEW_AND_OLD_IMAGES/).first(),
    ).toBeVisible({ timeout: 15_000 });

    // 3. Wait until the stream backend is ready — records written before the
    // stream is ENABLED are dropped by LocalStack. Then write an item via SDK.
    let streamArn: string | undefined;
    for (let i = 0; i < 30; i++) {
      if (streamArn) {
        const desc = await dynamodbStreams.send(
          new DescribeStreamCommand({ StreamArn: streamArn }),
        );
        if (
          desc.StreamDescription?.StreamStatus === "ENABLED" &&
          desc.StreamDescription.Shards?.length
        ) {
          break;
        }
      } else {
        const listed = await dynamodbStreams.send(
          new ListStreamsCommand({ TableName: tableName }),
        );
        streamArn = listed.Streams?.[0]?.StreamArn;
      }
      await delay(500);
    }
    await dynamodb.send(
      new PutItemCommand({
        TableName: tableName,
        Item: { pk: { S: pkValue }, v: { N: "42" } },
      }),
    );

    // 4. Expand the stream section and peek shard records. Records propagate
    // asynchronously — re-click Peek until the INSERT record surfaces.
    await page.getByRole("button", { name: /Stream/ }).first().click();
    await expect(async () => {
      await page.getByRole("button", { name: "Peek records" }).click();
      await expect(page.getByText("INSERT").first()).toBeVisible();
    }).toPass({ timeout: 20_000 });
    await expect(page.getByText(pkValue).first()).toBeVisible();
    await expect(page.getByText(/"v": 42/).first()).toBeVisible();

    // 5. Disable the stream again
    await page.getByRole("button", { name: "Disable stream" }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Disable" }).click();
    await expect(page.getByText("Disabled").first()).toBeVisible({
      timeout: 10_000,
    });
  });
});
