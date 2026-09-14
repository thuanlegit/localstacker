import { describe, expect, it, vi, beforeEach } from "vitest";
import { fireEvent, screen, within } from "@testing-library/react";
import { StateMachineView } from "./StateMachineView";
import { renderWithProviders } from "@/test/utils";
import { LOCAL_PROFILE_ID, localProfile, useProfiles } from "@/store/profiles";
import type { ExecutionSummary, StateMachineDetail } from "@/lib/sfn";

const MACHINE: StateMachineDetail = {
  arn: "arn:aws:states:us-east-1:000000000000:order-flow",
  name: "order-flow",
  definition: JSON.stringify({
    StartAt: "A",
    States: {
      A: { Type: "Task", Resource: "arn:aws:lambda:us-east-1::function:x", Next: "B" },
      B: { Type: "Succeed" },
    },
  }),
  roleArn: "arn:aws:iam::000000000000:role/localstacker",
};

const EXECUTIONS: ExecutionSummary[] = [
  {
    executionArn: "arn:aws:states:us-east-1:000000000000:execution:run-1",
    name: "run-1",
    status: "SUCCEEDED",
    startDate: new Date("2024-01-01T00:00:00Z"),
  },
];

const { mockState, mockStartExecution, mockStopExecution } = vi.hoisted(() => ({
  mockState: {
    serviceStatus: "available" as string,
    machine: undefined as StateMachineDetail | undefined,
    machineError: null as Error | null,
    executions: [] as ExecutionSummary[] | undefined,
    history: [] as Array<{ timestamp: Date; type: string; previousEventId?: number }>,
  },
  mockStartExecution: vi
    .fn()
    .mockResolvedValue("arn:aws:states:us-east-1:000000000000:execution:run-2"),
  mockStopExecution: vi.fn().mockResolvedValue(true),
}));

vi.mock("@/hooks/use-health", () => ({
  useServiceStatus: () => mockState.serviceStatus,
  useHealth: () => ({ data: undefined, refetch: vi.fn() }),
  isServiceDisabledError: (err: unknown) =>
    err instanceof Error && err.message.includes("is not enabled"),
}));

vi.mock("@/hooks/use-sfn", () => ({
  useStateMachine: () => ({
    data: mockState.machine,
    isPending: false,
    error: mockState.machineError,
    refetch: vi.fn(),
  }),
  useExecutions: () => ({
    data: mockState.executions,
    isPending: false,
    isFetching: false,
    error: null,
    refetch: vi.fn(),
  }),
  useExecutionHistory: (_profileId: string, executionArn: string, options?: { enabled?: boolean }) => ({
    data: options?.enabled && executionArn ? mockState.history : undefined,
    isPending: false,
  }),
  useSfnActions: () => ({
    startExecution: mockStartExecution,
    stopExecution: mockStopExecution,
    createStateMachine: vi.fn(),
    deleteStateMachine: vi.fn(),
  }),
}));

vi.mock("./AslGraph", () => ({
  AslGraph: ({ definition }: { definition: string }) => (
    <div data-testid="asl-graph-mock">{definition.length}</div>
  ),
}));

describe("StateMachineView", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockState.serviceStatus = "available";
    mockState.machine = { ...MACHINE };
    mockState.machineError = null;
    mockState.executions = EXECUTIONS.map((e) => ({ ...e }));
    mockState.history = [
      { timestamp: new Date("2024-01-01T00:00:00Z"), type: "ExecutionStarted" },
      {
        timestamp: new Date("2024-01-01T00:00:02Z"),
        type: "ExecutionSucceeded",
        previousEventId: 2,
      },
    ];
    useProfiles.setState({
      profiles: [{ ...localProfile(), region: "us-east-1" }],
      activeProfileId: LOCAL_PROFILE_ID,
    });
  });

  it("renders definition states and executions table", () => {
    renderWithProviders(
      <StateMachineView stateMachineArn="arn:aws:states:us-east-1:000000000000:order-flow" />,
    );

    expect(screen.getByRole("heading", { name: "order-flow" })).toBeInTheDocument();
    expect(screen.getByText("State graph")).toBeInTheDocument();
    expect(screen.getByText("A")).toBeInTheDocument();
    expect(screen.getByText("B")).toBeInTheDocument();
    expect(screen.getByText("run-1")).toBeInTheDocument();
    expect(screen.getByText("SUCCEEDED")).toBeInTheDocument();
  });

  it("starts an execution with JSON input via the dialog", async () => {
    renderWithProviders(
      <StateMachineView stateMachineArn="arn:aws:states:us-east-1:000000000000:order-flow" />,
    );

    fireEvent.click(screen.getByRole("button", { name: /Start execution/i }));
    const dialog = screen.getByRole("dialog");
    fireEvent.change(within(dialog).getByLabelText(/Input \(JSON/i), {
      target: { value: '{"value":1}' },
    });
    fireEvent.click(within(dialog).getByRole("button", { name: "Start execution" }));

    expect(mockStartExecution).toHaveBeenCalledWith({
      stateMachineArn: "arn:aws:states:us-east-1:000000000000:order-flow",
      input: '{"value":1}',
    });
  });

  it("rejects invalid JSON input inline", () => {
    renderWithProviders(
      <StateMachineView stateMachineArn="arn:aws:states:us-east-1:000000000000:order-flow" />,
    );

    fireEvent.click(screen.getByRole("button", { name: /Start execution/i }));
    const dialog = screen.getByRole("dialog");
    fireEvent.change(within(dialog).getByLabelText(/Input \(JSON/i), {
      target: { value: "{oops" },
    });
    fireEvent.click(within(dialog).getByRole("button", { name: "Start execution" }));

    expect(within(dialog).getByText("Input must be valid JSON")).toBeInTheDocument();
    expect(mockStartExecution).not.toHaveBeenCalled();
  });

  it("shows event history for a selected execution newest-last", () => {
    renderWithProviders(
      <StateMachineView stateMachineArn="arn:aws:states:us-east-1:000000000000:order-flow" />,
    );

    expect(
      screen.getByText("Select an execution to inspect its event history."),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByText("run-1"));

    expect(screen.getByText("ExecutionStarted")).toBeInTheDocument();
    expect(screen.getByText("ExecutionSucceeded")).toBeInTheDocument();
    expect(screen.getByText(/after event #2/)).toBeInTheDocument();
  });
});
