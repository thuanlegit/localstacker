import { describe, it, expect, beforeEach } from "vitest";
import { useTabs } from "./tabs";
import { useRecents } from "./recents";

describe("tabs store", () => {
  beforeEach(() => {
    useTabs.setState({ tabs: [], activeTabId: null });
    useRecents.setState({ recent: [] });
  });

  it("opens a service tab and activates it", () => {
    useTabs.getState().openTab({ id: "service:s3", kind: "service", service: "s3", title: "S3" });
    const state = useTabs.getState();
    expect(state.tabs).toHaveLength(1);
    expect(state.activeTabId).toBe("service:s3");
  });

  it("re-activates an existing tab instead of duplicating it", () => {
    useTabs.getState().openTab({ id: "service:s3", kind: "service", service: "s3", title: "S3" });
    useTabs.getState().openTab({ id: "service:sqs", kind: "service", service: "sqs", title: "SQS" });
    useTabs.getState().openTab({ id: "service:s3", kind: "service", service: "s3", title: "S3" });

    const state = useTabs.getState();
    expect(state.tabs.map((t) => t.id)).toEqual(["service:s3", "service:sqs"]);
    expect(state.activeTabId).toBe("service:s3");
  });

  it("falls back to the neighbor tab when the active tab closes", () => {
    useTabs.getState().openTab({ id: "service:s3", kind: "service", service: "s3", title: "S3" });
    useTabs.getState().openTab({ id: "service:sqs", kind: "service", service: "sqs", title: "SQS" });
    useTabs.getState().openTab({ id: "service:lambda", kind: "service", service: "lambda", title: "Lambda" });

    useTabs.getState().closeTab("service:sqs");
    let state = useTabs.getState();
    expect(state.activeTabId).toBe("service:lambda");

    useTabs.getState().closeTab("service:lambda");
    state = useTabs.getState();
    expect(state.activeTabId).toBe("service:s3");

    useTabs.getState().closeTab("service:s3");
    state = useTabs.getState();
    expect(state.activeTabId).toBeNull();
    expect(state.tabs).toHaveLength(0);
  });

  it("closes all tabs and clears active tab", () => {
    useTabs.getState().openTab({ id: "service:s3", kind: "service", service: "s3", title: "S3" });
    useTabs.getState().openTab({ id: "service:sqs", kind: "service", service: "sqs", title: "SQS" });
    useTabs.getState().openTab({ id: "service:lambda", kind: "service", service: "lambda", title: "Lambda" });

    useTabs.getState().closeAllTabs();
    const state = useTabs.getState();
    expect(state.tabs).toHaveLength(0);
    expect(state.activeTabId).toBeNull();
  });

  it("closes other tabs and keeps only target tab active", () => {
    useTabs.getState().openTab({ id: "service:s3", kind: "service", service: "s3", title: "S3" });
    useTabs.getState().openTab({ id: "service:sqs", kind: "service", service: "sqs", title: "SQS" });
    useTabs.getState().openTab({ id: "service:lambda", kind: "service", service: "lambda", title: "Lambda" });

    useTabs.getState().closeOtherTabs("service:sqs");
    const state = useTabs.getState();
    expect(state.tabs.map((t) => t.id)).toEqual(["service:sqs"]);
    expect(state.activeTabId).toBe("service:sqs");
  });
});

describe("tabs store records recents", () => {
  beforeEach(() => {
    useTabs.setState({ tabs: [], activeTabId: null });
    useRecents.setState({ recent: [] });
  });

  it("records opened tabs in recents, excluding settings", () => {
    useTabs.getState().openTab({ id: "service:s3", kind: "service", service: "s3", title: "S3" });
    useTabs.getState().openTab({ id: "settings", kind: "settings", title: "Settings" });
    useTabs
      .getState()
      .openTab({ id: "bucket:x", kind: "bucket", bucketName: "x", title: "x" });

    expect(useRecents.getState().recent.map((t) => t.id)).toEqual([
      "bucket:x",
      "service:s3",
    ]);
  });

  it("moves an already-recorded tab to the front on reopen", () => {
    useTabs.getState().openTab({ id: "service:s3", kind: "service", service: "s3", title: "S3" });
    useTabs.getState().openTab({ id: "service:sqs", kind: "service", service: "sqs", title: "SQS" });
    useTabs.getState().openTab({ id: "service:s3", kind: "service", service: "s3", title: "S3" });

    expect(useRecents.getState().recent.map((t) => t.id)).toEqual([
      "service:s3",
      "service:sqs",
    ]);
  });
});
