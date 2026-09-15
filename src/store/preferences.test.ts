import { beforeEach, describe, expect, it } from "vitest";
import { usePreferences } from "./preferences";

describe("preferences store", () => {
  beforeEach(() => {
    localStorage.clear();
    usePreferences.setState({ autoCheckUpdates: true, keepInMenuBar: false });
  });

  it("defaults autoCheckUpdates to true", () => {
    expect(usePreferences.getState().autoCheckUpdates).toBe(true);
  });

  it("updates autoCheckUpdates via setAutoCheckUpdates", () => {
    usePreferences.getState().setAutoCheckUpdates(false);
    expect(usePreferences.getState().autoCheckUpdates).toBe(false);

    usePreferences.getState().setAutoCheckUpdates(true);
    expect(usePreferences.getState().autoCheckUpdates).toBe(true);
  });

  it("defaults keepInMenuBar to false", () => {
    expect(usePreferences.getState().keepInMenuBar).toBe(false);
  });

  it("updates keepInMenuBar via setKeepInMenuBar", () => {
    usePreferences.getState().setKeepInMenuBar(true);
    expect(usePreferences.getState().keepInMenuBar).toBe(true);

    usePreferences.getState().setKeepInMenuBar(false);
    expect(usePreferences.getState().keepInMenuBar).toBe(false);
  });
});
