import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CreateRoleDialog } from "./CreateRoleDialog";

const mockCreateRole = vi.fn();

vi.mock("@/hooks/use-iam", () => ({
  useRoleActions: () => ({
    createRole: mockCreateRole,
  }),
}));

describe("CreateRoleDialog", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders inputs and creates role", async () => {
    mockCreateRole.mockResolvedValueOnce({ roleName: "NewTestRole" });
    const onCreated = vi.fn();
    const onOpenChange = vi.fn();
    const user = userEvent.setup();

    render(
      <CreateRoleDialog
        open={true}
        onOpenChange={onOpenChange}
        onCreated={onCreated}
      />,
    );

    const nameInput = screen.getByLabelText("Role Name");
    await user.type(nameInput, "NewTestRole");

    const submitBtn = screen.getByRole("button", { name: "Create Role" });
    expect(submitBtn).toBeEnabled();

    await user.click(submitBtn);

    expect(mockCreateRole).toHaveBeenCalledWith({
      roleName: "NewTestRole",
      description: undefined,
      assumeRolePolicyDocument: expect.stringContaining("lambda.amazonaws.com"),
    });
    expect(onCreated).toHaveBeenCalledWith("NewTestRole");
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});
