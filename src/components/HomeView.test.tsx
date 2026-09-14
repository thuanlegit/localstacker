import { describe, it, expect, vi, beforeEach } from "vitest";
import { fireEvent, screen } from "@testing-library/react";
import { HomeView } from "./HomeView";
import { openDonate } from "@/lib/support";
import { renderWithProviders } from "@/test/utils";
import { useTabs } from "@/store/tabs";
import { useRecents } from "@/store/recents";
import { useProfiles, localProfile, LOCAL_PROFILE_ID } from "@/store/profiles";
import type { HealthInfo } from "@/lib/health";

// Mutable holder the tests assign per case; the mock factory reads it lazily.
const healthState: { data: HealthInfo | undefined; isPending: boolean } = {
  data: undefined,
  isPending: false,
};

vi.mock("@/hooks/use-health", () => ({
  useHealth: () => healthState,
}));

vi.mock("@/lib/support", () => ({
  openDonate: vi.fn(),
}));

const upHealth: HealthInfo = {
  status: "up",
  version: "4.14.0",
  edition: "Community",
  services: [
    { name: "s3", status: "running" },
    { name: "sqs", status: "available" },
    { name: "ssm", status: "disabled" },
  ],
};

describe("HomeView", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useTabs.setState({ tabs: [], activeTabId: null });
    useRecents.setState({ recent: [] });
    useProfiles.setState({ profiles: [localProfile()], activeProfileId: LOCAL_PROFILE_ID });
    healthState.data = undefined;
    healthState.isPending = false;
    Object.assign(navigator, {
      clipboard: { writeText: vi.fn().mockResolvedValue(undefined) },
    });
  });

  it("renders up state with facts, 16 tiles, and status summary", () => {
    healthState.data = upHealth;
    renderWithProviders(<HomeView />);

    expect(screen.getByText("LocalStack is running")).toBeInTheDocument();
    expect(screen.getByText("4.14.0 Community")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /http:\/\/localhost:4566/ }),
    ).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: /^Open / })).toHaveLength(16);
    expect(screen.getByText("1 running, 14 available, 1 disabled")).toBeInTheDocument();
  });

  it("opens the service tab when a tile is clicked", () => {
    healthState.data = upHealth;
    renderWithProviders(<HomeView />);

    fireEvent.click(screen.getByRole("button", { name: "Open S3 (running)" }));
    const tab = useTabs.getState().tabs.find((t) => t.id === "service:s3");
    expect(tab?.title).toBe("S3");
    expect(useTabs.getState().activeTabId).toBe("service:s3");
  });

  it("renders down state with reason and copyable start command", async () => {
    healthState.data = { status: "down", reason: "fetch failed" };
    renderWithProviders(<HomeView />);

    expect(screen.getByText("LocalStack is not running")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /http:\/\/localhost:4566/ }),
    ).toBeInTheDocument();
    expect(screen.getByText("fetch failed")).toBeInTheDocument();
    expect(
      screen.getByText(
        "docker run -d --name localstack -p 4566:4566 localstack/localstack",
      ),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Copy start command" }));
    await vi.waitFor(() => {
      expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
        "docker run -d --name localstack -p 4566:4566 localstack/localstack",
      );
    });
  });

  it("copies the endpoint when the endpoint chip is clicked", async () => {
    healthState.data = upHealth;
    renderWithProviders(<HomeView />);

    fireEvent.click(screen.getByRole("button", { name: /http:\/\/localhost:4566/ }));
    await vi.waitFor(() => {
      expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
        "http://localhost:4566",
      );
    });
  });

  it("renders recents and reopens a tab from a recent chip", () => {
    useRecents.setState({
      recent: [
        {
          id: "bucket:demo-bucket",
          kind: "bucket",
          bucketName: "demo-bucket",
          title: "demo-bucket",
        },
        { id: "docker", kind: "docker", title: "Docker" },
      ],
    });
    renderWithProviders(<HomeView />);

    expect(screen.getByText("Recently opened")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "demo-bucket" }));
    expect(useTabs.getState().activeTabId).toBe("bucket:demo-bucket");
  });

  it("hides the recents section when empty", () => {
    renderWithProviders(<HomeView />);
    expect(screen.queryByText("Recently opened")).not.toBeInTheDocument();
  });

  it("renders pending state without summary or diagnostic", () => {
    healthState.isPending = true;
    renderWithProviders(<HomeView />);

    expect(screen.getByText("Checking LocalStack")).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: /^Open / })).toHaveLength(16);
    expect(screen.queryByText(/\d+ running/)).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Copy start command" }),
    ).not.toBeInTheDocument();
  });

  it("opens the donation page when the footer chip is clicked", () => {
    renderWithProviders(<HomeView />);
    fireEvent.click(screen.getByRole("button", { name: /buy me a coffee/i }));
    expect(vi.mocked(openDonate)).toHaveBeenCalledTimes(1);
  });
});
