import {
  ListTablesCommand,
  DescribeTableCommand,
  CreateTableCommand,
  DeleteTableCommand,
  UpdateTableCommand,
  type DynamoDBClient,
  type ListTablesCommandOutput,
} from "@aws-sdk/client-dynamodb";
import {
  ScanCommand,
  QueryCommand,
  PutCommand,
  DeleteCommand,
  BatchWriteCommand,
  type DynamoDBDocumentClient,
  type BatchWriteCommandInput,
} from "@aws-sdk/lib-dynamodb";
export const SCAN_PAGE_SIZE = 50;
export const CLEAR_TABLE_MAX_ITEMS = 5000;


export interface KeyAttribute {
  name: string;
  type: "S" | "N" | "B";
  role: "HASH" | "RANGE";
}

export interface IndexSummary {
  name: string;
  kind: "GSI" | "LSI";
  keySchema: KeyAttribute[];
}

export interface TableDescription {
  name: string;
  arn: string;
  itemCount: number;
  sizeBytes: number;
  status: string;
  keySchema: KeyAttribute[];
  indexes: IndexSummary[];
  attributeTypes: Record<string, "S" | "N" | "B">;
  stream?: TableStreamInfo;
}

export type StreamViewType = "NEW_AND_OLD_IMAGES" | "KEYS_ONLY" | "NEW_IMAGE" | "OLD_IMAGE";

export interface TableStreamInfo {
  enabled: boolean;
  viewType?: StreamViewType;
  arn?: string;
  label?: string;
}

export async function listTables(client: DynamoDBClient): Promise<string[]> {
  const tables: string[] = [];
  let lastEvaluatedTableName: string | undefined = undefined;

  do {
    const res: ListTablesCommandOutput = await client.send(
      new ListTablesCommand({
        ExclusiveStartTableName: lastEvaluatedTableName,
      }),
    );
    if (res.TableNames) {
      tables.push(...res.TableNames);
    }
    lastEvaluatedTableName = res.LastEvaluatedTableName;
  } while (lastEvaluatedTableName);

  return tables;
}

export async function describeTable(
  client: DynamoDBClient,
  name: string,
): Promise<TableDescription> {
  const res = await client.send(new DescribeTableCommand({ TableName: name }));
  if (!res.Table) {
    throw new Error(`Table ${name} not found`);
  }

  const t = res.Table;
  const attributeTypes: Record<string, "S" | "N" | "B"> = {};
  if (t.AttributeDefinitions) {
    for (const def of t.AttributeDefinitions) {
      if (def.AttributeName && def.AttributeType) {
        attributeTypes[def.AttributeName] = def.AttributeType as "S" | "N" | "B";
      }
    }
  }

  const mapKeySchema = (
    schema?: Array<{ AttributeName?: string; KeyType?: string }>,
  ): KeyAttribute[] => {
    if (!schema) return [];
    return schema
      .filter((k) => Boolean(k.AttributeName && k.KeyType))
      .map((k) => ({
        name: k.AttributeName!,
        type: attributeTypes[k.AttributeName!] ?? "S",
        role: k.KeyType as "HASH" | "RANGE",
      }));
  };

  const indexes: IndexSummary[] = [];
  if (t.GlobalSecondaryIndexes) {
    for (const gsi of t.GlobalSecondaryIndexes) {
      if (gsi.IndexName) {
        indexes.push({
          name: gsi.IndexName,
          kind: "GSI",
          keySchema: mapKeySchema(gsi.KeySchema),
        });
      }
    }
  }
  if (t.LocalSecondaryIndexes) {
    for (const lsi of t.LocalSecondaryIndexes) {
      if (lsi.IndexName) {
        indexes.push({
          name: lsi.IndexName,
          kind: "LSI",
          keySchema: mapKeySchema(lsi.KeySchema),
        });
      }
    }
  }

  return {
    name: t.TableName ?? name,
    arn: t.TableArn ?? "",
    itemCount: t.ItemCount ?? 0,
    sizeBytes: t.TableSizeBytes ?? 0,
    status: t.TableStatus ?? "UNKNOWN",
    keySchema: mapKeySchema(t.KeySchema),
    indexes,
    attributeTypes,
    stream: mapStreamInfo(t),
  };
}

interface RawTableStreamFields {
  StreamSpecification?: { StreamEnabled?: boolean; StreamViewType?: StreamViewType };
  LatestStreamArn?: string;
  LatestStreamLabel?: string;
}

function mapStreamInfo(t: RawTableStreamFields): TableStreamInfo | undefined {
  if (!t.StreamSpecification && !t.LatestStreamArn) return undefined;
  return {
    enabled: t.StreamSpecification?.StreamEnabled ?? false,
    viewType: t.StreamSpecification?.StreamViewType,
    arn: t.LatestStreamArn,
    label: t.LatestStreamLabel,
  };
}

export async function setTableStream(
  client: DynamoDBClient,
  tableName: string,
  enabled: boolean,
  viewType: StreamViewType = "NEW_AND_OLD_IMAGES",
): Promise<void> {
  await client.send(
    new UpdateTableCommand({
      TableName: tableName,
      StreamSpecification: {
        StreamEnabled: enabled,
        StreamViewType: enabled ? viewType : undefined,
      },
    }),
  );
}

export interface CreateTableInput {
  name: string;
  partitionKey: { name: string; type: "S" | "N" | "B" };
  sortKey?: { name: string; type: "S" | "N" | "B" };
}

export async function createTable(
  client: DynamoDBClient,
  input: CreateTableInput,
): Promise<{ arn?: string }> {
  const name = input.name.trim();
  if (!name) {
    throw new Error("Table name is required");
  }
  const pkName = input.partitionKey.name.trim();
  if (!pkName) {
    throw new Error("Partition key name is required");
  }

  const attributeDefinitions: Array<{
    AttributeName: string;
    AttributeType: "S" | "N" | "B";
  }> = [
    {
      AttributeName: pkName,
      AttributeType: input.partitionKey.type,
    },
  ];

  const keySchema: Array<{
    AttributeName: string;
    KeyType: "HASH" | "RANGE";
  }> = [
    {
      AttributeName: pkName,
      KeyType: "HASH",
    },
  ];

  if (input.sortKey && input.sortKey.name.trim()) {
    const skName = input.sortKey.name.trim();
    if (skName === pkName) {
      throw new Error("Partition key and sort key must have different names");
    }
    attributeDefinitions.push({
      AttributeName: skName,
      AttributeType: input.sortKey.type,
    });
    keySchema.push({
      AttributeName: skName,
      KeyType: "RANGE",
    });
  }

  const res = await client.send(
    new CreateTableCommand({
      TableName: name,
      AttributeDefinitions: attributeDefinitions,
      KeySchema: keySchema,
      BillingMode: "PAY_PER_REQUEST",
    }),
  );

  return { arn: res.TableDescription?.TableArn };
}

export async function deleteTable(
  client: DynamoDBClient,
  name: string,
): Promise<void> {
  await client.send(new DeleteTableCommand({ TableName: name }));
}

export interface KeyConditionInput {
  partitionKeyName: string;
  partitionValue: string;
  sortKeyName?: string;
  sortOp?: "eq" | "begins_with" | "between";
  sortValue?: string;
  sortValue2?: string;
  indexName?: string;
}

function coerceValue(
  val: string,
  type: "S" | "N" | "B",
  attrName: string,
): unknown {
  if (type === "N") {
    const num = Number(val);
    if (isNaN(num) || val.trim() === "") {
      throw new Error(`${attrName} is not a valid number`);
    }
    return num;
  }
  if (type === "B") {
    return Buffer.from(val, "base64");
  }
  return val;
}

export interface KeyConditionResult {
  KeyConditionExpression: string;
  ExpressionAttributeNames: Record<string, string>;
  ExpressionAttributeValues: Record<string, unknown>;
}

export function buildKeyCondition(
  input: KeyConditionInput,
  attributeTypes: Record<string, "S" | "N" | "B">,
): KeyConditionResult {
  const pkType = attributeTypes[input.partitionKeyName] ?? "S";
  const pkVal = coerceValue(input.partitionValue, pkType, input.partitionKeyName);

  let expression = "#pk = :pk";
  const names: Record<string, string> = { "#pk": input.partitionKeyName };
  const values: Record<string, unknown> = { ":pk": pkVal };

  if (input.sortOp) {
    if (!input.sortKeyName) {
      throw new Error("Sort key name is required when sort operation is specified");
    }
    const skType = attributeTypes[input.sortKeyName] ?? "S";
    names["#sk"] = input.sortKeyName;

    if (input.sortOp === "between") {
      if (
        input.sortValue === undefined ||
        input.sortValue2 === undefined ||
        input.sortValue === "" ||
        input.sortValue2 === ""
      ) {
        throw new Error("sortValue and sortValue2 are required for between operation");
      }
      const skVal1 = coerceValue(input.sortValue, skType, input.sortKeyName);
      const skVal2 = coerceValue(input.sortValue2, skType, input.sortKeyName);
      expression += " AND #sk BETWEEN :sk1 AND :sk2";
      values[":sk1"] = skVal1;
      values[":sk2"] = skVal2;
    } else {
      if (input.sortValue === undefined || input.sortValue === "") {
        throw new Error("sortValue is required");
      }
      const skVal = coerceValue(input.sortValue, skType, input.sortKeyName);
      if (input.sortOp === "eq") {
        expression += " AND #sk = :sk";
        values[":sk"] = skVal;
      } else if (input.sortOp === "begins_with") {
        expression += " AND begins_with(#sk, :sk)";
        values[":sk"] = skVal;
      }
    }
  }

  return {
    KeyConditionExpression: expression,
    ExpressionAttributeNames: names,
    ExpressionAttributeValues: values,
  };
}

export async function scanItems(
  doc: DynamoDBDocumentClient,
  params: {
    tableName: string;
    pageSize?: number;
    exclusiveStartKey?: Record<string, unknown>;
  },
): Promise<{
  items: Record<string, unknown>[];
  lastEvaluatedKey?: Record<string, unknown>;
}> {
  const res = await doc.send(
    new ScanCommand({
      TableName: params.tableName,
      ConsistentRead: true,
      Limit: params.pageSize ?? SCAN_PAGE_SIZE,
      ExclusiveStartKey: params.exclusiveStartKey,
    }),
  );

  return {
    items: (res.Items as Record<string, unknown>[]) ?? [],
    lastEvaluatedKey: res.LastEvaluatedKey as Record<string, unknown> | undefined,
  };
}

export async function queryItems(
  doc: DynamoDBDocumentClient,
  params: {
    tableName: string;
    keyCondition: KeyConditionResult;
    indexName?: string;
    pageSize?: number;
    exclusiveStartKey?: Record<string, unknown>;
  },
): Promise<{
  items: Record<string, unknown>[];
  lastEvaluatedKey?: Record<string, unknown>;
}> {
  const res = await doc.send(
    new QueryCommand({
      TableName: params.tableName,
      IndexName: params.indexName,
      KeyConditionExpression: params.keyCondition.KeyConditionExpression,
      ExpressionAttributeNames: params.keyCondition.ExpressionAttributeNames,
      ExpressionAttributeValues: params.keyCondition.ExpressionAttributeValues,
      ConsistentRead: params.indexName ? undefined : true,
      Limit: params.pageSize ?? SCAN_PAGE_SIZE,
      ExclusiveStartKey: params.exclusiveStartKey,
    }),
  );

  return {
    items: (res.Items as Record<string, unknown>[]) ?? [],
    lastEvaluatedKey: res.LastEvaluatedKey as Record<string, unknown> | undefined,
  };
}

export async function putItem(
  doc: DynamoDBDocumentClient,
  params: {
    tableName: string;
    item: Record<string, unknown>;
  },
): Promise<void> {
  await doc.send(
    new PutCommand({
      TableName: params.tableName,
      Item: params.item,
    }),
  );
}

export async function deleteItem(
  doc: DynamoDBDocumentClient,
  params: {
    tableName: string;
    key: Record<string, unknown>;
  },
): Promise<void> {
  await doc.send(
    new DeleteCommand({
      TableName: params.tableName,
      Key: params.key,
    }),
  );
}

export async function clearTable(
  doc: DynamoDBDocumentClient,
  params: {
    tableName: string;
    keyNames: string[];
    max?: number;
  },
): Promise<{ deleted: number }> {
  if (params.keyNames.length === 0) {
    return { deleted: 0 };
  }

  const maxItems = params.max ?? CLEAR_TABLE_MAX_ITEMS;
  let deleted = 0;
  let exclusiveStartKey: Record<string, unknown> | undefined = undefined;

  const names: Record<string, string> = {};
  params.keyNames.forEach((k, i) => {
    names[`#k${i}`] = k;
  });
  const projectionExpression = params.keyNames.map((_, i) => `#k${i}`).join(", ");

  while (deleted < maxItems) {
    const scanLimit = Math.min(100, maxItems - deleted);
    const scanRes = await doc.send(
      new ScanCommand({
        TableName: params.tableName,
        ConsistentRead: true,
        Limit: scanLimit,
        ProjectionExpression: projectionExpression,
        ExpressionAttributeNames: names,
        ExclusiveStartKey: exclusiveStartKey,
      }),
    );

    const items = (scanRes.Items as Record<string, unknown>[]) ?? [];
    if (items.length === 0) {
      break;
    }

    // BatchWrite up to 25 items at a time
    for (let i = 0; i < items.length; i += 25) {
      const chunk = items.slice(i, i + 25);
      let requestItems: NonNullable<BatchWriteCommandInput["RequestItems"]> = {
        [params.tableName]: chunk.map((item) => {
          const key: Record<string, unknown> = {};
          for (const k of params.keyNames) {
            key[k] = item[k];
          }
          return { DeleteRequest: { Key: key } };
        }),
      };

      let rounds = 0;
      while (
        requestItems[params.tableName] &&
        requestItems[params.tableName].length > 0 &&
        rounds < 3
      ) {
        const batchRes = await doc.send(
          new BatchWriteCommand({
            RequestItems: requestItems,
          }),
        );
        const unprocessed = batchRes.UnprocessedItems?.[params.tableName];
        if (unprocessed && unprocessed.length > 0) {
          requestItems = { [params.tableName]: unprocessed };
          rounds++;
        } else {
          requestItems = { [params.tableName]: [] };
          break;
        }
      }

      const remainingUnprocessed = requestItems[params.tableName]?.length ?? 0;
      deleted += chunk.length - remainingUnprocessed;
    }

    exclusiveStartKey = scanRes.LastEvaluatedKey as Record<string, unknown> | undefined;
    if (!exclusiveStartKey) {
      break;
    }
  }

  return { deleted };
}
