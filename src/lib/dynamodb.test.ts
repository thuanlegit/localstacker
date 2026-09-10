import { describe, it, expect, vi } from "vitest";
import type { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import type { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";
import {
  listTables,
  describeTable,
  createTable,
  deleteTable,
  buildKeyCondition,
  scanItems,
  queryItems,
  putItem,
  deleteItem,
  clearTable,
  SCAN_PAGE_SIZE,
  CLEAR_TABLE_MAX_ITEMS,
} from "./dynamodb";

describe("dynamodb constants", () => {
  it("exports expected constants", () => {
    expect(SCAN_PAGE_SIZE).toBe(50);
    expect(CLEAR_TABLE_MAX_ITEMS).toBe(5000);
  });
});

describe("listTables", () => {
  it("returns table names across multiple pages", async () => {
    const send = vi
      .fn()
      .mockResolvedValueOnce({
        TableNames: ["users", "orders"],
        LastEvaluatedTableName: "orders",
      })
      .mockResolvedValueOnce({
        TableNames: ["products"],
      });

    const client = { send } as unknown as DynamoDBClient;
    const tables = await listTables(client);

    expect(tables).toEqual(["users", "orders", "products"]);
    expect(send).toHaveBeenCalledTimes(2);
  });

  it("handles empty response", async () => {
    const send = vi.fn().mockResolvedValueOnce({});
    const client = { send } as unknown as DynamoDBClient;
    const tables = await listTables(client);
    expect(tables).toEqual([]);
  });
});

describe("describeTable", () => {
  it("parses table metadata, key schema, and indexes", async () => {
    const send = vi.fn().mockResolvedValueOnce({
      Table: {
        TableName: "users",
        TableArn: "arn:aws:dynamodb:us-east-1:000000000000:table/users",
        ItemCount: 42,
        TableSizeBytes: 1024,
        TableStatus: "ACTIVE",
        AttributeDefinitions: [
          { AttributeName: "id", AttributeType: "S" },
          { AttributeName: "age", AttributeType: "N" },
          { AttributeName: "email", AttributeType: "S" },
        ],
        KeySchema: [
          { AttributeName: "id", KeyType: "HASH" },
          { AttributeName: "age", KeyType: "RANGE" },
        ],
        GlobalSecondaryIndexes: [
          {
            IndexName: "email-index",
            KeySchema: [{ AttributeName: "email", KeyType: "HASH" }],
          },
        ],
        LocalSecondaryIndexes: [
          {
            IndexName: "age-lsi",
            KeySchema: [
              { AttributeName: "id", KeyType: "HASH" },
              { AttributeName: "age", KeyType: "RANGE" },
            ],
          },
        ],
      },
    });

    const client = { send } as unknown as DynamoDBClient;
    const desc = await describeTable(client, "users");

    expect(desc).toEqual({
      name: "users",
      arn: "arn:aws:dynamodb:us-east-1:000000000000:table/users",
      itemCount: 42,
      sizeBytes: 1024,
      status: "ACTIVE",
      attributeTypes: {
        id: "S",
        age: "N",
        email: "S",
      },
      keySchema: [
        { name: "id", type: "S", role: "HASH" },
        { name: "age", type: "N", role: "RANGE" },
      ],
      indexes: [
        {
          name: "email-index",
          kind: "GSI",
          keySchema: [{ name: "email", type: "S", role: "HASH" }],
        },
        {
          name: "age-lsi",
          kind: "LSI",
          keySchema: [
            { name: "id", type: "S", role: "HASH" },
            { name: "age", type: "N", role: "RANGE" },
          ],
        },
      ],
    });
  });

  it("throws if table description is missing", async () => {
    const send = vi.fn().mockResolvedValueOnce({});
    const client = { send } as unknown as DynamoDBClient;
    await expect(describeTable(client, "missing")).rejects.toThrow(
      "Table missing not found",
    );
  });
});

describe("buildKeyCondition", () => {
  it("builds partition-only condition with string type", () => {
    const cond = buildKeyCondition(
      { partitionKeyName: "pk", partitionValue: "user#123" },
      { pk: "S" },
    );
    expect(cond.KeyConditionExpression).toBe("#pk = :pk");
    expect(cond.ExpressionAttributeNames).toEqual({ "#pk": "pk" });
    expect(cond.ExpressionAttributeValues).toEqual({ ":pk": "user#123" });
  });

  it("coerces number partition key and handles reserved word safe alias", () => {
    const cond = buildKeyCondition(
      { partitionKeyName: "status", partitionValue: "42" },
      { status: "N" },
    );
    expect(cond.KeyConditionExpression).toBe("#pk = :pk");
    expect(cond.ExpressionAttributeNames).toEqual({ "#pk": "status" });
    expect(cond.ExpressionAttributeValues).toEqual({ ":pk": 42 });
  });

  it("throws on invalid number", () => {
    expect(() =>
      buildKeyCondition(
        { partitionKeyName: "count", partitionValue: "not-a-number" },
        { count: "N" },
      ),
    ).toThrow("count is not a valid number");
  });

  it("coerces binary partition key from base64", () => {
    const base64 = Buffer.from("hello").toString("base64");
    const cond = buildKeyCondition(
      { partitionKeyName: "binKey", partitionValue: base64 },
      { binKey: "B" },
    );
    expect(cond.ExpressionAttributeValues[":pk"]).toEqual(
      Buffer.from("hello"),
    );
  });

  it("builds sort key eq condition", () => {
    const cond = buildKeyCondition(
      {
        partitionKeyName: "pk",
        partitionValue: "tenant#1",
        sortKeyName: "sk",
        sortOp: "eq",
        sortValue: "100",
      },
      { pk: "S", sk: "N" },
    );
    expect(cond.KeyConditionExpression).toBe("#pk = :pk AND #sk = :sk");
    expect(cond.ExpressionAttributeNames).toEqual({
      "#pk": "pk",
      "#sk": "sk",
    });
    expect(cond.ExpressionAttributeValues).toEqual({
      ":pk": "tenant#1",
      ":sk": 100,
    });
  });

  it("builds sort key begins_with condition", () => {
    const cond = buildKeyCondition(
      {
        partitionKeyName: "pk",
        partitionValue: "user",
        sortKeyName: "sk",
        sortOp: "begins_with",
        sortValue: "profile#",
      },
      { pk: "S", sk: "S" },
    );
    expect(cond.KeyConditionExpression).toBe(
      "#pk = :pk AND begins_with(#sk, :sk)",
    );
    expect(cond.ExpressionAttributeValues).toEqual({
      ":pk": "user",
      ":sk": "profile#",
    });
  });

  it("builds sort key between condition", () => {
    const cond = buildKeyCondition(
      {
        partitionKeyName: "pk",
        partitionValue: "sensor",
        sortKeyName: "timestamp",
        sortOp: "between",
        sortValue: "1000",
        sortValue2: "2000",
      },
      { pk: "S", timestamp: "N" },
    );
    expect(cond.KeyConditionExpression).toBe(
      "#pk = :pk AND #sk BETWEEN :sk1 AND :sk2",
    );
    expect(cond.ExpressionAttributeValues).toEqual({
      ":pk": "sensor",
      ":sk1": 1000,
      ":sk2": 2000,
    });
  });

  it("throws when sortOp set but sortKeyName is missing", () => {
    expect(() =>
      buildKeyCondition(
        {
          partitionKeyName: "pk",
          partitionValue: "val",
          sortOp: "eq",
          sortValue: "skval",
        },
        {},
      ),
    ).toThrow("Sort key name is required when sort operation is specified");
  });

  it("throws when between operation is missing sortValue2", () => {
    expect(() =>
      buildKeyCondition(
        {
          partitionKeyName: "pk",
          partitionValue: "val",
          sortKeyName: "sk",
          sortOp: "between",
          sortValue: "10",
        },
        { sk: "N" },
      ),
    ).toThrow("sortValue and sortValue2 are required for between operation");
  });
});

describe("scanItems", () => {
  it("scans items with ConsistentRead: true and default limit", async () => {
    const send = vi.fn().mockResolvedValueOnce({
      Items: [{ id: "1", name: "Alice" }],
      LastEvaluatedKey: { id: "1" },
    });
    const doc = { send } as unknown as DynamoDBDocumentClient;

    const result = await scanItems(doc, { tableName: "users" });

    expect(result).toEqual({
      items: [{ id: "1", name: "Alice" }],
      lastEvaluatedKey: { id: "1" },
    });
    expect(send).toHaveBeenCalledWith(
      expect.objectContaining({
        input: {
          TableName: "users",
          ConsistentRead: true,
          Limit: 50,
          ExclusiveStartKey: undefined,
        },
      }),
    );
  });
});

describe("queryItems", () => {
  it("queries table with consistent read", async () => {
    const send = vi.fn().mockResolvedValueOnce({
      Items: [{ id: "1", role: "admin" }],
    });
    const doc = { send } as unknown as DynamoDBDocumentClient;

    const cond = buildKeyCondition(
      { partitionKeyName: "id", partitionValue: "1" },
      { id: "S" },
    );
    const result = await queryItems(doc, {
      tableName: "users",
      keyCondition: cond,
    });

    expect(result.items).toHaveLength(1);
    expect(send).toHaveBeenCalledWith(
      expect.objectContaining({
        input: expect.objectContaining({
          TableName: "users",
          ConsistentRead: true,
          KeyConditionExpression: "#pk = :pk",
        }),
      }),
    );
  });

  it("queries GSI without consistent read", async () => {
    const send = vi.fn().mockResolvedValueOnce({ Items: [] });
    const doc = { send } as unknown as DynamoDBDocumentClient;

    const cond = buildKeyCondition(
      { partitionKeyName: "email", partitionValue: "test@test.com" },
      { email: "S" },
    );
    await queryItems(doc, {
      tableName: "users",
      keyCondition: cond,
      indexName: "email-gsi",
    });

    expect(send).toHaveBeenCalledWith(
      expect.objectContaining({
        input: expect.objectContaining({
          TableName: "users",
          IndexName: "email-gsi",
          ConsistentRead: undefined,
        }),
      }),
    );
  });
});

describe("putItem and deleteItem", () => {
  it("puts item via PutCommand", async () => {
    const send = vi.fn().mockResolvedValueOnce({});
    const doc = { send } as unknown as DynamoDBDocumentClient;
    await putItem(doc, { tableName: "users", item: { id: "123", name: "Bob" } });
    expect(send).toHaveBeenCalledWith(
      expect.objectContaining({
        input: {
          TableName: "users",
          Item: { id: "123", name: "Bob" },
        },
      }),
    );
  });

  it("deletes item via DeleteCommand", async () => {
    const send = vi.fn().mockResolvedValueOnce({});
    const doc = { send } as unknown as DynamoDBDocumentClient;
    await deleteItem(doc, { tableName: "users", key: { id: "123" } });
    expect(send).toHaveBeenCalledWith(
      expect.objectContaining({
        input: {
          TableName: "users",
          Key: { id: "123" },
        },
      }),
    );
  });
});

describe("clearTable", () => {
  it("batches deletes at 25 item boundary (26 items -> 2 batches)", async () => {
    const items = Array.from({ length: 26 }, (_, i) => ({ id: `user-${i}` }));
    const send = vi
      .fn()
      // scan returns 26 items
      .mockResolvedValueOnce({
        Items: items,
      })
      // first BatchWriteCommand: 25 items
      .mockResolvedValueOnce({ UnprocessedItems: {} })
      // second BatchWriteCommand: 1 item
      .mockResolvedValueOnce({ UnprocessedItems: {} });

    const doc = { send } as unknown as DynamoDBDocumentClient;
    const res = await clearTable(doc, {
      tableName: "users",
      keyNames: ["id"],
    });

    expect(res).toEqual({ deleted: 26 });
    expect(send).toHaveBeenCalledTimes(3); // 1 scan + 2 batch writes
  });

  it("retries unprocessed items up to 3 rounds", async () => {
    const items = [{ id: "user-1" }, { id: "user-2" }];
    const send = vi
      .fn()
      .mockResolvedValueOnce({
        Items: items,
      })
      // round 0: user-2 unprocessed
      .mockResolvedValueOnce({
        UnprocessedItems: {
          users: [{ DeleteRequest: { Key: { id: "user-2" } } }],
        },
      })
      // round 1: retry succeeds
      .mockResolvedValueOnce({
        UnprocessedItems: {},
      });

    const doc = { send } as unknown as DynamoDBDocumentClient;
    const res = await clearTable(doc, {
      tableName: "users",
      keyNames: ["id"],
    });

    expect(res).toEqual({ deleted: 2 });
    expect(send).toHaveBeenCalledTimes(3); // 1 scan + 2 batch writes
  });

  it("stops when scan is empty", async () => {
    const send = vi.fn().mockResolvedValueOnce({ Items: [] });
    const doc = { send } as unknown as DynamoDBDocumentClient;
    const res = await clearTable(doc, {
      tableName: "users",
      keyNames: ["id"],
    });
    expect(res).toEqual({ deleted: 0 });
    expect(send).toHaveBeenCalledTimes(1);
  });

  it("respects max items cap", async () => {
    const send = vi
      .fn()
      .mockResolvedValueOnce({
        Items: Array.from({ length: 5 }, (_, i) => ({ id: `${i}` })),
        LastEvaluatedKey: { id: "4" },
      })
      .mockResolvedValueOnce({ UnprocessedItems: {} });

    const doc = { send } as unknown as DynamoDBDocumentClient;
    const res = await clearTable(doc, {
      tableName: "users",
      keyNames: ["id"],
      max: 5,
    });

    expect(res.deleted).toBe(5);
  });
});

describe("createTable", () => {
  it("creates a table with partition key only", async () => {
    const send = vi.fn().mockResolvedValueOnce({
      TableDescription: {
        TableArn: "arn:aws:dynamodb:us-east-1:000000000000:table/users",
      },
    });
    const client = { send } as unknown as DynamoDBClient;

    const res = await createTable(client, {
      name: "users",
      partitionKey: { name: "id", type: "S" },
    });

    expect(res.arn).toBe("arn:aws:dynamodb:us-east-1:000000000000:table/users");
    expect(send).toHaveBeenCalledTimes(1);
    const cmd = send.mock.calls[0][0];
    expect(cmd.input).toEqual({
      TableName: "users",
      AttributeDefinitions: [{ AttributeName: "id", AttributeType: "S" }],
      KeySchema: [{ AttributeName: "id", KeyType: "HASH" }],
      BillingMode: "PAY_PER_REQUEST",
    });
  });

  it("creates a table with partition and sort keys", async () => {
    const send = vi.fn().mockResolvedValueOnce({
      TableDescription: {
        TableArn: "arn:aws:dynamodb:us-east-1:000000000000:table/orders",
      },
    });
    const client = { send } as unknown as DynamoDBClient;

    const res = await createTable(client, {
      name: "orders",
      partitionKey: { name: "userId", type: "S" },
      sortKey: { name: "orderId", type: "N" },
    });

    expect(res.arn).toBe("arn:aws:dynamodb:us-east-1:000000000000:table/orders");
    const cmd = send.mock.calls[0][0];
    expect(cmd.input.KeySchema).toEqual([
      { AttributeName: "userId", KeyType: "HASH" },
      { AttributeName: "orderId", KeyType: "RANGE" },
    ]);
    expect(cmd.input.AttributeDefinitions).toEqual([
      { AttributeName: "userId", AttributeType: "S" },
      { AttributeName: "orderId", AttributeType: "N" },
    ]);
  });

  it("rejects empty table name", async () => {
    const client = { send: vi.fn() } as unknown as DynamoDBClient;
    await expect(
      createTable(client, {
        name: "  ",
        partitionKey: { name: "id", type: "S" },
      }),
    ).rejects.toThrow("Table name is required");
  });

  it("rejects empty partition key name", async () => {
    const client = { send: vi.fn() } as unknown as DynamoDBClient;
    await expect(
      createTable(client, {
        name: "users",
        partitionKey: { name: "", type: "S" },
      }),
    ).rejects.toThrow("Partition key name is required");
  });

  it("rejects duplicate key names", async () => {
    const client = { send: vi.fn() } as unknown as DynamoDBClient;
    await expect(
      createTable(client, {
        name: "users",
        partitionKey: { name: "id", type: "S" },
        sortKey: { name: "id", type: "N" },
      }),
    ).rejects.toThrow("Partition key and sort key must have different names");
  });
});

describe("deleteTable", () => {
  it("sends DeleteTableCommand with table name", async () => {
    const send = vi.fn().mockResolvedValueOnce({});
    const client = { send } as unknown as DynamoDBClient;

    await deleteTable(client, "users");
    expect(send).toHaveBeenCalledTimes(1);
    expect(send.mock.calls[0][0].input).toEqual({ TableName: "users" });
  });
});
