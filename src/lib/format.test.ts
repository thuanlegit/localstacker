import { describe, expect, it } from "vitest";
import { formatBytes, formatDate } from "./format";

describe("formatBytes", () => {
  it("formats zero bytes", () => {
    expect(formatBytes(0)).toBe("0 B");
  });

  it("formats kilobytes with decimal", () => {
    expect(formatBytes(1536)).toBe("1.5 KB");
  });

  it("formats megabytes without trailing .0", () => {
    expect(formatBytes(5 * 1024 * 1024)).toBe("5 MB");
  });

  it("formats exact bytes under 1024", () => {
    expect(formatBytes(500)).toBe("500 B");
  });
});

describe("formatDate", () => {
  it("formats undefined as em-dash", () => {
    expect(formatDate(undefined)).toBe("—");
  });

  it("formats defined Date instance", () => {
    const d = new Date("2026-01-01T12:00:00Z");
    expect(formatDate(d)).toBe(d.toLocaleString());
  });
});
