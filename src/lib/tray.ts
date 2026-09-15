export type TrayStatus = "up" | "down" | "unknown";

export interface TrayUpdate {
  status: TrayStatus;
  label: string;
}

export function trayUpdateFor(
  health: "up" | "down" | undefined,
  connectionConfigured: boolean,
): TrayUpdate {
  if (!connectionConfigured) return { status: "unknown", label: "No connection configured" };
  if (health === "up") return { status: "up", label: "LocalStack: Running" };
  if (health === "down") return { status: "down", label: "LocalStack: Stopped" };
  return { status: "unknown", label: "Checking LocalStack…" };
}
