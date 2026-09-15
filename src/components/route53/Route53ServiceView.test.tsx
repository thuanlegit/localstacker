import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Route53ServiceView } from "./Route53ServiceView";
import { useTabs } from "@/store/tabs";

const mockDeleteHostedZone = vi.fn();
const { mockState } = vi.hoisted(() => ({
  mockState: {
    serviceStatus: "available" as string | undefined,
    zonesError: null as Error | null,
  },
}));

vi.mock("@/hooks/use-health", () => ({
  useServiceStatus: () => mockState.serviceStatus,
  useHealth: () => ({ data: undefined, refetch: vi.fn() }),
  isServiceDisabledError: (err: unknown) =>
    err instanceof Error && err.message.includes("is not enabled"),
}));

vi.mock("@/hooks/use-route53resolver", () => ({
  useResolverEndpoints: () => ({
    data: [],
    isPending: false,
    isFetching: false,
    error: null,
    refetch: vi.fn(),
  }),
  useResolverRules: () => ({
    data: [],
    isPending: false,
    isFetching: false,
    error: null,
    refetch: vi.fn(),
  }),
}));

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
    error: mockState.zonesError,
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
    mockState.serviceStatus = "available";
    mockState.zonesError = null;
  });

  it("shows the disabled view when Route 53 is disabled in LocalStack", () => {
    mockState.serviceStatus = "disabled";
    render(<Route53ServiceView />);

    expect(screen.getByText("Route 53 is turned off")).toBeInTheDocument();
    expect(screen.queryByText("example.local.")).not.toBeInTheDocument();
  });

  it("shows the disabled view when the Route 53 API reports it is not enabled", () => {
    mockState.zonesError = new Error(
      "The route53 service is not enabled in this LocalStack instance",
    );
    render(<Route53ServiceView />);

    expect(screen.getByText("Route 53 is turned off")).toBeInTheDocument();
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
