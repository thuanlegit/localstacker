import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen, within } from "@testing-library/react";
import { QueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { DataSection } from "./DataSection";
import { renderWithProviders } from "@/test/utils";

vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
  },
}));

describe("DataSection", () => {
  const originalLocation = window.location;
  const reloadMock = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    Object.defineProperty(window, "location", {
      configurable: true,
      writable: true,
      value: { ...originalLocation, reload: reloadMock },
    });
  });

  afterEach(() => {
    Object.defineProperty(window, "location", {
      configurable: true,
      writable: true,
      value: originalLocation,
    });
  });

  it("renders Data section with Clear and Reset options", () => {
    renderWithProviders(<DataSection />);
    expect(screen.getByRole("heading", { name: "Data" })).toBeInTheDocument();
    expect(screen.getByText("Clear cached data")).toBeInTheDocument();
    expect(screen.getByText("Reset app data")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Clear" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Reset…" })).toBeInTheDocument();
  });

  it("calls queryClient.clear and fires success toast when clicking Clear", async () => {
    const clearSpy = vi.spyOn(QueryClient.prototype, "clear");
    renderWithProviders(<DataSection />);

    fireEvent.click(screen.getByRole("button", { name: "Clear" }));

    expect(clearSpy).toHaveBeenCalled();
    expect(toast.success).toHaveBeenCalledWith("Cached data cleared");
    clearSpy.mockRestore();
  });

  it("removes seeded localstacker.* keys, clears query client, and reloads on Reset confirmation", () => {
    localStorage.setItem("localstacker.profiles", JSON.stringify({ test: 1 }));
    localStorage.setItem("localstacker.theme", JSON.stringify({ mode: "light" }));
    localStorage.setItem("localstacker.preferences", JSON.stringify({ autoCheckUpdates: true }));
    localStorage.setItem("other.key", "keep-me");

    const clearSpy = vi.spyOn(QueryClient.prototype, "clear");
    renderWithProviders(<DataSection />);

    fireEvent.click(screen.getByRole("button", { name: "Reset…" }));

    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByText("Reset app data?")).toBeInTheDocument();
    expect(
      within(dialog).getByText(
        "Everything — connections, theme, preferences — returns to defaults. This cannot be undone.",
      ),
    ).toBeInTheDocument();

    const confirmBtn = within(dialog).getByRole("button", { name: "Reset" });
    fireEvent.click(confirmBtn);

    expect(localStorage.getItem("localstacker.profiles")).toBeNull();
    expect(localStorage.getItem("localstacker.theme")).toBeNull();
    expect(localStorage.getItem("localstacker.preferences")).toBeNull();
    expect(localStorage.getItem("other.key")).toBe("keep-me");

    expect(clearSpy).toHaveBeenCalled();
    expect(reloadMock).toHaveBeenCalled();
    clearSpy.mockRestore();
  });
});
