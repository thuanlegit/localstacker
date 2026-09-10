import { useEffect, useState } from "react";
import { CalendarClock, Database, HardDrive, Inbox, KeyRound, ListOrdered, ListTree, Mail, Moon, Network, Radio, ScrollText, ShieldCheck, Sun, User, Webhook, Zap } from "lucide-react";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { openServiceTab } from "@/components/Sidebar";
import { SERVICES } from "@/lib/services";
import { useTheme } from "@/store/theme";
import { useActiveProfile } from "@/store/profiles";
import { useTabs } from "@/store/tabs";
import { useBuckets } from "@/hooks/use-s3";
import { useQueues } from "@/hooks/use-sqs";
import { useSecrets } from "@/hooks/use-secrets";
import { useFunctions } from "@/hooks/use-lambda";
import { useTables } from "@/hooks/use-dynamodb";
import { useTopics } from "@/hooks/use-sns";
import { useLogGroups } from "@/hooks/use-logs";
import { useParameters } from "@/hooks/use-ssm";
import { useEventBuses } from "@/hooks/use-eventbridge";
import { useScheduleGroups } from "@/hooks/use-scheduler";
import { useRestApis } from "@/hooks/use-apigateway";
import { useIdentities } from "@/hooks/use-ses";
import { useRoles, useUsers } from "@/hooks/use-iam";
export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const theme = useTheme((s) => s.theme);
  const profile = useActiveProfile();
  const openTab = useTabs((s) => s.openTab);
  const { data: buckets } = useBuckets(profile.id, { enabled: open });
  const { data: queues } = useQueues(profile.id, { enabled: open });
  const { data: secrets } = useSecrets(profile.id, { enabled: open });
  const { data: functions } = useFunctions(profile.id, { enabled: open });
  const { data: tables } = useTables(profile.id, { enabled: open });
  const { data: topics } = useTopics(profile.id, { enabled: open });
  const { data: logGroups } = useLogGroups(profile.id, { enabled: open });
  const { data: parameters } = useParameters(profile.id, { enabled: open });
  const { data: buses } = useEventBuses(profile.id, { enabled: open });
  const { data: scheduleGroups } = useScheduleGroups(profile.id, { enabled: open });
  const { data: restApis } = useRestApis(profile.id, { enabled: open });
  const { data: identities } = useIdentities(profile.id, { enabled: open });
  const { data: iamRoles } = useRoles({ enabled: open });
  const { data: iamUsers } = useUsers({ enabled: open });
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((prev) => !prev);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const run = (action: () => void) => {
    action();
    setOpen(false);
  };

  return (
    <CommandDialog open={open} onOpenChange={setOpen}>
      <CommandInput placeholder="Type a command or search…" />
      <CommandList>
        <CommandEmpty>No results found.</CommandEmpty>
        <CommandGroup heading="Go to">
          {SERVICES.map((meta) => {
            const Icon = meta.icon;
            return (
              <CommandItem
                key={meta.kind}
                value={meta.label}
                onSelect={() => run(() => openServiceTab(meta.kind, meta.shortLabel))}
              >
                <Icon />
                {meta.label}
              </CommandItem>
            );
          })}
        </CommandGroup>
        {buckets && buckets.length > 0 && (
          <CommandGroup heading="Buckets">
            {buckets.map((b) => (
              <CommandItem
                key={b.name}
                value={b.name}
                onSelect={() =>
                  run(() =>
                    openTab({
                      id: `bucket:${b.name}`,
                      kind: "bucket",
                      bucketName: b.name,
                      title: b.name,
                    }),
                  )
                }
              >
                <HardDrive />
                {b.name}
              </CommandItem>
            ))}
          </CommandGroup>
        )}
        {queues && queues.length > 0 && (
          <CommandGroup heading="Queues">
            {queues.map((q) => (
              <CommandItem
                key={q.name}
                value={q.name}
                onSelect={() =>
                  run(() =>
                    openTab({
                      id: `queue:${q.name}`,
                      kind: "queue",
                      queueName: q.name,
                      title: q.name,
                    }),
                  )
                }
              >
                <ListOrdered />
                {q.name}
              </CommandItem>
            ))}
          </CommandGroup>
        )}
        {secrets && secrets.length > 0 && (
          <CommandGroup heading="Secrets">
            {secrets.map((s) => (
              <CommandItem
                key={s.name}
                value={s.name}
                onSelect={() =>
                  run(() =>
                    openTab({
                      id: `secret:${s.name}`,
                      kind: "secret",
                      secretName: s.name,
                      title: s.name,
                    }),
                  )
                }
              >
                <KeyRound />
                {s.name}
              </CommandItem>
            ))}
          </CommandGroup>
        )}
        {functions && functions.length > 0 && (
          <CommandGroup heading="Functions">
            {functions.map((f) => (
              <CommandItem
                key={f.name}
                value={f.name}
                onSelect={() =>
                  run(() =>
                    openTab({
                      id: `function:${f.name}`,
                      kind: "function",
                      functionName: f.name,
                      title: f.name,
                    }),
                  )
                }
              >
                <Zap />
                {f.name}
              </CommandItem>
            ))}
          </CommandGroup>
        )}
        {tables && tables.length > 0 && (
          <CommandGroup heading="Tables">
            {tables.map((t) => (
              <CommandItem
                key={t}
                value={t}
                onSelect={() =>
                  run(() =>
                    openTab({
                      id: `table:${t}`,
                      kind: "table",
                      tableName: t,
                      title: t,
                    }),
                  )
                }
              >
                <Database />
                {t}
              </CommandItem>
            ))}
          </CommandGroup>
        )}
        {topics && topics.length > 0 && (
          <CommandGroup heading="Topics">
            {topics.map((t) => (
              <CommandItem
                key={t.arn}
                value={t.name}
                onSelect={() =>
                  run(() =>
                    openTab({
                      id: `topic:${t.arn}`,
                      kind: "topic",
                      topicArn: t.arn,
                      title: t.name,
                    }),
                  )
                }
              >
                <Radio />
                {t.name}
              </CommandItem>
            ))}
          </CommandGroup>
        )}
        {logGroups && logGroups.length > 0 && (
          <CommandGroup heading="Log groups">
            {logGroups.map((g) => (
              <CommandItem
                key={g.name}
                value={g.name}
                onSelect={() =>
                  run(() =>
                    openTab({
                      id: `logGroup:${g.name}`,
                      kind: "logGroup",
                      logGroupName: g.name,
                      title: g.name,
                    }),
                  )
                }
              >
                <ScrollText />
                {g.name}
              </CommandItem>
            ))}
          </CommandGroup>
        )}
        {parameters && parameters.length > 0 && (
          <CommandGroup heading="Parameters">
            {parameters.map((p) => (
              <CommandItem
                key={p.name}
                value={p.name}
                onSelect={() =>
                  run(() =>
                    openTab({
                      id: `parameter:${p.name}`,
                      kind: "parameter",
                      parameterName: p.name,
                      title: p.name,
                    }),
                  )
                }
              >
                <ListTree />
                {p.name}
              </CommandItem>
            ))}
          </CommandGroup>
        )}
        {buses && buses.length > 0 && (
          <CommandGroup heading="Event buses">
            {buses.map((b) => (
              <CommandItem
                key={b.name}
                value={b.name}
                onSelect={() =>
                  run(() =>
                    openTab({
                      id: `eventBus:${b.name}`,
                      kind: "eventBus",
                      busName: b.name,
                      title: b.name,
                    }),
                  )
                }
              >
                <Webhook />
                {b.name}
              </CommandItem>
            ))}
          </CommandGroup>
        )}
        {scheduleGroups && scheduleGroups.length > 0 && (
          <CommandGroup heading="Schedule groups">
            {scheduleGroups.map((g) => (
              <CommandItem
                key={g.name}
                value={g.name}
                onSelect={() =>
                  run(() =>
                    openTab({
                      id: `scheduleGroup:${g.name}`,
                      kind: "scheduleGroup",
                      groupName: g.name,
                      title: g.name,
                    }),
                  )
                }
              >
                <CalendarClock />
                {g.name}
              </CommandItem>
            ))}
          </CommandGroup>
        )}
        {restApis && restApis.length > 0 && (
          <CommandGroup heading="REST APIs">
            {restApis.map((api) => (
              <CommandItem
                key={api.id}
                value={`${api.name} ${api.id}`}
                onSelect={() =>
                  run(() =>
                    openTab({
                      id: `restApi:${api.id}`,
                      kind: "restApi",
                      restApiId: api.id,
                      title: api.name,
                    }),
                  )
                }
              >
                <Network />
                {api.name}
              </CommandItem>
            ))}
          </CommandGroup>
        )}
        <CommandGroup heading="SES">
          <CommandItem
            value="SES Captured Mailbox"
            onSelect={() =>
              run(() =>
                openTab({
                  id: "sesMailbox:captured",
                  kind: "sesMailbox",
                  title: "SES Mailbox",
                }),
              )
            }
          >
            <Inbox />
            Captured mailbox
          </CommandItem>
          {identities?.map((id) => (
            <CommandItem
              key={id.identity}
              value={`SES identity ${id.identity}`}
              onSelect={() =>
                run(() =>
                  openTab({
                    id: `sesIdentity:${id.identity}`,
                    kind: "sesIdentity",
                    identityName: id.identity,
                    title: id.identity,
                  }),
                )
              }
            >
              <Mail />
              {id.identity}
            </CommandItem>
          ))}
        </CommandGroup>
        {iamRoles && iamRoles.length > 0 && (
          <CommandGroup heading="IAM Roles">
            {iamRoles.map((r) => (
              <CommandItem
                key={r.roleName}
                value={`IAM role ${r.roleName}`}
                onSelect={() =>
                  run(() =>
                    openTab({
                      id: `iamRole:${r.roleName}`,
                      kind: "iamRole",
                      roleName: r.roleName,
                      title: r.roleName,
                    }),
                  )
                }
              >
                <ShieldCheck />
                {r.roleName}
              </CommandItem>
            ))}
          </CommandGroup>
        )}
        {iamUsers && iamUsers.length > 0 && (
          <CommandGroup heading="IAM Users">
            {iamUsers.map((u) => (
              <CommandItem
                key={u.userName}
                value={`IAM user ${u.userName}`}
                onSelect={() =>
                  run(() =>
                    openTab({
                      id: `iamUser:${u.userName}`,
                      kind: "iamUser",
                      userName: u.userName,
                      title: u.userName,
                    }),
                  )
                }
              >
                <User />
                {u.userName}
              </CommandItem>
            ))}
          </CommandGroup>
        )}
        <CommandGroup heading="Preferences">
          <CommandItem
            value="Toggle theme"
            onSelect={() => run(() => useTheme.getState().toggle())}
          >
            {theme === "dark" ? <Sun /> : <Moon />}
            Toggle theme
          </CommandItem>
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  );
}
