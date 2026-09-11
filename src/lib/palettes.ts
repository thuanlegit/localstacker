import type { PaletteId } from "@/types";

export interface PaletteMeta {
  id: PaletteId;
  label: string;
  /** Preview chip colors (dark-variant values). */
  swatch: { bg: string; primary: string; accent: string };
}

export const PALETTES: readonly PaletteMeta[] = [
  {
    id: "default",
    label: "Default",
    swatch: {
      bg: "oklch(0.145 0.005 285)",
      primary: "oklch(0.68 0.16 258)",
      accent: "oklch(0.28 0.02 260)",
    },
  },
  {
    id: "nord",
    label: "Nord",
    swatch: { bg: "#2E3440", primary: "#88C0D0", accent: "#81A1C1" },
  },
  {
    id: "catppuccin",
    label: "Catppuccin",
    swatch: { bg: "#1E1E2E", primary: "#89B4FA", accent: "#F5C2E7" },
  },
  {
    id: "gruvbox",
    label: "Gruvbox",
    swatch: { bg: "#282828", primary: "#83A598", accent: "#FABD2F" },
  },
  {
    id: "tokyo-night",
    label: "Tokyo Night",
    swatch: { bg: "#1A1B26", primary: "#7AA2F7", accent: "#BB9AF7" },
  },
  {
    id: "solarized",
    label: "Solarized",
    swatch: { bg: "#002B36", primary: "#268BD2", accent: "#2AA198" },
  },
  {
    id: "rose-pine",
    label: "Rosé Pine",
    swatch: { bg: "#191724", primary: "#C4A7E7", accent: "#9CCFD8" },
  },
];
