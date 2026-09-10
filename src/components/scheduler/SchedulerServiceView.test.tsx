import { describe, expect, it, vi, beforeEach } from "vitest";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { SchedulerServiceView } from "./SchedulerServiceView";
import { renderWithProviders } from "@/test/utils";
import { LOCAL_PROFILE_ID, localProfile, useProfiles } from "@/store/profiles";
import { useTabs } from "@/store/tabs";
import type { ScheduleGroupSummary } from "@/lib/scheduler";

const mockGroups: ScheduleGroupSummary[] = [
  {
    name: "default",
    arn: "arn:aws:scheduler:us-east-1:000000000000:schedule-group/default",
    state: "ACTIVE",
  },
  {
    name: "demo-group",
    arn: "arn:aws:scheduler:us-east-1:000000000000:schedule-group/demo-group",
    state: "ACTIVE",
  },
];

const { mockState, mockCreateGroup, mockDeleteGroup } = vi.hoisted(() => ({
  mockState: {
    serviceStatus: "available" as string,
    groups: undefined as ScheduleGroupSummary[] | undefined,
    error: null as Error | null,
  },
  mockCreateGroup: vi
    .fn()
    .mockResolvedValue(
      "arn:aws:scheduler:us-east-1:000000000000:schedule-group/new-group",
    ),
  mockDeleteGroup: vi.fn().mockResolvedValue(true),
}));

vi.mock("@/hooks/use-health", () => ({
  useServiceStatus: () => mockState.serviceStatus,
  useHealth: () => ({ data: undefined, refetch: vi.fn() }),
  isServiceDisabledError: (err: unknown) =>
    err instanceof Error && err.message.includes("is not enabled"),
}));

vi.mock("@/hooks/use-scheduler", () => ({
  useScheduleGroups: () => ({
    data: mockState.groups,
    isPending: false,
    isFetching: false,
    error: mockState.error,
    refetch: vi.fn(),
  }),
  useScheduleGroupActions: () => ({
    createScheduleGroup: mockCreateGroup,
    deleteScheduleGroup: mockDeleteGroup,
  }),
}));

describe("SchedulerServiceView", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockState.serviceStatus = "available";
    mockState.groups = [...mockGroups];
    mockState.error = null;
    useProfiles.setState({
      profiles: [{ ...localProfile(), region: "us-east-1" }],
      activeProfileId: LOCAL_PROFILE_ID,
    });
    useTabs.setState({ tabs: [], activeTabId: null });
  });

  it("renders groups with default badge", () => {
    renderWithProviders(<SchedulerServiceView />);
    expect(screen.getByText("EventBridge Scheduler")).toBeInTheDocument();
    expect(screen.getAllByText("default").length).toBe(2);
    expect(screen.getByText("demo-group")).toBeInTheDocument();
    expect(
      screen.getByTitle(
        "arn:aws:scheduler:us-east-1:000000000000:schedule-group/default",
      ),
    ).toBeInTheDocument();
  });

  it("renders ServiceDisabledView when service is disabled", () => {
    mockState.serviceStatus = "disabled";
    renderWithProviders(<SchedulerServiceView />);
    expect(
      screen.getByText("EventBridge Scheduler is turned off"),
    ).toBeInTheDocument();
  });

  it("validates group name and creates group", async () => {
    renderWithProviders(<SchedulerServiceView />);
    fireEvent.click(screen.getByRole("button", { name: /Create group/i }));

    const dialog = screen.getByRole("dialog");
    const nameInput = within(dialog).getByLabelText(/Group name/i);
    const submitBtn = within(dialog).getByRole("button", {
      name: "Create group",
    });

    fireEvent.change(nameInput, { target: { value: "invalid group name!" } });
    expect(submitBtn).toBeDisabled();

    fireEvent.change(nameInput, { target: { value: "new-group" } });
    expect(submitBtn).not.toBeDisabled();

    fireEvent.click(submitBtn);
    await waitFor(() => expect(mockCreateGroup).toHaveBeenCalledWith("new-group"));
    await waitFor(() =>
      expect(useTabs.getState().tabs.map((t) => t.id)).toEqual([
        "scheduleGroup:new-group",
      ]),
    );
  });

  it("opens a scheduleGroup tab on row click", () => {
    renderWithProviders(<SchedulerServiceView />);
    fireEvent.click(screen.getByText("demo-group"));
    expect(useTabs.getState().tabs).toEqual([
      {
        id: "scheduleGroup:demo-group",
        kind: "scheduleGroup",
        groupName: "demo-group",
        title: "demo-group",
      },
    ]);
  });

  it("disables delete for the default group and deletes custom groups", async () => {
    renderWithProviders(<SchedulerServiceView />);

    // default group: delete disabled
    const defaultBtn = screen.getByRole("button", {
      name: "Actions for default",
    });
    fireEvent.keyDown(defaultBtn, { key: "ArrowDown", code: "ArrowDown" });
    const defaultDelete = await screen.findByRole("menuitem", {
      name: /Delete group/i,
    });
    expect(defaultDelete).toHaveAttribute("data-disabled");
    fireEvent.keyDown(defaultBtn, { key: "Escape", code: "Escape" });

    // custom group: delete works via confirm dialog
    const customBtn = screen.getByRole("button", {
      name: "Actions for demo-group",
    });
    fireEvent.keyDown(customBtn, { key: "ArrowDown", code: "ArrowDown" });
    fireEvent.click(await screen.findByRole("menuitem", { name: /Delete group/i }));

    const confirmDialog = await screen.findByRole("dialog");
    expect(
      within(confirmDialog).getByText(
        /Are you sure you want to delete schedule group/,
      ),
    ).toBeInTheDocument();
    fireEvent.click(within(confirmDialog).getByRole("button", { name: "Delete" }));
    await waitFor(() => expect(mockDeleteGroup).toHaveBeenCalledWith("demo-group"));
  });
});
