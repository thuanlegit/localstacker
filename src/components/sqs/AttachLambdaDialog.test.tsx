import { describe, expect, it, vi, beforeEach } from "vitest";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { AttachLambdaDialog } from "./AttachLambdaDialog";
import { renderWithProviders } from "@/test/utils";
import { LOCAL_PROFILE_ID, localProfile, useProfiles } from "@/store/profiles";
import type { QueueSummary } from "@/lib/sqs";
import type { LambdaFunctionSummary } from "@/lib/lambda";

const mockCreateMapping = vi.fn().mockResolvedValue({ uuid: "esm-456" });

const mockQueue: QueueSummary = {
  url: "http://localhost:4566/000000000000/orders-queue",
  name: "orders-queue",
  isFifo: false,
  attributes: {
    depth: 0,
    inFlight: 0,
    delayed: 0,
    arn: "arn:aws:sqs:us-east-1:000000000000:orders-queue",
  },
};

const mockFunctions: LambdaFunctionSummary[] = [
  {
    name: "orders-worker",
    runtime: "nodejs22.x",
    handler: "index.handler",
  },
];

vi.mock("@/hooks/use-lambda", () => ({
  useFunctions: () => ({
    data: mockFunctions,
    isLoading: false,
  }),
  useEventSourceMappingActions: () => ({
    createMapping: mockCreateMapping,
  }),
}));

describe("AttachLambdaDialog", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useProfiles.setState({
      profiles: [{ ...localProfile(), region: "us-east-1" }],
      activeProfileId: LOCAL_PROFILE_ID,
    });
  });

  it("renders with target queue and selects first function by default", async () => {
    const onOpenChange = vi.fn();
    renderWithProviders(
      <AttachLambdaDialog
        open={true}
        onOpenChange={onOpenChange}
        queue={mockQueue}
      />,
    );

    expect(screen.getByText("Attach Lambda Trigger")).toBeInTheDocument();
    expect(screen.getAllByText("orders-queue").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("orders-worker")).toBeInTheDocument();

    const attachBtn = screen.getByRole("button", { name: "Attach Lambda" });
    fireEvent.click(attachBtn);

    await waitFor(() => {
      expect(mockCreateMapping).toHaveBeenCalledWith({
        functionName: "orders-worker",
        eventSourceArn: "arn:aws:sqs:us-east-1:000000000000:orders-queue",
        batchSize: 10,
        maximumBatchingWindowInSeconds: 0,
        enabled: true,
      });
      expect(onOpenChange).toHaveBeenCalledWith(false);
    });
  });
});
