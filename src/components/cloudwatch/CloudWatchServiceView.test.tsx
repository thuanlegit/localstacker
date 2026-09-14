import { describe, expect, it, vi, beforeEach } from "vitest";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { CloudWatchServiceView } from "./CloudWatchServiceView";
import { renderWithProviders } from "@/test/utils";
import { LOCAL_PROFILE_ID, localProfile, useProfiles } from "@/store/profiles";

const { mockState, mockPut, mockCreateAlarm, mockDeleteAlarm } = vi.hoisted(() => ({
  mockState: {
    serviceStatus: "available" as string,
    metrics:
      [
        {
          namespace: "MyApp",
          metricName: "OrderCount",
          dimensions: [{ name: "Service", value: "checkout" }],
        },
        { namespace: "MyApp", metricName: "Latency", dimensions: [] },
      ] as
        | {
            namespace: string;
            metricName: string;
            dimensions: { name: string; value: string }[];
          }[]
        | undefined,
    alarms:
      [
        {
          name: "high-orders",
          arn: "arn:aws:cloudwatch:us-east-1:000000000000:alarm:high-orders",
          state: "OK",
          stateReason: "thresholds ok",
          namespace: "MyApp",
          metricName: "OrderCount",
          comparison: "GreaterThanThreshold",
          threshold: 100,
          evaluationPeriods: 2,
          period: 300,
          dimensions: [{ name: "Service", value: "checkout" }],
          actionsEnabled: true,
        },
      ] as
        | {
            name: string;
            arn: string;
            state: string;
            stateReason: string;
            namespace: string;
            metricName: string;
            comparison: string;
            threshold: number;
            evaluationPeriods: number;
            period: number;
            dimensions: { name: string; value: string }[];
            actionsEnabled: boolean;
          }[]
        | undefined,
    error: null as Error | null,
    isPending: false,
  },
  mockPut: vi.fn().mockResolvedValue(true),
  mockCreateAlarm: vi.fn().mockResolvedValue(true),
  mockDeleteAlarm: vi.fn().mockResolvedValue(true),
}));

vi.mock("@/hooks/use-health", () => ({
  useServiceStatus: () => mockState.serviceStatus,
  useHealth: () => ({ data: undefined, refetch: vi.fn() }),
  isServiceDisabledError: (err: unknown) =>
    err instanceof Error && err.message.includes("is not enabled"),
}));

vi.mock("@/hooks/use-cloudwatch", () => ({
  useCloudWatchMetrics: () => ({
    data: mockState.metrics,
    isPending: mockState.isPending,
    isFetching: false,
    error: mockState.error,
    refetch: vi.fn(),
  }),
  useCloudWatchAlarms: () => ({
    data: mockState.alarms,
    isPending: mockState.isPending,
    isFetching: false,
    error: null,
    refetch: vi.fn(),
  }),
  useMetricStatistics: () => ({ data: [], isPending: false, refetch: vi.fn() }),
  useCloudWatchActions: () => ({
    putMetricData: mockPut,
    createAlarm: mockCreateAlarm,
    deleteAlarm: mockDeleteAlarm,
  }),
}));

describe("CloudWatchServiceView", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockState.error = null;
    mockState.isPending = false;
    useProfiles.setState({ profiles: [localProfile()], activeProfileId: LOCAL_PROFILE_ID });
  });

  it("renders metrics with alarm counts and the alarms section", () => {
    renderWithProviders(<CloudWatchServiceView />);

    expect(screen.getAllByText("MyApp")).toHaveLength(2);
    expect(screen.getByText("OrderCount")).toBeInTheDocument();
    expect(screen.getByText("Service=checkout")).toBeInTheDocument();
    expect(screen.getByText("high-orders")).toBeInTheDocument();
    expect(screen.getByText("OK")).toBeInTheDocument();
    expect(screen.getByText(/Metrics \(2\)/)).toBeInTheDocument();
    expect(screen.getByText(/Alarms \(1\)/)).toBeInTheDocument();
  });

  it("filters metrics by search", () => {
    renderWithProviders(<CloudWatchServiceView />);

    fireEvent.change(screen.getByPlaceholderText(/Filter by namespace/), {
      target: { value: "latency" },
    });
    expect(screen.getByText(/Metrics \(1\)/)).toBeInTheDocument();
    expect(screen.getByText("Latency")).toBeInTheDocument();
    expect(screen.queryByText("OrderCount")).not.toBeInTheDocument();
  });

  it("publishes metric data through the dialog", async () => {
    renderWithProviders(<CloudWatchServiceView />);

    fireEvent.click(screen.getByRole("button", { name: "Put metric data" }));
    const dialog = screen.getByRole("dialog");
    fireEvent.change(within(dialog).getByLabelText("Namespace"), {
      target: { value: "MyApp" },
    });
    fireEvent.change(within(dialog).getByLabelText("Metric name"), {
      target: { value: "CartSize" },
    });
    fireEvent.change(within(dialog).getByLabelText("Value"), {
      target: { value: "3" },
    });
    fireEvent.click(within(dialog).getByRole("button", { name: "Publish" }));

    await waitFor(() =>
      expect(mockPut).toHaveBeenCalledWith({
        namespace: "MyApp",
        metricName: "CartSize",
        value: 3,
        dimensions: [],
      }),
    );
  });

  it("creates an alarm through the dialog", async () => {
    renderWithProviders(<CloudWatchServiceView />);

    fireEvent.click(screen.getByRole("button", { name: "Create alarm" }));
    const dialog = screen.getByRole("dialog");
    fireEvent.change(within(dialog).getByLabelText("Alarm name"), {
      target: { value: "cart-too-big" },
    });
    fireEvent.change(within(dialog).getByLabelText("Namespace"), {
      target: { value: "MyApp" },
    });
    fireEvent.change(within(dialog).getByLabelText("Metric"), {
      target: { value: "CartSize" },
    });
    fireEvent.change(within(dialog).getByLabelText("Threshold"), {
      target: { value: "10" },
    });
    fireEvent.click(within(dialog).getByRole("button", { name: "Create alarm" }));

    await waitFor(() =>
      expect(mockCreateAlarm).toHaveBeenCalledWith(
        expect.objectContaining({
          name: "cart-too-big",
          namespace: "MyApp",
          metricName: "CartSize",
          comparison: "GreaterThanThreshold",
          threshold: 10,
          evaluationPeriods: 1,
          period: 300,
          dimensions: [],
        }),
      ),
    );
  });

  it("deletes an alarm after confirmation", async () => {
    renderWithProviders(<CloudWatchServiceView />);

    fireEvent.click(screen.getByRole("button", { name: "Delete alarm high-orders" }));
    const dialog = screen.getByRole("dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "Delete" }));

    await waitFor(() => expect(mockDeleteAlarm).toHaveBeenCalledWith("high-orders"));
  });

  it("renders disabled guard when service is disabled", () => {
    mockState.serviceStatus = "disabled";
    renderWithProviders(<CloudWatchServiceView />);
    expect(screen.getByTestId("service-disabled-view")).toBeInTheDocument();
    mockState.serviceStatus = "available";
  });
});

