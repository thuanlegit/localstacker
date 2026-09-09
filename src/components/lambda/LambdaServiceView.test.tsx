import { describe, expect, it, vi, beforeEach } from "vitest";
import { fireEvent, screen, within } from "@testing-library/react";
import { LambdaServiceView } from "./LambdaServiceView";
import { renderWithProviders } from "@/test/utils";
import { LOCAL_PROFILE_ID, localProfile, useProfiles } from "@/store/profiles";
import { useTabs } from "@/store/tabs";
import type { LambdaFunctionSummary } from "@/lib/lambda";

const demoFunction: LambdaFunctionSummary = {
  name: "hello",
  runtime: "nodejs22.x",
  handler: "index.handler",
  description: "Greeting function",
  codeSize: 2048,
  lastModified: new Date("2026-01-01T00:00:00Z"),
};

let currentFunctions: LambdaFunctionSummary[] | undefined = [demoFunction];
let currentError: Error | null = null;

vi.mock("@/hooks/use-lambda", () => ({
  useFunctions: () => ({
    data: currentFunctions,
    isPending: false,
    isFetching: false,
    error: currentError,
    refetch: vi.fn(),
  }),
  lambdaKeys: {
    functions: (id: string) => ["lambda", "functions", id],
    config: (id: string, name: string) => ["lambda", "config", id, name],
  },
}));

describe("LambdaServiceView", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    currentFunctions = [demoFunction];
    currentError = null;
    useProfiles.setState({
      profiles: [{ ...localProfile(), region: "us-east-1" }],
      activeProfileId: LOCAL_PROFILE_ID,
    });
    useTabs.setState({
      tabs: [],
      activeTabId: null,
    });
  });

  it("renders function rows with name, runtime, and handler", () => {
    renderWithProviders(<LambdaServiceView />);
    expect(screen.getByText("Functions")).toBeInTheDocument();
    const row = screen.getByRole("row", { name: /hello/i });
    expect(within(row).getByText("hello")).toBeInTheDocument();
    expect(within(row).getByText("nodejs22.x")).toBeInTheDocument();
    expect(within(row).getByText("index.handler")).toBeInTheDocument();
    expect(within(row).getByText("2 KB")).toBeInTheDocument();
  });

  it("opens function tab when row is clicked", () => {
    renderWithProviders(<LambdaServiceView />);
    const row = screen.getByRole("row", { name: /hello/i });
    fireEvent.click(row);

    const tabState = useTabs.getState();
    expect(tabState.tabs).toEqual([
      {
        id: "function:hello",
        kind: "function",
        functionName: "hello",
        title: "hello",
      },
    ]);
  });

  it("renders ServiceDisabledView when lambda service is disabled", () => {
    currentFunctions = undefined;
    currentError = new Error(
      "Service 'lambda' is not enabled. Check your 'SERVICES' configuration variable.",
    );

    renderWithProviders(<LambdaServiceView />);

    expect(screen.getByTestId("service-disabled-view")).toBeInTheDocument();
    expect(screen.getByText("Lambda is turned off")).toBeInTheDocument();
  });
});
