import { describe, expect, it, vi, beforeEach } from "vitest";
import { fireEvent, screen } from "@testing-library/react";
import { CreateTableDialog } from "./CreateTableDialog";
import { renderWithProviders } from "@/test/utils";

const mockCreateTable = vi.fn();

vi.mock("@/hooks/use-dynamodb", () => ({
  useTableActions: () => ({
    createTable: mockCreateTable,
    deleteTable: vi.fn(),
  }),
}));

describe("CreateTableDialog", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders form fields when open", () => {
    renderWithProviders(
      <CreateTableDialog open={true} onOpenChange={vi.fn()} />,
    );

    expect(screen.getByRole("heading", { name: "Create DynamoDB table" })).toBeInTheDocument();
    expect(screen.getByLabelText(/table name/i)).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/attribute name/i)).toBeInTheDocument();
  });

  it("submits table with partition key and closes dialog", async () => {
    mockCreateTable.mockResolvedValueOnce({ arn: "arn:aws:dynamodb:..." });
    const onOpenChange = vi.fn();
    const onCreated = vi.fn();

    renderWithProviders(
      <CreateTableDialog
        open={true}
        onOpenChange={onOpenChange}
        onCreated={onCreated}
      />,
    );

    fireEvent.change(screen.getByLabelText(/table name/i), {
      target: { value: "users" },
    });
    fireEvent.change(screen.getByPlaceholderText(/attribute name/i), {
      target: { value: "id" },
    });

    fireEvent.click(screen.getByRole("button", { name: /create table/i }));

    expect(mockCreateTable).toHaveBeenCalledWith({
      name: "users",
      partitionKey: { name: "id", type: "S" },
      sortKey: undefined,
    });
  });

  it("applies demo template when clicked", () => {
    renderWithProviders(
      <CreateTableDialog open={true} onOpenChange={vi.fn()} />,
    );

    fireEvent.click(screen.getByRole("button", { name: /fill sample/i }));

    expect(screen.getByLabelText(/table name/i)).toHaveValue("demo-users");
    expect(screen.getByPlaceholderText(/attribute name/i)).toHaveValue("id");
    expect(screen.getByLabelText(/add sort key/i)).toBeChecked();
    expect(screen.getByPlaceholderText(/e\.g\. created_at/i)).toHaveValue("created_at");
  });
});
