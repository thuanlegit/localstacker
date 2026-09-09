import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { saveObjectFile } from "./download";

describe("saveObjectFile in browser fallback", () => {
  const originalCreateObjectURL = window.URL.createObjectURL;
  const originalRevokeObjectURL = window.URL.revokeObjectURL;

  beforeEach(() => {
    window.URL.createObjectURL = vi.fn(() => "blob:http://localhost/mock-uuid");
    window.URL.revokeObjectURL = vi.fn();
  });

  afterEach(() => {
    window.URL.createObjectURL = originalCreateObjectURL;
    window.URL.revokeObjectURL = originalRevokeObjectURL;
    vi.restoreAllMocks();
  });

  it("triggers browser file download with blob and anchor", async () => {
    let clickedDownloadAttr: string | null = null;
    let clickedHrefAttr: string | null = null;

    const clickSpy = vi
      .spyOn(HTMLAnchorElement.prototype, "click")
      .mockImplementation(function (this: HTMLAnchorElement) {
        clickedDownloadAttr = this.download;
        clickedHrefAttr = this.href;
      });

    const bytes = new Uint8Array([65, 66, 67]);
    const result = await saveObjectFile(bytes, "sample.txt");

    expect(result).toBe("saved");
    expect(clickSpy).toHaveBeenCalledOnce();
    expect(clickedDownloadAttr).toBe("sample.txt");
    expect(clickedHrefAttr).toBe("blob:http://localhost/mock-uuid");
    expect(window.URL.revokeObjectURL).toHaveBeenCalledWith("blob:http://localhost/mock-uuid");
  });
});
