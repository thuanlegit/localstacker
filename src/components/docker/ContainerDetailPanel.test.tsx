import { describe, expect, it, vi, beforeEach } from "vitest";
import { fireEvent, screen } from "@testing-library/react";
import { ContainerDetailPanel } from "./ContainerDetailPanel";
import { renderWithProviders } from "@/test/utils";
import type { ContainerDetail, ContainerSummary } from "@/lib/docker";

let mockDetail: ContainerDetail | undefined;

vi.mock("@/hooks/use-docker", () => ({
  useDockerInspect: () => ({
    data: mockDetail,
    isLoading: false,
  }),
}));

const baseSummary: ContainerSummary = {
  containerId: "c-demo-localstack",
  name: "demo-localstack",
  image: "localstack/localstack:4.14.0",
  state: "running",
  status: "Up 2 hours",
  createdAt: 1_750_000_000,
  hostPorts: [4566],
  persists: false,
};

const detailData: ContainerDetail = {
  ...baseSummary,
  env: [
    "SERVICES=s3,sqs",
    "LOCALSTACK_AUTH_TOKEN=secret-token",
    "DEBUG=1",
  ],
  mounts: [
    {
      type: "volume",
      name: "localstacker-demo",
      source: "/var/lib/docker/volumes/localstacker-demo/_data",
      destination: "/var/lib/localstack",
    },
  ],
  networks: ["bridge"],
  restartPolicy: "unless-stopped",
  persistVolume: true,
};

describe("ContainerDetailPanel", () => {
  beforeEach(() => {
    mockDetail = detailData;
  });

  it("renders summary fields, mounts, and masked env by default", () => {
    renderWithProviders(<ContainerDetailPanel container={baseSummary} />);

    expect(screen.getByText("demo-localstack")).toBeInTheDocument();
    expect(screen.getByText("unless-stopped")).toBeInTheDocument();
    expect(screen.getByText(":4566")).toBeInTheDocument();
    expect(screen.getByText("localstacker-demo")).toBeInTheDocument();
    expect(screen.getByText("/var/lib/localstack")).toBeInTheDocument();
    expect(screen.getByText("bridge")).toBeInTheDocument();

    // masked by default
    expect(screen.getByText("LOCALSTACK_AUTH_TOKEN=***")).toBeInTheDocument();
    expect(screen.queryByText("LOCALSTACK_AUTH_TOKEN=secret-token")).not.toBeInTheDocument();
    // non-sensitive values visible
    expect(screen.getByText("SERVICES=s3,sqs")).toBeInTheDocument();
  });

  it("reveals raw env values on reveal toggle", () => {
    renderWithProviders(<ContainerDetailPanel container={baseSummary} />);

    fireEvent.click(screen.getByRole("button", { name: "Reveal values" }));

    expect(
      screen.getByText("LOCALSTACK_AUTH_TOKEN=secret-token"),
    ).toBeInTheDocument();
  });

  it("renders empty-state hints when detail has no mounts", () => {
    mockDetail = { ...detailData, mounts: [] };
    renderWithProviders(<ContainerDetailPanel container={baseSummary} />);

    expect(screen.getByText("No volumes or bind mounts")).toBeInTheDocument();
  });
});
