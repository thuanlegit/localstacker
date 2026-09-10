import { describe, it, expect, vi } from "vitest";
import { screen } from "@testing-library/react";
import { HealthBadge } from "./HealthBadge";
import { renderWithProviders } from "@/test/utils";

vi.mock("@/hooks/use-health", () => ({
  useHealth: () => ({
    data: {
      status: "up",
      version: "4.14.0",
      services: [{ name: "ec2", status: "running" }],
    },
    isPending: false,
  }),
}));

describe("HealthBadge", () => {
  it("renders full label when expanded", () => {
    renderWithProviders(<HealthBadge collapsed={false} />);
    expect(screen.getByTestId("health-badge")).toBeInTheDocument();
    expect(screen.getByText(/Running · 4.14.0/i)).toBeInTheDocument();
  });

  it("renders compact dot without text label when collapsed", () => {
    renderWithProviders(<HealthBadge collapsed={true} />);
    const badge = screen.getByTestId("health-badge");
    expect(badge).toBeInTheDocument();
    expect(badge).toHaveClass("size-9");
    expect(screen.queryByText(/Running · 4.14.0/i)).not.toBeInTheDocument();
  });
});
