import { describe, expect, it, vi, beforeEach } from "vitest";
import { fireEvent, screen } from "@testing-library/react";
import { TableView } from "./TableView";
import { renderWithProviders } from "@/test/utils";
import { LOCAL_PROFILE_ID, localProfile, useProfiles } from "@/store/profiles";
import type { TableDescription } from "@/lib/dynamodb";

const mockTable: TableDescription = {
  name: "test-table",
  arn: "arn:aws:dynamodb:us-east-1:000000000000:table/test-table",
  itemCount: 2,
  sizeBytes: 256,
  status: "ACTIVE",
  keySchema: [
    { name: "id", type: "S", role: "HASH" },
    { name: "timestamp", type: "N", role: "RANGE" },
  ],
  indexes: [
    {
      name: "status-gsi",
      kind: "GSI",
      keySchema: [{ name: "status", type: "S", role: "HASH" }],
    },
  ],
  attributeTypes: {
    id: "S",
    timestamp: "N",
    status: "S",
  },
};

const { mockHookState, mockSetMode, mockSetQueryInput, mockPutItem, mockDeleteItem, mockClearTable, mockItems } =
  vi.hoisted(() => {
    const mockItems = [
      { id: "item-1", timestamp: 100, name: "First" },
      { id: "item-2", timestamp: 200, name: "Second" },
    ];
    return {
      mockHookState: {
        mode: "scan" as "scan" | "query",
        queryInput: undefined as unknown,
        items: mockItems,
        isPending: false,
        isError: false,
        error: null,
        hasNextPage: false,
      },
      mockSetMode: vi.fn(),
      mockSetQueryInput: vi.fn(),
      mockPutItem: vi.fn().mockResolvedValue(true),
      mockDeleteItem: vi.fn().mockResolvedValue(true),
      mockClearTable: vi.fn().mockResolvedValue(true),
      mockItems,
    };
  });

vi.mock("@tanstack/react-virtual", () => ({
  useVirtualizer: (options: { count: number }) => ({
    getVirtualItems: () =>
      Array.from({ length: options.count }, (_, i) => ({
        index: i,
        start: i * 32,
        size: 32,
        key: i,
      })),
    getTotalSize: () => options.count * 32,
    measureElement: () => 32,
  }),
}));

vi.mock("@/hooks/use-dynamodb", () => ({
  useTable: () => ({
    data: mockTable,
    isPending: false,
    error: null,
    refetch: vi.fn(),
  }),
  useTableItems: () => ({
    items: mockHookState.items,
    mode: mockHookState.mode,
    setMode: mockSetMode,
    queryInput: mockHookState.queryInput,
    setQueryInput: mockSetQueryInput,
    loadMore: vi.fn(),
    hasNextPage: mockHookState.hasNextPage,
    isFetchingNextPage: false,
    isPending: mockHookState.isPending,
    isError: mockHookState.isError,
    error: mockHookState.error,
    refetch: vi.fn(),
  }),
  useItemActions: () => ({
    putItem: mockPutItem,
    deleteItem: mockDeleteItem,
    clearTable: mockClearTable,
  }),
}));

describe("TableView", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockHookState.mode = "scan";
    mockHookState.items = mockItems;
    useProfiles.setState({
      profiles: [{ ...localProfile(), region: "us-east-1" }],
      activeProfileId: LOCAL_PROFILE_ID,
    });
  });

  it("renders header and key schema panel from useTable", () => {
    renderWithProviders(<TableView tableName="test-table" />);
    expect(screen.getByText("test-table")).toBeInTheDocument();
    expect(screen.getByText("ACTIVE")).toBeInTheDocument();
    expect(screen.getByText(/2 items/)).toBeInTheDocument();
    expect(screen.getByText("id (S) • HASH")).toBeInTheDocument();
    expect(screen.getByText("timestamp (N) • RANGE")).toBeInTheDocument();
    expect(screen.getByText("status-gsi (GSI)")).toBeInTheDocument();
  });

  it("renders scanned rows in item grid", () => {
    renderWithProviders(<TableView tableName="test-table" />);
    expect(screen.getByText("item-1")).toBeInTheDocument();
    expect(screen.getByText("100")).toBeInTheDocument();
    expect(screen.getByText("item-2")).toBeInTheDocument();
    expect(screen.getByText("200")).toBeInTheDocument();
  });

  it("drives mode switch and query form to setMode and setQueryInput", () => {
    renderWithProviders(<TableView tableName="test-table" />);
    const queryBtn = screen.getByRole("button", { name: "Query" });
    fireEvent.click(queryBtn);

    expect(mockSetMode).toHaveBeenCalledWith("query");
    // Simulate mode becoming query
    mockHookState.mode = "query";
    renderWithProviders(<TableView tableName="test-table" />);

    const pkInput = screen.getByPlaceholderText("Partition value");
    fireEvent.change(pkInput, { target: { value: "item-1" } });

    const skInput = screen.getByPlaceholderText("Sort value");
    fireEvent.change(skInput, { target: { value: "100" } });

    const runBtn = screen.getByRole("button", { name: /Run query/i });
    fireEvent.click(runBtn);

    expect(mockSetQueryInput).toHaveBeenCalledWith(
      expect.objectContaining({
        partitionKeyName: "id",
        partitionValue: "item-1",
        sortKeyName: "timestamp",
        sortOp: "eq",
        sortValue: "100",
      }),
    );
  });

  it("opens inspector panel on row click showing item JSON", () => {
    renderWithProviders(<TableView tableName="test-table" />);
    fireEvent.click(screen.getByText("item-1"));

    expect(screen.getByText("Item Details")).toBeInTheDocument();
    expect(screen.getByText(/"id": "item-1"/)).toBeInTheDocument();
    expect(screen.getByText(/"name": "First"/)).toBeInTheDocument();
  });

  it("validates JSON and required keys in Add item dialog", async () => {
    renderWithProviders(<TableView tableName="test-table" />);
    fireEvent.click(screen.getByRole("button", { name: /Add item/i }));

    expect(screen.getByText("Add new item")).toBeInTheDocument();
    const textarea = screen.getByLabelText(/Item JSON/i);
    const saveBtn = screen.getByRole("button", { name: /Save item/i });

    // Invalid JSON
    fireEvent.change(textarea, { target: { value: "{ not valid json" } });
    fireEvent.click(saveBtn);
    expect(screen.getByText("Invalid JSON format")).toBeInTheDocument();
    expect(mockPutItem).not.toHaveBeenCalled();

    // Missing required partition key "id"
    fireEvent.change(textarea, { target: { value: '{"timestamp": 123}' } });
    fireEvent.click(saveBtn);
    expect(screen.getByText('Missing required key attribute: "id"')).toBeInTheDocument();
    expect(mockPutItem).not.toHaveBeenCalled();

    // Valid item
    fireEvent.change(textarea, {
      target: { value: '{"id": "new-1", "timestamp": 123, "val": "hello"}' },
    });
    fireEvent.click(saveBtn);
    expect(mockPutItem).toHaveBeenCalledWith({
      id: "new-1",
      timestamp: 123,
      val: "hello",
    });
  });
});
