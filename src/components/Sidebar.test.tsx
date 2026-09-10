import { describe, expect, it, vi, beforeEach } from "vitest";
import { fireEvent, screen } from "@testing-library/react";
import { Sidebar } from "./Sidebar";
import { renderWithProviders } from "@/test/utils";
import { LOCAL_PROFILE_ID, localProfile, useProfiles } from "@/store/profiles";
import { useTabs } from "@/store/tabs";
import { useSidebar } from "@/store/sidebar";

const mockHealthData = {
  status: "up" as const,
  version: "3.0.0",
  services: [
    { name: "s3", status: "running" },
    { name: "sqs", status: "disabled" },
    { name: "lambda", status: "available" },
  ],
};

vi.mock("@/hooks/use-health", () => ({
  useHealth: () => ({
    data: mockHealthData,
    refetch: vi.fn(),
  }),
}));

describe("Sidebar", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useSidebar.setState({ isCollapsed: false });
    useTabs.setState({ tabs: [], activeTabId: null });
    useProfiles.setState({
      profiles: [localProfile()],
      activeProfileId: LOCAL_PROFILE_ID,
    });
  });

  it("renders services and shows 'Off' badge on disabled services", () => {
    renderWithProviders(<Sidebar />);

    // S3 is running -> no Off badge
    const s3Btn = screen.getByRole("button", { name: /^S3/ });
    expect(s3Btn).toBeInTheDocument();

    // SQS is disabled -> has Off badge
    const sqsBtn = screen.getByRole("button", { name: /^SQS/ });
    expect(sqsBtn).toBeInTheDocument();
    expect(screen.getByText("Off")).toBeInTheDocument();
  });

  it("opens service tab when clicked", () => {
    renderWithProviders(<Sidebar />);

    fireEvent.click(screen.getByRole("button", { name: /^SQS/ }));
    expect(useTabs.getState().tabs).toEqual([
      { id: "service:sqs", kind: "service", service: "sqs", title: "SQS" },
    ]);
  });

  it("opens Edit connection dialog prefilled with Local profile and persists endpoint change", async () => {
    renderWithProviders(<Sidebar />);

    // Open connection dropdown
    const profileTrigger = screen.getByRole("button", { name: /Local/i });
    fireEvent.keyDown(profileTrigger, { key: "ArrowDown", code: "ArrowDown" });

    const editItem = await screen.findByRole("menuitem", { name: /Edit connection…/i });
    fireEvent.click(editItem);

    expect(await screen.findByRole("heading", { name: "Edit connection" })).toBeInTheDocument();
    const endpointInput = screen.getByLabelText(/Endpoint URL/i);
    expect(endpointInput).toHaveValue("http://localhost:4566");

    fireEvent.change(endpointInput, { target: { value: "http://localhost:4567" } });
    fireEvent.click(screen.getByRole("button", { name: "Save connection" }));

    const active = useProfiles.getState().profiles.find((p) => p.id === LOCAL_PROFILE_ID);
    expect(active?.endpoint).toBe("http://localhost:4567");
  });

  it("opens New connection dialog, adds profile, and activates it", async () => {
    renderWithProviders(<Sidebar />);

    const profileTrigger = screen.getByRole("button", { name: /Local/i });
    fireEvent.keyDown(profileTrigger, { key: "ArrowDown", code: "ArrowDown" });

    const newItem = await screen.findByRole("menuitem", { name: /New connection…/i });
    fireEvent.click(newItem);

    expect(await screen.findByRole("heading", { name: "New connection" })).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText(/Name/i), { target: { value: "Dev Instance" } });
    fireEvent.change(screen.getByLabelText(/Endpoint URL/i), {
      target: { value: "http://dev.localstack:4566" },
    });

    fireEvent.click(screen.getByRole("button", { name: "Save connection" }));

    const state = useProfiles.getState();
    const added = state.profiles.find((p) => p.name === "Dev Instance");
    expect(added).toBeDefined();
    expect(added?.endpoint).toBe("http://dev.localstack:4566");
    expect(state.activeProfileId).toBe(added?.id);
  });

  it("renders active region selector in sidebar", () => {
    renderWithProviders(<Sidebar />);
    const regionTrigger = screen.getByRole("combobox", {
      name: "Active AWS region",
    });
    expect(regionTrigger).toBeInTheDocument();
    expect(regionTrigger).toHaveTextContent("us-east-1");
  });

  it("collapses and expands via collapse toggle button", () => {
    const { container } = renderWithProviders(<Sidebar />);
    const aside = container.querySelector("aside");
    expect(aside).toHaveClass("w-60");

    const collapseBtn = screen.getByRole("button", {
      name: "Collapse sidebar",
    });
    fireEvent.click(collapseBtn);

    expect(aside).toHaveClass("w-14");
    expect(useSidebar.getState().isCollapsed).toBe(true);

    const expandBtn = screen.getByRole("button", { name: "Expand sidebar" });
    fireEvent.click(expandBtn);

    expect(aside).toHaveClass("w-60");
    expect(useSidebar.getState().isCollapsed).toBe(false);
  });

  it("toggles collapse with Cmd+B and Ctrl+B keyboard shortcut", () => {
    const { container } = renderWithProviders(<Sidebar />);
    const aside = container.querySelector("aside");
    expect(aside).toHaveClass("w-60");

    fireEvent.keyDown(window, { key: "b", metaKey: true });
    expect(aside).toHaveClass("w-14");
    expect(useSidebar.getState().isCollapsed).toBe(true);

    fireEvent.keyDown(window, { key: "b", ctrlKey: true });
    expect(aside).toHaveClass("w-60");
    expect(useSidebar.getState().isCollapsed).toBe(false);
  });

  it("renders compact accessible icon buttons when collapsed", () => {
    useSidebar.setState({ isCollapsed: true });
    renderWithProviders(<Sidebar />);

    const ec2Btn = screen.getByRole("button", { name: "EC2" });
    expect(ec2Btn).toBeInTheDocument();

    fireEvent.click(ec2Btn);
    expect(useTabs.getState().tabs).toEqual([
      { id: "service:ec2", kind: "service", service: "ec2", title: "EC2" },
    ]);
  });
});
