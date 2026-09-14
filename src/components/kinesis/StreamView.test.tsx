import { describe, expect, it, vi, beforeEach } from "vitest";
import { fireEvent, screen, within } from "@testing-library/react";
import { StreamView } from "./StreamView";
import { peekRecords } from "@/lib/kinesis";
import { renderWithProviders } from "@/test/utils";
import { LOCAL_PROFILE_ID, localProfile, useProfiles } from "@/store/profiles";
import type { ShardLite, StreamSummary } from "@/lib/kinesis";

const SUMMARY: StreamSummary = {
  name: "orders",
  arn: "arn:aws:kinesis:us-east-1:000000000000:stream/orders",
  status: "ACTIVE",
  shardCount: 1,
  retentionPeriodHours: 24,
};

const SHARDS: ShardLite[] = [
  { shardId: "shardId-000001", sequenceNumberRange: { start: "100" } },
];

const { mockState, mockPutRecord } = vi.hoisted(() => ({
  mockState: {
    serviceStatus: "available" as string,
    summary: undefined as StreamSummary | undefined,
    error: null as Error | null,
    shards: [] as ShardLite[] | undefined,
    consumers: [] as Array<{ arn: string; name: string }>,
  },
  mockPutRecord: vi.fn().mockResolvedValue("seq-123"),
}));

vi.mock("@/lib/kinesis", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/kinesis")>();
  return {
    ...actual,
    peekRecords: vi.fn(),
  };
});

vi.mock("@/hooks/use-health", () => ({
  useServiceStatus: () => mockState.serviceStatus,
  useHealth: () => ({ data: undefined, refetch: vi.fn() }),
  isServiceDisabledError: (err: unknown) =>
    err instanceof Error && err.message.includes("is not enabled"),
}));

vi.mock("@/hooks/use-kinesis", () => ({
  useKinesisClient: () => ({ send: vi.fn() }),
  useStreamSummary: () => ({
    data: mockState.summary,
    isPending: false,
    isFetching: false,
    error: mockState.error,
    refetch: vi.fn(),
  }),
  useKinesisShards: () => ({
    data: mockState.shards,
    isPending: false,
    refetch: vi.fn(),
  }),
  useKinesisConsumers: () => ({
    data: mockState.consumers,
    isPending: false,
  }),
  useKinesisActions: () => ({
    putRecord: mockPutRecord,
    createStream: vi.fn(),
    deleteStream: vi.fn(),
  }),
}));

describe("StreamView", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(peekRecords).mockResolvedValue([
      {
        sequenceNumber: "10",
        partitionKey: "k1",
        data: "hello",
        approxArrival: new Date("2024-01-01T00:00:00Z"),
      },
    ]);
    mockState.serviceStatus = "available";
    mockState.summary = { ...SUMMARY };
    mockState.error = null;
    mockState.shards = SHARDS.map((s) => ({ ...s }));
    mockState.consumers = [];
    useProfiles.setState({
      profiles: [{ ...localProfile(), region: "us-east-1" }],
      activeProfileId: LOCAL_PROFILE_ID,
    });
  });

  it("renders summary, shards, and consumers", () => {
    renderWithProviders(<StreamView streamName="orders" />);

    expect(screen.getByRole("heading", { name: "orders" })).toBeInTheDocument();
    expect(screen.getByText("ACTIVE")).toBeInTheDocument();
    expect(screen.getByText("shardId-000001")).toBeInTheDocument();
    expect(screen.getByText("Consumers (EFO)")).toBeInTheDocument();
    expect(screen.getByText("No enhanced consumers registered.")).toBeInTheDocument();
  });

  it("peeks a shard and renders the decoded record", async () => {
    renderWithProviders(<StreamView streamName="orders" />);

    fireEvent.click(screen.getByRole("button", { name: /Peek/i }));

    expect(await screen.findByText(/hello/)).toBeInTheDocument();
    expect(screen.getByText(/hello/)).toBeInTheDocument();
    expect(peekRecords).toHaveBeenCalledWith(expect.anything(), {
      streamName: "orders",
      shardId: "shardId-000001",
    });
  });

  it("publishes a record via the Put record dialog", async () => {
    renderWithProviders(<StreamView streamName="orders" />);

    fireEvent.click(screen.getByRole("button", { name: /Put record/i }));
    const dialog = screen.getByRole("dialog");
    fireEvent.change(within(dialog).getByLabelText(/Record data/i), {
      target: { value: "hello" },
    });
    fireEvent.change(within(dialog).getByLabelText(/Partition key/i), {
      target: { value: "k1" },
    });
    fireEvent.click(within(dialog).getByRole("button", { name: "Publish" }));

    expect(mockPutRecord).toHaveBeenCalledWith({
      streamName: "orders",
      data: "hello",
      partitionKey: "k1",
    });
  });
});
