import { describe, expect, it, vi, beforeEach } from "vitest";
import { fireEvent, screen, within } from "@testing-library/react";
import { SnsServiceView } from "./SnsServiceView";
import { renderWithProviders } from "@/test/utils";
import { LOCAL_PROFILE_ID, localProfile, useProfiles } from "@/store/profiles";
import { useTabs } from "@/store/tabs";
import type { TopicSummary } from "@/lib/sns";

const mockTopics: TopicSummary[] = [
  {
    arn: "arn:aws:sns:us-east-1:000000000000:my-topic",
    name: "my-topic",
    isFifo: false,
  },
  {
    arn: "arn:aws:sns:us-east-1:000000000000:orders.fifo",
    name: "orders.fifo",
    isFifo: true,
  },
];

const { mockState, mockCreateTopic, mockDeleteTopic } = vi.hoisted(() => ({
  mockState: {
    serviceStatus: "available",
    topics: [
      {
        arn: "arn:aws:sns:us-east-1:000000000000:my-topic",
        name: "my-topic",
        isFifo: false,
      },
      {
        arn: "arn:aws:sns:us-east-1:000000000000:orders.fifo",
        name: "orders.fifo",
        isFifo: true,
      },
    ] as TopicSummary[] | undefined,
    error: null as Error | null,
    isPending: false,
  },
  mockCreateTopic: vi
    .fn()
    .mockResolvedValue("arn:aws:sns:us-east-1:000000000000:orders.fifo"),
  mockDeleteTopic: vi.fn().mockResolvedValue(true),
}));

vi.mock("@/hooks/use-health", () => ({
  useServiceStatus: () => mockState.serviceStatus,
  useHealth: () => ({ data: undefined, refetch: vi.fn() }),
  isServiceDisabledError: (err: unknown) =>
    err instanceof Error && err.message.includes("is not enabled"),
}));

vi.mock("@/hooks/use-sns", () => ({
  useTopics: () => ({
    data: mockState.topics,
    isPending: mockState.isPending,
    isFetching: false,
    error: mockState.error,
    refetch: vi.fn(),
  }),
  useTopicActions: () => ({
    createTopic: mockCreateTopic,
    deleteTopic: mockDeleteTopic,
  }),
}));

describe("SnsServiceView", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockState.serviceStatus = "available";
    mockState.topics = [...mockTopics];
    mockState.error = null;
    mockState.isPending = false;
    useProfiles.setState({
      profiles: [{ ...localProfile(), region: "us-east-1" }],
      activeProfileId: LOCAL_PROFILE_ID,
    });
    useTabs.setState({ tabs: [], activeTabId: null });
  });

  it("renders topics list with standard and FIFO badges", () => {
    renderWithProviders(<SnsServiceView />);
    expect(screen.getByText("SNS")).toBeInTheDocument();
    expect(screen.getByText("my-topic")).toBeInTheDocument();
    expect(screen.getByText("Standard")).toBeInTheDocument();
    expect(screen.getByText("orders.fifo")).toBeInTheDocument();
    expect(screen.getByText("FIFO")).toBeInTheDocument();
  });

  it("validates topic name and toggles .fifo append on checkbox change", async () => {
    renderWithProviders(<SnsServiceView />);
    fireEvent.click(screen.getByRole("button", { name: /Create topic/i }));

    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByRole("heading", { name: "Create topic" })).toBeInTheDocument();

    const nameInput = within(dialog).getByLabelText(/Topic name/i);
    const fifoCheckbox = within(dialog).getByLabelText(/FIFO topic/i);
    const submitBtn = within(dialog).getByRole("button", { name: "Create topic" });

    // Invalid name
    fireEvent.change(nameInput, { target: { value: "invalid name!" } });
    expect(submitBtn).toBeDisabled();

    // Valid name
    fireEvent.change(nameInput, { target: { value: "orders" } });
    expect(submitBtn).not.toBeDisabled();

    // Check FIFO checkbox -> appends .fifo
    fireEvent.click(fifoCheckbox);
    expect(nameInput).toHaveValue("orders.fifo");

    fireEvent.click(submitBtn);
    expect(mockCreateTopic).toHaveBeenCalledWith({
      name: "orders.fifo",
      fifo: true,
    });
  });

  it("deletes topic via row dropdown action and closes tab", async () => {
    useTabs.setState({
      tabs: [
        {
          id: "topic:arn:aws:sns:us-east-1:000000000000:my-topic",
          kind: "topic",
          topicArn: "arn:aws:sns:us-east-1:000000000000:my-topic",
          title: "my-topic",
        },
      ],
      activeTabId: "topic:arn:aws:sns:us-east-1:000000000000:my-topic",
    });

    renderWithProviders(<SnsServiceView />);
    const actionBtn = screen.getByRole("button", { name: "Actions for my-topic" });
    fireEvent.keyDown(actionBtn, { key: "ArrowDown", code: "ArrowDown" });

    const deleteMenuItem = await screen.findByRole("menuitem", { name: /Delete topic/i });
    fireEvent.click(deleteMenuItem);

    const confirmDialog = await screen.findByRole("dialog");
    expect(within(confirmDialog).getByText(/Are you sure you want to delete topic/)).toBeInTheDocument();
    const confirmDeleteBtn = within(confirmDialog).getByRole("button", { name: "Delete" });
    fireEvent.click(confirmDeleteBtn);

    expect(mockDeleteTopic).toHaveBeenCalledWith(
      "arn:aws:sns:us-east-1:000000000000:my-topic",
    );
  });

  it("renders disabled guard when service is disabled", () => {
    mockState.serviceStatus = "disabled";
    renderWithProviders(<SnsServiceView />);
    expect(screen.getByTestId("service-disabled-view")).toBeInTheDocument();
    expect(screen.getByText("SNS is turned off")).toBeInTheDocument();
  });
});
