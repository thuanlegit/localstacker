import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SecurityGroupRuleMatrix } from "./SecurityGroupRuleMatrix";
import type { SecurityGroupSummary } from "@/lib/ec2";

const mockRemoveIngressRule = vi.fn();
const mockRemoveEgressRule = vi.fn();

vi.mock("@/hooks/use-ec2", () => ({
  useSecurityGroupActions: () => ({
    removeIngressRule: mockRemoveIngressRule,
    removeEgressRule: mockRemoveEgressRule,
  }),
}));

const mockSg: SecurityGroupSummary = {
  groupId: "sg-100",
  groupName: "web-sg",
  description: "Web tier",
  inboundRules: [
    {
      ipProtocol: "tcp",
      fromPort: 80,
      toPort: 80,
      ipRanges: [{ cidrIp: "0.0.0.0/0", description: "HTTP traffic" }],
      ipv6Ranges: [],
      userIdGroupPairs: [],
    },
    {
      ipProtocol: "tcp",
      fromPort: 443,
      toPort: 443,
      ipRanges: [{ cidrIp: "0.0.0.0/0" }],
      ipv6Ranges: [],
      userIdGroupPairs: [],
    },
  ],
  outboundRules: [
    {
      ipProtocol: "-1",
      ipRanges: [{ cidrIp: "0.0.0.0/0" }],
      ipv6Ranges: [],
      userIdGroupPairs: [],
    },
  ],
  tags: {},
};

describe("SecurityGroupRuleMatrix", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders inbound rules matrix by default", () => {
    render(<SecurityGroupRuleMatrix securityGroup={mockSg} />);

    expect(screen.getByRole("tab", { name: /Inbound Rules/i })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /Outbound Rules/i })).toBeInTheDocument();

    expect(screen.getByText("80")).toBeInTheDocument();
    expect(screen.getByText("443")).toBeInTheDocument();
    expect(screen.getByText("HTTP traffic")).toBeInTheDocument();
  });

  it("switches to outbound rules tab", async () => {
    const user = userEvent.setup();
    render(<SecurityGroupRuleMatrix securityGroup={mockSg} />);

    const outboundTab = screen.getByRole("tab", { name: /Outbound Rules/i });
    await user.click(outboundTab);

    expect(screen.getByText("All traffic")).toBeInTheDocument();
  });

  it("opens revoke confirmation dialog and calls removeIngressRule", async () => {
    mockRemoveIngressRule.mockResolvedValueOnce(true);
    const user = userEvent.setup();
    render(<SecurityGroupRuleMatrix securityGroup={mockSg} />);

    const revokeButtons = screen.getAllByRole("button", {
      name: /Revoke rule for port/i,
    });
    // Click revoke on port 80 rule
    await user.click(revokeButtons[0]);

    expect(
      screen.getByRole("heading", { name: "Revoke Inbound Rule" }),
    ).toBeInTheDocument();

    const confirmBtn = screen.getByRole("button", { name: "Revoke" });
    await user.click(confirmBtn);

    expect(mockRemoveIngressRule).toHaveBeenCalledWith("sg-100", {
      ipProtocol: "tcp",
      fromPort: 80,
      toPort: 80,
      cidrIp: "0.0.0.0/0",
      sourceGroupId: undefined,
      description: "HTTP traffic",
    });
  });

  it("renders empty state when rules are empty", () => {
    const emptySg: SecurityGroupSummary = {
      groupId: "sg-empty",
      groupName: "empty-sg",
      inboundRules: [],
      outboundRules: [],
      tags: {},
    };
    render(<SecurityGroupRuleMatrix securityGroup={emptySg} />);

    expect(
      screen.getByText("No inbound rules configured"),
    ).toBeInTheDocument();
  });
});
