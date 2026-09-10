import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { APIGatewayClient } from "@aws-sdk/client-api-gateway";
import { toast } from "sonner";
import { makeClients } from "@/lib/aws";
import { useActiveProfile } from "@/store/profiles";
import {
  listRestApis,
  createRestApi,
  deleteRestApi,
  listResources,
  createResource,
  deleteResource,
  getMethod,
  putMethod,
  deleteMethod,
  listStages,
  deployApi,
  deleteStage,
  testInvokeMethod,
  type RestApiSummary,
  type RestApiResource,
  type StageSummary,
  type MethodIntegration,
} from "@/lib/apigateway";

function toErrorMessage(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

export const apigatewayKeys = {
  restApis: (profileId: string, region?: string) =>
    region
      ? (["apigateway", "restApis", profileId, region] as const)
      : (["apigateway", "restApis", profileId] as const),
  resources: (profileId: string, restApiId: string, region?: string) =>
    region
      ? (["apigateway", "resources", profileId, restApiId, region] as const)
      : (["apigateway", "resources", profileId, restApiId] as const),
  method: (
    profileId: string,
    restApiId: string,
    resourceId: string,
    httpMethod: string,
    region?: string,
  ) =>
    region
      ? ([
          "apigateway",
          "method",
          profileId,
          restApiId,
          resourceId,
          httpMethod,
          region,
        ] as const)
      : ([
          "apigateway",
          "method",
          profileId,
          restApiId,
          resourceId,
          httpMethod,
        ] as const),
  stages: (profileId: string, restApiId: string, region?: string) =>
    region
      ? (["apigateway", "stages", profileId, restApiId, region] as const)
      : (["apigateway", "stages", profileId, restApiId] as const),
};

export function useApiGatewayClient(): APIGatewayClient {
  const profile = useActiveProfile();
  return useMemo(
    () => makeClients(profile).apigateway,
    [profile.id, profile.endpoint, profile.region, profile.authToken],
  );
}

export function useRestApis(
  profileId: string,
  options?: { enabled?: boolean },
) {
  const client = useApiGatewayClient();
  const profile = useActiveProfile();
  return useQuery({
    queryKey: apigatewayKeys.restApis(profileId, profile.region),
    queryFn: () => listRestApis(client),
    staleTime: 5_000,
    refetchInterval: 10_000,
    enabled: options?.enabled,
  });
}

export function useResources(
  profileId: string,
  restApiId: string,
  options?: { enabled?: boolean },
) {
  const client = useApiGatewayClient();
  const profile = useActiveProfile();
  return useQuery({
    queryKey: apigatewayKeys.resources(profileId, restApiId, profile.region),
    queryFn: () => listResources(client, restApiId),
    staleTime: 5_000,
    refetchInterval: 10_000,
    enabled: Boolean(restApiId) && options?.enabled !== false,
  });
}

export function useMethod(
  profileId: string,
  restApiId: string,
  resourceId: string,
  httpMethod: string,
  options?: { enabled?: boolean },
) {
  const client = useApiGatewayClient();
  const profile = useActiveProfile();
  return useQuery({
    queryKey: apigatewayKeys.method(
      profileId,
      restApiId,
      resourceId,
      httpMethod,
      profile.region,
    ),
    queryFn: () => getMethod(client, { restApiId, resourceId, httpMethod }),
    staleTime: 5_000,
    enabled:
      Boolean(restApiId && resourceId && httpMethod) &&
      options?.enabled !== false,
  });
}

export function useStages(
  profileId: string,
  restApiId: string,
  options?: { enabled?: boolean },
) {
  const client = useApiGatewayClient();
  const profile = useActiveProfile();
  return useQuery({
    queryKey: apigatewayKeys.stages(profileId, restApiId, profile.region),
    queryFn: () => listStages(client, restApiId),
    staleTime: 5_000,
    refetchInterval: 10_000,
    enabled: Boolean(restApiId) && options?.enabled !== false,
  });
}

export function useRestApiActions() {
  const client = useApiGatewayClient();
  const queryClient = useQueryClient();
  const profile = useActiveProfile();

  const invalidateRestApis = () => {
    queryClient.invalidateQueries({
      queryKey: ["apigateway", "restApis", profile.id],
    });
  };

  const createApiAction = async (
    name: string,
  ): Promise<RestApiSummary | null> => {
    try {
      const summary = await createRestApi(client, name);
      toast.success("REST API created");
      invalidateRestApis();
      return summary;
    } catch (e) {
      toast.error(`Failed to create REST API: ${toErrorMessage(e)}`);
      return null;
    }
  };

  const deleteApiAction = async (restApiId: string): Promise<boolean> => {
    try {
      await deleteRestApi(client, restApiId);
      toast.success("REST API deleted");
      invalidateRestApis();
      queryClient.invalidateQueries({
        queryKey: ["apigateway", "resources", profile.id, restApiId],
      });
      queryClient.invalidateQueries({
        queryKey: ["apigateway", "stages", profile.id, restApiId],
      });
      return true;
    } catch (e) {
      toast.error(`Failed to delete REST API: ${toErrorMessage(e)}`);
      return false;
    }
  };

  return {
    createRestApi: createApiAction,
    deleteRestApi: deleteApiAction,
  };
}

export function useResourceActions(restApiId: string) {
  const client = useApiGatewayClient();
  const queryClient = useQueryClient();
  const profile = useActiveProfile();

  const invalidateResources = () => {
    queryClient.invalidateQueries({
      queryKey: ["apigateway", "resources", profile.id, restApiId],
    });
  };

  const createResourceAction = async (
    pathPart: string,
  ): Promise<RestApiResource | null> => {
    try {
      const res = await createResource(client, { restApiId, pathPart });
      toast.success("Resource created");
      invalidateResources();
      return res;
    } catch (e) {
      toast.error(`Failed to create resource: ${toErrorMessage(e)}`);
      return null;
    }
  };

  const deleteResourceAction = async (
    resourceId: string,
  ): Promise<boolean> => {
    try {
      await deleteResource(client, { restApiId, resourceId });
      toast.success("Resource deleted");
      invalidateResources();
      return true;
    } catch (e) {
      toast.error(`Failed to delete resource: ${toErrorMessage(e)}`);
      return false;
    }
  };

  return {
    createResource: createResourceAction,
    deleteResource: deleteResourceAction,
  };
}

export function useMethodActions(restApiId: string) {
  const client = useApiGatewayClient();
  const queryClient = useQueryClient();
  const profile = useActiveProfile();

  const putMethodAction = async (params: {
    resourceId: string;
    httpMethod: string;
    integration: MethodIntegration;
    region?: string;
  }): Promise<boolean> => {
    try {
      await putMethod(client, {
        restApiId,
        resourceId: params.resourceId,
        httpMethod: params.httpMethod,
        integration: params.integration,
        region: params.region ?? profile.region,
      });
      toast.success("Method created");
      queryClient.invalidateQueries({
        queryKey: ["apigateway", "resources", profile.id, restApiId],
      });
      queryClient.invalidateQueries({
        queryKey: [
          "apigateway",
          "method",
          profile.id,
          restApiId,
          params.resourceId,
          params.httpMethod,
        ],
      });
      return true;
    } catch (e) {
      toast.error(`Failed to create method: ${toErrorMessage(e)}`);
      return false;
    }
  };

  const deleteMethodAction = async (params: {
    resourceId: string;
    httpMethod: string;
  }): Promise<boolean> => {
    try {
      await deleteMethod(client, {
        restApiId,
        resourceId: params.resourceId,
        httpMethod: params.httpMethod,
      });
      toast.success("Method deleted");
      queryClient.invalidateQueries({
        queryKey: ["apigateway", "resources", profile.id, restApiId],
      });
      queryClient.invalidateQueries({
        queryKey: [
          "apigateway",
          "method",
          profile.id,
          restApiId,
          params.resourceId,
          params.httpMethod,
        ],
      });
      return true;
    } catch (e) {
      toast.error(`Failed to delete method: ${toErrorMessage(e)}`);
      return false;
    }
  };

  return {
    putMethod: putMethodAction,
    deleteMethod: deleteMethodAction,
  };
}

export function useStageActions(restApiId: string) {
  const client = useApiGatewayClient();
  const queryClient = useQueryClient();
  const profile = useActiveProfile();

  const invalidateStages = () => {
    queryClient.invalidateQueries({
      queryKey: ["apigateway", "stages", profile.id, restApiId],
    });
  };

  const deployApiAction = async (
    stageName: string,
  ): Promise<StageSummary | null> => {
    try {
      const stage = await deployApi(client, { restApiId, stageName });
      toast.success(`Deployed to stage ${stageName}`);
      invalidateStages();
      return stage;
    } catch (e) {
      toast.error(`Failed to deploy stage: ${toErrorMessage(e)}`);
      return null;
    }
  };

  const deleteStageAction = async (stageName: string): Promise<boolean> => {
    try {
      await deleteStage(client, { restApiId, stageName });
      toast.success("Stage deleted");
      invalidateStages();
      return true;
    } catch (e) {
      toast.error(`Failed to delete stage: ${toErrorMessage(e)}`);
      return false;
    }
  };

  return {
    deployApi: deployApiAction,
    deleteStage: deleteStageAction,
  };
}

export function useTestInvoke(restApiId: string) {
  const client = useApiGatewayClient();
  const [isInvoking, setIsInvoking] = useState(false);

  const testInvoke = async (params: {
    resourceId: string;
    httpMethod: string;
    path: string;
    queryString?: string;
    headers?: Record<string, string>;
    body?: string;
  }): Promise<{
    status?: number;
    headers?: Record<string, string>;
    body?: string;
    log?: string;
    latency?: number;
  } | null> => {
    setIsInvoking(true);
    try {
      const res = await testInvokeMethod(client, { restApiId, ...params });
      return res;
    } catch (e) {
      toast.error(`Failed to invoke method: ${toErrorMessage(e)}`);
      return null;
    } finally {
      setIsInvoking(false);
    }
  };

  return {
    testInvoke,
    isInvoking,
  };
}
