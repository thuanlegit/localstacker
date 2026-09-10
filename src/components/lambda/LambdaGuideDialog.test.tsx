import { describe, expect, it, vi, beforeEach } from "vitest";
import { fireEvent, screen } from "@testing-library/react";
import { LambdaGuideDialog } from "./LambdaGuideDialog";
import { renderWithProviders } from "@/test/utils";

describe("LambdaGuideDialog", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Object.assign(navigator, {
      clipboard: {
        writeText: vi.fn().mockResolvedValue(undefined),
      },
    });
  });

  it("renders guide dialog and allows switching snippet tabs", () => {
    renderWithProviders(
      <LambdaGuideDialog open={true} onOpenChange={vi.fn()} />,
    );

    expect(screen.getByText("Lambda Setup & Usage Guide")).toBeInTheDocument();
    expect(
      screen.getByText(/awslocal lambda create-function/i),
    ).toBeInTheDocument();

    // Switch to TypeScript / Node.js tab
    fireEvent.click(
      screen.getByRole("button", { name: "TypeScript / Node.js" }),
    );
    expect(screen.getByText(/CreateFunctionCommand/i)).toBeInTheDocument();

    // Switch to Terraform tab
    fireEvent.click(screen.getByRole("button", { name: "Terraform" }));
    expect(screen.getByText(/aws_lambda_function/i)).toBeInTheDocument();
  });

  it("contains overflow-safe containers for wide code snippets", () => {
    renderWithProviders(
      <LambdaGuideDialog open={true} onOpenChange={vi.fn()} />,
    );

    // Switch to TypeScript / Node.js which has wide lines
    fireEvent.click(
      screen.getByRole("button", { name: "TypeScript / Node.js" }),
    );

    const dialog = screen.getByRole("dialog");
    expect(dialog.className).toContain("max-w-2xl");
    expect(dialog.className).not.toContain("sm:max-w-lg");
    expect(dialog.className).toContain("min-w-0");

    const pre = screen.getByText(/CreateFunctionCommand/i).closest("pre");
    expect(pre).not.toBeNull();
    expect(pre?.className).toContain("overflow-x-auto");
    expect(pre?.className).toContain("min-w-0");

    const card = pre?.parentElement;
    expect(card?.className).toContain("overflow-hidden");
    expect(card?.className).toContain("min-w-0");
  });

  it("copies snippet when copy button clicked", async () => {
    renderWithProviders(
      <LambdaGuideDialog open={true} onOpenChange={vi.fn()} />,
    );

    const copyBtn = screen.getByRole("button", { name: "Copy snippet" });
    fireEvent.click(copyBtn);

    expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
      expect.stringContaining("awslocal lambda create-function"),
    );
  });
});
