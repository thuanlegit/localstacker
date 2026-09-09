import { describe, expect, it, vi, beforeEach } from "vitest";
import { fireEvent, screen, within } from "@testing-library/react";
import type { SQSClient } from "@aws-sdk/client-sqs";
import { SqsServiceView } from "./SqsServiceView";
import { renderWithProviders } from "@/test/utils";
import { LOCAL_PROFILE_ID, localProfile, useProfiles } from "@/store/profiles";
import { createQueue, deleteQueue } from "@/lib/sqs";
import type { QueueSummary } from "@/lib/sqs";

vi.mock("@/lib/sqs", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/sqs")>();
  return {
    ...actual,
    createQueue: vi.fn().mockResolvedValue({ url: "http://localhost:4566/000000000000/orders" }),
    deleteQueue: vi.fn().mockResolvedValue(undefined),
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
    createdTimestamp: new Date("2026-01-01T00:00:00Z"),
  },
};

let currentQueues: QueueSummary[] | undefined = [demoQueue];
let currentError: Error | null = null;

vi.mock("@/hooks/use-sqs", () => ({
  useSqsClient: () => mockClient,
  useQueues: () => ({
    data: currentQueues,
    isPending: false,
    isFetching: false,
    error: currentError,
    refetch: vi.fn(),
  }),
  sqsKeys: {
    queues: (id: string) => ["sqs", "queues", id],
  },
}));

describe("SqsServiceView", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    currentQueues = [demoQueue];
    currentError = null;
    useProfiles.setState({
      profiles: [{ ...localProfile(), region: "us-east-1" }],
      activeProfileId: LOCAL_PROFILE_ID,
    });
  });
  it("renders rows with name, depth, and in-flight count", () => {
    renderWithProviders(<SqsServiceView />);
    expect(screen.getByText("Queues")).toBeInTheDocument();
    const row = screen.getByRole("row", { name: /demo-queue/i });
    expect(within(row).getByText("demo-queue")).toBeInTheDocument();
    expect(within(row).getByText("3")).toBeInTheDocument();
    expect(within(row).getByText("1")).toBeInTheDocument();
  });
  it("validates queue name in create dialog and submits valid name", async () => {
    renderWithProviders(<SqsServiceView />);
    fireEvent.click(screen.getByRole("button", { name: /Create queue/i }));
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByRole("heading", { name: "Create queue" })).toBeInTheDocument();

    const input = within(dialog).getByLabelText(/Queue name/i);
    const submitBtn = within(dialog).getByRole("button", { name: "Create queue" });
    expect(submitBtn).toBeDisabled();

    // Type invalid queue name
    fireEvent.change(input, { target: { value: "invalid name with spaces!" } });
    expect(
      screen.getByText(/1–80 characters — letters, digits, hyphens, underscores/),
    ).toBeInTheDocument();
    expect(submitBtn).toBeDisabled();

    // Type valid queue name
    fireEvent.change(input, { target: { value: "orders" } });
    expect(
      screen.queryByText(/1–80 characters — letters, digits, hyphens, underscores/),
    ).not.toBeInTheDocument();
    expect(submitBtn).not.toBeDisabled();

    // Submit
    fireEvent.click(submitBtn);

    expect(createQueue).toHaveBeenCalledWith(mockClient, { name: "orders" });
  });

  it("deletes queue via row menu and confirm dialog", async () => {
    renderWithProviders(<SqsServiceView />);
    const menuBtn = screen.getByRole("button", { name: "Actions for demo-queue" });
    fireEvent.keyDown(menuBtn, { key: "ArrowDown", code: "ArrowDown" });

    const deleteMenuItem = await screen.findByRole("menuitem", { name: /Delete queue/i });
    fireEvent.click(deleteMenuItem);

    const confirmDialog = await screen.findByRole("dialog");
    const confirmBtn = within(confirmDialog).getByRole("button", { name: "Delete" });
    fireEvent.click(confirmBtn);

    expect(deleteQueue).toHaveBeenCalledWith(mockClient, demoQueue.url);
  });

  it("renders DLQ badge when another queue targets it as dlqName", () => {
    const sourceQueue: QueueSummary = {
      url: "http://localhost:4566/000000000000/source-queue",
      name: "source-queue",
      isFifo: false,
      attributes: {
        depth: 0,
        inFlight: 0,
        delayed: 0,
        dlqName: "demo-queue",
      },
    };
    currentQueues = [demoQueue, sourceQueue];

    renderWithProviders(<SqsServiceView />);

    expect(screen.getByText("DLQ")).toBeInTheDocument();
  });

  it("renders ServiceDisabledView when SQS is disabled in LocalStack SERVICES configuration", () => {
    currentQueues = undefined;
    currentError = new Error(
      "Service 'sqs' is not enabled. Check your 'SERVICES' configuration variable.",
    );

    renderWithProviders(<SqsServiceView />);

    expect(screen.getByTestId("service-disabled-view")).toBeInTheDocument();
    expect(screen.getByText("SQS is turned off")).toBeInTheDocument();
    expect(screen.queryByText("Queues")).not.toBeInTheDocument();
  });
});
