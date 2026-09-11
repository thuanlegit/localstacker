import { beforeEach, describe, expect, it, vi } from "vitest";
import { useOnboarding } from "./onboarding";

describe("onboarding store", () => {
  beforeEach(() => {
    localStorage.clear();
    useOnboarding.setState({ completedAt: null });
  });

  it("defaults to null on first launch", () => {
    expect(useOnboarding.getState().completedAt).toBeNull();
  });

  it("complete() records a timestamp", () => {
    useOnboarding.getState().complete();
    expect(useOnboarding.getState().completedAt).toBeTypeOf("number");
  });

  it("persists to the localstacker.onboarding key", () => {
    useOnboarding.getState().complete();
    const raw = localStorage.getItem("localstacker.onboarding");
    expect(raw).not.toBeNull();
    expect(JSON.parse(raw!).state.completedAt).toBe(useOnboarding.getState().completedAt);
  });

  it("rehydrates completedAt in a fresh store against the same localStorage key", async () => {
    localStorage.setItem(
      "localstacker.onboarding",
      JSON.stringify({ state: { completedAt: 1234 }, version: 0 }),
    );
    // Static import cannot work here: the test needs a second store instance from a
    // blank module registry, so vi.resetModules + dynamic import is the point of the test.
    vi.resetModules();
    const { useOnboarding: fresh } = await import("./onboarding");
    expect(fresh.getState().completedAt).toBe(1234);
  });
});
