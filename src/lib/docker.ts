import { mockDockerAdapter } from "./docker-mock";

export type ContainerStateName =
  | "created"
  | "running"
  | "paused"
  | "restarting"
  | "removing"
  | "exited"
  | "dead";

export interface ContainerSummary {
  containerId: string;
  name: string;
  image: string;
  state: string;
  status: string;
  createdAt: number;
  hostPorts: number[];
  persists: boolean;
}

export interface PortMapping {
  hostPort: number;
  containerPort: number;
  protocol: "tcp" | "udp";
}

export interface MountInfo {
  type: "volume" | "bind";
  name?: string;
  source: string;
  destination: string;
}

export interface ContainerDetail extends ContainerSummary {
  env: string[];
  mounts: MountInfo[];
  networks: string[];
  restartPolicy: string;
  persistVolume: boolean;
}

export interface DockerStatus {
  available: boolean;
  errorKind?: "unavailable" | "permission" | "other";
  reason?: string;
  version?: string;
}

export interface PullProgressEvent {
  status: string;
  layerId?: string;
  current?: number;
  total?: number;
  done: boolean;
  error?: string;
}

export interface CreateContainerInput {
  containerName?: string;
  image: string;
  ports: PortMapping[];
  env: string[];
  persistVolume: boolean;
  network?: string;
  restartPolicy?: "no" | "unless-stopped" | "always";
  hostname?: string;
  extraConfig?: Record<string, unknown>;
}

export interface DockerAdapter {
  readonly kind: "tauri" | "mock";
  status(): Promise<DockerStatus>;
  listContainers(): Promise<ContainerSummary[]>;
  inspectContainer(containerId: string): Promise<ContainerDetail>;
  startContainer(containerId: string): Promise<void>;
  stopContainer(containerId: string, timeoutSecs: number): Promise<void>;
  restartContainer(containerId: string, timeoutSecs: number): Promise<void>;
  removeContainer(containerId: string, removeVolumes: boolean): Promise<void>;
  createContainer(
    input: CreateContainerInput,
    sessionId: string,
    onEvent: (e: PullProgressEvent) => void,
  ): Promise<ContainerSummary>;
  cancelOperation(sessionId: string): Promise<void>;
  containerLogs(
    sessionId: string,
    containerId: string,
    tail: number,
    onBatch: (lines: string[]) => void,
  ): Promise<void>;
  stopContainerLogs(sessionId: string): Promise<void>;
}

export function isLocalStackImage(image: string): boolean {
  const raw = image.trim();
  const slashIdx = raw.indexOf("/");
  let withoutRegistry = raw;
  if (slashIdx !== -1) {
    const firstSegment = raw.slice(0, slashIdx);
    if (firstSegment.includes(".") || firstSegment.includes(":") || firstSegment === "localhost") {
      withoutRegistry = raw.slice(slashIdx + 1);
    }
  }
  return (
    withoutRegistry.startsWith("localstack/localstack") ||
    withoutRegistry.startsWith("gresau/localstack-persist")
  );
}

export function isPersistImage(image: string): boolean {
  const raw = image.trim();
  const slashIdx = raw.indexOf("/");
  let withoutRegistry = raw;
  if (slashIdx !== -1) {
    const firstSegment = raw.slice(0, slashIdx);
    if (firstSegment.includes(".") || firstSegment.includes(":") || firstSegment === "localhost") {
      withoutRegistry = raw.slice(slashIdx + 1);
    }
  }
  return withoutRegistry.startsWith("gresau/localstack-persist");
}

export function stopTimeoutSecs(image: string): 60 | 10 {
  return isPersistImage(image) ? 60 : 10;
}

export function containerEndpoint(c: ContainerSummary): string | undefined {
  if (c.hostPorts && c.hostPorts.length > 0) {
    return `http://localhost:${c.hostPorts[0]}`;
  }
  return undefined;
}

const SENSITIVE_KEY_RE = /TOKEN|SECRET|PASSWORD|KEY|CREDENTIAL/i;

export function maskEnv(env: string[]): string[] {
  return env.map((line) => {
    const eqIdx = line.indexOf("=");
    if (eqIdx === -1) {
      return line;
    }
    const key = line.slice(0, eqIdx);
    if (SENSITIVE_KEY_RE.test(key)) {
      return `${key}=***`;
    }
    return line;
  });
}

function isPlainObject(val: unknown): val is Record<string, unknown> {
  return typeof val === "object" && val !== null && !Array.isArray(val);
}

export function deepMergeConfig(
  base: Record<string, unknown>,
  override: Record<string, unknown>,
): Record<string, unknown> {
  const result: Record<string, unknown> = { ...base };
  for (const [key, overrideVal] of Object.entries(override)) {
    const baseVal = result[key];
    if (isPlainObject(baseVal) && isPlainObject(overrideVal)) {
      result[key] = deepMergeConfig(baseVal, overrideVal);
    } else {
      result[key] = overrideVal;
    }
  }
  return result;
}

export function buildCreateConfig(input: CreateContainerInput): Record<string, unknown> {
  const portBindings: Record<string, Array<{ HostPort: string }>> = {};
  for (const p of input.ports) {
    const key = `${p.containerPort}/${p.protocol}`;
    if (!portBindings[key]) {
      portBindings[key] = [];
    }
    portBindings[key].push({ HostPort: String(p.hostPort) });
  }

  const hostConfig: Record<string, unknown> = {
    PortBindings: portBindings,
    RestartPolicy: {
      Name: input.restartPolicy ?? "unless-stopped",
    },
  };

  if (input.persistVolume && input.containerName) {
    hostConfig.Binds = [`localstacker-${input.containerName}:/var/lib/localstack`];
  }

  if (input.network) {
    hostConfig.NetworkMode = input.network;
  }

  const config: Record<string, unknown> = {
    Image: input.image,
    Env: input.env,
    HostConfig: hostConfig,
  };

  if (input.hostname) {
    config.Hostname = input.hostname;
  }

  return deepMergeConfig(config, input.extraConfig ?? {});
}

class TauriDockerAdapter implements DockerAdapter {
  readonly kind = "tauri" as const;

  async status(): Promise<DockerStatus> {
    const { invoke } = await import("@tauri-apps/api/core");
    return invoke<DockerStatus>("docker_status");
  }

  async listContainers(): Promise<ContainerSummary[]> {
    const { invoke } = await import("@tauri-apps/api/core");
    return invoke<ContainerSummary[]>("docker_list_containers");
  }

  async inspectContainer(containerId: string): Promise<ContainerDetail> {
    const { invoke } = await import("@tauri-apps/api/core");
    return invoke<ContainerDetail>("docker_inspect_container", { containerId });
  }

  async startContainer(containerId: string): Promise<void> {
    const { invoke } = await import("@tauri-apps/api/core");
    return invoke<void>("docker_start_container", { containerId });
  }

  async stopContainer(containerId: string, timeoutSecs: number): Promise<void> {
    const { invoke } = await import("@tauri-apps/api/core");
    return invoke<void>("docker_stop_container", { containerId, timeoutSecs });
  }

  async restartContainer(containerId: string, timeoutSecs: number): Promise<void> {
    const { invoke } = await import("@tauri-apps/api/core");
    return invoke<void>("docker_restart_container", { containerId, timeoutSecs });
  }

  async removeContainer(containerId: string, removeVolumes: boolean): Promise<void> {
    const { invoke } = await import("@tauri-apps/api/core");
    return invoke<void>("docker_remove_container", { containerId, removeVolumes });
  }

  async createContainer(
    input: CreateContainerInput,
    sessionId: string,
    onEvent: (e: PullProgressEvent) => void,
  ): Promise<ContainerSummary> {
    const { invoke, Channel } = await import("@tauri-apps/api/core");
    const channel = new Channel<PullProgressEvent>((event) => {
      onEvent(event);
    });
    const config = buildCreateConfig(input);
    return invoke<ContainerSummary>("docker_create_container", {
      containerName: input.containerName,
      config,
      sessionId,
      onEvent: channel,
    });
  }

  async cancelOperation(sessionId: string): Promise<void> {
    const { invoke } = await import("@tauri-apps/api/core");
    return invoke<void>("docker_cancel", { sessionId });
  }

  async containerLogs(
    sessionId: string,
    containerId: string,
    tail: number,
    onBatch: (lines: string[]) => void,
  ): Promise<void> {
    const { invoke, Channel } = await import("@tauri-apps/api/core");
    interface LogEvent {
      type: string;
      lines: string[];
    }
    const channel = new Channel<LogEvent>((event) => {
      if (event && Array.isArray(event.lines)) {
        onBatch(event.lines);
      }
    });
    return invoke<void>("docker_container_logs", {
      sessionId,
      containerId,
      tail,
      onEvent: channel,
    });
  }

  async stopContainerLogs(sessionId: string): Promise<void> {
    const { invoke } = await import("@tauri-apps/api/core");
    return invoke<void>("docker_stop_logs", { sessionId });
  }
}

let cachedAdapter: DockerAdapter | null = null;

export function getDockerAdapter(): DockerAdapter {
  if (cachedAdapter) {
    return cachedAdapter;
  }
  if (typeof window !== "undefined" && "__TAURI_INTERNALS__" in window) {
    cachedAdapter = new TauriDockerAdapter();
  } else {
    cachedAdapter = mockDockerAdapter;
  }
  return cachedAdapter;
}

export function resetDockerAdapter(): void {
  cachedAdapter = null;
}
