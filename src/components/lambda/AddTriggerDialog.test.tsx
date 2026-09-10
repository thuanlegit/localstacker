import { describe, expect, it, vi, beforeEach } from "vitest";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { AddTriggerDialog } from "./AddTriggerDialog";
import { renderWithProviders } from "@/test/utils";
import { LOCAL_PROFILE_ID, localProfile, useProfiles } from "@/store/profiles";
import type { QueueSummary } from "@/lib/sqs";

const mockCreateMapping = vi.fn().mockResolvedValue({ uuid: "esm-123" });

const mockQueues: QueueSummary[] = [
  {
    url: "http://localhost:4566/000000000000/orders-queue",
    name: "orders-queue",
    isFifo: false,
    attributes: {
      depth: 0,
      inFlight: 0,
      delayed: 0,
      arn: "arn:aws:sqs:us-east-1:000000000000:orders-queue",
    },
  },
];

vi.mock("@/hooks/use-sqs", () => ({
  useQueues: () => ({
    data: mockQueues,
    isLoading: false,
  }),
}));

vi.mock("@/hooks/use-lambda", () => ({
  useEventSourceMappingActions: () => ({
    createMapping: mockCreateMapping,
  }),
}));

describe("AddTriggerDialog", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useProfiles.setState({
      profiles: [{ ...localProfile(), region: "us-east-1" }],
      activeProfileId: LOCAL_PROFILE_ID,
    });
  });

  it("renders with SQS queue selected by default and creates trigger", async () => {
    const onOpenChange = vi.fn();
    renderWithProviders(
      <AddTriggerDialog
        open={true}
        onOpenChange={onOpenChange}
        functionName="my-consumer"
      />,
    );

    expect(screen.getByText("Add Event Source Trigger")).toBeInTheDocument();
    expect(screen.getByText("SQS Queue")).toBeInTheDocument();

    const addBtn = screen.getByRole("button", { name: "Add Trigger" });
    fireEvent.click(addBtn);

    await waitFor(() => {
      expect(mockCreateMapping).toHaveBeenCalledWith({
        functionName: "my-consumer",
        eventSourceArn: "arn:aws:sqs:us-east-1:000000000000:orders-queue",
        batchSize: 10,
        maximumBatchingWindowInSeconds: 0,
        enabled: true,
      });
      expect(onOpenChange).toHaveBeenCalledWith(false);
    });
  });

  it("supports custom ARN and custom batch size", async () => {
    const onOpenChange = vi.fn();
    renderWithProviders(
      <AddTriggerDialog
        open={true}
        onOpenChange={onOpenChange}
        functionName="my-consumer"
      />,
    );

    const customBtn = screen.getByRole("button", { name: "Custom ARN" });
    fireEvent.click(customBtn);

    const arnInput = screen.getByLabelText("Event Source ARN");
    fireEvent.change(arnInput, {
      target: {
        value: "arn:aws:dynamodb:us-east-1:000000000000:table/users/stream/123",
      },
    });

    const batchSizeInput = screen.getByLabelText("Batch Size");
    fireEvent.change(batchSizeInput, { target: { value: "25" } });

    const batchWindowInput = screen.getByLabelText(/Batch Window/i);
    fireEvent.change(batchWindowInput, { target: { value: "5" } });

    const addBtn = screen.getByRole("button", { name: "Add Trigger" });
    fireEvent.click(addBtn);

    await waitFor(() => {
      expect(mockCreateMapping).toHaveBeenCalledWith({
        functionName: "my-consumer",
        eventSourceArn:
          "arn:aws:dynamodb:us-east-1:000000000000:table/users/stream/123",
        batchSize: 25,
        maximumBatchingWindowInSeconds: 5,
        enabled: true,
      });
      expect(onOpenChange).toHaveBeenCalledWith(false);
    });
  });
});
