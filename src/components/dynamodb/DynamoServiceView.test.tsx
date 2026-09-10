import { describe, expect, it, vi, beforeEach } from "vitest";
import { fireEvent, screen, within } from "@testing-library/react";
import { DynamoServiceView } from "./DynamoServiceView";
import { renderWithProviders } from "@/test/utils";
import { LOCAL_PROFILE_ID, localProfile, useProfiles } from "@/store/profiles";
import { useTabs } from "@/store/tabs";

const { mockState, mockRefetch, mockCreateTable, mockDeleteTable } = vi.hoisted(
  () => ({
    mockState: {
      serviceStatus: "available",
      tables: ["users", "orders"] as string[] | undefined,
      error: null as Error | null,
      isPending: false,
    },
    mockRefetch: vi.fn(),
    mockCreateTable: vi.fn(),
    mockDeleteTable: vi.fn(),
  }),
);

vi.mock("@/hooks/use-health", () => ({
  useServiceStatus: () => mockState.serviceStatus,
  useHealth: () => ({ data: undefined, refetch: vi.fn() }),
  isServiceDisabledError: (err: unknown) =>
    err instanceof Error && err.message.includes("is not enabled"),
}));

vi.mock("@/hooks/use-dynamodb", () => ({
  useTables: () => ({
    data: mockState.tables,
    isPending: mockState.isPending,
    isFetching: false,
    error: mockState.error,
    refetch: mockRefetch,
  }),
  useTableActions: () => ({
    createTable: mockCreateTable,
    deleteTable: mockDeleteTable,
  }),
}));

describe("DynamoServiceView", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockState.serviceStatus = "available";
    mockState.tables = ["users", "orders"];
    mockState.error = null;
    mockState.isPending = false;
    useProfiles.setState({
      profiles: [{ ...localProfile(), region: "us-east-1" }],
      activeProfileId: LOCAL_PROFILE_ID,
    });
    useTabs.setState({ tabs: [], activeTabId: null });

    Object.assign(navigator, {
      clipboard: {
        writeText: vi.fn().mockResolvedValue(undefined),
      },
    });
  });

  it("renders table names in the list", () => {
    renderWithProviders(<DynamoServiceView />);
    expect(screen.getByText("DynamoDB")).toBeInTheDocument();
    expect(screen.getByText("users")).toBeInTheDocument();
    expect(screen.getByText("orders")).toBeInTheDocument();
  });

  it("renders disabled guard when service is disabled", () => {
    mockState.serviceStatus = "disabled";
    renderWithProviders(<DynamoServiceView />);
    expect(screen.getByTestId("service-disabled-view")).toBeInTheDocument();
    expect(screen.getByText("DynamoDB is turned off")).toBeInTheDocument();
  });

  it("opens a table tab on row click", () => {
    renderWithProviders(<DynamoServiceView />);
    fireEvent.click(screen.getByText("users"));

    const tabs = useTabs.getState().tabs;
    expect(tabs).toHaveLength(1);
    expect(tabs[0]).toEqual({
      id: "table:users",
      kind: "table",
      tableName: "users",
      title: "users",
    });
  });

  it("renders empty state with friendly guide card and copyable snippets", () => {
    mockState.tables = [];
    renderWithProviders(<DynamoServiceView />);
    expect(screen.getByText("No DynamoDB tables")).toBeInTheDocument();
    expect(
      screen.getByText(/Create your first table in LocalStacker or provision via CLI\/SDK/i),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /quick demo table/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /copy snippet/i })).toBeInTheDocument();
  });

  it("opens create table dialog from header button", () => {
    renderWithProviders(<DynamoServiceView />);
    fireEvent.click(screen.getByRole("button", { name: /create table/i }));
    expect(screen.getByRole("heading", { name: "Create DynamoDB table" })).toBeInTheDocument();
  });

  it("opens guide dialog from header button", () => {
    renderWithProviders(<DynamoServiceView />);
    fireEvent.click(screen.getByRole("button", { name: /guide/i }));
    expect(screen.getByText("DynamoDB Setup & Usage Guide")).toBeInTheDocument();
  });

  it("renders error state and handles retry", () => {
    mockState.error = new Error("Connection failed");
    mockState.tables = undefined;
    renderWithProviders(<DynamoServiceView />);
    expect(screen.getByText("Failed to load DynamoDB tables")).toBeInTheDocument();
    expect(screen.getByText("Connection failed")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /retry/i }));
    expect(mockRefetch).toHaveBeenCalledTimes(1);
  });

  it("deletes table through actions menu and confirmation dialog", async () => {
    mockDeleteTable.mockResolvedValueOnce(true);
    renderWithProviders(<DynamoServiceView />);

    // Open actions dropdown via ArrowDown keydown (Radix Dropdown in jsdom)
    const actionBtn = screen.getByRole("button", { name: "Actions for users" });
    fireEvent.keyDown(actionBtn, { key: "ArrowDown", code: "ArrowDown" });
    // Click delete menu item
    const deleteItem = await screen.findByRole("menuitem", {
      name: /Delete table/i,
    });
    fireEvent.click(deleteItem);

    // Confirm dialog should appear
    const confirmDialog = await screen.findByRole("dialog");
    expect(
      within(confirmDialog).getByText(
        /Are you sure you want to delete table "users"/i,
      ),
    ).toBeInTheDocument();

    // Confirm deletion
    const confirmBtn = within(confirmDialog).getByRole("button", {
      name: /^delete table$/i,
    });
    fireEvent.click(confirmBtn);
    expect(mockDeleteTable).toHaveBeenCalledWith("users");
  });
});
