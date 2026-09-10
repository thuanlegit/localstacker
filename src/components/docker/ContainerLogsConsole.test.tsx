import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ContainerLogsConsole } from "./ContainerLogsConsole";

// jsdom can't measure the scroll container, so the real virtualizer renders
// zero rows. Expand it to render every row for assertion purposes.
vi.mock("@tanstack/react-virtual", () => ({
  useVirtualizer: ({ count }: { count: number }) => ({
    getTotalSize: () => count * 22,
    getVirtualItems: () =>
      Array.from({ length: count }, (_, index) => ({
        key: index,
        index,
        size: 22,
        start: index * 22,
      })),
  }),
}));

type BatchSink = (lines: string[]) => void;

const { mockStopContainerLogs, mockContainerLogs, mockAdapter } = vi.hoisted(() => {
  const mockStopContainerLogs = vi.fn();
  const mockContainerLogs = vi.fn();
  return {
    mockStopContainerLogs,
    mockContainerLogs,
    // Stable adapter identity: the component's stream effect depends on it.
    mockAdapter: {
      kind: "mock" as const,
      containerLogs: mockContainerLogs,
      stopContainerLogs: mockStopContainerLogs,
    },
  };
});

let batchSink: BatchSink | null = null;

vi.mock("@/hooks/use-docker", () => ({
  useDockerAdapter: () => mockAdapter,
}));

const SNAPSHOT_LINES = Array.from({ length: 20 }, (_, i) => {
  const n = String(i + 1).padStart(2, "0");
  return `[LocalStack] INFO: snapshot line ${n}`;
});

async function pushLines(lines: string[]) {
  await act(async () => {
    batchSink?.(lines);
  });
}

describe("ContainerLogsConsole", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    batchSink = null;
    mockContainerLogs.mockImplementation(
      async (_sessionId: string, _containerId: string, _tail: number, onBatch: BatchSink) => {
        batchSink = onBatch;
        onBatch(SNAPSHOT_LINES);
      },
    );
    mockStopContainerLogs.mockImplementation(async () => {
      batchSink = null;
    });
  });

  afterEach(() => {
    cleanup();
  });

  it("renders snapshot lines and requests a 500-line follow stream", async () => {
    render(<ContainerLogsConsole containerId="c-demo" />);

    expect(await screen.findByText(SNAPSHOT_LINES[0])).toBeInTheDocument();
    expect(screen.getByTestId("log-line-count")).toHaveTextContent("20 lines");

    expect(mockContainerLogs).toHaveBeenCalledWith(
      expect.any(String),
      "c-demo",
      500,
      expect.any(Function),
    );
  });

  it("appends followed lines and grows the rendered count", async () => {
    render(<ContainerLogsConsole containerId="c-demo" />);
    await screen.findByText(SNAPSHOT_LINES[0]);

    await pushLines(["[LocalStack] INFO: follow line 21"]);
    expect(await screen.findByText("[LocalStack] INFO: follow line 21")).toBeInTheDocument();
    expect(screen.getByTestId("log-line-count")).toHaveTextContent("21 lines");
  });

  it("pauses autoscroll while the buffer keeps filling, then resumes", async () => {
    const user = userEvent.setup();
    render(<ContainerLogsConsole containerId="c-demo" />);
    await screen.findByText(SNAPSHOT_LINES[0]);

    await user.click(screen.getByRole("button", { name: "Pause follow" }));
    expect(screen.getByTestId("paused-indicator")).toBeInTheDocument();

    await pushLines(["[LocalStack] INFO: buffered while paused"]);
    expect(screen.getByTestId("log-line-count")).toHaveTextContent("21 lines");

    await user.click(screen.getByRole("button", { name: "Resume follow" }));
    expect(
      await screen.findByText("[LocalStack] INFO: buffered while paused"),
    ).toBeInTheDocument();
    expect(screen.queryByTestId("paused-indicator")).not.toBeInTheDocument();
  });

  it("filters lines by search substring", async () => {
    const user = userEvent.setup();
    render(<ContainerLogsConsole containerId="c-demo" />);
    await screen.findByText(SNAPSHOT_LINES[0]);

    await user.type(screen.getByLabelText("Search logs"), "snapshot line 03");
    expect(await screen.findByText(SNAPSHOT_LINES[2])).toBeInTheDocument();
    expect(screen.queryByText(SNAPSHOT_LINES[0])).not.toBeInTheDocument();
    expect(screen.getByTestId("log-line-count")).toHaveTextContent("20 lines");
  });

  it("stops the follow stream on unmount", async () => {
    const { unmount } = render(<ContainerLogsConsole containerId="c-demo" />);
    await screen.findByText(SNAPSHOT_LINES[0]);

    expect(mockStopContainerLogs).not.toHaveBeenCalled();
    unmount();
    expect(mockStopContainerLogs).toHaveBeenCalledWith(expect.any(String));
  });

  it("shows retry on stream error and re-subscribes", async () => {
    mockContainerLogs.mockRejectedValue(new Error("docker daemon down"));
    const user = userEvent.setup();
    render(<ContainerLogsConsole containerId="c-demo" />);

    expect(await screen.findByText("Failed to stream logs")).toBeInTheDocument();
    expect(screen.getByText("docker daemon down")).toBeInTheDocument();

    mockContainerLogs.mockImplementation(
      async (_sessionId: string, _containerId: string, _tail: number, onBatch: BatchSink) => {
        batchSink = onBatch;
        onBatch(["[LocalStack] INFO: recovered"]);
      },
    );
    await user.click(screen.getByRole("button", { name: /Retry/ }));

    expect(await screen.findByText("[LocalStack] INFO: recovered")).toBeInTheDocument();
  });
});
