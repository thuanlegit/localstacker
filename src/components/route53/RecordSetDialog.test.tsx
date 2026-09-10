import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { RecordSetDialog } from "./RecordSetDialog";

const mockCreateRecordSet = vi.fn();
const mockUpdateRecordSet = vi.fn();

vi.mock("@/hooks/use-route53", () => ({
  useRecordSetActions: () => ({
    createRecordSet: mockCreateRecordSet,
    updateRecordSet: mockUpdateRecordSet,
  }),
}));

describe("RecordSetDialog", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("validates IP address for A record and creates record", async () => {
    mockCreateRecordSet.mockResolvedValueOnce(true);
    const onSaved = vi.fn();
    const onOpenChange = vi.fn();
    const user = userEvent.setup();

    render(
      <RecordSetDialog
        open={true}
        onOpenChange={onOpenChange}
        zoneId="Z123"
        zoneName="example.local."
        onSaved={onSaved}
      />,
    );

    const nameInput = screen.getByLabelText("Record Name");
    await user.type(nameInput, "api");

    const valuesInput = screen.getByLabelText(/Routing Values/);
    await user.type(valuesInput, "192.0.2.42");

    const saveBtn = screen.getByRole("button", { name: "Create Record" });
    await user.click(saveBtn);

    expect(mockCreateRecordSet).toHaveBeenCalledWith({
      name: "api.example.local.",
      type: "A",
      ttl: 300,
      values: ["192.0.2.42"],
    });
    expect(onSaved).toHaveBeenCalled();
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("updates existing record in edit mode", async () => {
    mockUpdateRecordSet.mockResolvedValueOnce(true);
    const user = userEvent.setup();

    render(
      <RecordSetDialog
        open={true}
        onOpenChange={vi.fn()}
        zoneId="Z123"
        zoneName="example.local."
        initialRecord={{
          name: "api.example.local.",
          type: "A",
          ttl: 300,
          values: ["192.0.2.42"],
        }}
      />,
    );

    expect(screen.getByText(/Edit Record Set/)).toBeInTheDocument();

    const ttlInput = screen.getByLabelText(/TTL/);
    await user.clear(ttlInput);
    await user.type(ttlInput, "60");

    const saveBtn = screen.getByRole("button", { name: "Update Record" });
    await user.click(saveBtn);

    expect(mockUpdateRecordSet).toHaveBeenCalledWith({
      name: "api.example.local.",
      type: "A",
      ttl: 60,
      values: ["192.0.2.42"],
    });
  });
});
