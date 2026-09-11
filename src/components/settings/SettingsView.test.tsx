import { beforeEach, describe, expect, it } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { SettingsView } from "./SettingsView";
import { useTheme } from "@/store/theme";

describe("SettingsView", () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.className = "";
    delete document.documentElement.dataset.palette;
    useTheme.setState({ mode: "dark", palette: "github" });
  });

  it("renders all four nav buttons", () => {
    render(<SettingsView />);
    expect(screen.getByRole("button", { name: "Appearance" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Connections" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Updates & About" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Data" })).toBeInTheDocument();
  });

  it("renders appearance section by default with mode and palette options", () => {
    render(<SettingsView />);
    expect(screen.getByRole("heading", { name: "Appearance" })).toBeInTheDocument();
    expect(screen.getByText("Choose how LocalStacker looks.")).toBeInTheDocument();
  });

  it("selecting Light in Theme select updates theme store mode to light", async () => {
    render(<SettingsView />);
    const trigger = screen.getByRole("combobox", { name: "Theme" });
    fireEvent.keyDown(trigger, { key: "ArrowDown", code: "ArrowDown" });

    const lightOption = await screen.findByRole("option", { name: "Light" });
    fireEvent.click(lightOption);

    expect(useTheme.getState().mode).toBe("light");
  });

  it("clicking the Nord palette card sets palette to nord and activates card with ring-2 and aria-pressed", () => {
    render(<SettingsView />);
    const nordBtn = screen.getByRole("button", { name: "Nord" });
    expect(nordBtn).toHaveAttribute("aria-pressed", "false");
    expect(nordBtn.className).not.toContain("ring-2");

    fireEvent.click(nordBtn);

    expect(useTheme.getState().palette).toBe("nord");
    expect(nordBtn).toHaveAttribute("aria-pressed", "true");
    expect(nordBtn.className).toContain("ring-2");
  });
});
