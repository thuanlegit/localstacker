import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { IamServiceView } from "./IamServiceView";
import { useTabs } from "@/store/tabs";

const mockDeleteRole = vi.fn();
const mockDeleteUser = vi.fn();
const { mockState } = vi.hoisted(() => ({
  mockState: {
    serviceStatus: "available" as string | undefined,
    rolesError: null as Error | null,
    usersError: null as Error | null,
    policiesError: null as Error | null,
  },
}));

vi.mock("@/hooks/use-health", () => ({
  useServiceStatus: () => mockState.serviceStatus,
  useHealth: () => ({ data: undefined, refetch: vi.fn() }),
  isServiceDisabledError: (err: unknown) =>
    err instanceof Error && err.message.includes("is not enabled"),
}));

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
    error: mockState.rolesError,
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
    error: mockState.usersError,
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
    error: mockState.policiesError,
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
    mockState.serviceStatus = "available";
    mockState.rolesError = null;
    mockState.usersError = null;
    mockState.policiesError = null;
  });

  it("shows the disabled view when IAM is disabled in LocalStack", () => {
    mockState.serviceStatus = "disabled";
    render(<IamServiceView />);

    expect(screen.getByText("IAM is turned off")).toBeInTheDocument();
    expect(screen.queryByText("AppRole")).not.toBeInTheDocument();
  });

  it("shows the disabled view when the IAM API reports it is not enabled", () => {
    mockState.rolesError = new Error(
      "The iam service is not enabled in this LocalStack instance",
    );
    render(<IamServiceView />);

    expect(screen.getByText("IAM is turned off")).toBeInTheDocument();
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
