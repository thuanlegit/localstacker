import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { HostedZoneView } from "./HostedZoneView";
import { useTabs } from "@/store/tabs";

vi.mock("@tanstack/react-virtual", () => ({
  useVirtualizer: (options: { count: number }) => ({
    getVirtualItems: () =>
      Array.from({ length: options.count }, (_, i) => ({
        index: i,
        key: i,
        start: i * 44,
        size: 44,
      })),
    getTotalSize: () => options.count * 44,
    measureElement: vi.fn(),
  }),
}));

const mockDeleteHostedZone = vi.fn();
const mockDeleteRecordSet = vi.fn();

vi.mock("@/hooks/use-route53", () => ({
  useHostedZones: () => ({
    data: [
      {
        id: "Z12345",
        rawId: "/hostedzone/Z12345",
        name: "test.local.",
        callerReference: "ref-1",
        privateZone: false,
        recordCount: 3,
      },
    ],
    isLoading: false,
    refetch: vi.fn(),
  }),
  useResourceRecordSets: () => ({
    data: [
      {
        name: "test.local.",
        type: "NS",
        ttl: 172800,
        values: ["ns1.localstack.com."],
      },
      {
        name: "api.test.local.",
        type: "A",
        ttl: 300,
        values: ["192.0.2.42"],
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
  useRecordSetActions: () => ({
    deleteRecordSet: mockDeleteRecordSet,
    createRecordSet: vi.fn(),
    updateRecordSet: vi.fn(),
  }),
}));

describe("HostedZoneView", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders hosted zone details and virtualized records", () => {
    render(<HostedZoneView zoneId="Z12345" />);

    expect(screen.getAllByText("test.local.").length).toBeGreaterThan(0);
    expect(screen.getByText("Z12345")).toBeInTheDocument();
    expect(screen.getByText("api.test.local.")).toBeInTheDocument();
    expect(screen.getByText("192.0.2.42")).toBeInTheDocument();
  });

  it("protects apex NS record from deletion", () => {
    render(<HostedZoneView zoneId="Z12345" />);

    expect(screen.getByTitle("Apex system record")).toBeInTheDocument();
    expect(
      screen.getByTitle("Apex system record protected from deletion"),
    ).toBeInTheDocument();
  });

  it("deletes hosted zone and closes tab", async () => {
    mockDeleteHostedZone.mockResolvedValueOnce(true);
    const closeTabSpy = vi.spyOn(useTabs.getState(), "closeTab");
    const user = userEvent.setup();

    render(<HostedZoneView zoneId="Z12345" />);

    const deleteBtn = screen.getByRole("button", { name: /Delete Zone/ });
    await user.click(deleteBtn);

    expect(
      screen.getByText(/Are you sure you want to delete hosted zone "test.local."/),
    ).toBeInTheDocument();

    const confirmBtn = screen.getByRole("button", { name: "Delete" });
    await user.click(confirmBtn);

    expect(mockDeleteHostedZone).toHaveBeenCalledWith("Z12345", "test.local.");
    expect(closeTabSpy).toHaveBeenCalledWith("hostedZone:Z12345");
  });
});
