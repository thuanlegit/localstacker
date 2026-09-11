import { describe, it, expect, beforeEach } from "vitest";
import { useRecents } from "./recents";
import type { TabDescriptor } from "@/types";

const tab = (id: string, title: string): TabDescriptor => ({
  id,
  kind: "bucket",
  bucketName: id,
  title,
});

describe("recents store", () => {
  beforeEach(() => {
    useRecents.setState({ recent: [] });
  });

  it("records a tab at the front", () => {
    useRecents.getState().record(tab("a", "A"));
    useRecents.getState().record(tab("b", "B"));
    expect(useRecents.getState().recent.map((t) => t.id)).toEqual(["b", "a"]);
  });

  it("moves a re-recorded tab to the front instead of duplicating it", () => {
    useRecents.getState().record(tab("a", "A"));
    useRecents.getState().record(tab("b", "B"));
    useRecents.getState().record(tab("a", "A"));
    expect(useRecents.getState().recent.map((t) => t.id)).toEqual(["a", "b"]);
  });

  it("caps recents at 6, dropping the oldest tail", () => {
    for (const id of ["1", "2", "3", "4", "5", "6", "7"]) {
      useRecents.getState().record(tab(id, id));
    }
    expect(useRecents.getState().recent.map((t) => t.id)).toEqual([
      "7",
      "6",
      "5",
      "4",
      "3",
      "2",
    ]);
  });

  it("stores any descriptor verbatim (filtering is the caller's job)", () => {
    const settings: TabDescriptor = { id: "settings", kind: "settings", title: "Settings" };
    useRecents.getState().record(settings);
    expect(useRecents.getState().recent).toEqual([settings]);
  });
});
