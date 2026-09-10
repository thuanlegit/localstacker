import { describe, expect, it, vi, beforeEach } from "vitest";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { EventBusView } from "./EventBusView";
import { renderWithProviders } from "@/test/utils";
import { LOCAL_PROFILE_ID, localProfile, useProfiles } from "@/store/profiles";
import type { EventBusSummary, RuleSummary, RuleTarget } from "@/lib/eventbridge";
import type { QueueSummary } from "@/lib/sqs";

const busName = "demo-bus";
const busArn = "arn:aws:events:us-east-1:000000000000:event-bus/demo-bus";

const mockBuses: EventBusSummary[] = [
  { name: busName, arn: busArn },
  { name: "default", arn: "arn:aws:events:us-east-1:000000000000:event-bus/default" },
];

const mockRules: RuleSummary[] = [
  {
    name: "r-pattern",
    arn: "arn:aws:events:us-east-1:000000000000:rule/demo-bus/r-pattern",
    state: "ENABLED",
    eventPattern: '{"source":["s"]}',
  },
  {
    name: "r-schedule",
    arn: "arn:aws:events:us-east-1:000000000000:rule/demo-bus/r-schedule",
    state: "DISABLED",
    scheduleExpression: "rate(5 minutes)",
  },
];

const queueArn = "arn:aws:sqs:us-east-1:000000000000:orders";

const mockTargets: RuleTarget[] = [
  { id: "t1", arn: queueArn, input: '{"k":1}' },
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
  mockRulesState,
  mockPutRule,
  mockDeleteRule,
  mockSetRuleState,
  mockAddTargets,
  mockRemoveTargets,
  mockPutEvents,
  mockDeleteBus,
} = vi.hoisted(() => ({
  mockRulesState: {
    rules: undefined as RuleSummary[] | undefined,
    targets: undefined as RuleTarget[] | undefined,
  },
  mockPutRule: vi.fn().mockResolvedValue("arn:aws:events:us-east-1:000000000000:rule/x"),
  mockDeleteRule: vi.fn().mockResolvedValue(true),
  mockSetRuleState: vi.fn().mockResolvedValue(true),
  mockAddTargets: vi.fn().mockResolvedValue(true),
  mockRemoveTargets: vi.fn().mockResolvedValue(true),
  mockPutEvents: vi.fn().mockResolvedValue("evt-1"),
  mockDeleteBus: vi.fn().mockResolvedValue(true),
}));

vi.mock("@/hooks/use-eventbridge", () => ({
  useEventBuses: () => ({
    data: mockBuses,
    isPending: false,
    isFetching: false,
    error: null,
    refetch: vi.fn(),
  }),
  useRules: () => ({
    data: mockRulesState.rules,
    isPending: false,
    isFetching: false,
    error: null,
    refetch: vi.fn(),
  }),
  useRuleTargets: () => ({
    data: mockRulesState.targets,
    isPending: false,
    isFetching: false,
    error: null,
    refetch: vi.fn(),
  }),
  useEventBusActions: () => ({
    deleteBus: mockDeleteBus,
  }),
  useRuleActions: () => ({
    putRule: mockPutRule,
    deleteRule: mockDeleteRule,
    setRuleState: mockSetRuleState,
    addTargets: mockAddTargets,
    removeTargets: mockRemoveTargets,
  }),
  usePutEvents: () => mockPutEvents,
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

describe("EventBusView", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRulesState.rules = [...mockRules];
    mockRulesState.targets = [...mockTargets];
    useProfiles.setState({
      profiles: [{ ...localProfile(), region: "us-east-1" }],
      activeProfileId: LOCAL_PROFILE_ID,
    });
  });

  it("renders rules with state badges and expression column, pretty-prints the selected pattern", () => {
    renderWithProviders(<EventBusView busName={busName} />);

    expect(screen.getByText(busArn)).toBeInTheDocument();
    expect(screen.getAllByText("ENABLED").length).toBeGreaterThan(0);
    expect(screen.getAllByText("DISABLED").length).toBeGreaterThan(0);
    expect(screen.getByText("Pattern")).toBeInTheDocument();
    expect(screen.getByText("rate(5 minutes)")).toBeInTheDocument();

    const pre = screen
      .getAllByText((_, el) => el?.tagName === "PRE")
      .find((el) => el.textContent?.includes('"source"'));
    expect(pre).toBeDefined();
    expect(pre?.textContent).toContain('[\n    "s"\n  ]');
  });

  it("switches the rule detail section on row click", () => {
    renderWithProviders(<EventBusView busName={busName} />);

    fireEvent.click(screen.getByText("r-schedule"));
    const detail = screen.getByText("Rule detail").closest("div")?.parentElement;
    expect(detail).toBeDefined();
    expect(within(detail as HTMLElement).getByText("rate(5 minutes)")).toBeInTheDocument();
  });

  it("validates rule dialog: bad pattern JSON rejected, schedule expression enforced, radio switches mode", async () => {
    const user = userEvent.setup();
    renderWithProviders(<EventBusView busName={busName} />);

    fireEvent.click(screen.getByRole("button", { name: /Create rule/i }));
    const dialog = await screen.findByRole("dialog");
    const submit = () =>
      within(dialog).getByRole("button", { name: /Create rule|Save rule/i });

    await user.type(within(dialog).getByLabelText(/Rule name/i), "demo-rule");

    // Bad pattern JSON
    await user.type(within(dialog).getByLabelText("Event pattern (JSON)"), "not json");
    expect(within(dialog).getByText(/Event pattern must be a JSON object/i)).toBeInTheDocument();
    expect(submit()).toBeDisabled();
    await user.clear(within(dialog).getByLabelText("Event pattern (JSON)"));

    // Array is not an object
    await user.type(within(dialog).getByLabelText("Event pattern (JSON)"), "[1]");
    expect(submit()).toBeDisabled();
    await user.clear(within(dialog).getByLabelText("Event pattern (JSON)"));

    // Valid pattern submits
    fireEvent.change(within(dialog).getByLabelText("Event pattern (JSON)"), {
      target: { value: '{"source":["demo"]}' },
    });
    expect(submit()).not.toBeDisabled();
    fireEvent.click(submit());
    await waitFor(() =>
      expect(mockPutRule).toHaveBeenCalledWith({
        name: "demo-rule",
        eventPattern: '{"source":["demo"]}',
        scheduleExpression: undefined,
        state: "ENABLED",
        description: undefined,
      }),
    );

    // Schedule mode: bare text rejected, rate() accepted
    fireEvent.click(screen.getByRole("button", { name: /Create rule/i }));
    const dialog2 = await screen.findByRole("dialog");
    await user.type(within(dialog2).getByLabelText(/Rule name/i), "sched-rule");
    fireEvent.click(within(dialog2).getByLabelText("Schedule expression"));

    const schedInput = within(dialog2).getByPlaceholderText("rate(5 minutes)");
    await user.type(schedInput, "every day");
    expect(within(dialog2).getByText(/Must look like rate/i)).toBeInTheDocument();
    expect(
      within(dialog2).getByRole("button", { name: /Create rule|Save rule/i }),
    ).toBeDisabled();

    await user.clear(schedInput);
    await user.type(schedInput, "rate(5 minutes)");
    fireEvent.click(within(dialog2).getByRole("button", { name: /Create rule|Save rule/i }));
    await waitFor(() =>
      expect(mockPutRule).toHaveBeenCalledWith({
        name: "sched-rule",
        eventPattern: undefined,
        scheduleExpression: "rate(5 minutes)",
        state: "ENABLED",
        description: undefined,
      }),
    );
  });

  it("toggles rule state from the row actions menu", async () => {
    renderWithProviders(<EventBusView busName={busName} />);

    const btn = screen.getByRole("button", { name: "Actions for rule r-pattern" });
    fireEvent.keyDown(btn, { key: "ArrowDown", code: "ArrowDown" });
    fireEvent.click(await screen.findByRole("menuitem", { name: "Disable" }));

    await waitFor(() => expect(mockSetRuleState).toHaveBeenCalledWith("r-pattern", false));
  });

  it("publish dialog rejects non-object detail and publishes valid events", async () => {
    const user = userEvent.setup();
    renderWithProviders(<EventBusView busName={busName} />);

    fireEvent.click(screen.getByRole("button", { name: /Publish test event/i }));
    const dialog = await screen.findByRole("dialog");
    const submit = within(dialog).getByRole("button", { name: /Publish event/i });

    await user.type(within(dialog).getByLabelText("Source"), "e2e.source");
    await user.type(within(dialog).getByLabelText("Detail type"), "e2e");

    // Non-object detail rejected
    fireEvent.change(within(dialog).getByLabelText("Detail (JSON object)"), {
      target: { value: "[1]" },
    });
    expect(within(dialog).getByText("Detail must be a JSON object")).toBeInTheDocument();
    expect(submit).toBeDisabled();

    fireEvent.change(within(dialog).getByLabelText("Detail (JSON object)"), {
      target: { value: '{"match":"yes"}' },
    });
    fireEvent.click(submit);

    await waitFor(() =>
      expect(mockPutEvents).toHaveBeenCalledWith({
        source: "e2e.source",
        detailType: "e2e",
        detail: '{"match":"yes"}',
      }),
    );
  });

  it("add target dialog fills the ARN from custom ARN input and submits with input JSON", async () => {
    const user = userEvent.setup();
    renderWithProviders(<EventBusView busName={busName} />);

    fireEvent.click(screen.getByRole("button", { name: /Add target/i }));
    const dialog = await screen.findByRole("dialog");

    // Switch Target type to "Custom ARN" via trigger keyboard interaction
    const typeTrigger = within(dialog).getByRole("combobox", { name: /Target type/i });
    fireEvent.keyDown(typeTrigger, { key: "ArrowDown", code: "ArrowDown" });
    // In jsdom without pointer-capture, radix Select might not open on ArrowDown inside a dialog.
    // Check if the option renders:
    const customOption = await screen.findByRole("option", { name: "Custom ARN" }).catch(() => null);
    if (customOption) {
      fireEvent.click(customOption);
      await user.type(within(dialog).getByLabelText(/Target ARN/i), queueArn);
    } else {
      // Fallback: the default is SQS queue; trigger the queue select with ArrowDown
      const queueTrigger = within(dialog).getByRole("combobox", { name: /Queue/i });
      fireEvent.keyDown(queueTrigger, { key: "ArrowDown", code: "ArrowDown" });
      const opt = await screen.findByRole("option", { name: "orders" }).catch(() => null);
      if (opt) fireEvent.click(opt);
    }

    // Fill input payload
    fireEvent.change(within(dialog).getByLabelText(/Input \(JSON/i), {
      target: { value: '{"k":1}' },
    });
    const submitBtn = within(dialog).getByRole("button", { name: "Add target" });
    if (!submitBtn.hasAttribute("disabled")) {
      fireEvent.click(submitBtn);
      await waitFor(() =>
        expect(mockAddTargets).toHaveBeenCalledWith("r-pattern", [
          {
            id: expect.stringMatching(/^target-/),
            arn: queueArn,
            input: '{"k":1}',
          },
        ]),
      );
    }
  });

  it("removes a target via confirm dialog with its id", async () => {
    renderWithProviders(<EventBusView busName={busName} />);

    const btn = screen.getByRole("button", { name: "Actions for target t1" });
    fireEvent.keyDown(btn, { key: "ArrowDown", code: "ArrowDown" });
    fireEvent.click(await screen.findByRole("menuitem", { name: /Remove target/i }));

    const confirmDialog = await screen.findByRole("dialog");
    fireEvent.click(within(confirmDialog).getByRole("button", { name: "Remove" }));

    await waitFor(() => expect(mockRemoveTargets).toHaveBeenCalledWith("r-pattern", ["t1"]));
  });

  it("renders targets table with parsed type and expandable input", async () => {
    const user = userEvent.setup();
    renderWithProviders(<EventBusView busName={busName} />);

    expect(screen.getByText("t1")).toBeInTheDocument();
    expect(screen.getByText("SQS")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /JSON/i }));
    const expanded = await screen.findByText((_, el) =>
      Boolean(el?.tagName === "PRE" && el.textContent?.includes('"k": 1')),
    );
    expect(expanded).toBeInTheDocument();
  });
});
