import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { Dialog, DialogContent } from "./dialog";

describe("DialogContent layout and overflow protection", () => {
  it("includes viewport max-height, vertical scroll, and min-w-0 by default", () => {
    render(
      <Dialog open={true}>
        <DialogContent>
          <div>Dialog Content</div>
        </DialogContent>
      </Dialog>,
    );

    const dialog = screen.getByRole("dialog");
    expect(dialog.className).toContain("min-w-0");
    expect(dialog.className).toContain("max-h-[calc(100vh-4rem)]");
    expect(dialog.className).toContain("overflow-y-auto");
    expect(dialog.className).toContain("sm:max-w-lg");
  });

  it("does not inject sm:max-w-lg when custom max-w is provided", () => {
    render(
      <Dialog open={true}>
        <DialogContent className="max-w-2xl">
          <div>Wide Dialog Content</div>
        </DialogContent>
      </Dialog>,
    );

    const dialog = screen.getByRole("dialog");
    expect(dialog.className).toContain("max-w-2xl");
    expect(dialog.className).not.toContain("sm:max-w-lg");
  });

  it("supports responsive sm:max-w custom classes without collision", () => {
    render(
      <Dialog open={true}>
        <DialogContent className="sm:max-w-xl">
          <div>XL Dialog Content</div>
        </DialogContent>
      </Dialog>,
    );

    const dialog = screen.getByRole("dialog");
    expect(dialog.className).toContain("sm:max-w-xl");
    expect(dialog.className).not.toContain("sm:max-w-lg");
  });

  it("allows custom overflow override like overflow-hidden", () => {
    render(
      <Dialog open={true}>
        <DialogContent className="overflow-hidden p-0">
          <div>Command Dialog Content</div>
        </DialogContent>
      </Dialog>,
    );

    const dialog = screen.getByRole("dialog");
    expect(dialog.className).toContain("overflow-hidden");
    expect(dialog.className).not.toContain("overflow-y-auto");
  });
});
