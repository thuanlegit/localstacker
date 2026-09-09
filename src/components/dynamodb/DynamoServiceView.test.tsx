import { describe, expect, it, vi, beforeEach } from "vitest";
import { fireEvent, screen } from "@testing-library/react";
import { DynamoServiceView } from "./DynamoServiceView";
import { renderWithProviders } from "@/test/utils";
import { LOCAL_PROFILE_ID, localProfile, useProfiles } from "@/store/profiles";
import { useTabs } from "@/store/tabs";

const { mockState, mockRefetch } = vi.hoisted(() => ({
  mockState: {
    serviceStatus: "available",
    tables: ["users", "orders"] as string[] | undefined,
    error: null as Error | null,
    isPending: false,
  },
  mockRefetch: vi.fn(),
}));

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

  it("renders empty state when no tables exist", () => {
    mockState.tables = [];
    renderWithProviders(<DynamoServiceView />);
    expect(screen.getByText("No DynamoDB tables")).toBeInTheDocument();
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
});
