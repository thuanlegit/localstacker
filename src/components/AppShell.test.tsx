import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, screen } from "@testing-library/react";
import App from "@/App";
import { LOCAL_PROFILE_ID, localProfile, useProfiles } from "@/store/profiles";
import { useTheme } from "@/store/theme";
import { useTabs } from "@/store/tabs";
import { renderWithProviders } from "@/test/utils";

vi.mock("@/lib/health", () => ({
  checkHealth: vi.fn(async () => ({ status: "down", reason: "test env" })),
}));

vi.mock("@/hooks/use-s3", () => ({
  useS3Client: vi.fn(),
  useBuckets: vi.fn(() => ({
    data: [{ name: "demo-bucket", creationDate: new Date("2026-01-01T00:00:00Z") }],
    isPending: false,
    isFetching: false,
    error: null,
    refetch: vi.fn(),
  })),
  useS3ObjectActions: vi.fn(() => ({
    downloadObject: vi.fn(),
    copyPresignedUrl: vi.fn(),
    deleteObject: vi.fn(),
  })),
  s3Keys: {
    buckets: (id: string) => ["s3", "buckets", id],
    objects: (id: string, b: string, p?: string) => ["s3", "objects", id, b, p ?? ""],
  },
}));
const { demoQueue, demoSecret, demoFunction } = vi.hoisted(() => ({
  demoQueue: {
    url: "http://localhost:4566/000000000000/demo-queue",
    name: "demo-queue",
    isFifo: false,
    attributes: {
      depth: 3,
      inFlight: 1,
      delayed: 0,
      createdTimestamp: new Date("2026-01-01T00:00:00Z"),
    },
  },
  demoSecret: {
    name: "db-password",
    arn: "arn:aws:secretsmanager:us-east-1:000000000000:secret:db-password-AbCd",
    description: "Main DB",
    createdDate: new Date("2026-01-01T00:00:00Z"),
  },
  demoFunction: {
    name: "hello",
    runtime: "nodejs22.x",
    handler: "index.handler",
    codeSize: 512,
    lastModified: new Date("2026-01-01T00:00:00Z"),
  },
}));

vi.mock("@/hooks/use-sqs", () => ({
  useSqsClient: vi.fn(),
  useQueues: vi.fn(() => ({
    data: [demoQueue],
    isPending: false,
    isFetching: false,
    error: null,
    refetch: vi.fn(),
  })),
  sqsKeys: {
    queues: (id: string) => ["sqs", "queues", id],
  },
}));

vi.mock("@/lib/sqs", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/sqs")>();
  return {
    ...actual,
    createQueue: vi.fn().mockResolvedValue({ url: demoQueue.url }),
    deleteQueue: vi.fn().mockResolvedValue(undefined),
    sendMessage: vi.fn().mockResolvedValue({ messageId: "msg-1" }),
    peekMessages: vi.fn().mockResolvedValue([]),
    restoreVisibility: vi.fn().mockResolvedValue(undefined),
    deleteMessage: vi.fn().mockResolvedValue(undefined),
    purgeQueue: vi.fn().mockResolvedValue(undefined),
    redriveMessages: vi.fn().mockResolvedValue({ moved: 0 }),
  };
});
vi.mock("@/hooks/use-secrets", () => ({
  useSecretsClient: vi.fn(),
  useSecrets: vi.fn(() => ({
    data: [demoSecret],
    isPending: false,
    isFetching: false,
    error: null,
    refetch: vi.fn(),
  })),
  useSecretVersions: vi.fn(() => ({
    data: [
      {
        versionId: "v1",
        createdDate: new Date("2026-01-01T00:00:00Z"),
        stages: ["AWSCURRENT"],
      },
    ],
    isPending: false,
    isFetching: false,
    error: null,
    refetch: vi.fn(),
  })),
  secretsKeys: {
    secrets: (id: string) => ["secrets", "secrets", id],
    versions: (id: string, name: string) => ["secrets", "versions", id, name],
  },
}));

vi.mock("@/lib/secrets", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/secrets")>();
  return {
    ...actual,
    createSecret: vi.fn().mockResolvedValue({
      name: demoSecret.name,
      arn: demoSecret.arn,
      versionId: "v1",
    }),
    deleteSecret: vi.fn().mockResolvedValue(undefined),
    getSecretValue: vi.fn().mockResolvedValue({
      name: demoSecret.name,
      versionId: "v1",
      secretString: "secret-value-123",
      createdDate: demoSecret.createdDate,
    }),
    putSecretValue: vi.fn().mockResolvedValue({
      versionId: "v2",
      versionStages: ["AWSCURRENT"],
    }),
  };
});

vi.mock("@/hooks/use-lambda", () => ({
  useLambdaClient: vi.fn(),
  useLambdaActions: vi.fn(() => ({
    create: vi.fn(),
    createDemo: vi.fn(),
    removeFunction: vi.fn(),
  })),
  useFunctions: vi.fn(() => ({
    data: [demoFunction],
    isPending: false,
    isFetching: false,
    error: null,
    refetch: vi.fn(),
  })),
  useFunctionConfig: vi.fn(() => ({
    data: {
      name: demoFunction.name,
      runtime: demoFunction.runtime,
      handler: demoFunction.handler,
      timeoutSeconds: 3,
      memorySize: 128,
      envVars: {},
    },
    isPending: false,
    isFetching: false,
    error: null,
    refetch: vi.fn(),
  })),
  useEventSourceMappings: vi.fn(() => ({
    data: [],
    isLoading: false,
    refetch: vi.fn(),
  })),
  useEventSourceMappingActions: vi.fn(() => ({
    createMapping: vi.fn(),
    updateMapping: vi.fn(),
    deleteMapping: vi.fn(),
  })),
  lambdaKeys: {
    functions: (id: string) => ["lambda", "functions", id],
    config: (id: string, name: string) => ["lambda", "config", id, name],
    eventSourceMappings: (...args: unknown[]) => ["lambda", "eventSourceMappings", ...args],
  },
}));
vi.mock("@/hooks/use-iam", () => ({
  useRoles: vi.fn(() => ({ data: [], isLoading: false, isFetching: false, refetch: vi.fn() })),
  useUsers: vi.fn(() => ({ data: [], isLoading: false, isFetching: false, refetch: vi.fn() })),
  usePolicies: vi.fn(() => ({ data: [], isLoading: false, isFetching: false, refetch: vi.fn() })),
  useRoleActions: vi.fn(() => ({ deleteRole: vi.fn(), createRole: vi.fn() })),
  useUserActions: vi.fn(() => ({ deleteUser: vi.fn(), createUser: vi.fn() })),
}));

vi.mock("@/hooks/use-route53", () => ({
  useHostedZones: vi.fn(() => ({ data: [], isLoading: false, isFetching: false, refetch: vi.fn() })),
  useResourceRecordSets: vi.fn(() => ({ data: [], isLoading: false, isFetching: false, refetch: vi.fn() })),
  useHostedZoneActions: vi.fn(() => ({ deleteHostedZone: vi.fn(), createHostedZone: vi.fn() })),
  useRecordSetActions: vi.fn(() => ({ deleteRecordSet: vi.fn(), createRecordSet: vi.fn() })),
}));

vi.mock("@/hooks/use-docker", () => ({
  useDockerAdapter: vi.fn(() => ({ kind: "tauri" })),
  useDockerStatus: vi.fn(() => ({
    data: { available: true, version: "27.0.0" },
    isLoading: false,
    refetch: vi.fn(),
  })),
  useDockerContainers: vi.fn(() => ({
    data: [],
    isLoading: false,
    isFetching: false,
    refetch: vi.fn(),
  })),
  useDockerInspect: vi.fn(() => ({ data: undefined, isLoading: false })),
  useDockerActions: vi.fn(() => ({
    willLoseState: vi.fn(() => true),
    startContainer: vi.fn(),
    stopContainer: vi.fn(),
    restartContainer: vi.fn(),
    removeContainer: vi.fn(),
    connectContainer: vi.fn(),
    createAndConnect: vi.fn(),
  })),
}));

vi.mock("@/lib/lambda", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/lambda")>();
  return {
    ...actual,
    invokeFunction: vi.fn().mockResolvedValue({
      statusCode: 200,
      executedVersion: "$LATEST",
      payload: '{"res":"ok"}',
      logs: "logs...",
      durationMs: 10,
    }),
    updateFunctionEnvVars: vi.fn().mockResolvedValue(undefined),
  };
});
vi.mock("@/lib/s3", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/s3")>();
  return {
    ...actual,
    listObjectsPage: vi.fn(async () => ({
      folders: ["logs/"],
      objects: [
        {
          key: "hello.txt",
          name: "hello.txt",
          size: 12,
          lastModified: new Date("2026-01-01T00:00:00Z"),
        },
      ],
      nextToken: undefined,
    })),
  };
});

function renderApp() {
  renderWithProviders(<App />);
}

describe("AppShell", () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.className = "";
    delete document.documentElement.dataset.palette;
    useTabs.setState({ tabs: [], activeTabId: null });
    useTheme.setState({ mode: "dark", palette: "github" });
    useProfiles.setState({ profiles: [localProfile()], activeProfileId: LOCAL_PROFILE_ID });
  });

  afterEach(() => {
    cleanup();
  });

  it("renders all four services in the sidebar", () => {
    renderApp();
    for (const label of ["S3", "SQS", "Secrets Manager", "Lambda"]) {
      expect(screen.getByRole("button", { name: new RegExp(`^${label}`) })).toBeInTheDocument();
    }
  });

  it("opens the S3 tab and navigates into a bucket when clicked", async () => {
    renderApp();
    fireEvent.click(screen.getByRole("button", { name: /^S3/ }));
    expect(screen.getByText("Buckets")).toBeInTheDocument();
    expect(screen.getByText("demo-bucket")).toBeInTheDocument();
    expect(screen.getByRole("tab", { selected: true })).toHaveTextContent("S3");

    fireEvent.click(screen.getByText("demo-bucket"));

    expect(useTabs.getState().tabs.map((t) => t.id)).toEqual([
      "service:s3",
      "bucket:demo-bucket",
    ]);
    expect(screen.getByRole("tab", { selected: true })).toHaveTextContent("demo-bucket");

    expect(await screen.findByText("logs")).toBeInTheDocument();
    expect(await screen.findByText("hello.txt")).toBeInTheDocument();
  });
  it("opens the SQS tab and navigates into a queue", async () => {
    renderApp();
    fireEvent.click(screen.getByRole("button", { name: /^SQS/ }));
    expect(screen.getByText("demo-queue")).toBeInTheDocument();
    expect(screen.getByRole("tab", { selected: true })).toHaveTextContent("SQS");
    fireEvent.click(screen.getByText("demo-queue"));

    expect(useTabs.getState().tabs.map((t) => t.id)).toEqual([
      "service:sqs",
      "queue:demo-queue",
    ]);
    expect(screen.getByRole("tab", { selected: true })).toHaveTextContent("demo-queue");
  });

  it("opens the Secrets tab and navigates into a secret", async () => {
    renderApp();
    fireEvent.click(screen.getByRole("button", { name: /^Secrets Manager/ }));
    expect(screen.getByText("db-password")).toBeInTheDocument();
    expect(screen.getByRole("tab", { selected: true })).toHaveTextContent("Secrets");
    fireEvent.click(screen.getByText("db-password"));

    expect(useTabs.getState().tabs.map((t) => t.id)).toEqual([
      "service:secrets",
      "secret:db-password",
    ]);
    expect(screen.getByRole("tab", { selected: true })).toHaveTextContent("db-password");
  });

  it("opens the IAM tab and displays IAM service view", () => {
    renderApp();
    fireEvent.click(screen.getByRole("button", { name: /^IAM/ }));
    expect(useTabs.getState().tabs.map((t) => t.id)).toEqual(["service:iam"]);
    expect(screen.getByRole("tab", { name: /^IAM/ })).toHaveAttribute("data-state", "active");
  });

  it("opens the Route 53 tab and displays Route 53 service view", () => {
    renderApp();
    fireEvent.click(screen.getByRole("button", { name: /^Route 53/ }));
    expect(useTabs.getState().tabs.map((t) => t.id)).toEqual(["service:route53"]);
    expect(screen.getByRole("tab", { name: /^Route 53/ })).toHaveAttribute("data-state", "active");
  });

  it("opens the EC2 tab and displays EC2 service view", () => {
    renderApp();
    fireEvent.click(screen.getByRole("button", { name: /^EC2/ }));
    expect(useTabs.getState().tabs.map((t) => t.id)).toEqual(["service:ec2"]);
    expect(screen.getByRole("tab", { name: /^EC2/ })).toHaveAttribute("data-state", "active");
  });

  it("opens the Docker tab and displays the Docker panel", () => {
    renderApp();
    fireEvent.click(screen.getByRole("button", { name: /^Docker/ }));
    expect(useTabs.getState().tabs.map((t) => t.id)).toEqual(["docker"]);
    expect(screen.getByRole("tab", { name: /^Docker/ })).toHaveAttribute("data-state", "active");
    expect(screen.getByText("LocalStack container lifecycle")).toBeInTheDocument();
    expect(screen.getByText(/Docker daemon/)).toBeInTheDocument();
  });

  it("opens the Lambda tab and navigates into a function", async () => {
    renderApp();
    fireEvent.click(screen.getByRole("button", { name: /^Lambda/ }));
    expect(screen.getByText("hello")).toBeInTheDocument();
    expect(screen.getByRole("tab", { selected: true })).toHaveTextContent("Lambda");

    fireEvent.click(screen.getByText("hello"));

    expect(useTabs.getState().tabs.map((t) => t.id)).toEqual([
      "service:lambda",
      "function:hello",
    ]);
    expect(screen.getByRole("tab", { selected: true })).toHaveTextContent("hello");
  });
  it("opens the IAM tab and displays IAM service view", () => {
    renderApp();
    fireEvent.click(screen.getByRole("button", { name: /^IAM/ }));
    expect(useTabs.getState().tabs.map((t) => t.id)).toEqual(["service:iam"]);
    expect(screen.getByRole("tab", { name: /^IAM/ })).toHaveAttribute("data-state", "active");
  });
  it("opens the Route 53 tab and displays Route 53 service view", () => {
    renderApp();
    fireEvent.click(screen.getByRole("button", { name: /^Route 53/ }));
    expect(useTabs.getState().tabs.map((t) => t.id)).toEqual(["service:route53"]);
    expect(screen.getByRole("tab", { name: /^Route 53/ })).toHaveAttribute("data-state", "active");
  });
  it("opens the EC2 tab and displays EC2 service view", () => {
    renderApp();
    fireEvent.click(screen.getByRole("button", { name: /^EC2/ }));
    expect(useTabs.getState().tabs.map((t) => t.id)).toEqual(["service:ec2"]);
    expect(screen.getByRole("tab", { name: /^EC2/ })).toHaveAttribute("data-state", "active");
  });

  it("opens the palette with Cmd-K and navigates to SQS from it", () => {
    renderApp();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    fireEvent.keyDown(window, { key: "k", metaKey: true });
    expect(screen.getByRole("dialog")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("option", { name: "SQS" }));
    expect(useTabs.getState().tabs.map((t) => t.id)).toEqual(["service:sqs"]);
    expect(screen.getByRole("tab", { name: /SQS/ })).toBeInTheDocument();
  });

  it("toggles dark mode off when the theme button is clicked", () => {
    renderApp();
    expect(document.documentElement).toHaveClass("dark");

    fireEvent.click(screen.getByRole("button", { name: "Toggle theme" }));
    expect(document.documentElement).not.toHaveClass("dark");
  });

  it("opens settings tab when clicking settings button in sidebar footer", () => {
    renderApp();
    fireEvent.click(screen.getByRole("button", { name: "Open settings (⌘,)" }));

    expect(screen.getByRole("tab", { name: /Settings/ })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Appearance" })).toBeInTheDocument();
  });

  it("opens settings tab with ⌘, shortcut and deduplicates opening twice", () => {
    renderApp();
    fireEvent.keyDown(window, { key: ",", metaKey: true });

    expect(screen.getByRole("tab", { name: /Settings/ })).toBeInTheDocument();
    expect(useTabs.getState().tabs.filter((t) => t.id === "settings")).toHaveLength(1);

    fireEvent.keyDown(window, { key: ",", metaKey: true });
    expect(useTabs.getState().tabs.filter((t) => t.id === "settings")).toHaveLength(1);
    expect(useTabs.getState().activeTabId).toBe("settings");
  });
});
