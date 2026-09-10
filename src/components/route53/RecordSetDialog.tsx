import { useState, useEffect } from "react";
import { AlertCircle, Loader2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import { useRecordSetActions } from "@/hooks/use-route53";
import {
  validateRecordValue,
  type ResourceRecordSetSummary,
} from "@/lib/route53";

const RECORD_TYPES = [
  "A",
  "AAAA",
  "CNAME",
  "TXT",
  "MX",
  "NS",
  "SOA",
  "SRV",
  "PTR",
  "CAA",
];

interface RecordSetDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  zoneId: string;
  zoneName: string;
  initialRecord?: ResourceRecordSetSummary;
  onSaved?: () => void;
}

export function RecordSetDialog({
  open,
  onOpenChange,
  zoneId,
  zoneName,
  initialRecord,
  onSaved,
}: RecordSetDialogProps) {
  const isEditing = Boolean(initialRecord);

  const [recordName, setRecordName] = useState("");
  const [recordType, setRecordType] = useState("A");
  const [ttl, setTtl] = useState(300);
  const [valuesText, setValuesText] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const { createRecordSet, updateRecordSet } = useRecordSetActions(zoneId);

  useEffect(() => {
    if (open) {
      if (initialRecord) {
        setRecordName(initialRecord.name);
        setRecordType(initialRecord.type);
        setTtl(initialRecord.ttl ?? 300);
        setValuesText(initialRecord.values.join("\n"));
      } else {
        setRecordName("");
        setRecordType("A");
        setTtl(300);
        setValuesText("");
      }
      setIsSubmitting(false);
    }
  }, [open, initialRecord]);

  // Compute full domain name
  const normalizedZone = zoneName.endsWith(".") ? zoneName : `${zoneName}.`;
  let fullName = recordName.trim();
  if (!isEditing) {
    if (!fullName) {
      fullName = normalizedZone;
    } else if (!fullName.endsWith(".")) {
      if (fullName.endsWith(zoneName)) {
        fullName = `${fullName}.`;
      } else {
        fullName = `${fullName}.${normalizedZone}`;
      }
    }
  }

  // Validate values
  const lines = valuesText
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);

  let valueError: string | null = null;
  if (lines.length === 0) {
    valueError = "At least one routing value is required";
  } else {
    for (const line of lines) {
      const err = validateRecordValue(recordType, line);
      if (err) {
        valueError = err;
        break;
      }
    }
  }

  const ttlError = isNaN(ttl) || ttl < 0 ? "TTL must be a non-negative integer" : null;
  const isValid = !valueError && !ttlError && Boolean(fullName);

  const handleSave = async () => {
    if (!isValid || isSubmitting) return;

    setIsSubmitting(true);
    try {
      const payload = {
        name: fullName,
        type: recordType,
        ttl,
        values: lines,
      };

      const ok = isEditing
        ? await updateRecordSet(payload)
        : await createRecordSet(payload);

      if (ok) {
        onSaved?.();
        onOpenChange(false);
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[520px]">
        <DialogHeader>
          <DialogTitle>
            {isEditing ? `Edit Record Set: ${initialRecord?.name}` : "Create Record Set"}
          </DialogTitle>
          <DialogDescription>
            Configure routing destination and TTL for this resource record.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Record Name */}
          <div className="space-y-1.5">
            <Label htmlFor="record-name">Record Name</Label>
            {isEditing ? (
              <Input
                id="record-name"
                value={recordName}
                disabled
                className="font-mono text-xs"
              />
            ) : (
              <div className="flex items-center gap-1.5">
                <Input
                  id="record-name"
                  placeholder="e.g. api (leave blank for apex)"
                  value={recordName}
                  onChange={(e) => setRecordName(e.target.value)}
                  disabled={isSubmitting}
                  className="font-mono text-xs"
                />
                <span className="text-xs text-muted-foreground font-mono shrink-0">
                  .{normalizedZone}
                </span>
              </div>
            )}
            <p className="text-[11px] text-muted-foreground font-mono">
              Result: {fullName || normalizedZone}
            </p>
          </div>

          <div className="grid grid-cols-2 gap-4">
            {/* Type */}
            <div className="space-y-1.5">
              <Label htmlFor="record-type">Record Type</Label>
              <Select
                value={recordType}
                onValueChange={setRecordType}
                disabled={isEditing || isSubmitting}
              >
                <SelectTrigger id="record-type" className="text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {RECORD_TYPES.map((t) => (
                    <SelectItem key={t} value={t} className="text-xs">
                      {t}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* TTL */}
            <div className="space-y-1.5">
              <Label htmlFor="record-ttl">TTL (Seconds)</Label>
              <Input
                id="record-ttl"
                type="number"
                min={0}
                value={ttl}
                onChange={(e) => setTtl(parseInt(e.target.value, 10))}
                disabled={isSubmitting}
                className="text-xs font-mono"
              />
              {ttlError && (
                <p className="text-xs text-destructive">{ttlError}</p>
              )}
            </div>
          </div>

          {/* Value / Routing target */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label htmlFor="record-values">Routing Values (one per line)</Label>
              {valueError && (
                <span className="flex items-center gap-1 text-xs text-destructive">
                  <AlertCircle className="h-3 w-3" />
                  {valueError}
                </span>
              )}
            </div>
            <textarea
              id="record-values"
              placeholder={
                recordType === "A"
                  ? "192.0.2.1\n192.0.2.2"
                  : recordType === "CNAME"
                    ? "target.example.com"
                    : recordType === "MX"
                      ? "10 mail.example.com"
                      : "Enter routing value"
              }
              value={valuesText}
              onChange={(e) => setValuesText(e.target.value)}
              disabled={isSubmitting}
              rows={4}
              className="flex min-h-[100px] w-full rounded-md border border-input bg-background px-3 py-2 text-xs font-mono ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
              spellCheck={false}
            />
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
          <Button
            type="button"
            onClick={handleSave}
            disabled={!isValid || isSubmitting}
          >
            {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {isEditing ? "Update Record" : "Create Record"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
