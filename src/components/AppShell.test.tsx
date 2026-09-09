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
const { demoQueue } = vi.hoisted(() => ({
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
    useTabs.setState({ tabs: [], activeTabId: null });
    useTheme.setState({ theme: "dark" });
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
});
