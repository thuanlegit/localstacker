import { describe, expect, it, vi, beforeEach } from "vitest";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { SesServiceView } from "./SesServiceView";
import { renderWithProviders } from "@/test/utils";
import { LOCAL_PROFILE_ID, localProfile, useProfiles } from "@/store/profiles";
import { useTabs } from "@/store/tabs";
import type { IdentitySummary } from "@/lib/ses";

const mockIdentities: IdentitySummary[] = [
  {
    identity: "user@example.com",
    type: "EmailAddress",
    status: "Success",
  },
  {
    identity: "mydomain.com",
    type: "Domain",
    status: "Pending",
    verificationToken: "tok-123",
  },
];

const { mockState, mockVerifyEmail, mockVerifyDomain, mockDeleteIdentity } =
  vi.hoisted(() => ({
    mockState: {
      serviceStatus: "available" as string,
      identities: undefined as IdentitySummary[] | undefined,
      error: null as Error | null,
    },
    mockVerifyEmail: vi.fn().mockResolvedValue(true),
    mockVerifyDomain: vi.fn().mockResolvedValue("tok-456"),
    mockDeleteIdentity: vi.fn().mockResolvedValue(true),
  }));

vi.mock("@/hooks/use-health", () => ({
  useServiceStatus: () => mockState.serviceStatus,
  useHealth: () => ({ data: undefined, refetch: vi.fn() }),
  isServiceDisabledError: (err: unknown) =>
    err instanceof Error && err.message.includes("is not enabled"),
}));

vi.mock("@/hooks/use-ses", () => ({
  useIdentities: () => ({
    data: mockState.identities,
    isPending: false,
    isFetching: false,
    error: mockState.error,
    refetch: vi.fn(),
  }),
  useIdentityActions: () => ({
    verifyEmailIdentity: mockVerifyEmail,
    verifyDomainIdentity: mockVerifyDomain,
    deleteIdentity: mockDeleteIdentity,
  }),
  useSendEmail: () => ({
    sendEmail: vi.fn().mockResolvedValue("msg-123"),
  }),
}));

describe("SesServiceView", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockState.serviceStatus = "available";
    mockState.identities = [...mockIdentities];
    mockState.error = null;
    useProfiles.setState({
      profiles: [{ ...localProfile(), region: "us-east-1" }],
      activeProfileId: LOCAL_PROFILE_ID,
    });
    useTabs.setState({ tabs: [], activeTabId: null });
  });

  it("renders identities table with types and status badges", () => {
    renderWithProviders(<SesServiceView />);
    expect(screen.getByText("SES")).toBeInTheDocument();
    expect(screen.getByText("user@example.com")).toBeInTheDocument();
    expect(screen.getByText("Email")).toBeInTheDocument();
    expect(screen.getByText("Verified")).toBeInTheDocument();
    expect(screen.getByText("mydomain.com")).toBeInTheDocument();
    expect(screen.getByText("Domain")).toBeInTheDocument();
    expect(screen.getByText("Pending")).toBeInTheDocument();
  });

  it("renders ServiceDisabledView when service is disabled", () => {
    mockState.serviceStatus = "disabled";
    renderWithProviders(<SesServiceView />);
    expect(screen.getByText(/SES is turned off/i)).toBeInTheDocument();
  });

  it("validates email address and verifies email identity", async () => {
    renderWithProviders(<SesServiceView />);
    fireEvent.click(screen.getByRole("button", { name: /^Verify email$/i }));

    const dialog = screen.getByRole("dialog");
    const input = within(dialog).getByLabelText(/Email address/i);
    const submitBtn = within(dialog).getByRole("button", {
      name: "Verify email",
    });

    fireEvent.change(input, { target: { value: "invalid-email" } });
    expect(submitBtn).toBeDisabled();

    fireEvent.change(input, { target: { value: "valid@example.com" } });
    expect(submitBtn).not.toBeDisabled();

    fireEvent.click(submitBtn);
    await waitFor(() =>
      expect(mockVerifyEmail).toHaveBeenCalledWith("valid@example.com"),
    );
    await waitFor(() =>
      expect(useTabs.getState().tabs.map((t) => t.id)).toEqual([
        "sesIdentity:valid@example.com",
      ]),
    );
  });

  it("opens sesIdentity tab on row click", () => {
    renderWithProviders(<SesServiceView />);
    fireEvent.click(screen.getByText("user@example.com"));
    expect(useTabs.getState().tabs).toEqual([
      {
        id: "sesIdentity:user@example.com",
        kind: "sesIdentity",
        identityName: "user@example.com",
        title: "user@example.com",
      },
    ]);
  });

  it("deletes identity via confirmation dialog", async () => {
    renderWithProviders(<SesServiceView />);

    const actionBtn = screen.getByRole("button", {
      name: "Actions for user@example.com",
    });
    fireEvent.keyDown(actionBtn, { key: "ArrowDown", code: "ArrowDown" });
    const deleteItem = await screen.findByRole("menuitem", {
      name: /Delete identity/i,
    });
    fireEvent.click(deleteItem);

    const confirmDialog = await screen.findByRole("dialog");
    expect(
      within(confirmDialog).getByText(
        /Are you sure you want to delete identity "user@example.com"/,
      ),
    ).toBeInTheDocument();

    fireEvent.click(
      within(confirmDialog).getByRole("button", { name: "Delete identity" }),
    );
    await waitFor(() =>
      expect(mockDeleteIdentity).toHaveBeenCalledWith("user@example.com"),
    );
  });

  it("opens captured mailbox tab on button click", () => {
    renderWithProviders(<SesServiceView />);
    fireEvent.click(screen.getByRole("button", { name: /Captured mailbox/i }));
    expect(useTabs.getState().tabs).toEqual([
      {
        id: "sesMailbox:captured",
        kind: "sesMailbox",
        title: "SES Mailbox",
      },
    ]);
  });
});
