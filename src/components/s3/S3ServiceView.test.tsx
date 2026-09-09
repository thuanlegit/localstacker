import { describe, expect, it, vi, beforeEach } from "vitest";
import { fireEvent, screen, within } from "@testing-library/react";
import type { S3Client } from "@aws-sdk/client-s3";
import { S3ServiceView } from "./S3ServiceView";
import { renderWithProviders } from "@/test/utils";
import { LOCAL_PROFILE_ID, localProfile, useProfiles } from "@/store/profiles";
import { createBucket } from "@/lib/s3";

vi.mock("@/lib/s3", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/s3")>();
  return {
    ...actual,
    createBucket: vi.fn().mockResolvedValue(undefined),
    deleteBucket: vi.fn().mockResolvedValue(undefined),
  };
});

const mockSend = vi.fn().mockResolvedValue({});
const mockClient = { send: mockSend } as unknown as S3Client;

vi.mock("@/hooks/use-s3", () => ({
  useS3Client: () => mockClient,
  useBuckets: () => ({
    data: [
      {
        name: "test-bucket",
        creationDate: new Date("2026-01-01T00:00:00Z"),
      },
    ],
    isPending: false,
    isFetching: false,
    error: null,
    refetch: vi.fn(),
  }),
  s3Keys: {
    buckets: (id: string) => ["s3", "buckets", id],
    objects: (id: string, b: string, p?: string) => ["s3", "objects", id, b, p ?? ""],
  },
}));

describe("S3ServiceView", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useProfiles.setState({
      profiles: [{ ...localProfile(), region: "us-east-1" }],
      activeProfileId: LOCAL_PROFILE_ID,
    });
  });

  it("renders bucket list rows", () => {
    renderWithProviders(<S3ServiceView />);
    expect(screen.getByText("Buckets")).toBeInTheDocument();
    expect(screen.getByText("test-bucket")).toBeInTheDocument();
  });

  it("validates bucket name in create bucket dialog and submits when valid", async () => {
    renderWithProviders(<S3ServiceView />);
    // Open create dialog
    fireEvent.click(screen.getByRole("button", { name: /Create bucket/i }));
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByRole("heading", { name: "Create bucket" })).toBeInTheDocument();

    const input = within(dialog).getByLabelText(/Bucket name/i);
    const submitBtn = within(dialog).getByRole("button", { name: "Create bucket" });
    // Initial empty state has disabled submit
    expect(submitBtn).toBeDisabled();

    // Type invalid bucket name
    fireEvent.change(input, { target: { value: "INVALID_NAME!" } });
    expect(
      screen.getByText(/3–63 characters — lowercase letters, digits, dots, hyphens/),
    ).toBeInTheDocument();
    expect(submitBtn).toBeDisabled();

    // Type valid bucket name
    fireEvent.change(input, { target: { value: "valid-bucket-name" } });
    expect(
      screen.queryByText(/3–63 characters — lowercase letters, digits, dots, hyphens/),
    ).not.toBeInTheDocument();
    expect(submitBtn).not.toBeDisabled();

    // Submit form
    fireEvent.click(submitBtn);

    expect(createBucket).toHaveBeenCalledWith(
      mockClient,
      "valid-bucket-name",
      "us-east-1",
    );
  });
});
