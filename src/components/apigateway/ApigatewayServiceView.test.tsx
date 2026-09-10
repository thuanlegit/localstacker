import { describe, expect, it, vi, beforeEach } from "vitest";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { ApigatewayServiceView } from "./ApigatewayServiceView";
import { renderWithProviders } from "@/test/utils";
import { LOCAL_PROFILE_ID, localProfile, useProfiles } from "@/store/profiles";
import { useTabs } from "@/store/tabs";
import type { RestApiSummary } from "@/lib/apigateway";

const mockApis: RestApiSummary[] = [
  {
    id: "api-1",
    name: "orders-api",
    createdDate: "2026-01-01T00:00:00.000Z",
  },
  {
    id: "api-2",
    name: "users-api",
    createdDate: "2026-01-02T00:00:00.000Z",
  },
];

const { mockState, mockCreateApi, mockDeleteApi } = vi.hoisted(() => ({
  mockState: {
    serviceStatus: "available" as string,
    apis: undefined as RestApiSummary[] | undefined,
    error: null as Error | null,
  },
  mockCreateApi: vi.fn().mockResolvedValue({
    id: "api-3",
    name: "new-api",
    createdDate: "2026-01-03T00:00:00.000Z",
  }),
  mockDeleteApi: vi.fn().mockResolvedValue(true),
}));

vi.mock("@/hooks/use-health", () => ({
  useServiceStatus: () => mockState.serviceStatus,
  useHealth: () => ({ data: undefined, refetch: vi.fn() }),
  isServiceDisabledError: (err: unknown) =>
    err instanceof Error && err.message.includes("is not enabled"),
}));

vi.mock("@/hooks/use-apigateway", () => ({
  useRestApis: () => ({
    data: mockState.apis,
    isPending: false,
    isFetching: false,
    error: mockState.error,
    refetch: vi.fn(),
  }),
  useRestApiActions: () => ({
    createRestApi: mockCreateApi,
    deleteRestApi: mockDeleteApi,
  }),
}));

describe("ApigatewayServiceView", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockState.serviceStatus = "available";
    mockState.apis = [...mockApis];
    mockState.error = null;
    useProfiles.setState({
      profiles: [{ ...localProfile(), region: "us-east-1" }],
      activeProfileId: LOCAL_PROFILE_ID,
    });
    useTabs.setState({ tabs: [], activeTabId: null });
  });

  it("renders REST APIs table with names and IDs", () => {
    renderWithProviders(<ApigatewayServiceView />);
    expect(screen.getByText("API Gateway")).toBeInTheDocument();
    expect(screen.getByText("orders-api")).toBeInTheDocument();
    expect(screen.getByText("api-1")).toBeInTheDocument();
    expect(screen.getByText("users-api")).toBeInTheDocument();
    expect(screen.getByText("api-2")).toBeInTheDocument();
  });

  it("renders ServiceDisabledView when service is disabled", () => {
    mockState.serviceStatus = "disabled";
    renderWithProviders(<ApigatewayServiceView />);
    expect(screen.getByText(/API Gateway is turned off/i)).toBeInTheDocument();
  });

  it("validates API name and creates API", async () => {
    renderWithProviders(<ApigatewayServiceView />);
    fireEvent.click(screen.getByRole("button", { name: /Create API/i }));

    const dialog = screen.getByRole("dialog");
    const nameInput = within(dialog).getByLabelText(/API name/i);
    const submitBtn = within(dialog).getByRole("button", {
      name: "Create API",
    });

    fireEvent.change(nameInput, { target: { value: "   " } });
    expect(submitBtn).toBeDisabled();

    fireEvent.change(nameInput, { target: { value: "new-api" } });
    expect(submitBtn).not.toBeDisabled();

    fireEvent.click(submitBtn);
    await waitFor(() => expect(mockCreateApi).toHaveBeenCalledWith("new-api"));
    await waitFor(() =>
      expect(useTabs.getState().tabs.map((t) => t.id)).toEqual([
        "restApi:api-3",
      ]),
    );
  });

  it("opens a restApi tab on row click", () => {
    renderWithProviders(<ApigatewayServiceView />);
    fireEvent.click(screen.getByText("orders-api"));
    expect(useTabs.getState().tabs).toEqual([
      {
        id: "restApi:api-1",
        kind: "restApi",
        restApiId: "api-1",
        title: "orders-api",
      },
    ]);
  });

  it("deletes an API via confirmation dialog", async () => {
    renderWithProviders(<ApigatewayServiceView />);

    const actionBtn = screen.getByRole("button", {
      name: "Actions for orders-api",
    });
    fireEvent.keyDown(actionBtn, { key: "ArrowDown", code: "ArrowDown" });
    const deleteItem = await screen.findByRole("menuitem", {
      name: /Delete API/i,
    });
    fireEvent.click(deleteItem);

    const confirmDialog = await screen.findByRole("dialog");
    expect(
      within(confirmDialog).getByText(
        /Are you sure you want to delete "orders-api"/,
      ),
    ).toBeInTheDocument();

    fireEvent.click(
      within(confirmDialog).getByRole("button", { name: "Delete API" }),
    );
    await waitFor(() => expect(mockDeleteApi).toHaveBeenCalledWith("api-1"));
  });
});
