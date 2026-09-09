import { describe, expect, it, vi, beforeEach } from "vitest";
import { fireEvent, screen, within } from "@testing-library/react";
import { SsmServiceView } from "./SsmServiceView";
import { renderWithProviders } from "@/test/utils";
import { LOCAL_PROFILE_ID, localProfile, useProfiles } from "@/store/profiles";
import { useTabs } from "@/store/tabs";
import type { ParameterSummary } from "@/lib/ssm";

const mockParams: ParameterSummary[] = [
  {
    name: "/app/db-url",
    type: "String",
    version: 1,
    lastModified: new Date("2026-01-01T00:00:00Z"),
  },
  {
    name: "/app/db-password",
    type: "SecureString",
    version: 2,
    lastModified: new Date("2026-01-01T00:00:00Z"),
  },
  {
    name: "/app/hosts",
    type: "StringList",
    version: 1,
    lastModified: new Date("2026-01-01T00:00:00Z"),
  },
];

const { mockState, mockPutParameter, mockDeleteParameter } = vi.hoisted(() => ({
  mockState: {
    serviceStatus: "available",
    params: [
      {
        name: "/app/db-url",
        type: "String",
        version: 1,
        lastModified: new Date("2026-01-01T00:00:00Z"),
      },
      {
        name: "/app/db-password",
        type: "SecureString",
        version: 2,
        lastModified: new Date("2026-01-01T00:00:00Z"),
      },
      {
        name: "/app/hosts",
        type: "StringList",
        version: 1,
        lastModified: new Date("2026-01-01T00:00:00Z"),
      },
    ] as ParameterSummary[] | undefined,
    error: null as Error | null,
    isPending: false,
  },
  mockPutParameter: vi.fn().mockResolvedValue(1),
  mockDeleteParameter: vi.fn().mockResolvedValue(true),
}));

vi.mock("@/hooks/use-health", () => ({
  useServiceStatus: () => mockState.serviceStatus,
  useHealth: () => ({ data: undefined, refetch: vi.fn() }),
  isServiceDisabledError: (err: unknown) =>
    err instanceof Error && err.message.includes("is not enabled"),
}));

vi.mock("@/hooks/use-ssm", () => ({
  useParameters: () => ({
    data: mockState.params,
    isPending: mockState.isPending,
    isFetching: false,
    error: mockState.error,
    refetch: vi.fn(),
  }),
  useParameterActions: () => ({
    putParameter: mockPutParameter,
    deleteParameter: mockDeleteParameter,
    getParameter: vi.fn(),
  }),
}));

describe("SsmServiceView", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockState.serviceStatus = "available";
    mockState.params = [...mockParams];
    mockState.error = null;
    mockState.isPending = false;
    useProfiles.setState({
      profiles: [{ ...localProfile(), region: "us-east-1" }],
      activeProfileId: LOCAL_PROFILE_ID,
    });
    useTabs.setState({ tabs: [], activeTabId: null });
  });

  it("renders flat table rows with type badges", () => {
    renderWithProviders(<SsmServiceView />);
    expect(screen.getByText("Parameter Store")).toBeInTheDocument();
    expect(screen.getByText("/app/db-url")).toBeInTheDocument();
    expect(screen.getByText("String")).toBeInTheDocument();
    expect(screen.getByText("/app/db-password")).toBeInTheDocument();
    expect(screen.getByText("SecureString")).toBeInTheDocument();
    expect(screen.getByText("/app/hosts")).toBeInTheDocument();
    expect(screen.getByText("StringList")).toBeInTheDocument();
  });

  it("toggles hierarchy view and renders folders and leaves", () => {
    renderWithProviders(<SsmServiceView />);
    const hierarchyBtn = screen.getByRole("button", { name: "Hierarchy" });
    fireEvent.click(hierarchyBtn);

    // Root folder app
    expect(screen.getByText("app")).toBeInTheDocument();
    // Default expanded includes "app" so children are visible
    expect(screen.getByText("db-url")).toBeInTheDocument();
    expect(screen.getByText("db-password")).toBeInTheDocument();
  });

  it("validates parameter name and creates new parameter", async () => {
    renderWithProviders(<SsmServiceView />);
    fireEvent.click(screen.getByRole("button", { name: /New parameter/i }));

    const dialog = screen.getByRole("dialog");
    expect(
      within(dialog).getByRole("heading", { name: "Create parameter" }),
    ).toBeInTheDocument();

    const nameInput = within(dialog).getByLabelText(/Parameter name/i);
    const valueInput = within(dialog).getByLabelText(/Value/i);
    const submitBtn = within(dialog).getByRole("button", {
      name: "Save parameter",
    });

    // Invalid name
    fireEvent.change(nameInput, { target: { value: "invalid name with space" } });
    fireEvent.change(valueInput, { target: { value: "val" } });
    expect(submitBtn).toBeDisabled();

    // Valid name
    fireEvent.change(nameInput, { target: { value: "/app/api-key" } });
    expect(submitBtn).not.toBeDisabled();

    fireEvent.click(submitBtn);
    expect(mockPutParameter).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "/app/api-key",
        value: "val",
        type: "String",
      }),
    );
  });

  it("deletes parameter via dropdown and closes tab", async () => {
    useTabs.setState({
      tabs: [
        {
          id: "parameter:/app/db-url",
          kind: "parameter",
          parameterName: "/app/db-url",
          title: "/app/db-url",
        },
      ],
      activeTabId: "parameter:/app/db-url",
    });

    renderWithProviders(<SsmServiceView />);
    const menuBtn = screen.getByRole("button", {
      name: "Actions for /app/db-url",
    });
    fireEvent.keyDown(menuBtn, { key: "ArrowDown", code: "ArrowDown" });

    const deleteMenuItem = await screen.findByRole("menuitem", {
      name: /Delete parameter/i,
    });
    fireEvent.click(deleteMenuItem);

    const confirmDialog = await screen.findByRole("dialog");
    expect(
      within(confirmDialog).getByText(/Are you sure you want to delete parameter/),
    ).toBeInTheDocument();

    const confirmBtn = within(confirmDialog).getByRole("button", {
      name: "Delete",
    });
    fireEvent.click(confirmBtn);

    expect(mockDeleteParameter).toHaveBeenCalledWith("/app/db-url");
  });
});
