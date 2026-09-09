import { Boxes, X } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { serviceMeta } from "@/lib/services";
import { useTabs } from "@/store/tabs";
import { S3ServiceView } from "@/components/s3/S3ServiceView";
import { BucketView } from "@/components/s3/BucketView";
import type { ServiceKind } from "@/types";
function ServicePlaceholder({ service }: { service: ServiceKind }) {
  const meta = serviceMeta(service);
  const Icon = meta.icon;

  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 p-8 text-center">
      <div className="flex size-14 items-center justify-center rounded-xl border bg-muted/50">
        <Icon className="size-7 text-muted-foreground" />
      </div>
      <h2 className="text-lg font-semibold">{meta.label}</h2>
      <p className="text-sm text-muted-foreground">Coming in {meta.milestone}</p>
      <ul className="mt-2 space-y-1.5 text-sm text-muted-foreground">
        {meta.planned.map((item) => (
          <li key={item} className="flex items-start gap-2">
            <span aria-hidden className="mt-2 size-1 shrink-0 rounded-full bg-muted-foreground/60" />
            {item}
          </li>
        ))}
      </ul>
    </div>
  );
}

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
          ) : tab.kind === "service" && tab.service ? (
            <ServicePlaceholder service={tab.service} />
          ) : null}
        </TabsContent>
      ))}
    </Tabs>
  );
}
