import { describe, expect, it, vi, beforeEach } from "vitest";
import { fireEvent, screen, within } from "@testing-library/react";
import { ParameterView } from "./ParameterView";
import { renderWithProviders } from "@/test/utils";
import { LOCAL_PROFILE_ID, localProfile, useProfiles } from "@/store/profiles";
import { useTabs } from "@/store/tabs";
import type { ParameterDetail } from "@/lib/ssm";

const { mockCurrentParam, mockGetParameter, mockPutParameter, mockDeleteParameter, mockSecureParam, mockPlainParam } =
  vi.hoisted(() => {
    const mockSecureParam: ParameterDetail = {
      name: "/app/secret",
      type: "SecureString",
      value: "super-secret",
      version: 1,
      lastModified: new Date("2026-01-01T00:00:00Z"),
    };
    const mockPlainParam: ParameterDetail = {
      name: "/app/plain",
      type: "String",
      value: "plain-text",
      version: 1,
      lastModified: new Date("2026-01-01T00:00:00Z"),
    };
    return {
      mockSecureParam,
      mockPlainParam,
      mockCurrentParam: { current: mockSecureParam },
      mockGetParameter: vi.fn().mockResolvedValue({
        name: "/app/secret",
        type: "SecureString",
        value: "decrypted-val",
        version: 1,
      }),
      mockPutParameter: vi.fn().mockResolvedValue(2),
      mockDeleteParameter: vi.fn().mockResolvedValue(true),
    };
  });

vi.mock("@/hooks/use-ssm", () => ({
  useParameter: () => ({
    data: mockCurrentParam.current,
    isPending: false,
    error: null,
    refetch: vi.fn(),
  }),
  useParameterActions: () => ({
    getParameter: mockGetParameter,
    putParameter: mockPutParameter,
    deleteParameter: mockDeleteParameter,
  }),
}));

describe("ParameterView", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCurrentParam.current = mockSecureParam;
    useProfiles.setState({
      profiles: [{ ...localProfile(), region: "us-east-1" }],
      activeProfileId: LOCAL_PROFILE_ID,
    });
    useTabs.setState({
      tabs: [
        {
          id: "parameter:/app/secret",
          kind: "parameter",
          parameterName: "/app/secret",
          title: "/app/secret",
        },
      ],
      activeTabId: "parameter:/app/secret",
    });
  });

  it("renders header and initially hidden value", () => {
    renderWithProviders(<ParameterView parameterName="/app/secret" />);

    expect(screen.getByText("/app/secret")).toBeInTheDocument();
    expect(screen.getByText("SecureString")).toBeInTheDocument();
    expect(screen.getByText("v1")).toBeInTheDocument();
    expect(screen.getByText("Value hidden")).toBeInTheDocument();
  });

  it("calls getParameter with withDecryption: true for SecureString", async () => {
    mockCurrentParam.current = mockSecureParam;
    renderWithProviders(<ParameterView parameterName="/app/secret" />);

    fireEvent.click(screen.getByRole("button", { name: /Reveal value/i }));

    expect(mockGetParameter).toHaveBeenCalledWith({
      name: "/app/secret",
      withDecryption: true,
    });

    const val = await screen.findByText("decrypted-val");
    expect(val).toBeInTheDocument();
  });

  it("calls getParameter with withDecryption: false for plain String", async () => {
    mockCurrentParam.current = mockPlainParam;
    mockGetParameter.mockResolvedValueOnce({
      name: "/app/plain",
      type: "String",
      value: "plain-text-revealed",
      version: 1,
    });

    renderWithProviders(<ParameterView parameterName="/app/plain" />);
    fireEvent.click(screen.getByRole("button", { name: /Reveal value/i }));

    expect(mockGetParameter).toHaveBeenCalledWith({
      name: "/app/plain",
      withDecryption: false,
    });

    const val = await screen.findByText("plain-text-revealed");
    expect(val).toBeInTheDocument();
  });

  it("edits parameter calling putParameter with overwrite: true", async () => {
    renderWithProviders(<ParameterView parameterName="/app/secret" />);
    fireEvent.click(screen.getByRole("button", { name: "Edit" }));

    const dialog = screen.getByRole("dialog");
    expect(
      within(dialog).getByRole("heading", { name: "Edit parameter" }),
    ).toBeInTheDocument();

    const textarea = within(dialog).getByLabelText("Value");
    fireEvent.change(textarea, { target: { value: "new-secret-val" } });

    const submitBtn = within(dialog).getByRole("button", {
      name: "Save changes",
    });
    fireEvent.click(submitBtn);

    expect(mockPutParameter).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "/app/secret",
        value: "new-secret-val",
        type: "SecureString",
        overwrite: true,
      }),
    );
  });

  it("deletes parameter and closes tab", async () => {
    renderWithProviders(<ParameterView parameterName="/app/secret" />);
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));

    const confirmDialog = screen.getByRole("dialog");
    expect(
      within(confirmDialog).getByText(/Are you sure you want to delete parameter/),
    ).toBeInTheDocument();

    const confirmBtn = within(confirmDialog).getByRole("button", {
      name: "Delete parameter",
    });
    fireEvent.click(confirmBtn);

    expect(mockDeleteParameter).toHaveBeenCalledWith("/app/secret");
  });
});
