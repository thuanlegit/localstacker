import { useState } from "react";
import { Check, Copy, BookOpen, Layers, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface LambdaGuideDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreateDemoClick?: () => void;
}

export const LAMBDA_GUIDE_SNIPPETS = {
  awslocal: {
    id: "awslocal",
    label: "awslocal CLI",
    description: "Fastest CLI path using the official LocalStack wrapper",
    code: `# 1. Create a minimal index.mjs
cat << 'EOF' > index.mjs
export const handler = async (event) => {
  console.log("Received event:", JSON.stringify(event));
  return {
    statusCode: 200,
    body: JSON.stringify({ message: "Hello from LocalStack Lambda!", event })
  };
};
EOF

# 2. Package code into zip
zip function.zip index.mjs

# 3. Create function in LocalStack
awslocal lambda create-function \\
  --function-name my-test-function \\
  --runtime nodejs22.x \\
  --handler index.handler \\
  --role arn:aws:iam::000000000000:role/lambda-role \\
  --zip-file fileb://function.zip`,
  },
  awsCli: {
    id: "awsCli",
    label: "AWS CLI",
    description: "Standard AWS CLI with endpoint URL override",
    code: `# Package function code
zip function.zip index.mjs

# Create function targeting LocalStack endpoint
aws --endpoint-url=http://localhost:4566 lambda create-function \\
  --function-name my-test-function \\
  --runtime nodejs22.x \\
  --handler index.handler \\
  --role arn:aws:iam::000000000000:role/lambda-role \\
  --zip-file fileb://function.zip`,
  },
  sdk: {
    id: "sdk",
    label: "TypeScript / Node.js",
    description: "AWS SDK v3 programmatic creation",
    code: `import { LambdaClient, CreateFunctionCommand } from "@aws-sdk/client-lambda";
import { zipSync, strToU8 } from "fflate";

const client = new LambdaClient({
  endpoint: "http://localhost:4566",
  region: "us-east-1",
  credentials: { accessKeyId: "test", secretAccessKey: "test" },
});

const zipFile = zipSync({
  "index.js": strToU8(
    "exports.handler = async (e) => ({ statusCode: 200, body: 'Hello!' });"
  ),
});

await client.send(
  new CreateFunctionCommand({
    FunctionName: "my-sdk-function",
    Runtime: "nodejs22.x",
    Handler: "index.handler",
    Role: "arn:aws:iam::000000000000:role/lambda-role",
    Code: { ZipFile: zipFile },
  })
);`,
  },
  python: {
    id: "python",
    label: "Python (boto3)",
    description: "Python Boto3 programmatic creation",
    code: `import boto3
import zipfile
import io

zip_buffer = io.BytesIO()
with zipfile.ZipFile(zip_buffer, "w", zipfile.ZIP_DEFLATED) as zf:
    zf.writestr("lambda_function.py", """
def lambda_handler(event, context):
    print("Processing event:", event)
    return {"statusCode": 200, "body": "Hello from Python!"}
""")

client = boto3.client(
    "lambda",
    endpoint_url="http://localhost:4566",
    region_name="us-east-1",
    aws_access_key_id="test",
    aws_secret_access_key="test",
)

client.create_function(
    FunctionName="my-python-function",
    Runtime="python3.12",
    Role="arn:aws:iam::000000000000:role/lambda-role",
    Handler="lambda_function.lambda_handler",
    Code={"ZipFile": zip_buffer.getvalue()},
)`,
  },
  terraform: {
    id: "terraform",
    label: "Terraform",
    description: "Infrastructure as Code configuration",
    code: `provider "aws" {
  region                      = "us-east-1"
  access_key                  = "test"
  secret_key                  = "test"
  skip_credentials_validation = true
  skip_requesting_account_id  = true

  endpoints {
    lambda = "http://localhost:4566"
  }
}

data "archive_file" "lambda_zip" {
  type        = "zip"
  output_path = "\${path.module}/function.zip"
  source {
    content  = "exports.handler = async () => ({ statusCode: 200 });"
    filename = "index.js"
  }
}

resource "aws_lambda_function" "demo" {
  filename         = data.archive_file.lambda_zip.output_path
  function_name    = "terraform-lambda"
  role             = "arn:aws:iam::000000000000:role/lambda-role"
  handler          = "index.handler"
  runtime          = "nodejs22.x"
  source_code_hash = data.archive_file.lambda_zip.output_base64sha256
}`,
  },
};

export function LambdaGuideDialog({
  open,
  onOpenChange,
  onCreateDemoClick,
}: LambdaGuideDialogProps) {
  const [activeTab, setActiveTab] =
    useState<keyof typeof LAMBDA_GUIDE_SNIPPETS>("awslocal");
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const snippet = LAMBDA_GUIDE_SNIPPETS[activeTab];

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
      <DialogContent className="max-w-2xl sm:max-w-2xl min-w-0 overflow-hidden">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <BookOpen className="h-5 w-5 text-primary" />
            <DialogTitle>Lambda Setup & Usage Guide</DialogTitle>
          </div>
          <DialogDescription>
            How to package and provision Lambda functions in LocalStack, then
            inspect, invoke, and monitor them in Localstacker.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2 text-sm min-w-0">
          <div className="space-y-2 rounded-md bg-muted/50 p-3 text-xs text-muted-foreground">
            <div className="flex items-center gap-1.5 font-medium text-foreground">
              <Layers className="h-4 w-4 text-primary" />
              <span>How Lambda Works in Localstacker</span>
            </div>
            <p>
              Localstacker connects to LocalStack to provide real-time function
              browsing, configuration inspection, environment variable updating,
              test invocation with tail logs, and one-click navigation to
              CloudWatch Logs. Functions are deployed via your build pipeline or
              CLI.
            </p>
            {onCreateDemoClick && (
              <div className="pt-1">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    onOpenChange(false);
                    onCreateDemoClick();
                  }}
                  className="gap-1.5 h-7 text-xs"
                >
                  <Sparkles className="h-3.5 w-3.5 text-primary" />
                  Create quick demo function
                </Button>
              </div>
            )}
          </div>

          {/* Snippet Tabs */}
          <div className="flex flex-wrap gap-1 border-b pb-2">
            {(
              Object.keys(
                LAMBDA_GUIDE_SNIPPETS,
              ) as (keyof typeof LAMBDA_GUIDE_SNIPPETS)[]
            ).map((key) => {
              const item = LAMBDA_GUIDE_SNIPPETS[key];
              const isActive = activeTab === key;
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => setActiveTab(key)}
                  className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                    isActive
                      ? "bg-primary text-primary-foreground shadow-xs"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground"
                  }`}
                >
                  {item.label}
                </button>
              );
            })}
          </div>

          {/* Snippet Details */}
          <div className="rounded-lg border border-border/80 bg-card/60 min-w-0 overflow-hidden shadow-xs">
            <div className="flex items-center justify-between border-b border-border/60 bg-muted/40 px-3 py-2 min-w-0">
              <span className="text-xs text-muted-foreground truncate mr-2">
                {snippet.description}
              </span>
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
            Tip: Once created in LocalStack, functions appear automatically in
            the list, sidebar, and ⌘K Command Palette.
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
