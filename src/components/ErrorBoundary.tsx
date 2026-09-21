import { Component, type ErrorInfo, type ReactNode } from "react";
import { AlertTriangle, Check, ChevronDown, ChevronUp, Copy, Home, RotateCw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useTabs } from "@/store/tabs";

export interface ErrorBoundaryProps {
  children: ReactNode;
  fallback?: ReactNode | ((error: Error, reset: () => void) => ReactNode);
  onError?: (error: Error, errorInfo: ErrorInfo) => void;
  level?: "root" | "tab";
  tabTitle?: string;
  onCloseTab?: () => void;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
  showDetails: boolean;
  copied: boolean;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  override state: ErrorBoundaryState = {
    hasError: false,
    error: null,
    showDetails: false,
    copied: false,
  };

  static getDerivedStateFromError(error: unknown): Partial<ErrorBoundaryState> {
    const resolvedError =
      error instanceof Error
        ? error
        : new Error(typeof error === "string" ? error : "An unexpected error occurred");
    return { hasError: true, error: resolvedError };
  }

  override componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    console.error("[ErrorBoundary caught an unhandled error]:", error, errorInfo);
    this.props.onError?.(error, errorInfo);
  }

  handleReset = (): void => {
    this.setState({ hasError: false, error: null, showDetails: false, copied: false });
  };

  handleReturnHome = (): void => {
    try {
      useTabs.getState().closeAllTabs();
    } catch {
      // Ignore tab close failure
    }
    this.handleReset();
  };

  handleReload = (): void => {
    if (typeof window !== "undefined" && typeof window.location?.reload === "function") {
      window.location.reload();
    } else {
      this.handleReset();
    }
  };

  handleCopy = async (): Promise<void> => {
    const err = this.state.error;
    if (!err) return;
    const text = `${err.name}: ${err.message}${err.stack ? `\n\nStack:\n${err.stack}` : ""}`;
    try {
      await navigator.clipboard.writeText(text);
      this.setState({ copied: true });
      toast.success("Error details copied to clipboard");
      setTimeout(() => this.setState({ copied: false }), 2000);
    } catch {
      toast.error("Failed to copy error details");
    }
  };

  override render(): ReactNode {
    if (!this.state.hasError) {
      return this.props.children;
    }

    const { fallback, level = "root", tabTitle, onCloseTab } = this.props;
    const { error, showDetails, copied } = this.state;

    if (typeof fallback === "function") {
      return error ? fallback(error, this.handleReset) : null;
    }
    if (fallback !== undefined) {
      return fallback;
    }

    if (level === "tab") {
      return (
        <div
          data-testid="tab-error-boundary-fallback"
          className="flex h-full flex-1 flex-col items-center justify-center p-8 text-center"
        >
          <div className="flex size-12 items-center justify-center rounded-full bg-destructive/10 text-destructive mb-4">
            <AlertTriangle className="size-6" />
          </div>
          <h2 className="text-base font-semibold">
            {tabTitle ? `Failed to load ${tabTitle}` : "Tab encountered an error"}
          </h2>
          <p className="mt-1.5 max-w-md text-xs text-muted-foreground break-words font-mono bg-muted/40 p-2.5 rounded-md border">
            {error?.message || "An unexpected error occurred while rendering this tab."}
          </p>
          <div className="mt-5 flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={this.handleReset}
              className="gap-1.5"
            >
              <RotateCw className="size-3.5" />
              <span>Retry tab</span>
            </Button>
            {onCloseTab && (
              <Button
                variant="ghost"
                size="sm"
                onClick={onCloseTab}
                className="text-muted-foreground hover:text-foreground"
              >
                Close tab
              </Button>
            )}
          </div>
        </div>
      );
    }

    return (
      <div
        data-testid="root-error-boundary-fallback"
        className="flex h-screen w-screen flex-col items-center justify-center bg-background p-6 text-foreground select-none"
      >
        <div className="flex max-w-lg flex-col items-center text-center">
          <div className="flex size-14 items-center justify-center rounded-full bg-destructive/10 text-destructive mb-4 shadow-xs">
            <AlertTriangle className="size-7" />
          </div>
          <h1 className="text-xl font-bold tracking-tight">Something went wrong</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            LocalStacker encountered an unexpected error. You don't need to quit the application — try returning to the home screen or reloading.
          </p>

          <div className="mt-4 w-full text-left">
            <div className="rounded-lg border bg-card p-3.5 text-xs">
              <div className="flex items-start justify-between gap-2">
                <span className="font-semibold text-destructive break-words">
                  {error?.name || "Error"}: {error?.message || "Unknown error"}
                </span>
                <button
                  type="button"
                  onClick={this.handleCopy}
                  className="shrink-0 p-1 text-muted-foreground hover:text-foreground transition-colors"
                  title="Copy error details"
                  aria-label="Copy error details"
                >
                  {copied ? (
                    <Check className="size-3.5 text-emerald-500" />
                  ) : (
                    <Copy className="size-3.5" />
                  )}
                </button>
              </div>

              {error?.stack && (
                <div className="mt-2">
                  <button
                    type="button"
                    onClick={() => this.setState((s) => ({ showDetails: !s.showDetails }))}
                    className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground font-medium"
                  >
                    {showDetails ? (
                      <>
                        <ChevronUp className="size-3" /> Hide technical details
                      </>
                    ) : (
                      <>
                        <ChevronDown className="size-3" /> Show technical details
                      </>
                    )}
                  </button>
                  {showDetails && (
                    <pre className="mt-2 max-h-40 overflow-auto rounded bg-muted/50 p-2 font-mono text-[10px] text-muted-foreground select-text whitespace-pre-wrap break-all">
                      {error.stack}
                    </pre>
                  )}
                </div>
              )}
            </div>
          </div>

          <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
            <Button
              onClick={this.handleReturnHome}
              className="gap-2"
              size="sm"
            >
              <Home className="size-4" />
              <span>Return to Home</span>
            </Button>
            <Button
              variant="outline"
              onClick={this.handleReload}
              className="gap-2"
              size="sm"
            >
              <RotateCw className="size-4" />
              <span>Reload App</span>
            </Button>
          </div>
        </div>
      </div>
    );
  }
}
