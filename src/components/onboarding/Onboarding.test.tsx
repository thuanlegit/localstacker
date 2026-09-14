import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen } from "@testing-library/react";
import { Onboarding } from "./Onboarding";
import { renderWithProviders } from "@/test/utils";
import { useOnboarding } from "@/store/onboarding";
import { LOCAL_PROFILE_ID, localProfile, useProfiles } from "@/store/profiles";
import type { HealthInfo } from "@/lib/health";

// Mutable holders the tests assign per case; the mock factories read them lazily.
const healthMock = vi.hoisted(() => ({
  impl: () => new Promise<HealthInfo>(() => {}),
}));
const dockerMock = vi.hoisted(() => ({
  status: { data: undefined as { available?: boolean; reason?: string } | undefined, isPending: true },
  createAndConnect: vi.fn(),
}));

vi.mock("@/lib/health", () => ({
  checkHealth: () => healthMock.impl(),
}));
vi.mock("@/hooks/use-docker", () => ({
  useDockerStatus: () => dockerMock.status,
  useDockerActions: () => ({ createAndConnect: dockerMock.createAndConnect }),
}));

const downHealth: HealthInfo = {
  status: "down",
  reason: "connect ECONNREFUSED 127.0.0.1:4566",
};
const upHealth: HealthInfo = {
  status: "up",
  version: "4.14.0",
  services: [
    { name: "s3", status: "running" },
    { name: "sqs", status: "available" },
  ],
};

describe("Onboarding", () => {
  beforeEach(() => {
    localStorage.clear();
    useOnboarding.setState({ completedAt: null });
    useProfiles.setState({ profiles: [localProfile()], activeProfileId: LOCAL_PROFILE_ID });
    delete (window as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__;
    healthMock.impl = () => new Promise<HealthInfo>(() => {});
    dockerMock.status = { data: undefined, isPending: true };
    dockerMock.createAndConnect = vi.fn(() => new Promise(() => {}));
  });

  it("renders checking state with 17 lamp rows while health is pending", () => {
    renderWithProviders(<Onboarding />);
    expect(screen.getByText("Checking…")).toBeInTheDocument();
    expect(screen.getAllByTestId(/^onboarding-lamp-/)).toHaveLength(17);
  });

  it("renders down state with reason, copy fallback, and no Start button", async () => {
    healthMock.impl = () => Promise.resolve(downHealth);
    renderWithProviders(<Onboarding />);

    expect(await screen.findByText("Not running")).toBeInTheDocument();
    expect(screen.getByText("connect ECONNREFUSED 127.0.0.1:4566")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Copy docker command" }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Start LocalStack" })).toBeNull();
    expect(
      screen.getByText("LocalStacker rechecks every few seconds."),
    ).toBeInTheDocument();
  });

  it("renders up state with version and completes when Open LocalStacker is clicked", async () => {
    healthMock.impl = () => Promise.resolve(upHealth);
    renderWithProviders(<Onboarding />);

    expect(await screen.findByText(/Connected/)).toBeInTheDocument();
    expect(screen.getByText(/4\.14\.0/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Open LocalStacker" }));
    expect(useOnboarding.getState().completedAt).not.toBeNull();
  });

  it("starts LocalStack via Docker with the fixed one-click input", async () => {
    healthMock.impl = () => Promise.resolve(downHealth);
    (window as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__ = {};
    dockerMock.status = { data: { available: true }, isPending: false };
    renderWithProviders(<Onboarding />);

    fireEvent.click(await screen.findByRole("button", { name: "Start LocalStack" }));

    expect(dockerMock.createAndConnect).toHaveBeenCalledTimes(1);
    expect(dockerMock.createAndConnect).toHaveBeenCalledWith(
      {
        containerName: "localstack",
        image: "localstack/localstack:4.14.0",
        ports: [{ hostPort: 4566, containerPort: 4566, protocol: "tcp" }],
        env: [],
        persistVolume: true,
      },
      expect.any(Function),
      expect.any(Function),
    );
    expect(screen.getByRole("button", { name: "Start LocalStack" })).toBeDisabled();
    expect(screen.getByText("Pulling localstack/localstack:4.14.0…")).toBeInTheDocument();
  });

  it("commits an endpoint edit on Enter to the Local profile", async () => {
    healthMock.impl = () => Promise.resolve(downHealth);
    renderWithProviders(<Onboarding />);

    const input = await screen.findByLabelText("LocalStack endpoint");
    fireEvent.change(input, { target: { value: "http://localhost:9999" } });
    fireEvent.keyDown(input, { key: "Enter" });

    const local = useProfiles.getState().profiles.find((p) => p.id === LOCAL_PROFILE_ID);
    expect(local?.endpoint).toBe("http://localhost:9999");
  });
});
