import { describe, expect, it, vi, beforeEach } from "vitest";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { AcmServiceView } from "./AcmServiceView";
import { renderWithProviders } from "@/test/utils";
import { LOCAL_PROFILE_ID, localProfile, useProfiles } from "@/store/profiles";

const { mockState, mockImport, mockRequest, mockDelete } = vi.hoisted(() => ({
  mockState: {
    serviceStatus: "available" as string,
    certs: [
      {
        arn: "arn:aws:acm:us-east-1:000000000000:certificate/pending",
        domainName: "pending.example.com",
        status: "PENDING_VALIDATION",
        type: "AMAZON_ISSUED",
      },
      {
        arn: "arn:aws:acm:us-east-1:000000000000:certificate/imported",
        domainName: "imported.example.com",
        status: "ISSUED",
        type: "IMPORTED",
      },
    ] as
      | {
          arn: string;
          domainName: string;
          status: string;
          type: string;
        }[]
      | undefined,
    detail: {
      arn: "arn:aws:acm:us-east-1:000000000000:certificate/pending",
      domainName: "pending.example.com",
      status: "PENDING_VALIDATION",
      type: "AMAZON_ISSUED",
      subject: "CN=pending.example.com",
      issuer: "Amazon",
      keyAlgorithm: "RSA_2048",
      notAfter: new Date("2027-01-01T00:00:00Z"),
      validationMethod: "DNS",
      cnameRecord: {
        name: "_token.pending.example.com.",
        type: "CNAME",
        value: "_value.acm-validations.aws.",
      },
      sans: ["pending.example.com"],
    } as Record<string, unknown> | undefined,
    error: null as Error | null,
  },
  mockImport: vi.fn().mockResolvedValue("arn:new"),
  mockRequest: vi.fn().mockResolvedValue("arn:requested"),
  mockDelete: vi.fn().mockResolvedValue(true),
}));

vi.mock("@/hooks/use-health", () => ({
  useServiceStatus: () => mockState.serviceStatus,
  useHealth: () => ({ data: undefined, refetch: vi.fn() }),
  isServiceDisabledError: (err: unknown) =>
    err instanceof Error && err.message.includes("is not enabled"),
}));

vi.mock("@/hooks/use-acm", async () => {
  const actual = await vi.importActual<typeof import("@/hooks/use-acm")>("@/hooks/use-acm");
  return {
    ...actual,
    useCertificates: () => ({
      data: mockState.certs,
      isPending: false,
      isFetching: false,
      error: mockState.error,
      refetch: vi.fn(),
    }),
    useCertificateDetail: (_profileId: string, arn: string) => ({
      data:
        mockState.detail && mockState.detail.arn === arn ? mockState.detail : undefined,
      isPending: false,
      error: null,
      refetch: vi.fn(),
    }),
    useAcmActions: () => ({
      importCertificate: mockImport,
      requestCertificate: mockRequest,
      deleteCertificate: mockDelete,
    }),
  };
});

describe("AcmServiceView", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockState.error = null;
    useProfiles.setState({ profiles: [localProfile()], activeProfileId: LOCAL_PROFILE_ID });
  });

  it("renders certificates with status badges", () => {
    renderWithProviders(<AcmServiceView />);
    expect(screen.getByText("pending.example.com")).toBeInTheDocument();
    expect(screen.getByText("imported.example.com")).toBeInTheDocument();
    expect(screen.getAllByText("PENDING")).toHaveLength(1);
    expect(screen.getByText("ISSUED")).toBeInTheDocument();
  });

  it("expands a row to show the DNS validation record", async () => {
    renderWithProviders(<AcmServiceView />);
    fireEvent.click(screen.getByText("pending.example.com"));
    await waitFor(() =>
      expect(
        screen.getByText("_token.pending.example.com."),
      ).toBeInTheDocument(),
    );
    expect(screen.getByText("_value.acm-validations.aws.")).toBeInTheDocument();
  });

  it("requests a certificate via dialog", async () => {
    renderWithProviders(<AcmServiceView />);
    fireEvent.click(screen.getByRole("button", { name: "Request certificate" }));
    const dialog = screen.getByRole("dialog");
    fireEvent.change(within(dialog).getByLabelText("Domain name"), {
      target: { value: "new.example.com" },
    });
    fireEvent.click(within(dialog).getByRole("button", { name: "Request" }));
    await waitFor(() =>
      expect(mockRequest).toHaveBeenCalledWith({ domainName: "new.example.com" }),
    );
  });

  it("imports a PEM pair via dialog", async () => {
    renderWithProviders(<AcmServiceView />);
    fireEvent.click(screen.getByRole("button", { name: "Import" }));
    const dialog = screen.getByRole("dialog");
    fireEvent.change(within(dialog).getByLabelText("Certificate (PEM)"), {
      target: { value: "-----BEGIN CERTIFICATE-----\nabc" },
    });
    fireEvent.change(within(dialog).getByLabelText("Private key (PEM)"), {
      target: { value: "-----BEGIN PRIVATE KEY-----\nxyz" },
    });
    fireEvent.click(within(dialog).getByRole("button", { name: "Import" }));
    await waitFor(() =>
      expect(mockImport).toHaveBeenCalledWith({
        certificate: "-----BEGIN CERTIFICATE-----\nabc",
        privateKey: "-----BEGIN PRIVATE KEY-----\nxyz",
      }),
    );
  });

  it("deletes a certificate after confirmation", async () => {
    renderWithProviders(<AcmServiceView />);
    fireEvent.click(
      screen.getByRole("button", { name: "Delete certificate imported.example.com" }),
    );
    const dialog = screen.getByRole("dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "Delete" }));
    await waitFor(() =>
      expect(mockDelete).toHaveBeenCalledWith(
        "arn:aws:acm:us-east-1:000000000000:certificate/imported",
      ),
    );
  });

  it("renders disabled guard when service is disabled", () => {
    mockState.serviceStatus = "disabled";
    renderWithProviders(<AcmServiceView />);
    expect(screen.getByTestId("service-disabled-view")).toBeInTheDocument();
    mockState.serviceStatus = "available";
  });
});
