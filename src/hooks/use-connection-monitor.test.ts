import { describe, expect, it, vi, beforeEach } from "vitest";
import { renderHook } from "@testing-library/react";
import type { UseQueryResult } from "@tanstack/react-query";
import { toast } from "sonner";
import { useConnectionMonitor } from "./use-connection-monitor";
import { useHealth } from "@/hooks/use-health";
import type { HealthInfo } from "@/lib/health";
import { useOnboarding } from "@/store/onboarding";

vi.mock("sonner", () => ({
  toast: {
    error: vi.fn(),
    success: vi.fn(),
  },
}));

vi.mock("@/hooks/use-health", () => ({
  useHealth: vi.fn(),
}));

function mockHealth(data: HealthInfo) {
  vi.mocked(useHealth).mockReturnValue({
    data,
  } as unknown as UseQueryResult<HealthInfo, Error>);
}

describe("useConnectionMonitor", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useOnboarding.setState({ completedAt: 12345 });
  });

  it("does not toast on initial render", () => {
    mockHealth({ status: "up", version: "4.14.0", services: [] });

    renderHook(() => useConnectionMonitor());

    expect(toast.error).not.toHaveBeenCalled();
    expect(toast.success).not.toHaveBeenCalled();
  });

  it("does not toast when user has not completed onboarding", () => {
    useOnboarding.setState({ completedAt: null });
    mockHealth({ status: "up", version: "4.14.0", services: [] });

    const { rerender } = renderHook(() => useConnectionMonitor());

    mockHealth({ status: "down", reason: "connection refused" });

    rerender();

    expect(toast.error).not.toHaveBeenCalled();
    expect(toast.success).not.toHaveBeenCalled();
  });

  it("toasts error when transitioning from up to down", () => {
    mockHealth({ status: "up", version: "4.14.0", services: [] });

    const { rerender } = renderHook(() => useConnectionMonitor());

    mockHealth({ status: "down", reason: "connection refused" });

    rerender();

    expect(toast.error).toHaveBeenCalledTimes(1);
    expect(toast.error).toHaveBeenCalledWith(
      "LocalStack stopped or container removed",
      expect.objectContaining({
        id: "localstack-connection-status",
        description: expect.stringContaining("Connection lost"),
      }),
    );
  });

  it("toasts success when transitioning from down to up", () => {
    mockHealth({ status: "down", reason: "connection refused" });

    const { rerender } = renderHook(() => useConnectionMonitor());

    mockHealth({ status: "up", version: "4.14.0", services: [] });

    rerender();

    expect(toast.success).toHaveBeenCalledTimes(1);
    expect(toast.success).toHaveBeenCalledWith(
      "LocalStack connected",
      expect.objectContaining({
        id: "localstack-connection-status",
      }),
    );
  });

  it("does not toast when status remains unchanged", () => {
    mockHealth({ status: "down", reason: "connection refused" });

    const { rerender } = renderHook(() => useConnectionMonitor());

    mockHealth({ status: "down", reason: "still refused" });

    rerender();

    expect(toast.error).not.toHaveBeenCalled();
    expect(toast.success).not.toHaveBeenCalled();
  });
});
