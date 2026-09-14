import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { toast } from "sonner";
import { openDonate } from "./support";

const mockOpenUrl = vi.fn();

vi.mock("@tauri-apps/plugin-opener", () => ({
  openUrl: (...args: unknown[]) => mockOpenUrl(...args),
}));

vi.mock("sonner", () => ({
  toast: {
    info: vi.fn(),
    success: vi.fn(),
    loading: vi.fn().mockReturnValue("toast-id"),
    error: vi.fn(),
    dismiss: vi.fn(),
  },
}));

describe("support lib", () => {
  type TauriWindow = { __TAURI_INTERNALS__?: unknown };
  const originalTauri = (window as unknown as TauriWindow).__TAURI_INTERNALS__;
  const openSpy = vi.spyOn(window, "open").mockImplementation(() => null);

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    if (originalTauri !== undefined) {
      (window as unknown as TauriWindow).__TAURI_INTERNALS__ = originalTauri;
    } else {
      delete (window as unknown as TauriWindow).__TAURI_INTERNALS__;
    }
  });

  it("opens the donate URL via window.open outside Tauri", async () => {
    delete (window as unknown as TauriWindow).__TAURI_INTERNALS__;

    await openDonate();

    expect(openSpy).toHaveBeenCalledWith(
      "https://buymeacoffee.com/ryleth",
      "_blank",
      "noopener,noreferrer",
    );
    expect(mockOpenUrl).not.toHaveBeenCalled();
  });

  it("opens the donate URL via the opener plugin in Tauri", async () => {
    (window as unknown as TauriWindow).__TAURI_INTERNALS__ = {};

    await openDonate();

    expect(mockOpenUrl).toHaveBeenCalledWith("https://buymeacoffee.com/ryleth");
    expect(openSpy).not.toHaveBeenCalled();
  });

  it("shows an error toast when opening fails", async () => {
    (window as unknown as TauriWindow).__TAURI_INTERNALS__ = {};
    mockOpenUrl.mockRejectedValueOnce(new Error("denied"));

    await openDonate();

    expect(toast.error).toHaveBeenCalledWith("Failed to open donation page");
  });
});
