import { describe, expect, it } from "vitest";
import { trayUpdateFor } from "./tray";

describe("trayUpdateFor", () => {
  it("maps up health to the running label", () => {
    expect(trayUpdateFor("up", true)).toEqual({ status: "up", label: "LocalStack: Running" });
  });

  it("maps down health to the stopped label", () => {
    expect(trayUpdateFor("down", true)).toEqual({ status: "down", label: "LocalStack: Stopped" });
  });

  it("maps missing health to the checking label", () => {
    expect(trayUpdateFor(undefined, true)).toEqual({
      status: "unknown",
      label: "Checking LocalStack…",
    });
  });

  it("reports no connection when onboarding is incomplete", () => {
    expect(trayUpdateFor(undefined, false)).toEqual({
      status: "unknown",
      label: "No connection configured",
    });
  });

  it("prioritizes missing connection over healthy health", () => {
    expect(trayUpdateFor("up", false)).toEqual({
      status: "unknown",
      label: "No connection configured",
    });
  });
});
