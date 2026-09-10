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
