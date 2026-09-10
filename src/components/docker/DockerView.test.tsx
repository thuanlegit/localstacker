import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { DockerView } from "./DockerView";
import { renderWithProviders } from "@/test/utils";
import type { ContainerSummary, DockerStatus } from "@/lib/docker";

const { mockStartContainer, mockStopContainer, mockRestartContainer, mockRemoveContainer } =
  vi.hoisted(() => ({
    mockStartContainer: vi.fn(),
    mockStopContainer: vi.fn(),
    mockRestartContainer: vi.fn(),
    mockRemoveContainer: vi.fn(),
  }));

let mockStatus: DockerStatus | undefined;
let mockContainers: ContainerSummary[] = [];
let mockAdapterKind: "tauri" | "mock" = "tauri";

vi.mock("@/hooks/use-docker", () => ({
  useDockerAdapter: () => ({ kind: mockAdapterKind }),
  useDockerStatus: () => ({
    data: mockStatus,
    isLoading: false,
    refetch: vi.fn(),
  }),
  useDockerContainers: () => ({
    data: mockContainers,
    isLoading: false,
    isFetching: false,
    refetch: vi.fn(),
  }),
  useDockerInspect: () => ({
    data: undefined,
    isLoading: false,
  }),
  useDockerActions: () => ({
    willLoseState: (container: ContainerSummary) => !container.persists,
    startContainer: mockStartContainer,
    stopContainer: mockStopContainer,
    restartContainer: mockRestartContainer,
    removeContainer: mockRemoveContainer,
    connectContainer: vi.fn(),
    createAndConnect: vi.fn(),
  }),
}));

const seedContainers: ContainerSummary[] = [
  {
    containerId: "c-demo-localstack",
    name: "demo-localstack",
    image: "localstack/localstack:4.14.0",
    state: "running",
    status: "Up 2 hours",
    createdAt: 1_750_000_000,
    hostPorts: [4566],
    persists: false,
  },
  {
    containerId: "c-demo-localstack-persist",
    name: "demo-localstack-persist",
    image: "gresau/localstack-persist:latest",
    state: "exited",
    status: "Exited (0)",
    createdAt: 1_750_000_000,
    hostPorts: [4567],
    persists: true,
  },
];

describe("DockerView", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAdapterKind = "tauri";
    mockStatus = { available: true, version: "27.5.1" };
    mockContainers = seedContainers;
  });

  afterEach(() => {
    cleanup();
  });

  it("shows Docker daemon status row with version when available", () => {
    renderWithProviders(<DockerView />);

    expect(screen.getByText(/Docker daemon/)).toBeInTheDocument();
    expect(screen.getByText(/27\.5\.1/)).toBeInTheDocument();
  });

  it("shows unavailable status with guidance and retry button", () => {
    mockStatus = {
      available: false,
      errorKind: "unavailable",
      reason: "connect ECONNREFUSED",
    };
    renderWithProviders(<DockerView />);

    expect(screen.getByText("Docker Unavailable")).toBeInTheDocument();
    expect(screen.getByText(/Start Docker Desktop/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Retry" })).toBeInTheDocument();
  });

  it("shows permission status with docker group guidance", () => {
    mockStatus = {
      available: false,
      errorKind: "permission",
      reason: "permission denied: /var/run/docker.sock",
    };
    renderWithProviders(<DockerView />);

    expect(screen.getByText("Docker Permission Denied")).toBeInTheDocument();
    expect(
      screen.getByText(/add your user to the docker group/),
    ).toBeInTheDocument();
  });

  it("shows Demo data badge when adapter kind is mock", () => {
    mockAdapterKind = "mock";
    renderWithProviders(<DockerView />);

    expect(screen.getByText("Demo data")).toBeInTheDocument();
  });

  it("renders seeded rows with state badges and persistence badge", () => {
    renderWithProviders(<DockerView />);

    expect(screen.getByText("demo-localstack")).toBeInTheDocument();
    expect(screen.getByText("demo-localstack-persist")).toBeInTheDocument();

    expect(screen.getByText("running")).toBeInTheDocument();
    expect(screen.getByText("exited")).toBeInTheDocument();
    expect(screen.getByText("Persist image")).toBeInTheDocument();
  });

  it("opens warning dialog on stop for vanilla container and confirms stop", async () => {
    const user = userEvent.setup();
    renderWithProviders(<DockerView />);

    await user.click(
      screen.getByRole("button", { name: "Actions for demo-localstack" }),
    );
    await user.click(await screen.findByText("Stop"));

    expect(await screen.findByText("Stop demo-localstack?")).toBeInTheDocument();
    expect(
      screen.getByText(/This container has no persistence volume/),
    ).toBeInTheDocument();

    mockStopContainer.mockResolvedValueOnce(true);
    await user.click(screen.getByRole("button", { name: "Stop" }));

    await waitFor(() => {
      expect(mockStopContainer).toHaveBeenCalledWith(seedContainers[0]);
    });
  });

  it("stops persist container directly without warning", async () => {
    mockContainers = [seedContainers[1]];
    const user = userEvent.setup();
    renderWithProviders(<DockerView />);

    await user.click(
      screen.getByRole("button", {
        name: "Actions for demo-localstack-persist",
      }),
    );
    await user.click(await screen.findByText("Stop"));

    await waitFor(() => {
      expect(mockStopContainer).toHaveBeenCalledWith(seedContainers[1]);
    });
    expect(
      screen.queryByText("Stop demo-localstack-persist?"),
    ).not.toBeInTheDocument();
  });

  it("opens remove dialog with volume checkbox and confirms removal", async () => {
    const user = userEvent.setup();
    renderWithProviders(<DockerView />);

    await user.click(
      screen.getByRole("button", { name: "Actions for demo-localstack" }),
    );
    await user.click(await screen.findByText("Remove"));

    expect(await screen.findByText("Remove demo-localstack?")).toBeInTheDocument();

    const checkbox = screen.getByLabelText("Also delete named volumes");
    await user.click(checkbox);
    expect(checkbox).toBeChecked();

    mockRemoveContainer.mockResolvedValueOnce(true);
    await user.click(screen.getByRole("button", { name: "Remove" }));

    await waitFor(() => {
      expect(mockRemoveContainer).toHaveBeenCalledWith("c-demo-localstack", true);
    });
  });

  it("disables Connect action when container is exited", async () => {
    const user = userEvent.setup();
    renderWithProviders(<DockerView />);

    await user.click(
      screen.getByRole("button", {
        name: "Actions for demo-localstack-persist",
      }),
    );

    const connectItem = await screen.findByText("Connect");
    expect(connectItem).toHaveAttribute("data-disabled");
  });

  it("shows empty state when no containers", () => {
    mockContainers = [];
    renderWithProviders(<DockerView />);

    expect(
      screen.getByText("No LocalStack containers found"),
    ).toBeInTheDocument();
  });
});
