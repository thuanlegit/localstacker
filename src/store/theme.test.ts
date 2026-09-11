import { beforeEach, describe, expect, it, vi } from "vitest";
import { applyThemeToDocument, resolveMode, useTheme } from "./theme";

describe("theme store", () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.className = "";
    delete document.documentElement.dataset.palette;
    useTheme.setState({ mode: "dark", palette: "github" });
  });

  describe("resolveMode", () => {
    it("returns explicit mode when light or dark", () => {
      expect(resolveMode("light")).toBe("light");
      expect(resolveMode("dark")).toBe("dark");
    });

    it("resolves system mode using matchMedia", () => {
      const matchMediaMock = vi.fn().mockReturnValue({ matches: true });
      Object.defineProperty(window, "matchMedia", {
        writable: true,
        configurable: true,
        value: matchMediaMock,
      });

      expect(resolveMode("system")).toBe("dark");
      expect(matchMediaMock).toHaveBeenCalledWith("(prefers-color-scheme: dark)");

      matchMediaMock.mockReturnValue({ matches: false });
      expect(resolveMode("system")).toBe("light");
    });
  });

  describe("toggle", () => {
    it("toggles dark to light", () => {
      useTheme.setState({ mode: "dark" });
      useTheme.getState().toggle();
      expect(useTheme.getState().mode).toBe("light");
    });

    it("toggles light to dark", () => {
      useTheme.setState({ mode: "light" });
      useTheme.getState().toggle();
      expect(useTheme.getState().mode).toBe("dark");
    });

    it("pins explicit opposite when system mode", () => {
      Object.defineProperty(window, "matchMedia", {
        writable: true,
        configurable: true,
        value: vi.fn().mockReturnValue({ matches: true }),
      });
      useTheme.setState({ mode: "system" });
      useTheme.getState().toggle();
      expect(useTheme.getState().mode).toBe("light");

      Object.defineProperty(window, "matchMedia", {
        writable: true,
        configurable: true,
        value: vi.fn().mockReturnValue({ matches: false }),
      });
      useTheme.setState({ mode: "system" });
      useTheme.getState().toggle();
      expect(useTheme.getState().mode).toBe("dark");
    });
  });

  describe("setMode and setPalette", () => {
    it("updates mode and palette", () => {
      useTheme.getState().setMode("light");
      expect(useTheme.getState().mode).toBe("light");

      useTheme.getState().setPalette("nord");
      expect(useTheme.getState().palette).toBe("nord");
    });
  });

  describe("applyThemeToDocument", () => {
    it("sets .dark class and dataset.palette", () => {
      applyThemeToDocument("dark", "nord");
      expect(document.documentElement).toHaveClass("dark");
      expect(document.documentElement.dataset.palette).toBe("nord");

      applyThemeToDocument("light", "catppuccin");
      expect(document.documentElement).not.toHaveClass("dark");
      expect(document.documentElement.dataset.palette).toBe("catppuccin");
    });
  });

  describe("migration", () => {
    it("migrates v1 theme and legacy default palette to github", () => {
      const persistOptions = (useTheme as unknown as { persist: { getOptions: () => { migrate?: (persisted: unknown, version: number) => unknown } } }).persist.getOptions();
      const migratedLight = persistOptions.migrate?.({ theme: "light" }, 0);
      expect(migratedLight).toEqual({ mode: "light", palette: "github" });

      const migratedDark = persistOptions.migrate?.({ theme: "dark" }, 1);
      expect(migratedDark).toEqual({ mode: "dark", palette: "github" });

      const legacyDefault = persistOptions.migrate?.({ mode: "dark", palette: "default" }, 2);
      expect(legacyDefault).toEqual({ mode: "dark", palette: "github" });

      const v2State = { mode: "system", palette: "gruvbox" };
      const nonMigrated = persistOptions.migrate?.(v2State, 2);
      expect(nonMigrated).toEqual(v2State);
    });
  });
});
