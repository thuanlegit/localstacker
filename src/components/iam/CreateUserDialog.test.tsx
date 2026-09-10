import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CreateUserDialog } from "./CreateUserDialog";

const mockCreateUser = vi.fn();

vi.mock("@/hooks/use-iam", () => ({
  useUserActions: () => ({
    createUser: mockCreateUser,
  }),
}));

describe("CreateUserDialog", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("validates input and submits user creation", async () => {
    mockCreateUser.mockResolvedValueOnce({ userName: "testuser" });
    const onCreated = vi.fn();
    const onOpenChange = vi.fn();
    const user = userEvent.setup();

    render(
      <CreateUserDialog
        open={true}
        onOpenChange={onOpenChange}
        onCreated={onCreated}
      />,
    );

    const nameInput = screen.getByLabelText("User Name");
    await user.type(nameInput, "testuser");

    const submitBtn = screen.getByRole("button", { name: "Create User" });
    await user.click(submitBtn);

    expect(mockCreateUser).toHaveBeenCalledWith({
      userName: "testuser",
      path: "/",
    });
    expect(onCreated).toHaveBeenCalledWith("testuser");
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});
