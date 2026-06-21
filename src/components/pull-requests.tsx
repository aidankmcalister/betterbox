import { useMemo, useState } from "react";
import {
  CheckIcon,
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
import { useIsMobile } from "@/hooks/use-mobile";
import { usePullRequestsQuery, type PullRequest } from "@/lib/github-queries";
import demoPullRequests from "@/data/demo-pull-requests.json";
import { GithubMark } from "@/components/github-mark";
import { Button } from "@/components/ui/button";
import { Hint } from "@/components/ui/tooltip";
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
      label: "Changes",
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
    label: "Review",
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

function DiffStat({ pr }: { pr: PullRequest }) {
  const total = pr.additions + pr.deletions || 1;
  const addPct = Math.round((pr.additions / total) * 100);
  return (
    // +adds / −dels on their own side, with a split bar underneath whose green
    // (left) and red (right) line up with the number above each.
    <span className="flex w-[96px] flex-none flex-col gap-[3px] font-mono text-[11px] leading-none">
      <span className="flex items-baseline justify-between">
        <span className="text-label-green">+{pr.additions.toLocaleString()}</span>
        <span className="text-label-red">−{pr.deletions.toLocaleString()}</span>
      </span>
      <span className="flex h-[3px] w-full overflow-hidden rounded-full bg-muted">
        <span className="bg-label-green" style={{ width: `${addPct}%` }} />
        <span className="bg-label-red" style={{ width: `${100 - addPct}%` }} />
      </span>
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

function Row({
  pr,
  now,
  demo,
}: {
  pr: PullRequest;
  now: number;
  demo: boolean;
}) {
  const dim = pr.state === "merged" || pr.state === "closed";
  // Demo rows carry a placeholder url; clicking toasts the intent rather than
  // opening GitHub. Real rows link out normally.
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
        "flex h-[34px] items-center gap-4 border-b border-l-2 border-border px-5 hover:bg-muted/50",
        pr.awaitsYou ? "border-l-primary" : "border-l-transparent",
        navigable || demo ? "cursor-pointer" : "cursor-default",
      )}
    >
      {/* status — header reads "Needs", so this reads "Needs Changes" / "Needs Review" */}
      <span className="flex w-[116px] flex-none justify-start">
        <ReviewPill pr={pr} />
      </span>

      {/* repo */}
      <span className="w-[140px] flex-none truncate font-mono text-[11.5px] text-muted-foreground">
        {pr.repo}
      </span>

      {/* PR number */}
      <span className="w-[52px] flex-none font-mono text-[11.5px] text-muted-foreground/60">
        #{pr.num}
      </span>

      {/* title + faint branch — single line, no wrap */}
      <span className="min-w-0 flex-1 truncate text-muted-foreground/60">
        <span
          className={cn(
            "text-[12.5px]",
            pr.awaitsYou ? "font-semibold" : "font-medium",
            dim ? "text-muted-foreground/70" : "text-foreground",
          )}
        >
          {pr.title}
        </span>
        <span className="font-mono text-[11px] text-muted-foreground/60">
          {`  —  ${pr.branch}`}
        </span>
      </span>

      {/* changes */}
      <Hint
        label={`+${pr.additions.toLocaleString()} added · −${pr.deletions.toLocaleString()} removed`}
      >
        <span className="flex w-[124px] flex-none justify-end">
          <DiffStat pr={pr} />
        </span>
      </Hint>

      {/* comments */}
      <Hint label={`${pr.comments} comment${pr.comments === 1 ? "" : "s"}`}>
        <span className="flex w-[44px] flex-none items-center justify-end gap-1 font-mono text-[11px] text-muted-foreground/60">
          <MessageSquareIcon className="size-3" />
          {pr.comments}
        </span>
      </Hint>

      {/* CI */}
      <span className="flex w-[22px] flex-none justify-center">
        <Hint label={`CI ${pr.ci === "none" ? "not run" : pr.ci}`}>
          <span className="flex">
            <CiDot ci={pr.ci} />
          </span>
        </Hint>
      </span>

      {/* age */}
      <span className="w-[56px] flex-none text-right font-mono text-[11px] text-muted-foreground/60">
        {relTime(pr.updated, now)}
      </span>
    </a>
  );
}

/** Mobile rendering of a PR — stacked instead of a wide table row, so the title
 *  is fully readable and the metrics wrap onto their own line. */
function MobileCard({
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
        "flex flex-col gap-1.5 border-b border-l-2 border-border px-4 py-3 hover:bg-muted/50",
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

      {/* metrics row */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 pt-0.5">
        <ReviewPill pr={pr} />
        <DiffStat pr={pr} />
        <span className="inline-flex items-center gap-1 font-mono text-[11px] text-muted-foreground/60">
          <MessageSquareIcon className="size-3" />
          {pr.comments}
        </span>
        <CiDot ci={pr.ci} />
      </div>
    </a>
  );
}

function Kpi({
  label,
  value,
  sub,
}: {
  label: string;
  value: number;
  sub?: string;
}) {
  return (
    <div className="border-l border-border px-3 pt-[9px] pb-2.5 nth-[n+3]:border-t nth-[odd]:border-l-0 sm:px-5 sm:first:border-l-0 sm:nth-[n+3]:border-t-0 sm:nth-[odd]:border-l">
      <div className="mb-1 text-[11px] text-muted-foreground/80">{label}</div>
      <div className="flex items-baseline gap-2">
        <span className="text-[22px] font-semibold tracking-[-0.8px] text-foreground">
          {value}
        </span>
        {sub && (
          <span className="font-mono text-[11px] text-muted-foreground/60">
            {sub}
          </span>
        )}
      </div>
    </div>
  );
}

type FilterId = "all" | "open" | "review" | "approved" | "merged" | "closed";

function Segmented({
  value,
  onChange,
  items,
}: {
  value: FilterId;
  onChange: (id: FilterId) => void;
  items: { id: FilterId; label: string; count?: number }[];
}) {
  return (
    <div className="inline-flex items-center gap-0.5 rounded-[7px] border border-border bg-muted/50 p-0.5">
      {items.map((it) => {
        const on = it.id === value;
        return (
          <button
            key={it.id}
            type="button"
            onClick={() => onChange(it.id)}
            className={cn(
              "inline-flex h-6 items-center gap-1.5 rounded-[5px] px-2.5 font-mono text-[11.5px] whitespace-nowrap",
              on
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground/80 hover:text-foreground",
            )}
          >
            {it.label}
            {it.count != null && (
              <span
                className={cn(
                  "text-[10.5px]",
                  on ? "text-muted-foreground/80" : "text-muted-foreground/60",
                )}
              >
                {it.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
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
  const isMobile = useIsMobile();
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
  const login = demo ? "octocat" : query.data?.login;
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
      {/* page header */}
      <div className="flex h-[52px] flex-none items-center gap-2.5 border-b border-border px-3 sm:px-5">
        <h2 className="text-lg font-semibold tracking-[-0.4px] whitespace-nowrap">
          Pull requests
        </h2>
        <span className="hidden font-mono text-[11.5px] whitespace-nowrap text-muted-foreground/60 sm:inline">
          {nOpen} open · {nReview} awaiting you
        </span>
        <div className="ml-auto flex items-center gap-2 font-mono text-[11px] text-muted-foreground/80 sm:gap-3.5">
          <span className="inline-flex items-center gap-1.5 text-success">
            <span className="size-1.5 rounded-full bg-success shadow-[0_0_0_3px_color-mix(in_srgb,var(--color-success)_20%,transparent)]" />
            live
          </span>
          {login && <span className="hidden sm:inline">@{login}</span>}
          <button
            type="button"
            onClick={refresh}
            className="inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1 text-muted-foreground hover:bg-muted/50 hover:text-foreground"
          >
            <RefreshCwIcon
              className={cn("size-3", fetching && "animate-spin")}
            />
            Refresh
          </button>
        </div>
      </div>

      {/* KPI strip */}
      <div className="grid flex-none grid-cols-2 border-b border-border sm:grid-cols-4">
        <Kpi label="Open" value={nOpen} sub="incl. drafts" />
        <Kpi label="Awaiting your review" value={nReview} />
        <Kpi label="Changes requested" value={nChanges} />
        <Kpi label="Merged" value={nMerged} />
      </div>

      {/* filter bar */}
      <div className="flex flex-none items-center gap-3 border-b border-border px-3 py-[9px] sm:px-5">
        <div className="-mx-1 no-scrollbar min-w-0 flex-1 overflow-x-auto px-1 sm:flex-none">
          <Segmented value={filter} onChange={setFilter} items={items} />
        </div>
        <span className="ml-auto hidden font-mono text-[10.5px] whitespace-nowrap text-muted-foreground/60 sm:inline">
          {rows.length} shown
        </span>
      </div>

      {/* list */}
      <div className="flex-1 overflow-y-auto">
        {/* Column header — desktop table only; mobile uses stacked cards. */}
        <div className="sticky top-0 z-1 hidden h-[30px] items-center gap-4 border-b border-l-2 border-border border-l-transparent bg-background px-5 text-[10.5px] tracking-[0.4px] text-muted-foreground/60 uppercase md:flex">
          <span className="w-[116px] flex-none">Needs</span>
          <span className="w-[140px] flex-none">Repo</span>
          <span className="w-[52px] flex-none">PR</span>
          <span className="min-w-0 flex-1 truncate">Title</span>
          <span className="w-[124px] flex-none text-right">Changes</span>
          <span className="flex w-[44px] flex-none justify-end">Comments</span>
          <span className="w-[22px] flex-none text-center">CI</span>
          <span className="w-[56px] flex-none text-right">Age</span>
        </div>

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
            {rows.map((pr) =>
              isMobile ? (
                <MobileCard key={pr.id} pr={pr} now={now} demo={demo} />
              ) : (
                <Row key={pr.id} pr={pr} now={now} demo={demo} />
              ),
            )}
            <div className="flex items-center justify-center gap-2 p-3.5 font-mono text-[10.5px] text-muted-foreground/60">
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
      <div className="flex h-[52px] flex-none items-center gap-2.5 border-b border-border px-3 sm:px-5">
        <h2 className="text-lg font-semibold tracking-[-0.4px]">
          Pull requests
        </h2>
      </div>
      <div className="grid flex-none grid-cols-2 border-b border-border sm:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            // biome-ignore lint/suspicious/noArrayIndexKey: fixed-length skeleton placeholders, never reordered.
            key={i}
            className="border-l border-border px-3 py-3 nth-[n+3]:border-t nth-[odd]:border-l-0 sm:px-5 sm:first:border-l-0 sm:nth-[n+3]:border-t-0 sm:nth-[odd]:border-l"
          >
            <div className="mb-2 h-2.5 w-24 animate-pulse rounded bg-muted" />
            <div className="h-5 w-10 animate-pulse rounded bg-muted" />
          </div>
        ))}
      </div>
      <div className="flex-1 space-y-px p-px">
        {Array.from({ length: 8 }).map((_, i) => (
          <div
            // biome-ignore lint/suspicious/noArrayIndexKey: fixed-length skeleton placeholders, never reordered.
            key={i}
            className="flex h-[34px] items-center gap-2.5 px-3 sm:px-5"
          >
            <div className="size-4 animate-pulse rounded-full bg-muted" />
            <div className="h-3 w-32 animate-pulse rounded bg-muted" />
            <div className="h-3 flex-1 animate-pulse rounded bg-muted/60" />
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
