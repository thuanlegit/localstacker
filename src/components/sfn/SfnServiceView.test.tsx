import { describe, expect, it, vi, beforeEach } from "vitest";
import { fireEvent, screen, within } from "@testing-library/react";
import { SfnServiceView } from "./SfnServiceView";
import { renderWithProviders } from "@/test/utils";
import { LOCAL_PROFILE_ID, localProfile, useProfiles } from "@/store/profiles";
import { useTabs } from "@/store/tabs";
import type { StateMachineSummary } from "@/lib/sfn";

const VALID_ASL = JSON.stringify({
  StartAt: "Start",
  States: { Start: { Type: "Succeed" } },
});

const mockMachines: StateMachineSummary[] = [
  {
    arn: "arn:aws:states:us-east-1:000000000000:order-flow",
    name: "order-flow",
    creationDate: new Date("2024-01-01T00:00:00Z"),
  },
];

const { mockState, mockCreateStateMachine, mockDeleteStateMachine } = vi.hoisted(
  () => ({
    mockState: {
      serviceStatus: "available" as string,
      machines: [] as StateMachineSummary[] | undefined,
      error: null as Error | null,
      isPending: false,
    },
    mockCreateStateMachine: vi
      .fn()
      .mockResolvedValue("arn:aws:states:us-east-1:000000000000:new-machine"),
    mockDeleteStateMachine: vi.fn().mockResolvedValue(true),
  }),
);

vi.mock("@/hooks/use-health", () => ({
  useServiceStatus: () => mockState.serviceStatus,
  useHealth: () => ({ data: undefined, refetch: vi.fn() }),
  isServiceDisabledError: (err: unknown) =>
    err instanceof Error && err.message.includes("is not enabled"),
}));

vi.mock("@/hooks/use-sfn", () => ({
  useStateMachines: () => ({
    data: mockState.machines,
    isPending: mockState.isPending,
    isFetching: false,
    error: mockState.error,
    refetch: vi.fn(),
  }),
  useSfnActions: () => ({
    createStateMachine: mockCreateStateMachine,
    deleteStateMachine: mockDeleteStateMachine,
  }),
}));

describe("SfnServiceView", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockState.serviceStatus = "available";
    mockState.machines = [...mockMachines];
    mockState.error = null;
    mockState.isPending = false;
    useProfiles.setState({
      profiles: [{ ...localProfile(), region: "us-east-1" }],
      activeProfileId: LOCAL_PROFILE_ID,
    });
    useTabs.setState({ tabs: [], activeTabId: null });
  });

  it("renders state machines list", () => {
    renderWithProviders(<SfnServiceView />);
    expect(screen.getByText("Step Functions")).toBeInTheDocument();
    expect(screen.getByText("order-flow")).toBeInTheDocument();
  });

  it("creates a state machine from valid ASL and opens its tab", async () => {
    renderWithProviders(<SfnServiceView />);
    fireEvent.click(screen.getByRole("button", { name: /Create state machine/i }));

    const dialog = screen.getByRole("dialog");
    fireEvent.change(within(dialog).getByLabelText(/State machine name/i), {
      target: { value: "new-machine" },
    });
    fireEvent.change(within(dialog).getByLabelText(/Definition \(ASL JSON\)/i), {
      target: { value: VALID_ASL },
    });
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Create state machine" }),
    );

    expect(mockCreateStateMachine).toHaveBeenCalledWith({
      name: "new-machine",
      definition: VALID_ASL,
    });
  });

  it("rejects invalid ASL with an inline parse error", () => {
    renderWithProviders(<SfnServiceView />);
    fireEvent.click(screen.getByRole("button", { name: /Create state machine/i }));

    const dialog = screen.getByRole("dialog");
    fireEvent.change(within(dialog).getByLabelText(/State machine name/i), {
      target: { value: "broken" },
    });
    fireEvent.change(within(dialog).getByLabelText(/Definition \(ASL JSON\)/i), {
      target: { value: "not json" },
    });
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Create state machine" }),
    );

    expect(
      within(dialog).getByText(/Invalid state machine definition/),
    ).toBeInTheDocument();
    expect(mockCreateStateMachine).not.toHaveBeenCalled();
  });

  it("deletes a state machine via row dropdown action", async () => {
    useTabs.setState({
      tabs: [
        {
          id: "stateMachine:arn:aws:states:us-east-1:000000000000:order-flow",
          kind: "stateMachine",
          stateMachineArn: "arn:aws:states:us-east-1:000000000000:order-flow",
          title: "order-flow",
        },
      ],
      activeTabId: "stateMachine:arn:aws:states:us-east-1:000000000000:order-flow",
    });

    renderWithProviders(<SfnServiceView />);
    fireEvent.keyDown(
      screen.getByRole("button", { name: "Actions for order-flow" }),
      { key: "ArrowDown", code: "ArrowDown" },
    );

    const deleteMenuItem = await screen.findByRole("menuitem", {
      name: /Delete state machine/i,
    });
    fireEvent.click(deleteMenuItem);

    const confirmDialog = await screen.findByRole("dialog");
    fireEvent.click(
      within(confirmDialog).getByRole("button", { name: "Delete" }),
    );

    expect(mockDeleteStateMachine).toHaveBeenCalledWith(
      "arn:aws:states:us-east-1:000000000000:order-flow",
      "order-flow",
    );
  });

  it("renders disabled guard when service is disabled", () => {
    mockState.serviceStatus = "disabled";
    renderWithProviders(<SfnServiceView />);
    expect(screen.getByTestId("service-disabled-view")).toBeInTheDocument();
  });
});
