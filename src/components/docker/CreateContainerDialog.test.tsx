import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CreateContainerDialog } from "./CreateContainerDialog";

const { mockOnCreate, mockOnCancelOperation, mockOnOpenChange } = vi.hoisted(() => ({
  mockOnCreate: vi.fn(),
  mockOnCancelOperation: vi.fn(),
  mockOnOpenChange: vi.fn(),
}));

function renderDialog() {
  render(
    <CreateContainerDialog
      open
      onOpenChange={mockOnOpenChange}
      onCreate={mockOnCreate}
      onCancelOperation={mockOnCancelOperation}
    />,
  );
}

async function openAdvanced(user: ReturnType<typeof userEvent.setup>) {
  await user.click(
    screen.getByRole("button", { name: /Advanced \(JSON overrides/ }),
  );
}

describe("CreateContainerDialog", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockOnCreate.mockResolvedValue(undefined);
    mockOnCancelOperation.mockResolvedValue(undefined);
  });

  afterEach(() => {
    cleanup();
  });

  it("submits defaults and closes on success", async () => {
    const user = userEvent.setup();
    renderDialog();

    await user.click(screen.getByRole("button", { name: "Launch" }));

    await waitFor(() => {
      expect(mockOnCreate).toHaveBeenCalledTimes(1);
    });
    const [input, onEvent, onStatus] = mockOnCreate.mock.calls[0];
    expect(input.image).toBe("localstack/localstack:4.14.0");
    expect(input.ports).toEqual([
      { hostPort: 4566, containerPort: 4566, protocol: "tcp" },
    ]);
    expect(input.env).toEqual([]);
    expect(input.persistVolume).toBe(false);
    expect(input.restartPolicy).toBe("unless-stopped");
    expect(typeof onEvent).toBe("function");
    expect(typeof onStatus).toBe("function");
    expect(mockOnOpenChange).toHaveBeenCalledWith(false);
  });

  it("shows validation errors for bad port, missing name with persist, bad env, and bad JSON", async () => {
    const user = userEvent.setup();
    renderDialog();

    const hostPort = screen.getByLabelText("Host port 1");
    fireEvent.change(hostPort, { target: { value: "0" } });

    fireEvent.click(screen.getByLabelText(/Persist state/));

    fireEvent.change(screen.getByLabelText("Env key 1"), { target: { value: "1BAD" } });
    fireEvent.change(screen.getByLabelText("Env value 1"), { target: { value: "x" } });

    await openAdvanced(user);
    fireEvent.change(screen.getByLabelText("Extra config JSON"), {
      target: { value: "{not json" },
    });

    await user.click(screen.getByRole("button", { name: "Launch" }));

    expect(await screen.findByText(/Port values must be integers between 1 and 65535/))
      .toBeInTheDocument();
    expect(
      screen.getByText("Container name is required when persistence is enabled."),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Env entries must look like KEY=value/),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Advanced JSON must be a valid JSON object."),
    ).toBeInTheDocument();
    expect(mockOnCreate).not.toHaveBeenCalled();
  });

  it("previews merged config with override and masks sensitive env values", async () => {
    const user = userEvent.setup();
    renderDialog();

    fireEvent.click(screen.getByLabelText(/Persist state/));
    fireEvent.change(screen.getByLabelText("Container name"), {
      target: { value: "preview-stack" },
    });
    fireEvent.change(screen.getByLabelText("Env key 1"), {
      target: { value: "LOCALSTACK_API_KEY" },
    });
    fireEvent.change(screen.getByLabelText("Env value 1"), {
      target: { value: "hunter2" },
    });

    await openAdvanced(user);
    fireEvent.change(screen.getByLabelText("Extra config JSON"), {
      target: { value: '{"HostConfig":{"Memory":512}}' },
    });

    const preview = screen.getByTestId("config-preview");
    expect(preview.textContent).toContain("localstacker-preview-stack:/var/lib/localstack");
    expect(preview.textContent).toContain("localstack/localstack:4.14.0");
    expect(preview.textContent).toContain("unless-stopped");
    expect(preview.textContent).toContain("Memory");
    expect(preview.textContent).toContain("512");
    expect(preview.textContent).toContain("LOCALSTACK_API_KEY=***");
    expect(preview.textContent).not.toContain("hunter2");
  });

  it("supports custom image entry and submit passes it through", async () => {
    const user = userEvent.setup();
    renderDialog();

    await user.click(screen.getByLabelText("Image"));
    await user.click(await screen.findByText("Custom…"));
    fireEvent.change(screen.getByLabelText("Custom image"), {
      target: { value: "localstack/localstack:3.8.2" },
    });

    await user.click(screen.getByRole("button", { name: "Launch" }));

    await waitFor(() => {
      expect(mockOnCreate).toHaveBeenCalledTimes(1);
    });
    expect(mockOnCreate.mock.calls[0][0].image).toBe("localstack/localstack:3.8.2");
  });

  it("surfaces pull progress events while submitting", async () => {
    const user = userEvent.setup();
    mockOnCreate.mockImplementation(
      async (
        _input: unknown,
        onEvent: (e: { status: string; current?: number; total?: number }) => void,
      ) => {
        onEvent({ status: "Pulling localstack/localstack:4.14.0", current: 20, total: 100 });
        await new Promise((r) => setTimeout(r, 50));
      },
    );
    renderDialog();

    await user.click(screen.getByRole("button", { name: "Launch" }));

    expect(await screen.findByTestId("create-progress")).toBeInTheDocument();
    expect(screen.getByText(/Pulling localstack\/localstack:4\.14\.0/)).toBeInTheDocument();
    expect(screen.getByText("Cancel operation")).toBeInTheDocument();

    await waitFor(() => {
      expect(mockOnOpenChange).toHaveBeenCalledWith(false);
    });
  });

  it("cancels the operation on Cancel while submitting", async () => {
    const user = userEvent.setup();
    mockOnCreate.mockImplementation(
      () => new Promise(() => {}),
    );
    renderDialog();

    await user.click(screen.getByRole("button", { name: "Launch" }));
    await user.click(await screen.findByText("Cancel operation"));

    expect(mockOnCancelOperation).toHaveBeenCalledWith(expect.any(String));
    expect(mockOnOpenChange).toHaveBeenCalledWith(false);
  });

  it("keeps the dialog open when creation fails", async () => {
    const user = userEvent.setup();
    mockOnCreate.mockRejectedValue(new Error("daemon unreachable"));
    renderDialog();

    await user.click(screen.getByRole("button", { name: "Launch" }));

    await waitFor(() => {
      expect(mockOnCreate).toHaveBeenCalledTimes(1);
    });
    expect(mockOnOpenChange).not.toHaveBeenCalledWith(false);
  });
});
