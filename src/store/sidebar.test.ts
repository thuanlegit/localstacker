import { describe, it, expect, beforeEach } from "vitest";
import { useSidebar } from "./sidebar";

describe("useSidebar store", () => {
  beforeEach(() => {
    useSidebar.setState({ isCollapsed: false });
  });

  it("defaults to expanded (isCollapsed: false)", () => {
    expect(useSidebar.getState().isCollapsed).toBe(false);
  });

  it("toggles collapsed state", () => {
    useSidebar.getState().toggle();
    expect(useSidebar.getState().isCollapsed).toBe(true);

    useSidebar.getState().toggle();
    expect(useSidebar.getState().isCollapsed).toBe(false);
  });

  it("sets collapsed explicitly", () => {
    useSidebar.getState().setCollapsed(true);
    expect(useSidebar.getState().isCollapsed).toBe(true);

    useSidebar.getState().setCollapsed(false);
    expect(useSidebar.getState().isCollapsed).toBe(false);
  });
});
