import type {
  ContainerDetail,
  ContainerSummary,
  CreateContainerInput,
  DockerAdapter,
  DockerStatus,
  PullProgressEvent,
} from "./docker";
import { isPersistImage } from "./docker";

interface MockContainerState {
  summary: ContainerSummary;
  detail: ContainerDetail;
}

function getInitialMockContainers(): MockContainerState[] {
  const now = Math.floor(Date.now() / 1000);
  return [
    {
      summary: {
        containerId: "c-demo-localstack",
        name: "demo-localstack",
        image: "localstack/localstack:4.14.0",
        state: "running",
        status: "Up 2 hours",
        createdAt: now - 7200,
        hostPorts: [4566],
        persists: false,
      },
      detail: {
        containerId: "c-demo-localstack",
        name: "demo-localstack",
        image: "localstack/localstack:4.14.0",
        state: "running",
        status: "Up 2 hours",
        createdAt: now - 7200,
        hostPorts: [4566],
        persists: false,
        env: [
          "SERVICES=s3,sqs,lambda,dynamodb",
          "LOCALSTACK_AUTH_TOKEN=test-token-secret",
          "DEBUG=1",
          "AWS_DEFAULT_REGION=us-east-1",
        ],
        mounts: [],
        networks: ["bridge"],
        restartPolicy: "unless-stopped",
        persistVolume: false,
      },
    },
    {
      summary: {
        containerId: "c-demo-localstack-persist",
        name: "demo-localstack-persist",
        image: "gresau/localstack-persist:latest",
        state: "exited",
        status: "Exited (0) 10 minutes ago",
        createdAt: now - 14400,
        hostPorts: [4567],
        persists: true,
      },
      detail: {
        containerId: "c-demo-localstack-persist",
        name: "demo-localstack-persist",
        image: "gresau/localstack-persist:latest",
        state: "exited",
        status: "Exited (0) 10 minutes ago",
        createdAt: now - 14400,
        hostPorts: [4567],
        persists: true,
        env: ["SERVICES=s3,dynamodb", "PERSISTENCE=1", "AWS_DEFAULT_REGION=us-east-1"],
        mounts: [
          {
            type: "volume",
            name: "localstacker-demo-persist",
            source: "/var/lib/docker/volumes/localstacker-demo-persist/_data",
            destination: "/var/lib/localstack",
          },
        ],
        networks: ["bridge"],
        restartPolicy: "unless-stopped",
        persistVolume: true,
      },
    },
  ];
}

type TimerId = number | NodeJS.Timeout;
let mockContainers: MockContainerState[] = getInitialMockContainers();
const activeLogStreams = new Map<string, TimerId>();
const activePulls = new Set<string>();

export function resetMockDockerState(): void {
  for (const intervalId of activeLogStreams.values()) {
    clearInterval(intervalId);
  }
  activeLogStreams.clear();
  activePulls.clear();
  mockContainers = getInitialMockContainers();
}

export const mockDockerAdapter: DockerAdapter = {
  kind: "mock",

  async status(): Promise<DockerStatus> {
    return {
      available: true,
      version: "27.5.1 (mock)",
    };
  },

  async listContainers(): Promise<ContainerSummary[]> {
    return mockContainers.map((c) => ({ ...c.summary }));
  },

  async inspectContainer(containerId: string): Promise<ContainerDetail> {
    const found = mockContainers.find((c) => c.summary.containerId === containerId);
    if (!found) {
      throw new Error(`Container ${containerId} not found`);
    }
    return {
      ...found.detail,
      mounts: found.detail.mounts.map((m) => ({ ...m })),
      env: [...found.detail.env],
      networks: [...found.detail.networks],
    };
  },

  async startContainer(containerId: string): Promise<void> {
    const found = mockContainers.find((c) => c.summary.containerId === containerId);
    if (!found) {
      throw new Error(`Container ${containerId} not found`);
    }
    found.summary.state = "running";
    found.summary.status = "Up just now";
    found.detail.state = "running";
    found.detail.status = "Up just now";
  },

  async stopContainer(containerId: string, _timeoutSecs: number): Promise<void> {
    const found = mockContainers.find((c) => c.summary.containerId === containerId);
    if (!found) {
      throw new Error(`Container ${containerId} not found`);
    }
    found.summary.state = "exited";
    found.summary.status = "Exited (0) just now";
    found.detail.state = "exited";
    found.detail.status = "Exited (0) just now";
  },

  async restartContainer(containerId: string, _timeoutSecs: number): Promise<void> {
    const found = mockContainers.find((c) => c.summary.containerId === containerId);
    if (!found) {
      throw new Error(`Container ${containerId} not found`);
    }
    found.summary.state = "running";
    found.summary.status = "Up just now";
    found.detail.state = "running";
    found.detail.status = "Up just now";
  },

  async removeContainer(containerId: string, _removeVolumes: boolean): Promise<void> {
    const idx = mockContainers.findIndex((c) => c.summary.containerId === containerId);
    if (idx === -1) {
      throw new Error(`Container ${containerId} not found`);
    }
    mockContainers.splice(idx, 1);
  },

  async createContainer(
    input: CreateContainerInput,
    sessionId: string,
    onEvent: (e: PullProgressEvent) => void,
  ): Promise<ContainerSummary> {
    activePulls.add(sessionId);

    // Short pull event sequence
    onEvent({ status: "Pulling fs layer", layerId: "layer-1", current: 100, total: 1000, done: false });
    if (!activePulls.has(sessionId)) {
      throw new Error("Pull cancelled");
    }
    onEvent({ status: "Downloading", layerId: "layer-1", current: 500, total: 1000, done: false });
    if (!activePulls.has(sessionId)) {
      throw new Error("Pull cancelled");
    }
    onEvent({ status: "Extracting", layerId: "layer-1", current: 1000, total: 1000, done: false });
    onEvent({ status: "Creating container…", done: false });
    onEvent({ status: "Starting container…", done: false });
    onEvent({ status: "Container started", done: true });

    activePulls.delete(sessionId);

    const now = Math.floor(Date.now() / 1000);
    const containerId = `c-${input.containerName || Math.random().toString(36).slice(2, 8)}`;
    const name = input.containerName || `localstack-${Math.random().toString(36).slice(2, 6)}`;
    const hostPorts = input.ports.map((p) => p.hostPort);
    const persists = isPersistImage(input.image) || Boolean(input.persistVolume);

    const mounts = input.persistVolume && input.containerName
      ? [
          {
            type: "volume" as const,
            name: `localstacker-${input.containerName}`,
            source: `/var/lib/docker/volumes/localstacker-${input.containerName}/_data`,
            destination: "/var/lib/localstack",
          },
        ]
      : [];

    const summary: ContainerSummary = {
      containerId,
      name,
      image: input.image,
      state: "running",
      status: "Up just now",
      createdAt: now,
      hostPorts,
      persists,
    };

    const detail: ContainerDetail = {
      ...summary,
      env: [...input.env],
      mounts,
      networks: [input.network || "bridge"],
      restartPolicy: input.restartPolicy || "unless-stopped",
      persistVolume: Boolean(input.persistVolume),
    };

    mockContainers.unshift({ summary, detail });
    return { ...summary };
  },

  async cancelOperation(sessionId: string): Promise<void> {
    activePulls.delete(sessionId);
  },

  async containerLogs(
    sessionId: string,
    containerId: string,
    _tail: number,
    onBatch: (lines: string[]) => void,
  ): Promise<void> {
    const initialLines = Array.from({ length: 20 }, (_, i) => {
      const idx = i + 1;
      return `[LocalStack] 2026-03-30T12:00:${idx.toString().padStart(2, "0")}.000Z INFO: [ready] Container ${containerId} running service line ${idx}`;
    });
    onBatch(initialLines);

    let counter = 21;
    const interval = setInterval(() => {
      onBatch([
        `[LocalStack] 2026-03-30T12:01:${(counter % 60).toString().padStart(2, "0")}.000Z INFO: heartbeat ping ${counter++}`,
      ]);
    }, 1500);

    activeLogStreams.set(sessionId, interval);
  },

  async stopContainerLogs(sessionId: string): Promise<void> {
    const interval = activeLogStreams.get(sessionId);
    if (interval) {
      clearInterval(interval);
      activeLogStreams.delete(sessionId);
    }
  },
};
