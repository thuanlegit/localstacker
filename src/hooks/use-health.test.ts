import { describe, expect, it } from "vitest";
import { isServiceDisabledError } from "./use-health";

describe("use-health helpers", () => {
  describe("isServiceDisabledError", () => {
    it("detects standard LocalStack disabled service error messages", () => {
      const err = new Error(
        "Service 'sqs' is not enabled. Check your 'SERVICES' configuration variable.",
      );
      expect(isServiceDisabledError(err)).toBe(true);
    });

    it("detects 501 or variant service not enabled messages", () => {
      expect(isServiceDisabledError("501 Not Implemented")).toBe(true);
      expect(isServiceDisabledError("Service 's3' is not enabled")).toBe(true);
      expect(
        isServiceDisabledError("Check your 'SERVICES' environment variable"),
      ).toBe(true);
    });

    it("returns false for unrelated errors", () => {
      expect(isServiceDisabledError(new Error("Connection refused"))).toBe(false);
      expect(isServiceDisabledError(new Error("AccessDenied: User not authorized"))).toBe(false);
      expect(isServiceDisabledError(null)).toBe(false);
      expect(isServiceDisabledError(undefined)).toBe(false);
    });
  });
});
