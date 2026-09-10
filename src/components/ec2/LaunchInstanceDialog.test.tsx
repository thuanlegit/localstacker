import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { LaunchInstanceDialog } from "./LaunchInstanceDialog";
import type { InstanceSummary } from "@/lib/ec2";

const mockLaunchInstance = vi.fn();

vi.mock("@/hooks/use-ec2", () => ({
  useInstanceActions: () => ({
    launchInstance: mockLaunchInstance,
  }),
  useKeyPairs: () => ({
    data: [{ keyName: "dev-key" }],
  }),
  useSecurityGroups: () => ({
    data: [{ groupId: "sg-123", groupName: "web-sg" }],
  }),
}));

describe("LaunchInstanceDialog", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders modal form fields when open", () => {
    render(
      <LaunchInstanceDialog
        open={true}
        onOpenChange={vi.fn()}
      />,
    );

    expect(screen.getByRole("heading", { name: "Launch Mock Instance" })).toBeInTheDocument();
    expect(screen.getByLabelText(/Name tag/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/AMI ID/i)).toHaveValue("ami-12345678");
    expect(screen.getByLabelText(/Count/i)).toHaveValue(1);
    expect(screen.getByRole("button", { name: "Launch Instance" })).toBeEnabled();
  });

  it("submits form and calls launchInstance with typed input", async () => {
    const mockInstance: InstanceSummary = {
      instanceId: "i-0abc123",
      name: "web-app",
      state: "pending",
      instanceType: "t2.micro",
      securityGroups: [],
      tags: { Name: "web-app" },
    };
    mockLaunchInstance.mockResolvedValueOnce(mockInstance);

    const onLaunched = vi.fn();
    const onOpenChange = vi.fn();
    const user = userEvent.setup();

    render(
      <LaunchInstanceDialog
        open={true}
        onOpenChange={onOpenChange}
        onLaunched={onLaunched}
      />,
    );

    const nameInput = screen.getByLabelText(/Name tag/i);
    await user.type(nameInput, "web-app");

    const submitBtn = screen.getByRole("button", { name: "Launch Instance" });
    await user.click(submitBtn);

    expect(mockLaunchInstance).toHaveBeenCalledWith({
      name: "web-app",
      instanceType: "t2.micro",
      keyName: undefined,
      securityGroupIds: undefined,
      imageId: "ami-12345678",
      minCount: 1,
      maxCount: 1,
    });
    expect(onLaunched).toHaveBeenCalledWith(mockInstance);
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("disables submit button when count is invalid", async () => {
    const user = userEvent.setup();
    render(
      <LaunchInstanceDialog
        open={true}
        onOpenChange={vi.fn()}
      />,
    );

    const countInput = screen.getByLabelText(/Count/i);
    await user.clear(countInput);
    await user.type(countInput, "0");

    expect(screen.getByRole("button", { name: "Launch Instance" })).toBeDisabled();
  });
});
