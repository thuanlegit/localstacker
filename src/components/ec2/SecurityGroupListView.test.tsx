import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SecurityGroupListView } from "./SecurityGroupListView";
import type { SecurityGroupSummary } from "@/lib/ec2";

const mockDeleteSecurityGroup = vi.fn();
const mockOpenTab = vi.fn();
const mockCloseTab = vi.fn();

const mockGroups: SecurityGroupSummary[] = [
  {
    groupId: "sg-web-1",
    groupName: "web-sg",
    description: "Web tier security group",
    vpcId: "vpc-01",
    inboundRules: [
      {
        ipProtocol: "tcp",
        fromPort: 80,
        toPort: 80,
        ipRanges: [{ cidrIp: "0.0.0.0/0" }],
        ipv6Ranges: [],
        userIdGroupPairs: [],
      },
    ],
    outboundRules: [],
    tags: {},
  },
  {
    groupId: "sg-db-2",
    groupName: "db-sg",
    description: "Database tier",
    inboundRules: [],
    outboundRules: [],
    tags: {},
  },
];

let mockData = mockGroups;
let mockLoading = false;

vi.mock("@/hooks/use-ec2", () => ({
  useSecurityGroups: () => ({
    data: mockData,
    isLoading: mockLoading,
    refetch: vi.fn(),
  }),
  useSecurityGroupActions: () => ({
    createSecurityGroup: vi.fn(),
    deleteSecurityGroup: mockDeleteSecurityGroup,
  }),
}));

vi.mock("@/store/tabs", () => ({
  useTabs: () => ({
    openTab: mockOpenTab,
    closeTab: mockCloseTab,
  }),
}));

describe("SecurityGroupListView", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockData = mockGroups;
    mockLoading = false;
  });

  it("renders table of security groups", () => {
    render(<SecurityGroupListView />);

    expect(screen.getByText("web-sg")).toBeInTheDocument();
    expect(screen.getByText("sg-web-1")).toBeInTheDocument();
    expect(screen.getByText("Web tier security group")).toBeInTheDocument();
    expect(screen.getByText("vpc-01")).toBeInTheDocument();
    expect(screen.getByText("1 rule")).toBeInTheDocument();
    expect(screen.getAllByText("0 rules").length).toBeGreaterThan(0);

    expect(screen.getByText("db-sg")).toBeInTheDocument();
    expect(screen.getByText("sg-db-2")).toBeInTheDocument();
  });

  it("filters security groups by query", async () => {
    const user = userEvent.setup();
    render(<SecurityGroupListView />);

    const searchInput = screen.getByPlaceholderText(/Filter security groups/i);
    await user.type(searchInput, "db");

    expect(screen.getByText("db-sg")).toBeInTheDocument();
    expect(screen.queryByText("web-sg")).not.toBeInTheDocument();
  });

  it("navigates to security group detail tab when clicking Manage Rules", async () => {
    const user = userEvent.setup();
    render(<SecurityGroupListView />);

    const manageButtons = screen.getAllByRole("button", {
      name: /Manage Rules/i,
    });
    await user.click(manageButtons[0]);

    expect(mockOpenTab).toHaveBeenCalledWith({
      id: "securityGroup:sg-web-1",
      kind: "securityGroup",
      securityGroupId: "sg-web-1",
      title: "web-sg",
    });
  });

  it("opens delete confirmation dialog and deletes security group", async () => {
    mockDeleteSecurityGroup.mockResolvedValueOnce(true);
    const user = userEvent.setup();
    render(<SecurityGroupListView />);

    const deleteBtn = screen.getByRole("button", {
      name: "Delete security group web-sg",
    });
    await user.click(deleteBtn);

    expect(
      screen.getByRole("heading", { name: "Delete Security Group" }),
    ).toBeInTheDocument();

    const confirmBtn = screen.getByRole("button", { name: "Delete" });
    await user.click(confirmBtn);

    expect(mockDeleteSecurityGroup).toHaveBeenCalledWith("sg-web-1", "web-sg");
    expect(mockCloseTab).toHaveBeenCalledWith("securityGroup:sg-web-1");
  });
});
