import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { InstanceListView } from "./InstanceListView";
import type { InstanceSummary } from "@/lib/ec2";

const mockStartInstance = vi.fn();
const mockStopInstance = vi.fn();
const mockRebootInstance = vi.fn();
const mockTerminateInstance = vi.fn();
const mockInstances: InstanceSummary[] = [
  {
    instanceId: "i-running-1",
    name: "prod-api",
    state: "running",
    instanceType: "t2.micro",
    publicIpAddress: "54.100.0.1",
    privateIpAddress: "10.0.0.5",
    keyName: "prod-key",
    securityGroups: [{ groupId: "sg-1", groupName: "web-sg" }],
    launchTime: new Date("2026-03-01T12:00:00Z"),
    tags: { Name: "prod-api" },
  },
  {
    instanceId: "i-stopped-2",
    name: "worker-job",
    state: "stopped",
    instanceType: "t3.medium",
    privateIpAddress: "10.0.0.6",
    securityGroups: [],
    tags: { Name: "worker-job" },
  },
];

let mockInstancesData = mockInstances;
let mockIsLoading = false;

vi.mock("@/hooks/use-ec2", () => ({
  useInstances: () => ({
    data: mockInstancesData,
    isLoading: mockIsLoading,
    refetch: vi.fn(),
  }),
  useInstanceActions: () => ({
    startInstance: mockStartInstance,
    stopInstance: mockStopInstance,
    rebootInstance: mockRebootInstance,
    terminateInstance: mockTerminateInstance,
    launchInstance: vi.fn(),
  }),
  useKeyPairs: () => ({ data: [] }),
  useSecurityGroups: () => ({ data: [] }),
}));

describe("InstanceListView", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockInstancesData = mockInstances;
    mockIsLoading = false;
  });

  it("renders instance table rows and columns correctly", () => {
    render(<InstanceListView />);

    expect(screen.getByText("prod-api")).toBeInTheDocument();
    expect(screen.getByText("i-running-1")).toBeInTheDocument();
    expect(screen.getByText("worker-job")).toBeInTheDocument();
    expect(screen.getByText("i-stopped-2")).toBeInTheDocument();

    expect(screen.getByText("running")).toBeInTheDocument();
    expect(screen.getByText("stopped")).toBeInTheDocument();

    expect(screen.getByText("t2.micro")).toBeInTheDocument();
    expect(screen.getByText("t3.medium")).toBeInTheDocument();

    expect(screen.getByText("54.100.0.1")).toBeInTheDocument();
    expect(screen.getByText("prod-key")).toBeInTheDocument();
    expect(screen.getByText("web-sg")).toBeInTheDocument();
  });

  it("filters instances by search query", async () => {
    const user = userEvent.setup();
    render(<InstanceListView />);

    const searchInput = screen.getByPlaceholderText(/Filter instances/i);
    await user.type(searchInput, "worker");

    expect(screen.getByText("worker-job")).toBeInTheDocument();
    expect(screen.queryByText("prod-api")).not.toBeInTheDocument();
  });

  it("renders empty state when no instances exist", () => {
    mockInstancesData = [];
    render(<InstanceListView />);

    expect(screen.getByText("No EC2 instances found")).toBeInTheDocument();
  });

  it("opens actions dropdown and triggers state transitions", async () => {
    mockStopInstance.mockResolvedValueOnce(true);
    const user = userEvent.setup();
    render(<InstanceListView />);

    const actionButtons = screen.getAllByRole("button", {
      name: /Actions for/i,
    });
    // Click action button for the running instance
    await user.click(actionButtons[0]);

    const stopOption = screen.getByText("Stop Instance");
    await user.click(stopOption);

    expect(mockStopInstance).toHaveBeenCalledWith("i-running-1");
  });

  it("opens terminate confirmation dialog and terminates instance", async () => {
    mockTerminateInstance.mockResolvedValueOnce(true);
    const user = userEvent.setup();
    render(<InstanceListView />);

    const actionButtons = screen.getAllByRole("button", {
      name: /Actions for/i,
    });
    await user.click(actionButtons[0]);

    const terminateOption = screen.getByText("Terminate Instance");
    await user.click(terminateOption);

    expect(
      screen.getByRole("heading", { name: "Terminate Instance" }),
    ).toBeInTheDocument();

    const confirmBtn = screen.getByRole("button", { name: "Terminate" });
    await user.click(confirmBtn);

    expect(mockTerminateInstance).toHaveBeenCalledWith("i-running-1");
  });
});
