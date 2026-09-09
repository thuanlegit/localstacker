import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import React from "react";
import { render, waitFor } from "@testing-library/react";
import { toast } from "sonner";

vi.mock("sonner", () => ({
  toast: {
    info: vi.fn(),
    loading: vi.fn().mockReturnValue("toast-id"),
    error: vi.fn(),
    dismiss: vi.fn(),
  },
}));

describe("useAutoUpdate", () => {
  const originalTauri = (window as unknown as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  afterEach(() => {
    if (originalTauri !== undefined) {
      (window as unknown as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__ = originalTauri;
    } else {
      delete (window as unknown as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__;
    }
  });

  it("does not call check when not running in Tauri (browser dev)", async () => {
    delete (window as unknown as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__;

    const mockCheck = vi.fn();
    vi.doMock("@tauri-apps/plugin-updater", () => ({ check: mockCheck }));
    vi.doMock("@tauri-apps/plugin-process", () => ({ relaunch: vi.fn() }));

    const { useAutoUpdate } = await import("./use-auto-update");
    function BrowserProbe() {
      useAutoUpdate();
      return null;
    }

    render(React.createElement(BrowserProbe));

    await Promise.resolve();
    expect(mockCheck).not.toHaveBeenCalled();
    expect(toast.info).not.toHaveBeenCalled();
  });

  it("does not trigger toast when check returns null (no update)", async () => {
    (window as unknown as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__ = {};

    const mockCheck = vi.fn().mockResolvedValue(null);
    vi.doMock("@tauri-apps/plugin-updater", () => ({ check: mockCheck }));
    vi.doMock("@tauri-apps/plugin-process", () => ({ relaunch: vi.fn() }));

    const { useAutoUpdate } = await import("./use-auto-update");
    function NullProbe() {
      useAutoUpdate();
      return null;
    }

    render(React.createElement(NullProbe));

    await waitFor(() => {
      expect(mockCheck).toHaveBeenCalled();
    });
    expect(toast.info).not.toHaveBeenCalled();
  });

  it("notifies with version and triggers download/install and restart on action click", async () => {
    (window as unknown as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__ = {};

    const mockDownloadAndInstall = vi.fn().mockResolvedValue(undefined);
    const mockRelaunch = vi.fn().mockResolvedValue(undefined);
    const mockCheck = vi.fn().mockResolvedValue({
      version: "1.2.3",
      downloadAndInstall: mockDownloadAndInstall,
    });

    vi.doMock("@tauri-apps/plugin-updater", () => ({ check: mockCheck }));
    vi.doMock("@tauri-apps/plugin-process", () => ({ relaunch: mockRelaunch }));

    const { useAutoUpdate } = await import("./use-auto-update");
    function UpdateProbe() {
      useAutoUpdate();
      return null;
    }

    render(React.createElement(UpdateProbe));

    await waitFor(() => {
      expect(toast.info).toHaveBeenCalledWith(
        expect.stringContaining("1.2.3"),
        expect.objectContaining({
          action: expect.objectContaining({
            label: "Update & restart",
            onClick: expect.any(Function),
          }),
        })
      );
    });

    const action = vi.mocked(toast.info).mock.calls[0][1]?.action as {
      label: string;
      onClick: () => Promise<void>;
    };
    await action.onClick();

    expect(toast.loading).toHaveBeenCalledWith("Downloading update…");
    expect(mockDownloadAndInstall).toHaveBeenCalled();
    expect(mockRelaunch).toHaveBeenCalled();
  });

  it("swallows errors on check failure and logs warning without error toast", async () => {
    (window as unknown as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__ = {};

    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const mockCheck = vi.fn().mockRejectedValue(new Error("check failed"));

    vi.doMock("@tauri-apps/plugin-updater", () => ({ check: mockCheck }));
    vi.doMock("@tauri-apps/plugin-process", () => ({ relaunch: vi.fn() }));

    const { useAutoUpdate } = await import("./use-auto-update");
    function ErrorProbe() {
      useAutoUpdate();
      return null;
    }

    render(React.createElement(ErrorProbe));

    await waitFor(() => {
      expect(mockCheck).toHaveBeenCalled();
      expect(warnSpy).toHaveBeenCalled();
    });

    expect(toast.error).not.toHaveBeenCalled();
    warnSpy.mockRestore();
  });
});
