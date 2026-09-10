import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Route53ServiceView } from "./Route53ServiceView";
import { useTabs } from "@/store/tabs";

const mockDeleteHostedZone = vi.fn();

vi.mock("@/hooks/use-route53", () => ({
  useHostedZones: () => ({
    data: [
      {
        id: "Z12345",
        rawId: "/hostedzone/Z12345",
        name: "example.local.",
        callerReference: "ref1",
        privateZone: false,
        recordCount: 2,
        comment: "My local zone",
      },
    ],
    isLoading: false,
    isFetching: false,
    refetch: vi.fn(),
  }),
  useHostedZoneActions: () => ({
    deleteHostedZone: mockDeleteHostedZone,
    createHostedZone: vi.fn(),
  }),
}));

describe("Route53ServiceView", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders Route 53 header and lists hosted zones", () => {
    render(<Route53ServiceView />);

    expect(screen.getByText("Route 53")).toBeInTheDocument();
    expect(screen.getByText("example.local.")).toBeInTheDocument();
    expect(screen.getByText("Z12345")).toBeInTheDocument();
    expect(screen.getByText("Public")).toBeInTheDocument();
  });

  it("opens hosted zone tab when clicking domain name", async () => {
    const openTabSpy = vi.spyOn(useTabs.getState(), "openTab");
    const user = userEvent.setup();

    render(<Route53ServiceView />);

    const zoneBtn = screen.getByRole("button", { name: /example.local./ });
    await user.click(zoneBtn);

    expect(openTabSpy).toHaveBeenCalledWith({
      id: "hostedZone:Z12345",
      kind: "hostedZone",
      zoneId: "Z12345",
      title: "example.local.",
    });
  });
});
