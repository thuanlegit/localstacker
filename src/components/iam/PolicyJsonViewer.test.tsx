import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { PolicyJsonViewer } from "./PolicyJsonViewer";

describe("PolicyJsonViewer", () => {
  const samplePolicy = JSON.stringify({
    Version: "2012-10-17",
    Statement: [
      {
        Effect: "Allow",
        Action: "s3:ListBucket",
        Resource: "*",
      },
    ],
  });

  const writeTextMock = vi.fn().mockResolvedValue(undefined);

  beforeEach(() => {
    vi.clearAllMocks();
    Object.assign(navigator, {
      clipboard: {
        writeText: writeTextMock,
      },
    });
  });

  it("renders syntax-highlighted json keys and strings", () => {
    render(<PolicyJsonViewer json={samplePolicy} />);

    expect(screen.getByText('"Version"')).toBeInTheDocument();
    expect(screen.getByText('"2012-10-17"')).toBeInTheDocument();
    expect(screen.getByText('"Statement"')).toBeInTheDocument();
  });

  it("handles non-JSON string gracefully", () => {
    render(<PolicyJsonViewer json="Plain unformatted text" />);
    expect(screen.getByText("Plain unformatted text")).toBeInTheDocument();
  });

  it("copies formatted json to clipboard", () => {
    render(<PolicyJsonViewer json={samplePolicy} />);

    const copyBtn = screen.getByRole("button", { name: /copy/i });
    fireEvent.click(copyBtn);

    expect(writeTextMock).toHaveBeenCalled();
  });
});
