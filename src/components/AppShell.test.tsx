import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, screen } from "@testing-library/react";
import App from "@/App";
import { LOCAL_PROFILE_ID, localProfile, useProfiles } from "@/store/profiles";
import { useTheme } from "@/store/theme";
import { useTabs } from "@/store/tabs";
import { renderWithProviders } from "@/test/utils";

vi.mock("@/lib/health", () => ({
  checkHealth: vi.fn(async () => ({ status: "down", reason: "test env" })),
}));

function renderApp() {
  renderWithProviders(<App />);
}

describe("AppShell", () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.className = "";
    useTabs.setState({ tabs: [], activeTabId: null });
    useTheme.setState({ theme: "dark" });
    useProfiles.setState({ profiles: [localProfile()], activeProfileId: LOCAL_PROFILE_ID });
  });

  afterEach(() => {
    cleanup();
  });

  it("renders all four services in the sidebar", () => {
    renderApp();
    for (const label of ["S3", "SQS", "Secrets Manager", "Lambda"]) {
      expect(screen.getByRole("button", { name: new RegExp(`^${label}`) })).toBeInTheDocument();
    }
  });

  it("opens the S3 placeholder tab when S3 is clicked", () => {
    renderApp();
    fireEvent.click(screen.getByRole("button", { name: /^S3/ }));
    expect(screen.getByText("Coming in M1")).toBeInTheDocument();
    expect(screen.getByText("Folder-style object browsing with previews")).toBeInTheDocument();
    expect(screen.getByRole("tab", { selected: true })).toHaveTextContent("S3");
  });

  it("opens the palette with Cmd-K and navigates to SQS from it", () => {
    renderApp();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    fireEvent.keyDown(window, { key: "k", metaKey: true });
    expect(screen.getByRole("dialog")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("option", { name: "SQS" }));
    expect(useTabs.getState().tabs.map((t) => t.id)).toEqual(["service:sqs"]);
    expect(screen.getByRole("tab", { name: /SQS/ })).toBeInTheDocument();
  });

  it("toggles dark mode off when the theme button is clicked", () => {
    renderApp();
    expect(document.documentElement).toHaveClass("dark");

    fireEvent.click(screen.getByRole("button", { name: "Toggle theme" }));
    expect(document.documentElement).not.toHaveClass("dark");
  });
});
