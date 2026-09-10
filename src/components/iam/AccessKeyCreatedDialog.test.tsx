import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { AccessKeyCreatedDialog } from "./AccessKeyCreatedDialog";

describe("AccessKeyCreatedDialog", () => {
  const writeTextMock = vi.fn().mockResolvedValue(undefined);

  beforeEach(() => {
    vi.clearAllMocks();
    Object.assign(navigator, {
      clipboard: {
        writeText: writeTextMock,
      },
    });
  });

  const sampleKey = {
    accessKeyId: "AKIAIOSFODNN7EXAMPLE",
    secretAccessKey: "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY",
    userName: "alice",
  };

  it("renders key details and warning", () => {
    render(
      <AccessKeyCreatedDialog
        open={true}
        onOpenChange={vi.fn()}
        accessKey={sampleKey}
      />,
    );

    expect(screen.getByText("Access Key Created")).toBeInTheDocument();
    expect(screen.getByDisplayValue(sampleKey.accessKeyId)).toBeInTheDocument();
    expect(
      screen.getByDisplayValue(sampleKey.secretAccessKey),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Secret Access Key cannot be viewed again/),
    ).toBeInTheDocument();
  });

  it("copies credentials on click", () => {
    render(
      <AccessKeyCreatedDialog
        open={true}
        onOpenChange={vi.fn()}
        accessKey={sampleKey}
      />,
    );

    const copyBothBtn = screen.getByRole("button", {
      name: "Copy Both (.env)",
    });
    fireEvent.click(copyBothBtn);

    expect(writeTextMock).toHaveBeenCalledWith(
      expect.stringContaining("AWS_ACCESS_KEY_ID=AKIAIOSFODNN7EXAMPLE"),
    );
  });
});
