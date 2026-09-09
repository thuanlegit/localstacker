import { test, expect } from "@playwright/test";
import { setTimeout as delay } from "node:timers/promises";
import {
  CreateTableCommand,
  DescribeTableCommand,
  DeleteTableCommand,
} from "@aws-sdk/client-dynamodb";
import { PutCommand, ScanCommand } from "@aws-sdk/lib-dynamodb";
import { requireLocalStack, makeClients, unique } from "./helpers";

test.describe("DynamoDB e2e", () => {
  const { dynamodb, dynamoDoc } = makeClients();
  const tableName = unique("e2e-ddb");
  const tablesToClean: string[] = [];

  test.beforeAll(async () => {
    await requireLocalStack();

    await dynamodb.send(
      new CreateTableCommand({
        TableName: tableName,
        KeySchema: [
          { AttributeName: "pk", KeyType: "HASH" },
          { AttributeName: "sk", KeyType: "RANGE" },
        ],
        AttributeDefinitions: [
          { AttributeName: "pk", AttributeType: "S" },
          { AttributeName: "sk", AttributeType: "N" },
        ],
        BillingMode: "PAY_PER_REQUEST",
      }),
    );
    tablesToClean.push(tableName);

    // Wait for table to be ACTIVE
    let active = false;
    for (let i = 0; i < 30; i++) {
      const desc = await dynamodb.send(
        new DescribeTableCommand({ TableName: tableName }),
      );
      if (desc.Table?.TableStatus === "ACTIVE") {
        active = true;
        break;
      }
      await delay(1000);
    }
    if (!active) {
      throw new Error(`Table ${tableName} did not become ACTIVE`);
    }

    // Seed 3 items
    await dynamoDoc.send(
      new PutCommand({
        TableName: tableName,
        Item: { pk: "user-1", sk: 10, name: "Alice", email: "alice@example.com" },
      }),
    );
    await dynamoDoc.send(
      new PutCommand({
        TableName: tableName,
        Item: { pk: "user-2", sk: 20, name: "Bob", email: "bob@example.com" },
      }),
    );
    await dynamoDoc.send(
      new PutCommand({
        TableName: tableName,
        Item: { pk: "user-3", sk: 30, name: "Charlie", email: "charlie@example.com" },
      }),
    );
  });

  test.afterAll(async () => {
    for (const t of tablesToClean) {
      try {
        await dynamodb.send(new DeleteTableCommand({ TableName: t }));
      } catch (err) {
        console.warn(`Cleanup failed for table ${t}:`, err);
      }
    }
  });

  test("browses table, queries, edits item, deletes item, and clears table", async ({
    page,
  }) => {
    await page.goto("/");

    // 1. Open DynamoDB via sidebar
    await page.locator("aside").getByRole("button", { name: /DynamoDB/ }).click();

    // 2. Click seeded table row
    const tableItem = page.getByText(tableName, { exact: true });
    await expect(tableItem).toBeVisible({ timeout: 15_000 });
    await tableItem.click();

    // TableView displays items in virtualized grid
    await expect(page.getByText("user-1", { exact: true })).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText("user-2", { exact: true })).toBeVisible();
    await expect(page.getByText("user-3", { exact: true })).toBeVisible();
    // 3. Query mode: filter by pk "user-1"
    await page.getByRole("button", { name: "Query" }).click();
    const pkInput = page.getByPlaceholder("Partition value");
    await pkInput.fill("user-1");
    await page.getByRole("button", { name: /Run query/i }).click();

    await expect(page.getByText("user-1", { exact: true })).toBeVisible();
    await expect(page.getByText("user-2", { exact: true })).not.toBeVisible();
    await expect(page.getByText("user-3", { exact: true })).not.toBeVisible();

    // 4. Reset to Scan
    await page.getByRole("button", { name: "Scan" }).click();
    await expect(page.getByText("user-1", { exact: true })).toBeVisible();
    await expect(page.getByText("user-2", { exact: true })).toBeVisible();
    await expect(page.getByText("user-3", { exact: true })).toBeVisible();

    // 5. Click row -> inspector JSON opens
    await page.getByText("user-1", { exact: true }).click();
    await expect(page.getByText("Item Details")).toBeVisible();
    await expect(page.locator("pre").getByText('"name": "Alice"')).toBeVisible();

    // 6. Edit item dialog: update name attribute
    await page.getByRole("button", { name: "Edit item" }).click();
    const editDialog = page.getByRole("dialog");
    await expect(editDialog).toBeVisible();

    const textarea = editDialog.getByLabel("Item JSON");
    await textarea.fill(
      JSON.stringify(
        {
          pk: "user-1",
          sk: 10,
          name: "Alice Updated",
          email: "alice@example.com",
        },
        null,
        2,
      ),
    );
    await editDialog.getByRole("button", { name: "Save item" }).click();
    await expect(editDialog).not.toBeVisible();
    await expect(page.getByText("Item saved")).toBeVisible();
    await expect(
      page.locator("pre").getByText('"name": "Alice Updated"'),
    ).toBeVisible();

    // 7. Delete item from inspector
    await page.getByRole("button", { name: "Delete item" }).click();
    const deleteDialog = page.getByRole("dialog");
    await expect(deleteDialog).toBeVisible();
    await deleteDialog.getByRole("button", { name: "Delete item" }).click();
    await expect(deleteDialog).not.toBeVisible();
    await expect(page.getByText("Item deleted")).toBeVisible();
    await expect(page.getByText("user-1", { exact: true })).not.toBeVisible();

    // 8. Clear table: clears remaining items
    await page.getByRole("button", { name: /Clear table/i }).click();
    const clearDialog = page.getByRole("dialog");
    await expect(clearDialog).toBeVisible();
    await clearDialog.getByRole("button", { name: "Clear all items" }).click();
    await expect(clearDialog).not.toBeVisible();
    await expect(page.getByText(/Cleared \d+ items/)).toBeVisible();

    // 9. Verify SDK scan count === 0
    const scanRes = await dynamoDoc.send(
      new ScanCommand({ TableName: tableName }),
    );
    expect(scanRes.Count).toBe(0);
  });
});
