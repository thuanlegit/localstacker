import { describe, expect, it, vi, beforeEach } from "vitest";
import { fireEvent, screen } from "@testing-library/react";
import { ConnectionDialog } from "./ConnectionDialog";
import { renderWithProviders } from "@/test/utils";
import { useProfiles, LOCAL_PROFILE_ID, localProfile } from "@/store/profiles";
import type { ConnectionProfile } from "@/types";

describe("ConnectionDialog", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useProfiles.setState({
      profiles: [localProfile()],
      activeProfileId: LOCAL_PROFILE_ID,
    });
  });

  it("prefills fields when editing an existing profile", () => {
    const profile: ConnectionProfile = {
      id: "p1",
      name: "Custom LocalStack",
      endpoint: "http://127.0.0.1:4566",
      region: "us-west-2",
      authToken: "my-token-123",
    };

    renderWithProviders(
      <ConnectionDialog open={true} onOpenChange={vi.fn()} profile={profile} />,
    );

    expect(screen.getByRole("heading", { name: "Edit connection" })).toBeInTheDocument();
    expect(screen.getByLabelText(/Name/i)).toHaveValue("Custom LocalStack");
    expect(screen.getByLabelText(/Endpoint URL/i)).toHaveValue("http://127.0.0.1:4566");
    expect(screen.getByLabelText(/Region/i)).toHaveValue("us-west-2");
    expect(screen.getByLabelText(/Auth token/i)).toHaveValue("my-token-123");
  });

  it("validates endpoint and region and disables submit when invalid", () => {
    renderWithProviders(
      <ConnectionDialog open={true} onOpenChange={vi.fn()} />,
    );

    expect(screen.getByRole("heading", { name: "New connection" })).toBeInTheDocument();
    const nameInput = screen.getByLabelText(/Name/i);
    const endpointInput = screen.getByLabelText(/Endpoint URL/i);
    const regionInput = screen.getByLabelText(/Region/i);
    const submitBtn = screen.getByRole("button", { name: "Save connection" });

    // Name empty -> disabled
    expect(submitBtn).toBeDisabled();

    fireEvent.change(nameInput, { target: { value: "Test Env" } });
    expect(submitBtn).not.toBeDisabled();

    // Invalid endpoint
    fireEvent.change(endpointInput, { target: { value: "not-a-url" } });
    expect(screen.getByText(/Endpoint must start with http:\/\/ or https:\/\//)).toBeInTheDocument();
    expect(submitBtn).toBeDisabled();

    // Valid endpoint
    fireEvent.change(endpointInput, { target: { value: "http://localhost:4566" } });
    expect(submitBtn).not.toBeDisabled();

    // Invalid region
    fireEvent.change(regionInput, { target: { value: "invalid_region" } });
    expect(screen.getByText(/Region must follow standard format/)).toBeInTheDocument();
    expect(submitBtn).toBeDisabled();
  });

  it("updates existing profile on save in edit mode and trims values", () => {
    const profile: ConnectionProfile = {
      id: "p1",
      name: "Custom",
      endpoint: "http://localhost:4566",
      region: "us-east-1",
    };
    useProfiles.setState({
      profiles: [localProfile(), profile],
      activeProfileId: "p1",
    });

    const onOpenChange = vi.fn();
    renderWithProviders(
      <ConnectionDialog open={true} onOpenChange={onOpenChange} profile={profile} />,
    );

    const nameInput = screen.getByLabelText(/Name/i);
    const endpointInput = screen.getByLabelText(/Endpoint URL/i);
    const tokenInput = screen.getByLabelText(/Auth token/i);
    const submitBtn = screen.getByRole("button", { name: "Save connection" });

    fireEvent.change(nameInput, { target: { value: "  Production Local  " } });
    fireEvent.change(endpointInput, { target: { value: "https://localstack.internal:4566" } });
    fireEvent.change(tokenInput, { target: { value: "  secret-tok-999  " } });

    fireEvent.click(submitBtn);

    const updated = useProfiles.getState().profiles.find((p) => p.id === "p1");
    expect(updated).toEqual({
      id: "p1",
      name: "Production Local",
      endpoint: "https://localstack.internal:4566",
      region: "us-east-1",
      authToken: "secret-tok-999",
    });
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("clears auth token when empty in edit mode", () => {
    const profile: ConnectionProfile = {
      id: "p1",
      name: "Custom",
      endpoint: "http://localhost:4566",
      region: "us-east-1",
      authToken: "old-token",
    };
    useProfiles.setState({
      profiles: [localProfile(), profile],
      activeProfileId: "p1",
    });

    renderWithProviders(
      <ConnectionDialog open={true} onOpenChange={vi.fn()} profile={profile} />,
    );

    const tokenInput = screen.getByLabelText(/Auth token/i);
    fireEvent.change(tokenInput, { target: { value: "" } });

    const submitBtn = screen.getByRole("button", { name: "Save connection" });
    fireEvent.click(submitBtn);

    const updated = useProfiles.getState().profiles.find((p) => p.id === "p1");
    expect(updated?.authToken).toBeUndefined();
  });

  it("adds new profile and activates it in add mode", () => {
    const onOpenChange = vi.fn();
    renderWithProviders(
      <ConnectionDialog open={true} onOpenChange={onOpenChange} />,
    );

    fireEvent.change(screen.getByLabelText(/Name/i), { target: { value: "QA Stack" } });
    fireEvent.change(screen.getByLabelText(/Endpoint URL/i), {
      target: { value: "http://qa.localstack:4566" },
    });
    fireEvent.change(screen.getByLabelText(/Region/i), { target: { value: "eu-west-1" } });
    fireEvent.change(screen.getByLabelText(/Auth token/i), { target: { value: "qa-token" } });

    fireEvent.click(screen.getByRole("button", { name: "Save connection" }));

    const state = useProfiles.getState();
    const added = state.profiles.find((p) => p.name === "QA Stack");
    expect(added).toBeDefined();
    expect(added?.endpoint).toBe("http://qa.localstack:4566");
    expect(added?.region).toBe("eu-west-1");
    expect(added?.authToken).toBe("qa-token");
    expect(state.activeProfileId).toBe(added?.id);
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});
