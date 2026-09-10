import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CreateHostedZoneDialog } from "./CreateHostedZoneDialog";

const mockCreateHostedZone = vi.fn();

vi.mock("@/hooks/use-route53", () => ({
  useHostedZoneActions: () => ({
    createHostedZone: mockCreateHostedZone,
  }),
}));

describe("CreateHostedZoneDialog", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("validates domain and creates hosted zone", async () => {
    mockCreateHostedZone.mockResolvedValueOnce({
      id: "Z123",
      name: "example.local.",
    });
    const onCreated = vi.fn();
    const onOpenChange = vi.fn();
    const user = userEvent.setup();

    render(
      <CreateHostedZoneDialog
        open={true}
        onOpenChange={onOpenChange}
        onCreated={onCreated}
      />,
    );

    const nameInput = screen.getByLabelText("Domain Name");
    await user.type(nameInput, "example.local");

    const submitBtn = screen.getByRole("button", {
      name: "Create Hosted Zone",
    });
    await user.click(submitBtn);

    expect(mockCreateHostedZone).toHaveBeenCalledWith({
      name: "example.local",
      comment: undefined,
      privateZone: false,
    });
    expect(onCreated).toHaveBeenCalled();
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});
