import { describe, expect, it, vi, beforeEach } from "vitest";
import { fireEvent, screen } from "@testing-library/react";
import { Sidebar } from "./Sidebar";
import { renderWithProviders } from "@/test/utils";
import { LOCAL_PROFILE_ID, localProfile, useProfiles } from "@/store/profiles";
import { useTabs } from "@/store/tabs";

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

describe("Sidebar", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useTabs.setState({ tabs: [], activeTabId: null });
    useProfiles.setState({
      profiles: [localProfile()],
      activeProfileId: LOCAL_PROFILE_ID,
    });
  });

  it("renders services and shows 'Off' badge on disabled services", () => {
    renderWithProviders(<Sidebar />);

    // S3 is running -> no Off badge
    const s3Btn = screen.getByRole("button", { name: /^S3/ });
    expect(s3Btn).toBeInTheDocument();

    // SQS is disabled -> has Off badge
    const sqsBtn = screen.getByRole("button", { name: /^SQS/ });
    expect(sqsBtn).toBeInTheDocument();
    expect(screen.getByText("Off")).toBeInTheDocument();
  });

  it("opens service tab when clicked", () => {
    renderWithProviders(<Sidebar />);

    fireEvent.click(screen.getByRole("button", { name: /^SQS/ }));
    expect(useTabs.getState().tabs).toEqual([
      { id: "service:sqs", kind: "service", service: "sqs", title: "SQS" },
    ]);
  });
});
