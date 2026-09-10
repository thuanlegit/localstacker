import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { InlinePolicyDialog, validatePolicyDocument } from "./InlinePolicyDialog";

const mockPutRolePolicy = vi.fn();

vi.mock("@/hooks/use-iam", () => ({
  useRoleActions: () => ({
    putRolePolicy: mockPutRolePolicy,
  }),
}));

describe("InlinePolicyDialog", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("validatePolicyDocument", () => {
    it("flags empty document", () => {
      expect(validatePolicyDocument("")).toBe("Policy document cannot be empty");
    });

    it("flags malformed json", () => {
      expect(validatePolicyDocument("{ broken")).toBe("Invalid JSON format");
    });

    it("flags missing Statement", () => {
      expect(validatePolicyDocument('{"Version":"2012-10-17"}')).toBe(
        "Policy document must contain a 'Statement' block",
      );
    });

    it("accepts valid policy document with Statement array", () => {
      expect(
        validatePolicyDocument('{"Version":"2012-10-17","Statement":[]}'),
      ).toBeNull();
    });
  });

  it("renders dialog inputs and disables save on invalid policy", async () => {
    const user = userEvent.setup();
    render(
      <InlinePolicyDialog
        open={true}
        onOpenChange={vi.fn()}
        roleName="TestRole"
      />,
    );

    expect(screen.getByText("Add Inline Policy")).toBeInTheDocument();
    const nameInput = screen.getByLabelText("Policy Name");
    await user.type(nameInput, "ValidName");

    const saveBtn = screen.getByRole("button", { name: "Save Policy" });
    expect(saveBtn).toBeEnabled();

    // Corrupt the json in textarea
    const docInput = screen.getByLabelText(/Policy Document/);
    await user.clear(docInput);
    await user.type(docInput, "invalid");

    expect(saveBtn).toBeDisabled();
    expect(screen.getByText("Invalid JSON format")).toBeInTheDocument();
  });

  it("submits valid policy document", async () => {
    mockPutRolePolicy.mockResolvedValueOnce(true);
    const onSaved = vi.fn();
    const onOpenChange = vi.fn();
    const user = userEvent.setup();

    render(
      <InlinePolicyDialog
        open={true}
        onOpenChange={onOpenChange}
        roleName="TestRole"
        onSaved={onSaved}
      />,
    );

    const nameInput = screen.getByLabelText("Policy Name");
    await user.type(nameInput, "MyInlinePolicy");

    const saveBtn = screen.getByRole("button", { name: "Save Policy" });
    await user.click(saveBtn);

    expect(mockPutRolePolicy).toHaveBeenCalledWith(
      "TestRole",
      "MyInlinePolicy",
      expect.stringContaining("2012-10-17"),
    );
    expect(onSaved).toHaveBeenCalled();
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});
