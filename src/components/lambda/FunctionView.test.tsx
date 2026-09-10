import { describe, expect, it, vi, beforeEach } from "vitest";
import { fireEvent, screen, within } from "@testing-library/react";
import type { LambdaClient } from "@aws-sdk/client-lambda";
import { FunctionView } from "./FunctionView";
import { renderWithProviders } from "@/test/utils";
import { LOCAL_PROFILE_ID, localProfile, useProfiles } from "@/store/profiles";
import { useTabs } from "@/store/tabs";
import {
  invokeFunction,
  updateFunctionEnvVars,
  type LambdaFunctionSummary,
  type LambdaFunctionConfig,
  type EventSourceMappingSummary,
} from "@/lib/lambda";

vi.mock("@/lib/lambda", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/lambda")>();
  return {
    ...actual,
    invokeFunction: vi.fn().mockResolvedValue({
      statusCode: 200,
      executedVersion: "$LATEST",
      payload: '{"greeting":"Hello world"}',
      logs: "START\nGreeting dispatched\nEND",
      durationMs: 42,
      requestId: "req-1",
    }),
    updateFunctionEnvVars: vi.fn().mockResolvedValue(undefined),
  };
});

const mockSend = vi.fn().mockResolvedValue({});
const mockClient = { send: mockSend } as unknown as LambdaClient;

const demoFunction: LambdaFunctionSummary = {
  name: "hello",
  runtime: "nodejs22.x",
  handler: "index.handler",
  description: "Greeting function",
  codeSize: 2048,
  lastModified: new Date("2026-01-01T00:00:00Z"),
};

const demoConfig: LambdaFunctionConfig = {
  name: "hello",
  runtime: "nodejs22.x",
  handler: "index.handler",
  description: "Greeting function",
  role: "arn:aws:iam::000000000000:role/lambda-role",
  timeoutSeconds: 15,
  memorySize: 256,
  envVars: {
    NODE_ENV: "production",
  },
  lastModified: new Date("2026-01-01T00:00:00Z"),
  state: "Active",
};

let currentFunctions: LambdaFunctionSummary[] = [demoFunction];
let currentConfig: LambdaFunctionConfig | null = demoConfig;
let currentTriggers: EventSourceMappingSummary[] = [];

const mockCreateMapping = vi.fn().mockResolvedValue({ uuid: "new-uuid" });
const mockUpdateMapping = vi.fn().mockResolvedValue(true);
const mockDeleteMapping = vi.fn().mockResolvedValue(true);
vi.mock("@/hooks/use-lambda", () => ({
  useLambdaClient: () => mockClient,
  useFunctions: () => ({
    data: currentFunctions,
    isPending: false,
    isFetching: false,
    error: null,
    refetch: vi.fn(),
  }),
  useFunctionConfig: () => ({
    data: currentConfig,
    isPending: false,
    isFetching: false,
    error: null,
    refetch: vi.fn(),
  }),
  useEventSourceMappings: () => ({
    data: currentTriggers,
    isLoading: false,
    refetch: vi.fn(),
  }),
  useEventSourceMappingActions: () => ({
    createMapping: mockCreateMapping,
    updateMapping: mockUpdateMapping,
    deleteMapping: mockDeleteMapping,
  }),
  lambdaKeys: {
    functions: (id: string) => ["lambda", "functions", id],
    config: (id: string, name: string) => ["lambda", "config", id, name],
    eventSourceMappings: (...args: unknown[]) => [
      "lambda",
      "eventSourceMappings",
      ...args,
    ],
  },
}));

describe("FunctionView", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    currentFunctions = [demoFunction];
    currentConfig = demoConfig;
    currentTriggers = [];
    useProfiles.setState({
      profiles: [{ ...localProfile(), region: "us-east-1" }],
      activeProfileId: LOCAL_PROFILE_ID,
    });
    useTabs.setState({
      tabs: [
        {
          id: "function:hello",
          kind: "function",
          functionName: "hello",
          title: "hello",
        },
      ],
      activeTabId: "function:hello",
    });
  });

  it("renders function config details and environment variables", () => {
    renderWithProviders(<FunctionView functionName="hello" />);
    expect(screen.getByRole("heading", { name: "hello" })).toBeInTheDocument();
    expect(screen.getByText("index.handler")).toBeInTheDocument();
    expect(screen.getByText("15s")).toBeInTheDocument();
    expect(screen.getByText("256 MB")).toBeInTheDocument();
    expect(screen.getByText("Active")).toBeInTheDocument();
    expect(screen.getByText("NODE_ENV")).toBeInTheDocument();
    expect(screen.getByText("production")).toBeInTheDocument();
  });

  it("validates JSON payload, invokes function, and displays status, duration, response, and logs", async () => {
    renderWithProviders(<FunctionView functionName="hello" />);
    fireEvent.click(screen.getByRole("button", { name: "Invoke" }));

    const dialog = await screen.findByRole("dialog");
    expect(
      within(dialog).getByRole("heading", { name: "Invoke hello" }),
    ).toBeInTheDocument();

    const textarea = within(dialog).getByLabelText(/Payload \(JSON\)/i);
    const submitBtn = within(dialog).getByRole("button", { name: "Invoke" });

    // Invalid JSON
    fireEvent.change(textarea, { target: { value: '{"bad' } });
    expect(
      within(dialog).getByText("Payload must be valid JSON"),
    ).toBeInTheDocument();
    expect(submitBtn).toBeDisabled();

    // Valid JSON
    fireEvent.change(textarea, { target: { value: '{"name":"world"}' } });
    expect(
      within(dialog).queryByText("Payload must be valid JSON"),
    ).not.toBeInTheDocument();
    expect(submitBtn).not.toBeDisabled();

    fireEvent.click(submitBtn);

    expect(invokeFunction).toHaveBeenCalledWith(mockClient, {
      functionName: "hello",
      payload: '{"name":"world"}',
    });

    // Verify results displayed
    expect(await within(dialog).findByText("200")).toBeInTheDocument();
    expect(within(dialog).getByText(/42 ms/)).toBeInTheDocument();
    expect(within(dialog).getByText(/Hello world/)).toBeInTheDocument();
    expect(within(dialog).getByText(/Greeting dispatched/)).toBeInTheDocument();
  });

  it("displays function error badge and logs unavailable message when appropriate", async () => {
    vi.mocked(invokeFunction).mockResolvedValueOnce({
      statusCode: 200,
      executedVersion: "$LATEST",
      functionError: "Unhandled",
      payload: '{"errorMessage":"boom"}',
      logs: undefined,
      durationMs: 12,
    });

    renderWithProviders(<FunctionView functionName="hello" />);
    fireEvent.click(screen.getByRole("button", { name: "Invoke" }));

    const dialog = await screen.findByRole("dialog");
    const submitBtn = within(dialog).getByRole("button", { name: "Invoke" });
    fireEvent.click(submitBtn);

    expect(await within(dialog).findByText("Unhandled")).toBeInTheDocument();
    expect(
      within(dialog).getByText(/Logs unavailable for this invocation/),
    ).toBeInTheDocument();
  });

  it("edits environment variables and prevents duplicates", async () => {
    renderWithProviders(<FunctionView functionName="hello" />);
    fireEvent.click(screen.getByRole("button", { name: "Edit env vars" }));

    const dialog = await screen.findByRole("dialog");
    expect(
      within(dialog).getByRole("heading", { name: "Edit environment variables" }),
    ).toBeInTheDocument();

    const addBtn = within(dialog).getByRole("button", { name: /Add variable/i });
    fireEvent.click(addBtn);

    const keyInputs = within(dialog).getAllByPlaceholderText("Key");
    const valInputs = within(dialog).getAllByPlaceholderText("Value");

    // Add duplicate key
    fireEvent.change(keyInputs[1], { target: { value: "NODE_ENV" } });
    expect(within(dialog).getByText("Duplicate key")).toBeInTheDocument();
    const saveBtn = within(dialog).getByRole("button", {
      name: "Save variables",
    });
    expect(saveBtn).toBeDisabled();

    // Fix duplicate key
    fireEvent.change(keyInputs[1], { target: { value: "PORT" } });
    fireEvent.change(valInputs[1], { target: { value: "8080" } });
    expect(within(dialog).queryByText("Duplicate key")).not.toBeInTheDocument();
    expect(saveBtn).not.toBeDisabled();

    fireEvent.click(saveBtn);

    expect(updateFunctionEnvVars).toHaveBeenCalledWith(mockClient, {
      functionName: "hello",
      envVars: {
        NODE_ENV: "production",
        PORT: "8080",
      },
    });
  });
  it("opens CloudWatch logs tab on clicking View logs button", () => {
    renderWithProviders(<FunctionView functionName="hello" />);
    const viewLogsBtn = screen.getByRole("button", { name: /View logs/i });
    fireEvent.click(viewLogsBtn);

    const tabs = useTabs.getState().tabs;
    expect(
      tabs.some(
        (t) =>
          t.id === "logGroup:/aws/lambda/hello" &&
          t.kind === "logGroup" &&
          t.logGroupName === "/aws/lambda/hello",
      ),
    ).toBe(true);
  });

  it("renders triggers section and displays triggers", () => {
    currentTriggers = [
      {
        uuid: "esm-1",
        functionArn: "arn:aws:lambda:us-east-1:000000000000:function:hello",
        functionName: "hello",
        eventSourceArn: "arn:aws:sqs:us-east-1:000000000000:orders-queue",
        batchSize: 10,
        maximumBatchingWindowInSeconds: 5,
        state: "Enabled",
        service: "sqs",
        resourceName: "orders-queue",
      },
    ];

    renderWithProviders(<FunctionView functionName="hello" />);
    expect(screen.getByText("Triggers & Event Sources")).toBeInTheDocument();
    expect(screen.getByText("orders-queue")).toBeInTheDocument();
    expect(screen.getByText("10 msgs")).toBeInTheDocument();
    expect(screen.getByText("5s")).toBeInTheDocument();
    expect(screen.getByText("Enabled")).toBeInTheDocument();

    // Toggle trigger
    const disableBtn = screen.getByRole("button", { name: /Disable/i });
    fireEvent.click(disableBtn);
    expect(mockUpdateMapping).toHaveBeenCalledWith({
      uuid: "esm-1",
      functionName: "hello",
      enabled: false,
    });

    // Delete trigger
    const deleteBtn = screen.getByRole("button", {
      name: /Delete trigger orders-queue/i,
    });
    fireEvent.click(deleteBtn);
    const confirmDialog = screen.getByRole("dialog");
    expect(
      within(confirmDialog).getByText(/Delete Event Source Trigger/i),
    ).toBeInTheDocument();

    const confirmBtn = within(confirmDialog).getByRole("button", {
      name: "Delete trigger",
    });
    fireEvent.click(confirmBtn);
    expect(mockDeleteMapping).toHaveBeenCalledWith("esm-1");
  });
});
