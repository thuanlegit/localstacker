import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CreateSecurityGroupDialog } from "./CreateSecurityGroupDialog";

const mockCreateSecurityGroup = vi.fn();

vi.mock("@/hooks/use-ec2", () => ({
  useSecurityGroupActions: () => ({
    createSecurityGroup: mockCreateSecurityGroup,
  }),
}));

describe("CreateSecurityGroupDialog", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders form fields and validates inputs", () => {
    render(
      <CreateSecurityGroupDialog open={true} onOpenChange={vi.fn()} />,
    );

    expect(
      screen.getByRole("heading", { name: "Create Security Group" }),
    ).toBeInTheDocument();
    expect(
      screen.getByLabelText(/Security Group Name/i),
    ).toBeInTheDocument();
    expect(screen.getByLabelText(/Description/i)).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Create Security Group" }),
    ).toBeDisabled();
  });

  it("creates security group on valid submission", async () => {
    mockCreateSecurityGroup.mockResolvedValueOnce("sg-new-999");
    const onCreated = vi.fn();
    const onOpenChange = vi.fn();
    const user = userEvent.setup();

    render(
      <CreateSecurityGroupDialog
        open={true}
        onOpenChange={onOpenChange}
        onCreated={onCreated}
      />,
    );

    const nameInput = screen.getByLabelText(/Security Group Name/i);
    await user.type(nameInput, "db-cluster-sg");

    const descInput = screen.getByLabelText(/Description/i);
    await user.type(descInput, "Database security group");

    const submitBtn = screen.getByRole("button", {
      name: "Create Security Group",
    });
    expect(submitBtn).toBeEnabled();
    await user.click(submitBtn);

    expect(mockCreateSecurityGroup).toHaveBeenCalledWith({
      groupName: "db-cluster-sg",
      description: "Database security group",
      vpcId: undefined,
    });
    expect(onCreated).toHaveBeenCalledWith("sg-new-999");
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});
