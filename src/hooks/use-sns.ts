import { useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { SNSClient } from "@aws-sdk/client-sns";
import { toast } from "sonner";
import { makeClients } from "@/lib/aws";
import { useActiveProfile } from "@/store/profiles";
import {
  listTopics,
  getTopicAttributes,
  listSubscriptions,
  createTopic,
  deleteTopic,
  publishMessage,
  subscribe,
  type PublishMessageParams,
} from "@/lib/sns";

function toErrorMessage(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

export const snsKeys = {
  topics: (profileId: string, region?: string) =>
    region
      ? (["sns", "topics", profileId, region] as const)
      : (["sns", "topics", profileId] as const),
  topic: (profileId: string, arn: string, region?: string) =>
    region
      ? (["sns", "topic", profileId, arn, region] as const)
      : (["sns", "topic", profileId, arn] as const),
  subscriptions: (profileId: string, arn: string, region?: string) =>
    region
      ? (["sns", "subscriptions", profileId, arn, region] as const)
      : (["sns", "subscriptions", profileId, arn] as const),
};

export function useSnsClient(): SNSClient {
  const profile = useActiveProfile();
  return useMemo(
    () => makeClients(profile).sns,
    [profile.id, profile.endpoint, profile.region, profile.authToken],
  );
}

export function useTopics(profileId: string, options?: { enabled?: boolean }) {
  const client = useSnsClient();
  const profile = useActiveProfile();
  return useQuery({
    queryKey: snsKeys.topics(profileId, profile.region),
    queryFn: () => listTopics(client),
    staleTime: 5_000,
    refetchInterval: 10_000,
    enabled: options?.enabled,
  });
}

export function useTopicAttributes(
  profileId: string,
  arn: string,
  options?: { enabled?: boolean },
) {
  const client = useSnsClient();
  const profile = useActiveProfile();
  return useQuery({
    queryKey: snsKeys.topic(profileId, arn, profile.region),
    queryFn: () => getTopicAttributes(client, arn),
    staleTime: 5_000,
    enabled: Boolean(arn) && options?.enabled !== false,
  });
}

export function useTopicSubscriptions(
  profileId: string,
  arn: string,
  options?: { enabled?: boolean },
) {
  const client = useSnsClient();
  const profile = useActiveProfile();
  return useQuery({
    queryKey: snsKeys.subscriptions(profileId, arn, profile.region),
    queryFn: () => listSubscriptions(client, arn),
    staleTime: 5_000,
    refetchInterval: 10_000,
    enabled: Boolean(arn) && options?.enabled !== false,
  });
}

export function useTopicActions(topicArn?: string) {
  const client = useSnsClient();
  const queryClient = useQueryClient();
  const profile = useActiveProfile();

  const invalidateTopics = () => {
    queryClient.invalidateQueries({
      queryKey: ["sns", "topics", profile.id],
    });
  };

  const invalidateTopicDetails = (arn: string) => {
    queryClient.invalidateQueries({
      queryKey: ["sns", "topic", profile.id, arn],
    });
    queryClient.invalidateQueries({
      queryKey: ["sns", "subscriptions", profile.id, arn],
    });
  };

  const createTopicAction = async (params: {
    name: string;
    fifo?: boolean;
  }): Promise<string | null> => {
    try {
      const { arn } = await createTopic(client, params);
      toast.success(`Topic ${params.name} created`);
      invalidateTopics();
      return arn;
    } catch (e) {
      toast.error(`Failed to create topic: ${toErrorMessage(e)}`);
      return null;
    }
  };

  const deleteTopicAction = async (arn: string): Promise<boolean> => {
    try {
      await deleteTopic(client, arn);
      toast.success("Topic deleted");
      invalidateTopics();
      invalidateTopicDetails(arn);
      return true;
    } catch (e) {
      toast.error(`Failed to delete topic: ${toErrorMessage(e)}`);
      return false;
    }
  };

  const publishAction = async (
    params: Omit<PublishMessageParams, "topicArn"> & { topicArn?: string },
  ): Promise<string | null> => {
    const targetArn = params.topicArn ?? topicArn;
    if (!targetArn) {
      toast.error("No topic ARN provided");
      return null;
    }
    try {
      const { messageId } = await publishMessage(client, {
        ...params,
        topicArn: targetArn,
      });
      toast.success("Message published");
      return messageId;
    } catch (e) {
      toast.error(`Failed to publish message: ${toErrorMessage(e)}`);
      return null;
    }
  };

  const subscribeQueueAction = async (
    queueArn: string,
    targetTopicArn?: string,
  ): Promise<string | null> => {
    const targetArn = targetTopicArn ?? topicArn;
    if (!targetArn) {
      toast.error("No topic ARN provided");
      return null;
    }
    try {
      const { subscriptionArn } = await subscribe(client, {
        topicArn: targetArn,
        protocol: "sqs",
        endpoint: queueArn,
      });
      toast.success("Subscribed SQS queue");
      invalidateTopicDetails(targetArn);
      return subscriptionArn;
    } catch (e) {
      toast.error(`Failed to subscribe queue: ${toErrorMessage(e)}`);
      return null;
    }
  };

  return {
    createTopic: createTopicAction,
    deleteTopic: deleteTopicAction,
    publish: publishAction,
    subscribeQueue: subscribeQueueAction,
  };
}
