import { useMemo, useState } from "react";
import {
  CheckIcon,
  ChevronDownIcon,
  ClockIcon,
  EyeIcon,
  GitMergeIcon,
  GitPullRequestArrowIcon,
  GitPullRequestClosedIcon,
  GitPullRequestDraftIcon,
  MessageSquareIcon,
  RefreshCwIcon,
  XIcon,
} from "lucide-react";

import { toast } from "sonner";

import { linkGithub } from "@/lib/auth-client";
import { usePullRequestsQuery, type PullRequest } from "@/lib/github-queries";
import demoPullRequests from "@/data/demo-pull-requests.json";
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

function relTime(iso: string, now: number): string {
  const m = Math.round((now - new Date(iso).getTime()) / 60000);
  if (m < 1) return "now";
  if (m < 60) return `${m}m`;
  if (m < 1440) return `${Math.round(m / 60)}h`;
  return `${Math.round(m / 1440)}d`;
}

const STATE_ICON = {
  open: { Icon: GitPullRequestArrowIcon, cls: "text-label-green" },
  draft: { Icon: GitPullRequestDraftIcon, cls: "text-muted-foreground/70" },
  merged: { Icon: GitMergeIcon, cls: "text-label-purple" },
  closed: { Icon: GitPullRequestClosedIcon, cls: "text-label-red" },
} as const;

function ReviewPill({ pr }: { pr: PullRequest }) {
  const { label, cls, hint } = reviewLook(pr);
  return (
    <Hint label={hint}>
      <span
        className={cn(
          "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-px text-[11px] whitespace-nowrap",
          cls,
        )}
      >
        <span className="size-[5px] flex-none rounded-full bg-current" />
        {label}
      </span>
    </Hint>
  );
}

function reviewLook(pr: PullRequest): {
  label: string;
  cls: string;
  hint: string;
} {
  if (pr.state === "merged")
    return {
      label: "Merged",
      cls: "border-label-purple/40 text-label-purple",
      hint: "Merged",
    };
  if (pr.state === "closed")
    return {
      label: "Closed",
      cls: "border-label-red/40 text-label-red",
      hint: "Closed without merging",
    };
  if (pr.state === "draft")
    return {
      label: "Draft",
      cls: "border-muted-foreground/30 text-muted-foreground/70",
      hint: "Still a draft, not open for review yet",
    };
  if (pr.review === "approved")
    return {
      label: "Approved",
      cls: "border-success/40 text-success",
      hint: "Approved by a reviewer",
    };
  if (pr.review === "changes")
    return {
      label: "Needs changes",
      cls: "border-label-red/40 text-label-red",
      hint: "A reviewer requested changes",
    };
  if (pr.review === "commented")
    return {
      label: "Commented",
      cls: "border-label-blue/40 text-label-blue",
      hint: "Reviewers commented without an approval or change request",
    };
  return {
    label: "Needs review",
    cls: "border-muted-foreground/30 text-muted-foreground/80",
    hint: "Open and waiting on a review",
  };
}

function CiDot({ ci }: { ci: PullRequest["ci"] }) {
  if (ci === "none")
    return (
      <span className="w-[18px] text-center font-mono text-xs text-muted-foreground/60">
        —
      </span>
    );
  const look = {
    passing: { Icon: CheckIcon, cls: "text-success bg-success/15" },
    failing: { Icon: XIcon, cls: "text-label-red bg-label-red/15" },
    pending: { Icon: ClockIcon, cls: "text-label-yellow bg-label-yellow/15" },
  }[ci];
  return (
    <span
      className={cn(
        "inline-flex size-[18px] flex-none items-center justify-center rounded-full",
        look.cls,
      )}
    >
      <look.Icon className="size-[11px]" strokeWidth={2.5} />
    </span>
  );
}

/** Inline +adds / −dels with a split bar — sits on one line so it shares a
 *  baseline with the pill, comments and CI in the card's metrics row. */
function DiffStat({ pr }: { pr: PullRequest }) {
  const total = pr.additions + pr.deletions || 1;
  const addPct = Math.round((pr.additions / total) * 100);
  return (
    <span className="inline-flex items-center gap-2 font-mono text-[11px] leading-none">
      <span className="text-label-green">+{pr.additions.toLocaleString()}</span>
      <span className="flex h-[3px] w-10 overflow-hidden rounded-full bg-muted">
        <span className="bg-label-green" style={{ width: `${addPct}%` }} />
        <span className="bg-label-red" style={{ width: `${100 - addPct}%` }} />
      </span>
      <span className="text-label-red">−{pr.deletions.toLocaleString()}</span>
    </span>
  );
}

/** Demo: a PR row would open github.com in the real app. Toast that intent
 *  instead of navigating (the demo's urls are sealed placeholders). */
function demoOpenToast(pr: PullRequest) {
  toast("Opens on GitHub", {
    icon: <GithubMark className="size-4" />,
    description: `In the live app, ${pr.repo} #${pr.num} opens on github.com — sealed in this demo.`,
  });
}

/** A single PR as a stacked card: repo · #num · age, the title, then a wrapping
 *  metrics row. No fixed-width columns, so it never overflows the pane — the
 *  same card works whether the panel is a narrow tile or full width. */
function PrCard({
  pr,
  now,
  demo,
}: {
  pr: PullRequest;
  now: number;
  demo: boolean;
}) {
  const { Icon, cls } = STATE_ICON[pr.state];
  const dim = pr.state === "merged" || pr.state === "closed";
  const navigable = !!pr.url && pr.url !== "#";
  return (
    <a
      href={navigable ? pr.url : undefined}
      target={navigable ? "_blank" : undefined}
      rel="noopener noreferrer"
      onClick={
        demo
          ? (event) => {
              event.preventDefault();
              demoOpenToast(pr);
            }
          : undefined
      }
      className={cn(
        "flex flex-col gap-1.5 border-b border-l-2 border-border px-3 py-2.5 hover:bg-muted/50",
        pr.awaitsYou ? "border-l-primary" : "border-l-transparent",
        navigable || demo ? "cursor-pointer" : "cursor-default",
      )}
    >
      {/* repo · #num · when */}
      <div className="flex items-center gap-2">
        <Icon className={cn("size-4 flex-none", cls)} />
        <span className="min-w-0 truncate font-mono text-[11.5px] text-muted-foreground">
          {pr.repo}
        </span>
        <span className="flex-none font-mono text-[11.5px] text-muted-foreground/60">
          #{pr.num}
        </span>
        {pr.awaitsYou && <EyeIcon className="size-3 flex-none text-primary" />}
        <span className="ml-auto flex-none font-mono text-[11px] text-muted-foreground/60">
          {relTime(pr.updated, now)}
        </span>
      </div>

      {/* title + branch */}
      <div>
        <p
          className={cn(
            "line-clamp-2 text-[13.5px] leading-snug",
            pr.awaitsYou ? "font-semibold" : "font-medium",
            dim ? "text-muted-foreground/70" : "text-foreground",
          )}
        >
          {pr.title}
        </p>
        <p className="truncate font-mono text-[11px] text-muted-foreground/60">
          {pr.branch}
        </p>
      </div>

      {/* metrics — wraps onto its own line(s), never pushes the card wide */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 pt-0.5">
        <ReviewPill pr={pr} />
        <DiffStat pr={pr} />
        <span className="inline-flex items-center gap-1 font-mono text-[11px] text-muted-foreground/60">
          <MessageSquareIcon className="size-3" />
          {pr.comments}
        </span>
        <Hint label={`CI ${pr.ci === "none" ? "not run" : pr.ci}`}>
          <span className="flex">
            <CiDot ci={pr.ci} />
          </span>
        </Hint>
      </div>
    </a>
  );
}

/** Compact stat chip — wraps with its siblings so four stats fit a narrow pane
 *  without a fixed grid that would overflow. */
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

type FilterId = "all" | "open" | "review" | "approved" | "merged" | "closed";

/** Filter as a dropdown (not a tab strip) so it stays one compact control at any
 *  pane width instead of overflowing or scrolling. */
function FilterMenu({
  value,
  onChange,
  items,
}: {
  value: FilterId;
  onChange: (id: FilterId) => void;
  items: { id: FilterId; label: string; count?: number }[];
}) {
  const current = items.find((it) => it.id === value);
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={<Button variant="outline" size="sm" className="h-7 font-mono" />}
      >
        <span className="text-[11.5px]">{current?.label ?? "Filter"}</span>
        {current?.count != null && (
          <span className="text-[10.5px] text-muted-foreground/70">
            {current.count}
          </span>
        )}
        <ChevronDownIcon className="size-3.5" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-48">
        {items.map((it) => (
          <DropdownMenuItem key={it.id} onClick={() => onChange(it.id)}>
            <span className="flex-1 text-[13px]">{it.label}</span>
            {it.count != null && (
              <span className="font-mono text-[11px] text-muted-foreground/60">
                {it.count}
              </span>
            )}
            {it.id === value && (
              <CheckIcon className="size-3.5 shrink-0 text-primary" />
            )}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

const matches = (p: PullRequest, f: FilterId) => {
  if (f === "all") return true;
  if (f === "open") return p.state === "open" || p.state === "draft";
  if (f === "review") return p.awaitsYou;
  if (f === "approved") return p.state === "open" && p.review === "approved";
  if (f === "merged") return p.state === "merged";
  if (f === "closed") return p.state === "closed";
  return true;
};

type DemoPr = Omit<PullRequest, "url" | "author" | "labels" | "updated"> & {
  minutesAgo: number;
};

/** Seeded PRs for the landing-page sandbox — no network, fresh relative times.
 *  Data lives in `@/data/demo-pull-requests`. */
function makeDemoPullRequests(): PullRequest[] {
  const now = Date.now();
  return (demoPullRequests as unknown as DemoPr[]).map(
    ({ minutesAgo, ...rec }) => ({
      ...rec,
      labels: [],
      author: "you",
      url: "#",
      updated: new Date(now - minutesAgo * 60_000).toISOString(),
    }),
  );
}

export function PullRequestsPage({
  signedIn = false,
  demo = false,
}: {
  signedIn?: boolean;
  /** Landing-page sandbox: render seeded PRs, no API / connect / loading. */
  demo?: boolean;
}) {
  const [filter, setFilter] = useState<FilterId>("open");
  const query = usePullRequestsQuery(signedIn && !demo);
  // biome-ignore lint/correctness/useExhaustiveDependencies: recompute the "now" baseline for relative times only when fresh PR data lands.
  const now = useMemo(() => Date.now(), [query.dataUpdatedAt]);
  const demoPrs = useMemo(() => (demo ? makeDemoPullRequests() : []), [demo]);

  if (!demo) {
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
  }

  const prs = demo ? demoPrs : (query.data?.prs ?? []);
  const fetching = !demo && query.isFetching;
  const refresh = () => {
    if (!demo) query.refetch();
  };
  const nOpen = prs.filter(
    (p) => p.state === "open" || p.state === "draft",
  ).length;
  const nReview = prs.filter((p) => p.awaitsYou).length;
  const nChanges = prs.filter(
    (p) => p.state === "open" && p.review === "changes",
  ).length;
  const nMerged = prs.filter((p) => p.state === "merged").length;

  const items: { id: FilterId; label: string; count?: number }[] = [
    { id: "open", label: "Open", count: nOpen },
    { id: "review", label: "Review requested", count: nReview },
    { id: "approved", label: "Approved" },
    { id: "merged", label: "Merged" },
    { id: "closed", label: "Closed" },
    { id: "all", label: "All", count: prs.length },
  ];
  const rows = prs.filter((p) => matches(p, filter));

  return (
    <div className="flex h-full min-w-0 flex-col bg-background">
      {/* summary + refresh — the pane header already carries the title */}
      <div className="flex h-9 flex-none items-center gap-2 border-b border-border px-3">
        <span className="min-w-0 flex-1 truncate font-mono text-[11px] text-muted-foreground/70">
          {nOpen} open · {nReview} awaiting you
        </span>
        <span className="inline-flex flex-none items-center gap-1 font-mono text-[10.5px] text-success">
          <span className="size-1.5 rounded-full bg-success" />
          live
        </span>
        <Hint label="Refresh">
          <button
            type="button"
            onClick={refresh}
            className="inline-flex size-6 flex-none items-center justify-center rounded text-muted-foreground/70 hover:bg-muted hover:text-foreground"
          >
            <RefreshCwIcon className={cn("size-3.5", fetching && "animate-spin")} />
          </button>
        </Hint>
      </div>

      {/* KPI chips — wrap onto a second line on a narrow pane, never overflow */}
      <div className="flex flex-none flex-wrap gap-1.5 border-b border-border px-3 py-2">
        <KpiChip label="Open" value={nOpen} />
        <KpiChip label="Awaiting you" value={nReview} accent />
        <KpiChip label="Changes" value={nChanges} />
        <KpiChip label="Merged" value={nMerged} />
      </div>

      {/* filter + count */}
      <div className="flex flex-none items-center gap-2 border-b border-border px-3 py-2">
        <FilterMenu value={filter} onChange={setFilter} items={items} />
        <span className="ml-auto font-mono text-[10.5px] text-muted-foreground/60">
          {rows.length} shown
        </span>
      </div>

      {/* list — stacked cards, no horizontal overflow at any width */}
      <div className="flex-1 overflow-y-auto">
        {rows.length === 0 ? (
          <div className="flex flex-col items-center gap-2.5 px-6 py-14 text-center">
            <span className="inline-flex size-9 items-center justify-center rounded-full bg-muted">
              <GitPullRequestArrowIcon className="size-[17px] text-muted-foreground/60" />
            </span>
            <span className="text-[13.5px] font-semibold">Nothing here</span>
            <span className="text-[12.5px] text-muted-foreground/80">
              No pull requests match this filter.
            </span>
          </div>
        ) : (
          <>
            {rows.map((pr) => (
              <PrCard key={pr.id} pr={pr} now={now} demo={demo} />
            ))}
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
      <div className="flex h-9 flex-none items-center border-b border-border px-3">
        <div className="h-2.5 w-32 animate-pulse rounded bg-muted" />
      </div>
      <div className="flex flex-none flex-wrap gap-1.5 border-b border-border px-3 py-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            // biome-ignore lint/suspicious/noArrayIndexKey: fixed-length skeleton placeholders, never reordered.
            key={i}
            className="h-7 w-20 animate-pulse rounded-md bg-muted/60"
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
        <h2 className="text-xl font-semibold tracking-[-0.3px]">
          Connect GitHub
        </h2>
        <p className="text-[13px] leading-relaxed text-muted-foreground">
          Link your GitHub account to BetterBox (no new account, just a sign-in)
          and your pull requests show up here: open, awaiting your review,
          approved, and merged, across every repo you touch.
        </p>
        <Button onClick={linkGithub} className="mt-1">
          <GithubMark className="size-4" />
          Connect GitHub
        </Button>
        <span className="font-mono text-[11px] text-muted-foreground/60">
          read-only · authored + review-requested PRs
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
        <h2 className="text-base font-semibold">Couldn’t load pull requests</h2>
        <p className="font-mono text-[11.5px] wrap-break-word text-muted-foreground/80">
          {message}
        </p>
        <Button variant="outline" size="sm" onClick={onRetry}>
          <RefreshCwIcon className="size-3.5" />
          Retry
        </Button>
      </div>
    </div>
  );
}
