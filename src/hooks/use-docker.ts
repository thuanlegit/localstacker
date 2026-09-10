import { useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  containerEndpoint,
  getDockerAdapter,
  stopTimeoutSecs,
  type ContainerDetail,
  type ContainerSummary,
  type CreateContainerInput,
  type DockerAdapter,
  type PullProgressEvent,
} from "@/lib/docker";
import { checkHealth } from "@/lib/health";
import { useProfiles } from "@/store/profiles";

function toErrorMessage(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

export const dockerKeys = {
  all: ["docker"] as const,
  status: ["docker", "status"] as const,
  containers: ["docker", "containers"] as const,
  inspect: (id: string) => ["docker", "inspect", id] as const,
};

export function useDockerAdapter(): DockerAdapter {
  return useMemo(() => getDockerAdapter(), []);
}

export function useDockerStatus(options?: { enabled?: boolean }) {
  const adapter = useDockerAdapter();
  return useQuery({
    queryKey: dockerKeys.status,
    queryFn: () => adapter.status(),
    staleTime: 30_000,
    retry: false,
    enabled: options?.enabled,
  });
}

export function useDockerContainers(options?: { enabled?: boolean }) {
  const adapter = useDockerAdapter();
  return useQuery({
    queryKey: dockerKeys.containers,
    queryFn: () => adapter.listContainers(),
    staleTime: 4_000,
    refetchInterval: 5_000,
    retry: false,
    enabled: options?.enabled,
  });
}

export function useDockerInspect(containerId?: string, options?: { enabled?: boolean }) {
  const adapter = useDockerAdapter();
  return useQuery({
    queryKey: dockerKeys.inspect(containerId ?? ""),
    queryFn: () => adapter.inspectContainer(containerId!),
    staleTime: 10_000,
    enabled: Boolean(containerId) && (options?.enabled ?? true),
  });
}

export function useDockerActions() {
  const queryClient = useQueryClient();
  const adapter = useDockerAdapter();

  const willLoseState = (container: ContainerSummary): boolean => {
    if (container.persists) {
      return false;
    }
    const cached = queryClient.getQueryData<ContainerDetail>(
      dockerKeys.inspect(container.containerId),
    );
    if (cached?.persistVolume) {
      return false;
    }
    return true;
  };

  const startContainer = async (containerId: string): Promise<boolean> => {
    try {
      await adapter.startContainer(containerId);
      toast.success("Container started");
      await queryClient.invalidateQueries({ queryKey: dockerKeys.containers });
      return true;
    } catch (e) {
      toast.error(`Failed to start container: ${toErrorMessage(e)}`);
      return false;
    }
  };

  const stopContainer = async (container: ContainerSummary): Promise<boolean> => {
    try {
      const timeout = stopTimeoutSecs(container.image);
      await adapter.stopContainer(container.containerId, timeout);
      toast.success("Container stopped");
      await queryClient.invalidateQueries({ queryKey: dockerKeys.containers });
      return true;
    } catch (e) {
      toast.error(`Failed to stop container: ${toErrorMessage(e)}`);
      return false;
    }
  };

  const restartContainer = async (container: ContainerSummary): Promise<boolean> => {
    try {
      const timeout = stopTimeoutSecs(container.image);
      await adapter.restartContainer(container.containerId, timeout);
      toast.success("Container restarted");
      await queryClient.invalidateQueries({ queryKey: dockerKeys.containers });
      return true;
    } catch (e) {
      toast.error(`Failed to restart container: ${toErrorMessage(e)}`);
      return false;
    }
  };

  const removeContainer = async (
    containerId: string,
    removeVolumes: boolean,
  ): Promise<boolean> => {
    try {
      await adapter.removeContainer(containerId, removeVolumes);
      toast.success("Container removed");
      await queryClient.invalidateQueries({ queryKey: dockerKeys.containers });
      return true;
    } catch (e) {
      toast.error(`Failed to remove container: ${toErrorMessage(e)}`);
      return false;
    }
  };

  const connectContainer = async (container: ContainerSummary): Promise<boolean> => {
    try {
      const endpoint = containerEndpoint(container);
      if (!endpoint) {
        toast.error("Container has no exposed host port to connect to");
        return false;
      }
      const { profiles, addProfile, setActiveProfile } = useProfiles.getState();
      const existing = profiles.find((p) => p.endpoint === endpoint);
      if (existing) {
        setActiveProfile(existing.id);
      } else {
        const created = addProfile({
          name: container.name,
          endpoint,
          region: "us-east-1",
        });
        setActiveProfile(created.id);
      }
      await queryClient.invalidateQueries();
      toast.success(`Connected to ${container.name} (${endpoint})`);
      return true;
    } catch (e) {
      toast.error(`Failed to connect container: ${toErrorMessage(e)}`);
      return false;
    }
  };

  const createAndConnect = async (
    input: CreateContainerInput,
    onEvent: (e: PullProgressEvent) => void,
    onStatusChange?: (status: string) => void,
  ): Promise<ContainerSummary> => {
    const sessionId = crypto.randomUUID();
    let summary: ContainerSummary;
    try {
      summary = await adapter.createContainer(input, sessionId, onEvent);
      await queryClient.invalidateQueries({ queryKey: dockerKeys.containers });
    } catch (e) {
      const msg = toErrorMessage(e);
      toast.error(`Failed to create container: ${msg}`);
      throw e;
    }

    const endpoint = containerEndpoint(summary);
    if (!endpoint) {
      toast.success(`Container ${summary.name} created`);
      return summary;
    }

    // Poll health check for up to 60s
    onStatusChange?.("Waiting for LocalStack to be ready…");
    const startTime = Date.now();
    let healthy = false;
    while (Date.now() - startTime < 60_000) {
      try {
        const health = await checkHealth({ endpoint });
        if (health.status === "up") {
          healthy = true;
          break;
        }
      } catch {
        // Continue polling
      }
      await new Promise<void>((resolve) => setTimeout(resolve, 2000));
    }

    if (!healthy) {
      toast.warning(
        `Container ${summary.name} started, but health check timed out. You can connect manually.`,
      );
      return summary;
    }

    await connectContainer(summary);
    return summary;
  };

  return {
    willLoseState,
    startContainer,
    stopContainer,
    restartContainer,
    removeContainer,
    connectContainer,
    createAndConnect,
  };
}
