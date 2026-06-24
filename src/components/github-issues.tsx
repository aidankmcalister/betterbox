import { useCallback, useMemo, useRef, useState } from "react";
import {
  CheckIcon,
  ChevronDownIcon,
  CircleDotIcon,
  MessageSquareIcon,
  UserRoundCheckIcon,
  XIcon,
} from "lucide-react";

import { linkGithub } from "@/lib/auth-client";
import { useGithubIssuesQuery, type GithubIssue } from "@/lib/github-queries";
import { GithubMark } from "@/components/github-mark";
import { Button } from "@/components/ui/button";
import { Hint } from "@/components/ui/tooltip";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

// NOTE: usePanelWidth / KpiChip / the connect+error+loading states mirror the
// pull-requests panel. If a third GitHub panel lands, lift these into a shared
// github-panel module.
function relTime(iso: string, now: number): string {
  const m = Math.round((now - new Date(iso).getTime()) / 60000);
  if (m < 1) return "now";
  if (m < 60) return `${m}m`;
  if (m < 1440) return `${Math.round(m / 60)}h`;
  return `${Math.round(m / 1440)}d`;
}

/** The panel's own width (callback ref so it attaches after the loading state
 *  clears) — drives the narrow-cards / wide-table switch. */
function usePanelWidth() {
  const [width, setWidth] = useState(0);
  const observerRef = useRef<ResizeObserver | null>(null);
  const ref = useCallback((node: HTMLDivElement | null) => {
    observerRef.current?.disconnect();
    if (!node) {
      observerRef.current = null;
      return;
    }
    const observer = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width;
      if (w) setWidth(w);
    });
    observer.observe(node);
    observerRef.current = observer;
  }, []);
  return [ref, width] as const;
}

function Labels({
  labels,
  max = 3,
}: {
  labels: GithubIssue["labels"];
  max?: number;
}) {
  if (labels.length === 0) return null;
  return (
    <span className="flex min-w-0 items-center gap-1">
      {labels.slice(0, max).map((l) => (
        <span
          key={l.name}
          className="inline-flex max-w-[120px] items-center gap-1 rounded-full border px-1.5 py-px text-[10.5px]"
          style={{ borderColor: `${l.color}66`, color: l.color }}
        >
          <span
            className="size-1.5 shrink-0 rounded-full"
            style={{ background: l.color }}
          />
          <span className="truncate">{l.name}</span>
        </span>
      ))}
      {labels.length > max && (
        <span className="shrink-0 text-[10.5px] text-muted-foreground/60">
          +{labels.length - max}
        </span>
      )}
    </span>
  );
}

function KpiChip({
  label,
  value,
  accent = false,
}: {
  label: string;
  value: number;
  accent?: boolean;
}) {
  return (
    <div className="inline-flex items-baseline gap-1.5 rounded-md border border-border bg-muted/30 px-2 py-1">
      <span
        className={cn(
          "text-[14px] font-semibold tracking-[-0.3px]",
          accent && value > 0 ? "text-primary" : "text-foreground",
        )}
      >
        {value}
      </span>
      <span className="text-[10.5px] whitespace-nowrap text-muted-foreground/70">
        {label}
      </span>
    </div>
  );
}

type FilterId = "all" | "assigned" | "created";

function FilterMenu({
  value,
  onChange,
  items,
}: {
  value: FilterId;
  onChange: (id: FilterId) => void;
  items: { id: FilterId; label: string; count: number }[];
}) {
  const current = items.find((it) => it.id === value);
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={<Button variant="outline" size="sm" className="h-7 font-mono" />}
      >
        <span className="text-[11.5px]">{current?.label ?? "Filter"}</span>
        <span className="text-[10.5px] text-muted-foreground/70">
          {current?.count ?? 0}
        </span>
        <ChevronDownIcon className="size-3.5" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-48">
        {items.map((it) => (
          <DropdownMenuItem key={it.id} onClick={() => onChange(it.id)}>
            <span className="flex-1 text-[13px]">{it.label}</span>
            <span className="font-mono text-[11px] text-muted-foreground/60">
              {it.count}
            </span>
            {it.id === value && (
              <CheckIcon className="size-3.5 shrink-0 text-primary" />
            )}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

const matches = (i: GithubIssue, f: FilterId) =>
  f === "all" ? true : f === "assigned" ? i.assignedToYou : !i.assignedToYou;

/** Wide layout: dense table row spread across fixed columns. */
function IssueRow({ issue, now }: { issue: GithubIssue; now: number }) {
  return (
    <a
      href={issue.url}
      target="_blank"
      rel="noopener noreferrer"
      className={cn(
        "flex h-[34px] items-center gap-4 border-b border-l-2 border-border px-5 hover:bg-muted/50",
        issue.assignedToYou ? "border-l-primary" : "border-l-transparent",
      )}
    >
      <CircleDotIcon className="size-4 flex-none text-label-green" />
      <span className="w-[150px] flex-none truncate font-mono text-[11.5px] text-muted-foreground">
        {issue.repo}
      </span>
      <span className="w-[48px] flex-none font-mono text-[11.5px] text-muted-foreground/60">
        #{issue.num}
      </span>
      <span className="min-w-0 flex-1 truncate text-[12.5px] font-medium text-foreground">
        {issue.title}
      </span>
      <span className="flex w-[200px] flex-none overflow-hidden">
        <Labels labels={issue.labels} max={2} />
      </span>
      <Hint label={`${issue.comments} comment${issue.comments === 1 ? "" : "s"}`}>
        <span className="flex w-[44px] flex-none items-center gap-1 font-mono text-[11px] text-muted-foreground/60">
          <MessageSquareIcon className="size-3" />
          {issue.comments}
        </span>
      </Hint>
      <span className="w-[40px] flex-none font-mono text-[11px] text-muted-foreground/60">
        {relTime(issue.updated, now)}
      </span>
    </a>
  );
}

/** Narrow layout: stacked card — repo · #num · age, title, then labels +
 *  comments. Never overflows a thin pane. */
function IssueCard({ issue, now }: { issue: GithubIssue; now: number }) {
  return (
    <a
      href={issue.url}
      target="_blank"
      rel="noopener noreferrer"
      className={cn(
        "flex flex-col gap-1.5 border-b border-l-2 border-border px-3 py-2.5 hover:bg-muted/50",
        issue.assignedToYou ? "border-l-primary" : "border-l-transparent",
      )}
    >
      <div className="flex items-center gap-2">
        <CircleDotIcon className="size-4 flex-none text-label-green" />
        <span className="min-w-0 truncate font-mono text-[11.5px] text-muted-foreground">
          {issue.repo}
        </span>
        <span className="flex-none font-mono text-[11.5px] text-muted-foreground/60">
          #{issue.num}
        </span>
        {issue.assignedToYou && (
          <Hint label="Assigned to you">
            <UserRoundCheckIcon className="size-3 flex-none text-primary" />
          </Hint>
        )}
        <span className="ml-auto flex-none font-mono text-[11px] text-muted-foreground/60">
          {relTime(issue.updated, now)}
        </span>
      </div>
      <p className="line-clamp-2 text-[13.5px] leading-snug font-medium text-foreground">
        {issue.title}
      </p>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 pt-0.5">
        <Labels labels={issue.labels} />
        <span className="inline-flex items-center gap-1 font-mono text-[11px] text-muted-foreground/60">
          <MessageSquareIcon className="size-3" />
          {issue.comments}
        </span>
      </div>
    </a>
  );
}

export function GithubIssuesPage({ signedIn = false }: { signedIn?: boolean }) {
  const [filter, setFilter] = useState<FilterId>("all");
  const [ref, width] = usePanelWidth();
  const wide = width >= 820;
  const query = useGithubIssuesQuery(signedIn);
  // biome-ignore lint/correctness/useExhaustiveDependencies: refresh the "now" baseline only when fresh issue data lands.
  const now = useMemo(() => Date.now(), [query.dataUpdatedAt]);

  if (query.isLoading) return <LoadingState />;
  if (query.data && !query.data.linked) return <ConnectState />;
  if (query.isError || query.data?.error) {
    return (
      <ErrorState
        message={query.data?.error ?? String(query.error)}
        onRetry={() => query.refetch()}
      />
    );
  }

  const issues = query.data?.issues ?? [];
  const nAssigned = issues.filter((i) => i.assignedToYou).length;
  const nCreated = issues.length - nAssigned;
  const items: { id: FilterId; label: string; count: number }[] = [
    { id: "all", label: "All", count: issues.length },
    { id: "assigned", label: "Assigned to you", count: nAssigned },
    { id: "created", label: "Opened by you", count: nCreated },
  ];
  const rows = issues.filter((i) => matches(i, filter));

  return (
    <div ref={ref} className="flex h-full min-w-0 flex-col bg-background">
      <div className="flex flex-none flex-wrap gap-1.5 border-b border-border px-3 py-2">
        <KpiChip label="Assigned to you" value={nAssigned} accent />
        <KpiChip label="Opened by you" value={nCreated} />
      </div>

      <div className="flex flex-none items-center gap-2 border-b border-border px-3 py-2">
        <FilterMenu value={filter} onChange={setFilter} items={items} />
        <span className="ml-auto font-mono text-[10.5px] text-muted-foreground/60">
          {rows.length} shown
        </span>
      </div>

      <div className="flex-1 overflow-y-auto">
        {wide && rows.length > 0 && (
          <div className="sticky top-0 z-1 flex h-[30px] items-center gap-4 border-b border-l-2 border-border border-l-transparent bg-background px-5 text-[10.5px] tracking-[0.4px] text-muted-foreground/60 uppercase">
            <span className="w-4 flex-none" />
            <span className="w-[150px] flex-none">Repo</span>
            <span className="w-[48px] flex-none">Issue</span>
            <span className="min-w-0 flex-1 truncate">Title</span>
            <span className="w-[200px] flex-none">Labels</span>
            <span className="w-[44px] flex-none">Cmts</span>
            <span className="w-[40px] flex-none">Age</span>
          </div>
        )}
        {rows.length === 0 ? (
          <div className="flex flex-col items-center gap-2.5 px-6 py-14 text-center">
            <span className="inline-flex size-9 items-center justify-center rounded-full bg-muted">
              <CircleDotIcon className="size-[17px] text-muted-foreground/60" />
            </span>
            <span className="text-[13.5px] font-semibold">Nothing here</span>
            <span className="text-[12.5px] text-muted-foreground/80">
              No issues match this filter.
            </span>
          </div>
        ) : (
          <>
            {rows.map((issue) =>
              wide ? (
                <IssueRow key={issue.id} issue={issue} now={now} />
              ) : (
                <IssueCard key={issue.id} issue={issue} now={now} />
              ),
            )}
            <div className="flex items-center justify-center gap-2 p-3 font-mono text-[10.5px] text-muted-foreground/60">
              <GithubMark className="size-3" />
              live from the GitHub API
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function LoadingState() {
  return (
    <div className="flex h-full flex-col bg-background">
      <div className="flex flex-none flex-wrap gap-1.5 border-b border-border px-3 py-2">
        {Array.from({ length: 2 }).map((_, i) => (
          <div
            // biome-ignore lint/suspicious/noArrayIndexKey: fixed-length skeleton placeholders, never reordered.
            key={i}
            className="h-7 w-28 animate-pulse rounded-md bg-muted/60"
          />
        ))}
      </div>
      <div className="flex-1 space-y-px p-px">
        {Array.from({ length: 6 }).map((_, i) => (
          <div
            // biome-ignore lint/suspicious/noArrayIndexKey: fixed-length skeleton placeholders, never reordered.
            key={i}
            className="flex flex-col gap-1.5 px-3 py-2.5"
          >
            <div className="flex items-center gap-2">
              <div className="size-4 animate-pulse rounded-full bg-muted" />
              <div className="h-2.5 w-24 animate-pulse rounded bg-muted" />
            </div>
            <div className="h-3 w-3/4 animate-pulse rounded bg-muted/60" />
          </div>
        ))}
      </div>
    </div>
  );
}

function ConnectState() {
  return (
    <div className="flex h-full items-center justify-center bg-background px-6">
      <div className="flex max-w-sm flex-col items-center gap-4 text-center">
        <span className="inline-flex size-12 items-center justify-center rounded-xl bg-muted">
          <GithubMark className="size-6 text-foreground" />
        </span>
        <h2 className="text-xl font-semibold tracking-[-0.3px]">Connect GitHub</h2>
        <p className="text-[13px] leading-relaxed text-muted-foreground">
          Link your GitHub account to BetterBox (no new account, just a sign-in)
          and the issues assigned to you, or that you opened, show up here.
        </p>
        <Button onClick={linkGithub} className="mt-1">
          <GithubMark className="size-4" />
          Connect GitHub
        </Button>
        <span className="font-mono text-[11px] text-muted-foreground/60">
          read-only · assigned + authored issues
        </span>
      </div>
    </div>
  );
}

function ErrorState({
  message,
  onRetry,
}: {
  message: string;
  onRetry: () => void;
}) {
  return (
    <div className="flex h-full items-center justify-center bg-background px-6">
      <div className="flex max-w-sm flex-col items-center gap-3 text-center">
        <span className="inline-flex size-10 items-center justify-center rounded-full bg-label-red/15">
          <XIcon className="size-5 text-label-red" />
        </span>
        <h2 className="text-base font-semibold">Couldn’t load issues</h2>
        <p className="font-mono text-[11.5px] wrap-break-word text-muted-foreground/80">
          {message}
        </p>
        <Button variant="outline" size="sm" onClick={onRetry}>
          Retry
        </Button>
      </div>
    </div>
  );
}
