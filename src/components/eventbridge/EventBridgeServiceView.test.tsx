import { describe, expect, it, vi, beforeEach } from "vitest";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { EventBridgeServiceView } from "./EventBridgeServiceView";
import { renderWithProviders } from "@/test/utils";
import { LOCAL_PROFILE_ID, localProfile, useProfiles } from "@/store/profiles";
import { useTabs } from "@/store/tabs";
import type { EventBusSummary } from "@/lib/eventbridge";

const mockBuses: EventBusSummary[] = [
  {
    name: "default",
    arn: "arn:aws:events:us-east-1:000000000000:event-bus/default",
    creationTime: new Date("2026-01-01T00:00:00Z"),
  },
  {
    name: "demo-bus",
    arn: "arn:aws:events:us-east-1:000000000000:event-bus/demo-bus",
  },
];

const { mockState, mockCreateBus, mockDeleteBus } = vi.hoisted(() => ({
  mockState: {
    serviceStatus: "available" as string,
    buses: undefined as EventBusSummary[] | undefined,
    error: null as Error | null,
  },
  mockCreateBus: vi.fn().mockResolvedValue("arn:aws:events:us-east-1:000000000000:event-bus/new-bus"),
  mockDeleteBus: vi.fn().mockResolvedValue(true),
}));

vi.mock("@/hooks/use-health", () => ({
  useServiceStatus: () => mockState.serviceStatus,
  useHealth: () => ({ data: undefined, refetch: vi.fn() }),
  isServiceDisabledError: (err: unknown) =>
    err instanceof Error && err.message.includes("is not enabled"),
}));

vi.mock("@/hooks/use-eventbridge", () => ({
  useEventBuses: () => ({
    data: mockState.buses,
    isPending: false,
    isFetching: false,
    error: mockState.error,
    refetch: vi.fn(),
  }),
  useEventBusActions: () => ({
    createBus: mockCreateBus,
    deleteBus: mockDeleteBus,
  }),
}));

describe("EventBridgeServiceView", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockState.serviceStatus = "available";
    mockState.buses = [...mockBuses];
    mockState.error = null;
    useProfiles.setState({
      profiles: [{ ...localProfile(), region: "us-east-1" }],
      activeProfileId: LOCAL_PROFILE_ID,
    });
    useTabs.setState({ tabs: [], activeTabId: null });
  });

  it("renders buses with default badge", () => {
    renderWithProviders(<EventBridgeServiceView />);
    expect(screen.getByText("EventBridge")).toBeInTheDocument();
    // "default" appears as the bus name and its badge
    expect(screen.getAllByText("default").length).toBe(2);
    expect(screen.getByText("demo-bus")).toBeInTheDocument();
    expect(
      screen.getByTitle("arn:aws:events:us-east-1:000000000000:event-bus/default"),
    ).toBeInTheDocument();
  });

  it("renders ServiceDisabledView when the service is disabled", () => {
    mockState.serviceStatus = "disabled";
    renderWithProviders(<EventBridgeServiceView />);
    expect(screen.getByText("EventBridge is turned off")).toBeInTheDocument();
  });

  it("rejects invalid bus names and creates valid ones", async () => {
    renderWithProviders(<EventBridgeServiceView />);
    fireEvent.click(screen.getByRole("button", { name: /Create bus/i }));

    const dialog = screen.getByRole("dialog");
    const nameInput = within(dialog).getByLabelText(/Bus name/i);
    const submitBtn = within(dialog).getByRole("button", { name: "Create bus" });

    fireEvent.change(nameInput, { target: { value: "invalid name!" } });
    expect(submitBtn).toBeDisabled();

    fireEvent.change(nameInput, { target: { value: "new-bus" } });
    expect(submitBtn).not.toBeDisabled();

    fireEvent.click(submitBtn);
    await waitFor(() => expect(mockCreateBus).toHaveBeenCalledWith({ name: "new-bus" }));
    // onCreated opens the new bus tab
    await waitFor(() =>
      expect(useTabs.getState().tabs.map((t) => t.id)).toEqual(["eventBus:new-bus"]),
    );
  });

  it("opens an eventBus tab on row click", () => {
    renderWithProviders(<EventBridgeServiceView />);
    fireEvent.click(screen.getByText("demo-bus"));
    expect(useTabs.getState().tabs).toEqual([
      {
        id: "eventBus:demo-bus",
        kind: "eventBus",
        busName: "demo-bus",
        title: "demo-bus",
      },
    ]);
  });

  it("disables delete for the default bus and deletes custom buses", async () => {
    renderWithProviders(<EventBridgeServiceView />);

    // default row: delete is disabled
    const defaultBtn = screen.getByRole("button", { name: "Actions for default" });
    fireEvent.keyDown(defaultBtn, { key: "ArrowDown", code: "ArrowDown" });
    const defaultDelete = await screen.findByRole("menuitem", { name: /Delete bus/i });
    expect(defaultDelete).toHaveAttribute("data-disabled");
    fireEvent.keyDown(defaultBtn, { key: "Escape", code: "Escape" });

    // custom row: delete works end-to-end
    const customBtn = screen.getByRole("button", { name: "Actions for demo-bus" });
    fireEvent.keyDown(customBtn, { key: "ArrowDown", code: "ArrowDown" });
    fireEvent.click(screen.getByRole("menuitem", { name: /Delete bus/i }));
    const confirmDialog = await screen.findByRole("dialog");
    expect(
      within(confirmDialog).getByText(/Are you sure you want to delete event bus/),
    ).toBeInTheDocument();
    fireEvent.click(within(confirmDialog).getByRole("button", { name: "Delete" }));
    await waitFor(() => expect(mockDeleteBus).toHaveBeenCalledWith("demo-bus"));
  });
});
