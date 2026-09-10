import { useEffect, useRef } from "react";
import { Boxes, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
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
import { SsmServiceView } from "@/components/ssm/SsmServiceView";
import { ParameterView } from "@/components/ssm/ParameterView";
import { EventBridgeServiceView } from "@/components/eventbridge/EventBridgeServiceView";
import { EventBusView } from "@/components/eventbridge/EventBusView";
import { SchedulerServiceView } from "@/components/scheduler/SchedulerServiceView";
import { ScheduleGroupView } from "@/components/scheduler/ScheduleGroupView";
import { ApigatewayServiceView } from "@/components/apigateway/ApigatewayServiceView";
import { RestApiView } from "@/components/apigateway/RestApiView";
import { SesServiceView } from "@/components/ses/SesServiceView";
import { IdentityView } from "@/components/ses/IdentityView";
import { SesMailboxView } from "@/components/ses/SesMailboxView";
import { IamServiceView } from "@/components/iam/IamServiceView";
import { RoleView } from "@/components/iam/RoleView";
import { UserView } from "@/components/iam/UserView";

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
  const closeAllTabs = useTabs((s) => s.closeAllTabs);
  const closeOtherTabs = useTabs((s) => s.closeOtherTabs);

  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const activeTabRef = useRef<HTMLButtonElement | null>(null);

  // Auto-scroll active tab into view when active tab changes
  useEffect(() => {
    if (activeTabRef.current) {
      activeTabRef.current.scrollIntoView({
        behavior: "smooth",
        block: "nearest",
        inline: "nearest",
      });
    }
  }, [activeTabId]);

  // Translate vertical wheel scrolling to horizontal scroll when hovering over the tab bar
  const handleWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    if (e.deltaY !== 0 && e.deltaX === 0) {
      e.currentTarget.scrollLeft += e.deltaY;
    }
  };

  if (tabs.length === 0) return <EmptyState />;

  return (
    <Tabs
      value={activeTabId ?? undefined}
      onValueChange={setActiveTab}
      className="h-full flex flex-col min-h-0"
    >
      {/* Scrollable Tab Bar Header */}
      <div className="flex h-10 w-full items-center border-b bg-background select-none shrink-0">
        {/* Scrollable Tabs List */}
        <div
          ref={scrollContainerRef}
          onWheel={handleWheel}
          data-testid="tab-scroll-container"
          className="flex-1 min-w-0 h-full overflow-x-auto overflow-y-hidden [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden"
        >
          <TabsList
            variant="line"
            className="h-full w-max justify-start rounded-none border-b-0 px-2 gap-1 bg-transparent"
          >
            {tabs.map((tab) => {
              const isActive = tab.id === activeTabId;
              return (
                <ContextMenu key={tab.id}>
                  <ContextMenuTrigger asChild>
                    <div className="relative inline-flex items-center">
                      <TabsTrigger
                        ref={isActive ? activeTabRef : null}
                        value={tab.id}
                        className="flex-none gap-1.5 px-3 pr-7 h-8 text-xs font-medium max-w-[220px]"
                        onAuxClick={(e) => {
                          if (e.button === 1) {
                            e.preventDefault();
                            closeTab(tab.id);
                          }
                        }}
                      >
                        <span className="truncate">{tab.title}</span>
                      </TabsTrigger>
                      <button
                        type="button"
                        aria-label={`Close ${tab.title}`}
                        onClick={(e) => {
                          e.stopPropagation();
                          closeTab(tab.id);
                        }}
                        className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded-xs p-0.5 opacity-60 hover:opacity-100 hover:bg-muted text-muted-foreground hover:text-foreground transition-all"
                      >
                        <X className="size-3.5" />
                      </button>
                    </div>
                  </ContextMenuTrigger>
                  <ContextMenuContent>
                    <ContextMenuItem onClick={() => closeTab(tab.id)}>
                      Close
                    </ContextMenuItem>
                    <ContextMenuItem
                      onClick={() => closeOtherTabs(tab.id)}
                      disabled={tabs.length <= 1}
                    >
                      Close others
                    </ContextMenuItem>
                    <ContextMenuSeparator />
                    <ContextMenuItem onClick={closeAllTabs}>
                      Close all
                    </ContextMenuItem>
                  </ContextMenuContent>
                </ContextMenu>
              );
            })}
          </TabsList>
        </div>

        {/* Tab Bar Right Controls: Close All */}
        <div className="flex items-center gap-1 border-l px-2 shrink-0 bg-background h-full">
          <Button
            variant="ghost"
            size="sm"
            onClick={closeAllTabs}
            className="h-7 px-2 text-xs text-muted-foreground hover:text-foreground gap-1"
            title="Close all tabs"
            aria-label="Close all tabs"
          >
            <X className="size-3.5" />
            <span className="hidden sm:inline">Close all</span>
          </Button>
        </div>
      </div>

      {tabs.map((tab) => (
        <TabsContent key={tab.id} value={tab.id} className="min-h-0 flex-1 overflow-auto m-0">
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
          ) : tab.kind === "service" && tab.service === "ssm" ? (
            <SsmServiceView />
          ) : tab.kind === "parameter" && tab.parameterName ? (
            <ParameterView parameterName={tab.parameterName} />
          ) : tab.kind === "service" && tab.service === "eventbridge" ? (
            <EventBridgeServiceView />
          ) : tab.kind === "eventBus" && tab.busName ? (
            <EventBusView busName={tab.busName} />
          ) : tab.kind === "service" && tab.service === "scheduler" ? (
            <SchedulerServiceView />
          ) : tab.kind === "scheduleGroup" && tab.groupName ? (
            <ScheduleGroupView groupName={tab.groupName} />
          ) : tab.kind === "service" && tab.service === "apigateway" ? (
            <ApigatewayServiceView />
          ) : tab.kind === "restApi" && tab.restApiId ? (
            <RestApiView restApiId={tab.restApiId} />
          ) : tab.kind === "service" && tab.service === "ses" ? (
            <SesServiceView />
          ) : tab.kind === "sesIdentity" && tab.identityName ? (
            <IdentityView identityName={tab.identityName} />
          ) : tab.kind === "sesMailbox" ? (
            <SesMailboxView />
          ) : tab.kind === "service" && tab.service === "iam" ? (
            <IamServiceView />
          ) : tab.kind === "iamRole" && tab.roleName ? (
            <RoleView roleName={tab.roleName} />
          ) : tab.kind === "iamUser" && tab.userName ? (
            <UserView userName={tab.userName} />
          ) : null}
        </TabsContent>
      ))}
    </Tabs>
  );
}
