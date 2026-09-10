import { useMemo, useState } from "react";
import { useQuery, useInfiniteQuery, useQueryClient } from "@tanstack/react-query";
import type { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import type { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";
import { toast } from "sonner";
import { makeClients } from "@/lib/aws";
import { useActiveProfile } from "@/store/profiles";
import { useTabs } from "@/store/tabs";
import {
  listTables,
  describeTable,
  createTable,
  deleteTable,
  scanItems,
  queryItems,
  putItem,
  deleteItem,
  clearTable,
  buildKeyCondition,
  type KeyConditionInput,
  type CreateTableInput,
} from "@/lib/dynamodb";

function toErrorMessage(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

export const dynamodbKeys = {
  tables: (profileId: string, region?: string) =>
    region
      ? (["dynamodb", "tables", profileId, region] as const)
      : (["dynamodb", "tables", profileId] as const),
  table: (profileId: string, name: string, region?: string) =>
    region
      ? (["dynamodb", "table", profileId, name, region] as const)
      : (["dynamodb", "table", profileId, name] as const),
  items: (
    profileId: string,
    name: string,
    mode: "scan" | "query",
    queryInput?: KeyConditionInput,
  ) => ["dynamodb", "items", profileId, name, mode, queryInput] as const,
};

export function useDynamoClient(): DynamoDBClient {
  const profile = useActiveProfile();
  return useMemo(
    () => makeClients(profile).dynamodb,
    [profile.id, profile.endpoint, profile.region, profile.authToken],
  );
}

export function useDynamoDocClient(): DynamoDBDocumentClient {
  const profile = useActiveProfile();
  return useMemo(
    () => makeClients(profile).dynamodbDoc,
    [profile.id, profile.endpoint, profile.region, profile.authToken],
  );
}

export function useTables(profileId: string, options?: { enabled?: boolean }) {
  const client = useDynamoClient();
  const profile = useActiveProfile();
  return useQuery({
    queryKey: dynamodbKeys.tables(profileId, profile.region),
    queryFn: () => listTables(client),
    staleTime: 5_000,
    refetchInterval: 10_000,
    enabled: options?.enabled,
  });
}

export function useTable(
  profileId: string,
  name: string,
  options?: { enabled?: boolean },
) {
  const client = useDynamoClient();
  const profile = useActiveProfile();
  return useQuery({
    queryKey: dynamodbKeys.table(profileId, name, profile.region),
    queryFn: () => describeTable(client, name),
    staleTime: 5_000,
    enabled: Boolean(name) && options?.enabled !== false,
  });
}

export function useTableItems(
  tableName: string,
  attributeTypes?: Record<string, "S" | "N" | "B">,
) {
  const [mode, setMode] = useState<"scan" | "query">("scan");
  const [queryInput, setQueryInput] = useState<KeyConditionInput | undefined>(
    undefined,
  );
  const doc = useDynamoDocClient();
  const profile = useActiveProfile();

  const isQueryReady =
    mode === "query" &&
    Boolean(
      queryInput &&
        queryInput.partitionKeyName &&
        queryInput.partitionValue.trim().length > 0,
    );

  const query = useInfiniteQuery({
    queryKey: dynamodbKeys.items(
      profile.id,
      tableName,
      mode,
      mode === "query" ? queryInput : undefined,
    ),
    queryFn: async ({ pageParam }) => {
      const exclusiveStartKey = pageParam as Record<string, unknown> | undefined;
      if (mode === "query") {
        if (!queryInput) {
          return { items: [], lastEvaluatedKey: undefined };
        }
        const keyCondition = buildKeyCondition(queryInput, attributeTypes ?? {});
        return queryItems(doc, {
          tableName,
          keyCondition,
          indexName: queryInput.indexName,
          exclusiveStartKey,
        });
      }
      return scanItems(doc, {
        tableName,
        exclusiveStartKey,
      });
    },
    initialPageParam: undefined as Record<string, unknown> | undefined,
    getNextPageParam: (lastPage) => lastPage.lastEvaluatedKey ?? undefined,
    staleTime: 5_000,
    enabled: mode === "scan" ? Boolean(tableName) : isQueryReady,
  });

  const items = useMemo(
    () => query.data?.pages.flatMap((page) => page.items) ?? [],
    [query.data],
  );

  return {
    items,
    mode,
    setMode,
    queryInput,
    setQueryInput,
    loadMore: query.fetchNextPage,
    hasNextPage: query.hasNextPage,
    isFetchingNextPage: query.isFetchingNextPage,
    isPending: query.isPending,
    isError: query.isError,
    error: query.error,
    refetch: query.refetch,
  };
}

export function useItemActions(tableName: string) {
  const doc = useDynamoDocClient();
  const queryClient = useQueryClient();
  const profile = useActiveProfile();

  const invalidate = () => {
    queryClient.invalidateQueries({
      queryKey: ["dynamodb", "items", profile.id, tableName],
    });
    queryClient.invalidateQueries({
      queryKey: dynamodbKeys.table(profile.id, tableName, profile.region),
    });
  };

  const putItemAction = async (
    item: Record<string, unknown>,
  ): Promise<boolean> => {
    try {
      await putItem(doc, { tableName, item });
      toast.success("Item saved");
      invalidate();
      return true;
    } catch (e) {
      toast.error(`Failed to save item: ${toErrorMessage(e)}`);
      return false;
    }
  };

  const deleteItemAction = async (
    key: Record<string, unknown>,
  ): Promise<boolean> => {
    try {
      await deleteItem(doc, { tableName, key });
      toast.success("Item deleted");
      invalidate();
      return true;
    } catch (e) {
      toast.error(`Failed to delete item: ${toErrorMessage(e)}`);
      return false;
    }
  };

  const clearTableAction = async (keyNames: string[]): Promise<boolean> => {
    try {
      const { deleted } = await clearTable(doc, { tableName, keyNames });
      toast.success(`Cleared ${deleted} item${deleted === 1 ? "" : "s"}`);
      invalidate();
      return true;
    } catch (e) {
      toast.error(`Failed to clear table: ${toErrorMessage(e)}`);
      return false;
    }
  };

  return {
    putItem: putItemAction,
    deleteItem: deleteItemAction,
    clearTable: clearTableAction,
  };
}

export function useTableActions() {
  const client = useDynamoClient();
  const queryClient = useQueryClient();
  const profile = useActiveProfile();

  const createTableAction = async (
    input: CreateTableInput,
  ): Promise<{ arn?: string } | null> => {
    try {
      const res = await createTable(client, input);
      toast.success(`Table "${input.name.trim()}" created`);
      queryClient.invalidateQueries({
        queryKey: dynamodbKeys.tables(profile.id, profile.region),
      });
      return res;
    } catch (e) {
      toast.error(`Failed to create table: ${toErrorMessage(e)}`);
      return null;
    }
  };

  const deleteTableAction = async (tableName: string): Promise<boolean> => {
    try {
      await deleteTable(client, tableName);
      toast.success(`Table "${tableName}" deleted`);
      queryClient.invalidateQueries({
        queryKey: dynamodbKeys.tables(profile.id, profile.region),
      });
      queryClient.removeQueries({
        queryKey: dynamodbKeys.table(profile.id, tableName, profile.region),
      });
      useTabs.getState().closeTab(`table:${tableName}`);
      return true;
    } catch (e) {
      toast.error(`Failed to delete table: ${toErrorMessage(e)}`);
      return false;
    }
  };

  return {
    createTable: createTableAction,
    deleteTable: deleteTableAction,
  };
}
