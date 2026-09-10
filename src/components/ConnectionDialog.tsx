import { useState, useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { AWS_REGIONS } from "@/lib/regions";
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
  const queryClient = useQueryClient();

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
  const isRegionValid = region.length > 0;
  const showEndpointError =
    endpoint.length > 0 && !ENDPOINT_REGEX.test(trimmedEndpoint);
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
        await queryClient.invalidateQueries();
        toast.success(`Connection ${trimmedName} saved`);
      } else {
        const added = addProfile({
          name: trimmedName,
          endpoint: trimmedEndpoint,
          region: trimmedRegion,
          authToken: trimmedAuthToken || undefined,
        });
        setActiveProfile(added.id);
        await queryClient.invalidateQueries();
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
        <form onSubmit={handleSubmit} className="min-w-0">
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

          <div className="space-y-4 py-4 min-w-0">
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
              <Select value={region} onValueChange={setRegion}>
                <SelectTrigger id="conn-region" aria-label="Region">
                  <SelectValue placeholder="Select region" />
                </SelectTrigger>
                <SelectContent>
                  {!AWS_REGIONS.some((r) => r.value === region) && region && (
                    <SelectItem value={region}>{region}</SelectItem>
                  )}
                  {AWS_REGIONS.map((r) => (
                    <SelectItem key={r.value} value={r.value}>
                      {r.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
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
