import {
  ChangeMessageVisibilityBatchCommand,
  CreateQueueCommand,
  DeleteMessageBatchCommand,
  DeleteMessageCommand,
  DeleteQueueCommand,
  GetQueueAttributesCommand,
  ListQueuesCommand,
  PurgeQueueCommand,
  ReceiveMessageCommand,
  SendMessageCommand,
  type SQSClient,
} from "@aws-sdk/client-sqs";

export const PEEK_VISIBILITY_TIMEOUT_SECONDS = 30;
export const MAX_PEEK_MESSAGES = 10;
export const REDRIVE_MAX_MESSAGES = 1000;

export interface QueueAttributes {
  depth: number;
  inFlight: number;
  delayed: number;
  createdTimestamp?: Date;
  dlqName?: string;
}

export interface QueueSummary {
  url: string;
  name: string;
  isFifo: boolean;
  attributes: QueueAttributes;
}

export interface PeekedMessage {
  messageId: string;
  body: string;
  receiptHandle: string;
  sentAt?: Date;
  receiveCount?: number;
  messageGroupId?: string;
}

function parseQueueName(url: string): string {
  return url.split("/").pop() ?? url;
}

export async function getQueueAttributes(
  client: SQSClient,
  queueUrl: string,
): Promise<QueueAttributes> {
  const res = await client.send(
    new GetQueueAttributesCommand({
      QueueUrl: queueUrl,
      AttributeNames: ["All"],
    }),
  );

  const attrs = res.Attributes ?? {};
  const depth = Number(attrs.ApproximateNumberOfMessages) || 0;
  const inFlight = Number(attrs.ApproximateNumberOfMessagesNotVisible) || 0;
  const delayed = Number(attrs.ApproximateNumberOfMessagesDelayed) || 0;

  const createdSec = attrs.CreatedTimestamp ? Number(attrs.CreatedTimestamp) : NaN;
  const createdTimestamp = Number.isFinite(createdSec)
    ? new Date(createdSec * 1000)
    : undefined;

  let dlqName: string | undefined;
  if (attrs.RedrivePolicy) {
    try {
      const parsed = JSON.parse(attrs.RedrivePolicy);
      if (typeof parsed?.deadLetterTargetArn === "string") {
        dlqName = parsed.deadLetterTargetArn.split(":").pop();
      }
    } catch {
      // malformed policy -> undefined
    }
  }

  return {
    depth,
    inFlight,
    delayed,
    createdTimestamp,
    dlqName,
  };
}

export async function listQueues(client: SQSClient): Promise<QueueSummary[]> {
  const urls: string[] = [];
  let nextToken: string | undefined;

  do {
    const res = await client.send(
      new ListQueuesCommand({
        NextToken: nextToken,
      }),
    );
    if (res.QueueUrls) {
      urls.push(...res.QueueUrls);
    }
    nextToken = res.NextToken;
  } while (nextToken);

  const summaries = await Promise.all(
    urls.map(async (url) => {
      const name = parseQueueName(url);
      const isFifo = name.endsWith(".fifo");
      const attributes = await getQueueAttributes(client, url);
      return {
        url,
        name,
        isFifo,
        attributes,
      };
    }),
  );

  return summaries.sort((a, b) => a.name.localeCompare(b.name));
}

export async function createQueue(
  client: SQSClient,
  params: { name: string },
): Promise<{ url: string }> {
  const isFifo = params.name.endsWith(".fifo");
  const res = await client.send(
    new CreateQueueCommand({
      QueueName: params.name,
      Attributes: isFifo
        ? {
            FifoQueue: "true",
            ContentBasedDeduplication: "true",
          }
        : undefined,
    }),
  );

  if (!res.QueueUrl) {
    throw new Error("CreateQueue returned no URL");
  }

  return { url: res.QueueUrl };
}

export async function deleteQueue(
  client: SQSClient,
  queueUrl: string,
): Promise<void> {
  await client.send(new DeleteQueueCommand({ QueueUrl: queueUrl }));
}

export async function purgeQueue(
  client: SQSClient,
  queueUrl: string,
): Promise<void> {
  await client.send(new PurgeQueueCommand({ QueueUrl: queueUrl }));
}

export async function deleteMessage(
  client: SQSClient,
  params: { queueUrl: string; receiptHandle: string },
): Promise<void> {
  await client.send(
    new DeleteMessageCommand({
      QueueUrl: params.queueUrl,
      ReceiptHandle: params.receiptHandle,
    }),
  );
}

export async function sendMessage(
  client: SQSClient,
  params: { queueUrl: string; body: string; messageGroupId?: string },
): Promise<{ messageId: string }> {
  const res = await client.send(
    new SendMessageCommand({
      QueueUrl: params.queueUrl,
      MessageBody: params.body,
      MessageGroupId: params.messageGroupId,
    }),
  );
  return { messageId: res.MessageId ?? "" };
}

export async function peekMessages(
  client: SQSClient,
  params: { queueUrl: string; max?: number; visibilityTimeoutSeconds?: number },
): Promise<PeekedMessage[]> {
  const res = await client.send(
    new ReceiveMessageCommand({
      QueueUrl: params.queueUrl,
      MaxNumberOfMessages: params.max ?? MAX_PEEK_MESSAGES,
      VisibilityTimeout:
        params.visibilityTimeoutSeconds ?? PEEK_VISIBILITY_TIMEOUT_SECONDS,
      WaitTimeSeconds: 0,
      AttributeNames: ["All"],
    }),
  );

  const out: PeekedMessage[] = [];
  for (const m of res.Messages ?? []) {
    if (!m.MessageId || m.Body === undefined || !m.ReceiptHandle) {
      continue;
    }
    const attrs = m.Attributes ?? {};
    const sentMs = attrs.SentTimestamp ? Number(attrs.SentTimestamp) : NaN;
    const sentAt = Number.isFinite(sentMs) ? new Date(sentMs) : undefined;
    const receiveCount = attrs.ApproximateReceiveCount
      ? Number(attrs.ApproximateReceiveCount)
      : undefined;
    const messageGroupId = attrs.MessageGroupId;

    out.push({
      messageId: m.MessageId,
      body: m.Body,
      receiptHandle: m.ReceiptHandle,
      sentAt,
      receiveCount: Number.isFinite(receiveCount) ? receiveCount : undefined,
      messageGroupId,
    });
  }

  return out;
}

export async function restoreVisibility(
  client: SQSClient,
  params: { queueUrl: string; receiptHandles: string[] },
): Promise<void> {
  if (!params.receiptHandles.length) {
    return;
  }

  const chunkSize = 10;
  for (let i = 0; i < params.receiptHandles.length; i += chunkSize) {
    const chunk = params.receiptHandles.slice(i, i + chunkSize);
    await client.send(
      new ChangeMessageVisibilityBatchCommand({
        QueueUrl: params.queueUrl,
        Entries: chunk.map((h, idx) => ({
          Id: `m${idx}`,
          ReceiptHandle: h,
          VisibilityTimeout: 0,
        })),
      }),
    );
  }
}

export async function redriveMessages(
  client: SQSClient,
  params: { sourceUrl: string; targetUrl: string; max?: number },
): Promise<{ moved: number }> {
  const max = params.max ?? REDRIVE_MAX_MESSAGES;
  let moved = 0;
  const isTargetFifo = params.targetUrl.endsWith(".fifo");

  while (moved < max) {
    const toFetch = Math.min(10, max - moved);
    const res = await client.send(
      new ReceiveMessageCommand({
        QueueUrl: params.sourceUrl,
        MaxNumberOfMessages: toFetch,
        VisibilityTimeout: 30,
        WaitTimeSeconds: 0,
        AttributeNames: ["All"],
      }),
    );

    const messages = res.Messages ?? [];
    if (messages.length === 0) {
      break;
    }

    const deleteEntries: Array<{ Id: string; ReceiptHandle: string }> = [];

    for (let i = 0; i < messages.length; i++) {
      const msg = messages[i];
      if (msg.Body === undefined || !msg.ReceiptHandle) {
        continue;
      }

      const groupId = isTargetFifo
        ? (msg.Attributes?.MessageGroupId ?? "redrive")
        : undefined;

      await client.send(
        new SendMessageCommand({
          QueueUrl: params.targetUrl,
          MessageBody: msg.Body,
          MessageGroupId: groupId,
        }),
      );

      deleteEntries.push({
        Id: `m${i}`,
        ReceiptHandle: msg.ReceiptHandle,
      });
    }

    if (deleteEntries.length > 0) {
      await client.send(
        new DeleteMessageBatchCommand({
          QueueUrl: params.sourceUrl,
          Entries: deleteEntries,
        }),
      );
      moved += deleteEntries.length;
    }
  }

  return { moved };
}
