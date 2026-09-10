import { describe, expect, it, vi, beforeEach } from "vitest";
import { screen } from "@testing-library/react";
import { TargetPicker } from "./TargetPicker";
import { renderWithProviders } from "@/test/utils";
import { LOCAL_PROFILE_ID, localProfile, useProfiles } from "@/store/profiles";

vi.mock("@/hooks/use-sqs", () => ({
  useQueues: () => ({ data: [] }),
}));
vi.mock("@/hooks/use-lambda", () => ({
  useFunctions: () => ({
    data: [{ name: "demo-hello" }],
  }),
}));
vi.mock("@/hooks/use-sns", () => ({
  useTopics: () => ({ data: [] }),
}));

describe("TargetPicker", () => {
  beforeEach(() => {
    useProfiles.setState({
      profiles: [{ ...localProfile(), region: "ap-southeast-1" }],
      activeProfileId: LOCAL_PROFILE_ID,
    });
  });

  it("renders ARN with break-all to prevent modal overflow", () => {
    const longArn =
      "arn:aws:lambda:ap-southeast-1:000000000000:function:demo-hello-very-long-function-name";
    renderWithProviders(<TargetPicker arn={longArn} onArnChange={vi.fn()} />);

    const arnEl = screen.getByText(longArn);
    expect(arnEl).toBeInTheDocument();
    expect(arnEl.className).toContain("break-all");
    expect(arnEl.className).not.toContain("truncate");
  });
});
