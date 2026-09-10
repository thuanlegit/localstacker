import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { RoleView } from "./RoleView";
import { useTabs } from "@/store/tabs";

const mockDeleteRole = vi.fn();
const mockDeleteRolePolicy = vi.fn();

vi.mock("@/hooks/use-iam", () => ({
  useRole: (name: string) => ({
    data: {
      roleName: name,
      roleId: "R123",
      arn: `arn:aws:iam::000000000000:role/${name}`,
      createDate: new Date("2025-01-01T00:00:00Z"),
      assumeRolePolicyDocument: '{"Version":"2012-10-17","Statement":[]}',
    },
    isLoading: false,
    error: null,
    refetch: vi.fn(),
  }),
  useRolePolicies: () => ({
    data: ["S3Access"],
    isLoading: false,
    refetch: vi.fn(),
  }),
  useRolePolicy: () => ({
    data: {
      policyName: "S3Access",
      policyDocument: '{"Statement":[{"Action":"s3:*"}]}',
    },
    isLoading: false,
  }),
  useAttachedRolePolicies: () => ({
    data: [
      {
        policyName: "AWSLambdaBasicExecutionRole",
        policyArn:
          "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole",
      },
    ],
    isLoading: false,
    refetch: vi.fn(),
  }),
  useRoleActions: () => ({
    deleteRole: mockDeleteRole,
    deleteRolePolicy: mockDeleteRolePolicy,
    putRolePolicy: vi.fn(),
    createRole: vi.fn(),
  }),
}));

describe("RoleView", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders role details and trust policy", () => {
    render(<RoleView roleName="TestRole" />);

    expect(screen.getByText("TestRole")).toBeInTheDocument();
    expect(
      screen.getByText("arn:aws:iam::000000000000:role/TestRole"),
    ).toBeInTheDocument();
    expect(screen.getByText("Trust Relationship")).toBeInTheDocument();
  });

  it("switches to inline policies tab and displays policies", async () => {
    const user = userEvent.setup();
    render(<RoleView roleName="TestRole" />);

    const inlineTab = screen.getByRole("tab", { name: /Inline Policies/ });
    await user.click(inlineTab);

    expect(screen.getAllByText("S3Access").length).toBeGreaterThan(0);
    expect(screen.getByText('"s3:*"')).toBeInTheDocument();
  });

  it("opens delete role confirmation and executes delete", async () => {
    mockDeleteRole.mockResolvedValueOnce(true);
    const closeTabSpy = vi.spyOn(useTabs.getState(), "closeTab");
    const user = userEvent.setup();

    render(<RoleView roleName="TestRole" />);

    const deleteBtn = screen.getByRole("button", { name: /Delete Role/ });
    await user.click(deleteBtn);

    expect(screen.getByText(/Are you sure you want to delete role "TestRole"/)).toBeInTheDocument();

    const confirmBtn = screen.getByRole("button", { name: "Delete" });
    await user.click(confirmBtn);

    expect(mockDeleteRole).toHaveBeenCalledWith("TestRole");
    expect(closeTabSpy).toHaveBeenCalledWith("iamRole:TestRole");
  });
});
