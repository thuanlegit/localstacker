import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { UpdatesSection } from "./UpdatesSection";
import { openDonate } from "@/lib/support";
import { usePreferences } from "@/store/preferences";

vi.mock("@/lib/support", () => ({
  openDonate: vi.fn(),
}));

describe("UpdatesSection", () => {
  const originalTauri = (window as unknown as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__;

  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  afterEach(() => {
    if (originalTauri !== undefined) {
      (window as unknown as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__ = originalTauri;
    } else {
      delete (window as unknown as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__;
    }
  });

  it("renders v + version text and disabled Check button when not in Tauri", () => {
    delete (window as unknown as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__;

    render(<UpdatesSection />);

    expect(screen.getByText("LocalStacker vdev")).toBeInTheDocument();
    const checkBtn = screen.getByRole("button", { name: "Check for updates" });
    expect(checkBtn).toBeDisabled();
    expect(
      screen.getByText("Updates run inside the installed app — browser preview can't check."),
    ).toBeInTheDocument();
  });

  it("enables Check button when in Tauri", () => {
    (window as unknown as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__ = {};

    render(<UpdatesSection />);

    const checkBtn = screen.getByRole("button", { name: "Check for updates" });
    expect(checkBtn).toBeEnabled();
    expect(
      screen.queryByText("Updates run inside the installed app — browser preview can't check."),
    ).not.toBeInTheDocument();
  });

  it("On/Off select flips usePreferences.getState().autoCheckUpdates", async () => {
    render(<UpdatesSection />);

    expect(usePreferences.getState().autoCheckUpdates).toBe(true);

    const trigger = screen.getByRole("combobox", {
      name: "Check for updates on startup",
    });
    fireEvent.keyDown(trigger, { key: "ArrowDown", code: "ArrowDown" });

    const offOption = await screen.findByRole("option", { name: "Off" });
    fireEvent.click(offOption);

    expect(usePreferences.getState().autoCheckUpdates).toBe(false);

    fireEvent.keyDown(trigger, { key: "ArrowDown", code: "ArrowDown" });
    const onOption = await screen.findByRole("option", { name: "On" });
    fireEvent.click(onOption);

    expect(usePreferences.getState().autoCheckUpdates).toBe(true);
  });

  it("opens the donation page when the About chip is clicked", () => {
    render(<UpdatesSection />);

    fireEvent.click(screen.getByRole("button", { name: /buy me a coffee/i }));

    expect(vi.mocked(openDonate)).toHaveBeenCalledTimes(1);
  });
});
