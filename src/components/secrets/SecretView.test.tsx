import { describe, expect, it, vi, beforeEach } from "vitest";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import type { SecretsManagerClient } from "@aws-sdk/client-secrets-manager";
import { SecretView } from "./SecretView";
import { renderWithProviders } from "@/test/utils";
import { LOCAL_PROFILE_ID, localProfile, useProfiles } from "@/store/profiles";
import { useTabs } from "@/store/tabs";
import {
  getSecretValue,
  putSecretValue,
  deleteSecret,
  type SecretSummary,
  type SecretVersion,
} from "@/lib/secrets";

vi.mock("@/lib/secrets", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/secrets")>();
  return {
    ...actual,
    getSecretValue: vi.fn().mockResolvedValue({
      name: "db-password",
      versionId: "v1",
      secretString: '{"host":"localhost","port":5432}',
      createdDate: new Date("2026-01-01T00:00:00Z"),
    }),
    putSecretValue: vi.fn().mockResolvedValue({
      versionId: "v2",
      versionStages: ["AWSCURRENT"],
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

const demoVersions: SecretVersion[] = [
  {
    versionId: "v2",
    createdDate: new Date("2026-01-02T00:00:00Z"),
    stages: ["AWSCURRENT"],
  },
  {
    versionId: "v1",
    createdDate: new Date("2026-01-01T00:00:00Z"),
    stages: ["AWSPREVIOUS"],
  },
];

let currentSecrets: SecretSummary[] = [demoSecret];
let currentVersions: SecretVersion[] = demoVersions;

vi.mock("@/hooks/use-secrets", () => ({
  useSecretsClient: () => mockClient,
  useSecrets: () => ({
    data: currentSecrets,
    isPending: false,
    isFetching: false,
    error: null,
    refetch: vi.fn(),
  }),
  useSecretVersions: () => ({
    data: currentVersions,
    isPending: false,
    isFetching: false,
    error: null,
    refetch: vi.fn(),
  }),
  secretsKeys: {
    secrets: (id: string) => ["secrets", "secrets", id],
    versions: (id: string, name: string) => ["secrets", "versions", id, name],
  },
}));

describe("SecretView", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    currentSecrets = [demoSecret];
    currentVersions = demoVersions;
    useProfiles.setState({
      profiles: [{ ...localProfile(), region: "us-east-1" }],
      activeProfileId: LOCAL_PROFILE_ID,
    });
    useTabs.setState({
      tabs: [{ id: "secret:db-password", kind: "secret", secretName: "db-password", title: "db-password" }],
      activeTabId: "secret:db-password",
    });

    Object.assign(navigator, {
      clipboard: {
        writeText: vi.fn().mockResolvedValue(undefined),
      },
    });
  });

  it("renders secret metadata, header actions, and hidden value state", () => {
    renderWithProviders(<SecretView secretName="db-password" />);
    expect(screen.getByRole("heading", { name: "db-password" })).toBeInTheDocument();
    expect(screen.getByText("Main database password")).toBeInTheDocument();
    expect(screen.getByText(/secret:db-password-AbCd/)).toBeInTheDocument();
    expect(screen.getByText("Value is hidden. Click Reveal value to inspect.")).toBeInTheDocument();
  });

  it("reveals secret value, formats JSON, allows copy, and allows hiding", async () => {
    renderWithProviders(<SecretView secretName="db-password" />);
    const revealBtn = screen.getByRole("button", { name: /Reveal value/i });
    fireEvent.click(revealBtn);

    expect(getSecretValue).toHaveBeenCalledWith(mockClient, {
      secretId: "db-password",
      versionId: undefined,
    });

    const pre = await screen.findByText(/\"host\": \"localhost\"/);
    expect(pre).toBeInTheDocument();

    // Copy
    const copyBtn = screen.getByRole("button", { name: /Copy/i });
    fireEvent.click(copyBtn);
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
      JSON.stringify({ host: "localhost", port: 5432 }, null, 2),
    );

    // Hide
    const hideBtn = screen.getByRole("button", { name: /Hide/i });
    fireEvent.click(hideBtn);
    expect(
      screen.getByText("Value is hidden. Click Reveal value to inspect."),
    ).toBeInTheDocument();
  });

  it("renders versions table and allows revealing a specific version", async () => {
    renderWithProviders(<SecretView secretName="db-password" />);
    expect(screen.getByText("v2")).toBeInTheDocument();
    expect(screen.getByText("AWSCURRENT")).toBeInTheDocument();
    expect(screen.getByText("v1")).toBeInTheDocument();
    expect(screen.getByText("AWSPREVIOUS")).toBeInTheDocument();

    const revealRowBtns = screen.getAllByRole("button", { name: "Reveal" });
    fireEvent.click(revealRowBtns[1]); // Reveal v1

    expect(getSecretValue).toHaveBeenCalledWith(mockClient, {
      secretId: "db-password",
      versionId: "v1",
    });
  });

  it("updates secret value through update dialog", async () => {
    renderWithProviders(<SecretView secretName="db-password" />);
    const updateBtn = screen.getByRole("button", { name: /Update value/i });
    fireEvent.click(updateBtn);

    const dialog = await screen.findByRole("dialog");
    expect(
      within(dialog).getByRole("heading", { name: "Update secret value" }),
    ).toBeInTheDocument();

    const textarea = within(dialog).getByLabelText(/Value/i);
    fireEvent.change(textarea, { target: { value: "new-super-secret" } });

    const submitBtn = within(dialog).getByRole("button", {
      name: "Update value",
    });
    fireEvent.click(submitBtn);

    expect(putSecretValue).toHaveBeenCalledWith(mockClient, {
      secretId: "db-password",
      secretString: "new-super-secret",
    });
  });

  it("deletes secret and closes tab", async () => {
    renderWithProviders(<SecretView secretName="db-password" />);
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
    await waitFor(() => {
      expect(useTabs.getState().tabs).toHaveLength(0);
    });
  });
});
