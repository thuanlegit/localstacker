import { describe, expect, it, vi, beforeEach } from "vitest";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { KmsServiceView } from "./KmsServiceView";
import { KeyView } from "./KeyView";
import { renderWithProviders } from "@/test/utils";
import { LOCAL_PROFILE_ID, localProfile, useProfiles } from "@/store/profiles";
import { useTabs } from "@/store/tabs";

const { mockState, mockCreateKey, mockCreateAlias, mockDeleteAlias, mockEncrypt, mockDecrypt } =
  vi.hoisted(() => ({
    mockState: {
      serviceStatus: "available" as string,
      keys: [
        { keyId: "k1", arn: "arn:aws:kms:us-east-1:000000000000:key/k1" },
        { keyId: "k2", arn: "arn:aws:kms:us-east-1:000000000000:key/k2" },
      ] as { keyId: string; arn: string }[] | undefined,
      aliases: [{ name: "alias/orders", targetKeyId: "k1" }] as
        | { name: string; targetKeyId: string }[]
        | undefined,
      detail: {
        keyId: "k1",
        arn: "arn:aws:kms:us-east-1:000000000000:key/k1",
        description: "orders key",
        state: "Enabled",
        usage: "ENCRYPT_DECRYPT",
        spec: "SYMMETRIC_DEFAULT",
        creationDate: new Date("2026-01-01T00:00:00Z"),
        manager: "CUSTOMER",
        enabled: true,
      } as Record<string, unknown> | undefined,
      rotation: true,
      policy: '{"Version":"2012-10-17"}',
      error: null as Error | null,
      isPending: false,
    },
    mockCreateKey: vi.fn().mockResolvedValue("k3"),
    mockCreateAlias: vi.fn().mockResolvedValue(true),
    mockDeleteAlias: vi.fn().mockResolvedValue(true),
    mockEncrypt: vi.fn().mockResolvedValue("Y2lwaGVy"),
    mockDecrypt: vi.fn().mockResolvedValue("secret-hello"),
  }));

vi.mock("@/hooks/use-health", () => ({
  useServiceStatus: () => mockState.serviceStatus,
  useHealth: () => ({ data: undefined, refetch: vi.fn() }),
  isServiceDisabledError: (err: unknown) =>
    err instanceof Error && err.message.includes("is not enabled"),
}));

vi.mock("@/hooks/use-kms", () => ({
  useKmsKeys: () => ({
    data: mockState.keys,
    isPending: mockState.isPending,
    isFetching: false,
    error: mockState.error,
    refetch: vi.fn(),
  }),
  useKeyDetail: () => ({
    data: mockState.detail,
    isPending: false,
    isFetching: false,
    error: null,
    refetch: vi.fn(),
  }),
  useKeyRotation: () => ({ data: mockState.rotation }),
  useKeyPolicy: () => ({
    data: mockState.policy,
    isPending: false,
    refetch: vi.fn(),
  }),
  useKmsAliases: () => ({
    data: mockState.aliases,
    isPending: false,
    isFetching: false,
    error: null,
    refetch: vi.fn(),
  }),
  useKmsActions: () => ({
    createKey: mockCreateKey,
    createAlias: mockCreateAlias,
    deleteAlias: mockDeleteAlias,
    encrypt: mockEncrypt,
    decrypt: mockDecrypt,
    deleteKey: vi.fn().mockResolvedValue(true),
  }),
}));

describe("KmsServiceView", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockState.error = null;
    useProfiles.setState({ profiles: [localProfile()], activeProfileId: LOCAL_PROFILE_ID });
  });

  it("renders keys with alias counts", () => {
    renderWithProviders(<KmsServiceView />);
    expect(screen.getByText("k1")).toBeInTheDocument();
    expect(screen.getByText("k2")).toBeInTheDocument();
    expect(screen.getByText("1")).toBeInTheDocument();
  });

  it("opens a key view tab on row click", () => {
    useTabs.setState({ tabs: [], activeTabId: null });
    renderWithProviders(<KmsServiceView />);
    fireEvent.click(screen.getByText("k1"));
    const tab = useTabs.getState().tabs.find((t) => t.id === "kmsKey:k1");
    expect(tab?.kind).toBe("kmsKey");
    expect(useTabs.getState().activeTabId).toBe("kmsKey:k1");
  });

  it("creates a key via dialog", async () => {
    renderWithProviders(<KmsServiceView />);
    fireEvent.click(screen.getByRole("button", { name: "Create key" }));
    const dialog = screen.getByRole("dialog");
    fireEvent.change(within(dialog).getByLabelText("Description (optional)"), {
      target: { value: "test key" },
    });
    fireEvent.click(within(dialog).getByRole("button", { name: "Create key" }));
    await waitFor(() => expect(mockCreateKey).toHaveBeenCalledWith({ description: "test key" }));
  });
});

describe("KeyView", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useProfiles.setState({ profiles: [localProfile()], activeProfileId: LOCAL_PROFILE_ID });
  });

  it("renders key facts, aliases, and policy", () => {
    renderWithProviders(<KeyView keyId="k1" />);
    expect(screen.getByText("arn:aws:kms:us-east-1:000000000000:key/k1")).toBeInTheDocument();
    expect(screen.getByText("alias/orders")).toBeInTheDocument();
    expect(screen.getByText(/rotation on/)).toBeInTheDocument();
    expect(screen.getByText(/2012-10-17/)).toBeInTheDocument();
  });

  it("encrypts through the playground", async () => {
    renderWithProviders(<KeyView keyId="k1" />);
    fireEvent.change(screen.getByLabelText("Plaintext"), {
      target: { value: "secret-hello" },
    });
    fireEvent.click(screen.getByRole("button", { name: /Encrypt →/ }));
    await waitFor(() =>
      expect(mockEncrypt).toHaveBeenCalledWith({ keyId: "k1", plaintext: "secret-hello" }),
    );
    expect(screen.getByLabelText("Ciphertext (base64)")).toHaveValue("Y2lwaGVy");
  });

  it("decrypts through the playground", async () => {
    renderWithProviders(<KeyView keyId="k1" />);
    fireEvent.change(screen.getByLabelText("Ciphertext (base64)"), {
      target: { value: "c2VjcmV0LWhlbGxv" },
    });
    fireEvent.click(screen.getByRole("button", { name: /← Decrypt/ }));
    await waitFor(() =>
      expect(mockDecrypt).toHaveBeenCalledWith({
        keyId: "k1",
        ciphertextBase64: "c2VjcmV0LWhlbGxv",
      }),
    );
  });

  it("creates an alias via dialog", async () => {
    renderWithProviders(<KeyView keyId="k1" />);
    fireEvent.click(screen.getByRole("button", { name: "Create alias" }));
    const dialog = screen.getByRole("dialog");
    fireEvent.change(within(dialog).getByLabelText("Alias name"), {
      target: { value: "alias/cart" },
    });
    fireEvent.click(within(dialog).getByRole("button", { name: "Create alias" }));
    await waitFor(() =>
      expect(mockCreateAlias).toHaveBeenCalledWith({ name: "alias/cart", targetKeyId: "k1" }),
    );
  });
});
