import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
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
    let finishCreate!: () => void;
    mockOnCreate.mockImplementation(
      async (
        _input: unknown,
        onEvent: (e: { status: string; current?: number; total?: number }) => void,
      ) => {
        onEvent({ status: "Pulling localstack/localstack:4.14.0", current: 20, total: 100 });
        await new Promise<void>((r) => {
          finishCreate = r;
        });
      },
    );
    renderDialog();

    await user.click(screen.getByRole("button", { name: "Launch" }));

    expect(await screen.findByTestId("create-progress")).toBeInTheDocument();
    expect(screen.getByText(/Pulling localstack\/localstack:4\.14\.0/)).toBeInTheDocument();
    expect(screen.getByText("Cancel operation")).toBeInTheDocument();

    finishCreate();

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

  it("emits SERVICES from selected chips plus additional services, deduped", async () => {
    const user = userEvent.setup();
    renderDialog();

    await user.click(screen.getByRole("button", { name: "S3" }));
    await user.click(screen.getByRole("button", { name: "Lambda" }));
    await user.type(screen.getByLabelText("Additional services"), "kms,s3,sts");

    expect(screen.getByTestId("services-env-hint")).toHaveTextContent(
      "SERVICES=s3,lambda,kms,sts",
    );

    await user.click(screen.getByRole("button", { name: "Launch" }));

    await waitFor(() => {
      expect(mockOnCreate).toHaveBeenCalledTimes(1);
    });
    expect(mockOnCreate.mock.calls[0][0].env).toEqual(["SERVICES=s3,lambda,kms,sts"]);
  });

  it("defaults to no SERVICES var and shows the all-services hint", async () => {
    const user = userEvent.setup();
    renderDialog();

    expect(screen.getByTestId("services-env-hint")).toHaveTextContent(
      /No selection = all services available/,
    );

    await user.click(screen.getByRole("button", { name: "Launch" }));

    await waitFor(() => {
      expect(mockOnCreate).toHaveBeenCalledTimes(1);
    });
    expect(mockOnCreate.mock.calls[0][0].env).toEqual([]);
  });

  it("blocks manual SERVICES env rows in favor of the picker", async () => {
    const user = userEvent.setup();
    renderDialog();

    fireEvent.change(screen.getByLabelText("Env key 1"), { target: { value: "SERVICES" } });
    fireEvent.change(screen.getByLabelText("Env value 1"), { target: { value: "s3" } });

    await user.click(screen.getByRole("button", { name: "Launch" }));

    expect(
      await screen.findByText(/SERVICES is managed by the service picker/),
    ).toBeInTheDocument();
    expect(mockOnCreate).not.toHaveBeenCalled();
  });

  it("validates additional service tokens", async () => {
    const user = userEvent.setup();
    renderDialog();

    await user.type(screen.getByLabelText("Additional services"), "KMS, bad name");
    await user.click(screen.getByRole("button", { name: "Launch" }));

    expect(
      await screen.findByText(/Additional services must be comma-separated lowercase/),
    ).toBeInTheDocument();
    expect(mockOnCreate).not.toHaveBeenCalled();
  });

  it("renders the data persistence tooltip trigger", () => {
    renderDialog();
    expect(screen.getByLabelText("Persistence info")).toBeInTheDocument();
  });

  it("dynamically adjusts persistence volume path to /persisted-data for persist images", async () => {
    const user = userEvent.setup();
    renderDialog();

    expect(screen.getByText(/\/var\/lib\/localstack/)).toBeInTheDocument();

    await user.click(screen.getByLabelText("Image"));
    await user.click(await screen.findByText("gresau/localstack-persist:latest"));

    expect(screen.getByText(/\/persisted-data/)).toBeInTheDocument();

    fireEvent.click(screen.getByLabelText(/Persist state/));
    fireEvent.change(screen.getByLabelText("Container name"), {
      target: { value: "persist-stack" },
    });

    await openAdvanced(user);
    const preview = screen.getByTestId("config-preview");
    expect(preview.textContent).toContain("localstacker-persist-stack:/persisted-data");
  });

  it("displays package information and monotonic overall progress across multiple layers", async () => {
    const user = userEvent.setup();
    let sendEvent!: (e: {
      status: string;
      layerId?: string;
      current?: number;
      total?: number;
      done?: boolean;
    }) => void;
    mockOnCreate.mockImplementation(
      async (
        _input: unknown,
        onEvent: (e: {
          status: string;
          layerId?: string;
          current?: number;
          total?: number;
          done?: boolean;
        }) => void,
      ) => {
        sendEvent = onEvent;
        await new Promise(() => {}); // keep active
      },
    );
    renderDialog();

    await user.click(screen.getByRole("button", { name: "Launch" }));

    expect(await screen.findByTestId("create-progress")).toBeInTheDocument();

    // Event 1: layer-1 downloading
    sendEvent({
      status: "Downloading",
      layerId: "layer-1",
      current: 500,
      total: 1000,
      done: false,
    });

    const activeCard = await screen.findByTestId("active-package-card");
    expect(within(activeCard).getByText("layer-1")).toBeInTheDocument();
    expect(within(activeCard).getByText("500 B / 1000 B")).toBeInTheDocument();
    expect(within(activeCard).getByTestId("package-progress-bar")).toBeInTheDocument();
    expect(screen.getByTestId("overall-progress-bar")).toBeInTheDocument();

    // Event 2: layer-2 downloading
    sendEvent({
      status: "Downloading",
      layerId: "layer-2",
      current: 200,
      total: 1000,
      done: false,
    });

    await waitFor(() => {
      const activeCard2 = screen.getByTestId("active-package-card");
      expect(within(activeCard2).getByText("layer-2")).toBeInTheDocument();
    });
    const pkgList = screen.getByTestId("package-list");
    expect(within(pkgList).getByText("layer-1")).toBeInTheDocument();
    expect(within(pkgList).getByText("layer-2")).toBeInTheDocument();
    expect(screen.getByText("Packages (2)")).toBeInTheDocument();
  });
});
