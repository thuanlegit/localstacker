import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ConnectionDialog } from "@/components/ConnectionDialog";
import { DeleteConfirmDialog } from "@/components/DeleteConfirmDialog";
import { useActiveProfile, useProfiles } from "@/store/profiles";
import type { ConnectionProfile } from "@/types";

function toErrorMessage(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

export function ConnectionsSection() {
  const profiles = useProfiles((s) => s.profiles);
  const activeProfile = useActiveProfile();
  const setActiveProfile = useProfiles((s) => s.setActiveProfile);
  const removeProfile = useProfiles((s) => s.removeProfile);
  const queryClient = useQueryClient();

  const [editingProfile, setEditingProfile] = useState<ConnectionProfile | undefined>();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [removingProfile, setRemovingProfile] = useState<ConnectionProfile | undefined>();

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold">Connections</h2>
          <p className="text-sm text-muted-foreground">Manage LocalStack endpoints.</p>
        </div>
        <Button
          onClick={() => {
            setEditingProfile(undefined);
            setIsDialogOpen(true);
          }}
        >
          Add connection
        </Button>
      </div>

      <div className="space-y-3">
        {profiles.map((profile) => {
          const isActive = profile.id === activeProfile.id;
          return (
            <div
              key={profile.id}
              className="flex items-center justify-between gap-4 rounded-lg border border-border p-3"
            >
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium">{profile.name}</span>
                  {isActive && (
                    <span className="text-xs text-primary font-medium">Active</span>
                  )}
                  {profile.builtIn && (
                    <span className="text-xs text-muted-foreground">Built-in</span>
                  )}
                </div>
                <div className="font-mono text-xs text-muted-foreground">
                  {profile.endpoint} · {profile.region}
                </div>
              </div>

              <div className="flex items-center gap-1">
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={isActive}
                  onClick={async () => {
                    setActiveProfile(profile.id);
                    await queryClient.invalidateQueries();
                  }}
                >
                  Use
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setEditingProfile(profile);
                    setIsDialogOpen(true);
                  }}
                >
                  Edit…
                </Button>
                {!profile.builtIn && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-destructive hover:text-destructive"
                    onClick={() => setRemovingProfile(profile)}
                  >
                    Remove
                  </Button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <ConnectionDialog
        open={isDialogOpen}
        onOpenChange={setIsDialogOpen}
        profile={editingProfile}
      />

      <DeleteConfirmDialog
        open={!!removingProfile}
        onOpenChange={(open) => {
          if (!open) setRemovingProfile(undefined);
        }}
        title="Remove connection?"
        description={`Removes connection "${removingProfile?.name ?? ""}" from LocalStacker.`}
        confirmLabel="Remove"
        onConfirm={() => {
          if (!removingProfile) return;
          try {
            removeProfile(removingProfile.id);
            toast.success(`Connection ${removingProfile.name} removed`);
          } catch (err) {
            toast.error(toErrorMessage(err));
          } finally {
            setRemovingProfile(undefined);
          }
        }}
      />
    </div>
  );
}
