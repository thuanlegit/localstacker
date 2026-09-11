import type { PaletteId } from "@/types";

export interface PaletteMeta {
  id: PaletteId;
  label: string;
  /** Preview chip colors (dark-variant values). */
  swatch: { bg: string; primary: string; accent: string };
}

export const PALETTES: readonly PaletteMeta[] = [
  {
    id: "github",
    label: "GitHub",
    swatch: { bg: "#0D1117", primary: "#2F81F7", accent: "#3FB950" },
  },
  {
    id: "dracula",
    label: "Dracula",
    swatch: { bg: "#282A36", primary: "#BD93F9", accent: "#FF79C6" },
  },
  {
    id: "one-dark",
    label: "One Dark",
    swatch: { bg: "#282C34", primary: "#61AFEF", accent: "#98C379" },
  },
  {
    id: "claude",
    label: "Claude",
    swatch: { bg: "#262624", primary: "#D97757", accent: "#E0B089" },
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
