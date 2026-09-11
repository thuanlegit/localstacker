import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen, within } from "@testing-library/react";
import { ConnectionsSection } from "./ConnectionsSection";
import { renderWithProviders } from "@/test/utils";
import { LOCAL_PROFILE_ID, localProfile, useProfiles } from "@/store/profiles";
import type { ConnectionProfile } from "@/types";

vi.mock("@/components/ConnectionDialog", () => ({
  ConnectionDialog: ({
    open,
    profile,
  }: {
    open: boolean;
    profile?: ConnectionProfile;
  }) =>
    open ? (
      <div data-testid="connection-dialog" data-profile={profile?.name ?? "none"}>
        ConnectionDialog Mock
      </div>
    ) : null,
}));

describe("ConnectionsSection", () => {
  const customProfile: ConnectionProfile = {
    id: "custom-1",
    name: "Staging",
    endpoint: "http://staging.localstack:4566",
    region: "eu-west-1",
    builtIn: false,
  };

  beforeEach(() => {
    localStorage.clear();
    useProfiles.setState({
      profiles: [localProfile(), customProfile],
      activeProfileId: LOCAL_PROFILE_ID,
    });
  });

  it("renders one row per store profile with badges and details", () => {
    renderWithProviders(<ConnectionsSection />);

    expect(screen.getByText("Local")).toBeInTheDocument();
    expect(screen.getByText("Built-in")).toBeInTheDocument();
    expect(screen.getByText("Active")).toBeInTheDocument();
    expect(screen.getByText("http://localhost:4566 · us-east-1")).toBeInTheDocument();

    expect(screen.getByText("Staging")).toBeInTheDocument();
    expect(screen.getByText("http://staging.localstack:4566 · eu-west-1")).toBeInTheDocument();
  });

  it("opens ConnectionDialog without profile when clicking Add connection", () => {
    renderWithProviders(<ConnectionsSection />);
    expect(screen.queryByTestId("connection-dialog")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Add connection" }));
    const dialog = screen.getByTestId("connection-dialog");
    expect(dialog).toBeInTheDocument();
    expect(dialog).toHaveAttribute("data-profile", "none");
  });

  it("opens ConnectionDialog with profile when clicking Edit…", () => {
    renderWithProviders(<ConnectionsSection />);
    const stagingRow = screen.getByText("Staging").closest(".flex.items-center.justify-between") as HTMLElement;
    const editBtn = within(stagingRow).getByRole("button", { name: "Edit…" });
    fireEvent.click(editBtn);

    const dialog = screen.getByTestId("connection-dialog");
    expect(dialog).toBeInTheDocument();
    expect(dialog).toHaveAttribute("data-profile", "Staging");
  });

  it("Use on inactive profile sets activeProfileId and disables on now-active row", async () => {
    renderWithProviders(<ConnectionsSection />);
    const localRow = screen.getByText("Local").closest(".flex.items-center.justify-between") as HTMLElement;
    const stagingRow = screen.getByText("Staging").closest(".flex.items-center.justify-between") as HTMLElement;

    const localUseBtn = within(localRow).getByRole("button", { name: "Use" });
    const stagingUseBtn = within(stagingRow).getByRole("button", { name: "Use" });

    expect(localUseBtn).toBeDisabled();
    expect(stagingUseBtn).toBeEnabled();

    fireEvent.click(stagingUseBtn);

    expect(useProfiles.getState().activeProfileId).toBe("custom-1");
    expect(stagingUseBtn).toBeDisabled();
    expect(localUseBtn).toBeEnabled();
  });

  it("built-in profile shows no Remove button, but custom profile does", () => {
    renderWithProviders(<ConnectionsSection />);
    const localRow = screen.getByText("Local").closest(".flex.items-center.justify-between") as HTMLElement;
    const stagingRow = screen.getByText("Staging").closest(".flex.items-center.justify-between") as HTMLElement;

    expect(within(localRow).queryByRole("button", { name: "Remove" })).not.toBeInTheDocument();
    expect(within(stagingRow).getByRole("button", { name: "Remove" })).toBeInTheDocument();
  });

  it("Remove on custom profile opens DeleteConfirmDialog and confirming calls removeProfile", async () => {
    renderWithProviders(<ConnectionsSection />);
    const stagingRow = screen.getByText("Staging").closest(".flex.items-center.justify-between") as HTMLElement;
    const removeBtn = within(stagingRow).getByRole("button", { name: "Remove" });

    fireEvent.click(removeBtn);

    const confirmDialog = screen.getByRole("dialog");
    expect(within(confirmDialog).getByText("Remove connection?")).toBeInTheDocument();
    expect(
      within(confirmDialog).getByText('Removes connection "Staging" from LocalStacker.'),
    ).toBeInTheDocument();

    const confirmBtn = within(confirmDialog).getByRole("button", { name: "Remove" });
    fireEvent.click(confirmBtn);

    expect(useProfiles.getState().profiles.find((p) => p.id === "custom-1")).toBeUndefined();
    expect(screen.queryByText("Staging")).not.toBeInTheDocument();
  });
});
