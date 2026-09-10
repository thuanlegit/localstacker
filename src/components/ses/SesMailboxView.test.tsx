import { describe, expect, it, vi, beforeEach } from "vitest";
import { fireEvent, screen, within } from "@testing-library/react";
import { SesMailboxView } from "./SesMailboxView";
import { renderWithProviders } from "@/test/utils";
import { LOCAL_PROFILE_ID, localProfile, useProfiles } from "@/store/profiles";
import type { CapturedEmail } from "@/lib/ses";

const mockMessages: CapturedEmail[] = [
  {
    Id: "msg-1",
    Timestamp: "2026-01-01T12:00:00.000Z",
    Source: "sender@example.com",
    Destination: {
      ToAddresses: ["recipient@example.com"],
    },
    Subject: "Welcome to LocalStack",
    Body: {
      text_part: "Hello from LocalStack plaintext",
      html_part: "<h1>Hello from LocalStack HTML</h1>",
    },
    RawData: [
      'Content-Type: multipart/mixed; boundary="BOUNDARY"',
      "",
      "--BOUNDARY",
      "Content-Type: text/plain",
      "",
      "Hello",
      "--BOUNDARY",
      'Content-Type: text/plain; name="note.txt"',
      'Content-Disposition: attachment; filename="note.txt"',
      "",
      "Some notes",
      "--BOUNDARY--",
    ].join("\r\n"),
  },
];

const { mockState, mockClearMailbox } = vi.hoisted(() => ({
  mockState: {
    messages: undefined as CapturedEmail[] | undefined,
    error: null as Error | null,
    isPending: false,
  },
  mockClearMailbox: vi.fn().mockResolvedValue(true),
}));

vi.mock("@/hooks/use-ses", () => ({
  useCapturedMessages: () => ({
    data: mockState.messages,
    isPending: mockState.isPending,
    isFetching: false,
    error: mockState.error,
    refetch: vi.fn(),
  }),
  useMailboxActions: () => ({
    clearMailbox: mockClearMailbox,
  }),
}));

describe("SesMailboxView", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockState.messages = [...mockMessages];
    mockState.error = null;
    mockState.isPending = false;
    useProfiles.setState({
      profiles: [{ ...localProfile(), endpoint: "http://localhost:4566" }],
      activeProfileId: LOCAL_PROFILE_ID,
    });
  });

  it("renders message list and details with HTML preview iframe", () => {
    renderWithProviders(<SesMailboxView />);

    expect(screen.getByText("SES Mailbox")).toBeInTheDocument();
    expect(screen.getAllByText("Welcome to LocalStack").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("sender@example.com").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("recipient@example.com").length).toBeGreaterThanOrEqual(1);

    const iframe = screen.getByTitle("HTML email preview");
    expect(iframe).toBeInTheDocument();
    expect(iframe).toHaveAttribute(
      "srcDoc",
      "<h1>Hello from LocalStack HTML</h1>",
    );
  });

  it("switches tabs to Plaintext and Attachments", async () => {
    renderWithProviders(<SesMailboxView />);

    // Switch to Plaintext tab
    const plaintextTab = screen.getByRole("tab", { name: /Plaintext/i });
    fireEvent.keyDown(plaintextTab, { key: "Enter", code: "Enter" });
    expect(
      await screen.findByText("Hello from LocalStack plaintext"),
    ).toBeInTheDocument();

    // Switch to Attachments tab
    const attachmentsTab = screen.getByRole("tab", { name: /Attachments/i });
    fireEvent.keyDown(attachmentsTab, { key: "Enter", code: "Enter" });
    expect(await screen.findByText("note.txt")).toBeInTheDocument();
  });

  it("displays informational banner when mailbox endpoint errors (e.g. 404)", () => {
    mockState.messages = [];
    mockState.error = new Error("SES mailbox unavailable (HTTP 404)");

    renderWithProviders(<SesMailboxView />);

    expect(
      screen.getByText(
        "Captured mailbox is unavailable on this LocalStack instance",
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/The internal LocalStack mailbox endpoint/i),
    ).toBeInTheDocument();
  });

  it("clears mailbox via confirm dialog", async () => {
    renderWithProviders(<SesMailboxView />);

    const clearBtn = screen.getByRole("button", { name: /Clear mailbox/i });
    fireEvent.click(clearBtn);

    const confirmDialog = await screen.findByRole("dialog");
    expect(
      within(confirmDialog).getByText("Clear Mailbox"),
    ).toBeInTheDocument();

    fireEvent.click(
      within(confirmDialog).getByRole("button", {
        name: "Delete all captured emails",
      }),
    );
    expect(mockClearMailbox).toHaveBeenCalled();
  });
});
