import { useState } from "react";
import { Server, RotateCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { InstanceListView } from "./InstanceListView";
import { SecurityGroupListView } from "./SecurityGroupListView";
import { KeyPairListView } from "./KeyPairListView";
import {
  useInstances,
  useKeyPairs,
  useSecurityGroups,
} from "@/hooks/use-ec2";
import { ServiceDisabledView } from "@/components/ServiceDisabledView";
import { isServiceDisabledError, useServiceStatus } from "@/hooks/use-health";

interface Ec2ServiceViewProps {
  initialTab?: string;
  securityGroupsContent?: React.ReactNode;
  keyPairsContent?: React.ReactNode;
}

export function Ec2ServiceView({
  initialTab = "instances",
  securityGroupsContent,
  keyPairsContent,
}: Ec2ServiceViewProps) {
  const [activeTab, setActiveTab] = useState(initialTab);
  const serviceStatus = useServiceStatus("ec2");

  const {
    data: instances = [],
    isFetching: isInstancesFetching,
    error: instancesError,
    refetch: refetchInstances,
  } = useInstances({ enabled: serviceStatus !== "disabled" });

  const {
    data: keyPairs = [],
    isFetching: isKeyPairsFetching,
    error: keyPairsError,
    refetch: refetchKeyPairs,
  } = useKeyPairs({ enabled: serviceStatus !== "disabled" });

  const {
    data: securityGroups = [],
    isFetching: isSgFetching,
    error: securityGroupsError,
    refetch: refetchSecurityGroups,
  } = useSecurityGroups({ enabled: serviceStatus !== "disabled" });

  if (
    serviceStatus === "disabled" ||
    [instancesError, keyPairsError, securityGroupsError].some(
      (e) => e && isServiceDisabledError(e),
    )
  ) {
    return <ServiceDisabledView service="ec2" />;
  }

  const isRefreshing =
    isInstancesFetching || isKeyPairsFetching || isSgFetching;

  const handleRefresh = () => {
    refetchInstances();
    refetchKeyPairs();
    refetchSecurityGroups();
  };

  return (
    <div className="flex flex-col gap-6 p-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <div className="flex size-10 items-center justify-center rounded-lg border bg-muted/40">
            <Server className="size-5 text-primary" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold tracking-tight">EC2</h1>
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Badge
                      variant="outline"
                      className="cursor-help border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400 text-xs"
                    >
                      Stateful Mock
                    </Badge>
                  </TooltipTrigger>
                  <TooltipContent side="right" className="max-w-xs text-xs">
                    LocalStack emulates EC2 state changes and network resources;
                    no underlying virtual machines are provisioned.
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
            <p className="text-sm text-muted-foreground">
              Compute instances, key pairs & security groups
            </p>
          </div>
        </div>

        <Button
          variant="outline"
          size="sm"
          onClick={handleRefresh}
          disabled={isRefreshing}
          className="gap-1.5"
        >
          <RotateCw
            className={`size-3.5 ${isRefreshing ? "animate-spin" : ""}`}
          />
          Refresh
        </Button>
      </div>

      {/* Sub Tabs */}
      <Tabs
        value={activeTab}
        onValueChange={setActiveTab}
        className="w-full"
      >
        <TabsList className="mb-4">
          <TabsTrigger value="instances" className="gap-2">
            Instances
            <Badge variant="secondary" className="px-1.5 py-0 text-xs">
              {instances.length}
            </Badge>
          </TabsTrigger>
          <TabsTrigger value="securityGroups" className="gap-2">
            Security Groups
            <Badge variant="secondary" className="px-1.5 py-0 text-xs">
              {securityGroups.length}
            </Badge>
          </TabsTrigger>
          <TabsTrigger value="keyPairs" className="gap-2">
            Key Pairs
            <Badge variant="secondary" className="px-1.5 py-0 text-xs">
              {keyPairs.length}
            </Badge>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="instances" className="m-0">
          <InstanceListView />
        </TabsContent>

        <TabsContent value="securityGroups" className="m-0">
          {securityGroupsContent || <SecurityGroupListView />}
        </TabsContent>

        <TabsContent value="keyPairs" className="m-0">
          {keyPairsContent || <KeyPairListView />}
        </TabsContent>
      </Tabs>
    </div>
  );
}
