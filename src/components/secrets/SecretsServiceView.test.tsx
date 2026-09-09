import { describe, expect, it, vi, beforeEach } from "vitest";
import { fireEvent, screen, within } from "@testing-library/react";
import type { SecretsManagerClient } from "@aws-sdk/client-secrets-manager";
import { SecretsServiceView } from "./SecretsServiceView";
import { renderWithProviders } from "@/test/utils";
import { LOCAL_PROFILE_ID, localProfile, useProfiles } from "@/store/profiles";
import { useTabs } from "@/store/tabs";
import { createSecret, deleteSecret, type SecretSummary } from "@/lib/secrets";

vi.mock("@/lib/secrets", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/secrets")>();
  return {
    ...actual,
    createSecret: vi.fn().mockResolvedValue({
      name: "db-password",
      arn: "arn:aws:secretsmanager:us-east-1:000000000000:secret:db-password",
      versionId: "v1",
    }),
    deleteSecret: vi.fn().mockResolvedValue(undefined),
  };
});

const mockSend = vi.fn().mockResolvedValue({});
const mockClient = { send: mockSend } as unknown as SecretsManagerClient;

const demoSecret: SecretSummary = {
  name: "db-password",
  arn: "arn:aws:secretsmanager:us-east-1:000000000000:secret:db-password-AbCd",
  description: "Main database password",
  createdDate: new Date("2026-01-01T00:00:00Z"),
  lastChangedDate: new Date("2026-01-02T00:00:00Z"),
};

let currentSecrets: SecretSummary[] | undefined = [demoSecret];
let currentError: Error | null = null;

vi.mock("@/hooks/use-secrets", () => ({
  useSecretsClient: () => mockClient,
  useSecrets: () => ({
    data: currentSecrets,
    isPending: false,
    isFetching: false,
    error: currentError,
    refetch: vi.fn(),
  }),
  secretsKeys: {
    secrets: (id: string) => ["secrets", "secrets", id],
    versions: (id: string, name: string) => ["secrets", "versions", id, name],
  },
}));

describe("SecretsServiceView", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    currentSecrets = [demoSecret];
    currentError = null;
    useProfiles.setState({
      profiles: [{ ...localProfile(), region: "us-east-1" }],
      activeProfileId: LOCAL_PROFILE_ID,
    });
    useTabs.setState({
      tabs: [],
      activeTabId: null,
    });
  });

  it("renders rows with name, description, and created date", () => {
    renderWithProviders(<SecretsServiceView />);
    expect(screen.getByText("Secrets")).toBeInTheDocument();
    const row = screen.getByRole("row", { name: /db-password/i });
    expect(within(row).getByText("db-password")).toBeInTheDocument();
    expect(within(row).getByText("Main database password")).toBeInTheDocument();
  });

  it("validates secret name in create dialog and submits valid secret", async () => {
    renderWithProviders(<SecretsServiceView />);
    fireEvent.click(screen.getByRole("button", { name: /Create secret/i }));
    const dialog = screen.getByRole("dialog");
    expect(
      within(dialog).getByRole("heading", { name: "Create secret" }),
    ).toBeInTheDocument();

    const nameInput = within(dialog).getByLabelText(/Name/i);
    const valueInput = within(dialog).getByLabelText(/Value/i);
    const submitBtn = within(dialog).getByRole("button", {
      name: "Create secret",
    });

    expect(submitBtn).toBeDisabled();

    // Type invalid name
    fireEvent.change(nameInput, { target: { value: "invalid space!" } });
    expect(
      screen.getByText(/Letters, digits, and \/ _ \+ = \. @ -/),
    ).toBeInTheDocument();
    expect(submitBtn).toBeDisabled();

    // Type valid name and value
    fireEvent.change(nameInput, { target: { value: "db-password" } });
    expect(
      screen.queryByText(/Letters, digits, and \/ _ \+ = \. @ -/),
    ).not.toBeInTheDocument();
    fireEvent.change(valueInput, { target: { value: "hunter2" } });
    expect(submitBtn).not.toBeDisabled();

    fireEvent.click(submitBtn);

    expect(createSecret).toHaveBeenCalledWith(mockClient, {
      name: "db-password",
      secretString: "hunter2",
      description: undefined,
    });
  });

  it("deletes secret via row menu and confirm dialog", async () => {
    renderWithProviders(<SecretsServiceView />);
    const menuBtn = screen.getByRole("button", {
      name: "Actions for db-password",
    });
    fireEvent.keyDown(menuBtn, { key: "ArrowDown", code: "ArrowDown" });

    const deleteMenuItem = await screen.findByRole("menuitem", {
      name: /Delete secret/i,
    });
    fireEvent.click(deleteMenuItem);

    const confirmDialog = await screen.findByRole("dialog");
    const confirmBtn = within(confirmDialog).getByRole("button", {
      name: "Delete",
    });
    fireEvent.click(confirmBtn);

    expect(deleteSecret).toHaveBeenCalledWith(mockClient, "db-password");
  });

  it("opens secret tab when row is clicked", () => {
    renderWithProviders(<SecretsServiceView />);
    const row = screen.getByRole("row", { name: /db-password/i });
    fireEvent.click(row);

    const tabState = useTabs.getState();
    expect(tabState.tabs).toEqual([
      {
        id: "secret:db-password",
        kind: "secret",
        secretName: "db-password",
        title: "db-password",
      },
    ]);
  });

  it("renders ServiceDisabledView when secrets is disabled", () => {
    currentSecrets = undefined;
    currentError = new Error(
      "Service 'secrets' is not enabled. Check your 'SERVICES' configuration variable.",
    );

    renderWithProviders(<SecretsServiceView />);

    expect(screen.getByTestId("service-disabled-view")).toBeInTheDocument();
    expect(screen.getByText("Secrets Manager is turned off")).toBeInTheDocument();
  });
});
