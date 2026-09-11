import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { toast } from "sonner";
import { checkForUpdates, isTauri } from "./updater";

const mockCheck = vi.fn();

vi.mock("@tauri-apps/plugin-updater", () => ({
  check: () => mockCheck(),
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

describe("updater lib", () => {
  const originalTauri = (window as unknown as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    if (originalTauri !== undefined) {
      (window as unknown as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__ = originalTauri;
    } else {
      delete (window as unknown as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__;
    }
  });

  describe("isTauri", () => {
    it("returns false when window.__TAURI_INTERNALS__ is absent", () => {
      delete (window as unknown as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__;
      expect(isTauri()).toBe(false);
    });

    it("returns true when window.__TAURI_INTERNALS__ is present", () => {
      (window as unknown as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__ = {};
      expect(isTauri()).toBe(true);
    });
  });

  describe("checkForUpdates", () => {
    it("returns unsupported and fires info toast when manual and not in Tauri", async () => {
      delete (window as unknown as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__;

      const result = await checkForUpdates(true);
      expect(result).toBe("unsupported");
      expect(toast.info).toHaveBeenCalledWith("Updates are only available in the installed app");
    });

    it("returns unsupported and fires no toast when auto check and not in Tauri", async () => {
      delete (window as unknown as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__;

      const result = await checkForUpdates(false);
      expect(result).toBe("unsupported");
      expect(toast.info).not.toHaveBeenCalled();
    });

    it("returns none and fires success toast when manual and no update in Tauri", async () => {
      (window as unknown as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__ = {};
      mockCheck.mockResolvedValueOnce(null);

      const result = await checkForUpdates(true);
      expect(result).toBe("none");
      expect(toast.success).toHaveBeenCalledWith("You're up to date");
    });

    it("returns none and fires no toast when auto and no update in Tauri", async () => {
      (window as unknown as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__ = {};
      mockCheck.mockResolvedValueOnce(null);

      const result = await checkForUpdates(false);
      expect(result).toBe("none");
      expect(toast.success).not.toHaveBeenCalled();
    });

    it("returns offered and toast contains version when update is available", async () => {
      (window as unknown as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__ = {};
      mockCheck.mockResolvedValueOnce({
        version: "2.0.0",
        downloadAndInstall: vi.fn(),
      });

      const result = await checkForUpdates(true);
      expect(result).toBe("offered");
      expect(toast.info).toHaveBeenCalledWith(
        expect.stringContaining("2.0.0"),
        expect.any(Object),
      );
    });

    it("returns error and fires error toast when check rejects on manual", async () => {
      (window as unknown as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__ = {};
      mockCheck.mockRejectedValueOnce(new Error("network fail"));

      const result = await checkForUpdates(true);
      expect(result).toBe("error");
      expect(toast.error).toHaveBeenCalledWith("Failed to check for updates");
    });

    it("returns error and logs warning without error toast when check rejects on auto", async () => {
      (window as unknown as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__ = {};
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
      mockCheck.mockRejectedValueOnce(new Error("network fail"));

      const result = await checkForUpdates(false);
      expect(result).toBe("error");
      expect(toast.error).not.toHaveBeenCalled();
      expect(warnSpy).toHaveBeenCalled();
      warnSpy.mockRestore();
    });
  });
});
