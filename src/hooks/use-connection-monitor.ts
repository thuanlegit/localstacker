import { useEffect, useRef } from "react";
import { toast } from "sonner";
import { useHealth } from "@/hooks/use-health";
import { useOnboarding } from "@/store/onboarding";

export function useConnectionMonitor(): void {
  const { data } = useHealth();
  const isOnboarded = useOnboarding((s) => s.completedAt !== null);
  const prevStatus = useRef<"up" | "down" | undefined>(undefined);

  useEffect(() => {
    if (!isOnboarded || !data) return;

    const currentStatus = data.status;
    const previous = prevStatus.current;

    if (previous !== undefined && previous !== currentStatus) {
      if (currentStatus === "down" && previous === "up") {
        toast.error("LocalStack stopped or container removed", {
          id: "localstack-connection-status",
          description: "Connection lost. LocalStacker will reconnect automatically when LocalStack starts.",
          duration: 5000,
        });
      } else if (currentStatus === "up" && previous === "down") {
        toast.success("LocalStack connected", {
          id: "localstack-connection-status",
          description: "LocalStack is running and responsive.",
          duration: 3000,
        });
      }
    }

    prevStatus.current = currentStatus;
  }, [data, isOnboarded]);
}
