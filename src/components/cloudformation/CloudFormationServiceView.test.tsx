import { describe, expect, it, vi, beforeEach } from "vitest";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { CloudFormationServiceView } from "./CloudFormationServiceView";
import { StackView } from "./StackView";
import { renderWithProviders } from "@/test/utils";
import { LOCAL_PROFILE_ID, localProfile, useProfiles } from "@/store/profiles";
import { useTabs } from "@/store/tabs";

const { mockState, mockDeleteStack } = vi.hoisted(() => ({
  mockState: {
    serviceStatus: "available" as string,
    stacks: [
      {
        stackId: "arn:1",
        name: "orders",
        status: "CREATE_COMPLETE",
        creationDate: new Date("2026-01-01T00:00:00Z"),
      },
    ] as
      | { stackId: string; name: string; status: string; creationDate?: Date }[]
      | undefined,
    detail: {
      stackId: "arn:1",
      name: "orders",
      status: "CREATE_COMPLETE",
      description: "orders stack",
      outputs: [{ key: "TopicArn", value: "arn:topic" }],
    } as Record<string, unknown> | undefined,
    template: '{"Resources":{"Topic":{"Type":"AWS::SNS::Topic"}}}',
    events: [
      {
        eventId: "e1",
        resourceType: "AWS::SNS::Topic",
        resourceStatus: "CREATE_COMPLETE",
        logicalResourceId: "Topic",
        timestamp: new Date("2026-01-01T00:01:00Z"),
        statusReason: "",
      },
    ],
    resources: [
      {
        logicalId: "Topic",
        physicalId: "arn:topic",
        resourceType: "AWS::SNS::Topic",
        status: "CREATE_COMPLETE",
      },
    ],
    error: null as Error | null,
  },
  mockDeleteStack: vi.fn().mockResolvedValue(true),
}));

vi.mock("@/hooks/use-health", () => ({
  useServiceStatus: () => mockState.serviceStatus,
  useHealth: () => ({ data: undefined, refetch: vi.fn() }),
  isServiceDisabledError: (err: unknown) =>
    err instanceof Error && err.message.includes("is not enabled"),
}));

vi.mock("@/hooks/use-cloudformation", () => ({
  useStacks: () => ({
    data: mockState.stacks,
    isPending: false,
    isFetching: false,
    error: mockState.error,
    refetch: vi.fn(),
  }),
  useStackDetail: () => ({
    data: mockState.detail,
    isPending: false,
    isFetching: false,
    error: null,
    refetch: vi.fn(),
  }),
  useStackTemplate: () => ({
    data: mockState.template,
    isPending: false,
    refetch: vi.fn(),
  }),
  useStackEvents: () => ({
    data: mockState.events,
    isPending: false,
    refetch: vi.fn(),
  }),
  useStackResources: () => ({
    data: mockState.resources,
    isPending: false,
    refetch: vi.fn(),
  }),
  useCloudFormationActions: () => ({ deleteStack: mockDeleteStack }),
}));

describe("CloudFormationServiceView", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockState.error = null;
    useProfiles.setState({ profiles: [localProfile()], activeProfileId: LOCAL_PROFILE_ID });
  });

  it("renders non-deleted stacks", () => {
    renderWithProviders(<CloudFormationServiceView />);
    expect(screen.getByText("orders")).toBeInTheDocument();
    expect(screen.getByText("CREATE COMPLETE")).toBeInTheDocument();
  });

  it("opens a stack tab on row click", () => {
    useTabs.setState({ tabs: [], activeTabId: null });
    renderWithProviders(<CloudFormationServiceView />);
    fireEvent.click(screen.getByText("orders"));
    const tab = useTabs.getState().tabs.find((t) => t.id === "stack:orders");
    expect(tab?.kind).toBe("stack");
    expect(useTabs.getState().activeTabId).toBe("stack:orders");
  });

  it("deletes a stack after confirmation", async () => {
    renderWithProviders(<CloudFormationServiceView />);
    fireEvent.keyDown(screen.getByRole("button", { name: "Actions for orders" }), {
      key: "ArrowDown",
      code: "ArrowDown",
    });
    const deleteMenuItem = await screen.findByRole("menuitem", {
      name: /Delete stack/i,
    });
    fireEvent.click(deleteMenuItem);
    const dialog = await screen.findByRole("dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "Delete" }));
    await waitFor(() => expect(mockDeleteStack).toHaveBeenCalledWith("orders"));
  });
});

describe("StackView", () => {
  beforeEach(() => {
    useProfiles.setState({ profiles: [localProfile()], activeProfileId: LOCAL_PROFILE_ID });
  });

  it("renders outputs, resources, events, and template", () => {
    renderWithProviders(<StackView stackName="orders" />);
    expect(screen.getByText("TopicArn")).toBeInTheDocument();
    expect(screen.getAllByText("arn:topic").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Topic").length).toBeGreaterThan(0);
    expect(screen.getAllByText("AWS::SNS::Topic").length).toBeGreaterThan(0);
    expect(screen.getByText(/"Resources"/)).toBeInTheDocument();
  });
});

