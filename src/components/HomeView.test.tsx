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

const identityState: { data: { account: string; arn: string; userId: string } | undefined } =
  { data: undefined };

vi.mock("@/hooks/use-sts", () => ({
  useCallerIdentity: () => identityState,
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
    identityState.data = undefined;
    Object.assign(navigator, {
      clipboard: { writeText: vi.fn().mockResolvedValue(undefined) },
    });
  });

  it("renders up state with facts, 21 tiles, and status summary", () => {
    healthState.data = upHealth;
    renderWithProviders(<HomeView />);

    expect(screen.getByText("LocalStack is running")).toBeInTheDocument();
    expect(screen.getByText("4.14.0 Community")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /http:\/\/localhost:4566/ }),
    ).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: /^Open / })).toHaveLength(21);
    expect(screen.getByText("1 running, 19 available, 1 disabled")).toBeInTheDocument();
  });

  it("renders the STS identity chip with account and arn tooltip", () => {
    healthState.data = upHealth;
    identityState.data = {
      account: "000000000000",
      arn: "arn:aws:iam::000000000000:root",
      userId: "AKIAEXAMPLE",
    };
    renderWithProviders(<HomeView />);

    const chip = screen.getByRole("button", { name: /acct 000000000000/ });
    expect(chip).toHaveAttribute("title", "arn:aws:iam::000000000000:root");
    fireEvent.click(chip);
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith("000000000000");
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
    expect(screen.getAllByRole("button", { name: /^Open / })).toHaveLength(21);
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
