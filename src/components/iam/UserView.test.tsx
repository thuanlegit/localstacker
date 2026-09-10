import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { UserView } from "./UserView";
import { useTabs } from "@/store/tabs";

const mockDeleteUser = vi.fn();
const mockCreateAccessKey = vi.fn();
const mockUpdateAccessKeyStatus = vi.fn();
const mockDeleteAccessKey = vi.fn();

vi.mock("@/hooks/use-iam", () => ({
  useUsers: () => ({
    data: [
      {
        userName: "Alice",
        userId: "U1",
        arn: "arn:aws:iam::000000000000:user/Alice",
        createDate: new Date("2025-01-01T00:00:00Z"),
        path: "/",
      },
    ],
    isLoading: false,
    refetch: vi.fn(),
  }),
  useAccessKeys: () => ({
    data: [
      {
        accessKeyId: "AKIA1234567890",
        userName: "Alice",
        status: "Active",
        createDate: new Date("2025-01-01T00:00:00Z"),
      },
    ],
    isLoading: false,
    refetch: vi.fn(),
  }),
  useUserActions: () => ({
    deleteUser: mockDeleteUser,
    createAccessKey: mockCreateAccessKey,
    updateAccessKeyStatus: mockUpdateAccessKeyStatus,
    deleteAccessKey: mockDeleteAccessKey,
  }),
}));

describe("UserView", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders user information and access keys", () => {
    render(<UserView userName="Alice" />);

    expect(screen.getByText("Alice")).toBeInTheDocument();
    expect(
      screen.getByText("arn:aws:iam::000000000000:user/Alice"),
    ).toBeInTheDocument();
    expect(screen.getByText("AKIA1234567890")).toBeInTheDocument();
    expect(screen.getByText("Active")).toBeInTheDocument();
  });

  it("toggles access key status", async () => {
    mockUpdateAccessKeyStatus.mockResolvedValueOnce(true);
    const user = userEvent.setup();

    render(<UserView userName="Alice" />);

    const deactivateBtn = screen.getByRole("button", { name: "Deactivate" });
    await user.click(deactivateBtn);

    expect(mockUpdateAccessKeyStatus).toHaveBeenCalledWith(
      "Alice",
      "AKIA1234567890",
      "Inactive",
    );
  });

  it("deletes user and closes tab", async () => {
    mockDeleteUser.mockResolvedValueOnce(true);
    const closeTabSpy = vi.spyOn(useTabs.getState(), "closeTab");
    const user = userEvent.setup();

    render(<UserView userName="Alice" />);

    const deleteUserBtn = screen.getByRole("button", { name: /Delete User/ });
    await user.click(deleteUserBtn);

    expect(
      screen.getByText(/Are you sure you want to delete user "Alice"/),
    ).toBeInTheDocument();

    const confirmBtn = screen.getByRole("button", { name: "Delete" });
    await user.click(confirmBtn);

    expect(mockDeleteUser).toHaveBeenCalledWith("Alice");
    expect(closeTabSpy).toHaveBeenCalledWith("iamUser:Alice");
  });
});
