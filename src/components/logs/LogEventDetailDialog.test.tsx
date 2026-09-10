import { describe, expect, it, vi, beforeEach } from "vitest";
import { fireEvent, screen } from "@testing-library/react";
import { LogEventDetailDialog } from "./LogEventDetailDialog";
import { renderWithProviders } from "@/test/utils";
import type { LogEventRecord } from "@/lib/logs";

describe("LogEventDetailDialog", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Object.assign(navigator, {
      clipboard: {
        writeText: vi.fn().mockResolvedValue(undefined),
      },
    });
  });

  const mockEvent: LogEventRecord = {
    id: "event-1",
    timestamp: 1773000000000,
    streamName: "2026/09/10/[$LATEST]stream-1",
    message: '{"status": "success", "user": {"id": 42, "name": "Alice"}}',
  };

  it("renders log event details with formatted JSON by default when JSON is detected", () => {
    renderWithProviders(
      <LogEventDetailDialog
        event={mockEvent}
        logGroupName="/aws/lambda/demo"
        open={true}
        onOpenChange={vi.fn()}
      />,
    );

    expect(screen.getByText("Log Event Details")).toBeInTheDocument();
    expect(screen.getByText("/aws/lambda/demo")).toBeInTheDocument();
    expect(screen.getByText("JSON detected")).toBeInTheDocument();
    expect(screen.getByText(/Alice/)).toBeInTheDocument();
  });

  it("allows switching between Formatted JSON and Raw Text", () => {
    renderWithProviders(
      <LogEventDetailDialog
        event={mockEvent}
        logGroupName="/aws/lambda/demo"
        open={true}
        onOpenChange={vi.fn()}
      />,
    );

    const rawBtn = screen.getByRole("button", { name: /raw text/i });
    fireEvent.click(rawBtn);

    expect(
      screen.getByText('{"status": "success", "user": {"id": 42, "name": "Alice"}}'),
    ).toBeInTheDocument();
  });

  it("copies message to clipboard", async () => {
    renderWithProviders(
      <LogEventDetailDialog
        event={mockEvent}
        logGroupName="/aws/lambda/demo"
        open={true}
        onOpenChange={vi.fn()}
      />,
    );

    const copyBtn = screen.getByRole("button", { name: /copy message/i });
    fireEvent.click(copyBtn);

    expect(navigator.clipboard.writeText).toHaveBeenCalled();
  });
});
