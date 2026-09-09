import { describe, expect, it, vi, beforeEach } from "vitest";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import type { SQSClient } from "@aws-sdk/client-sqs";
import { QueueView } from "./QueueView";
import { renderWithProviders } from "@/test/utils";
import { LOCAL_PROFILE_ID, localProfile, useProfiles } from "@/store/profiles";
import {
  deleteMessage,
  peekMessages,
  purgeQueue,
  redriveMessages,
  restoreVisibility,
  sendMessage,
  type PeekedMessage,
  type QueueSummary,
} from "@/lib/sqs";

vi.mock("@/lib/sqs", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/sqs")>();
  return {
    ...actual,
    sendMessage: vi.fn().mockResolvedValue({ messageId: "msg-1" }),
    peekMessages: vi.fn().mockResolvedValue([]),
    restoreVisibility: vi.fn().mockResolvedValue(undefined),
    deleteMessage: vi.fn().mockResolvedValue(undefined),
    purgeQueue: vi.fn().mockResolvedValue(undefined),
    redriveMessages: vi.fn().mockResolvedValue({ moved: 1 }),
  };
});

const mockSend = vi.fn().mockResolvedValue({});
const mockClient = { send: mockSend } as unknown as SQSClient;

const demoQueue: QueueSummary = {
  url: "http://localhost:4566/000000000000/demo-queue",
  name: "demo-queue",
  isFifo: false,
  attributes: {
    depth: 3,
    inFlight: 1,
    delayed: 0,
    dlqName: "demo-dlq",
    createdTimestamp: new Date("2026-01-01T00:00:00Z"),
    arn: "arn:aws:sqs:us-east-1:000000000000:demo-queue",
  },
};

const fifoQueue: QueueSummary = {
  url: "http://localhost:4566/000000000000/demo.fifo",
  name: "demo.fifo",
  isFifo: true,
  attributes: {
    depth: 0,
    inFlight: 0,
    delayed: 0,
    arn: "arn:aws:sqs:us-east-1:000000000000:demo.fifo",
  },
};

const otherQueue: QueueSummary = {
  url: "http://localhost:4566/000000000000/other-queue",
  name: "other-queue",
  isFifo: false,
  attributes: {
    depth: 0,
    inFlight: 0,
    delayed: 0,
    arn: "arn:aws:sqs:us-east-1:000000000000:other-queue",
  },
};

let currentQueues: QueueSummary[] = [demoQueue, fifoQueue, otherQueue];

vi.mock("@/hooks/use-sqs", () => ({
  useSqsClient: () => mockClient,
  useQueues: () => ({
    data: currentQueues,
    isPending: false,
    isFetching: false,
    error: null,
    refetch: vi.fn(),
  }),
  sqsKeys: {
    queues: (id: string) => ["sqs", "queues", id],
  },
}));

describe("QueueView", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    currentQueues = [demoQueue, fifoQueue, otherQueue];
    useProfiles.setState({
      profiles: [{ ...localProfile(), region: "us-east-1" }],
      activeProfileId: LOCAL_PROFILE_ID,
    });
  });

  it("renders header stats and DLQ chip", () => {
    renderWithProviders(<QueueView queueName="demo-queue" />);

    expect(screen.getByText("demo-queue")).toBeInTheDocument();
    expect(
      screen.getAllByText(/3 messages · 1 in flight · 0 delayed/),
    ).toHaveLength(2);
    expect(screen.getByText("Dead-letter queue: demo-dlq")).toBeInTheDocument();
  });

  it("send dialog validates JSON and submits for standard queue", async () => {
    renderWithProviders(<QueueView queueName="demo-queue" />);

    fireEvent.click(screen.getByRole("button", { name: /Send message/i }));
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByRole("heading", { name: "Send message" })).toBeInTheDocument();

    const textarea = within(dialog).getByLabelText(/Message body/i);
    const submitBtn = within(dialog).getByRole("button", { name: "Send" });

    // Invalid JSON
    fireEvent.change(textarea, { target: { value: "{\"bad" } });
    expect(
      within(dialog).getByText("Message body must be valid JSON"),
    ).toBeInTheDocument();
    expect(submitBtn).toBeDisabled();

    // Valid JSON
    fireEvent.change(textarea, { target: { value: "{\"orderId\":42}" } });
    expect(
      within(dialog).queryByText("Message body must be valid JSON"),
    ).not.toBeInTheDocument();
    expect(submitBtn).not.toBeDisabled();

    fireEvent.click(submitBtn);

    expect(sendMessage).toHaveBeenCalledWith(mockClient, {
      queueUrl: demoQueue.url,
      body: "{\"orderId\":42}",
      messageGroupId: undefined,
    });
  });

  it("send dialog requires messageGroupId for FIFO queue", async () => {
    renderWithProviders(<QueueView queueName="demo.fifo" />);

    fireEvent.click(screen.getByRole("button", { name: /Send message/i }));
    const dialog = screen.getByRole("dialog");

    const groupIdInput = within(dialog).getByLabelText(/Message group ID/i);
    expect(groupIdInput).toBeInTheDocument();
    expect(groupIdInput).toHaveValue("1");

    const textarea = within(dialog).getByLabelText(/Message body/i);
    fireEvent.change(textarea, { target: { value: "{\"fifo\": true}" } });

    // Empty group ID disables submit
    fireEvent.change(groupIdInput, { target: { value: "" } });
    const submitBtn = within(dialog).getByRole("button", { name: "Send" });
    expect(submitBtn).toBeDisabled();

    fireEvent.change(groupIdInput, { target: { value: "grp-42" } });
    expect(submitBtn).not.toBeDisabled();

    fireEvent.click(submitBtn);

    expect(sendMessage).toHaveBeenCalledWith(mockClient, {
      queueUrl: fifoQueue.url,
      body: "{\"fifo\": true}",
      messageGroupId: "grp-42",
    });
  });

  it("peeks messages, pretty-prints JSON, restores on peek again and unmount", async () => {
    const sampleMsg: PeekedMessage = {
      messageId: "msg-sample",
      body: "{\"orderId\":42}",
      receiptHandle: "rcpt-1",
      sentAt: new Date("2026-01-01T00:00:00Z"),
      receiveCount: 1,
    };
    vi.mocked(peekMessages).mockResolvedValueOnce([sampleMsg]);

    const { unmount } = renderWithProviders(<QueueView queueName="demo-queue" />);

    fireEvent.click(screen.getByRole("button", { name: /Peek messages/i }));

    expect(peekMessages).toHaveBeenCalledWith(mockClient, {
      queueUrl: demoQueue.url,
    });

    expect(await screen.findByText("msg-sample")).toBeInTheDocument();
    // Pretty-printed JSON
    expect(screen.getByText(/{\s+"orderId":\s*42\s*}/)).toBeInTheDocument();

    // Peek again restores previous handle
    vi.mocked(peekMessages).mockResolvedValueOnce([]);
    fireEvent.click(screen.getByRole("button", { name: /Peek again/i }));

    expect(restoreVisibility).toHaveBeenCalledWith(mockClient, {
      queueUrl: demoQueue.url,
      receiptHandles: ["rcpt-1"],
    });

    // Unmount restores remaining handles if any
    unmount();
  });

  it("deletes a message from peek list and excludes it from restore", async () => {
    const sampleMsg: PeekedMessage = {
      messageId: "msg-delete-me",
      body: "{\"foo\":\"bar\"}",
      receiptHandle: "rcpt-del",
    };
    vi.mocked(peekMessages).mockResolvedValueOnce([sampleMsg]);

    const { unmount } = renderWithProviders(<QueueView queueName="demo-queue" />);
    fireEvent.click(screen.getByRole("button", { name: /Peek messages/i }));

    expect(await screen.findByText("msg-delete-me")).toBeInTheDocument();

    const deleteBtn = screen.getByRole("button", { name: "Delete message" });
    fireEvent.click(deleteBtn);

    const confirmDialog = await screen.findByRole("dialog");
    const confirmBtn = within(confirmDialog).getByRole("button", { name: "Delete" });
    fireEvent.click(confirmBtn);

    expect(deleteMessage).toHaveBeenCalledWith(mockClient, {
      queueUrl: demoQueue.url,
      receiptHandle: "rcpt-del",
    });

    // Card should be gone after async delete completes
    await waitFor(() => {
      expect(screen.queryByText("msg-delete-me")).not.toBeInTheDocument();
    });

    // Unmount should NOT restore the deleted handle
    unmount();
    expect(restoreVisibility).not.toHaveBeenCalled();
  });

  it("purges queue via actions dropdown and confirm dialog", async () => {
    renderWithProviders(<QueueView queueName="demo-queue" />);

    const actionsBtn = screen.getByRole("button", { name: "Queue actions" });
    fireEvent.keyDown(actionsBtn, { key: "ArrowDown", code: "ArrowDown" });

    const purgeMenuItem = await screen.findByRole("menuitem", { name: /Purge queue…/i });
    fireEvent.click(purgeMenuItem);

    const confirmDialog = await screen.findByRole("dialog");
    expect(
      within(confirmDialog).getByRole("heading", { name: "Purge queue" }),
    ).toBeInTheDocument();

    const confirmBtn = within(confirmDialog).getByRole("button", { name: "Purge" });
    fireEvent.click(confirmBtn);

    expect(purgeQueue).toHaveBeenCalledWith(mockClient, demoQueue.url);
  });

  it("redrives messages to selected target queue excluding self", async () => {
    renderWithProviders(<QueueView queueName="demo-queue" />);

    fireEvent.click(screen.getByRole("button", { name: /Redrive to…/i }));
    const dialog = screen.getByRole("dialog");
    expect(
      within(dialog).getByRole("heading", { name: "Redrive messages" }),
    ).toBeInTheDocument();

    const select = within(dialog).getByLabelText("Target queue");
    // self (demo-queue) should not be in options
    expect(within(select).queryByText("demo-queue")).not.toBeInTheDocument();
    expect(within(select).getByText("other-queue")).toBeInTheDocument();

    // Select other-queue
    fireEvent.change(select, { target: { value: otherQueue.url } });

    const redriveBtn = within(dialog).getByRole("button", { name: "Redrive" });
    expect(redriveBtn).not.toBeDisabled();
    fireEvent.click(redriveBtn);

    expect(redriveMessages).toHaveBeenCalledWith(mockClient, {
      sourceUrl: demoQueue.url,
      targetUrl: otherQueue.url,
    });
  });
});
