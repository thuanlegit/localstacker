import { useState, useEffect } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useProfiles } from "@/store/profiles";
import type { ConnectionProfile } from "@/types";

const ENDPOINT_REGEX = /^https?:\/\//;
const REGION_REGEX = /^[a-z]{2}(-[a-z]+)+-\d$/;

function toErrorMessage(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

interface ConnectionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  profile?: ConnectionProfile;
}

export function ConnectionDialog({
  open,
  onOpenChange,
  profile,
}: ConnectionDialogProps) {
  const [name, setName] = useState("");
  const [endpoint, setEndpoint] = useState("http://localhost:4566");
  const [region, setRegion] = useState("us-east-1");
  const [authToken, setAuthToken] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const addProfile = useProfiles((s) => s.addProfile);
  const updateProfile = useProfiles((s) => s.updateProfile);
  const setActiveProfile = useProfiles((s) => s.setActiveProfile);

  const isEdit = !!profile;

  useEffect(() => {
    if (open) {
      if (profile) {
        setName(profile.name);
        setEndpoint(profile.endpoint);
        setRegion(profile.region);
        setAuthToken(profile.authToken ?? "");
      } else {
        setName("");
        setEndpoint("http://localhost:4566");
        setRegion("us-east-1");
        setAuthToken("");
      }
    }
  }, [open, profile]);

  const trimmedName = name.trim();
  const trimmedEndpoint = endpoint.trim();
  const trimmedRegion = region.trim();
  const trimmedAuthToken = authToken.trim();

  const isNameValid = trimmedName.length > 0;
  const isEndpointValid = ENDPOINT_REGEX.test(trimmedEndpoint);
  const isRegionValid = REGION_REGEX.test(trimmedRegion);

  const showEndpointError =
    endpoint.length > 0 && !ENDPOINT_REGEX.test(trimmedEndpoint);
  const showRegionError =
    region.length > 0 && !REGION_REGEX.test(trimmedRegion);

  const canSubmit =
    isNameValid && isEndpointValid && isRegionValid && !isSubmitting;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;

    setIsSubmitting(true);
    try {
      if (isEdit) {
        updateProfile(profile.id, {
          name: trimmedName,
          endpoint: trimmedEndpoint,
          region: trimmedRegion,
          authToken: trimmedAuthToken || undefined,
        });
        toast.success(`Connection ${trimmedName} saved`);
      } else {
        const added = addProfile({
          name: trimmedName,
          endpoint: trimmedEndpoint,
          region: trimmedRegion,
          authToken: trimmedAuthToken || undefined,
        });
        setActiveProfile(added.id);
        toast.success(`Connection ${trimmedName} saved`);
      }
      onOpenChange(false);
    } catch (err) {
      toast.error(toErrorMessage(err));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>
              {isEdit ? "Edit connection" : "New connection"}
            </DialogTitle>
            <DialogDescription>
              {isEdit
                ? `Update connection settings for “${profile.name}”.`
                : "Add a new LocalStack instance or profile."}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="conn-name">Name</Label>
              <Input
                id="conn-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="LocalStack Local"
                autoFocus
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="conn-endpoint">Endpoint URL</Label>
              <Input
                id="conn-endpoint"
                value={endpoint}
                onChange={(e) => setEndpoint(e.target.value)}
                placeholder="http://localhost:4566"
              />
              {showEndpointError && (
                <p className="text-xs text-destructive">
                  Endpoint must start with http:// or https://
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="conn-region">Region</Label>
              <Input
                id="conn-region"
                value={region}
                onChange={(e) => setRegion(e.target.value)}
                placeholder="us-east-1"
              />
              {showRegionError && (
                <p className="text-xs text-destructive">
                  Region must follow standard format (e.g. us-east-1)
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="conn-auth-token">Auth token (optional)</Label>
              <Input
                id="conn-auth-token"
                type="password"
                value={authToken}
                onChange={(e) => setAuthToken(e.target.value)}
                placeholder="ls-..."
              />
              <p className="text-xs text-muted-foreground">
                Required for Secrets Manager on Hobby+ LocalStack tiers. Sent
                as the Authorization header.
              </p>
            </div>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={!canSubmit}>
              Save connection
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
