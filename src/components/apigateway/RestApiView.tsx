import { useState, useMemo } from "react";
import {
  Network,
  CircleAlert,
  Loader2,
  MoreHorizontal,
  Plus,
  RotateCw,
  Trash2,
  Copy,
  FolderPlus,
  Play,
  Layers,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { DeleteConfirmDialog } from "@/components/DeleteConfirmDialog";
import { MethodTestDialog } from "@/components/apigateway/MethodTestDialog";
import { TargetPicker } from "@/components/eventbridge/TargetPicker";
import { useActiveProfile } from "@/store/profiles";
import { useTabs } from "@/store/tabs";
import { toast } from "sonner";
import {
  useRestApis,
  useRestApiActions,
  useResources,
  useResourceActions,
  useMethod,
  useMethodActions,
  useStages,
  useStageActions,
} from "@/hooks/use-apigateway";
import {
  invokeUrl,
  type RestApiResource,
  type MethodIntegration,
  type StageSummary,
} from "@/lib/apigateway";

const RESOURCE_PATH_REGEX =
  /^(\{[a-zA-Z0-9_]+\+\}|\{[a-zA-Z0-9_]+\}|[a-zA-Z0-9_.-]{1,256})$/;

const HTTP_METHODS = [
  "GET",
  "POST",
  "PUT",
  "PATCH",
  "DELETE",
  "HEAD",
  "OPTIONS",
] as const;

interface RestApiViewProps {
  restApiId: string;
}

interface SelectedMethod {
  resourceId: string;
  httpMethod: string;
  resourcePath: string;
}

interface ResourceItem {
  resource: RestApiResource;
  depth: number;
}

function buildResourceList(resources: RestApiResource[]): ResourceItem[] {
  const byId = new Map<string, RestApiResource>(
    resources.map((r) => [r.id, r]),
  );
  const childrenMap = new Map<string, RestApiResource[]>();
  const roots: RestApiResource[] = [];

  for (const r of resources) {
    if (!r.parentId || !byId.has(r.parentId)) {
      roots.push(r);
    } else {
      const list = childrenMap.get(r.parentId) ?? [];
      list.push(r);
      childrenMap.set(r.parentId, list);
    }
  }

  roots.sort((a, b) => {
    if (a.path === "/") return -1;
    if (b.path === "/") return 1;
    return a.path.localeCompare(b.path);
  });

  const result: ResourceItem[] = [];
  function add(node: RestApiResource, depth: number) {
    result.push({ resource: node, depth });
    const children = childrenMap.get(node.id) ?? [];
    children.sort((a, b) =>
      (a.pathPart ?? a.path).localeCompare(b.pathPart ?? b.path),
    );
    for (const child of children) {
      add(child, depth + 1);
    }
  }

  for (const root of roots) {
    add(root, 0);
  }

  return result;
}

function methodBadgeVariant(
  method: string,
): "default" | "secondary" | "outline" | "destructive" {
  switch (method.toUpperCase()) {
    case "GET":
      return "secondary";
    case "POST":
      return "default";
    case "DELETE":
      return "destructive";
    default:
      return "outline";
  }
}

// ----------------- Create Resource Dialog -----------------
interface CreateResourceDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  restApiId: string;
}

function CreateResourceDialog({
  open,
  onOpenChange,
  restApiId,
}: CreateResourceDialogProps) {
  const [pathPart, setPathPart] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { createResource } = useResourceActions(restApiId);

  const trimmed = pathPart.trim().replace(/^\//, "");
  const isValid = RESOURCE_PATH_REGEX.test(trimmed);
  const showError = trimmed.length > 0 && !isValid;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isValid || isSubmitting) return;

    setIsSubmitting(true);
    try {
      const res = await createResource(trimmed);
      if (res) {
        setPathPart("");
        onOpenChange(false);
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Create Resource</DialogTitle>
            <DialogDescription>
              Create a child resource under the root path (/).
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="resource-path-part">Resource path</Label>
              <div className="flex items-center gap-2">
                <span className="text-sm font-mono text-muted-foreground">/</span>
                <Input
                  id="resource-path-part"
                  value={pathPart}
                  onChange={(e) => setPathPart(e.target.value)}
                  placeholder="users or {id} or {proxy+}"
                  className="font-mono text-xs"
                  autoFocus
                />
              </div>
              {showError ? (
                <p className="text-xs text-destructive">
                  Invalid resource path. Alphanumeric, hyphens, underscores, or path parameters like &#123;id&#125;.
                </p>
              ) : (
                <p className="text-xs text-muted-foreground">
                  Supports standard path names or path parameters (e.g. &#123;id&#125; or &#123;proxy+&#125;).
                </p>
              )}
            </div>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={!isValid || isSubmitting}>
              {isSubmitting ? "Creating..." : "Create Resource"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ----------------- Create Method Dialog -----------------
interface CreateMethodDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  restApiId: string;
  resource: RestApiResource | null;
}

function CreateMethodDialog({
  open,
  onOpenChange,
  restApiId,
  resource,
}: CreateMethodDialogProps) {
  const [httpMethod, setHttpMethod] = useState<string>("GET");
  const [intType, setIntType] = useState<"MOCK" | "AWS_PROXY" | "HTTP_PROXY">(
    "MOCK",
  );
  const [mockResponse, setMockResponse] = useState(
    '{"message":"mock response"}',
  );
  const [lambdaArn, setLambdaArn] = useState<string | null>(null);
  const [httpUri, setHttpUri] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const { putMethod } = useMethodActions(restApiId);

  // Validate Mock template JSON
  let mockValid = true;
  if (intType === "MOCK") {
    try {
      const parsed = JSON.parse(mockResponse);
      mockValid = parsed !== null && typeof parsed === "object";
    } catch {
      mockValid = false;
    }
  }

  // Validate HTTP URI
  const httpUriValid =
    intType !== "HTTP_PROXY" ||
    httpUri.startsWith("http://") ||
    httpUri.startsWith("https://");

  // Validate Lambda ARN
  const lambdaValid = intType !== "AWS_PROXY" || Boolean(lambdaArn);

  const isFormValid =
    Boolean(resource) &&
    (intType === "MOCK"
      ? mockValid
      : intType === "AWS_PROXY"
        ? lambdaValid
        : httpUriValid);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resource || !isFormValid || isSubmitting) return;

    let integration: MethodIntegration;
    if (intType === "MOCK") {
      integration = {
        type: "MOCK",
        responseTemplate: mockResponse,
      };
    } else if (intType === "AWS_PROXY") {
      integration = {
        type: "AWS_PROXY",
        functionArn: lambdaArn!,
      };
    } else {
      integration = {
        type: "HTTP_PROXY",
        uri: httpUri.trim(),
      };
    }

    setIsSubmitting(true);
    try {
      const ok = await putMethod({
        resourceId: resource.id,
        httpMethod,
        integration,
      });
      if (ok) {
        onOpenChange(false);
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <form onSubmit={handleSubmit} className="space-y-4">
          <DialogHeader>
            <DialogTitle>Create Method</DialogTitle>
            <DialogDescription>
              Add an HTTP method to resource{" "}
              <code className="font-mono text-xs">{resource?.path}</code>.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label htmlFor="method-verb">HTTP Verb</Label>
              <Select value={httpMethod} onValueChange={setHttpMethod}>
                <SelectTrigger id="method-verb">
                  <SelectValue placeholder="Select HTTP method" />
                </SelectTrigger>
                <SelectContent>
                  {HTTP_METHODS.map((verb) => (
                    <SelectItem key={verb} value={verb}>
                      {verb}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label>Integration Type</Label>
              <div className="grid grid-cols-3 gap-2">
                <Button
                  type="button"
                  variant={intType === "MOCK" ? "default" : "outline"}
                  size="sm"
                  onClick={() => setIntType("MOCK")}
                >
                  Mock
                </Button>
                <Button
                  type="button"
                  variant={intType === "AWS_PROXY" ? "default" : "outline"}
                  size="sm"
                  onClick={() => setIntType("AWS_PROXY")}
                >
                  Lambda
                </Button>
                <Button
                  type="button"
                  variant={intType === "HTTP_PROXY" ? "default" : "outline"}
                  size="sm"
                  onClick={() => setIntType("HTTP_PROXY")}
                >
                  HTTP
                </Button>
              </div>
            </div>

            {intType === "MOCK" && (
              <div className="space-y-1.5">
                <textarea
                  id="mock-template"
                  value={mockResponse}
                  onChange={(e) => setMockResponse(e.target.value)}
                  rows={4}
                  className="flex min-h-[100px] w-full rounded-md border border-input bg-transparent px-3 py-2 font-mono text-xs shadow-xs placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                />
                {!mockValid && (
                  <p className="text-xs text-destructive">
                    Response body must be valid JSON
                  </p>
                )}
              </div>
            )}

            {intType === "AWS_PROXY" && (
              <div className="space-y-2">
                <Label>Lambda Function</Label>
                <TargetPicker arn={lambdaArn} onArnChange={setLambdaArn} />
              </div>
            )}

            {intType === "HTTP_PROXY" && (
              <div className="space-y-1.5">
                <Label htmlFor="http-endpoint">HTTP Endpoint URI</Label>
                <Input
                  id="http-endpoint"
                  value={httpUri}
                  onChange={(e) => setHttpUri(e.target.value)}
                  placeholder="https://example.com/api"
                  className="font-mono text-xs"
                />
                {!httpUriValid && httpUri.length > 0 && (
                  <p className="text-xs text-destructive">
                    Endpoint URI must start with http:// or https://
                  </p>
                )}
              </div>
            )}
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={!isFormValid || isSubmitting}>
              {isSubmitting ? "Creating..." : "Create Method"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ----------------- Deploy Stage Dialog -----------------
interface DeployStageDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  restApiId: string;
}

function DeployStageDialog({
  open,
  onOpenChange,
  restApiId,
}: DeployStageDialogProps) {
  const [stageName, setStageName] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { deployApi } = useStageActions(restApiId);

  const trimmed = stageName.trim();
  const isValid = /^[a-zA-Z0-9_-]{1,128}$/.test(trimmed);
  const showError = trimmed.length > 0 && !isValid;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isValid || isSubmitting) return;

    setIsSubmitting(true);
    try {
      const stage = await deployApi(trimmed);
      if (stage) {
        setStageName("");
        onOpenChange(false);
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Deploy to Stage</DialogTitle>
            <DialogDescription>
              Create a new deployment and assign it to a stage (e.g. dev, prod).
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="stage-name">Stage name</Label>
              <Input
                id="stage-name"
                value={stageName}
                onChange={(e) => setStageName(e.target.value)}
                placeholder="dev"
                autoFocus
              />
              {showError ? (
                <p className="text-xs text-destructive">
                  Alphanumeric, hyphens, and underscores. Up to 128 characters.
                </p>
              ) : (
                <p className="text-xs text-muted-foreground">
                  e.g. dev, staging, prod.
                </p>
              )}
            </div>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={!isValid || isSubmitting}>
              {isSubmitting ? "Deploying..." : "Deploy"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ----------------- Main RestApiView -----------------
export function RestApiView({ restApiId }: RestApiViewProps) {
  const profile = useActiveProfile();
  const { closeTab } = useTabs();

  const { data: apis } = useRestApis(profile.id);
  const api = useMemo(
    () => apis?.find((a) => a.id === restApiId),
    [apis, restApiId],
  );

  const {
    data: resources,
    isPending: resourcesPending,
    error: resourcesError,
    refetch: refetchResources,
    isFetching: resourcesFetching,
  } = useResources(profile.id, restApiId);

  const {
    data: stages,
    isPending: stagesPending,
    refetch: refetchStages,
  } = useStages(profile.id, restApiId);

  const { deleteRestApi } = useRestApiActions();
  const { deleteResource } = useResourceActions(restApiId);
  const { deleteMethod } = useMethodActions(restApiId);
  const { deleteStage } = useStageActions(restApiId);

  // Selections & Dialogs
  const [selectedMethod, setSelectedMethod] =
    useState<SelectedMethod | null>(null);
  const [isCreateResourceOpen, setIsCreateResourceOpen] = useState(false);
  const [resourceForMethod, setResourceForMethod] =
    useState<RestApiResource | null>(null);
  const [isDeployOpen, setIsDeployOpen] = useState(false);
  const [isTestInvokeOpen, setIsTestInvokeOpen] = useState(false);

  // Deletion targets
  const [isDeletingApi, setIsDeletingApi] = useState(false);
  const [showDeleteApiConfirm, setShowDeleteApiConfirm] = useState(false);
  const [resourceToDelete, setResourceToDelete] =
    useState<RestApiResource | null>(null);
  const [isDeletingResource, setIsDeletingResource] = useState(false);
  const [stageToDelete, setStageToDelete] = useState<StageSummary | null>(null);
  const [isDeletingStage, setIsDeletingStage] = useState(false);
  const [methodToDelete, setMethodToDelete] = useState<SelectedMethod | null>(
    null,
  );
  const [isDeletingMethod, setIsDeletingMethod] = useState(false);

  // Query method detail for selected method
  const { data: methodDetail, isPending: methodPending } = useMethod(
    profile.id,
    restApiId,
    selectedMethod?.resourceId ?? "",
    selectedMethod?.httpMethod ?? "",
    { enabled: Boolean(selectedMethod) },
  );

  const resourceTree = useMemo(
    () => (resources ? buildResourceList(resources) : []),
    [resources],
  );

  const handleRefresh = () => {
    refetchResources();
    refetchStages();
  };

  const handleDeleteApi = async () => {
    setIsDeletingApi(true);
    try {
      const ok = await deleteRestApi(restApiId);
      if (ok) {
        closeTab(`restApi:${restApiId}`);
      }
    } finally {
      setIsDeletingApi(false);
      setShowDeleteApiConfirm(false);
    }
  };

  const handleDeleteResource = async () => {
    if (!resourceToDelete) return;
    setIsDeletingResource(true);
    try {
      const ok = await deleteResource(resourceToDelete.id);
      if (ok) {
        if (selectedMethod?.resourceId === resourceToDelete.id) {
          setSelectedMethod(null);
        }
        setResourceToDelete(null);
      }
    } finally {
      setIsDeletingResource(false);
    }
  };

  const handleDeleteMethod = async () => {
    if (!methodToDelete) return;
    setIsDeletingMethod(true);
    try {
      const ok = await deleteMethod({
        resourceId: methodToDelete.resourceId,
        httpMethod: methodToDelete.httpMethod,
      });
      if (ok) {
        if (
          selectedMethod?.resourceId === methodToDelete.resourceId &&
          selectedMethod?.httpMethod === methodToDelete.httpMethod
        ) {
          setSelectedMethod(null);
        }
        setMethodToDelete(null);
      }
    } finally {
      setIsDeletingMethod(false);
    }
  };

  const handleDeleteStage = async () => {
    if (!stageToDelete) return;
    setIsDeletingStage(true);
    try {
      const ok = await deleteStage(stageToDelete.stageName);
      if (ok) {
        setStageToDelete(null);
      }
    } finally {
      setIsDeletingStage(false);
    }
  };
  const copyToClipboard = async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success(`${label} copied to clipboard`);
    } catch {
      toast.error(`Failed to copy ${label}`);
    }
  };

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between border-b px-6 py-4">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Network className="h-5 w-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-lg font-semibold">
                {api?.name ?? restApiId}
              </h1>
              <Badge variant="outline" className="font-mono text-xs">
                {restApiId}
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground">
              REST API Resources, Methods & Stages
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handleRefresh}
            disabled={resourcesFetching}
            title="Refresh"
          >
            <RotateCw
              className={`h-4 w-4 ${resourcesFetching ? "animate-spin" : ""}`}
            />
            <span className="hidden sm:inline">Refresh</span>
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setIsCreateResourceOpen(true)}
          >
            <FolderPlus className="h-4 w-4" />
            Create resource
          </Button>
          <Button size="sm" onClick={() => setIsDeployOpen(true)}>
            <Layers className="h-4 w-4" />
            Deploy to stage
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-8 w-8" aria-label="API actions">
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem
                className="text-destructive focus:text-destructive"
                onClick={() => setShowDeleteApiConfirm(true)}
              >
                <Trash2 className="mr-2 h-4 w-4" />
                Delete API
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Main split: Resource Tree (Left) | Method Inspector (Right) */}
      <div className="flex flex-1 min-h-0 divide-x overflow-hidden">
        {/* Resource Tree */}
        <div className="flex w-1/2 flex-col overflow-y-auto">
          <div className="border-b bg-muted/40 px-4 py-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            Resources
          </div>
          {resourcesPending ? (
            <div className="flex flex-1 items-center justify-center p-8">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : resourcesError ? (
            <div className="flex flex-1 flex-col items-center justify-center gap-2 p-8 text-center">
              <CircleAlert className="h-6 w-6 text-destructive" />
              <p className="text-xs text-muted-foreground">
                Failed to load resources
              </p>
            </div>
          ) : resourceTree.length === 0 ? (
            <div className="flex flex-1 items-center justify-center p-8 text-xs text-muted-foreground">
              No resources found
            </div>
          ) : (
            <div className="divide-y">
              {resourceTree.map(({ resource, depth }) => (
                <div
                  key={resource.id}
                  className="flex items-center justify-between p-2.5 hover:bg-muted/30 transition-colors"
                  style={{ paddingLeft: `${Math.max(depth * 1.5, 0.75)}rem` }}
                  data-testid={`resource-row-${resource.path}`}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="font-mono text-xs font-medium truncate">
                      {resource.path}
                    </span>
                    <div className="flex items-center gap-1 flex-wrap">
                      {resource.methods.map((method) => {
                        const isSelected =
                          selectedMethod?.resourceId === resource.id &&
                          selectedMethod?.httpMethod === method;
                        return (
                          <Badge
                            key={method}
                            variant={methodBadgeVariant(method)}
                            className={`cursor-pointer text-[10px] px-1.5 py-0 font-mono transition-all ${
                              isSelected ? "ring-2 ring-primary" : ""
                            }`}
                            onClick={() =>
                              setSelectedMethod({
                                resourceId: resource.id,
                                httpMethod: method,
                                resourcePath: resource.path,
                              })
                            }
                          >
                            {method}
                          </Badge>
                        );
                      })}
                    </div>
                  </div>

                  <div className="flex items-center gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      title="Create method"
                      onClick={() => setResourceForMethod(resource)}
                    >
                      <Plus className="h-3.5 w-3.5" />
                    </Button>
                    {resource.path !== "/" && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-muted-foreground hover:text-destructive"
                        title="Delete resource"
                        onClick={() => setResourceToDelete(resource)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Method Inspector */}
        <div className="flex w-1/2 flex-col overflow-y-auto">
          <div className="border-b bg-muted/40 px-4 py-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            Method Details
          </div>
          {selectedMethod ? (
            <div className="p-4 space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Badge
                    variant={methodBadgeVariant(selectedMethod.httpMethod)}
                    className="font-mono text-xs"
                  >
                    {selectedMethod.httpMethod}
                  </Badge>
                  <span className="font-mono text-xs font-medium">
                    {selectedMethod.resourcePath}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setIsTestInvokeOpen(true)}
                  >
                    <Play className="mr-1.5 h-3.5 w-3.5 fill-current" />
                    Test invoke
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-destructive hover:text-destructive"
                    onClick={() => setMethodToDelete(selectedMethod)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>

              {methodPending ? (
                <div className="flex items-center justify-center p-8">
                  <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                </div>
              ) : methodDetail ? (
                <div className="rounded-lg border bg-card p-4 space-y-3 text-xs">
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <span className="text-muted-foreground">
                        Authorization:
                      </span>
                      <p className="font-medium">
                        {methodDetail.authorizationType || "NONE"}
                      </p>
                    </div>
                    <div>
                      <span className="text-muted-foreground">
                        API Key Required:
                      </span>
                      <p className="font-medium">
                        {methodDetail.apiKeyRequired ? "Yes" : "No"}
                      </p>
                    </div>
                  </div>

                  <div>
                    <span className="text-muted-foreground">
                      Integration Type:
                    </span>
                    <div className="mt-1">
                      <Badge variant="secondary" className="font-mono text-[10px]">
                        {methodDetail.integrationType || "MOCK"}
                      </Badge>
                    </div>
                  </div>

                  {methodDetail.integrationUri && (
                    <div className="space-y-1">
                      <span className="text-muted-foreground">
                        Integration URI:
                      </span>
                      <div className="flex items-center gap-2">
                        <code className="flex-1 truncate rounded bg-muted p-1.5 font-mono text-[11px]">
                          {methodDetail.integrationUri}
                        </code>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 shrink-0"
                          onClick={() =>
                            copyToClipboard(
                              methodDetail.integrationUri!,
                              "Integration URI",
                            )
                          }
                          title="Copy integration URI"
                        >
                          <Copy className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="p-4 text-xs text-muted-foreground">
                  Could not load method details.
                </div>
              )}
            </div>
          ) : (
            <div className="flex flex-1 flex-col items-center justify-center gap-2 p-8 text-center text-muted-foreground">
              <Network className="h-8 w-8 stroke-1" />
              <p className="text-xs">
                Select a method chip on a resource to inspect or test it.
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Stages Table */}
      <div className="border-t">
        <div className="border-b bg-muted/40 px-6 py-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
          Deployed Stages
        </div>
        {stagesPending ? (
          <div className="flex items-center justify-center p-4">
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          </div>
        ) : !stages || stages.length === 0 ? (
          <div className="p-4 text-center text-xs text-muted-foreground">
            No stages deployed yet. Click "Deploy to stage" above.
          </div>
        ) : (
          <div className="max-h-48 overflow-y-auto">
            <table className="w-full text-left text-xs">
              <thead className="sticky top-0 border-b bg-muted/20 text-muted-foreground">
                <tr>
                  <th className="px-6 py-2">Stage Name</th>
                  <th className="px-6 py-2">Deployment ID</th>
                  <th className="px-6 py-2">Created</th>
                  <th className="px-6 py-2">Invoke URL</th>
                  <th className="w-12 px-6 py-2 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {stages.map((stage) => {
                  const url = invokeUrl(
                    profile.endpoint,
                    restApiId,
                    stage.stageName,
                    "/",
                  );
                  return (
                    <tr key={stage.stageName} className="hover:bg-muted/30">
                      <td className="px-6 py-2.5 font-medium">
                        <Badge variant="outline" className="font-mono text-[10px]">
                          {stage.stageName}
                        </Badge>
                      </td>
                      <td className="px-6 py-2.5 font-mono text-muted-foreground">
                        {stage.deploymentId || "—"}
                      </td>
                      <td className="px-6 py-2.5 text-muted-foreground">
                        {stage.createdDate
                          ? new Date(stage.createdDate).toLocaleDateString()
                          : "—"}
                      </td>
                      <td className="px-6 py-2.5">
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-[11px] truncate max-w-xs">
                            {url}
                          </span>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6 shrink-0"
                            onClick={() => copyToClipboard(url, "Invoke URL")}
                            title="Copy invoke URL"
                          >
                            <Copy className="h-3 w-3" />
                          </Button>
                        </div>
                      </td>
                      <td className="px-6 py-2.5 text-right">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-muted-foreground hover:text-destructive"
                          onClick={() => setStageToDelete(stage)}
                          title="Delete stage"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Dialogs */}
      <CreateResourceDialog
        open={isCreateResourceOpen}
        onOpenChange={setIsCreateResourceOpen}
        restApiId={restApiId}
      />

      <CreateMethodDialog
        open={Boolean(resourceForMethod)}
        onOpenChange={(open) => !open && setResourceForMethod(null)}
        restApiId={restApiId}
        resource={resourceForMethod}
      />

      <DeployStageDialog
        open={isDeployOpen}
        onOpenChange={setIsDeployOpen}
        restApiId={restApiId}
      />

      {selectedMethod && (
        <MethodTestDialog
          open={isTestInvokeOpen}
          onOpenChange={setIsTestInvokeOpen}
          restApiId={restApiId}
          resourceId={selectedMethod.resourceId}
          httpMethod={selectedMethod.httpMethod}
          resourcePath={selectedMethod.resourcePath}
        />
      )}

      {/* Deletion confirmations */}
      <DeleteConfirmDialog
        open={showDeleteApiConfirm}
        onOpenChange={setShowDeleteApiConfirm}
        title="Delete REST API"
        description={`Are you sure you want to delete this REST API (${restApiId})? All resources and stages will be permanently deleted.`}
        confirmLabel="Delete API"
        isPending={isDeletingApi}
        onConfirm={handleDeleteApi}
      />

      <DeleteConfirmDialog
        open={Boolean(resourceToDelete)}
        onOpenChange={(open) => {
          if (!open) setResourceToDelete(null);
        }}
        title="Delete Resource"
        description={`Are you sure you want to delete resource "${resourceToDelete?.path}"?`}
        confirmLabel="Delete Resource"
        isPending={isDeletingResource}
        onConfirm={handleDeleteResource}
      />

      <DeleteConfirmDialog
        open={Boolean(methodToDelete)}
        onOpenChange={(open) => {
          if (!open) setMethodToDelete(null);
        }}
        title="Delete Method"
        description={`Are you sure you want to delete ${methodToDelete?.httpMethod} on "${methodToDelete?.resourcePath}"?`}
        confirmLabel="Delete Method"
        isPending={isDeletingMethod}
        onConfirm={handleDeleteMethod}
      />

      <DeleteConfirmDialog
        open={Boolean(stageToDelete)}
        onOpenChange={(open) => {
          if (!open) setStageToDelete(null);
        }}
        title="Delete Stage"
        description={`Are you sure you want to delete stage "${stageToDelete?.stageName}"?`}
        confirmLabel="Delete Stage"
        isPending={isDeletingStage}
        onConfirm={handleDeleteStage}
      />
    </div>
  );
}
