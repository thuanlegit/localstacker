import {
  type SNSClient,
  ListTopicsCommand,
  GetTopicAttributesCommand,
  ListSubscriptionsByTopicCommand,
  CreateTopicCommand,
  DeleteTopicCommand,
  PublishCommand,
  SubscribeCommand,
  type MessageAttributeValue,
  type ListTopicsCommandOutput,
  type ListSubscriptionsByTopicCommandOutput,
} from "@aws-sdk/client-sns";

export interface TopicSummary {
  arn: string;
  name: string;
  isFifo: boolean;
}

export interface TopicAttributes {
  displayName?: string;
  subscriptionsConfirmed: number;
  subscriptionsPending: number;
}

export interface TopicSubscription {
  arn: string;
  protocol: string;
  endpoint: string;
  isPending: boolean;
}

export async function listTopics(client: SNSClient): Promise<TopicSummary[]> {
  const summaries: TopicSummary[] = [];
  let nextToken: string | undefined = undefined;

  do {
    const res: ListTopicsCommandOutput = await client.send(
      new ListTopicsCommand({
        NextToken: nextToken,
      }),
    );

    if (res.Topics) {
      for (const topic of res.Topics) {
        if (topic.TopicArn) {
          const arn = topic.TopicArn;
          const name = arn.split(":").pop() ?? arn;
          const isFifo = name.endsWith(".fifo");
          summaries.push({ arn, name, isFifo });
        }
      }
    }

    nextToken = res.NextToken;
  } while (nextToken);

  summaries.sort((a, b) => a.name.localeCompare(b.name));
  return summaries;
}

export async function getTopicAttributes(
  client: SNSClient,
  arn: string,
): Promise<TopicAttributes> {
  const res = await client.send(
    new GetTopicAttributesCommand({
      TopicArn: arn,
    }),
  );

  const attrs = res.Attributes ?? {};
  return {
    displayName: attrs.DisplayName || undefined,
    subscriptionsConfirmed: Number(attrs.SubscriptionsConfirmed) || 0,
    subscriptionsPending: Number(attrs.SubscriptionsPending) || 0,
  };
}

export async function listSubscriptions(
  client: SNSClient,
  arn: string,
): Promise<TopicSubscription[]> {
  const subscriptions: TopicSubscription[] = [];
  let nextToken: string | undefined = undefined;

  do {
    const res: ListSubscriptionsByTopicCommandOutput = await client.send(
      new ListSubscriptionsByTopicCommand({
        TopicArn: arn,
        NextToken: nextToken,
      }),
    );

    if (res.Subscriptions) {
      for (const sub of res.Subscriptions) {
        const subArn = sub.SubscriptionArn ?? "";
        subscriptions.push({
          arn: subArn,
          protocol: sub.Protocol ?? "",
          endpoint: sub.Endpoint ?? "",
          isPending: subArn === "PendingConfirmation",
        });
      }
    }

    nextToken = res.NextToken;
  } while (nextToken);

  return subscriptions;
}

export async function createTopic(
  client: SNSClient,
  params: { name: string; fifo?: boolean },
): Promise<{ arn: string }> {
  const res = await client.send(
    new CreateTopicCommand({
      Name: params.name,
      Attributes: params.fifo ? { FifoTopic: "true" } : undefined,
    }),
  );

  if (!res.TopicArn) {
    throw new Error("CreateTopic returned no ARN");
  }

  return { arn: res.TopicArn };
}

export async function deleteTopic(
  client: SNSClient,
  arn: string,
): Promise<void> {
  await client.send(new DeleteTopicCommand({ TopicArn: arn }));
}

export interface PublishMessageParams {
  topicArn: string;
  message: string;
  subject?: string;
  messageGroupId?: string;
  messageAttributes?: Record<
    string,
    {
      DataType: "String" | "Number" | "Binary";
      StringValue?: string;
      BinaryValue?: string;
    }
  >;
}

export async function publishMessage(
  client: SNSClient,
  params: PublishMessageParams,
): Promise<{ messageId: string }> {
  let mappedAttributes: Record<string, MessageAttributeValue> | undefined =
    undefined;

  if (params.messageAttributes) {
    mappedAttributes = {};
    for (const [key, attr] of Object.entries(params.messageAttributes)) {
      mappedAttributes[key] = {
        DataType: attr.DataType,
        StringValue: attr.StringValue,
        BinaryValue: attr.BinaryValue
          ? Buffer.from(attr.BinaryValue, "base64")
          : undefined,
      };
    }
  }

  const res = await client.send(
    new PublishCommand({
      TopicArn: params.topicArn,
      Message: params.message,
      Subject: params.subject,
      MessageGroupId: params.messageGroupId,
      MessageAttributes: mappedAttributes,
    }),
  );

  return { messageId: res.MessageId ?? "" };
}

export async function subscribe(
  client: SNSClient,
  params: {
    topicArn: string;
    protocol: string;
    endpoint: string;
  },
): Promise<{ subscriptionArn: string }> {
  const res = await client.send(
    new SubscribeCommand({
      TopicArn: params.topicArn,
      Protocol: params.protocol,
      Endpoint: params.endpoint,
    }),
  );

  return { subscriptionArn: res.SubscriptionArn ?? "" };
}
