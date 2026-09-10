import { describe, expect, it, vi, beforeEach } from "vitest";
import { fireEvent, screen } from "@testing-library/react";
import { DynamoGuideDialog } from "./DynamoGuideDialog";
import { renderWithProviders } from "@/test/utils";

describe("DynamoGuideDialog", () => {
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
      <DynamoGuideDialog open={true} onOpenChange={vi.fn()} />,
    );

    expect(screen.getByText("DynamoDB Setup & Usage Guide")).toBeInTheDocument();
    expect(screen.getByText(/awslocal dynamodb create-table/i)).toBeInTheDocument();

    // Switch to SDK tab
    fireEvent.click(screen.getByRole("button", { name: "TypeScript / Node.js" }));
    expect(screen.getByText(/CreateTableCommand/i)).toBeInTheDocument();
  });

  it("contains overflow-safe containers for wide code snippets like TypeScript/Node.js", () => {
    renderWithProviders(
      <DynamoGuideDialog open={true} onOpenChange={vi.fn()} />,
    );

    // Switch to TypeScript / Node.js which has wide lines
    fireEvent.click(screen.getByRole("button", { name: "TypeScript / Node.js" }));

    const dialog = screen.getByRole("dialog");
    // Verify dialog content is wide enough and doesn't have sm:max-w-lg constraining it
    expect(dialog.className).toContain("max-w-2xl");
    expect(dialog.className).not.toContain("sm:max-w-lg");
    expect(dialog.className).toContain("min-w-0");
    expect(dialog.className).toContain("overflow-y-auto");

    // The pre element rendering the code must have min-w-0 and overflow-x-auto to scroll within the card
    const pre = screen.getByText(/CreateTableCommand/i).closest("pre");
    expect(pre).not.toBeNull();
    expect(pre?.className).toContain("overflow-x-auto");
    expect(pre?.className).toContain("min-w-0");

    // The outer card container must have min-w-0 and overflow-hidden to prevent spilling out of the modal
    const card = pre?.parentElement;
    expect(card?.className).toContain("overflow-hidden");
    expect(card?.className).toContain("min-w-0");
  });

  it("copies snippet when copy button clicked", async () => {
    renderWithProviders(
      <DynamoGuideDialog open={true} onOpenChange={vi.fn()} />,
    );

    const copyBtn = screen.getByRole("button", { name: "Copy snippet" });
    fireEvent.click(copyBtn);

    expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
      expect.stringContaining("awslocal dynamodb create-table"),
    );
  });
});
