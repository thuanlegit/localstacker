import { Boxes, X } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useTabs } from "@/store/tabs";
import { S3ServiceView } from "@/components/s3/S3ServiceView";
import { BucketView } from "@/components/s3/BucketView";
import { SqsServiceView } from "@/components/sqs/SqsServiceView";
import { QueueView } from "@/components/sqs/QueueView";
import { SecretsServiceView } from "@/components/secrets/SecretsServiceView";
import { SecretView } from "@/components/secrets/SecretView";
import { LambdaServiceView } from "@/components/lambda/LambdaServiceView";
import { FunctionView } from "@/components/lambda/FunctionView";
import { DynamoServiceView } from "@/components/dynamodb/DynamoServiceView";
import { TableView } from "@/components/dynamodb/TableView";
import { SnsServiceView } from "@/components/sns/SnsServiceView";
import { TopicView } from "@/components/sns/TopicView";
import { LogsServiceView } from "@/components/logs/LogsServiceView";
import { LogGroupView } from "@/components/logs/LogGroupView";

function EmptyState() {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 text-muted-foreground">
      <Boxes className="size-10 opacity-40" aria-hidden />
      <p className="text-sm">Pick a service from the sidebar, or press ⌘K</p>
    </div>
  );
}

export function MainArea() {
  const tabs = useTabs((s) => s.tabs);
  const activeTabId = useTabs((s) => s.activeTabId);
  const setActiveTab = useTabs((s) => s.setActiveTab);
  const closeTab = useTabs((s) => s.closeTab);

  if (tabs.length === 0) return <EmptyState />;

  return (
    <Tabs value={activeTabId ?? undefined} onValueChange={setActiveTab} className="h-full">
      <TabsList variant="line" className="h-10 w-full justify-start rounded-none border-b px-2">
        {tabs.map((tab) => (
          <TabsTrigger key={tab.id} value={tab.id} className="flex-none gap-1.5 px-3">
            {tab.title}
            <span
              aria-label={`Close ${tab.title}`}
              onClick={(e) => {
                e.stopPropagation();
                closeTab(tab.id);
              }}
              className="rounded-sm p-0.5 opacity-50 hover:opacity-100"
            >
              <X className="size-3.5" />
            </span>
          </TabsTrigger>
        ))}
      </TabsList>
      {tabs.map((tab) => (
        <TabsContent key={tab.id} value={tab.id} className="min-h-0">
          {tab.kind === "service" && tab.service === "s3" ? (
            <S3ServiceView />
          ) : tab.kind === "bucket" && tab.bucketName ? (
            <BucketView bucketName={tab.bucketName} />
          ) : tab.kind === "service" && tab.service === "sqs" ? (
            <SqsServiceView />
          ) : tab.kind === "queue" && tab.queueName ? (
            <QueueView queueName={tab.queueName} />
          ) : tab.kind === "service" && tab.service === "secrets" ? (
            <SecretsServiceView />
          ) : tab.kind === "secret" && tab.secretName ? (
            <SecretView secretName={tab.secretName} />
          ) : tab.kind === "service" && tab.service === "lambda" ? (
            <LambdaServiceView />
          ) : tab.kind === "function" && tab.functionName ? (
            <FunctionView functionName={tab.functionName} />
          ) : tab.kind === "service" && tab.service === "dynamodb" ? (
            <DynamoServiceView />
          ) : tab.kind === "table" && tab.tableName ? (
            <TableView tableName={tab.tableName} />
          ) : tab.kind === "service" && tab.service === "sns" ? (
            <SnsServiceView />
          ) : tab.kind === "topic" && tab.topicArn ? (
            <TopicView topicArn={tab.topicArn} />
          ) : tab.kind === "service" && tab.service === "logs" ? (
            <LogsServiceView />
          ) : tab.kind === "logGroup" && tab.logGroupName ? (
            <LogGroupView logGroupName={tab.logGroupName} />
          ) : null}
        </TabsContent>
      ))}
    </Tabs>
  );
}
