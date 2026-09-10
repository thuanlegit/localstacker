import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { KeyPairListView } from "./KeyPairListView";
import type { KeyPairSummary } from "@/lib/ec2";

const mockDeleteKeyPair = vi.fn();
const mockKeyPairs: KeyPairSummary[] = [
  {
    keyPairId: "key-01",
    keyName: "prod-key",
    keyFingerprint: "11:22:33:44",
    keyType: "rsa",
    createTime: new Date("2026-02-01T00:00:00Z"),
    tags: {},
  },
  {
    keyPairId: "key-02",
    keyName: "staging-ed25519",
    keyFingerprint: "55:66:77:88",
    keyType: "ed25519",
    createTime: new Date("2026-02-15T00:00:00Z"),
    tags: {},
  },
];

let mockData = mockKeyPairs;
let mockLoading = false;

vi.mock("@/hooks/use-ec2", () => ({
  useKeyPairs: () => ({
    data: mockData,
    isLoading: mockLoading,
    refetch: vi.fn(),
  }),
  useKeyPairActions: () => ({
    createKeyPair: vi.fn(),
    deleteKeyPair: mockDeleteKeyPair,
  }),
}));

describe("KeyPairListView", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockData = mockKeyPairs;
    mockLoading = false;
  });

  it("renders table with key pairs", () => {
    render(<KeyPairListView />);

    expect(screen.getByText("prod-key")).toBeInTheDocument();
    expect(screen.getByText("key-01")).toBeInTheDocument();
    expect(screen.getByText("11:22:33:44")).toBeInTheDocument();
    expect(screen.getByText("RSA")).toBeInTheDocument();

    expect(screen.getByText("staging-ed25519")).toBeInTheDocument();
    expect(screen.getByText("ED25519")).toBeInTheDocument();
  });

  it("filters key pairs by name", async () => {
    const user = userEvent.setup();
    render(<KeyPairListView />);

    const searchInput = screen.getByPlaceholderText(/Filter key pairs/i);
    await user.type(searchInput, "staging");

    expect(screen.getByText("staging-ed25519")).toBeInTheDocument();
    expect(screen.queryByText("prod-key")).not.toBeInTheDocument();
  });

  it("renders empty state when no keys exist", () => {
    mockData = [];
    render(<KeyPairListView />);

    expect(screen.getByText("No SSH key pairs found")).toBeInTheDocument();
  });

  it("opens delete confirmation and deletes key pair", async () => {
    mockDeleteKeyPair.mockResolvedValueOnce(true);
    const user = userEvent.setup();
    render(<KeyPairListView />);

    const deleteBtn = screen.getByRole("button", {
      name: "Delete key pair prod-key",
    });
    await user.click(deleteBtn);

    expect(
      screen.getByRole("heading", { name: "Delete Key Pair" }),
    ).toBeInTheDocument();

    const confirmBtn = screen.getByRole("button", { name: "Delete" });
    await user.click(confirmBtn);

    expect(mockDeleteKeyPair).toHaveBeenCalledWith("prod-key", "key-01");
  });
});
