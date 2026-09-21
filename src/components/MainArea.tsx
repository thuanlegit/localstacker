import { useEffect, useRef } from "react";
import { CircleAlert, X } from "lucide-react";
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
import { Route53ServiceView } from "@/components/route53/Route53ServiceView";
import { HostedZoneView } from "@/components/route53/HostedZoneView";
import { Ec2ServiceView } from "@/components/ec2/Ec2ServiceView";
import { SecurityGroupDetailView } from "@/components/ec2/SecurityGroupDetailView";
import { SfnServiceView } from "@/components/sfn/SfnServiceView";
import { StateMachineView } from "@/components/sfn/StateMachineView";
import { KinesisServiceView } from "@/components/kinesis/KinesisServiceView";
import { StreamView } from "@/components/kinesis/StreamView";
import { CloudWatchServiceView } from "@/components/cloudwatch/CloudWatchServiceView";
import { KmsServiceView } from "@/components/kms/KmsServiceView";
import { KeyView } from "@/components/kms/KeyView";
import { AcmServiceView } from "@/components/acm/AcmServiceView";
import { CloudFormationServiceView } from "@/components/cloudformation/CloudFormationServiceView";
import { StackView } from "@/components/cloudformation/StackView";
import { DockerView } from "@/components/docker/DockerView";
import { SettingsView } from "@/components/settings/SettingsView";
import { HomeView } from "@/components/HomeView";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { useHealth } from "@/hooks/use-health";
import type { TabDescriptor } from "@/types";

function renderTabContent(tab: TabDescriptor) {
  if (tab.kind === "service" && tab.service === "s3") return <S3ServiceView />;
  if (tab.kind === "bucket" && tab.bucketName) return <BucketView bucketName={tab.bucketName} />;
  if (tab.kind === "service" && tab.service === "sqs") return <SqsServiceView />;
  if (tab.kind === "queue" && tab.queueName) return <QueueView queueName={tab.queueName} />;
  if (tab.kind === "service" && tab.service === "secrets") return <SecretsServiceView />;
  if (tab.kind === "secret" && tab.secretName) return <SecretView secretName={tab.secretName} />;
  if (tab.kind === "service" && tab.service === "lambda") return <LambdaServiceView />;
  if (tab.kind === "function" && tab.functionName) return <FunctionView functionName={tab.functionName} />;
  if (tab.kind === "service" && tab.service === "dynamodb") return <DynamoServiceView />;
  if (tab.kind === "table" && tab.tableName) return <TableView tableName={tab.tableName} />;
  if (tab.kind === "service" && tab.service === "sns") return <SnsServiceView />;
  if (tab.kind === "topic" && tab.topicArn) return <TopicView topicArn={tab.topicArn} />;
  if (tab.kind === "service" && tab.service === "logs") return <LogsServiceView />;
  if (tab.kind === "logGroup" && tab.logGroupName) return <LogGroupView logGroupName={tab.logGroupName} />;
  if (tab.kind === "service" && tab.service === "ssm") return <SsmServiceView />;
  if (tab.kind === "parameter" && tab.parameterName) return <ParameterView parameterName={tab.parameterName} />;
  if (tab.kind === "service" && tab.service === "eventbridge") return <EventBridgeServiceView />;
  if (tab.kind === "eventBus" && tab.busName) return <EventBusView busName={tab.busName} />;
  if (tab.kind === "service" && tab.service === "scheduler") return <SchedulerServiceView />;
  if (tab.kind === "scheduleGroup" && tab.groupName) return <ScheduleGroupView groupName={tab.groupName} />;
  if (tab.kind === "service" && tab.service === "apigateway") return <ApigatewayServiceView />;
  if (tab.kind === "restApi" && tab.restApiId) return <RestApiView restApiId={tab.restApiId} />;
  if (tab.kind === "service" && tab.service === "ses") return <SesServiceView />;
  if (tab.kind === "sesIdentity" && tab.identityName) return <IdentityView identityName={tab.identityName} />;
  if (tab.kind === "sesMailbox") return <SesMailboxView />;
  if (tab.kind === "service" && tab.service === "iam") return <IamServiceView />;
  if (tab.kind === "iamRole" && tab.roleName) return <RoleView roleName={tab.roleName} />;
  if (tab.kind === "iamUser" && tab.userName) return <UserView userName={tab.userName} />;
  if (tab.kind === "service" && tab.service === "route53") return <Route53ServiceView />;
  if (tab.kind === "hostedZone" && tab.zoneId) return <HostedZoneView zoneId={tab.zoneId} />;
  if (tab.kind === "docker") return <DockerView />;
  if (tab.kind === "service" && tab.service === "ec2") return <Ec2ServiceView />;
  if (tab.kind === "securityGroup" && tab.securityGroupId) return <SecurityGroupDetailView groupId={tab.securityGroupId} />;
  if (tab.kind === "service" && tab.service === "sfn") return <SfnServiceView />;
  if (tab.kind === "stateMachine" && tab.stateMachineArn) return <StateMachineView stateMachineArn={tab.stateMachineArn} />;
  if (tab.kind === "service" && tab.service === "kinesis") return <KinesisServiceView />;
  if (tab.kind === "stream" && tab.streamName) return <StreamView streamName={tab.streamName} />;
  if (tab.kind === "service" && tab.service === "cloudwatch") return <CloudWatchServiceView />;
  if (tab.kind === "service" && tab.service === "kms") return <KmsServiceView />;
  if (tab.kind === "kmsKey" && tab.keyId) return <KeyView keyId={tab.keyId} />;
  if (tab.kind === "service" && tab.service === "acm") return <AcmServiceView />;
  if (tab.kind === "service" && tab.service === "cloudformation") return <CloudFormationServiceView />;
  if (tab.kind === "stack" && tab.stackName) return <StackView stackName={tab.stackName} />;
  if (tab.kind === "settings") return <SettingsView />;
  return null;
}
export function MainArea() {
  const tabs = useTabs((s) => s.tabs);
  const activeTabId = useTabs((s) => s.activeTabId);
  const setActiveTab = useTabs((s) => s.setActiveTab);
  const closeTab = useTabs((s) => s.closeTab);
  const closeAllTabs = useTabs((s) => s.closeAllTabs);
  const closeOtherTabs = useTabs((s) => s.closeOtherTabs);
  const { data: healthData } = useHealth();
  const isDown = healthData?.status === "down";
  const downReason = healthData?.status === "down" ? healthData.reason : undefined;

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

  if (tabs.length === 0) return <HomeView />;

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

      {/* Disconnection Warning Banner when viewing tabs while LocalStack is down */}
      {isDown && (
        <div
          data-testid="connection-disconnected-banner"
          className="flex items-center justify-between border-b bg-amber-500/10 px-4 py-2 text-xs text-amber-700 dark:text-amber-400 shrink-0"
        >
          <div className="flex items-center gap-2 min-w-0">
            <CircleAlert className="size-4 shrink-0 text-amber-600 dark:text-amber-400" />
            <span className="truncate">
              LocalStack is not running ({downReason || "connection refused"}). Operations will fail until LocalStack is restarted.
            </span>
          </div>
          <code className="hidden sm:inline-block shrink-0 rounded bg-amber-500/15 px-2 py-0.5 font-mono text-[10px] text-amber-800 dark:text-amber-300 border border-amber-500/20">
            docker start localstack
          </code>
        </div>
      )}
      {tabs.map((tab) => (
        <TabsContent key={tab.id} value={tab.id} className="min-h-0 flex-1 overflow-auto m-0">
          <ErrorBoundary
            level="tab"
            tabTitle={tab.title}
            onCloseTab={() => closeTab(tab.id)}
          >
            {renderTabContent(tab)}
          </ErrorBoundary>
        </TabsContent>
      ))}
    </Tabs>
  );
}
