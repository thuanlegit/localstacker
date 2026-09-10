import { useState } from "react";
import { Check, Copy, BookOpen, Layers } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface DynamoGuideDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreateTableClick?: () => void;
}

export const DYNAMO_GUIDE_SNIPPETS = {
  awslocal: {
    id: "awslocal",
    label: "awslocal CLI",
    description: "Using the official LocalStack CLI helper",
    code: `awslocal dynamodb create-table \\
  --table-name users \\
  --attribute-definitions AttributeName=id,AttributeType=S \\
  --key-schema AttributeName=id,KeyType=HASH \\
  --billing-mode PAY_PER_REQUEST`,
  },
  awsCli: {
    id: "awsCli",
    label: "AWS CLI",
    description: "Standard AWS CLI with endpoint URL flag",
    code: `aws --endpoint-url=http://localhost:4566 dynamodb create-table \\
  --table-name users \\
  --attribute-definitions AttributeName=id,AttributeType=S \\
  --key-schema AttributeName=id,KeyType=HASH \\
  --billing-mode PAY_PER_REQUEST`,
  },
  sdk: {
    id: "sdk",
    label: "TypeScript / Node.js",
    description: "AWS SDK v3 programmatic creation",
    code: `import { DynamoDBClient, CreateTableCommand } from "@aws-sdk/client-dynamodb";

const client = new DynamoDBClient({
  endpoint: "http://localhost:4566",
  region: "us-east-1",
  credentials: { accessKeyId: "test", secretAccessKey: "test" },
});

await client.send(
  new CreateTableCommand({
    TableName: "users",
    AttributeDefinitions: [{ AttributeName: "id", AttributeType: "S" }],
    KeySchema: [{ AttributeName: "id", KeyType: "HASH" }],
    BillingMode: "PAY_PER_REQUEST",
  })
);`,
  },
  dockerInit: {
    id: "dockerInit",
    label: "Docker Init Hook",
    description: "Auto-provision on LocalStack container startup",
    code: `#!/bin/bash
# Save to: /etc/localstack/init/ready.d/01-dynamodb.sh
awslocal dynamodb create-table \\
  --table-name users \\
  --attribute-definitions \\
      AttributeName=id,AttributeType=S \\
      AttributeName=created_at,AttributeType=N \\
  --key-schema \\
      AttributeName=id,KeyType=HASH \\
      AttributeName=created_at,KeyType=RANGE \\
  --billing-mode PAY_PER_REQUEST`,
  },
  sampleItem: {
    id: "sampleItem",
    label: "Sample Item JSON",
    description: "Paste into the 'Add Item' dialog after opening a table",
    code: `{
  "id": "usr_1001",
  "name": "Alice Johnson",
  "email": "alice@example.com",
  "role": "admin",
  "created_at": 1710000000,
  "preferences": {
    "theme": "dark",
    "notifications": true
  }
}`,
  },
};

export function DynamoGuideDialog({
  open,
  onOpenChange,
  onCreateTableClick,
}: DynamoGuideDialogProps) {
  const [activeTab, setActiveTab] =
    useState<keyof typeof DYNAMO_GUIDE_SNIPPETS>("awslocal");
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const snippet = DYNAMO_GUIDE_SNIPPETS[activeTab];

  const handleCopy = async (key: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedKey(key);
      toast.success("Snippet copied to clipboard");
      setTimeout(() => setCopiedKey(null), 2000);
    } catch {
      toast.error("Failed to copy snippet");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-w-2xl">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-md bg-primary/10 text-primary">
              <BookOpen className="h-4 w-4" />
            </div>
            <div>
              <DialogTitle>DynamoDB Setup & Usage Guide</DialogTitle>
              <DialogDescription>
                Ready-to-use snippets to create tables and seed items in LocalStack.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="space-y-4 pt-2 min-w-0 w-full">
          {/* Quick UI option callout */}
          {onCreateTableClick && (
            <div className="flex flex-wrap sm:flex-nowrap items-center justify-between gap-2 rounded-lg border border-primary/20 bg-primary/5 p-3 text-xs min-w-0">
              <div className="flex items-center gap-2 min-w-0">
                <Layers className="h-4 w-4 text-primary shrink-0" />
                <span className="truncate sm:whitespace-normal">
                  Prefer using the UI? You can create a table directly in LocalStacker.
                </span>
              </div>
              <Button
                size="sm"
                variant="default"
                className="h-7 text-xs shrink-0"
                onClick={() => {
                  onOpenChange(false);
                  onCreateTableClick();
                }}
              >
                Create table in UI
              </Button>
            </div>
          )}

          {/* Snippet Tabs */}
          <div className="flex flex-wrap gap-1.5 border-b pb-2">
            {(
              Object.keys(
                DYNAMO_GUIDE_SNIPPETS,
              ) as (keyof typeof DYNAMO_GUIDE_SNIPPETS)[]
            ).map((key) => {
              const item = DYNAMO_GUIDE_SNIPPETS[key];
              const isActive = activeTab === key;
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => setActiveTab(key)}
                  className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                    isActive
                      ? "bg-primary text-primary-foreground shadow-xs"
                      : "bg-muted text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {item.label}
                </button>
              );
            })}
          </div>

          {/* Code Viewer */}
          <div className="rounded-lg border bg-card text-left shadow-xs min-w-0 w-full overflow-hidden">
            <div className="flex items-center justify-between border-b bg-muted/40 px-3 py-1.5 text-xs text-muted-foreground min-w-0">
              <span className="truncate pr-2">{snippet.description}</span>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 shrink-0 text-muted-foreground hover:text-foreground"
                aria-label="Copy snippet"
                onClick={() => handleCopy(activeTab, snippet.code)}
              >
                {copiedKey === activeTab ? (
                  <Check className="h-3.5 w-3.5 text-emerald-500" />
                ) : (
                  <Copy className="h-3.5 w-3.5" />
                )}
              </Button>
            </div>
            <pre className="max-h-60 min-w-0 w-full overflow-x-auto overflow-y-auto p-3 font-mono text-xs text-foreground/90 whitespace-pre">
              {snippet.code}
            </pre>
          </div>

          <p className="text-[11px] text-muted-foreground">
            Tip: Once created in LocalStack, tables appear in the sidebar and
            Cmd+K palette automatically within seconds.
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
