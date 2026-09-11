import { describe, expect, it, vi, beforeEach } from "vitest";
import { fireEvent, screen } from "@testing-library/react";
import { MainArea } from "./MainArea";
import { renderWithProviders } from "@/test/utils";
import { useTabs } from "@/store/tabs";

vi.mock("@/components/s3/S3ServiceView", () => ({
  S3ServiceView: () => <div data-testid="s3-service-view">S3 Service</div>,
}));
vi.mock("@/components/sqs/SqsServiceView", () => ({
  SqsServiceView: () => <div data-testid="sqs-service-view">SQS Service</div>,
}));
vi.mock("@/components/lambda/LambdaServiceView", () => ({
  LambdaServiceView: () => <div data-testid="lambda-service-view">Lambda Service</div>,
}));
vi.mock("@/components/HomeView", () => ({
  HomeView: () => <div data-testid="home-view">Home</div>,
}));

describe("MainArea tabs", () => {
  beforeEach(() => {
    vi.clearAllMocks();
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
});
