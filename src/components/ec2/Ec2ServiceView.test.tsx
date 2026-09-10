import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Ec2ServiceView } from "./Ec2ServiceView";

const mockRefetchInstances = vi.fn();
const mockRefetchKeyPairs = vi.fn();
const mockRefetchSecurityGroups = vi.fn();

vi.mock("@/hooks/use-ec2", () => ({
  useInstances: () => ({
    data: [{ instanceId: "i-123", state: "running", securityGroups: [], tags: {} }],
    isFetching: false,
    refetch: mockRefetchInstances,
  }),
  useKeyPairs: () => ({
    data: [{ keyName: "dev-key", tags: {} }],
    isFetching: false,
    refetch: mockRefetchKeyPairs,
  }),
  useSecurityGroups: () => ({
    data: [
      { groupId: "sg-1", groupName: "default", inboundRules: [], outboundRules: [], tags: {} },
      { groupId: "sg-2", groupName: "web-sg", inboundRules: [], outboundRules: [], tags: {} },
    ],
    isFetching: false,
    refetch: mockRefetchSecurityGroups,
  }),
  useInstanceActions: () => ({
    startInstance: vi.fn(),
    stopInstance: vi.fn(),
    rebootInstance: vi.fn(),
    terminateInstance: vi.fn(),
    launchInstance: vi.fn(),
  }),
}));

describe("Ec2ServiceView", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders header, badges, and tabs with counts", () => {
    render(<Ec2ServiceView />);

    expect(screen.getByRole("heading", { name: "EC2" })).toBeInTheDocument();
    expect(screen.getByText("Stateful Mock")).toBeInTheDocument();
    expect(
      screen.getByText("Compute instances, key pairs & security groups"),
    ).toBeInTheDocument();

    expect(screen.getByRole("tab", { name: /Instances/i })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /Security Groups/i })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /Key Pairs/i })).toBeInTheDocument();
  });

  it("switches tabs when clicked", async () => {
    const user = userEvent.setup();
    render(
      <Ec2ServiceView
        securityGroupsContent={<div>Custom SG Content</div>}
        keyPairsContent={<div>Custom KP Content</div>}
      />,
    );

    const sgTab = screen.getByRole("tab", { name: /Security Groups/i });
    await user.click(sgTab);

    expect(screen.getByText("Custom SG Content")).toBeInTheDocument();

    const kpTab = screen.getByRole("tab", { name: /Key Pairs/i });
    await user.click(kpTab);

    expect(screen.getByText("Custom KP Content")).toBeInTheDocument();
  });

  it("triggers refetch on refresh button click", async () => {
    const user = userEvent.setup();
    render(<Ec2ServiceView />);

    const refreshBtn = screen.getByRole("button", { name: /Refresh/i });
    await user.click(refreshBtn);

    expect(mockRefetchInstances).toHaveBeenCalled();
    expect(mockRefetchKeyPairs).toHaveBeenCalled();
    expect(mockRefetchSecurityGroups).toHaveBeenCalled();
  });
});
