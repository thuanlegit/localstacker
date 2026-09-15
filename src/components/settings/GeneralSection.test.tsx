import { beforeEach, describe, expect, it } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { GeneralSection } from "./GeneralSection";
import { usePreferences } from "@/store/preferences";

describe("GeneralSection", () => {
  beforeEach(() => {
    localStorage.clear();
    usePreferences.setState({ keepInMenuBar: false });
  });

  it("renders heading and helper text", () => {
    render(<GeneralSection />);

    expect(screen.getByRole("heading", { name: "General" })).toBeInTheDocument();
    expect(
      screen.getByText(
        "When on, closing the window keeps LocalStacker running in the macOS menu bar with LocalStack status.",
      ),
    ).toBeInTheDocument();
  });

  it("On/Off select flips usePreferences.getState().keepInMenuBar", async () => {
    render(<GeneralSection />);

    expect(usePreferences.getState().keepInMenuBar).toBe(false);

    const trigger = screen.getByRole("combobox", { name: "Keep running in the menu bar" });
    fireEvent.keyDown(trigger, { key: "ArrowDown", code: "ArrowDown" });

    const onOption = await screen.findByRole("option", { name: "On" });
    fireEvent.click(onOption);

    expect(usePreferences.getState().keepInMenuBar).toBe(true);

    fireEvent.keyDown(trigger, { key: "ArrowDown", code: "ArrowDown" });
    const offOption = await screen.findByRole("option", { name: "Off" });
    fireEvent.click(offOption);

    expect(usePreferences.getState().keepInMenuBar).toBe(false);
  });
});
