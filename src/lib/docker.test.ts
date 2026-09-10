import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  buildCreateConfig,
  containerEndpoint,
  deepMergeConfig,
  getDockerAdapter,
  isLocalStackImage,
  isPersistImage,
  maskEnv,
  resetDockerAdapter,
  stopTimeoutSecs,
} from "./docker";
import type { ContainerSummary, CreateContainerInput, PullProgressEvent } from "./docker";
import { mockDockerAdapter, resetMockDockerState } from "./docker-mock";

describe("docker pure functions", () => {
  describe("isLocalStackImage", () => {
    it("identifies localstack images with and without registry prefixes", () => {
      expect(isLocalStackImage("localstack/localstack")).toBe(true);
      expect(isLocalStackImage("localstack/localstack:4.14.0")).toBe(true);
      expect(isLocalStackImage("localstack/localstack:latest")).toBe(true);
      expect(isLocalStackImage("docker.io/localstack/localstack:4.14.0")).toBe(true);
      expect(isLocalStackImage("registry.example.com:5000/localstack/localstack:latest")).toBe(true);
      expect(isLocalStackImage("localhost:5000/localstack/localstack:latest")).toBe(true);
      expect(isLocalStackImage("gresau/localstack-persist:latest")).toBe(true);
      expect(isLocalStackImage("gresau/localstack-persist")).toBe(true);
      expect(isLocalStackImage("my-registry.io/gresau/localstack-persist:v1")).toBe(true);

      expect(isLocalStackImage("redis:7")).toBe(false);
      expect(isLocalStackImage("alpine:latest")).toBe(false);
      expect(isLocalStackImage("localstack/other-tool")).toBe(false);
      expect(isLocalStackImage("")).toBe(false);
    });
  });

  describe("isPersistImage", () => {
    it("identifies persist images only", () => {
      expect(isPersistImage("gresau/localstack-persist:latest")).toBe(true);
      expect(isPersistImage("registry.io:5000/gresau/localstack-persist:v1")).toBe(true);
      expect(isPersistImage("localstack/localstack:4.14.0")).toBe(false);
      expect(isPersistImage("redis:7")).toBe(false);
    });
  });

  describe("stopTimeoutSecs", () => {
    it("returns 60s for persist images and 10s for other images", () => {
      expect(stopTimeoutSecs("gresau/localstack-persist:latest")).toBe(60);
      expect(stopTimeoutSecs("localstack/localstack:4.14.0")).toBe(10);
      expect(stopTimeoutSecs("redis:7")).toBe(10);
    });
  });

  describe("containerEndpoint", () => {
    it("resolves endpoint from first hostPort", () => {
      const c: ContainerSummary = {
        containerId: "c1",
        name: "demo",
        image: "localstack/localstack:4.14.0",
        state: "running",
        status: "Up",
        createdAt: 1000,
        hostPorts: [4566, 4567],
        persists: false,
      };
      expect(containerEndpoint(c)).toBe("http://localhost:4566");
      expect(containerEndpoint({ ...c, hostPorts: [] })).toBeUndefined();
    });
  });

  describe("maskEnv", () => {
    it("masks sensitive environment variables while keeping non-sensitive ones intact", () => {
      const env = [
        "SERVICES=s3,sqs",
        "LOCALSTACK_AUTH_TOKEN=secret-token-value",
        "AWS_SECRET_ACCESS_KEY=wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY",
        "DATABASE_PASSWORD=supersecret",
        "API_KEY=12345",
        "USER_CREDENTIAL=credential_data",
        "DEBUG=1",
        "NO_EQUALS",
      ];
      const masked = maskEnv(env);
      expect(masked).toEqual([
        "SERVICES=s3,sqs",
        "LOCALSTACK_AUTH_TOKEN=***",
        "AWS_SECRET_ACCESS_KEY=***",
        "DATABASE_PASSWORD=***",
        "API_KEY=***",
        "USER_CREDENTIAL=***",
        "DEBUG=1",
        "NO_EQUALS",
      ]);
    });
  });

  describe("deepMergeConfig", () => {
    it("merges objects recursively while replacing scalars and arrays", () => {
      const base = {
        a: { b: 1, c: 2 },
        list: [1, 2],
        scalar: "old",
      };
      const override = {
        a: { c: 3, d: 4 },
        list: [3],
        scalar: "new",
        extra: true,
      };
      expect(deepMergeConfig(base, override)).toEqual({
        a: { b: 1, c: 3, d: 4 },
        list: [3],
        scalar: "new",
        extra: true,
      });
    });
  });

  describe("buildCreateConfig", () => {
    it("builds valid Docker create config structure with port bindings and restart policy", () => {
      const input: CreateContainerInput = {
        containerName: "my-localstack",
        image: "localstack/localstack:4.14.0",
        ports: [
          { hostPort: 4566, containerPort: 4566, protocol: "tcp" },
          { hostPort: 4567, containerPort: 4567, protocol: "tcp" },
        ],
        env: ["SERVICES=s3,dynamodb", "DEBUG=1"],
        persistVolume: true,
        network: "host",
        restartPolicy: "always",
        hostname: "localstack-host",
        extraConfig: {
          HostConfig: {
            Memory: 536870912,
          },
        },
      };

      const config = buildCreateConfig(input);
      expect(config).toEqual({
        Image: "localstack/localstack:4.14.0",
        Env: ["SERVICES=s3,dynamodb", "DEBUG=1"],
        Hostname: "localstack-host",
        HostConfig: {
          PortBindings: {
            "4566/tcp": [{ HostPort: "4566" }],
            "4567/tcp": [{ HostPort: "4567" }],
          },
          RestartPolicy: {
            Name: "always",
          },
          Binds: ["localstacker-my-localstack:/var/lib/localstack"],
          NetworkMode: "host",
          Memory: 536870912,
        },
      });
    });

    it("omits binds when persistVolume is false", () => {
      const input: CreateContainerInput = {
        image: "localstack/localstack:4.14.0",
        ports: [{ hostPort: 4566, containerPort: 4566, protocol: "tcp" }],
        env: [],
        persistVolume: false,
      };

      const config = buildCreateConfig(input);
      expect(config.HostConfig).toEqual({
        PortBindings: {
          "4566/tcp": [{ HostPort: "4566" }],
        },
        RestartPolicy: {
          Name: "unless-stopped",
        },
      });
      expect(config.Hostname).toBeUndefined();
    });
  });
});

describe("adapter selection", () => {
  beforeEach(() => {
    resetDockerAdapter();
    delete (window as unknown as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__;
    vi.resetModules();
  });

  afterEach(() => {
    resetDockerAdapter();
    delete (window as unknown as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__;
    vi.restoreAllMocks();
  });

  it("selects mock adapter in non-Tauri browser environment", () => {
    const adapter = getDockerAdapter();
    expect(adapter.kind).toBe("mock");
  });

  it("selects tauri adapter when __TAURI_INTERNALS__ is present", async () => {
    (window as unknown as { __TAURI_INTERNALS__: Record<string, unknown> }).__TAURI_INTERNALS__ = {};

    const mockInvoke = vi.fn().mockImplementation((cmd: string) => {
      if (cmd === "docker_status") {
        return Promise.resolve({ available: true, version: "27.0.0" });
      }
      if (cmd === "docker_list_containers") {
        return Promise.resolve([]);
      }
      if (cmd === "docker_start_container") {
        return Promise.resolve();
      }
      if (cmd === "docker_stop_container") {
        return Promise.resolve();
      }
      if (cmd === "docker_restart_container") {
        return Promise.resolve();
      }
      if (cmd === "docker_remove_container") {
        return Promise.resolve();
      }
      if (cmd === "docker_cancel") {
        return Promise.resolve();
      }
      if (cmd === "docker_stop_logs") {
        return Promise.resolve();
      }
      return Promise.resolve();
    });

    class MockChannel<T> {
      onmessage?: (data: T) => void;
      constructor(onmessage?: (data: T) => void) {
        this.onmessage = onmessage;
      }
    }

    vi.doMock("@tauri-apps/api/core", () => ({
      invoke: mockInvoke,
      Channel: MockChannel,
    }));

    const adapter = getDockerAdapter();
    expect(adapter.kind).toBe("tauri");

    const status = await adapter.status();
    expect(status.available).toBe(true);
    expect(mockInvoke).toHaveBeenCalledWith("docker_status");

    await adapter.startContainer("c1");
    expect(mockInvoke).toHaveBeenCalledWith("docker_start_container", { containerId: "c1" });

    await adapter.stopContainer("c1", 10);
    expect(mockInvoke).toHaveBeenCalledWith("docker_stop_container", { containerId: "c1", timeoutSecs: 10 });

    await adapter.restartContainer("c1", 60);
    expect(mockInvoke).toHaveBeenCalledWith("docker_restart_container", { containerId: "c1", timeoutSecs: 60 });

    await adapter.removeContainer("c1", true);
    expect(mockInvoke).toHaveBeenCalledWith("docker_remove_container", { containerId: "c1", removeVolumes: true });

    await adapter.cancelOperation("s1");
    expect(mockInvoke).toHaveBeenCalledWith("docker_cancel", { sessionId: "s1" });

    await adapter.stopContainerLogs("s1");
    expect(mockInvoke).toHaveBeenCalledWith("docker_stop_logs", { sessionId: "s1" });
  });
});

describe("mock adapter behavior", () => {
  beforeEach(() => {
    resetMockDockerState();
    vi.useFakeTimers();
  });

  afterEach(() => {
    resetMockDockerState();
    vi.useRealTimers();
  });

  it("lists seeded containers", async () => {
    const list = await mockDockerAdapter.listContainers();
    expect(list).toHaveLength(2);
    expect(list[0].name).toBe("demo-localstack");
    expect(list[0].state).toBe("running");
    expect(list[0].persists).toBe(false);

    expect(list[1].name).toBe("demo-localstack-persist");
    expect(list[1].state).toBe("exited");
    expect(list[1].persists).toBe(true);
  });

  it("inspects container details", async () => {
    const detail = await mockDockerAdapter.inspectContainer("c-demo-localstack");
    expect(detail.name).toBe("demo-localstack");
    expect(detail.env).toContain("SERVICES=s3,sqs,lambda,dynamodb");
    expect(detail.persistVolume).toBe(false);

    const persistDetail = await mockDockerAdapter.inspectContainer("c-demo-localstack-persist");
    expect(persistDetail.persistVolume).toBe(true);
    expect(persistDetail.mounts[0].destination).toBe("/var/lib/localstack");
  });

  it("handles lifecycle state transitions (stop, start, restart, remove)", async () => {
    await mockDockerAdapter.stopContainer("c-demo-localstack", 10);
    let list = await mockDockerAdapter.listContainers();
    expect(list.find((c) => c.containerId === "c-demo-localstack")?.state).toBe("exited");

    await mockDockerAdapter.startContainer("c-demo-localstack");
    list = await mockDockerAdapter.listContainers();
    expect(list.find((c) => c.containerId === "c-demo-localstack")?.state).toBe("running");

    await mockDockerAdapter.restartContainer("c-demo-localstack", 10);
    list = await mockDockerAdapter.listContainers();
    expect(list.find((c) => c.containerId === "c-demo-localstack")?.state).toBe("running");

    await mockDockerAdapter.removeContainer("c-demo-localstack", false);
    list = await mockDockerAdapter.listContainers();
    expect(list.find((c) => c.containerId === "c-demo-localstack")).toBeUndefined();
  });

  it("delivers log snapshot and appends lines over time, stopping on stopContainerLogs", async () => {
    const batches: string[][] = [];
    await mockDockerAdapter.containerLogs("sess-logs-1", "c-demo-localstack", 100, (lines) => {
      batches.push(lines);
    });

    expect(batches).toHaveLength(1);
    expect(batches[0]).toHaveLength(20);

    // Fast-forward 1.5s
    vi.advanceTimersByTime(1500);
    expect(batches).toHaveLength(2);
    expect(batches[1]).toHaveLength(1);

    // Fast-forward another 1.5s
    vi.advanceTimersByTime(1500);
    expect(batches).toHaveLength(3);

    // Stop logs
    await mockDockerAdapter.stopContainerLogs("sess-logs-1");
    vi.advanceTimersByTime(3000);
    expect(batches).toHaveLength(3);
  });

  it("creates container and emits pull progress events", async () => {
    const events: PullProgressEvent[] = [];
    const input: CreateContainerInput = {
      containerName: "new-stack",
      image: "localstack/localstack:4.14.0",
      ports: [{ hostPort: 4566, containerPort: 4566, protocol: "tcp" }],
      env: ["DEBUG=1"],
      persistVolume: true,
    };

    const summaryPromise = mockDockerAdapter.createContainer(input, "sess-create-1", (e) => {
      events.push(e);
    });
    await vi.advanceTimersByTimeAsync(1_000);
    const summary = await summaryPromise;

    expect(events.length).toBeGreaterThanOrEqual(4);
    expect(events.some((e) => e.status.includes("Pulling"))).toBe(true);
    expect(events[events.length - 1].done).toBe(true);

    expect(summary.name).toBe("new-stack");
    expect(summary.state).toBe("running");
    expect(summary.persists).toBe(true);

    const list = await mockDockerAdapter.listContainers();
    expect(list.some((c) => c.name === "new-stack")).toBe(true);
  });
});
