export interface HealthService {
  name: string;
  status: string;
}

export interface HealthUp {
  status: "up";
  version?: string;
  edition?: string;
  services: HealthService[];
}

export interface HealthDown {
  status: "down";
  reason: string;
}

export type HealthInfo = HealthUp | HealthDown;

export interface CheckHealthOptions {
  endpoint: string;
  authToken?: string;
  fetchFn?: typeof fetch;
  signal?: AbortSignal;
}

function normalizeServices(raw: unknown): HealthService[] {
  if (Array.isArray(raw)) {
    return raw
      .map((entry): HealthService | null => {
        if (entry && typeof entry === "object") {
          const record = entry as Record<string, unknown>;
          if (typeof record.name === "string") {
            return { name: record.name, status: String(record.status ?? "unknown") };
          }
        }
        return null;
      })
      .filter((s): s is HealthService => s !== null);
  }
  if (raw && typeof raw === "object") {
    return Object.entries(raw as Record<string, unknown>).map(([name, status]) => ({
      name,
      status: String(status ?? "unknown"),
    }));
  }
  return [];
}

/**
 * Poll LocalStack's edge health endpoint.
 * Tolerates both the legacy map shape and the newer array shape of `services`.
 */
export async function checkHealth(options: CheckHealthOptions): Promise<HealthInfo> {
  const { endpoint, authToken, signal } = options;
  const fetchFn = options.fetchFn ?? fetch;
  const url = `${endpoint.replace(/\/+$/, "")}/_localstack/health`;
  const headers: Record<string, string> = { accept: "application/json" };
  if (authToken) headers.authorization = authToken;

  try {
    const response = await fetchFn(url, { headers, signal });
    if (!response.ok) {
      return { status: "down", reason: `health endpoint returned ${response.status}` };
    }
    const body = (await response.json()) as Record<string, unknown>;
    return {
      status: "up",
      version: typeof body.version === "string" ? body.version : undefined,
      edition: typeof body.edition === "string" ? body.edition : undefined,
      services: normalizeServices(body.services),
    };
  } catch (error) {
    return {
      status: "down",
      reason: error instanceof Error ? error.message : "network error",
    };
  }
}
