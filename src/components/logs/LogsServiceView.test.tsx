import { describe, expect, it, vi, beforeEach } from "vitest";
import { fireEvent, screen, within } from "@testing-library/react";
import { LogsServiceView } from "./LogsServiceView";
import { renderWithProviders } from "@/test/utils";
import { LOCAL_PROFILE_ID, localProfile, useProfiles } from "@/store/profiles";
import { useTabs } from "@/store/tabs";
import type { LogGroupSummary } from "@/lib/logs";

const mockGroups: LogGroupSummary[] = [
  {
    name: "/aws/lambda/orders-service",
    sizeBytes: 2048,
    retentionInDays: 7,
    lastEventTime: 1700000000000,
  },
  {
    name: "/app/backend",
    sizeBytes: 4096,
    retentionInDays: undefined,
    lastEventTime: undefined,
  },
];

const { mockState, mockCreateGroup, mockDeleteGroup } = vi.hoisted(() => ({
  mockState: {
    serviceStatus: "available",
    groups: [
      {
        name: "/aws/lambda/orders-service",
        sizeBytes: 2048,
        retentionInDays: 7,
        lastEventTime: 1700000000000,
      },
      {
        name: "/app/backend",
        sizeBytes: 4096,
        retentionInDays: undefined,
        lastEventTime: undefined,
      },
    ] as LogGroupSummary[] | undefined,
    error: null as Error | null,
    isPending: false,
  },
  mockCreateGroup: vi.fn().mockResolvedValue(true),
  mockDeleteGroup: vi.fn().mockResolvedValue(true),
}));

vi.mock("@/hooks/use-health", () => ({
  useServiceStatus: () => mockState.serviceStatus,
  useHealth: () => ({ data: undefined, refetch: vi.fn() }),
  isServiceDisabledError: (err: unknown) =>
    err instanceof Error && err.message.includes("is not enabled"),
}));

vi.mock("@/hooks/use-logs", () => ({
  useLogGroups: () => ({
    data: mockState.groups,
    isPending: mockState.isPending,
    isFetching: false,
    error: mockState.error,
    refetch: vi.fn(),
  }),
  useLogGroupActions: () => ({
    createGroup: mockCreateGroup,
    deleteGroup: mockDeleteGroup,
  }),
}));

describe("LogsServiceView", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockState.serviceStatus = "available";
    mockState.groups = [...mockGroups];
    mockState.error = null;
    mockState.isPending = false;
    useProfiles.setState({
      profiles: [{ ...localProfile(), region: "us-east-1" }],
      activeProfileId: LOCAL_PROFILE_ID,
    });
    useTabs.setState({ tabs: [], activeTabId: null });
  });

  it("renders log groups list", () => {
    renderWithProviders(<LogsServiceView />);
    expect(screen.getByText("CloudWatch Logs")).toBeInTheDocument();
    expect(screen.getByText("/aws/lambda/orders-service")).toBeInTheDocument();
    expect(screen.getByText("2 KB")).toBeInTheDocument();
    expect(screen.getByText("7 days")).toBeInTheDocument();
    expect(screen.getByText("/app/backend")).toBeInTheDocument();
    expect(screen.getByText("4 KB")).toBeInTheDocument();
  });

  it("validates group name and creates log group", async () => {
    renderWithProviders(<LogsServiceView />);
    fireEvent.click(screen.getByRole("button", { name: /Create log group/i }));

    const dialog = screen.getByRole("dialog");
    expect(
      within(dialog).getByRole("heading", { name: "Create log group" }),
    ).toBeInTheDocument();

    const input = within(dialog).getByLabelText(/Log group name/i);
    const submitBtn = within(dialog).getByRole("button", {
      name: "Create log group",
    });

    // Invalid: no leading slash
    fireEvent.change(input, { target: { value: "invalid-group" } });
    expect(submitBtn).toBeDisabled();

    // Valid: leading slash
    fireEvent.change(input, { target: { value: "/app/payments" } });
    expect(submitBtn).not.toBeDisabled();

    fireEvent.click(submitBtn);
    expect(mockCreateGroup).toHaveBeenCalledWith("/app/payments");
  });

  it("deletes log group and closes tab", async () => {
    useTabs.setState({
      tabs: [
        {
          id: "logGroup:/app/backend",
          kind: "logGroup",
          logGroupName: "/app/backend",
          title: "/app/backend",
        },
      ],
      activeTabId: "logGroup:/app/backend",
    });

    renderWithProviders(<LogsServiceView />);
    const menuBtn = screen.getByRole("button", {
      name: "Actions for /app/backend",
    });
    fireEvent.keyDown(menuBtn, { key: "ArrowDown", code: "ArrowDown" });

    const deleteMenuItem = await screen.findByRole("menuitem", {
      name: /Delete log group/i,
    });
    fireEvent.click(deleteMenuItem);

    const confirmDialog = await screen.findByRole("dialog");
    expect(
      within(confirmDialog).getByText(/Are you sure you want to delete log group/),
    ).toBeInTheDocument();

    const confirmDeleteBtn = within(confirmDialog).getByRole("button", {
      name: "Delete",
    });
    fireEvent.click(confirmDeleteBtn);

    expect(mockDeleteGroup).toHaveBeenCalledWith("/app/backend");
  });

  it("renders disabled guard when service is disabled", () => {
    mockState.serviceStatus = "disabled";
    renderWithProviders(<LogsServiceView />);
    expect(screen.getByTestId("service-disabled-view")).toBeInTheDocument();
    expect(screen.getByText("CloudWatch Logs is turned off")).toBeInTheDocument();
  });
});
