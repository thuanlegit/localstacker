import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AddRuleDialog } from "./AddRuleDialog";

const mockAddIngressRule = vi.fn();
const mockAddEgressRule = vi.fn();

vi.mock("@/hooks/use-ec2", () => ({
  useSecurityGroups: () => ({
    data: [{ groupId: "sg-internal", groupName: "internal-sg" }],
  }),
  useSecurityGroupActions: () => ({
    addIngressRule: mockAddIngressRule,
    addEgressRule: mockAddEgressRule,
  }),
}));

describe("AddRuleDialog", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders dialog fields for inbound rule", () => {
    render(
      <AddRuleDialog
        open={true}
        onOpenChange={vi.fn()}
        groupId="sg-12345"
        direction="inbound"
      />,
    );

    expect(
      screen.getByRole("heading", { name: "Add Inbound Rule" }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText(/Port Range/i)).toBeInTheDocument();
    expect(screen.getByText("Anywhere-IPv4")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save Rule" })).toBeEnabled();
  });

  it("submits inbound rule with selected preset and target", async () => {
    mockAddIngressRule.mockResolvedValueOnce(true);
    const onOpenChange = vi.fn();
    const onAdded = vi.fn();
    const user = userEvent.setup();

    render(
      <AddRuleDialog
        open={true}
        onOpenChange={onOpenChange}
        groupId="sg-12345"
        direction="inbound"
        onAdded={onAdded}
      />,
    );

    const descInput = screen.getByLabelText(/Description/i);
    await user.type(descInput, "Allow HTTPS");

    const saveBtn = screen.getByRole("button", { name: "Save Rule" });
    await user.click(saveBtn);

    expect(mockAddIngressRule).toHaveBeenCalledWith("sg-12345", {
      ipProtocol: "tcp",
      fromPort: 443,
      toPort: 443,
      cidrIp: "0.0.0.0/0",
      sourceGroupId: undefined,
      description: "Allow HTTPS",
    });
    expect(onAdded).toHaveBeenCalled();
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("submits outbound rule calling addEgressRule", async () => {
    mockAddEgressRule.mockResolvedValueOnce(true);
    const user = userEvent.setup();

    render(
      <AddRuleDialog
        open={true}
        onOpenChange={vi.fn()}
        groupId="sg-12345"
        direction="outbound"
      />,
    );

    const saveBtn = screen.getByRole("button", { name: "Save Rule" });
    await user.click(saveBtn);

    expect(mockAddEgressRule).toHaveBeenCalledWith("sg-12345", {
      ipProtocol: "-1",
      fromPort: undefined,
      toPort: undefined,
      cidrIp: "0.0.0.0/0",
      sourceGroupId: undefined,
      description: undefined,
    });
  });

  it("validates custom CIDR input", async () => {
    const user = userEvent.setup();

    render(
      <AddRuleDialog
        open={true}
        onOpenChange={vi.fn()}
        groupId="sg-12345"
        direction="inbound"
      />,
    );

    await user.click(screen.getByRole("button", { name: "Custom CIDR" }));

    const cidrInput = screen.getByPlaceholderText(/0.0.0.0\/0 or 10.0.0.0\/16/i);
    await user.clear(cidrInput);
    await user.type(cidrInput, "invalid-ip");

    expect(screen.getByText(/Invalid CIDR block format/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save Rule" })).toBeDisabled();
  });
});
