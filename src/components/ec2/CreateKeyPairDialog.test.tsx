import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CreateKeyPairDialog } from "./CreateKeyPairDialog";

const mockCreateKeyPair = vi.fn();

vi.mock("@/hooks/use-ec2", () => ({
  useKeyPairActions: () => ({
    createKeyPair: mockCreateKeyPair,
  }),
}));

describe("CreateKeyPairDialog", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Mock URL object methods for download
    vi.stubGlobal("URL", {
      createObjectURL: vi.fn(() => "blob:http://localhost/test"),
      revokeObjectURL: vi.fn(),
    });
  });

  it("renders form fields and validates key name", () => {
    render(<CreateKeyPairDialog open={true} onOpenChange={vi.fn()} />);

    expect(
      screen.getByRole("heading", { name: /Create SSH Key Pair/i }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText(/Key Pair Name/i)).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Create Key Pair" }),
    ).toBeDisabled();
  });

  it("creates key pair, triggers download, and notifies onCreated", async () => {
    mockCreateKeyPair.mockResolvedValueOnce({
      keyPairId: "key-1234",
      keyName: "prod-bastion",
      keyFingerprint: "aa:bb:cc",
      keyMaterial: "-----BEGIN RSA PRIVATE KEY-----\nMIIE...\n-----END RSA PRIVATE KEY-----",
    });

    const onCreated = vi.fn();
    const onOpenChange = vi.fn();
    const user = userEvent.setup();

    render(
      <CreateKeyPairDialog
        open={true}
        onOpenChange={onOpenChange}
        onCreated={onCreated}
      />,
    );

    const nameInput = screen.getByLabelText(/Key Pair Name/i);
    await user.type(nameInput, "prod-bastion");

    const submitBtn = screen.getByRole("button", { name: "Create Key Pair" });
    expect(submitBtn).toBeEnabled();
    await user.click(submitBtn);

    expect(mockCreateKeyPair).toHaveBeenCalledWith({
      keyName: "prod-bastion",
      keyType: "rsa",
    });
    expect(URL.createObjectURL).toHaveBeenCalled();
    expect(URL.revokeObjectURL).toHaveBeenCalled();
    expect(onCreated).toHaveBeenCalledWith(
      expect.objectContaining({
        keyName: "prod-bastion",
      }),
    );
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});
