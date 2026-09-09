import { describe, expect, it, vi, beforeEach } from "vitest";
import { fireEvent, screen, within } from "@testing-library/react";
import { TopicView } from "./TopicView";
import { renderWithProviders } from "@/test/utils";
import { LOCAL_PROFILE_ID, localProfile, useProfiles } from "@/store/profiles";
import { useTabs } from "@/store/tabs";
import type { TopicAttributes, TopicSubscription } from "@/lib/sns";
import type { QueueSummary } from "@/lib/sqs";

const mockTopicArn = "arn:aws:sns:us-east-1:000000000000:events.fifo";

const mockAttrs: TopicAttributes = {
  displayName: "Orders Feed",
  subscriptionsConfirmed: 3,
  subscriptionsPending: 1,
};

const mockSubs: TopicSubscription[] = [
  {
    arn: "arn:aws:sns:us-east-1:000000000000:events.fifo:sub-1",
    protocol: "sqs",
    endpoint: "arn:aws:sqs:us-east-1:000000000000:orders",
    isPending: false,
  },
  {
    arn: "PendingConfirmation",
    protocol: "email",
    endpoint: "ops@example.com",
    isPending: true,
  },
];

const mockQueues: QueueSummary[] = [
  {
    url: "http://localhost:4566/000000000000/orders",
    name: "orders",
    isFifo: false,
    attributes: {
      depth: 0,
      inFlight: 0,
      delayed: 0,
      arn: "arn:aws:sqs:us-east-1:000000000000:orders",
    },
  },
];

const { mockPublish, mockSubscribeQueue, mockDeleteTopic } = vi.hoisted(() => ({
  mockPublish: vi.fn().mockResolvedValue("msg-123"),
  mockSubscribeQueue: vi.fn().mockResolvedValue("sub-arn-1"),
  mockDeleteTopic: vi.fn().mockResolvedValue(true),
}));

vi.mock("@/hooks/use-sns", () => ({
  useTopicAttributes: () => ({
    data: mockAttrs,
    isPending: false,
    error: null,
    refetch: vi.fn(),
  }),
  useTopicSubscriptions: () => ({
    data: mockSubs,
    isPending: false,
    error: null,
    refetch: vi.fn(),
  }),
  useTopicActions: () => ({
    publish: mockPublish,
    subscribeQueue: mockSubscribeQueue,
    deleteTopic: mockDeleteTopic,
  }),
}));

vi.mock("@/hooks/use-sqs", () => ({
  useQueues: () => ({
    data: mockQueues,
    isPending: false,
    error: null,
    refetch: vi.fn(),
  }),
}));

describe("TopicView", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useProfiles.setState({
      profiles: [{ ...localProfile(), region: "us-east-1" }],
      activeProfileId: LOCAL_PROFILE_ID,
    });
    useTabs.setState({
      tabs: [
        {
          id: `topic:${mockTopicArn}`,
          kind: "topic",
          topicArn: mockTopicArn,
          title: "events.fifo",
        },
      ],
      activeTabId: `topic:${mockTopicArn}`,
    });
  });

  it("renders attributes and subscriptions table", () => {
    renderWithProviders(<TopicView topicArn={mockTopicArn} />);

    expect(screen.getByText("events.fifo")).toBeInTheDocument();
    expect(screen.getByText("FIFO")).toBeInTheDocument();
    expect(screen.getByText("Orders Feed")).toBeInTheDocument();
    expect(screen.getByText("3")).toBeInTheDocument();
    expect(screen.getByText("1")).toBeInTheDocument();

    expect(screen.getByText("sqs")).toBeInTheDocument();
    expect(
      screen.getByText("arn:aws:sqs:us-east-1:000000000000:orders"),
    ).toBeInTheDocument();
    expect(screen.getByText("Confirmed")).toBeInTheDocument();

    expect(screen.getByText("email")).toBeInTheDocument();
    expect(screen.getByText("ops@example.com")).toBeInTheDocument();
    expect(screen.getByText("Pending")).toBeInTheDocument();
  });

  it("validates publish dialog and enforces FIFO MessageGroupId gate", async () => {
    renderWithProviders(<TopicView topicArn={mockTopicArn} />);
    fireEvent.click(screen.getByRole("button", { name: /Publish message/i }));

    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByText("Publish message")).toBeInTheDocument();

    const msgInput = within(dialog).getByLabelText(/Message body/i);
    const groupIdInput = within(dialog).getByLabelText(/Message group ID/i);
    const attrsInput = within(dialog).getByLabelText(/Message attributes/i);
    const submitBtn = within(dialog).getByRole("button", { name: "Publish" });

    // FIFO topic displays MessageGroupId
    expect(groupIdInput).toBeInTheDocument();

    // Invalid attributes JSON
    fireEvent.change(msgInput, { target: { value: "Hello world" } });
    fireEvent.change(attrsInput, { target: { value: "not-json" } });
    fireEvent.click(submitBtn);

    expect(
      within(dialog).getByText("Message attributes must be valid JSON"),
    ).toBeInTheDocument();
    expect(mockPublish).not.toHaveBeenCalled();

    // Valid attributes JSON
    fireEvent.change(attrsInput, {
      target: {
        value: '{"env": {"DataType": "String", "StringValue": "dev"}}',
      },
    });
    fireEvent.click(submitBtn);

    expect(mockPublish).toHaveBeenCalledWith(
      expect.objectContaining({
        message: "Hello world",
        messageGroupId: "1",
        messageAttributes: {
          env: { DataType: "String", StringValue: "dev" },
        },
      }),
    );
  });

  it("subscribes SQS queue via dialog", async () => {
    renderWithProviders(<TopicView topicArn={mockTopicArn} />);
    fireEvent.click(screen.getByRole("button", { name: /Subscribe SQS/i }));

    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByText("Subscribe SQS queue")).toBeInTheDocument();

    // Select queue
    const trigger = within(dialog).getByRole("combobox");
    fireEvent.keyDown(trigger, { key: "ArrowDown", code: "ArrowDown" });

    const queueOption = await screen.findByRole("option", {
      name: /orders \(Standard\)/i,
    });
    fireEvent.click(queueOption);

    const submitBtn = within(dialog).getByRole("button", {
      name: "Subscribe",
    });
    fireEvent.click(submitBtn);

    expect(mockSubscribeQueue).toHaveBeenCalledWith(
      "arn:aws:sqs:us-east-1:000000000000:orders",
    );
  });

  it("deletes topic and closes tab", async () => {
    renderWithProviders(<TopicView topicArn={mockTopicArn} />);
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));

    const confirmDialog = screen.getByRole("dialog");
    expect(
      within(confirmDialog).getByText(/Are you sure you want to delete topic/),
    ).toBeInTheDocument();

    const confirmBtn = within(confirmDialog).getByRole("button", {
      name: "Delete",
    });
    fireEvent.click(confirmBtn);

    expect(mockDeleteTopic).toHaveBeenCalledWith(mockTopicArn);
  });
});
