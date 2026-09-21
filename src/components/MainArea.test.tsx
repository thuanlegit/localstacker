import type { UseQueryResult } from "@tanstack/react-query";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { fireEvent, screen } from "@testing-library/react";
import { MainArea } from "./MainArea";
import { renderWithProviders } from "@/test/utils";
import { useTabs } from "@/store/tabs";
import type { HealthInfo } from "@/lib/health";
import * as healthHooks from "@/hooks/use-health";
vi.mock("@/components/s3/S3ServiceView", () => ({
  S3ServiceView: () => <div data-testid="s3-service-view">S3 Service</div>,
}));
vi.mock("@/components/sqs/SqsServiceView", () => ({
  SqsServiceView: () => <div data-testid="sqs-service-view">SQS Service</div>,
}));
let shouldLambdaCrash = false;
vi.mock("@/components/lambda/LambdaServiceView", () => ({
  LambdaServiceView: () => {
    if (shouldLambdaCrash) throw new Error("Simulated tab failure");
    return <div data-testid="lambda-service-view">Lambda Service</div>;
  },
}));
vi.mock("@/components/HomeView", () => ({
  HomeView: () => <div data-testid="home-view">Home</div>,
}));

describe("MainArea tabs", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    shouldLambdaCrash = false;
    useTabs.setState({ tabs: [], activeTabId: null });

    // Mock scrollIntoView in jsdom
    window.HTMLElement.prototype.scrollIntoView = vi.fn();
  });

  it("renders the home view when no tabs exist", () => {
    renderWithProviders(<MainArea />);
    expect(screen.getByTestId("home-view")).toBeInTheDocument();
  });

  it("renders scrollable tab container and active tab content", () => {
    useTabs.setState({
      tabs: [
        { id: "service:s3", kind: "service", service: "s3", title: "S3" },
        { id: "service:sqs", kind: "service", service: "sqs", title: "SQS" },
      ],
      activeTabId: "service:s3",
    });

    renderWithProviders(<MainArea />);

    const scrollContainer = screen.getByTestId("tab-scroll-container");
    expect(scrollContainer.className).toContain("overflow-x-auto");
    expect(scrollContainer.className).toContain("min-w-0");

    expect(screen.getByRole("tab", { name: /S3/i })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /SQS/i })).toBeInTheDocument();
    expect(screen.getByTestId("s3-service-view")).toBeInTheDocument();
  });

  it("closes single tab when clicking X on that tab", () => {
    useTabs.setState({
      tabs: [
        { id: "service:s3", kind: "service", service: "s3", title: "S3" },
        { id: "service:sqs", kind: "service", service: "sqs", title: "SQS" },
      ],
      activeTabId: "service:s3",
    });

    renderWithProviders(<MainArea />);

    const closeBtn = screen.getByLabelText("Close S3");
    fireEvent.click(closeBtn);

    expect(useTabs.getState().tabs).toHaveLength(1);
    expect(useTabs.getState().tabs[0].id).toBe("service:sqs");
  });

  it("closes single tab on middle-click (aux click)", () => {
    useTabs.setState({
      tabs: [
        { id: "service:s3", kind: "service", service: "s3", title: "S3" },
        { id: "service:sqs", kind: "service", service: "sqs", title: "SQS" },
      ],
      activeTabId: "service:s3",
    });

    renderWithProviders(<MainArea />);

    const s3Tab = screen.getByRole("tab", { name: /S3/i });
    fireEvent(
      s3Tab,
      new MouseEvent("auxclick", { bubbles: true, cancelable: true, button: 1 }),
    );
    expect(useTabs.getState().tabs).toHaveLength(1);
    expect(useTabs.getState().tabs[0].id).toBe("service:sqs");
  });

  it("closes all tabs when clicking Close all button", () => {
    useTabs.setState({
      tabs: [
        { id: "service:s3", kind: "service", service: "s3", title: "S3" },
        { id: "service:sqs", kind: "service", service: "sqs", title: "SQS" },
      ],
      activeTabId: "service:s3",
    });

    renderWithProviders(<MainArea />);

    const closeAllBtn = screen.getByRole("button", { name: /close all/i });
    fireEvent.click(closeAllBtn);

    expect(useTabs.getState().tabs).toHaveLength(0);
    expect(useTabs.getState().activeTabId).toBeNull();
    expect(screen.getByTestId("home-view")).toBeInTheDocument();
  });

  it("translates vertical wheel event to horizontal scroll on tab container", () => {
    useTabs.setState({
      tabs: [
        { id: "service:s3", kind: "service", service: "s3", title: "S3" },
        { id: "service:sqs", kind: "service", service: "sqs", title: "SQS" },
      ],
      activeTabId: "service:s3",
    });

    renderWithProviders(<MainArea />);

    const scrollContainer = screen.getByTestId("tab-scroll-container");
    expect(scrollContainer.scrollLeft).toBe(0);

    fireEvent.wheel(scrollContainer, { deltaY: 100, deltaX: 0 });
    expect(scrollContainer.scrollLeft).toBe(100);
  });

  it("isolates crashing tab with TabErrorBoundary and allows closing it", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    shouldLambdaCrash = true;

    useTabs.setState({
      tabs: [
        { id: "service:lambda", kind: "service", service: "lambda", title: "Lambda" },
      ],
      activeTabId: "service:lambda",
    });

    renderWithProviders(<MainArea />);

    expect(screen.getByTestId("tab-error-boundary-fallback")).toBeInTheDocument();
    expect(screen.getByText("Failed to load Lambda")).toBeInTheDocument();
    expect(screen.getByText(/Simulated tab failure/)).toBeInTheDocument();

    const closeBtn = screen.getByRole("button", { name: /Close tab/i });
    fireEvent.click(closeBtn);

    expect(useTabs.getState().tabs).toHaveLength(0);
  });

  it("renders disconnected warning banner when LocalStack is down and tabs are open", () => {
    vi.spyOn(healthHooks, "useHealth").mockReturnValue({
      data: { status: "down", reason: "Connection refused" },
    } as unknown as UseQueryResult<HealthInfo, Error>);

    useTabs.setState({
      tabs: [
        { id: "service:s3", kind: "service", service: "s3", title: "S3" },
      ],
      activeTabId: "service:s3",
    });

    renderWithProviders(<MainArea />);
    expect(screen.getByTestId("connection-disconnected-banner")).toBeInTheDocument();
    expect(screen.getByText(/LocalStack is not running/i)).toBeInTheDocument();
    expect(screen.getByText(/Connection refused/i)).toBeInTheDocument();
    expect(screen.getByText(/docker start localstack/i)).toBeInTheDocument();
  });
});
