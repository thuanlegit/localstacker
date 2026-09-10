import { describe, expect, it, vi, beforeEach } from "vitest";
import { fireEvent, screen, within, act } from "@testing-library/react";
import { LogGroupView } from "./LogGroupView";
import { renderWithProviders } from "@/test/utils";
import { LOCAL_PROFILE_ID, localProfile, useProfiles } from "@/store/profiles";
import { useTabs } from "@/store/tabs";
import type { LogEventRecord, LogStreamSummary } from "@/lib/logs";

const mockLogGroupName = "/aws/lambda/my-fn";

const mockStreams: LogStreamSummary[] = [
  {
    name: "2026/01/01/[$LATEST]stream-1",
    firstEventTime: 1000,
    lastEventTime: 5000,
    storedBytes: 100,
  },
  {
    name: "2026/01/01/[$LATEST]stream-2",
    firstEventTime: 2000,
    lastEventTime: 8000,
    storedBytes: 200,
  },
];

const mockEvents: LogEventRecord[] = [
  {
    id: "ev-1",
    timestamp: 1700000000000,
    streamName: "2026/01/01/[$LATEST]stream-1",
    message: "START RequestId: 12345",
  },
  {
    id: "ev-2",
    timestamp: 1700000001000,
    streamName: "2026/01/01/[$LATEST]stream-1",
    message: "Processing payment for user 42",
  },
];

const {
  mockHookState,
  mockSetFilterPattern,
  mockSetStreamName,
  mockSetTailing,
  mockDeleteGroup,
  mockDeleteStream,
} = vi.hoisted(() => ({
  mockHookState: {
    events: [
      {
        id: "ev-1",
        timestamp: 1700000000000,
        streamName: "2026/01/01/[$LATEST]stream-1",
        message: "START RequestId: 12345",
      },
      {
        id: "ev-2",
        timestamp: 1700000001000,
        streamName: "2026/01/01/[$LATEST]stream-1",
        message: "Processing payment for user 42",
      },
    ] as LogEventRecord[],
    filterPattern: "",
    streamName: undefined as string | undefined,
    isTailing: false,
    hasNextPage: false,
    isInitialLoading: false,
    isLoadingMore: false,
    error: null as Error | null,
  },
  mockSetFilterPattern: vi.fn(),
  mockSetStreamName: vi.fn(),
  mockSetTailing: vi.fn(),
  mockDeleteGroup: vi.fn().mockResolvedValue(true),
  mockDeleteStream: vi.fn().mockResolvedValue(true),
}));

vi.mock("@tanstack/react-virtual", () => ({
  useVirtualizer: (options: { count: number }) => ({
    getVirtualItems: () =>
      Array.from({ length: options.count }, (_, i) => ({
        index: i,
        start: i * 24,
        size: 24,
        key: i,
      })),
    getTotalSize: () => options.count * 24,
    measureElement: () => 24,
  }),
}));

vi.mock("@/hooks/use-logs", () => ({
  useLogStreams: () => ({
    data: mockStreams,
    isPending: false,
    error: null,
    refetch: vi.fn(),
  }),
  useLogGroupActions: () => ({
    deleteGroup: mockDeleteGroup,
    deleteStream: mockDeleteStream,
  }),
  useLogEvents: () => ({
    events: mockHookState.events,
    filterPattern: mockHookState.filterPattern,
    setFilterPattern: mockSetFilterPattern,
    streamName: mockHookState.streamName,
    setStreamName: mockSetStreamName,
    isTailing: mockHookState.isTailing,
    setTailing: mockSetTailing,
    loadMore: vi.fn(),
    hasNextPage: mockHookState.hasNextPage,
    isInitialLoading: mockHookState.isInitialLoading,
    isLoadingMore: mockHookState.isLoadingMore,
    error: mockHookState.error,
    refresh: vi.fn(),
  }),
}));

describe("LogGroupView", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockHookState.events = [...mockEvents];
    mockHookState.isTailing = false;
    mockHookState.filterPattern = "";
    mockHookState.streamName = undefined;
    useProfiles.setState({
      profiles: [{ ...localProfile(), region: "us-east-1" }],
      activeProfileId: LOCAL_PROFILE_ID,
    });
    useTabs.setState({
      tabs: [
        {
          id: `logGroup:${mockLogGroupName}`,
          kind: "logGroup",
          logGroupName: mockLogGroupName,
          title: mockLogGroupName,
        },
      ],
      activeTabId: `logGroup:${mockLogGroupName}`,
    });
  });

  it("renders log events in virtualized rows", () => {
    renderWithProviders(<LogGroupView logGroupName={mockLogGroupName} />);
    expect(screen.getByText(mockLogGroupName)).toBeInTheDocument();
    expect(screen.getByText("START RequestId: 12345")).toBeInTheDocument();
    expect(
      screen.getByText("Processing payment for user 42"),
    ).toBeInTheDocument();
  });

  it("toggles live tailing", () => {
    renderWithProviders(<LogGroupView logGroupName={mockLogGroupName} />);
    const tailBtn = screen.getByRole("button", { name: /Live tail/i });
    fireEvent.click(tailBtn);

    expect(mockSetTailing).toHaveBeenCalledWith(true);
  });

  it("debounces search filter input using fake timers", () => {
    vi.useFakeTimers();
    try {
      renderWithProviders(<LogGroupView logGroupName={mockLogGroupName} />);
      const searchInput = screen.getByPlaceholderText(
        /Search \/ filter pattern/i,
      );

      fireEvent.change(searchInput, { target: { value: "ERROR" } });
      expect(mockSetFilterPattern).not.toHaveBeenCalledWith("ERROR");

      act(() => {
        vi.advanceTimersByTime(350);
      });

      expect(mockSetFilterPattern).toHaveBeenCalledWith("ERROR");
    } finally {
      vi.useRealTimers();
    }
  });

  it("deletes log group and closes tab", async () => {
    renderWithProviders(<LogGroupView logGroupName={mockLogGroupName} />);
    fireEvent.click(screen.getByRole("button", { name: "Delete group" }));

    const confirmDialog = screen.getByRole("dialog");
    expect(
      within(confirmDialog).getByText(/Are you sure you want to delete log group/),
    ).toBeInTheDocument();

    const confirmBtn = within(confirmDialog).getByRole("button", {
      name: "Delete log group",
    });
    fireEvent.click(confirmBtn);

    expect(mockDeleteGroup).toHaveBeenCalledWith(mockLogGroupName);
  });

  it("expands a log event row to show full details and copy button", async () => {
    Object.assign(navigator, {
      clipboard: {
        writeText: vi.fn().mockResolvedValue(undefined),
      },
    });

    renderWithProviders(<LogGroupView logGroupName={mockLogGroupName} />);

    // Initially collapsed, find expand button on first row
    const expandBtns = screen.getAllByRole("button", {
      name: "Expand log event",
    });
    expect(expandBtns.length).toBeGreaterThanOrEqual(1);

    // Click expand
    fireEvent.click(expandBtns[0]);

    // Should show collapse button now
    expect(
      screen.getByRole("button", { name: "Collapse log event" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Full view" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Copy" })).toBeInTheDocument();

    // Click Full view to open full dialog
    fireEvent.click(screen.getByRole("button", { name: "Full view" }));
    expect(screen.getByText("Log Event Details")).toBeInTheDocument();
  });

  it("toggles wrap lines and expand all", () => {
    renderWithProviders(<LogGroupView logGroupName={mockLogGroupName} />);

    const wrapBtn = screen.getByRole("button", { name: /wrap lines/i });
    fireEvent.click(wrapBtn);

    const expandAllBtn = screen.getByRole("button", { name: /expand all/i });
    fireEvent.click(expandAllBtn);

    expect(screen.getByRole("button", { name: /collapse all/i })).toBeInTheDocument();
  });
});
