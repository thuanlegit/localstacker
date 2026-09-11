import { describe, expect, it } from "vitest";
import { PALETTES } from "./palettes";
import type { PaletteId } from "@/types";

describe("palettes", () => {
  it("contains all 7 palette ids", () => {
    const expectedIds: PaletteId[] = [
      "default",
      "nord",
      "catppuccin",
      "gruvbox",
      "tokyo-night",
      "solarized",
      "rose-pine",
    ];
    const actualIds = PALETTES.map((p) => p.id);
    expect(actualIds).toHaveLength(7);
    for (const expectedId of expectedIds) {
      expect(actualIds).toContain(expectedId);
    }
  });

  it("has unique ids", () => {
    const ids = PALETTES.map((p) => p.id);
    const uniqueIds = new Set(ids);
    expect(uniqueIds.size).toBe(ids.length);
  });

  it("has non-empty labels and non-empty swatch values for all palettes", () => {
    for (const palette of PALETTES) {
      expect(palette.label.trim().length).toBeGreaterThan(0);
      expect(palette.swatch.bg.trim().length).toBeGreaterThan(0);
      expect(palette.swatch.primary.trim().length).toBeGreaterThan(0);
      expect(palette.swatch.accent.trim().length).toBeGreaterThan(0);
    }
  });
});
