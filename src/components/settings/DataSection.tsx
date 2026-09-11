import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { DeleteConfirmDialog } from "@/components/DeleteConfirmDialog";

export function DataSection() {
  const queryClient = useQueryClient();
  const [isResetConfirmOpen, setIsResetConfirmOpen] = useState(false);

  const handleClearCache = async () => {
    queryClient.clear();
    toast.success("Cached data cleared");
  };

  const handleResetAppData = () => {
    Object.keys(localStorage)
      .filter((k) => k.startsWith("localstacker."))
      .forEach((k) => localStorage.removeItem(k));
    queryClient.clear();
    window.location.reload();
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold">Data</h2>
        <p className="text-sm text-muted-foreground">
          Cached AWS responses and local app state.
        </p>
      </div>

      <div className="space-y-4">
        <div className="flex items-center justify-between gap-4 rounded-lg border border-border p-4">
          <div className="space-y-0.5">
            <div className="text-sm font-medium">Clear cached data</div>
            <p className="text-xs text-muted-foreground">
              Refreshes all service data on next use.
            </p>
          </div>
          <Button variant="outline" onClick={handleClearCache}>
            Clear
          </Button>
        </div>

        <div className="flex items-center justify-between gap-4 rounded-lg border border-border p-4">
          <div className="space-y-0.5">
            <div className="text-sm font-medium">Reset app data</div>
            <p className="text-xs text-muted-foreground">
              Removes all connections, preferences, and settings, then reloads.
            </p>
          </div>
          <Button
            variant="destructive"
            onClick={() => setIsResetConfirmOpen(true)}
          >
            Reset…
          </Button>
        </div>
      </div>

      <DeleteConfirmDialog
        open={isResetConfirmOpen}
        onOpenChange={setIsResetConfirmOpen}
        title="Reset app data?"
        description="Everything — connections, theme, preferences — returns to defaults. This cannot be undone."
        confirmLabel="Reset"
        onConfirm={handleResetAppData}
      />
    </div>
  );
}
