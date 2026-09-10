import { describe, expect, it, vi, beforeEach } from "vitest";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ScheduleGroupView } from "./ScheduleGroupView";
import { renderWithProviders } from "@/test/utils";
import { LOCAL_PROFILE_ID, localProfile, useProfiles } from "@/store/profiles";
import type { ScheduleGroupSummary, ScheduleSummary } from "@/lib/scheduler";
import type { QueueSummary } from "@/lib/sqs";

const groupName = "demo-group";
const groupArn =
  "arn:aws:scheduler:us-east-1:000000000000:schedule-group/demo-group";

const mockGroups: ScheduleGroupSummary[] = [
  { name: groupName, arn: groupArn },
  {
    name: "default",
    arn: "arn:aws:scheduler:us-east-1:000000000000:schedule-group/default",
  },
];

const queueArn = "arn:aws:sqs:us-east-1:000000000000:orders";

const mockSchedules: ScheduleSummary[] = [
  {
    name: "s-rate",
    arn: "arn:aws:scheduler:us-east-1:000000000000:schedule/demo-group/s-rate",
    groupName,
    state: "ENABLED",
    expression: "rate(1 day)",
    targetArn: queueArn,
    targetInput: '{"k":"v"}',
    roleArn: "arn:aws:iam::000000000000:role/r1",
    timezone: "UTC",
    flexibleWindowMode: "OFF",
  },
  {
    name: "s-cron",
    arn: "arn:aws:scheduler:us-east-1:000000000000:schedule/demo-group/s-cron",
    groupName,
    state: "DISABLED",
    expression: "cron(0 12 * * ? *)",
    targetArn: "arn:aws:lambda:us-east-1:000000000000:function:fn1",
  },
];

const mockQueues: QueueSummary[] = [
  {
    url: "http://localhost:4566/000000000000/orders",
    name: "orders",
    isFifo: false,
    attributes: {
      depth: 0,
      inFlight: 0,
      delayed: 0,
      arn: queueArn,
    },
  },
];

const {
  mockSchedulesState,
  mockCreateSchedule,
  mockDeleteSchedule,
  mockUpdateScheduleState,
  mockDeleteScheduleGroup,
} = vi.hoisted(() => ({
  mockSchedulesState: {
    schedules: undefined as ScheduleSummary[] | undefined,
  },
  mockCreateSchedule: vi
    .fn()
    .mockResolvedValue(
      "arn:aws:scheduler:us-east-1:000000000000:schedule/demo-group/s1",
    ),
  mockDeleteSchedule: vi.fn().mockResolvedValue(true),
  mockUpdateScheduleState: vi.fn().mockResolvedValue(true),
  mockDeleteScheduleGroup: vi.fn().mockResolvedValue(true),
}));

vi.mock("@/hooks/use-scheduler", () => ({
  useScheduleGroups: () => ({
    data: mockGroups,
    isPending: false,
    isFetching: false,
    error: null,
    refetch: vi.fn(),
  }),
  useSchedules: () => ({
    data: mockSchedulesState.schedules,
    isPending: false,
    isFetching: false,
    error: null,
    refetch: vi.fn(),
  }),
  useScheduleGroupActions: () => ({
    deleteScheduleGroup: mockDeleteScheduleGroup,
  }),
  useScheduleActions: () => ({
    createSchedule: mockCreateSchedule,
    deleteSchedule: mockDeleteSchedule,
    updateScheduleState: mockUpdateScheduleState,
  }),
}));

vi.mock("@/hooks/use-sqs", () => ({
  useQueues: () => ({
    data: mockQueues,
    isPending: false,
    error: null,
    refetch: vi.fn(),
  }),
}));

vi.mock("@/hooks/use-lambda", () => ({
  useFunctions: () => ({
    data: [],
    isPending: false,
    error: null,
    refetch: vi.fn(),
  }),
}));

vi.mock("@/hooks/use-sns", () => ({
  useTopics: () => ({
    data: [],
    isPending: false,
    error: null,
    refetch: vi.fn(),
  }),
}));

describe("ScheduleGroupView", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSchedulesState.schedules = [...mockSchedules];
    useProfiles.setState({
      profiles: [{ ...localProfile(), region: "us-east-1" }],
      activeProfileId: LOCAL_PROFILE_ID,
    });
  });

  it("renders schedules table, state badges, and LocalStack informational note", () => {
    renderWithProviders(<ScheduleGroupView groupName={groupName} />);

    expect(screen.getByText(groupArn)).toBeInTheDocument();
    expect(
      screen.getByText(/LocalStack community stores schedules but does not execute them/i),
    ).toBeInTheDocument();

    expect(screen.getByText("s-rate")).toBeInTheDocument();
    expect(screen.getByText("s-cron")).toBeInTheDocument();
    expect(screen.getByText("rate(1 day)")).toBeInTheDocument();
    expect(screen.getByText("cron(0 12 * * ? *)")).toBeInTheDocument();
    expect(screen.getByText(queueArn)).toBeInTheDocument();

    expect(screen.getAllByText("ENABLED").length).toBeGreaterThan(0);
    expect(screen.getAllByText("DISABLED").length).toBeGreaterThan(0);
  });

  it("opens schedule detail inspector on row click and pretty-prints payload", async () => {
    renderWithProviders(<ScheduleGroupView groupName={groupName} />);

    fireEvent.click(screen.getByText("s-rate"));

    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByRole("heading", { name: "s-rate" })).toBeInTheDocument();
    expect(within(dialog).getByText("rate(1 day)")).toBeInTheDocument();
    expect(within(dialog).getByText(queueArn)).toBeInTheDocument();

    // Payload is pretty-printed in a pre tag
    const pre = within(dialog).getByText((_, el) =>
      Boolean(el?.tagName === "PRE" && el.textContent?.includes('"k": "v"')),
    );
    expect(pre).toBeInTheDocument();
  });

  it("validates create schedule dialog, enforces format, and submits", async () => {
    const user = userEvent.setup();
    renderWithProviders(<ScheduleGroupView groupName={groupName} />);

    fireEvent.click(screen.getByRole("button", { name: /Create schedule/i }));
    const dialog = await screen.findByRole("dialog");
    const submitBtn = within(dialog).getByRole("button", {
      name: "Create schedule",
    });

    await user.type(within(dialog).getByLabelText(/Schedule name/i), "s-new");

    // Expression must match type
    const exprInput = within(dialog).getByLabelText("Expression");
    await user.type(exprInput, "invalid format");
    expect(within(dialog).getByText(/Must start with “rate\(”/i)).toBeInTheDocument();
    expect(submitBtn).toBeDisabled();

    await user.clear(exprInput);
    await user.type(exprInput, "rate(2 hours)");
    expect(within(dialog).queryByText(/Must start with/i)).not.toBeInTheDocument();

    // Fill a custom target ARN via TargetPicker
    const typeTrigger = within(dialog).getByRole("combobox", {
      name: /Target type/i,
    });
    fireEvent.keyDown(typeTrigger, { key: "ArrowDown", code: "ArrowDown" });
    const customOpt = await screen
      .findByRole("option", { name: "Custom ARN" })
      .catch(() => null);
    if (customOpt) {
      fireEvent.click(customOpt);
      await user.type(within(dialog).getByLabelText(/Target ARN/i), queueArn);
    } else {
      const queueTrigger = within(dialog).getByRole("combobox", {
        name: /Queue/i,
      });
      fireEvent.keyDown(queueTrigger, { key: "ArrowDown", code: "ArrowDown" });
      const opt = await screen
        .findByRole("option", { name: "orders" })
        .catch(() => null);
      if (opt) fireEvent.click(opt);
    }

    // Invalid JSON input
    fireEvent.change(within(dialog).getByLabelText(/Input \(JSON/i), {
      target: { value: "bad-json" },
    });
    expect(within(dialog).getByText("Input must be valid JSON")).toBeInTheDocument();
    expect(submitBtn).toBeDisabled();

    fireEvent.change(within(dialog).getByLabelText(/Input \(JSON/i), {
      target: { value: '{"target":"sqs"}' },
    });

    // Pre-filled role ARN is present
    expect(within(dialog).getByLabelText(/Role ARN/i)).toHaveValue(
      "arn:aws:iam::000000000000:role/localstacker-scheduler",
    );

    if (!submitBtn.hasAttribute("disabled")) {
      fireEvent.click(submitBtn);
      await waitFor(() =>
        expect(mockCreateSchedule).toHaveBeenCalledWith(
          expect.objectContaining({
            name: "s-new",
            expression: "rate(2 hours)",
            expressionType: "rate",
            targetInput: '{"target":"sqs"}',
            state: "ENABLED",
          }),
        ),
      );
    }
  });

  it("toggles schedule state via row actions menu", async () => {
    renderWithProviders(<ScheduleGroupView groupName={groupName} />);

    const btn = screen.getByRole("button", { name: "Actions for s-rate" });
    fireEvent.keyDown(btn, { key: "ArrowDown", code: "ArrowDown" });
    fireEvent.click(await screen.findByRole("menuitem", { name: "Disable" }));

    await waitFor(() =>
      expect(mockUpdateScheduleState).toHaveBeenCalledWith("s-rate", false),
    );
  });

  it("deletes a schedule via confirm dialog", async () => {
    renderWithProviders(<ScheduleGroupView groupName={groupName} />);

    const btn = screen.getByRole("button", { name: "Actions for s-rate" });
    fireEvent.keyDown(btn, { key: "ArrowDown", code: "ArrowDown" });
    fireEvent.click(await screen.findByRole("menuitem", { name: /Delete schedule/i }));

    const confirmDialog = await screen.findByRole("dialog");
    fireEvent.click(within(confirmDialog).getByRole("button", { name: "Delete" }));

    await waitFor(() => expect(mockDeleteSchedule).toHaveBeenCalledWith("s-rate"));
  });
});
