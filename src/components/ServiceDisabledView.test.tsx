import { describe, expect, it, vi, beforeEach } from "vitest";
import { fireEvent, screen } from "@testing-library/react";
import { ServiceDisabledView } from "./ServiceDisabledView";
import { renderWithProviders } from "@/test/utils";
import { LOCAL_PROFILE_ID, localProfile, useProfiles } from "@/store/profiles";

const mockHealthData = {
  status: "up" as const,
  version: "3.0.0",
  services: [
    { name: "s3", status: "running" },
    { name: "sqs", status: "disabled" },
    { name: "lambda", status: "available" },
  ],
};

vi.mock("@/hooks/use-health", () => ({
  useHealth: () => ({
    data: mockHealthData,
    refetch: vi.fn(),
  }),
}));

describe("ServiceDisabledView", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useProfiles.setState({
      profiles: [localProfile()],
      activeProfileId: LOCAL_PROFILE_ID,
    });
    // Mock navigator.clipboard
    Object.assign(navigator, {
      clipboard: {
        writeText: vi.fn().mockResolvedValue(undefined),
      },
    });
  });

  it("renders heading, status pill, and explanation for SQS", () => {
    renderWithProviders(<ServiceDisabledView service="sqs" />);

    expect(screen.getByText("SQS is turned off")).toBeInTheDocument();
    expect(screen.getByText("Disabled in LocalStack")).toBeInTheDocument();
    expect(screen.getAllByText(/SERVICES/).length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText(/Currently running services:/)).toBeInTheDocument();
    expect(screen.getByText("s3, lambda")).toBeInTheDocument();
  });

  it("toggles between compose and cli snippets and copies snippet", async () => {
    renderWithProviders(<ServiceDisabledView service="sqs" />);

    // Default tab is compose
    expect(screen.getByText(/environment:\s+- SERVICES=\.\.\.,sqs/)).toBeInTheDocument();

    // Switch to CLI
    fireEvent.click(screen.getByRole("button", { name: "docker CLI" }));
    expect(
      screen.getByText(/docker run -e SERVICES=\.\.\.,sqs -p 4566:4566 localstack\/localstack/),
    ).toBeInTheDocument();

    // Copy snippet
    const copyBtn = screen.getByRole("button", { name: "Copy snippet" });
    fireEvent.click(copyBtn);

    expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
      "docker run -e SERVICES=...,sqs -p 4566:4566 localstack/localstack",
    );
  });

  it("calls onRetry when Check again button is clicked", () => {
    const onRetry = vi.fn();
    renderWithProviders(<ServiceDisabledView service="sqs" onRetry={onRetry} />);

    fireEvent.click(screen.getByRole("button", { name: /Check again/i }));
    expect(onRetry).toHaveBeenCalledOnce();
  });
});
