import { describe, expect, it, vi, beforeEach } from "vitest";
import { screen } from "@testing-library/react";
import { BucketView } from "./BucketView";
import { renderWithProviders } from "@/test/utils";
import { LOCAL_PROFILE_ID, localProfile, useProfiles } from "@/store/profiles";
import { listObjectsPage } from "@/lib/s3";

vi.mock("@/lib/s3", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/s3")>();
  return {
    ...actual,
    listObjectsPage: vi.fn(),
  };
});

vi.mock("@/hooks/use-s3", () => ({
  useS3Client: () => ({ send: vi.fn() }),
  useS3ObjectActions: () => ({
    downloadObject: vi.fn(),
    copyPresignedUrl: vi.fn(),
    deleteObject: vi.fn(),
  }),
  s3Keys: {
    buckets: (id: string) => ["s3", "buckets", id],
    objects: (id: string, b: string, p?: string) => ["s3", "objects", id, b, p ?? ""],
  },
}));

describe("BucketView", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useProfiles.setState({
      profiles: [localProfile()],
      activeProfileId: LOCAL_PROFILE_ID,
    });
  });

  it("renders breadcrumb and objects list without pagination button when nextToken is absent", async () => {
    vi.mocked(listObjectsPage).mockResolvedValueOnce({
      folders: ["logs/"],
      objects: [
        {
          key: "file1.txt",
          name: "file1.txt",
          size: 1024,
          lastModified: new Date("2026-01-01T00:00:00Z"),
        },
      ],
      nextToken: undefined,
    });

    renderWithProviders(<BucketView bucketName="test-bucket" />);

    // Breadcrumb
    expect(screen.getByText("test-bucket")).toBeInTheDocument();

    // Folder and object rows
    expect(await screen.findByText("logs")).toBeInTheDocument();
    expect(await screen.findByText("file1.txt")).toBeInTheDocument();

    // No load more button
    expect(screen.queryByRole("button", { name: /Load more/i })).not.toBeInTheDocument();
  });

  it("renders Load more button when nextToken is present", async () => {
    vi.mocked(listObjectsPage).mockResolvedValueOnce({
      folders: [],
      objects: [
        {
          key: "item.json",
          name: "item.json",
          size: 512,
          lastModified: new Date("2026-01-01T00:00:00Z"),
        },
      ],
      nextToken: "token-page-2",
    });

    renderWithProviders(<BucketView bucketName="paged-bucket" />);

    expect(await screen.findByText("item.json")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Load more/i })).toBeInTheDocument();
  });
});
