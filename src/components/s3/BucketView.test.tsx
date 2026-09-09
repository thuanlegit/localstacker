import { describe, expect, it, vi, beforeEach } from "vitest";
import { fireEvent, screen, within } from "@testing-library/react";
import { BucketView } from "./BucketView";
import { renderWithProviders } from "@/test/utils";
import { LOCAL_PROFILE_ID, localProfile, useProfiles } from "@/store/profiles";
import { listObjectsPage, createDirectory, deleteObject } from "@/lib/s3";

vi.mock("@/lib/s3", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/s3")>();
  return {
    ...actual,
    listObjectsPage: vi.fn(),
    createDirectory: vi.fn().mockResolvedValue(undefined),
    deleteObject: vi.fn().mockResolvedValue(undefined),
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

  it("validates and creates directory via dialog", async () => {
    vi.mocked(listObjectsPage).mockResolvedValueOnce({
      folders: [],
      objects: [],
      nextToken: undefined,
    });

    renderWithProviders(<BucketView bucketName="test-bucket" />);

    // Open create directory dialog
    fireEvent.click(screen.getByRole("button", { name: "Create directory" }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByRole("heading", { name: "Create directory" })).toBeInTheDocument();
    const input = within(dialog).getByLabelText(/Directory name/i);
    const submitBtn = within(dialog).getByRole("button", { name: "Create directory" });
    expect(submitBtn).toBeDisabled();

    // Invalid name with slash
    fireEvent.change(input, { target: { value: "invalid/name" } });
    expect(submitBtn).toBeDisabled();
    expect(
      screen.getByText(/Directory name cannot contain slashes/i),
    ).toBeInTheDocument();

    // Valid directory name
    fireEvent.change(input, { target: { value: "photos" } });
    expect(
      screen.queryByText(/Directory name cannot contain slashes/i),
    ).not.toBeInTheDocument();
    expect(submitBtn).not.toBeDisabled();

    fireEvent.click(submitBtn);
    expect(createDirectory).toHaveBeenCalledWith(
      expect.anything(),
      { bucket: "test-bucket", key: "photos/" },
    );
  });

  it("deletes a directory from the folder row dropdown", async () => {
    vi.mocked(listObjectsPage).mockResolvedValueOnce({
      folders: ["logs/"],
      objects: [],
      nextToken: undefined,
    });

    renderWithProviders(<BucketView bucketName="test-bucket" />);
    expect(await screen.findByText("logs")).toBeInTheDocument();

    const actionsBtn = screen.getByRole("button", { name: /Actions for logs/i });
    fireEvent.keyDown(actionsBtn, { key: "ArrowDown", code: "ArrowDown" });
    const deleteMenuItem = await screen.findByRole("menuitem", { name: /Delete directory/i });
    fireEvent.click(deleteMenuItem);

    const confirmDialog = await screen.findByRole("dialog");
    expect(within(confirmDialog).getByRole("heading", { name: "Delete directory" })).toBeInTheDocument();

    const confirmBtn = within(confirmDialog).getByRole("button", { name: /^Delete$/i });
    fireEvent.click(confirmBtn);

    expect(deleteObject).toHaveBeenCalledWith(
      expect.anything(),
      { bucket: "test-bucket", key: "logs/" },
    );
  });
});
