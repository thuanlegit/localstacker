import { useState, useMemo } from "react";
import { Loader2, Send } from "lucide-react";
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useActiveProfile } from "@/store/profiles";
import { useIdentities, useSendEmail } from "@/hooks/use-ses";

interface SendEmailDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultSource?: string;
}

export function SendEmailDialog({
  open,
  onOpenChange,
  defaultSource,
}: SendEmailDialogProps) {
  const profile = useActiveProfile();
  const { data: identities } = useIdentities(profile.id);
  const { sendEmail } = useSendEmail();

  const verifiedIdentities = useMemo(() => {
    return (identities ?? []).filter((i) => {
      const status = (i.status ?? "").toLowerCase();
      return (
        i.type === "EmailAddress" &&
        (status === "success" || status === "verified")
      );
    });
  }, [identities]);

  const [source, setSource] = useState(defaultSource || "");
  const [to, setTo] = useState("");
  const [cc, setCc] = useState("");
  const [bcc, setBcc] = useState("");
  const [subject, setSubject] = useState("");
  const [bodyType, setBodyType] = useState<"html" | "text">("html");
  const [body, setBody] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Set default source when identities load or defaultSource changes
  const activeSource =
    source ||
    defaultSource ||
    (verifiedIdentities.length > 0 ? verifiedIdentities[0].identity : "");

  const hasVerifiedSender =
    Boolean(activeSource) &&
    verifiedIdentities.some((i) => i.identity === activeSource);

  const isValid =
    hasVerifiedSender &&
    to.trim().length > 0 &&
    subject.trim().length > 0 &&
    body.trim().length > 0;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isValid || isSubmitting) return;

    const toAddresses = to
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    const ccAddresses = cc
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    const bccAddresses = bcc
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);

    setIsSubmitting(true);
    try {
      const msgId = await sendEmail({
        source: activeSource,
        to: toAddresses,
        cc: ccAddresses.length > 0 ? ccAddresses : undefined,
        bcc: bccAddresses.length > 0 ? bccAddresses : undefined,
        subject: subject.trim(),
        text: bodyType === "text" ? body : undefined,
        html: bodyType === "html" ? body : undefined,
      });

      if (msgId) {
        setTo("");
        setCc("");
        setBcc("");
        setSubject("");
        setBody("");
        onOpenChange(false);
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <form onSubmit={handleSubmit} className="space-y-4">
          <DialogHeader>
            <DialogTitle>Send Test Email</DialogTitle>
            <DialogDescription>
              Send an email through LocalStack SES. The sender address must be a
              verified identity.
            </DialogDescription>
          </DialogHeader>

          {verifiedIdentities.length === 0 ? (
            <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-600 dark:text-amber-400">
              No verified email identities available. Please verify an email
              identity first before sending.
            </div>
          ) : (
            <div className="space-y-3 py-1">
              <div className="space-y-1.5">
                <Label htmlFor="send-from">From (Verified Identity)</Label>
                <Select
                  value={activeSource}
                  onValueChange={(val) => setSource(val)}
                >
                  <SelectTrigger id="send-from">
                    <SelectValue placeholder="Select verified sender" />
                  </SelectTrigger>
                  <SelectContent>
                    {verifiedIdentities.map((id) => (
                      <SelectItem key={id.identity} value={id.identity}>
                        {id.identity}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="send-to">To (comma-separated)</Label>
                <Input
                  id="send-to"
                  value={to}
                  onChange={(e) => setTo(e.target.value)}
                  placeholder="recipient@example.com"
                  className="font-mono text-xs"
                  autoFocus
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="send-cc">CC (optional)</Label>
                  <Input
                    id="send-cc"
                    value={cc}
                    onChange={(e) => setCc(e.target.value)}
                    placeholder="cc@example.com"
                    className="font-mono text-xs"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="send-bcc">BCC (optional)</Label>
                  <Input
                    id="send-bcc"
                    value={bcc}
                    onChange={(e) => setBcc(e.target.value)}
                    placeholder="bcc@example.com"
                    className="font-mono text-xs"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="send-subject">Subject</Label>
                <Input
                  id="send-subject"
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  placeholder="Welcome to LocalStacker"
                />
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label htmlFor="send-body">Body</Label>
                  <div className="flex items-center gap-1">
                    <Button
                      type="button"
                      variant={bodyType === "html" ? "secondary" : "ghost"}
                      size="sm"
                      className="h-6 px-2 text-xs"
                      onClick={() => setBodyType("html")}
                    >
                      HTML
                    </Button>
                    <Button
                      type="button"
                      variant={bodyType === "text" ? "secondary" : "ghost"}
                      size="sm"
                      className="h-6 px-2 text-xs"
                      onClick={() => setBodyType("text")}
                    >
                      Plaintext
                    </Button>
                  </div>
                </div>
                <textarea
                  id="send-body"
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  placeholder={
                    bodyType === "html"
                      ? "<h1>Hello</h1><p>Welcome to LocalStack!</p>"
                      : "Hello, welcome to LocalStack!"
                  }
                  rows={4}
                  className="flex min-h-[90px] w-full rounded-md border border-input bg-transparent px-3 py-2 font-mono text-xs shadow-xs placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                />
              </div>
            </div>
          )}

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
              type="submit"
              disabled={!isValid || isSubmitting || verifiedIdentities.length === 0}
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Sending...
                </>
              ) : (
                <>
                  <Send className="mr-2 h-4 w-4" />
                  Send email
                </>
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
