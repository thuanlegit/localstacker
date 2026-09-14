import { describe, expect, it, vi, beforeEach } from "vitest";
import { fireEvent, screen, within } from "@testing-library/react";
import { KinesisServiceView } from "./KinesisServiceView";
import { renderWithProviders } from "@/test/utils";
import { LOCAL_PROFILE_ID, localProfile, useProfiles } from "@/store/profiles";
import { useTabs } from "@/store/tabs";

const { mockState, mockCreateStream, mockDeleteStream } = vi.hoisted(() => ({
  mockState: {
    serviceStatus: "available" as string,
    streams: ["orders", "clicks"] as string[] | undefined,
    error: null as Error | null,
    isPending: false,
  },
  mockCreateStream: vi.fn().mockResolvedValue(true),
  mockDeleteStream: vi.fn().mockResolvedValue(true),
}));

vi.mock("@/hooks/use-health", () => ({
  useServiceStatus: () => mockState.serviceStatus,
  useHealth: () => ({ data: undefined, refetch: vi.fn() }),
  isServiceDisabledError: (err: unknown) =>
    err instanceof Error && err.message.includes("is not enabled"),
}));

vi.mock("@/hooks/use-kinesis", () => ({
  useKinesisStreams: () => ({
    data: mockState.streams,
    isPending: mockState.isPending,
    isFetching: false,
    error: mockState.error,
    refetch: vi.fn(),
  }),
  useKinesisActions: () => ({
    createStream: mockCreateStream,
    deleteStream: mockDeleteStream,
  }),
}));

describe("KinesisServiceView", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockState.serviceStatus = "available";
    mockState.streams = ["orders", "clicks"];
    mockState.error = null;
    mockState.isPending = false;
    useProfiles.setState({
      profiles: [{ ...localProfile(), region: "us-east-1" }],
      activeProfileId: LOCAL_PROFILE_ID,
    });
    useTabs.setState({ tabs: [], activeTabId: null });
  });

  it("renders streams list", () => {
    renderWithProviders(<KinesisServiceView />);
    expect(screen.getByText("Kinesis")).toBeInTheDocument();
    expect(screen.getByText("orders")).toBeInTheDocument();
    expect(screen.getByText("clicks")).toBeInTheDocument();
  });

  it("creates a stream via dialog", async () => {
    renderWithProviders(<KinesisServiceView />);
    fireEvent.click(screen.getByRole("button", { name: /Create stream/i }));

    const dialog = screen.getByRole("dialog");
    fireEvent.change(within(dialog).getByLabelText(/Stream name/i), {
      target: { value: "e2e-stream" },
    });
    fireEvent.change(within(dialog).getByLabelText(/Shard count/i), {
      target: { value: "2" },
    });
    fireEvent.click(within(dialog).getByRole("button", { name: "Create stream" }));

    expect(mockCreateStream).toHaveBeenCalledWith({
      name: "e2e-stream",
      shardCount: 2,
    });
  });

  it("deletes a stream via row dropdown action", async () => {
    useTabs.setState({
      tabs: [
        { id: "stream:orders", kind: "stream", streamName: "orders", title: "orders" },
      ],
      activeTabId: "stream:orders",
    });

    renderWithProviders(<KinesisServiceView />);
    fireEvent.keyDown(screen.getByRole("button", { name: "Actions for orders" }), {
      key: "ArrowDown",
      code: "ArrowDown",
    });

    const deleteMenuItem = await screen.findByRole("menuitem", {
      name: /Delete stream/i,
    });
    fireEvent.click(deleteMenuItem);

    const confirmDialog = await screen.findByRole("dialog");
    fireEvent.click(within(confirmDialog).getByRole("button", { name: "Delete" }));

    expect(mockDeleteStream).toHaveBeenCalledWith("orders");
  });

  it("renders disabled guard when service is disabled", () => {
    mockState.serviceStatus = "disabled";
    renderWithProviders(<KinesisServiceView />);
    expect(screen.getByTestId("service-disabled-view")).toBeInTheDocument();
  });
});
