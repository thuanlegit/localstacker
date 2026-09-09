import { describe, it, expect, beforeEach } from "vitest";
import { useTabs } from "./tabs";

describe("tabs store", () => {
  beforeEach(() => {
    useTabs.setState({ tabs: [], activeTabId: null });
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
});
