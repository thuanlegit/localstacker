import { describe, expect, it, vi, beforeEach } from "vitest";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { CreateFunctionDialog } from "./CreateFunctionDialog";
import { renderWithProviders } from "@/test/utils";

const mockCreate = vi.fn();

vi.mock("@/hooks/use-lambda", () => ({
  useLambdaActions: () => ({
    create: mockCreate,
    createDemo: vi.fn(),
    removeFunction: vi.fn(),
  }),
}));

describe("CreateFunctionDialog", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCreate.mockResolvedValue("my-new-fn");
  });

  it("renders with default nodejs22.x runtime and index.handler", () => {
    renderWithProviders(
      <CreateFunctionDialog open={true} onOpenChange={vi.fn()} />,
    );

    expect(screen.getByText("Create Lambda Function")).toBeInTheDocument();
    expect(screen.getByLabelText("Function Name")).toBeInTheDocument();
    expect(screen.getByLabelText("Runtime")).toBeInTheDocument();
    expect(screen.getByLabelText("Handler")).toHaveValue("index.handler");
    expect(screen.getByDisplayValue(/Hello from LocalStack Lambda/i)).toBeInTheDocument();
  });

  it("validates function name on submit", async () => {
    renderWithProviders(
      <CreateFunctionDialog open={true} onOpenChange={vi.fn()} />,
    );

    // Empty name
    fireEvent.click(screen.getByRole("button", { name: "Create function" }));
    expect(await screen.findByText(/Function name is required/i)).toBeInTheDocument();
    expect(mockCreate).not.toHaveBeenCalled();

    // Invalid characters
    fireEvent.change(screen.getByLabelText("Function Name"), {
      target: { value: "invalid name with spaces!" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Create function" }));
    expect(
      await screen.findByText(/Function name must be 1-64 characters/i),
    ).toBeInTheDocument();
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it("creates function with inline code and calls onCreated", async () => {
    const onCreated = vi.fn();
    const onOpenChange = vi.fn();

    renderWithProviders(
      <CreateFunctionDialog
        open={true}
        onOpenChange={onOpenChange}
        onCreated={onCreated}
      />,
    );

    fireEvent.change(screen.getByLabelText("Function Name"), {
      target: { value: "my-valid-fn" },
    });
    fireEvent.change(screen.getByLabelText(/Description/i), {
      target: { value: "Test description" },
    });

    fireEvent.click(screen.getByRole("button", { name: "Create function" }));

    await waitFor(() => {
      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          name: "my-valid-fn",
          runtime: "nodejs22.x",
          handler: "index.handler",
          description: "Test description",
          timeout: 3,
          memorySize: 128,
        }),
      );
    });

    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(onCreated).toHaveBeenCalledWith("my-new-fn");
  });

  it("switches to upload mode and handles file selection", async () => {
    renderWithProviders(
      <CreateFunctionDialog open={true} onOpenChange={vi.fn()} />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Upload Archive" }));
    expect(screen.getByText(/Upload a pre-packaged/i)).toBeInTheDocument();

    const file = new File(["console.log('hi')"], "handler.js", {
      type: "application/javascript",
    });

    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    expect(fileInput).not.toBeNull();

    fireEvent.change(fileInput, { target: { files: [file] } });

    expect(await screen.findByText("handler.js")).toBeInTheDocument();
  });

  it("toggles advanced settings for timeout and memory", () => {
    renderWithProviders(
      <CreateFunctionDialog open={true} onOpenChange={vi.fn()} />,
    );

    expect(screen.queryByLabelText("Timeout (seconds)")).not.toBeInTheDocument();

    fireEvent.click(
      screen.getByRole("button", { name: /advanced settings/i }),
    );

    expect(screen.getByLabelText("Timeout (seconds)")).toBeInTheDocument();
    expect(screen.getByLabelText("Memory (MB)")).toBeInTheDocument();
  });
});
