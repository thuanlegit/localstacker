import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SecurityGroupDetailView } from "./SecurityGroupDetailView";
import type { SecurityGroupSummary } from "@/lib/ec2";

const mockDeleteSecurityGroup = vi.fn();
const mockCloseTab = vi.fn();

const mockSg: SecurityGroupSummary = {
  groupId: "sg-abc",
  groupName: "production-firewall",
  description: "Production web tier firewall",
  vpcId: "vpc-main",
  inboundRules: [
    {
      ipProtocol: "tcp",
      fromPort: 443,
      toPort: 443,
      ipRanges: [{ cidrIp: "0.0.0.0/0" }],
      ipv6Ranges: [],
      userIdGroupPairs: [],
    },
  ],
  outboundRules: [],
  tags: {},
};

vi.mock("@/hooks/use-ec2", () => ({
  useSecurityGroups: () => ({
    data: [mockSg],
    isLoading: false,
    refetch: vi.fn(),
  }),
  useSecurityGroupActions: () => ({
    deleteSecurityGroup: mockDeleteSecurityGroup,
    removeIngressRule: vi.fn(),
    removeEgressRule: vi.fn(),
    addIngressRule: vi.fn(),
    addEgressRule: vi.fn(),
  }),
}));

vi.mock("@/store/tabs", () => ({
  useTabs: () => ({
    closeTab: mockCloseTab,
    openTab: vi.fn(),
  }),
}));

describe("SecurityGroupDetailView", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders header and rule matrix for the security group", () => {
    render(<SecurityGroupDetailView groupId="sg-abc" />);

    expect(screen.getByRole("heading", { name: "production-firewall" })).toBeInTheDocument();
    expect(screen.getByText("sg-abc")).toBeInTheDocument();
    expect(screen.getByText("VPC: vpc-main")).toBeInTheDocument();
    expect(screen.getByText("Production web tier firewall")).toBeInTheDocument();

    expect(screen.getByText("443")).toBeInTheDocument();
  });

  it("opens Add Inbound Rule dialog on button click", async () => {
    const user = userEvent.setup();
    render(<SecurityGroupDetailView groupId="sg-abc" />);

    const addBtns = screen.getAllByRole("button", { name: /Add Inbound Rule/i });
    await user.click(addBtns[0]);

    expect(
      screen.getByRole("heading", { name: "Add Inbound Rule" }),
    ).toBeInTheDocument();
  });

  it("deletes security group and closes tab", async () => {
    mockDeleteSecurityGroup.mockResolvedValueOnce(true);
    const user = userEvent.setup();
    render(<SecurityGroupDetailView groupId="sg-abc" />);

    const deleteBtn = screen.getByRole("button", { name: /^Delete$/i });
    await user.click(deleteBtn);

    expect(
      screen.getByRole("heading", { name: "Delete Security Group" }),
    ).toBeInTheDocument();

    const confirmBtn = screen.getByRole("button", {
      name: "Delete Security Group",
    });
    await user.click(confirmBtn);

    expect(mockDeleteSecurityGroup).toHaveBeenCalledWith(
      "sg-abc",
      "production-firewall",
    );
    expect(mockCloseTab).toHaveBeenCalledWith("securityGroup:sg-abc");
  });
});
