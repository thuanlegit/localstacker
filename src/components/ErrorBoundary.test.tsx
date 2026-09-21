import type { ReactElement } from "react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { ErrorBoundary } from "./ErrorBoundary";
import { useTabs } from "@/store/tabs";

function Bomb({ message = "Boom!" }: { message?: string }): ReactElement {
  throw new Error(message);
}

describe("ErrorBoundary", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it("renders children when no error is thrown", () => {
    render(
      <ErrorBoundary>
        <div>All good</div>
      </ErrorBoundary>,
    );
    expect(screen.getByText("All good")).toBeInTheDocument();
  });

  it("renders root error fallback when an error is thrown", () => {
    render(
      <ErrorBoundary level="root">
        <Bomb message="Fatal crash in app" />
      </ErrorBoundary>,
    );

    expect(screen.getByTestId("root-error-boundary-fallback")).toBeInTheDocument();
    expect(screen.getByText("Something went wrong")).toBeInTheDocument();
    expect(screen.getByText(/Fatal crash in app/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Return to Home/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Reload App/i })).toBeInTheDocument();
  });

  it("toggles technical details on click", () => {
    render(
      <ErrorBoundary level="root">
        <Bomb message="Error with stack" />
      </ErrorBoundary>,
    );

    const toggleBtn = screen.getByRole("button", { name: /Show technical details/i });
    expect(toggleBtn).toBeInTheDocument();

    fireEvent.click(toggleBtn);
    expect(screen.getByRole("button", { name: /Hide technical details/i })).toBeInTheDocument();
  });

  it("renders tab error fallback when level is tab", () => {
    const onCloseTab = vi.fn();
    render(
      <ErrorBoundary level="tab" tabTitle="S3 Buckets" onCloseTab={onCloseTab}>
        <Bomb message="S3 view crashed" />
      </ErrorBoundary>,
    );

    expect(screen.getByTestId("tab-error-boundary-fallback")).toBeInTheDocument();
    expect(screen.getByText("Failed to load S3 Buckets")).toBeInTheDocument();
    expect(screen.getByText(/S3 view crashed/)).toBeInTheDocument();

    const retryBtn = screen.getByRole("button", { name: /Retry tab/i });
    expect(retryBtn).toBeInTheDocument();

    const closeBtn = screen.getByRole("button", { name: /Close tab/i });
    expect(closeBtn).toBeInTheDocument();
    fireEvent.click(closeBtn);
    expect(onCloseTab).toHaveBeenCalledTimes(1);
  });

  it("calls onError when an error is caught", () => {
    const onError = vi.fn();
    render(
      <ErrorBoundary onError={onError}>
        <Bomb message="Observed error" />
      </ErrorBoundary>,
    );

    expect(onError).toHaveBeenCalledWith(
      expect.objectContaining({ message: "Observed error" }),
      expect.objectContaining({ componentStack: expect.any(String) }),
    );
  });

  it("renders custom fallback function if provided", () => {
    render(
      <ErrorBoundary
        fallback={(err, reset) => (
          <div>
            <span>Custom: {err.message}</span>
            <button type="button" onClick={reset}>
              Reset
            </button>
          </div>
        )}
      >
        <Bomb message="Custom message" />
      </ErrorBoundary>,
    );

    expect(screen.getByText("Custom: Custom message")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Reset" })).toBeInTheDocument();
  });

  it("resets tabs when clicking Return to Home", () => {
    useTabs.setState({
      tabs: [{ id: "tab-1", kind: "service", title: "Tab 1" }],
      activeTabId: "tab-1",
    });

    render(
      <ErrorBoundary level="root">
        <Bomb message="Reset test" />
      </ErrorBoundary>,
    );

    const homeBtn = screen.getByRole("button", { name: /Return to Home/i });
    fireEvent.click(homeBtn);

    expect(useTabs.getState().tabs).toEqual([]);
    expect(useTabs.getState().activeTabId).toBeNull();
  });
});
