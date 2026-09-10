import { describe, expect, it, vi, beforeEach } from "vitest";
import { fireEvent, screen, within } from "@testing-library/react";
import { RestApiView } from "./RestApiView";
import { renderWithProviders } from "@/test/utils";
import { LOCAL_PROFILE_ID, localProfile, useProfiles } from "@/store/profiles";
import { useTabs } from "@/store/tabs";
import type {
  RestApiResource,
  StageSummary,
  MethodDetail,
} from "@/lib/apigateway";

const mockResources: RestApiResource[] = [
  {
    id: "res-root",
    path: "/",
    methods: [],
  },
  {
    id: "res-items",
    parentId: "res-root",
    path: "/items",
    pathPart: "items",
    methods: ["GET", "POST"],
  },
];

const mockStages: StageSummary[] = [
  {
    stageName: "dev",
    deploymentId: "dep-1",
    createdDate: "2026-01-01T00:00:00.000Z",
  },
];

const mockMethodDetail: MethodDetail = {
  httpMethod: "GET",
  authorizationType: "NONE",
  apiKeyRequired: false,
  integrationType: "MOCK",
  integrationUri: undefined,
};

const {
  mockState,
  mockCreateResource,
  mockDeleteResource,
  mockPutMethod,
  mockDeleteMethod,
  mockDeployApi,
  mockDeleteStage,
  mockTestInvoke,
} = vi.hoisted(() => ({
  mockState: {
    resources: undefined as RestApiResource[] | undefined,
    stages: undefined as StageSummary[] | undefined,
    methodDetail: undefined as MethodDetail | undefined,
  },
  mockCreateResource: vi.fn().mockResolvedValue({ id: "res-2", path: "/new" }),
  mockDeleteResource: vi.fn().mockResolvedValue(true),
  mockPutMethod: vi.fn().mockResolvedValue(true),
  mockDeleteMethod: vi.fn().mockResolvedValue(true),
  mockDeployApi: vi.fn().mockResolvedValue({ stageName: "prod" }),
  mockDeleteStage: vi.fn().mockResolvedValue(true),
  mockTestInvoke: vi.fn().mockResolvedValue({
    status: 200,
    headers: { "content-type": "application/json" },
    body: '{"message":"mock response"}',
    latency: 0,
  }),
}));

vi.mock("@/hooks/use-apigateway", () => ({
  useRestApis: () => ({
    data: [{ id: "api-1", name: "test-api" }],
  }),
  useRestApiActions: () => ({
    createRestApi: vi.fn(),
    deleteRestApi: vi.fn().mockResolvedValue(true),
  }),
  useResources: () => ({
    data: mockState.resources,
    isPending: false,
    isFetching: false,
    error: null,
    refetch: vi.fn(),
  }),
  useResourceActions: () => ({
    createResource: mockCreateResource,
    deleteResource: mockDeleteResource,
  }),
  useMethod: () => ({
    data: mockState.methodDetail,
    isPending: false,
  }),
  useMethodActions: () => ({
    putMethod: mockPutMethod,
    deleteMethod: mockDeleteMethod,
  }),
  useStages: () => ({
    data: mockState.stages,
    isPending: false,
    refetch: vi.fn(),
  }),
  useStageActions: () => ({
    deployApi: mockDeployApi,
    deleteStage: mockDeleteStage,
  }),
  useTestInvoke: () => ({
    testInvoke: mockTestInvoke,
    isInvoking: false,
  }),
}));

// Mock TargetPicker so it renders simply without network
vi.mock("@/components/eventbridge/TargetPicker", () => ({
  TargetPicker: ({ onArnChange }: { onArnChange: (arn: string) => void }) => (
    <div data-testid="target-picker">
      <button
        type="button"
        onClick={() => onArnChange("arn:aws:lambda:us-east-1:000000000000:function:my-fn")}
      >
        Select Lambda
      </button>
    </div>
  ),
}));

describe("RestApiView", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockState.resources = [...mockResources];
    mockState.stages = [...mockStages];
    mockState.methodDetail = { ...mockMethodDetail };

    useProfiles.setState({
      profiles: [
        {
          ...localProfile(),
          id: LOCAL_PROFILE_ID,
          endpoint: "http://localhost:4566",
          region: "us-east-1",
        },
      ],
      activeProfileId: LOCAL_PROFILE_ID,
    });
    useTabs.setState({ tabs: [], activeTabId: null });
  });

  it("renders resource tree with paths and verb chips", () => {
    renderWithProviders(<RestApiView restApiId="api-1" />);

    expect(screen.getByText("test-api")).toBeInTheDocument();
    expect(screen.getByText("/")).toBeInTheDocument();
    expect(screen.getByText("/items")).toBeInTheDocument();
    expect(screen.getByText("GET")).toBeInTheDocument();
    expect(screen.getByText("POST")).toBeInTheDocument();
  });

  it("renders stages table with invoke URL and copy button", () => {
    renderWithProviders(<RestApiView restApiId="api-1" />);

    expect(screen.getByText("dev")).toBeInTheDocument();
    expect(screen.getByText("dep-1")).toBeInTheDocument();
    expect(
      screen.getByText(
        "http://localhost:4566/restapis/api-1/dev/_user_request_/",
      ),
    ).toBeInTheDocument();
  });

  it("inspects method and opens Method Test Runner dialog on Test invoke click", async () => {
    renderWithProviders(<RestApiView restApiId="api-1" />);

    // Click GET verb badge on /items
    fireEvent.click(screen.getByText("GET"));

    // Method Details section should now show GET details
    expect(screen.getByText("Authorization:")).toBeInTheDocument();
    expect(screen.getByText("Integration Type:")).toBeInTheDocument();

    // Click "Test invoke" button
    const testInvokeBtn = screen.getByRole("button", { name: /Test invoke/i });
    fireEvent.click(testInvokeBtn);

    // Method Test Dialog should open
    const dialog = await screen.findByRole("dialog");
    expect(
      within(dialog).getByText("Method Test Runner"),
    ).toBeInTheDocument();
  });
});
