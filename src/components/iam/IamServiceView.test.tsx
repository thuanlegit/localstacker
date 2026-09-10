import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { IamServiceView } from "./IamServiceView";
import { useTabs } from "@/store/tabs";

const mockDeleteRole = vi.fn();
const mockDeleteUser = vi.fn();

vi.mock("@/hooks/use-iam", () => ({
  useRoles: () => ({
    data: [
      {
        roleName: "AppRole",
        roleId: "R1",
        arn: "arn:aws:iam::000000000000:role/AppRole",
        path: "/",
        createDate: new Date("2025-01-01T00:00:00Z"),
      },
    ],
    isLoading: false,
    isFetching: false,
    refetch: vi.fn(),
  }),
  useUsers: () => ({
    data: [
      {
        userName: "DevUser",
        userId: "U1",
        arn: "arn:aws:iam::000000000000:user/DevUser",
        path: "/",
        createDate: new Date("2025-01-01T00:00:00Z"),
      },
    ],
    isLoading: false,
    isFetching: false,
    refetch: vi.fn(),
  }),
  usePolicies: () => ({
    data: [
      {
        policyName: "ReadOnlyAccess",
        policyId: "P1",
        arn: "arn:aws:iam::aws:policy/ReadOnlyAccess",
        isAwsManaged: true,
        attachmentCount: 3,
      },
    ],
    isLoading: false,
    isFetching: false,
    refetch: vi.fn(),
  }),
  useRoleActions: () => ({
    deleteRole: mockDeleteRole,
    createRole: vi.fn(),
    putRolePolicy: vi.fn(),
    deleteRolePolicy: vi.fn(),
  }),
  useUserActions: () => ({
    deleteUser: mockDeleteUser,
    createUser: vi.fn(),
    createAccessKey: vi.fn(),
    updateAccessKeyStatus: vi.fn(),
    deleteAccessKey: vi.fn(),
  }),
}));

describe("IamServiceView", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders IAM header and lists roles", () => {
    render(<IamServiceView />);

    expect(screen.getByText("IAM")).toBeInTheDocument();
    expect(screen.getByText("AppRole")).toBeInTheDocument();
  });

  it("switches to Users tab and opens user tab on click", async () => {
    const openTabSpy = vi.spyOn(useTabs.getState(), "openTab");
    const user = userEvent.setup();

    render(<IamServiceView />);

    const usersTab = screen.getByRole("tab", { name: /Users/ });
    await user.click(usersTab);

    expect(screen.getByText("DevUser")).toBeInTheDocument();

    const userLink = screen.getByRole("button", { name: /DevUser/ });
    await user.click(userLink);

    expect(openTabSpy).toHaveBeenCalledWith({
      id: "iamUser:DevUser",
      kind: "iamUser",
      userName: "DevUser",
      title: "DevUser",
    });
  });

  it("switches to Policies tab and displays policy", async () => {
    const user = userEvent.setup();
    render(<IamServiceView />);

    const policiesTab = screen.getByRole("tab", { name: /Policies/ });
    await user.click(policiesTab);

    expect(screen.getByText("ReadOnlyAccess")).toBeInTheDocument();
    expect(screen.getAllByText("AWS Managed").length).toBeGreaterThan(0);
  });
});
